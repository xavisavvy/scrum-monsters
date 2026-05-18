// Phase 42-02b (2026-05-07): `lobby_updated` is fully retired. All state
// mutations flow through fine-grained events (session:*, combat:*,
// estimation:*). The shared `ServerToClientEvents` interface no longer
// declares it; tsc --noEmit will reject any future emit.

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import { ClientToServerEvents, ServerToClientEvents } from '../shared/gameEvents.js';
import { gameState, setGameStateIO } from './gameState.js';
import { socketLogger, gameLogger, authLogger } from './logger.js';
import {
  sessionManager,
  estimationManager,
  combatManager,
  progressionManager,
  classMasteryManager,
  abilityManager,
  itemManager,
  registerPlayerUserId,
  eventBus,
  initializeClientEventEmitter,
  getClientEventEmitter,
  LobbyNotFoundError,
  PlayerNotHostError,
  SessionError,
} from './domains/index.js';
import {
  validatePayload,
  ToggleReadyPayloadSchema,
} from '../shared/socket-schemas.js';
import { updateWebsocketMetrics } from "./metrics.js";
import { ITEM_DEFINITIONS, type ItemType } from '../shared/itemTypes.js';

type InterServerEvents = {};
type SocketData = {
  playerId?: string;
  lobbyId?: string;
  userId?: number; // Authenticated user ID
  username?: string; // Authenticated username
};

export function setupWebSocket(httpServer: HTTPServer, sessionMiddleware?: RequestHandler | null) {
  // Configure CORS based on environment
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : (process.env.NODE_ENV === 'production'
        ? ['https://scrummonsters.com', 'https://www.scrummonsters.com']
        : '*');

  // Office network compatible: More frequent pings to keep connections alive through corporate proxies
  const pingTimeout = 45000; // faster detection of dead connections
  const pingInterval = 20000; // 20s - under most proxy idle timeouts (30-60s)
  const connectTimeout = 30000; // initial connection timeout

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout,
    pingInterval,
    connectTimeout,
    transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
    allowUpgrades: true, // Allow upgrading from polling to websocket
    perMessageDeflate: false, // Disable compression for better performance
    httpCompression: false,
    path: '/socket.io/',
    serveClient: false,
    allowEIO3: true, // Support older clients
    cookie: false, // Disable cookies for stateless scaling
    // Max HTTP buffer size for polling fallback
    maxHttpBufferSize: 1e6, // 1MB
    upgradeTimeout: 30000
  });

  socketLogger.info({
    environment: process.env.NODE_ENV === 'production' ? 'Production' : 'Development',
    pingInterval,
    pingTimeout,
    connectTimeout
  }, 'WebSocket server initialized');

  // Share session with Socket.IO for authenticated user detection
  if (sessionMiddleware) {
    io.engine.use(sessionMiddleware);
    socketLogger.info('Session middleware attached to Socket.IO');
  }

  // Pass the io instance to GameState for emitting events
  setGameStateIO(io);

  // Initialize ClientEventEmitter for fine-grained event delivery
  // (call for side effect — singleton, retrieved later via getClientEventEmitter)
  initializeClientEventEmitter(io);
  socketLogger.info('ClientEventEmitter initialized for fine-grained events');

  /**
   * Phase 42-02b: Helper to emit a fine-grained client event with the
   * canonical {seq, timestamp} envelope. Phase 45-05B: delegates to
   * ClientEventEmitter.emitFineGrained so the sequencer stays encapsulated.
   */
  const emitFineGrained = (lobbyId: string, event: string, data: Record<string, unknown>): void => {
    getClientEventEmitter()?.emitFineGrained(lobbyId, event, data);
  };

  // ==========================================================================
  // EVENT BUS SUBSCRIPTIONS - Phase transition handlers
  // ==========================================================================

  // Handle discussion_ended to transition to next_level or victory
  eventBus.on('estimation:discussion_ended', (payload) => {
    const { lobbyId, finalEstimate } = payload;
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return;

    // Apply estimate to current ticket
    if (lobby.currentTicket) {
      lobby.currentTicket.storyPoints = finalEstimate;

      // Add to completed tickets
      if (!lobby.completedTickets) lobby.completedTickets = [];
      lobby.completedTickets.push({
        id: lobby.currentTicket.id,
        title: lobby.currentTicket.title,
        description: lobby.currentTicket.description,
        storyPoints: finalEstimate,
        completedAt: new Date().toISOString(),
        teamBreakdown: {
          developers: { participated: true, consensusScore: finalEstimate },
          qa: { participated: true, consensusScore: finalEstimate },
        },
      });
    }

    // Determine next phase
    const currentIndex = lobby.tickets?.findIndex(t => t.id === lobby.currentTicket?.id) ?? -1;
    const remainingTickets = lobby.tickets?.slice(currentIndex + 1) ?? [];

    if (remainingTickets.length > 0) {
      // More tickets - go to next_level phase
      lobby.gamePhase = 'next_level';
      eventBus.emit('session:phase_changed', {
        lobbyId,
        oldPhase: 'discussion',
        newPhase: 'next_level',
      });
    } else {
      // No more tickets - victory
      lobby.gamePhase = 'victory';
      eventBus.emit('session:phase_changed', {
        lobbyId,
        oldPhase: 'discussion',
        newPhase: 'victory',
      });
    }

    // Phase 42-02b row #1: lobby_updated removed; session:phase_changed
    // already emitted above (lines 144 / 152) via eventBus.
    gameLogger.info({ lobbyId, newPhase: lobby.gamePhase }, 'Discussion ended, phase transition');
  });

  // Connection monitoring for Replit
  let totalConnections = 0;
  let activeConnections = 0;
  const disconnectReasons = new Map<string, number>();

  // Position batching for performance - aggregate updates and broadcast every 100ms
  const pendingPositionUpdates = new Map<string, boolean>(); // lobbyId -> hasPendingUpdates
  
  const positionBatchInterval = setInterval(() => {
    // Broadcast batched position updates for each lobby with pending changes
    pendingPositionUpdates.forEach((hasPending, lobbyId) => {
      if (hasPending) {
        const lobby = gameState.getLobby(lobbyId);
        if (lobby && lobby.playerPositions) {
          io.to(lobbyId).emit('players_pos', { positions: lobby.playerPositions });
        }
        pendingPositionUpdates.set(lobbyId, false);
      }
    });
  }, 100); // Batch broadcast every 100ms
  
  // Clean up position updates map when lobbies are destroyed
  const lobbyDestroyedHandler = ({ lobbyId }: { lobbyId: string }) => {
    pendingPositionUpdates.delete(lobbyId);
  };
  eventBus.on('session:lobby_destroyed', lobbyDestroyedHandler);

  // Log connection stats every 5 minutes (unref so it doesn't keep process alive)
  setInterval(() => {
    const connectedSockets = Array.from(io.sockets.sockets.values());
    const hostConnections = connectedSockets.filter(s => {
      const lobby = sessionManager.getPlayerLobby(s.data.playerId || '');
      return lobby && lobby.hostId === s.data.playerId;
    });

    const disconnectReasonsObj: Record<string, number> = {};
    disconnectReasons.forEach((count, reason) => {
      disconnectReasonsObj[reason] = count;
    });

    socketLogger.info({
      totalConnections,
      activeConnections,
      hostConnections: hostConnections.length,
      activeLobbies: sessionManager.getLobbyCount(),
      disconnectReasons: disconnectReasonsObj
    }, 'Connection statistics');
  }, 5 * 60 * 1000).unref();

  // Set up revival completion watchdog
  // Phase 45-04: legacy `revive_complete` emit replaced by combat:player_revived
  // via eventBus. processRevivalSessions returns the in-progress sessions too
  // so the bridge can emit throttled combat:revival_progress per channel.
  const lastRevivalProgressBucket = new Map<string, number>();
  const REVIVAL_PROGRESS_EMIT_INTERVAL_MS = 500;
  const REVIVAL_CHANNEL_DURATION_MS = 3000; // matches gameState.processRevivalSessions completion threshold
  const revivalWatchdogInterval = setInterval(() => {
    const result = gameState.processRevivalSessions();
    for (const revival of result) {
      // Completion: thread newHp from gameState's playerCombatStates so the
      // new combat:player_revived handler writes the right hp client-side
      // (also satisfies Phase 45-01 C5 fix for the gameState path).
      const lobby = gameState.getLobby(revival.lobbyId);
      const newHp = lobby?.playerCombatStates?.[revival.targetId]?.hp ?? 0;
      eventBus.emit('combat:player_revived', {
        lobbyId: revival.lobbyId,
        playerId: revival.targetId,
        reviverId: revival.reviverId,
        newHp,
      });
      lastRevivalProgressBucket.delete(`${revival.lobbyId}:${revival.targetId}`);
    }
    // Emit throttled progress for in-flight gameState revival sessions.
    const now = Date.now();
    for (const session of gameState.getActiveRevivalSessions()) {
      const elapsed = now - session.startedAt;
      if (elapsed >= REVIVAL_CHANNEL_DURATION_MS) continue;
      const key = `${session.lobbyId}:${session.targetId}`;
      const bucket = Math.floor(elapsed / REVIVAL_PROGRESS_EMIT_INTERVAL_MS);
      if ((lastRevivalProgressBucket.get(key) ?? -1) >= bucket) continue;
      lastRevivalProgressBucket.set(key, bucket);
      const percent = Math.min(100, Math.floor((elapsed / REVIVAL_CHANNEL_DURATION_MS) * 100));
      eventBus.emit('combat:revival_progress', {
        lobbyId: session.lobbyId,
        reviverId: session.reviverId,
        targetId: session.targetId,
        percent,
        remainingMs: Math.max(0, REVIVAL_CHANNEL_DURATION_MS - elapsed),
      });
    }
  }, 100);

  // Phase 41-02: Disconnected-player sweeper for the SessionManager domain.
  // When a player's grace period expires, processDisconnectedPlayers performs
  // any deferred host transfer (host status is no longer transferred
  // immediately on disconnect — see SessionManager.handlePlayerDisconnect).
  // We emit `host_transferred` here so other clients update their UI.
  const sessionDisconnectSweeperInterval = setInterval(() => {
    try {
      const hostTransfers = sessionManager.processDisconnectedPlayers();
      for (const transfer of hostTransfers) {
        io.to(transfer.lobbyId).emit('host_transferred', {
          oldHostId: transfer.oldHostId,
          newHostId: transfer.newHostId,
          newHostName: transfer.newHostName,
          reason: 'Host disconnected (grace period expired)',
        });
        // Phase 42-02b row #2: lobby_updated removed; host_transferred
        // (emitted just above) is the canonical signal for this transition.
        socketLogger.info({
          oldHostId: transfer.oldHostId,
          newHostId: transfer.newHostId,
          newHostName: transfer.newHostName,
          lobbyId: transfer.lobbyId,
        }, 'Deferred host transfer broadcast (Phase 41-02)');
      }
    } catch (err) {
      socketLogger.error({ err }, 'sessionDisconnectSweeper failed');
    }
  }, 30000);

  // Periodic recompute of the labeled websocketConnections gauge.
  // Many code paths mutate socket.data.lobbyId / socket.data.userId
  // (create_lobby, join_lobby, leave_lobby, reconnect, etc.) without
  // calling updateWebsocketMetrics. Rather than instrumenting every
  // mutation, recompute the buckets on a 5s tick — well within
  // Prometheus's 15s scrape window. The recompute is O(open sockets)
  // and only touches metric state, so it's cheap.
  const websocketMetricsInterval = setInterval(() => {
    try {
      updateWebsocketMetrics(io);
    } catch (err) {
      socketLogger.error({ err }, 'websocketMetrics recompute failed');
    }
  }, 5000);

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    totalConnections++;
    activeConnections++;

    // Log connection details
    const transport = socket.conn.transport.name;
    const headers = socket.handshake.headers;
    const userAgent = headers['user-agent'] || 'unknown';
    const forwardedFor = headers['x-forwarded-for'] || socket.handshake.address;

    // Extract authenticated user from session (if available)
    // The session is attached via express-session middleware sharing
    // Auth0 bridge middleware writes userId to req.session.userId
    const req = socket.request as { session?: { userId?: number } };
    if (req.session?.userId) {
      const userId = req.session.userId;
      socket.data.userId = userId;
      authLogger.info({ userId }, 'Authenticated user connected');
    }

    socketLogger.info({
      socketId: socket.id,
      transport,
      ip: forwardedFor,
      userAgent: userAgent.substring(0, 100),
      activeConnections,
      authenticated: !!socket.data.userId,
      userId: socket.data.userId
    }, 'Player connected');

    // Update Prometheus WebSocket connection gauge
    updateWebsocketMetrics(io);

    socket.on('create_lobby', ({ lobbyName, hostName, initialSettings }) => {
      try {
        const lobby = sessionManager.createLobby(hostName, lobbyName, initialSettings);

        // Sync player-lobby mapping to gameState for battle functions
        gameState.syncPlayerToLobby(lobby.hostId, lobby);

        // Get the correct host based on environment
        const host = process.env.NODE_ENV === 'production'
          ? 'https://scrummonsters.com'
          : `http://localhost:${process.env.PORT || '5001'}`;
        const inviteLink = `${host}/join/${lobby.id}`;

        // Store player-socket mapping
        socket.data.playerId = lobby.hostId;
        socket.data.lobbyId = lobby.id;

        // Join socket room
        socket.join(lobby.id);

        // Generate reconnect token for the host
        const reconnectToken = sessionManager.generateReconnectToken(lobby.hostId, lobby.id, hostName);

        socket.emit('lobby_created', { lobby, inviteLink });
        socket.emit('lobby_sync', {
          lobby,
          yourPlayer: lobby.players[0],
          reconnectToken,
          pendingActions: {},
          stateChanges: {}
        });

        // Register player-user mapping and emit progression sync for authenticated users
        if (socket.data.userId) {
          registerPlayerUserId(lobby.hostId, socket.data.userId);
          (async () => {
            try {
              await progressionManager.loadPlayerXP(lobby.id, lobby.hostId, socket.data.userId!);
              const totalXP = progressionManager.getPlayerXP(lobby.id, lobby.hostId);
              const currentLevel = progressionManager.getPlayerLevel(lobby.id, lobby.hostId);
              socket.emit('progression:sync', {
                playerId: lobby.hostId,
                totalXP,
                currentLevel,
                seq: 0,
                timestamp: Date.now(),
              });
            } catch (err) {
              socketLogger.error({ err }, 'Failed to sync progression for host');
            }
          })();

          // Load class mastery (fire-and-forget, non-blocking)
          (async () => {
            try {
              await classMasteryManager.loadAllClassMastery(lobby.id, lobby.hostId, socket.data.userId!);
              // Build mastery data from loaded state
              const masteryData = classMasteryManager.getAllMasteryData(lobby.id, lobby.hostId);
              if (Object.keys(masteryData).length > 0) {
                socket.emit('class_mastery:sync', {
                  playerId: lobby.hostId,
                  masteryData,
                  seq: 0,
                  timestamp: Date.now(),
                });
              }
            } catch (err) {
              socketLogger.error({ err }, 'Failed to sync class mastery');
            }
          })();
        }

        socketLogger.info({ lobbyId: lobby.id, hostName }, 'Lobby created');
      } catch (error) {
        socketLogger.error({ err: error }, 'Error creating lobby');
        if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          socket.emit('game_error', { message: 'Failed to create lobby' });
        }
      }
    });

    socket.on('join_lobby', ({ lobbyId, playerName }) => {
      try {
        const { lobby, player } = sessionManager.joinLobby(lobbyId, playerName);

        // Sync player-lobby mapping to gameState for battle functions
        gameState.syncPlayerToLobby(player.id, lobby);

        // Store player-socket mapping
        socket.data.playerId = player.id;
        socket.data.lobbyId = lobby.id;

        // Join socket room
        socket.join(lobby.id);

        // Generate reconnect token for the joining player
        const reconnectToken = sessionManager.generateReconnectToken(player.id, lobby.id, player.name);

        // Handle late joiners - emit appropriate events based on current lobby phase
        const currentPhase = lobby.gamePhase;

        if (currentPhase === 'lobby' || currentPhase === 'avatar_selection') {
          // Normal flow - player goes through avatar selection first
          socket.emit('lobby_joined', { lobby, player });
        } else {
          // Late joiner - skip directly to current phase
          socketLogger.info({ playerName, currentPhase }, 'Late joiner entering active phase');

          // Emit lobby_joined first for state setup
          socket.emit('lobby_joined', { lobby, player });

          // Then immediately emit the phase-specific event to advance them
          if (currentPhase === 'battle' || currentPhase === 'scoring' || currentPhase === 'discussion' || currentPhase === 'reveal') {
            // Emit battle_started to transition client to battle screen
            if (lobby.boss) {
              socket.emit('battle_started', { lobby, boss: lobby.boss });
              socketLogger.info({ playerName }, 'Late joiner advanced to battle phase');
            }
          }
        }

        socket.emit('lobby_sync', {
          lobby,
          yourPlayer: player,
          reconnectToken,
          pendingActions: {},
          stateChanges: {}
        });

        // Send full state event for fine-grained event system initialization
        const emitter = getClientEventEmitter();
        emitter.sendFullState(lobby.id, lobby, socket.id);

        // Register player-user mapping and emit progression sync for authenticated users
        if (socket.data.userId) {
          registerPlayerUserId(player.id, socket.data.userId);
          (async () => {
            try {
              await progressionManager.loadPlayerXP(lobby.id, player.id, socket.data.userId!);
              const totalXP = progressionManager.getPlayerXP(lobby.id, player.id);
              const currentLevel = progressionManager.getPlayerLevel(lobby.id, player.id);
              socket.emit('progression:sync', {
                playerId: player.id,
                totalXP,
                currentLevel,
                seq: 0,
                timestamp: Date.now(),
              });
            } catch (err) {
              socketLogger.error({ err }, 'Failed to sync progression for player');
            }
          })();

          // Load class mastery (fire-and-forget, non-blocking)
          (async () => {
            try {
              await classMasteryManager.loadAllClassMastery(lobby.id, player.id, socket.data.userId!);
              // Build mastery data from loaded state
              const masteryData = classMasteryManager.getAllMasteryData(lobby.id, player.id);
              if (Object.keys(masteryData).length > 0) {
                socket.emit('class_mastery:sync', {
                  playerId: player.id,
                  masteryData,
                  seq: 0,
                  timestamp: Date.now(),
                });
              }
            } catch (err) {
              socketLogger.error({ err }, 'Failed to sync class mastery');
            }
          })();
        }

        // Notify other players about the new player joining (for dropping animation)
        socket.to(lobby.id).emit('player_joined', { player, lobby });

        // Removed lobby_updated: session:player_joined event emitted by sessionManager.joinLobby

        socketLogger.info({ playerName, lobbyId, currentPhase }, 'Player joined lobby');
      } catch (error) {
        if (error instanceof LobbyNotFoundError) {
          socket.emit('game_error', { message: 'Lobby not found' });
        } else if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          socketLogger.error({ err: error }, 'Unexpected error in join_lobby');
          socket.emit('game_error', { message: 'Failed to join lobby' });
        }
      }
    });

    socket.on('select_avatar', ({ avatarClass }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      // Get lobby from sessionManager (not legacy gameState)
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) return;

      // Find and update player's avatar
      const player = lobby.players.find(p => p.id === playerId);
      if (!player) return;

      player.avatar = avatarClass;
      player.avatarClass = avatarClass;
      // Flip the per-player avatar gate. Client GamePage.renderGamePhase()
      // reads this on currentPlayer and stops rendering AvatarSelection once
      // true, dropping the user into the Lobby view. Whole-lobby gating was
      // rejected because the host needs to manage tickets while joiners are
      // still picking — keeping `lobby.gamePhase` at 'lobby' avoids breaking
      // the existing handler guards in this file (lines that check
      // `lobby.gamePhase !== 'lobby'`).
      player.hasSelectedAvatar = true;

      // Phase 45-05B L6: legacy `avatar_selected` emit removed (GamePage
      // handler also removed). All viewers consume session:avatar_selected
      // via eventHandlers.ts — flips hasSelectedAvatar for the own player AND
      // remote peers, which is what the lobby roster needs.
      emitFineGrained(lobby.id, 'session:avatar_selected', { playerId, avatar: avatarClass });
    });

    socket.on('assign_team', ({ playerId: targetPlayerId, team }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      try {
        // Get old team before change
        const oldLobby = sessionManager.getPlayerLobby(targetPlayerId);
        const oldPlayer = oldLobby?.players.find(p => p.id === targetPlayerId);
        const oldTeam = oldPlayer?.team;

        const lobby = sessionManager.assignTeam(playerId, targetPlayerId, team);

        // Notify EstimationManager of team change
        if (oldTeam && oldTeam !== team) {
          estimationManager.handleTeamChange(lobby.id, targetPlayerId, oldTeam, team);
        }

        // Removed lobby_updated: session:team_changed event emitted by sessionManager.assignTeam
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can assign teams' });
        } else if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          socketLogger.error({ err: error }, 'Unexpected error in assign_team');
          socket.emit('game_error', { message: 'Failed to assign team' });
        }
      }
    });

    socket.on('change_own_team', ({ team }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      try {
        // Get old team before change
        const oldLobby = sessionManager.getPlayerLobby(playerId);
        const oldPlayer = oldLobby?.players.find(p => p.id === playerId);
        const oldTeam = oldPlayer?.team;

        const lobby = sessionManager.changeOwnTeam(playerId, team);

        // Notify EstimationManager of team change
        if (oldTeam && oldTeam !== team) {
          estimationManager.handleTeamChange(lobby.id, playerId, oldTeam, team);

          // If switching FROM spectator to voter during active battle
          if (oldTeam === 'spectators' && team !== 'spectators') {
            const combatState = combatManager.getCombatState(lobby.id);
            if (combatState && combatState.boss && combatState.boss.hp > 0) {
              // Kill their minion (no respawn)
              combatManager.handleSpectatorSwitchToVoter(lobby.id, playerId);

              // Add to estimation eligible voters
              estimationManager.addEligibleVoter(lobby.id, playerId, team);
              gameLogger.info({ playerId, team }, 'Spectator switched to voter, minion killed');
            }
          }

          // If switching TO spectator from voter during active battle
          if (oldTeam !== 'spectators' && team === 'spectators') {
            // Remove from estimation (they can't vote as spectator)
            estimationManager.removeEligibleVoter(lobby.id, playerId);
            gameLogger.info({ playerId }, 'Voter switched to spectator, removed from estimation');
          }
        }

        // Removed lobby_updated: session:team_changed event emitted by sessionManager.changeOwnTeam
      } catch (error) {
        if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          socketLogger.error({ err: error }, 'Unexpected error in change_own_team');
          socket.emit('game_error', { message: 'Failed to change team' });
        }
      }
    });

    socket.on('add_tickets', ({ tickets }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Use sessionManager instead of legacy gameState
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === playerId);
      if (!player?.isHost) return; // Only host can add tickets

      lobby.tickets.push(...tickets);

      // Phase 42-02b row #3: lobby_updated -> session:tickets_updated.
      emitFineGrained(lobby.id, 'session:tickets_updated', { tickets: lobby.tickets });
      socketLogger.info({ playerId, ticketCount: tickets.length, lobbyId: lobby.id }, 'Host added tickets');
    });

    socket.on('remove_ticket', ({ ticketId }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Use sessionManager instead of legacy gameState
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === playerId);
      if (!player?.isHost) return; // Only host can remove tickets

      lobby.tickets = lobby.tickets.filter(t => t.id !== ticketId);

      // Phase 42-02b row #4: lobby_updated -> session:tickets_updated.
      emitFineGrained(lobby.id, 'session:tickets_updated', { tickets: lobby.tickets });
      socketLogger.info({ playerId, ticketId, lobbyId: lobby.id }, 'Host removed ticket');
    });

    // Explicit leave lobby (user clicked back to menu)
    socket.on('leave_lobby', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      socketLogger.info({ playerId, lobbyId }, 'Player explicitly leaving lobby');

      // Remove player from lobby. session:player_left is emitted from inside
      // removePlayer; we don't read the returned lobby here anymore (the
      // legacy player_left emit that needed it was removed in Phase 45-03).
      sessionManager.removePlayer(playerId);

      // Leave socket room
      socket.leave(lobbyId);

      // Clear socket data
      socket.data.playerId = undefined;
      socket.data.lobbyId = undefined;

      // Phase 45-03: legacy `player_left` emit removed (no client listener).
      // session:player_left is emitted from sessionManager.removePlayer above
      // and handled in eventHandlers.ts:58 (mutates players[] + teams[*]).
    });

    // Update lobby name (host only)
    socket.on('update_lobby_name', ({ name }) => {
      socketLogger.debug({ name }, 'update_lobby_name received');

      const playerId = socket.data.playerId;
      if (!playerId) {
        socketLogger.debug('update_lobby_name: No playerId on socket');
        return;
      }

      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) {
        socketLogger.debug({ playerId }, 'update_lobby_name: No lobby found for player');
        return;
      }

      const player = lobby.players.find(p => p.id === playerId);
      if (!player?.isHost) {
        socketLogger.debug({ playerId }, 'update_lobby_name: Player is not host');
        return;
      }

      const trimmedName = name?.trim();
      if (!trimmedName || trimmedName.length > 50) {
        socketLogger.debug({ trimmedName }, 'update_lobby_name: Invalid name');
        return;
      }

      lobby.name = trimmedName;
      // Phase 42-02b row #6: lobby_updated -> session:lobby_renamed.
      emitFineGrained(lobby.id, 'session:lobby_renamed', { name: lobby.name });
      socketLogger.info({ playerId, lobbyName: trimmedName }, 'Host renamed lobby');
    });

    // Lobby movement events for 2D sidescroller playground
    socket.on('lobby_player_pos', ({ x, y, direction }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in lobby phase
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        socketLogger.debug({ playerId, gamePhase: lobby?.gamePhase }, 'Player tried to move but lobby is not in lobby phase');
        return;
      }

      // Broadcast position to other players in the same lobby
      socket.to(lobbyId).emit('lobby_player_pos', { 
        playerId, 
        x, 
        y, 
        direction 
      });
    });

    socket.on('lobby_player_jump', ({ isJumping }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in lobby phase
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        socketLogger.debug({ playerId, gamePhase: lobby?.gamePhase }, 'Player tried to jump but lobby is not in lobby phase');
        return;
      }

      // Broadcast jump state to other players in the same lobby
      socket.to(lobbyId).emit('lobby_player_jump', { 
        playerId,
        isJumping 
      });
    });

    socket.on('player_charge', ({ isCharging, chargePower }: { isCharging: boolean; chargePower?: number }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        return;
      }

      // Broadcast charge state to other players in the same lobby
      socket.to(lobbyId).emit('lobby_player_charge', { 
        playerId,
        isCharging,
        chargePower: chargePower || 0
      });
    });

    socket.on('lobby_emote', ({ message, x, y }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in lobby phase
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        socketLogger.debug({ playerId, gamePhase: lobby?.gamePhase }, 'Player tried to emote but lobby is not in lobby phase');
        return;
      }

      // Validate message length to prevent spam
      if (!message || message.length > 100) {
        socketLogger.debug({ playerId, messageLength: message?.length || 0 }, 'Player sent invalid emote message');
        return;
      }

      // Broadcast emote to other players in the same lobby
      socket.to(lobbyId).emit('lobby_emote', {
        playerId,
        message: message.trim(),
        x,
        y
      });

      socketLogger.debug({ playerId, lobbyId, message: message.trim() }, 'Player emoted in lobby');
    });

    socket.on('toggle_ready', (data) => {
      const result = validatePayload(ToggleReadyPayloadSchema, data);
      if (!result.success) {
        socket.emit('game_error', { message: 'Invalid toggle_ready payload' });
        return;
      }

      const { ready } = result.data;
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby) return;

      // Only allow toggling ready in lobby phase
      if (lobby.gamePhase !== 'lobby') return;

      const player = lobby.players.find(p => p.id === playerId);
      if (!player) return;

      player.isReady = ready;

      // Phase 42-02b row #5: lobby_updated -> session:player_ready_changed.
      emitFineGrained(lobbyId, 'session:player_ready_changed', {
        playerId: player.id,
        isReady: !!player.isReady,
      });
      socketLogger.debug({ playerId, lobbyId, ready }, 'Player toggled ready');
    });

    // Handle battle emotes
    socket.on('battle_emote', ({ message, x, y }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in battle phase
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'battle') {
        socketLogger.debug({ playerId, gamePhase: lobby?.gamePhase }, 'Player tried to battle emote but lobby is not in battle phase');
        return;
      }

      // Validate message length to prevent spam
      if (!message || message.length > 100) {
        socketLogger.debug({ playerId, messageLength: message?.length || 0 }, 'Player sent invalid battle emote message');
        return;
      }

      // Broadcast battle emote to other players in the same lobby
      socket.to(lobbyId).emit('battle_emote', { 
        playerId,
        message: message.trim(),
        x, 
        y 
      });
      
      socketLogger.debug({ playerId, lobbyId, message: message.trim() }, 'Player battle emoted');
    });

    socket.on('start_battle', () => {
      const playerId = socket.data.playerId;
      socketLogger.debug({ socketId: socket.id, playerId }, 'start_battle received');

      if (!playerId) {
        socketLogger.debug('No playerId found in socket data');
        return;
      }

      // Use sessionManager to get the lobby (not gameState which has stale mappings)
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) {
        socketLogger.debug({ playerId }, 'No lobby found for player via sessionManager');
        return;
      }

      // Check if player is host
      const player = lobby.players.find(p => p.id === playerId);
      if (!player?.isHost) {
        socketLogger.debug({ playerId }, 'Player is not host, cannot start battle');
        socket.emit('game_error', { message: 'Only the host can start the battle' });
        return;
      }

      // Check if there are tickets
      if (!lobby.tickets || lobby.tickets.length === 0) {
        socketLogger.debug({ lobbyId: lobby.id }, 'No tickets in lobby');
        socket.emit('game_error', { message: 'Add at least one ticket before starting' });
        return;
      }

      // Check if there's at least one non-spectator player
      const activeVoters = lobby.players.filter(p => p.team !== 'spectators');
      if (activeVoters.length === 0) {
        socketLogger.debug({ lobbyId: lobby.id }, 'No active voters in lobby');
        socket.emit('game_error', { message: 'At least one player must be on a voting team' });
        return;
      }

      gameLogger.info({ lobbyId: lobby.id, ticketCount: lobby.tickets.length }, 'Starting battle');
      const result = gameState.startBattle(playerId, lobby.tickets);
      if (result) {
        if ('error' in result) {
          // Send error message to the client
          gameLogger.warn({ error: result.error }, 'Battle start error');
          socket.emit('game_error', { message: result.error });
        } else {
          const { lobby: updatedLobby, boss } = result;

          gameLogger.info({ lobbyId: updatedLobby.id }, 'Battle started successfully');
          // Removed lobby_updated: battle_started event contains lobby

          // Start the battle (synchronous - relies on socket.io event ordering)
          io.to(updatedLobby.id).emit('battle_started', { lobby: updatedLobby, boss });
        }
      } else {
        gameLogger.warn('startBattle returned null/undefined');
      }
    });

    socket.on('submit_score', ({ score }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      const lobby = gameState.submitScore(playerId, score);
      if (lobby) {
        const player = lobby.players.find(p => p.id === playerId);
        if (player) {
          // Phase 45-03: legacy `score_submitted` emit removed (no client listener).
          // estimation:vote_cast below is the canonical signal.

          // Emit fine-grained estimation:vote_cast so all clients (including
          // the voter) update their hasSubmittedScore flag and render the vote
          // indicator. The legacy `submit_score` path doesn't go through
          // EstimationManager.castVote (which is what emits this event for the
          // newer ranked-vote path), so we emit it here directly.
          emitFineGrained(lobby.id, 'estimation:vote_cast', {
            playerId,
            team: player.team,
            hasVoted: true,
          });
        }

        
        // Check if all scores submitted and reveal
        if (lobby.gamePhase === 'reveal') {
          const result = gameState.revealScores(lobby.id);
          if (result) {
            const { lobby: updatedLobby, teamScores, teamConsensus } = result;
            // Phase 45-03: legacy `scores_revealed` emit removed (no client listener).
            // Fine-grained estimation:votes_revealed per team below is canonical:
            // Bug fix (solo-vote-stuck-discussion): the legacy event carried
            // team aggregates only; the client never populated per-player
            // currentScore from it. The per-team emit below populates
            // currentLobby.teams[*].currentScore so Discussion.tsx can render
            // consensus + Advance Now without a full-state refresh.
            if (updatedLobby.teams.developers.length > 0) {
              emitFineGrained(lobby.id, 'estimation:votes_revealed', {
                votes: teamScores.developers,
                team: 'developers',
              });
            }
            if (updatedLobby.teams.qa.length > 0) {
              emitFineGrained(lobby.id, 'estimation:votes_revealed', {
                votes: teamScores.qa,
                team: 'qa',
              });
            }
            // Phase 42-02b row #8: lobby_updated -> session:phase_changed
            // (battle -> reveal). scores_revealed above carries the data.
            eventBus.emit('session:phase_changed', {
              lobbyId: lobby.id,
              oldPhase: 'battle',
              newPhase: updatedLobby.gamePhase,
            });

            // Check if teams agreed using same logic as gameState
            const devTeamExists = updatedLobby.teams.developers.length > 0;
            const qaTeamExists = updatedLobby.teams.qa.length > 0;

            let teamsAgree = false;
            if (devTeamExists && qaTeamExists) {
              teamsAgree = teamConsensus.developers.hasConsensus &&
                          teamConsensus.qa.hasConsensus &&
                          teamConsensus.developers.score === teamConsensus.qa.score;
            } else if (devTeamExists && !qaTeamExists) {
              teamsAgree = teamConsensus.developers.hasConsensus;
            } else if (!devTeamExists && qaTeamExists) {
              teamsAgree = teamConsensus.qa.hasConsensus;
            }

            if (teamsAgree && updatedLobby.boss?.defeated) {
              // Phase 45-03: legacy `boss_defeated` emit removed (no client listener).
              // combat:boss_defeated fires from CombatManager + session:phase_changed
              // covers the battle→victory transition.
            }
          }
        }
      }
    });

    socket.on('update_discussion_vote', ({ score }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updateDiscussionVote(playerId, score);
      if (lobby) {
        // Phase 42-02b row #9: lobby_updated -> estimation:discussion_vote_updated.
        emitFineGrained(lobby.id, 'estimation:discussion_vote_updated', {
          playerId,
          score,
        });
        
        // Check for consensus and auto-advance - rely on gameState for consensus logic
        const result = gameState.checkDiscussionConsensus(lobby.id);
        if (result) {
          const { lobby: updatedLobby } = result;
          
          // If lobby progressed beyond discussion phase, emit appropriate updates
          if (updatedLobby.gamePhase !== 'discussion') {
            // Auto-advance after a brief delay for players to see the consensus
            setTimeout(() => {
              // Phase 42-02b row #10: lobby_updated -> session:phase_changed
              // (discussion -> next phase via consensus auto-advance).
              eventBus.emit('session:phase_changed', {
                lobbyId: lobby.id,
                oldPhase: 'discussion',
                newPhase: updatedLobby.gamePhase,
              });
              // Phase 45-03: legacy `boss_defeated` emit removed (no client listener).
              // combat:boss_defeated + session:phase_changed cover the transition.
            }, 2000);
          }
        }
      }
    });

    socket.on('attack_boss', ({ damage }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.attackBoss(playerId, damage);
      if (result) {
        const { lobby, bossHealth, ringAttack, healedBoss, modifier } = result;
        
        if (healedBoss) {
          // Spectator healed the boss
          io.to(lobby.id).emit('boss_healed', { bossHealth, healAmount: (modifier || 0) + 1 });
        } else {
          // Normal attack
          io.to(lobby.id).emit('boss_attacked', { playerId, damage, bossHealth });

          // Emit EventBus event for ProgressionManager XP tracking
          eventBus.emit('combat:boss_damaged', {
            lobbyId: lobby.id,
            playerId,
            damage,
            bossHealth,
          });
        }

        // Phase 45-03: legacy `modifier_updated` emit removed (no client listener).
        // combat:modifier_updated fires from CombatManager.applyDamage on the
        // same call path.

        // If boss performs ring attack, broadcast it
        if (ringAttack) {
          io.to(lobby.id).emit('boss_ring_attack', ringAttack);
        }
      }
    });
    
    // Boss damage to player
    socket.on('boss_damage_player', ({ playerId, damage }: { playerId: string; damage: number }) => {
      const attackerId = socket.data.playerId;
      if (!attackerId) return;

      const result = gameState.bossDamagePlayer(playerId, damage);
      if (result) {
        // Phase 45-03: legacy `player_attacked` and `game_over` emits removed
        // (no client listeners). combat:player_damaged fires from CombatManager;
        // session:phase_changed fires from gameState.bossDamagePlayer when
        // gameOver flips. Result is consumed only for the side effect of
        // running the gameState mutation.
        void result;
      }
    });

    // Player projectile broadcasting for multiplayer visibility
    socket.on('player_projectile', ({ startX, startY, targetX, targetY, emoji, targetPlayerId }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.getLobbyByPlayerId(playerId);
      if (!lobby || lobby.gamePhase !== 'battle') return;

      const player = lobby.players.find(p => p.id === playerId);
      if (!player) return;

      // Client should send percentage coordinates, so just relay them
      // This removes the hardcoded screen dimension assumptions
      socket.to(lobby.id).emit('player_projectile_fired', {
        playerId,
        playerName: player.name,
        startX,
        startY,
        targetX,
        targetY,
        emoji,
        targetPlayerId,
        projectileId: randomBytes(8).toString('hex').substring(0, 13)
      });

      socketLogger.debug({ playerName: player.name, emoji, targetType: targetPlayerId ? 'player' : 'boss' }, 'Broadcasting projectile');
    });

    socket.on('proceed_next_level', () => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby || lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only host can proceed to next level' });
          return;
        }

        if (lobby.gamePhase !== 'next_level') {
          socket.emit('game_error', { message: 'Can only proceed from next_level phase' });
          return;
        }

        // Get next ticket
        const currentIndex = lobby.tickets?.findIndex(t => t.id === lobby.currentTicket?.id) ?? -1;
        const nextTicket = lobby.tickets?.[currentIndex + 1];
        if (!nextTicket) {
          socket.emit('game_error', { message: 'No more tickets' });
          return;
        }

        // Reset game state for next round
        lobby.currentTicket = nextTicket;
        lobby.gamePhase = 'battle';

        // Reset estimation state
        estimationManager.cleanupLobby(lobbyId);
        estimationManager.startEstimation(lobbyId, nextTicket.id);

        // Initialize players as eligible voters
        for (const player of lobby.players) {
          if (player.team !== 'spectators') {
            estimationManager.addEligibleVoter(lobbyId, player.id, player.team);
          }
        }

        // Reset combat state
        combatManager.cleanupLobby(lobbyId);
        const players = lobby.players.map(p => ({ id: p.id, team: p.team }));
        const ticketIndex = (lobby.completedTickets?.length ?? 0);
        combatManager.initializeCombat(lobbyId, players, ticketIndex, lobby.boss?.sprite);

        // Reset player scores
        for (const player of lobby.players) {
          player.hasSubmittedScore = false;
          player.currentScore = undefined;
        }

        eventBus.emit('session:phase_changed', {
          lobbyId,
          oldPhase: 'next_level',
          newPhase: 'battle',
        });

        // Phase 42-02b row #11: lobby_updated -> session:game_reset.
        // Major state reset (new ticket + reset combat/estimation) — full
        // lobby payload is intentional here (mirrors system:full_state shape).
        emitFineGrained(lobbyId, 'session:game_reset', { lobby });
        // Phase 42-02b Task 2 hook: explicit ticket-advanced signal so
        // BattleScreen remounts on the new currentTicket.
        if (lobby.currentTicket) {
          emitFineGrained(lobbyId, 'session:ticket_advanced', { currentTicket: lobby.currentTicket });
        }
        gameLogger.info({ lobbyId, ticketId: nextTicket.id }, 'Proceed to next level');
      } catch (error) {
        socket.emit('game_error', { message: (error as Error).message });
      }
    });

    socket.on('abandon_quest', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.abandonQuest(playerId);
      if (lobby) {
        io.to(lobby.id).emit('quest_abandoned', { lobby });
        // Phase 42-02b row #12: lobby_updated -> session:phase_changed.
        // quest_abandoned (above) carries the lobby snapshot; this fine-grained
        // event signals the phase transition.
        eventBus.emit('session:phase_changed', {
          lobbyId: lobby.id,
          oldPhase: 'battle',
          newPhase: lobby.gamePhase,
        });
      }
    });

    socket.on('restart_game', () => {
      socketLogger.debug('Server received restart_game event');
      const playerId = socket.data.playerId;
      if (!playerId) {
        socketLogger.debug('No playerId found for restart_game');
        return;
      }

      socketLogger.debug({ playerId }, 'Processing restart_game for player');
      const lobby = gameState.abandonQuest(playerId);
      if (lobby) {
        gameLogger.info({ lobbyId: lobby.id, newPhase: lobby.gamePhase }, 'Game restarted (new game)');
        // Phase 42-02b row #13: lobby_updated -> session:phase_changed.
        eventBus.emit('session:phase_changed', {
          lobbyId: lobby.id,
          oldPhase: 'game_over',
          newPhase: lobby.gamePhase,
        });
      }
    });

    socket.on('return_to_lobby', () => {
      socketLogger.debug('Server received return_to_lobby event');
      const playerId = socket.data.playerId;
      if (!playerId) {
        socketLogger.debug('No playerId found for return_to_lobby');
        return;
      }

      socketLogger.debug({ playerId }, 'Processing return_to_lobby for player');
      const lobby = gameState.returnToLobby(playerId);
      if (lobby) {
        gameLogger.info({ lobbyId: lobby.id, newPhase: lobby.gamePhase }, 'Returned to lobby');
        // Phase 42-02b row #14: lobby_updated -> session:phase_changed.
        eventBus.emit('session:phase_changed', {
          lobbyId: lobby.id,
          oldPhase: 'victory',
          newPhase: lobby.gamePhase,
        });
      } else {
        gameLogger.warn('Failed to return to lobby - gameState.returnToLobby returned null');
      }
    });

    socket.on('force_reveal', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.forceRevealScores(playerId);
      if (result) {
        const { lobby: updatedLobby, teamScores, teamConsensus } = result;
        // Phase 45-03: legacy `scores_revealed` emit removed (no client listener).
        // session:phase_changed below + per-team estimation:votes_revealed
        // (emitted by the reveal cascade in submit_score path) carry the data.
        void teamScores; void teamConsensus;
        eventBus.emit('session:phase_changed', {
          lobbyId: updatedLobby.id,
          oldPhase: 'battle',
          newPhase: updatedLobby.gamePhase,
        });
        
        // Check if teams agreed using same logic as gameState
        const devTeamExists = updatedLobby.teams.developers.length > 0;
        const qaTeamExists = updatedLobby.teams.qa.length > 0;
        
        let teamsAgree = false;
        if (devTeamExists && qaTeamExists) {
          teamsAgree = teamConsensus.developers.hasConsensus && 
                      teamConsensus.qa.hasConsensus &&
                      teamConsensus.developers.score === teamConsensus.qa.score;
        } else if (devTeamExists && !qaTeamExists) {
          teamsAgree = teamConsensus.developers.hasConsensus;
        } else if (!devTeamExists && qaTeamExists) {
          teamsAgree = teamConsensus.qa.hasConsensus;
        }
        
        if (teamsAgree && updatedLobby.boss?.defeated) {
          // Phase 45-03: legacy `boss_defeated` emit removed (no client listener).
          // combat:boss_defeated + session:phase_changed cover the transition.
        }
      }
    });

    socket.on('youtube_play', ({ videoId, url }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      // Only allow host to control YouTube music
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.hostId !== playerId) {
        socket.emit('game_error', { message: 'Only the host can control YouTube music' });
        return;
      }

      // Broadcast to all players in the lobby
      io.to(lobbyId).emit('youtube_play_synced', { videoId, url });
      socketLogger.debug({ playerId, url }, 'Host started YouTube music');
    });

    socket.on('youtube_stop', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      // Only allow host to control YouTube music
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.hostId !== playerId) {
        socket.emit('game_error', { message: 'Only the host can control YouTube music' });
        return;
      }

      // Broadcast to all players in the lobby
      io.to(lobbyId).emit('youtube_stop_synced');
      socketLogger.debug({ playerId }, 'Host stopped YouTube music');
    });

    socket.on('advancePhaseNow', ({ lobbyId, playerId }) => {
      try {
        // Only allow host to manually advance phases
        const lobby = gameState.getLobby(lobbyId);
        if (!lobby || lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only the host can manually advance phases' });
          return;
        }

        // If phase already advanced past discussion (auto-advance race), silently no-op.
        // The user's intent ("advance past discussion") already happened; toasting an
        // error confuses hosts. Log it for diagnostics only.
        if (lobby.gamePhase !== 'discussion') {
          socketLogger.debug(
            { playerId, lobbyId, gamePhase: lobby.gamePhase },
            'advancePhaseNow ignored: phase already advanced past discussion'
          );
          return;
        }

        const result = gameState.manualAdvancePhase(lobbyId);
        if (result) {
          const { lobby: updatedLobby } = result;

          // Phase 42-02b row #16: lobby_updated -> session:phase_changed
          // (host manual advance from discussion).
          eventBus.emit('session:phase_changed', {
            lobbyId,
            oldPhase: 'discussion',
            newPhase: updatedLobby.gamePhase,
          });

          gameLogger.info({ playerId, lobbyId }, 'Host manually advanced phase');
        } else {
          socket.emit('game_error', { message: 'Cannot advance phase - consensus not reached' });
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Error in advancePhaseNow');
        socket.emit('game_error', { message: 'Failed to advance phase' });
      }
    });

    socket.on('forceVotingProgression', ({ lobbyId }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          socket.emit('game_error', { message: 'Player not authenticated' });
          return;
        }

        const result = gameState.forceVotingProgression(playerId);
        if (result) {
          const { lobby, message } = result;

          // Phase 42-02b row #17: lobby_updated -> session:phase_changed
          // (host force voting progression).
          eventBus.emit('session:phase_changed', {
            lobbyId,
            oldPhase: 'battle',
            newPhase: lobby.gamePhase,
          });

          // Notify everyone about the forced progression
          io.to(lobbyId).emit('game_error', { message });

          gameLogger.info({ lobbyId, message }, 'Forced voting progression');

          // If phase changed to reveal, trigger reveal logic
          if (lobby.gamePhase === 'reveal') {
            const revealResult = gameState.revealScores(lobby.id);
            if (revealResult) {
              const { lobby: updatedLobby, teamScores, teamConsensus } = revealResult;
              // Phase 45-03: legacy `scores_revealed` emit removed (no client listener).
              // Per-team estimation:votes_revealed below is the canonical signal —
              // bug fix (solo-vote-stuck-discussion): mirror the fine-grained
              // reveal emit so the force-progression path populates per-player
              // currentScore client-side.
              void teamConsensus;
              if (updatedLobby.teams.developers.length > 0) {
                emitFineGrained(lobby.id, 'estimation:votes_revealed', {
                  votes: teamScores.developers,
                  team: 'developers',
                });
              }
              if (updatedLobby.teams.qa.length > 0) {
                emitFineGrained(lobby.id, 'estimation:votes_revealed', {
                  votes: teamScores.qa,
                  team: 'qa',
                });
              }
              // Phase 42-02b row #18: lobby_updated -> session:phase_changed
              // (reveal cascade after force progression).
              eventBus.emit('session:phase_changed', {
                lobbyId: lobby.id,
                oldPhase: 'reveal',
                newPhase: updatedLobby.gamePhase,
              });
            }
          }
        } else {
          socket.emit('game_error', { message: 'Cannot force voting progression - insufficient permissions or invalid state' });
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Error in forceVotingProgression');
        socket.emit('game_error', { message: 'Failed to force voting progression' });
      }
    });

    // Position sync for combat - batched for performance
    socket.on('player_pos', ({ x, y }: { x: number; y: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updatePlayerPosition(playerId, { x, y });
      if (lobby) {
        // Mark lobby as having pending position updates (will be broadcast in batch)
        pendingPositionUpdates.set(lobby.id, true);
      }
    });

    // Player vs player combat
    socket.on('attack_player', ({ targetId, damage }: { targetId: string; damage: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // For spectators, override target with nearest player
      const lobby = gameState.getLobbyByPlayerId(playerId);
      if (!lobby) return;

      const attacker = lobby.players.find(p => p.id === playerId);
      if (!attacker || attacker.team !== 'spectators') return;

      const actualTargetId = gameState.findNearestTarget(playerId) || targetId;
      const result = gameState.attackPlayer(playerId, actualTargetId, damage);
      
      if (result) {
        // Phase 45-03: legacy `player_attacked`, `modifier_updated`, and
        // `game_over` emits removed (no client listeners).
        // combat:player_damaged + combat:modifier_updated fire from
        // CombatManager.applyDamage; session:phase_changed fires from
        // gameState.attackPlayer when gameOver flips.
        void result;
      }
    });

    // Party healing (priest special ability)
    socket.on('heal_party', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.healParty(playerId);
      if (result) {
        // Phase 45-04: legacy party_healed socket emit removed.
        // gameState.healParty now emits combat:player_healed per healed
        // player via eventBus; bridge forwards each to clients which
        // render +N floating popups.
        gameLogger.info({ playerId }, 'Priest healed party');
      }
    });

    // Revival system
    // Phase 45-04: legacy revive_progress/revive_cancelled socket emits
    // replaced by eventBus.emit('combat:revival_started' / '...:cancelled')
    // so the bridge surfaces them to the new client handlers.
    socket.on('revive_start', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const success = gameState.startRevive(playerId, targetId);
      if (success) {
        const lobby = gameState.getLobbyByPlayerId(playerId);
        if (lobby) {
          eventBus.emit('combat:revival_started', {
            lobbyId: lobby.id,
            reviverId: playerId,
            targetId,
            durationMs: 3000,
          });
        }
      }
    });

    socket.on('revive_cancel', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const success = gameState.cancelRevive(playerId, targetId);
      if (success) {
        const lobby = gameState.getLobbyByPlayerId(playerId);
        if (lobby) {
          eventBus.emit('combat:revival_cancelled', {
            lobbyId: lobby.id,
            reviverId: playerId,
            targetId,
            reason: 'cancelled_by_reviver',
          });
        }
      }
    });

    socket.on('revive_tick', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Update keep-alive and validate revival conditions
      const isValid = gameState.tickRevive(playerId, targetId);
      if (!isValid) {
        // Revival was cancelled due to distance or state changes
        const lobby = gameState.getLobbyByPlayerId(playerId);
        if (lobby) {
          eventBus.emit('combat:revival_cancelled', {
            lobbyId: lobby.id,
            reviverId: playerId,
            targetId,
            reason: 'invalid_state',
          });
        }
      }
    });

    // Jumping state sync
    socket.on('player_jump', ({ isJumping }: { isJumping: boolean }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.setPlayerJumping(playerId, isJumping);
      if (lobby) {
        // Removed lobby_updated: jumping state is transient, not critical for sync
      }
    });

    // Timer settings update
    socket.on('update_timer_settings', ({ timerSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updateTimerSettings(playerId, timerSettings);
      if (lobby) {
        // Phase 42-02b row #19: lobby_updated -> session:settings_updated.
        emitFineGrained(lobby.id, 'session:settings_updated', { timerSettings: lobby.timerSettings });
      }
    });

    socket.on('update_jira_settings', ({ jiraSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updateJiraSettings(playerId, jiraSettings);
      if (lobby) {
        // Phase 42-02b row #20: lobby_updated -> session:settings_updated.
        emitFineGrained(lobby.id, 'session:settings_updated', { jiraSettings: lobby.jiraSettings });
      }
    });

    socket.on('update_estimation_settings', ({ estimationSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updateEstimationSettings(playerId, estimationSettings);
      if (lobby) {
        // Phase 42-02b row #21: lobby_updated -> session:settings_updated.
        // (42-02a designed this payload shape; this is its first emit site.)
        emitFineGrained(lobby.id, 'session:settings_updated', { estimationSettings: lobby.estimationSettings });
        gameLogger.info({ playerId, lobbyId: lobby.id }, 'Estimation settings updated');
      }
    });

    // Reconnection handler
    socket.on('reconnect_with_token', ({ reconnectToken }) => {
      try {
        const response = sessionManager.attemptPlayerReconnect(reconnectToken);

        if (response.result === 'success' && response.lobbySync) {
          const { lobbySync } = response;
          const playerId = lobbySync.yourPlayer.id;
          const lobbyId = lobbySync.lobby.id;

          // Sync player-lobby mapping to gameState for battle functions
          gameState.syncPlayerToLobby(playerId, lobbySync.lobby);

          // Update socket data
          socket.data.playerId = playerId;
          socket.data.lobbyId = lobbyId;

          // Join socket room
          socket.join(lobbyId);

          // Send successful reconnection response
          socket.emit('lobby_sync', lobbySync);
          socket.emit('reconnect_response', response);

          // Reinitialize fine-grained event sequence for reconnected player
          const emitter = getClientEventEmitter();
          emitter.sendFullState(lobbyId, lobbySync.lobby, socket.id);

          // Register player-user mapping and emit progression sync for authenticated users
          if (socket.data.userId) {
            registerPlayerUserId(playerId, socket.data.userId);
            (async () => {
              try {
                await progressionManager.loadPlayerXP(lobbyId, playerId, socket.data.userId!);
                const totalXP = progressionManager.getPlayerXP(lobbyId, playerId);
                const currentLevel = progressionManager.getPlayerLevel(lobbyId, playerId);
                socket.emit('progression:sync', {
                  playerId,
                  totalXP,
                  currentLevel,
                  seq: 0,
                  timestamp: Date.now(),
                });
              } catch (err) {
                socketLogger.error({ err }, 'Failed to sync progression on reconnect');
              }
            })();

            // Load class mastery (fire-and-forget, non-blocking)
            (async () => {
              try {
                await classMasteryManager.loadAllClassMastery(lobbyId, playerId, socket.data.userId!);
                // Build mastery data from loaded state
                const masteryData = classMasteryManager.getAllMasteryData(lobbyId, playerId);
                if (Object.keys(masteryData).length > 0) {
                  socket.emit('class_mastery:sync', {
                    playerId,
                    masteryData,
                    seq: 0,
                    timestamp: Date.now(),
                  });
                }
              } catch (err) {
                socketLogger.error({ err }, 'Failed to sync class mastery');
              }
            })();
          }

          // Phase 45-03: legacy `player_reconnected` emit removed (no client listener).
          // Reconnecting client receives lobby_sync above; other clients aren't
          // notified at the socket layer today (no toast UX consumed this).
          // Reconnecting client receives the full
          // lobby state above via lobby_sync + sendFullState.

          socketLogger.info({ playerId, playerName: lobbySync.yourPlayer.name }, 'Player reconnected successfully');
        } else {
          // Send failed reconnection response
          socket.emit('reconnect_response', response);
          socketLogger.warn({ message: response.message }, 'Reconnection failed');
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Error handling reconnect');
        socket.emit('reconnect_response', {
          result: 'server_error',
          message: 'Server error during reconnection'
        });
      }
    });

    // Client heartbeat to prevent infrastructure timeouts (Cloudflare/Replit ~2min idle limit)
    socket.on('client_heartbeat', () => {
      // Simply acknowledge - the act of receiving this message resets infrastructure idle timers
      const playerId = socket.data.playerId;
      if (playerId) {
        socketLogger.debug({ playerId }, 'Heartbeat received');
      }
    });

    // Handle missed events request (sequence gap recovery)
    socket.on('request_missed_events', ({ lastSeq }) => {
      const lobbyId = socket.data.lobbyId;
      if (!lobbyId) {
        socketLogger.warn('request_missed_events: No lobbyId in socket data');
        return;
      }

      const emitter = getClientEventEmitter();
      const missedEvents = emitter.getMissedEvents(lobbyId, lastSeq);

      if (missedEvents === null) {
        // Gap too large, send full state refresh
        socketLogger.info({ lobbyId }, 'Gap too large, sending full state');
        const lobby = sessionManager.getLobby(lobbyId);
        if (lobby) {
          emitter.sendFullState(lobbyId, lobby, socket.id);
        }
      } else if (missedEvents.length > 0) {
        // Send missed events
        socketLogger.debug({ missedEventCount: missedEvents.length, socketId: socket.id }, 'Sending missed events');
        socket.emit('system:missed_events', { events: missedEvents });
      }
      // If missedEvents is empty array, client is caught up - no action needed
    });

    // ============================================================================
    // ESTIMATION DOMAIN HANDLERS (using EstimationManager)
    // ============================================================================
    //
    // Phase 45-05B: removed 8 dead handlers (start_estimation, cast_vote,
    // change_vote, pause_voting_timer, resume_voting_timer, extend_voting_timer,
    // force_estimate, enter_discussion). Each was registered with `as any`
    // because the event was never declared in ClientToServerEvents — and no
    // client ever emitted them. They date back to Phase 03 design; the live
    // estimation flow runs through submit_score / update_discussion_vote /
    // finalize_estimate plus host-side phase transitions driven by the
    // EstimationManager event bus.

    // Finalize estimate (host only during discussion)
    socket.on('finalize_estimate', (data: { estimate: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) {
          socket.emit('game_error', { message: 'Lobby not found' });
          return;
        }

        // Verify caller is host
        if (lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only host can finalize estimate' });
          return;
        }

        estimationManager.hostFinalizeEstimate(lobbyId, playerId, data.estimate);
        gameLogger.info({ lobbyId, estimate: data.estimate }, 'Host finalized estimate');
      } catch (error) {
        socket.emit('game_error', { message: (error as Error).message });
      }
    });

    // ============================================================================
    // COMBAT DOMAIN HANDLERS (using CombatManager)
    // ============================================================================
    //
    // Phase 45-05B: removed dead start_combat / heal_teammate handlers (both
    // `as any` — never declared in ClientToServerEvents and no client emit).
    // Combat is initialized by GameState during phase transition; healing is
    // routed through use_ability / heal_party.

    // Player uses class ability
    socket.on('use_ability', ({ abilityId }: { abilityId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Get lobby for phase validation
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) {
        socket.emit('game_error', { message: 'Not in a lobby' });
        return;
      }

      // Validate combat phase
      if (lobby.gamePhase !== 'battle') {
        socket.emit('game_error', { message: 'Abilities only usable in battle phase' });
        return;
      }

      // Attempt ability use (AbilityManager validates cooldown, mastery, combat state)
      const result = abilityManager.useAbility(lobby.id, playerId, abilityId);

      if (!result.success) {
        socket.emit('game_error', { message: result.error || 'Ability use failed' });
        return;
      }

      // Success - events emitted by AbilityManager and effect handlers in domains/index.ts
      gameLogger.debug({ playerId, abilityId }, 'Player used ability');
    });

    socket.on('use_item', ({ itemType }: { itemType: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) {
        socket.emit('game_error', { message: 'Not in a lobby' });
        return;
      }

      if (lobby.gamePhase !== 'battle') {
        socket.emit('game_error', { message: 'Items only usable in battle phase' });
        return;
      }

      if (!(itemType in ITEM_DEFINITIONS)) {
        socket.emit('game_error', { message: `Unknown item type: ${itemType}` });
        return;
      }
      const result = itemManager.useItem(lobby.id, playerId, itemType as ItemType);
      if (!result.success) {
        socket.emit('game_error', { message: result.error || 'Item use failed' });
        return;
      }

      gameLogger.debug({ playerId, itemType }, 'Player used item');
    });

    // Phase 45-05B: removed dead start_revival / cancel_revival handlers (both
    // `as any`). Live revival flow uses revive_start / revive_cancel /
    // revive_tick which are declared in ClientToServerEvents and bound earlier
    // in this file.

    // Attack minion (player targeting spectator minion)
    socket.on('attack_minion', (data: { minionPlayerId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const damage = combatManager.playerAttackMinion(
          lobbyId,
          playerId,
          data.minionPlayerId
        );

        // Combat events are emitted by CombatManager, no additional emit needed
        gameLogger.debug({ playerId, minionPlayerId: data.minionPlayerId, damage }, 'Player attacked minion');
      } catch (error) {
        socket.emit('game_error', { message: (error as Error).message });
      }
    });

    socket.on('disconnect', (reason) => {
      activeConnections--;
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;

      // Update Prometheus WebSocket connection gauge
      updateWebsocketMetrics(io);

      // Track disconnect reasons for monitoring
      disconnectReasons.set(reason, (disconnectReasons.get(reason) || 0) + 1);

      // Enhanced logging for host disconnects
      const lobby = lobbyId ? sessionManager.getLobby(lobbyId) : null;
      const lobbyHostId = lobby?.hostId;
      const isHost = lobby && lobbyHostId === playerId;

      // Phase 41-02: include playerId and lobbyHostId so future host/player-id
      // asymmetries (e.g. socket.data.playerId being overwritten by a phantom
      // join) are observable directly from disconnect logs.
      socketLogger.info({
        socketId: socket.id,
        reason,
        isHost,
        playerId,
        lobbyHostId,
        lobbyId,
        activeConnections,
      }, 'Player disconnected');

      if (playerId) {
        // Use SessionManager reconnection system
        const disconnectResult = sessionManager.handlePlayerDisconnect(playerId);
        if (disconnectResult && lobbyId) {
          const { disconnectedPlayer, hostTransfer } = disconnectResult;

          // Phase 45-03: legacy `player_disconnected` emit removed (no client listener).
          // Player remains in lobby during grace; the players[].isConnected
          // flag (set elsewhere) drives any visual dim.

          const graceMinutes = Math.floor((disconnectedPlayer.graceExpiresAt - Date.now()) / 60000);
          socketLogger.info({
            playerId,
            playerName: disconnectedPlayer.playerName,
            graceMinutes
          }, 'Player can reconnect during grace period');

          // Phase 41-02: host transfer is now deferred until grace expiry
          // (see SessionManager.processDisconnectedPlayers + the
          // sessionDisconnectSweeper interval above). hostTransfer is always
          // undefined on the disconnect path post-Phase-41-02; this branch is
          // retained as a no-op safety net for any future code path that
          // re-introduces immediate transfer.
          if (hostTransfer) {
            io.to(lobbyId).emit('host_transferred', {
              oldHostId: hostTransfer.oldHostId,
              newHostId: hostTransfer.newHostId,
              newHostName: hostTransfer.newHostName,
              reason: 'Host disconnected'
            });

            // Phase 42-02b row #23: lobby_updated removed;
            // host_transferred above is the canonical signal.
            socketLogger.info({
              oldHostId: hostTransfer.oldHostId,
              newHostId: hostTransfer.newHostId,
              newHostName: hostTransfer.newHostName
            }, 'Host transferred due to disconnect');
          }
        } else {
          // Fallback to old behavior if reconnection setup fails
          const updatedLobby = sessionManager.removePlayer(playerId);
          if (updatedLobby && lobbyId) {
            // Phase 45-03: legacy `player_disconnected` emit removed (no client listener).
            // session:player_left fires from sessionManager.removePlayer above.
          }
          socketLogger.warn({ playerId }, 'Player removed immediately (reconnection unavailable)');
        }
      }
    });
  });

  // Return both io and a cleanup function for graceful shutdown
  return {
    io,
    cleanup: () => {
      clearInterval(positionBatchInterval);
      clearInterval(websocketMetricsInterval);
      clearInterval(revivalWatchdogInterval);
      clearInterval(sessionDisconnectSweeperInterval);
      eventBus.off('session:lobby_destroyed', lobbyDestroyedHandler);
      pendingPositionUpdates.clear();
    }
  };
}
