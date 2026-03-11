// TODO (Phase 5 cleanup): Once all state updates flow through fine-grained events,
// completely remove the 'lobby_updated' event from ServerToClientEvents

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import { ClientToServerEvents, ServerToClientEvents, TeamType } from '../shared/gameEvents.js';
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
  PlayerNotFoundError,
  PlayerNotHostError,
  ReconnectionFailedError,
  SessionError,
  EstimationNotActiveError,
  VoteNotEligibleError,
  InvalidVoteValueError,
  NotInDiscussionPhaseError,
  ForceEstimateTieError,
  InvalidForcedValueError,
  CombatNotActiveError,
  PlayerNotInCombatError,
  RevivalNotAllowedError,
  NotHealerClassError,
} from './domains/index.js';
import {
  validatePayload,
  ToggleReadyPayloadSchema,
} from '../shared/socket-schemas.js';
import { updateWebsocketMetrics } from "./metrics.js";

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
  const clientEventEmitter = initializeClientEventEmitter(io);
  socketLogger.info('ClientEventEmitter initialized for fine-grained events');

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

    // Keep lobby_updated: phase transitions need full state for completedTickets and currentTicket updates
    io.to(lobbyId).emit('lobby_updated', { lobby });
    gameLogger.info({ lobbyId, newPhase: lobby.gamePhase }, 'Discussion ended, phase transition');
  });

  // Connection monitoring for Replit
  let totalConnections = 0;
  let activeConnections = 0;
  let disconnectReasons = new Map<string, number>();

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
      activeLobbies: (sessionManager as any).lobbies?.size || 0,
      disconnectReasons: disconnectReasonsObj
    }, 'Connection statistics');
  }, 5 * 60 * 1000).unref();

  // Set up revival completion watchdog
  const revivalWatchdogInterval = setInterval(() => {
    const completedRevivals = (gameState as any).processRevivalSessions();
    for (const revival of completedRevivals) {
      io.to(revival.lobbyId).emit('revive_complete', {
        targetId: revival.targetId,
        reviverId: revival.reviverId
      });
    }
  }, 100);

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
    const req = socket.request as any;
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
    updateWebsocketMetrics(io.sockets.sockets.size);

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

      // Emit legacy event for App.tsx state transition
      io.to(lobby.id).emit('avatar_selected', { playerId, avatar: avatarClass });

      // Emit fine-grained event for incremental state updates
      const emitter = getClientEventEmitter();
      if (emitter) {
        const seq = (emitter as any).sequencer.nextSeq(lobby.id);
        const timestamp = Date.now();
        const payload = { playerId, avatar: avatarClass, seq, timestamp };
        (emitter as any).sequencer.bufferEvent(lobby.id, seq, 'session:avatar_selected', payload);
        io.to(lobby.id).emit('session:avatar_selected', payload);
      }
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

      // Keep lobby_updated for ticket management (host-only, not covered by fine-grained events yet)
      io.to(lobby.id).emit('lobby_updated', { lobby });
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

      // Keep lobby_updated for ticket management (host-only, not covered by fine-grained events yet)
      io.to(lobby.id).emit('lobby_updated', { lobby });
      socketLogger.info({ playerId, ticketId, lobbyId: lobby.id }, 'Host removed ticket');
    });

    // Explicit leave lobby (user clicked back to menu)
    socket.on('leave_lobby', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      socketLogger.info({ playerId, lobbyId }, 'Player explicitly leaving lobby');

      // Capture player info before removal
      const lobby = sessionManager.getPlayerLobby(playerId);
      const leavingPlayer = lobby?.players.find(p => p.id === playerId);
      const playerName = leavingPlayer?.name || 'Unknown';

      // Remove player from lobby
      const updatedLobby = sessionManager.removePlayer(playerId);

      // Leave socket room
      socket.leave(lobbyId);

      // Clear socket data
      socket.data.playerId = undefined;
      socket.data.lobbyId = undefined;

      // Notify remaining players
      if (updatedLobby) {
        const leavingPlayer = updatedLobby.players.find(p => p.id === playerId);
        io.to(lobbyId).emit('player_left', { playerId, playerName: leavingPlayer?.name || 'Unknown' });
        io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
      }
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
      io.to(lobby.id).emit('lobby_updated', { lobby });
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

      // Broadcast updated lobby state to all players
      io.to(lobbyId).emit('lobby_updated', { lobby });
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
          socket.to(lobby.id).emit('score_submitted', { playerId, team: player.team });
        }

        // Removed lobby_updated: estimation:vote_cast event emitted by estimationManager
        
        // Check if all scores submitted and reveal
        if (lobby.gamePhase === 'reveal') {
          const result = gameState.revealScores(lobby.id);
          if (result) {
            const { lobby: updatedLobby, teamScores, teamConsensus } = result;
            io.to(lobby.id).emit('scores_revealed', { teamScores, teamConsensus });
            // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
            io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
            
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
              io.to(lobby.id).emit('boss_defeated', { lobby: updatedLobby });
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
        // Keep lobby_updated for discussion phase updates (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
        
        // Check for consensus and auto-advance - rely on gameState for consensus logic
        const result = gameState.checkDiscussionConsensus(lobby.id);
        if (result) {
          const { lobby: updatedLobby } = result;
          
          // If lobby progressed beyond discussion phase, emit appropriate updates
          if (updatedLobby.gamePhase !== 'discussion') {
            // Auto-advance after a brief delay for players to see the consensus
            setTimeout(() => {
              // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
              io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
              if (updatedLobby.boss?.defeated) {
                io.to(lobby.id).emit('boss_defeated', { lobby: updatedLobby });
              }
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

        // Emit modifier update if it changed
        if (modifier !== undefined) {
          io.to(lobby.id).emit('modifier_updated', { modifier });
        }

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
        const { lobby, targetHealth, gameOver } = result;
        
        // Broadcast boss damage to room
        io.to(lobby.id).emit('player_attacked', { 
          attackerId: 'boss', 
          targetId: playerId, 
          damage, 
          targetHealth 
        });
        
        // Check for game over
        if (gameOver) {
          io.to(lobby.id).emit('game_over', { lobby });
        }

        // Removed lobby_updated: combat:player_damaged event emitted by combatManager
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

        // Keep lobby_updated: major state reset (new ticket, reset combat/estimation)
        io.to(lobbyId).emit('lobby_updated', { lobby });
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
        // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
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
        io.to(lobby.id).emit('lobby_updated', { lobby });
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
        // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
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
        io.to(updatedLobby.id).emit('scores_revealed', { teamScores, teamConsensus });
        // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
        io.to(updatedLobby.id).emit('lobby_updated', { lobby: updatedLobby });
        
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
          io.to(updatedLobby.id).emit('boss_defeated', { lobby: updatedLobby });
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

        // Only allow advancement during discussion phase with consensus
        if (lobby.gamePhase !== 'discussion') {
          socket.emit('game_error', { message: 'Phase advancement only available during discussion phase' });
          return;
        }

        const result = gameState.manualAdvancePhase(lobbyId);
        if (result) {
          const { lobby: updatedLobby } = result;

          // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
          io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });

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

          // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
          io.to(lobbyId).emit('lobby_updated', { lobby });

          // Notify everyone about the forced progression
          io.to(lobbyId).emit('game_error', { message });

          gameLogger.info({ lobbyId, message }, 'Forced voting progression');

          // If phase changed to reveal, trigger reveal logic
          if (lobby.gamePhase === 'reveal') {
            const revealResult = gameState.revealScores(lobby.id);
            if (revealResult) {
              const { lobby: updatedLobby, teamScores, teamConsensus } = revealResult;
              io.to(lobby.id).emit('scores_revealed', { teamScores, teamConsensus });
              // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
              io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
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
        const { lobby: updatedLobby, targetHealth, gameOver, modifier } = result;
        io.to(lobby.id).emit('player_attacked', { 
          attackerId: playerId, 
          targetId: actualTargetId, 
          damage, 
          targetHealth 
        });
        
        // Emit modifier update
        if (modifier !== undefined) {
          io.to(lobby.id).emit('modifier_updated', { modifier });
        }
        
        // Check for game over
        if (gameOver) {
          io.to(lobby.id).emit('game_over', { lobby: updatedLobby });
        }

        // Removed lobby_updated: combat:player_damaged event emitted by combatManager
      }
    });

    // Party healing (priest special ability)
    socket.on('heal_party', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.healParty(playerId);
      if (result) {
        const { lobby, healedPlayers } = result;
        io.to(lobby.id).emit('party_healed', { healerId: playerId, healedPlayers });
        // Removed lobby_updated: party_healed event contains all necessary info
        gameLogger.info({ playerId }, 'Priest healed party');
      }
    });

    // Revival system
    socket.on('revive_start', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const success = gameState.startRevive(playerId, targetId);
      if (success) {
        const lobby = gameState.getLobbyByPlayerId(playerId);
        if (lobby) {
          io.to(lobby.id).emit('revive_progress', { targetId, reviverId: playerId, progress: 0 });
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
          io.to(lobby.id).emit('revive_cancelled', { targetId, reviverId: playerId });
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
          io.to(lobby.id).emit('revive_cancelled', { targetId, reviverId: playerId });
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
        // Keep lobby_updated for settings changes (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('update_jira_settings', ({ jiraSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updateJiraSettings(playerId, jiraSettings);
      if (lobby) {
        // Keep lobby_updated for settings changes (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('update_estimation_settings', ({ estimationSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updateEstimationSettings(playerId, estimationSettings);
      if (lobby) {
        // Keep lobby_updated for settings changes (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
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

          // Notify other players about the reconnection
          socket.to(lobbyId).emit('player_reconnected', {
            playerId,
            playerName: lobbySync.yourPlayer.name
          });
          // Keep lobby_updated for reconnection notifications (not yet covered by fine-grained events)
          socket.to(lobbyId).emit('lobby_updated', { lobby: lobbySync.lobby });

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
    socket.on('client_heartbeat' as any, () => {
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

    // Start estimation for a ticket
    socket.on('start_estimation' as any, ({ ticketId }: { ticketId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        // Start estimation
        estimationManager.startEstimation(lobbyId, ticketId);

        // Add all current non-spectator players as eligible voters
        for (const player of lobby.players) {
          if (player.team !== 'spectators') {
            estimationManager.addEligibleVoter(lobbyId, player.id, player.team);
          }
        }

        // Broadcast estimation started
        io.to(lobbyId).emit('estimation_started' as any, { ticketId });
        gameLogger.info({ ticketId, lobbyId }, 'Estimation started');
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can start estimation' });
        } else if (error instanceof LobbyNotFoundError) {
          socket.emit('game_error', { message: 'Lobby not found' });
        } else {
          socketLogger.error({ err: error }, 'Start estimation error');
          socket.emit('game_error', { message: 'Failed to start estimation' });
        }
      }
    });

    // Cast vote during estimation
    socket.on('cast_vote' as any, ({ vote }: { vote: number | '?' }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Get player's team from session
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);

        const player = lobby.players.find(p => p.id === playerId);
        if (!player) throw new PlayerNotFoundError(playerId);

        // Cast vote through EstimationManager
        estimationManager.castVote(lobbyId, playerId, player.team, vote);

        // Record activity for host transfer
        sessionManager.recordPlayerActivity(playerId);

        // Broadcast updated vote state
        const visibility = estimationManager.getAllVoteVisibility(lobbyId);
        io.to(lobbyId).emit('vote_state_updated' as any, visibility);

        gameLogger.debug({ playerId, vote, team: player.team }, 'Player voted');
      } catch (error) {
        if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else if (error instanceof VoteNotEligibleError) {
          socket.emit('game_error', { message: error.message });
        } else if (error instanceof InvalidVoteValueError) {
          socket.emit('game_error', { message: error.message });
        } else if (error instanceof LobbyNotFoundError) {
          socket.emit('game_error', { message: 'Lobby not found' });
        } else {
          socketLogger.error({ err: error }, 'Vote error');
          socket.emit('game_error', { message: 'Failed to submit vote' });
        }
      }
    });

    // Change vote during discussion phase
    socket.on('change_vote' as any, ({ newVote }: { newVote: number | '?' }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Get player's team
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);

        const player = lobby.players.find(p => p.id === playerId);
        if (!player) throw new PlayerNotFoundError(playerId);

        // Change vote through EstimationManager
        estimationManager.changeVoteDuringDiscussion(lobbyId, playerId, player.team, newVote);

        // Record activity
        sessionManager.recordPlayerActivity(playerId);

        // Broadcast updated vote state
        const visibility = estimationManager.getAllVoteVisibility(lobbyId);
        io.to(lobbyId).emit('vote_state_updated' as any, visibility);

        gameLogger.debug({ playerId, newVote }, 'Player changed vote during discussion');
      } catch (error) {
        if (error instanceof NotInDiscussionPhaseError) {
          socket.emit('game_error', { message: 'Can only change vote during discussion phase' });
        } else if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else if (error instanceof VoteNotEligibleError) {
          socket.emit('game_error', { message: error.message });
        } else if (error instanceof InvalidVoteValueError) {
          socket.emit('game_error', { message: error.message });
        } else {
          socketLogger.error({ err: error }, 'Change vote error');
          socket.emit('game_error', { message: 'Failed to change vote' });
        }
      }
    });

    // Pause voting timer (host control)
    socket.on('pause_voting_timer' as any, ({ team }: { team: TeamType }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        estimationManager.pauseTimer(lobbyId, team, playerId);

        // Broadcast timer state
        io.to(lobbyId).emit('timer_paused' as any, { team });
        gameLogger.info({ team }, 'Host paused voting timer');
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can pause the timer' });
        } else {
          socketLogger.error({ err: error }, 'Pause timer error');
          socket.emit('game_error', { message: 'Failed to pause timer' });
        }
      }
    });

    // Resume voting timer (host control)
    socket.on('resume_voting_timer' as any, ({ team }: { team: TeamType }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        estimationManager.resumeTimer(lobbyId, team, playerId);

        // Broadcast timer state
        io.to(lobbyId).emit('timer_resumed' as any, { team });
        gameLogger.info({ team }, 'Host resumed voting timer');
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can resume the timer' });
        } else {
          socketLogger.error({ err: error }, 'Resume timer error');
          socket.emit('game_error', { message: 'Failed to resume timer' });
        }
      }
    });

    // Extend voting timer (host control)
    socket.on('extend_voting_timer' as any, ({ team, additionalSeconds }: { team: TeamType; additionalSeconds: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        const additionalMs = additionalSeconds * 1000;
        estimationManager.extendTimer(lobbyId, team, additionalMs, playerId);

        // Broadcast timer state
        io.to(lobbyId).emit('timer_extended' as any, { team, additionalSeconds });
        gameLogger.info({ team, additionalSeconds }, 'Host extended voting timer');
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can extend the timer' });
        } else {
          socketLogger.error({ err: error }, 'Extend timer error');
          socket.emit('game_error', { message: 'Failed to extend timer' });
        }
      }
    });

    // Force estimate (host control during ties)
    socket.on('force_estimate' as any, ({ team, forcedValue }: { team: TeamType; forcedValue?: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        const result = estimationManager.forceEstimate(lobbyId, team, playerId, forcedValue);

        // Broadcast forced estimate
        io.to(lobbyId).emit('estimate_forced' as any, { team, consensusValue: result.consensusValue });
        gameLogger.info({ team, consensusValue: result.consensusValue }, 'Host forced estimate');
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can force an estimate' });
        } else if (error instanceof ForceEstimateTieError) {
          const err = error as ForceEstimateTieError;
          socket.emit('game_error', {
            message: `Vote is tied between [${err.tiedValues.join(', ')}]. Please choose one.`,
            tiedValues: err.tiedValues
          });
        } else if (error instanceof InvalidForcedValueError) {
          const err = error as InvalidForcedValueError;
          socket.emit('game_error', {
            message: `Invalid forced value. Must choose from: [${err.validValues.join(', ')}]`
          });
        } else if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else {
          socketLogger.error({ err: error }, 'Force estimate error');
          socket.emit('game_error', { message: 'Failed to force estimate' });
        }
      }
    });

    // Enter discussion phase for a team
    socket.on('enter_discussion' as any, ({ team }: { team: TeamType }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        estimationManager.enterDiscussionPhase(lobbyId, team);

        // Broadcast phase change
        const visibility = estimationManager.getAllVoteVisibility(lobbyId);
        io.to(lobbyId).emit('vote_state_updated' as any, visibility);
        gameLogger.info({ team }, 'Team entered discussion phase');
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can start discussion' });
        } else if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else {
          socketLogger.error({ err: error }, 'Enter discussion error');
          socket.emit('game_error', { message: 'Failed to enter discussion phase' });
        }
      }
    });

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

    // Start combat (host initiates combat for a ticket)
    socket.on('start_combat' as any, (data: { lobbyId: string; ticketIndex?: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = sessionManager.getLobby(data.lobbyId);
      if (!lobby) {
        socket.emit('game_error', { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found' });
        return;
      }

      // Verify host
      if (lobby.hostId !== playerId) {
        socket.emit('game_error', { code: 'NOT_HOST', message: 'Only host can start combat' });
        return;
      }

      // Initialize combat with active players
      const players = lobby.players.map(p => ({ id: p.id, team: p.team }));
      combatManager.initializeCombat(data.lobbyId, players, data.ticketIndex ?? 0, lobby.boss?.sprite);

      gameLogger.info({ lobbyId: data.lobbyId }, 'Combat initialized');
    });

    // Player heals teammate
    socket.on('heal_teammate' as any, (data: { targetId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        combatManager.playerHealTeammate(lobbyId, playerId, data.targetId);
        gameLogger.debug({ playerId, targetId: data.targetId }, 'Player healed teammate');
      } catch (error) {
        if (error instanceof CombatNotActiveError || error instanceof NotHealerClassError) {
          socket.emit('game_error', { code: (error as any).code, message: error.message });
        } else {
          throw error;
        }
      }
    });

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

      const result = itemManager.useItem(lobby.id, playerId, itemType as any);
      if (!result.success) {
        socket.emit('game_error', { message: result.error || 'Item use failed' });
        return;
      }

      gameLogger.debug({ playerId, itemType }, 'Player used item');
    });

    // Start revival
    socket.on('start_revival' as any, (data: { targetId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const started = combatManager.startRevival(lobbyId, playerId, data.targetId);
        if (!started) {
          socket.emit('game_error', { code: 'REVIVAL_CONDITIONS_NOT_MET', message: 'Cannot start revival' });
        } else {
          gameLogger.debug({ playerId, targetId: data.targetId }, 'Player started reviving');
        }
      } catch (error) {
        if (error instanceof RevivalNotAllowedError) {
          socket.emit('game_error', { code: (error as any).code, message: error.message });
        } else {
          throw error;
        }
      }
    });

    // Cancel revival
    socket.on('cancel_revival' as any, () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      combatManager.cancelRevival(playerId, 'player_cancelled');
      gameLogger.debug({ playerId }, 'Player cancelled revival');
    });

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
      updateWebsocketMetrics(io.sockets.sockets.size);

      // Track disconnect reasons for monitoring
      disconnectReasons.set(reason, (disconnectReasons.get(reason) || 0) + 1);

      // Enhanced logging for host disconnects
      const lobby = lobbyId ? sessionManager.getLobby(lobbyId) : null;
      const isHost = lobby && lobby.hostId === playerId;

      socketLogger.info({
        socketId: socket.id,
        reason,
        isHost,
        lobbyId,
        activeConnections
      }, 'Player disconnected');

      if (playerId) {
        // Use SessionManager reconnection system
        const disconnectResult = sessionManager.handlePlayerDisconnect(playerId);
        if (disconnectResult && lobbyId) {
          const { disconnectedPlayer, reconnectToken, hostTransfer } = disconnectResult;

          // Notify other players about the disconnection (but keep player in lobby)
          io.to(lobbyId).emit('player_disconnected', { playerId });

          const graceMinutes = Math.floor((disconnectedPlayer.graceExpiresAt - Date.now()) / 60000);
          socketLogger.info({
            playerId,
            playerName: disconnectedPlayer.playerName,
            graceMinutes
          }, 'Player can reconnect during grace period');

          // If host was transferred, notify all players and update lobby
          if (hostTransfer) {
            io.to(lobbyId).emit('host_transferred', {
              oldHostId: hostTransfer.oldHostId,
              newHostId: hostTransfer.newHostId,
              newHostName: hostTransfer.newHostName,
              reason: 'Host disconnected'
            });

            // Emit lobby update with new host information
            const updatedLobby = sessionManager.getLobby(lobbyId);
            if (updatedLobby) {
              // Keep lobby_updated for host transfer (not yet covered by fine-grained events)
              io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
            }

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
            io.to(lobbyId).emit('player_disconnected', { playerId });
            // Keep lobby_updated for player removal fallback (not yet covered by fine-grained events)
            io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
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
      clearInterval(revivalWatchdogInterval);
      eventBus.off('session:lobby_destroyed', lobbyDestroyedHandler);
      pendingPositionUpdates.clear();
    }
  };
}
