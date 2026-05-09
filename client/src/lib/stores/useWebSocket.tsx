import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { LobbySnapshot, ReconnectResponse, LobbySync, ClientToServerEvents, ServerToClientEvents } from '@shared/gameEvents';
import { useProgression } from './useProgression';
import { useClassMastery } from './useClassMastery';
import { useGameState } from './useGameState';
import { toast } from 'sonner';
import {
  loadSession,
  saveSession,
  clearSession,
  decodeReconnectToken,
  RECONNECT_TOKEN_KEY,
  LOBBY_SNAPSHOT_KEY,
} from '@/lib/utils/sessionStorage';

// Re-export the storage keys so any external importer that previously read
// them off useWebSocket.tsx continues to work without modification.
export { RECONNECT_TOKEN_KEY, LOBBY_SNAPSHOT_KEY };

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

interface ReconnectionState {
  status: ConnectionStatus;
  attempt: number;
  maxAttempts: number;
  nextRetryIn: number; // seconds
  retryTimeout?: NodeJS.Timeout;
  graceExpiresAt?: number; // timestamp
}

interface WebSocketState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  isConnected: boolean;
  reconnection: ReconnectionState;
  lastLobbySnapshot: LobbySnapshot | null;
  heartbeatInterval: NodeJS.Timeout | null; // Keeps connection alive against infrastructure timeouts

  // Core connection methods
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data?: any) => void;

  // Reconnection methods
  attemptReconnection: () => void;
  manualRetry: () => void;
  clearReconnectionState: () => void;
  storeLobbySnapshot: (snapshot: LobbySnapshot) => void;
  getReconnectToken: () => string | null;
  reconnectToLobby: (expectedLobbyId?: string) => boolean; // Returns true if reconnect attempt was made
}

// Module-level visibility handler reference for cleanup
let visibilityHandler: (() => void) | null = null;

// Token-only read helper kept for back-compat (getReconnectToken consumers).
// All session writes go through saveSession (atomic three-key write); the legacy
// per-key helpers were removed in Phase 41-01.
const getStoredReconnectToken = (): string | null => {
  try {
    return localStorage.getItem(RECONNECT_TOKEN_KEY);
  } catch {
    return null;
  }
};

/**
 * Lazy initializer for `lastLobbySnapshot`. On cold mount, read all three
 * session keys; if coherent, hydrate from the stored snapshot. If incoherent
 * (drift, missing key, mismatched lobbyId, corrupted JSON), clear all three
 * so the next reconnect attempt starts from a clean slate.
 */
const initialLobbySnapshot = (): LobbySnapshot | null => {
  try {
    const session = loadSession();
    if (session.coherent && session.snapshot) {
      return session.snapshot;
    }
    if (session.lastLobby || session.snapshot || session.token) {
      // Partial / drifted state — wipe so we don't try to reconnect with it.
      clearSession();
    }
  } catch {
    // Defensive: never block module init on a localStorage read.
  }
  return null;
};

export const useWebSocket = create<WebSocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  reconnection: {
    status: 'disconnected',
    attempt: 0,
    maxAttempts: 12, // Up to ~13 minutes of retries
    nextRetryIn: 0
  },
  lastLobbySnapshot: initialLobbySnapshot(),
  heartbeatInterval: null,

  connect: () => {
    // Clean up existing socket if any
    const existingSocket = get().socket;
    if (existingSocket) {
      // Clean up existing socket before reconnection
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
    }
    
    // Clear any existing heartbeat
    const existingHeartbeat = get().heartbeatInterval;
    if (existingHeartbeat) {
      clearInterval(existingHeartbeat);
      set({ heartbeatInterval: null });
    }

    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'], // Allow fallback to polling if WebSocket unavailable
      timeout: 45000,
      reconnection: false, // Disable automatic reconnection, we handle it ourselves
      path: '/socket.io/',
      upgrade: true, // Allow upgrading transport
      rememberUpgrade: true, // Remember successful upgrade
      // Increase ping/pong timeout to match server
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      forceNew: false,
    });

    socket.on('connect', () => {
      // Connected to server successfully
      set({
        isConnected: true,
        reconnection: {
          status: 'connected',
          attempt: 0,
          maxAttempts: 12,
          nextRetryIn: 0
        }
      });

      // Clear any existing retry timeout
      const { reconnection } = get();
      if (reconnection.retryTimeout) {
        clearTimeout(reconnection.retryTimeout);
      }

      // Start heartbeat to prevent infrastructure timeouts (~2min idle limit on proxies)
      const { heartbeatInterval } = get();
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      const newHeartbeat = setInterval(() => {
        socket.emit('client_heartbeat' as any);
      }, 25000); // Every 25 seconds - office networks often have 30-60s proxy timeouts
      set({ heartbeatInterval: newHeartbeat });

      // Attempt auto-reconnection if we have a coherent stored session.
      // The snapshot is hydrated from localStorage on cold load (no longer
      // null), and we route through reconnectToLobby with the snapshot's
      // lobbyId as the guard so the token cannot mis-target.
      const { lastLobbySnapshot } = get();
      if (lastLobbySnapshot) {
        get().reconnectToLobby(lastLobbySnapshot.lobby.id);
      }
    });

    socket.on('disconnect', (reason) => {
      // Disconnected from server

      // Clear heartbeat when disconnected
      const { heartbeatInterval } = get();
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        set({ heartbeatInterval: null });
      }

      set({ isConnected: false });

      // Check if this disconnect is from a planned server shutdown
      const currentReconnection = get().reconnection;
      if (currentReconnection.graceExpiresAt && Date.now() < currentReconnection.graceExpiresAt) {
        // Planned shutdown - don't trigger reconnection, it's already scheduled
        return;
      }

      // Only attempt reconnection for unexpected disconnects
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - don't retry
        set(state => ({
          reconnection: { ...state.reconnection, status: 'failed' }
        }));
      } else if (reason === 'transport close' || reason === 'transport error' || reason === 'ping timeout') {
        // Network issues - always retry
        const { attemptReconnection } = get();
        attemptReconnection();
      } else {
        // Other client issues - attempt reconnection
        const { attemptReconnection } = get();
        attemptReconnection();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      set({ isConnected: false });
      
      const { attemptReconnection } = get();
      attemptReconnection();
    });

    // Reconnection event handlers
    socket.on('lobby_sync', (lobbySync: LobbySync) => {
      // Atomically write all three session keys so they cannot drift.
      const snapshot: LobbySnapshot = {
        lobby: lobbySync.lobby,
        player: lobbySync.yourPlayer,
        timestamp: Date.now(),
        reconnectToken: lobbySync.reconnectToken,
      };
      saveSession({
        lobbyId: lobbySync.lobby.id,
        lobbyName: lobbySync.lobby.name,
        playerName: lobbySync.yourPlayer.name,
        snapshot,
        token: lobbySync.reconnectToken,
      });
      set({ lastLobbySnapshot: snapshot });

      // Clear reconnection state since we're successfully synced
      set(state => ({
        reconnection: { ...state.reconnection, status: 'connected', attempt: 0 }
      }));
    });

    socket.on('reconnect_response', (response: ReconnectResponse) => {
      if (response.result === 'success') {
        set(state => ({
          reconnection: { ...state.reconnection, status: 'connected', attempt: 0 }
        }));
        toast.info('Reconnected!', {
          description: 'You have rejoined the session',
          duration: 2500,
          id: 'reconnected',
        });
      } else {
        // All failure results (invalid_token, grace_expired, server_error,
        // lobby_closed, lobby_not_found) clear the full session so the three
        // localStorage keys cannot drift apart on the next attempt.
        //
        // Phase 44 (CONTEXT.md "Active-game interruption is ACCEPTED"):
        // After a blue-green deploy swap, the new color has empty in-process
        // SessionManager Maps so reconnect_with_token resolves to one of these
        // failure modes. Surface a user-visible toast (not a silent clear) so
        // the user understands why their lobby evaporated and routes cleanly
        // back to /play. id 'reconnect-stale' makes the toast idempotent
        // against sonner's duplicate-suppression.
        console.error('Reconnection failed:', response.message);
        toast.warning('Lobby session ended', {
          description: 'Your previous lobby is no longer available. Start or join a new one.',
          id: 'reconnect-stale',
          duration: 5000,
        });
        clearSession();
        set(state => ({
          reconnection: { ...state.reconnection, status: 'failed' },
          lastLobbySnapshot: null
        }));
      }
    });

    socket.on('connection_lost', () => {
      set(state => ({
        reconnection: { ...state.reconnection, status: 'reconnecting' }
      }));
    });

    socket.on('server_shutdown', (data: { message: string; reconnectDelayMs: number }) => {
      // Show user-facing notification with shutdown info
      toast.warning(data.message || 'Server shutting down for maintenance', {
        duration: data.reconnectDelayMs || 30000,
        description: `The server will be back shortly. Auto-reconnect in ${Math.round((data.reconnectDelayMs || 30000) / 1000)} seconds.`,
        id: 'server-shutdown', // Prevent duplicate toasts
      });

      // Set a special state to suppress automatic reconnection attempts
      // The disconnect event will fire after this, but we don't want it to trigger
      // the normal reconnection flow since this is a planned shutdown
      set(state => ({
        reconnection: {
          ...state.reconnection,
          status: 'disconnected',
          graceExpiresAt: Date.now() + (data.reconnectDelayMs || 30000),
        }
      }));

      // Schedule a reconnection after the server's suggested delay
      const reconnectTimeout = setTimeout(() => {
        const { connect: reconnect } = get();
        reconnect();
      }, data.reconnectDelayMs || 30000);

      // Store timeout so it can be cleared on manual disconnect
      set(state => ({
        reconnection: {
          ...state.reconnection,
          retryTimeout: reconnectTimeout,
        }
      }));
    });

    socket.on('reconnect_attempt', ({ attempt, maxAttempts, nextRetryIn }) => {
      set(state => ({
        reconnection: {
          ...state.reconnection,
          attempt,
          maxAttempts,
          nextRetryIn,
          status: 'reconnecting'
        }
      }));
    });

    // Progression event handlers
    socket.on('progression:xp_awarded', (data: any) => {
      const { currentPlayer } = useGameState.getState();
      if (data.playerId === currentPlayer?.id) {
        useProgression.getState().handleXPAwarded({
          playerId: data.playerId,
          amount: data.amount,
          source: data.source,
          newTotal: data.newTotal,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    socket.on('progression:level_up', (data: any) => {
      const { currentPlayer } = useGameState.getState();
      if (data.playerId === currentPlayer?.id) {
        useProgression.getState().handleLevelUp({
          playerId: data.playerId,
          oldLevel: data.oldLevel,
          newLevel: data.newLevel,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    socket.on('progression:sync', (data: any) => {
      const { currentPlayer } = useGameState.getState();
      if (data.playerId === currentPlayer?.id) {
        useProgression.getState().handleSync({
          playerId: data.playerId,
          totalXP: data.totalXP,
          currentLevel: data.currentLevel,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    // Class mastery event handlers
    socket.on('class_mastery:xp_awarded', (data: any) => {
      const { currentPlayer } = useGameState.getState();
      if (currentPlayer && data.playerId === currentPlayer.id) {
        useClassMastery.getState().handleXPAwarded(data);
      }
    });

    socket.on('class_mastery:tier_up', (data: any) => {
      const { currentPlayer } = useGameState.getState();
      if (currentPlayer && data.playerId === currentPlayer.id) {
        useClassMastery.getState().handleTierUp(data);
      }
    });

    socket.on('class_mastery:sync', (data: any) => {
      const { currentPlayer } = useGameState.getState();
      if (currentPlayer && data.playerId === currentPlayer.id) {
        useClassMastery.getState().handleSync(data);
      }
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket, reconnection, heartbeatInterval } = get();
    
    // Clear any retry timeout
    if (reconnection.retryTimeout) {
      clearTimeout(reconnection.retryTimeout);
    }
    
    // Clear heartbeat
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    // Remove visibility handler
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    
    if (socket) {
      socket.disconnect();
      set({ 
        socket: null, 
        isConnected: false,
        heartbeatInterval: null,
        reconnection: {
          status: 'disconnected',
          attempt: 0,
          maxAttempts: 8,
          nextRetryIn: 0
        }
      });
    }
    
    // Clear stored reconnection data atomically.
    clearSession();
    set({ lastLobbySnapshot: null });
  },

  attemptReconnection: () => {
    const { reconnection, socket } = get();
    
    if (reconnection.status === 'reconnecting' || reconnection.attempt >= reconnection.maxAttempts) {
      return;
    }

    const attempt = reconnection.attempt + 1;
    const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 30000); // Exponential backoff, max 30s
    const nextRetryIn = Math.floor(delay / 1000);

    set(state => ({
      reconnection: {
        ...state.reconnection,
        status: 'reconnecting',
        attempt,
        nextRetryIn
      }
    }));

    const retryTimeout = setTimeout(() => {
      const { connect } = get();
      connect();
    }, delay);

    set(state => ({
      reconnection: { ...state.reconnection, retryTimeout }
    }));
  },

  manualRetry: () => {
    const { reconnection } = get();
    
    // Clear any existing timeout
    if (reconnection.retryTimeout) {
      clearTimeout(reconnection.retryTimeout);
    }
    
    // Reset attempt counter for manual retry
    set(state => ({
      reconnection: { 
        ...state.reconnection, 
        attempt: 0, 
        status: 'reconnecting',
        retryTimeout: undefined 
      }
    }));
    
    // Attempt immediate reconnection
    const { connect } = get();
    connect();
  },

  clearReconnectionState: () => {
    const { reconnection, heartbeatInterval } = get();
    
    if (reconnection.retryTimeout) {
      clearTimeout(reconnection.retryTimeout);
    }
    
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    clearSession();
    set({
      lastLobbySnapshot: null,
      heartbeatInterval: null,
      reconnection: {
        status: 'disconnected',
        attempt: 0,
        maxAttempts: 8,
        nextRetryIn: 0
      }
    });
  },

  storeLobbySnapshot: (snapshot: LobbySnapshot) => {
    // Thin wrapper retained for back-compat. Delegates to atomic saveSession
    // when token is available; otherwise stores the snapshot wrapper directly
    // so the lobbyId is still recoverable on read.
    try {
      const token = getStoredReconnectToken() ?? snapshot.reconnectToken;
      saveSession({
        lobbyId: snapshot.lobby.id,
        lobbyName: snapshot.lobby.name,
        playerName: snapshot.player.name,
        snapshot,
        token,
      });
      set({ lastLobbySnapshot: snapshot });
    } catch (error) {
      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.warn('Failed to store lobby snapshot:', error);
      }
    }
  },

  emit: (event, data?) => {
    const { socket } = get();
    if (socket && socket.connected) {
      if (data !== undefined) {
        socket.emit(event as any, data);
      } else {
        socket.emit(event as any);
      }
    } else {
      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.warn(`Cannot emit ${String(event)}: socket not connected (socket: ${!!socket}, connected: ${socket?.connected})`);
      }
    }
  },

  getReconnectToken: () => {
    return getStoredReconnectToken();
  },

  reconnectToLobby: (expectedLobbyId?: string) => {
    const { socket } = get();
    const token = getStoredReconnectToken();

    if (!socket || !socket.connected || !token) {
      return false;
    }

    // LobbyId guard: if the caller knows which lobby it expects to rejoin
    // (e.g., the route's :lobbyId param), refuse to emit a token whose
    // payload's lobbyId disagrees. This prevents the wrong-lobby-rejoin
    // attempt that produced the duplicate-self / lost-host symptoms in
    // Phase 41 — see 41-RESEARCH.md.
    if (expectedLobbyId) {
      const decoded = decodeReconnectToken(token);
      if (!decoded || decoded.lobbyId !== expectedLobbyId) {
        clearSession();
        set({ lastLobbySnapshot: null });
        return false;
      }
    }

    socket.emit('reconnect_with_token', { reconnectToken: token });
    return true;
  }
}));
