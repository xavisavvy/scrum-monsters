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
import type { z } from 'zod';
import {
  validatePayload,
  ClientEventSchemas,
  ToggleReadyPayloadSchema,
  BossDamagePlayerPayloadSchema,
} from '../shared/socket-schemas.js';
import { redactLobbyForWire } from './events/ClientEventEmitter.js';
import { SocketRateLimiter, type RateLimitConfig } from './middleware/socketRateLimiter.js';
import { handleCreateLobby, handleReconnectWithToken, handleDisconnect, type HandlerDeps } from './websocket.handlers.js';
import { CombatError } from './errors/CombatErrors.js';

// Per-event WebSocket rate limits (Security: H-6). ONLY expensive / abusable
// events are listed — high-frequency gameplay events (movement, charge, jump,
// votes, emotes, attacks) are intentionally omitted so real-time
// responsiveness is never throttled. Limits are generous for legitimate use
// and only bite on floods. Skipped entirely under NODE_ENV=test.
const WS_RATE_LIMITS: Readonly<Record<string, RateLimitConfig>> = {
  create_lobby: { capacity: 5, refillPerSec: 0.2 },        // burst 5, ~1 / 5s sustained
  join_lobby: { capacity: 10, refillPerSec: 1 },
  add_tickets: { capacity: 30, refillPerSec: 3 },
  remove_ticket: { capacity: 30, refillPerSec: 3 },
  update_lobby_name: { capacity: 20, refillPerSec: 2 },
  reconnect_with_token: { capacity: 10, refillPerSec: 1 },
  update_jira_settings: { capacity: 20, refillPerSec: 2 },
  update_timer_settings: { capacity: 20, refillPerSec: 2 },
  update_estimation_settings: { capacity: 20, refillPerSec: 2 },
  youtube_play: { capacity: 20, refillPerSec: 2 },
};
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
  const emitFineGrained = (lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void => {
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
  // Mutable ref so handleDisconnect (extracted for testability) can decrement it.
  const activeConnections = { value: 0 };
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
      activeConnections: activeConnections.value,
      hostConnections: hostConnections.length,
      activeLobbies: sessionManager.getLobbyCount(),
      disconnectReasons: disconnectReasonsObj
    }, 'Connection statistics');
  }, 5 * 60 * 1000).unref();

  // Set up revival completion watchdog
  // Phase 50-02: The legacy revival watchdog interval was removed here.
  // CombatManager's self-managing per-session setInterval handles revival
  // ticks, progress, and completion (no external polling needed).

  // Phase 41-02: Disconnected-player sweeper for the SessionManager domain.
  // When a player's grace period expires, processDisconnectedPlayers performs
  // any deferred host transfer (host status is no longer transferred
  // immediately on disconnect — see SessionManager.handlePlayerDisconnect).
  // We emit `host_transferred` here so other clients update their UI.
  const sessionDisconnectSweeperInterval = setInterval(() => {
    try {
      // Phase 50-02: host_transferred fires via eventBus → ClientEventEmitter bridge.
      // session:host_transferred is emitted by SessionManager.processDisconnectedPlayers;
      // ClientEventEmitter delivers it as the wire event 'host_transferred' to the lobby.
      sessionManager.processDisconnectedPlayers();
    } catch (err) {
      socketLogger.error({ err }, 'sessionDisconnectSweeper failed');
    }
  }, 30000);

  // Idle-lobby reaper (Security: H-5). Removes lobbies that have received no
  // client event for LOBBY_IDLE_TTL — i.e. abandoned/orphaned lobbies with no
  // connected clients. Connected clients heartbeat every ~25s (stamping
  // activity via the gateway), so active lobbies are never reaped. Bounds
  // memory together with the MAX_LOBBIES cap.
  const idleLobbyReaperInterval = setInterval(() => {
    try {
      sessionManager.reapIdleLobbies();
    } catch (err) {
      socketLogger.error({ err }, 'idleLobbyReaper failed');
    }
  }, 5 * 60 * 1000);

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
    activeConnections.value++;

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
      activeConnections: activeConnections.value,
      authenticated: !!socket.data.userId,
      userId: socket.data.userId
    }, 'Player connected');

    // Update Prometheus WebSocket connection gauge
    updateWebsocketMetrics(io);

    // Per-socket rate limiter for expensive/abusable events (Security: H-6).
    // Disabled under test to keep unit/integration tests deterministic.
    const isTest = process.env.NODE_ENV === 'test';
    const rateLimiter = new SocketRateLimiter(WS_RATE_LIMITS);

    // Central validation gateway (Security: M-2). Every client event is
    // rate-checked (H-6), then validated against its schema in
    // ClientEventSchemas before the handler runs; malformed/out-of-shape
    // payloads are rejected with a game_error and never reach game state.
    // Replaces ~50 hand-rolled (mostly absent) checks. `disconnect` is a
    // lifecycle event and stays on raw socket.on below.
    const on = <E extends keyof typeof ClientEventSchemas>(
      event: E,
      handler: (data: z.infer<(typeof ClientEventSchemas)[E]>) => void,
    ): void => {
      socket.on(event as keyof ClientToServerEvents, ((raw: unknown) => {
        if (!isTest && !rateLimiter.allow(event as string)) {
          socketLogger.warn({ event, socketId: socket.id }, 'Rate limit exceeded for socket event');
          socket.emit('game_error', { message: 'Rate limit exceeded. Please slow down.' });
          return;
        }
        const result = validatePayload(ClientEventSchemas[event] as z.ZodType<unknown>, raw);
        if (!result.success) {
          socketLogger.warn(
            { event, socketId: socket.id, issues: result.error.issues.slice(0, 3) },
            'Rejected invalid socket payload',
          );
          socket.emit('game_error', { message: `Invalid ${String(event)} payload` });
          return;
        }
        // Stamp lobby activity so the idle-lobby reaper (H-5) never reaps a
        // lobby that is still receiving client events.
        if (socket.data.lobbyId) {
          sessionManager.recordLobbyActivity(socket.data.lobbyId);
        }
        // Crash guard: a throw inside any handler must never become an uncaught
        // exception that takes down the whole server. CombatError (and subclasses)
        // are expected domain rejections — e.g. attack_boss arriving during the
        // voting window before combat is active (CombatNotActiveError) — so log
        // them at debug and move on. Anything else is a real bug: log it and tell
        // the client, but keep the process alive.
        try {
          handler(result.data as z.infer<(typeof ClientEventSchemas)[E]>);
        } catch (err) {
          if (err instanceof CombatError) {
            socketLogger.debug(
              { event, socketId: socket.id, code: err.code, message: err.message },
              'Combat action rejected (expected domain error)',
            );
          } else {
            socketLogger.error(
              { event, socketId: socket.id, err },
              'Unhandled error in socket handler',
            );
            socket.emit('game_error', { message: 'An unexpected error occurred.' });
          }
        }
      }) as never);
    };

    // Assemble deps for the three extracted handlers (MAINT-03).
    // These are the same singletons and closure-local values the handlers
    // previously closed over — no behavior change.
    const handlerDeps: HandlerDeps = {
      gameState,
      io,
      sessionManager,
      progressionManager,
      classMasteryManager,
      registerPlayerUserId,
      activeConnections,
      disconnectReasons,
    };

    on('create_lobby', (data) => { handleCreateLobby(socket, data, handlerDeps); });

    on('join_lobby', ({ lobbyId, playerName }) => {
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

        // Redact secret vote values before any full-lobby emit to this socket
        // (defeats the pre-reveal vote leak on late-join — Security fix H-3).
        const wireLobby = redactLobbyForWire(lobby);

        if (currentPhase === 'lobby' || currentPhase === 'avatar_selection') {
          // Normal flow - player goes through avatar selection first
          socket.emit('lobby_joined', { lobby: wireLobby, player });
        } else {
          // Late joiner - skip directly to current phase
          socketLogger.info({ playerName, currentPhase }, 'Late joiner entering active phase');

          // Emit lobby_joined first for state setup
          socket.emit('lobby_joined', { lobby: wireLobby, player });

          // Then immediately emit the phase-specific event to advance them
          if (currentPhase === 'battle' || currentPhase === 'scoring' || currentPhase === 'discussion' || currentPhase === 'reveal') {
            // Emit battle_started to transition client to battle screen
            if (lobby.boss) {
              socket.emit('battle_started', { lobby: wireLobby, boss: lobby.boss });
              socketLogger.info({ playerName }, 'Late joiner advanced to battle phase');
            }
          }
        }

        socket.emit('lobby_sync', {
          lobby: wireLobby,
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

    on('select_avatar', ({ avatarClass }) => {
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

    on('assign_team', ({ playerId: targetPlayerId, team }) => {
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

    on('change_own_team', ({ team }) => {
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

    on('add_tickets', ({ tickets }) => {
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

    on('remove_ticket', ({ ticketId }) => {
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
    on('leave_lobby', () => {
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
    on('update_lobby_name', ({ name }) => {
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
    on('lobby_player_pos', ({ x, y, direction }) => {
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

    on('lobby_player_jump', ({ isJumping }) => {
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

    on('player_charge', ({ isCharging, chargePower }: { isCharging: boolean; chargePower?: number }) => {
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

    on('lobby_emote', ({ message, x, y }) => {
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

    on('toggle_ready', (data) => {
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
    on('battle_emote', ({ message, x, y }) => {
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

    on('start_battle', () => {
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

    on('submit_score', ({ score }) => {
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
            // Fine-grained estimation:votes_revealed per team below is canonical.
            // The client handler mirrors each player's currentScore into BOTH
            // players[] and teams[*]; Discussion.tsx renders the vote grid from
            // teams.developers/qa, so that mirror is what makes votes appear.
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
            // Phase 42-02b row #8: lobby_updated -> session:phase_changed.
            // revealScores() already advanced the phase to 'discussion', so this
            // emits a single battle->discussion transition (votes_revealed above
            // carries the per-player scores).
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

    on('update_discussion_vote', ({ score }) => {
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

    on('attack_boss', ({ damage }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.attackBoss(playerId, damage);
      if (result) {
        const { lobby, bossHealth, ringAttack, healedBoss, modifier } = result;
        
        if (healedBoss) {
          // Phase 45-05B L5: legacy `boss_healed` emit removed; the
          // fine-grained combat:boss_healed (bridged from gameState's
          // spectator-heal path via eventBus elsewhere) is the single source.
          eventBus.emit('combat:boss_healed', {
            lobbyId: lobby.id,
            healAmount: (modifier || 0) + 1,
            bossHealth,
          });
        }
        // MAINT-05: combat:boss_damaged is no longer emitted here.
        // CombatManager.applyBasicDamageToBoss (called via gameState.attackBoss) is the
        // single authoritative emitter for basic-attack boss-damaged events.
        // Removing this manual emit eliminates the double-emit that caused double XP,
        // double damage-boost, and duplicate client HP updates on basic attacks.

        // Phase 45-03: legacy `modifier_updated` emit removed (no client listener).
        // combat:modifier_updated fires from CombatManager.applyDamage on the
        // same call path.

        // If boss performs ring attack, broadcast it
        if (ringAttack) {
          io.to(lobby.id).emit('boss_ring_attack', ringAttack);
        }
      }
    });
    
    // Boss damage to player.
    // This event is client-reported: boss projectile collisions are simulated
    // client-side (PlayerController) and the hit player reports its own damage.
    // It is therefore only valid for a player to report damage to ITSELF.
    // Without the self-target guard, any client could down (or, via a negative
    // value, heal) any player in any lobby and force game_over. (Security: H-1)
    on('boss_damage_player', (data) => {
      const attackerId = socket.data.playerId;
      if (!attackerId) return;

      const validation = validatePayload(BossDamagePlayerPayloadSchema, data);
      if (!validation.success) {
        socket.emit('game_error', { message: 'Invalid boss_damage_player payload' });
        return;
      }
      const { playerId, damage } = validation.data;

      // A player may only report boss damage against themselves.
      if (playerId !== attackerId) {
        socketLogger.warn(
          { attackerId, targetId: playerId },
          'Rejected boss_damage_player targeting another player'
        );
        return;
      }

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
    on('player_projectile', ({ startX, startY, targetX, targetY, emoji, targetPlayerId }) => {
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

    on('proceed_next_level', () => {
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

    on('abandon_quest', () => {
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

    on('restart_game', () => {
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

    on('return_to_lobby', () => {
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

    on('force_reveal', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.forceRevealScores(playerId);
      if (result) {
        const { lobby: updatedLobby, teamScores, teamConsensus } = result;
        // Emit per-team estimation:votes_revealed here so the Discussion screen
        // receives per-player scores when the host uses force-reveal.
        if (updatedLobby.teams.developers.length > 0) {
          emitFineGrained(updatedLobby.id, 'estimation:votes_revealed', {
            votes: teamScores.developers,
            team: 'developers',
          });
        }
        if (updatedLobby.teams.qa.length > 0) {
          emitFineGrained(updatedLobby.id, 'estimation:votes_revealed', {
            votes: teamScores.qa,
            team: 'qa',
          });
        }
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

    on('youtube_play', ({ videoId, url }) => {
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

    on('youtube_stop', () => {
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

    on('advancePhaseNow', () => {
      try {
        // Identity MUST come from the authenticated socket, never the payload.
        // The previous implementation compared two attacker-supplied values
        // (`lobby.hostId === payload.playerId`), letting any lobby member spoof
        // a host-only phase advance since `hostId` is broadcast to all clients.
        // (Security: H-2)
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        // Only allow host to manually advance phases
        const lobby = lobbyId ? gameState.getLobby(lobbyId) : undefined;
        if (!lobbyId || !lobby || !playerId || lobby.hostId !== playerId) {
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
          // session:phase_changed (with completedTickets) is emitted inside
          // completeConsensus, which manualAdvancePhase delegates to.
          gameLogger.info({ playerId, lobbyId }, 'Host manually advanced phase');
        } else {
          socket.emit('game_error', { message: 'Cannot advance phase - consensus not reached' });
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Error in advancePhaseNow');
        socket.emit('game_error', { message: 'Failed to advance phase' });
      }
    });

    on('forceVotingProgression', ({ lobbyId }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          socket.emit('game_error', { message: 'Player not authenticated' });
          return;
        }

        const result = gameState.forceVotingProgression(playerId);
        if (result) {
          const { lobby, message } = result;

          // Notify everyone about the forced progression.
          io.to(lobbyId).emit('game_error', { message });
          gameLogger.info({ lobbyId, message }, 'Forced voting progression');

          // If the force advanced to reveal, run the reveal cascade and emit a
          // SINGLE battle->discussion transition (revealScores advances the phase
          // to 'discussion') — matching submit_score / force_reveal and avoiding
          // a transient 'reveal' interstitial flashing over the result screen.
          if (lobby.gamePhase === 'reveal') {
            const revealResult = gameState.revealScores(lobby.id);
            if (revealResult) {
              const { lobby: updatedLobby, teamScores } = revealResult;
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
              eventBus.emit('session:phase_changed', {
                lobbyId: lobby.id,
                oldPhase: 'battle',
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
    on('player_pos', ({ x, y }: { x: number; y: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updatePlayerPosition(playerId, { x, y });
      if (lobby) {
        // Mark lobby as having pending position updates (will be broadcast in batch)
        pendingPositionUpdates.set(lobby.id, true);
      }
    });

    // Player vs player combat
    on('attack_player', ({ targetId, damage }: { targetId: string; damage: number }) => {
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
    on('heal_party', () => {
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
    on('revive_start', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      // Phase 50-02: route through CombatManager (self-manages 100ms interval +
      // combat:revival_started emit internally — do NOT duplicate eventBus.emit here).
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) return;
      try {
        const success = combatManager.startRevival(lobby.id, playerId, targetId);
        if (!success) {
          socket.emit('game_error', { message: 'Cannot start revival' });
        }
      } catch (err) {
        // RevivalNotAllowedError for non-healer classes
        socket.emit('game_error', { message: (err as Error).message });
      }
    });

    on('revive_cancel', ({ targetId: _targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      // Phase 50-02: CombatManager.cancelRevival emits combat:revival_cancelled internally
      combatManager.cancelRevival(playerId, 'cancelled_by_reviver');
    });

    // revive_tick removed in Phase 50-02: CombatManager's internal setInterval
    // per-session replaces the external keep-alive pattern (Pitfall 6 — no ack contract).

    // Jumping state sync
    on('player_jump', ({ isJumping }: { isJumping: boolean }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.setPlayerJumping(playerId, isJumping);
      if (lobby) {
        // Removed lobby_updated: jumping state is transient, not critical for sync
      }
    });

    // Timer settings update
    on('update_timer_settings', ({ timerSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const lobby = sessionManager.updateTimerSettings(playerId, timerSettings);
        // Phase 42-02b row #19: lobby_updated -> session:settings_updated.
        emitFineGrained(lobby.id, 'session:settings_updated', { timerSettings: lobby.timerSettings });
      } catch (err) {
        socket.emit('game_error', { message: (err as Error).message });
      }
    });

    on('update_jira_settings', ({ jiraSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const lobby = sessionManager.updateJiraSettings(playerId, jiraSettings);
        // Phase 42-02b row #20: lobby_updated -> session:settings_updated.
        emitFineGrained(lobby.id, 'session:settings_updated', { jiraSettings: lobby.jiraSettings });
      } catch (err) {
        socket.emit('game_error', { message: (err as Error).message });
      }
    });

    on('update_estimation_settings', ({ estimationSettings }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const lobby = sessionManager.updateEstimationSettings(playerId, estimationSettings);
        // Phase 42-02b row #21: lobby_updated -> session:settings_updated.
        // (42-02a designed this payload shape; this is its first emit site.)
        emitFineGrained(lobby.id, 'session:settings_updated', { estimationSettings: lobby.estimationSettings });
        gameLogger.info({ playerId, lobbyId: lobby.id }, 'Estimation settings updated');
      } catch (err) {
        socket.emit('game_error', { message: (err as Error).message });
      }
    });

    // Reconnection handler
    on('reconnect_with_token', (data) => { handleReconnectWithToken(socket, data, handlerDeps); });

    // Client heartbeat to prevent infrastructure timeouts (Cloudflare/Replit ~2min idle limit)
    on('client_heartbeat', () => {
      // Simply acknowledge - the act of receiving this message resets infrastructure idle timers
      const playerId = socket.data.playerId;
      if (playerId) {
        socketLogger.debug({ playerId }, 'Heartbeat received');
      }
    });

    // Handle missed events request (sequence gap recovery)
    on('request_missed_events', ({ lastSeq }) => {
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
    on('finalize_estimate', (data: { estimate: number }) => {
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
    on('use_ability', ({ abilityId }: { abilityId: string }) => {
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

    on('use_item', ({ itemType }: { itemType: string }) => {
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
    on('attack_minion', (data: { minionPlayerId: string }) => {
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

    socket.on('disconnect', (reason) => { handleDisconnect(socket, reason, handlerDeps); });
  });

  // Return both io and a cleanup function for graceful shutdown
  return {
    io,
    cleanup: () => {
      clearInterval(positionBatchInterval);
      clearInterval(websocketMetricsInterval);
      clearInterval(sessionDisconnectSweeperInterval);
      clearInterval(idleLobbyReaperInterval);
      eventBus.off('session:lobby_destroyed', lobbyDestroyedHandler);
      pendingPositionUpdates.clear();
    }
  };
}
