/**
 * Extracted socket handler functions (MAINT-03)
 *
 * Standalone functions for create_lobby, reconnect_with_token, and disconnect.
 * Extracted from setupWebSocket so they can be unit-tested via makeMockSocket
 * without a live Socket.IO server.
 *
 * These are called from setupWebSocket with the same deps they previously
 * closed over — production behavior is byte-identical.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '../shared/gameEvents.js';
import { socketLogger } from './logger.js';
import {
  getClientEventEmitter,
  SessionError,
} from './domains/index.js';
import { GameStateManager } from './gameState.js';
import { redactLobbyForWire } from './events/ClientEventEmitter.js';
import { updateWebsocketMetrics } from './metrics.js';
import type { SessionManager } from './domains/SessionManager.js';
import type { ProgressionManager } from './domains/ProgressionManager.js';
import type { ClassMasteryManager } from './domains/ClassMasteryManager.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, {
  playerId?: string;
  lobbyId?: string;
  userId?: number;
  username?: string;
}>;

export interface HandlerDeps {
  gameState: GameStateManager;
  io: SocketIOServer;
  sessionManager: SessionManager;
  progressionManager: ProgressionManager;
  classMasteryManager: ClassMasteryManager;
  registerPlayerUserId: (playerId: string, userId: number) => void;
  activeConnections: { value: number };
  disconnectReasons: Map<string, number>;
}

// ---------------------------------------------------------------------------
// create_lobby handler
// ---------------------------------------------------------------------------

export async function handleCreateLobby(
  socket: AppSocket,
  data: { lobbyName: string; hostName: string; initialSettings?: unknown },
  deps: HandlerDeps,
): Promise<void> {
  const { lobbyName, hostName, initialSettings } = data;
  try {
    const lobby = deps.sessionManager.createLobby(
      hostName,
      lobbyName,
      initialSettings as Parameters<SessionManager['createLobby']>[2],
    );

    // Sync player-lobby mapping to gameState for battle functions
    deps.gameState.syncPlayerToLobby(lobby.hostId, lobby);

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
    const reconnectToken = deps.sessionManager.generateReconnectToken(lobby.hostId, lobby.id, hostName);

    socket.emit('lobby_created', { lobby, inviteLink });
    socket.emit('lobby_sync', {
      lobby,
      yourPlayer: lobby.players[0],
      reconnectToken,
      pendingActions: {},
      stateChanges: {},
    });

    // Register player-user mapping and emit progression sync for authenticated users
    if (socket.data.userId) {
      deps.registerPlayerUserId(lobby.hostId, socket.data.userId);
      (async () => {
        try {
          await deps.progressionManager.loadPlayerXP(lobby.id, lobby.hostId, socket.data.userId!);
          const totalXP = deps.progressionManager.getPlayerXP(lobby.id, lobby.hostId);
          const currentLevel = deps.progressionManager.getPlayerLevel(lobby.id, lobby.hostId);
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
          await deps.classMasteryManager.loadAllClassMastery(lobby.id, lobby.hostId, socket.data.userId!);
          // Build mastery data from loaded state
          const masteryData = deps.classMasteryManager.getAllMasteryData(lobby.id, lobby.hostId);
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
      socket.emit('game_error', { message: (error as Error).message });
    } else {
      socket.emit('game_error', { message: 'Failed to create lobby' });
    }
  }
}

// ---------------------------------------------------------------------------
// reconnect_with_token handler
// ---------------------------------------------------------------------------

export async function handleReconnectWithToken(
  socket: AppSocket,
  data: { reconnectToken: string },
  deps: HandlerDeps,
): Promise<void> {
  const { reconnectToken } = data;
  try {
    const response = deps.sessionManager.attemptPlayerReconnect(reconnectToken);

    if (response.result === 'success' && response.lobbySync) {
      const { lobbySync } = response;
      const playerId = lobbySync.yourPlayer.id;
      const lobbyId = lobbySync.lobby.id;

      // Sync player-lobby mapping to gameState for battle functions
      deps.gameState.syncPlayerToLobby(playerId, lobbySync.lobby);

      // Update socket data
      socket.data.playerId = playerId;
      socket.data.lobbyId = lobbyId;

      // Join socket room
      socket.join(lobbyId);

      // Send successful reconnection response. Redact secret vote values
      // from the synced lobby during pre-reveal phases — both `lobby_sync`
      // and the `lobbySync` nested in `reconnect_response` carry the full
      // lobby on the wire, so both must be redacted (Security fix H-3).
      const wireSync = { ...lobbySync, lobby: redactLobbyForWire(lobbySync.lobby) };
      socket.emit('lobby_sync', wireSync);
      socket.emit('reconnect_response', { ...response, lobbySync: wireSync });

      // Reinitialize fine-grained event sequence for reconnected player
      const emitter = getClientEventEmitter();
      emitter.sendFullState(lobbyId, lobbySync.lobby, socket.id);

      // Register player-user mapping and emit progression sync for authenticated users
      if (socket.data.userId) {
        deps.registerPlayerUserId(playerId, socket.data.userId);
        (async () => {
          try {
            await deps.progressionManager.loadPlayerXP(lobbyId, playerId, socket.data.userId!);
            const totalXP = deps.progressionManager.getPlayerXP(lobbyId, playerId);
            const currentLevel = deps.progressionManager.getPlayerLevel(lobbyId, playerId);
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
            await deps.classMasteryManager.loadAllClassMastery(lobbyId, playerId, socket.data.userId!);
            // Build mastery data from loaded state
            const masteryData = deps.classMasteryManager.getAllMasteryData(lobbyId, playerId);
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
      message: 'Server error during reconnection',
    });
  }
}

// ---------------------------------------------------------------------------
// disconnect handler
// ---------------------------------------------------------------------------

export function handleDisconnect(
  socket: AppSocket,
  reason: string,
  deps: HandlerDeps,
): void {
  deps.activeConnections.value--;
  const playerId = socket.data.playerId;
  const lobbyId = socket.data.lobbyId;

  // Update Prometheus WebSocket connection gauge
  updateWebsocketMetrics(deps.io);

  // Track disconnect reasons for monitoring
  deps.disconnectReasons.set(reason, (deps.disconnectReasons.get(reason) || 0) + 1);

  // Enhanced logging for host disconnects
  const lobby = lobbyId ? deps.sessionManager.getLobby(lobbyId) : null;
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
    activeConnections: deps.activeConnections.value,
  }, 'Player disconnected');

  if (playerId) {
    // Use SessionManager reconnection system
    const disconnectResult = deps.sessionManager.handlePlayerDisconnect(playerId);
    if (disconnectResult && lobbyId) {
      const { disconnectedPlayer, hostTransfer } = disconnectResult;

      // Phase 45-03: legacy `player_disconnected` emit removed (no client listener).
      // Player remains in lobby during grace; the players[].isConnected
      // flag (set elsewhere) drives any visual dim.

      const graceMinutes = Math.floor((disconnectedPlayer.graceExpiresAt - Date.now()) / 60000);
      socketLogger.info({
        playerId,
        playerName: disconnectedPlayer.playerName,
        graceMinutes,
      }, 'Player can reconnect during grace period');

      // Phase 41-02: host transfer is now deferred until grace expiry
      // (see SessionManager.processDisconnectedPlayers + the
      // sessionDisconnectSweeper interval above). hostTransfer is always
      // undefined on the disconnect path post-Phase-41-02; this branch is
      // retained as a no-op safety net for any future code path that
      // re-introduces immediate transfer.
      if (hostTransfer) {
        deps.io.to(lobbyId).emit('host_transferred', {
          oldHostId: hostTransfer.oldHostId,
          newHostId: hostTransfer.newHostId,
          newHostName: hostTransfer.newHostName,
          reason: 'Host disconnected',
        });

        // Phase 42-02b row #23: lobby_updated removed;
        // host_transferred above is the canonical signal.
        socketLogger.info({
          oldHostId: hostTransfer.oldHostId,
          newHostId: hostTransfer.newHostId,
          newHostName: hostTransfer.newHostName,
        }, 'Host transferred due to disconnect');
      }
    } else {
      // Fallback to old behavior if reconnection setup fails
      const updatedLobby = deps.sessionManager.removePlayer(playerId);
      if (updatedLobby && lobbyId) {
        // Phase 45-03: legacy `player_disconnected` emit removed (no client listener).
        // session:player_left fires from sessionManager.removePlayer above.
      }
      socketLogger.warn({ playerId }, 'Player removed immediately (reconnection unavailable)');
    }
  }
}
