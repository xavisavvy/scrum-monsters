import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { LobbySnapshot, ReconnectResponse, LobbySync, ClientToServerEvents, ServerToClientEvents } from '@shared/gameEvents';

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
  
  // Core connection methods
  connect: () => void;
  disconnect: () => void;
  emit: <K extends keyof ClientToServerEvents>(event: K, data: Parameters<ClientToServerEvents[K]>[0]) => void;
  
  // Reconnection methods
  attemptReconnection: () => void;
  manualRetry: () => void;
  clearReconnectionState: () => void;
  storeLobbySnapshot: (snapshot: LobbySnapshot) => void;
}

// Reconnection token storage
const RECONNECT_TOKEN_KEY = 'scrum-monsters-reconnect-token';
const LOBBY_SNAPSHOT_KEY = 'scrum-monsters-lobby-snapshot';

const storeReconnectToken = (token: string) => {
  try {
    localStorage.setItem(RECONNECT_TOKEN_KEY, token);
  } catch (error) {
    console.warn('Failed to store reconnect token:', error);
  }
};

const getStoredReconnectToken = (): string | null => {
  try {
    return localStorage.getItem(RECONNECT_TOKEN_KEY);
  } catch (error) {
    console.warn('Failed to get stored reconnect token:', error);
    return null;
  }
};

const clearStoredReconnectToken = () => {
  try {
    localStorage.removeItem(RECONNECT_TOKEN_KEY);
  } catch (error) {
    console.warn('Failed to clear stored reconnect token:', error);
  }
};

export const useWebSocket = create<WebSocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  reconnection: {
    status: 'disconnected',
    attempt: 0,
    maxAttempts: 8, // Up to ~8.5 minutes of retries
    nextRetryIn: 0
  },
  lastLobbySnapshot: null,

  connect: () => {
    const socket = io(window.location.origin, {
      transports: ['websocket'],
      timeout: 10000, // 10 second timeout
      reconnection: false // Disable automatic reconnection, we handle it ourselves
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      set({ 
        isConnected: true,
        reconnection: {
          status: 'connected',
          attempt: 0,
          maxAttempts: 8,
          nextRetryIn: 0
        }
      });

      // Clear any existing retry timeout
      const { reconnection } = get();
      if (reconnection.retryTimeout) {
        clearTimeout(reconnection.retryTimeout);
      }

      // Attempt auto-reconnection if we have stored data
      const storedToken = getStoredReconnectToken();
      const { lastLobbySnapshot } = get();
      
      if (storedToken && lastLobbySnapshot) {
        console.log('🔄 Attempting auto-reconnection with stored token');
        socket.emit('reconnect_with_token', { reconnectToken: storedToken });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      set({ isConnected: false });
      
      // Only attempt reconnection for unexpected disconnects
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - don't retry
        set(state => ({
          reconnection: { ...state.reconnection, status: 'failed' }
        }));
      } else {
        // Network or client issue - attempt reconnection
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
      console.log('📥 Received lobby sync:', lobbySync);
      
      // Store new reconnect token
      storeReconnectToken(lobbySync.reconnectToken);
      
      // Update lobby snapshot
      const snapshot: LobbySnapshot = {
        lobby: lobbySync.lobby,
        player: lobbySync.yourPlayer,
        timestamp: Date.now(),
        reconnectToken: lobbySync.reconnectToken
      };
      get().storeLobbySnapshot(snapshot);
      
      // Clear reconnection state since we're successfully synced
      set(state => ({
        reconnection: { ...state.reconnection, status: 'connected', attempt: 0 }
      }));
    });

    socket.on('reconnect_response', (response: ReconnectResponse) => {
      console.log('🔄 Reconnection response:', response);
      
      if (response.result === 'success') {
        set(state => ({
          reconnection: { ...state.reconnection, status: 'connected', attempt: 0 }
        }));
      } else {
        console.error('Reconnection failed:', response.message);
        clearStoredReconnectToken();
        set(state => ({
          reconnection: { ...state.reconnection, status: 'failed' },
          lastLobbySnapshot: null
        }));
      }
    });

    socket.on('connection_lost', () => {
      console.log('🔌 Connection lost event received');
      set(state => ({
        reconnection: { ...state.reconnection, status: 'reconnecting' }
      }));
    });

    socket.on('reconnect_attempt', ({ attempt, maxAttempts, nextRetryIn }) => {
      console.log(`🔄 Reconnect attempt ${attempt}/${maxAttempts}, next retry in ${nextRetryIn}s`);
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

    set({ socket });
  },

  disconnect: () => {
    const { socket, reconnection } = get();
    
    // Clear any retry timeout
    if (reconnection.retryTimeout) {
      clearTimeout(reconnection.retryTimeout);
    }
    
    if (socket) {
      socket.disconnect();
      set({ 
        socket: null, 
        isConnected: false,
        reconnection: {
          status: 'disconnected',
          attempt: 0,
          maxAttempts: 8,
          nextRetryIn: 0
        }
      });
    }
    
    // Clear stored reconnection data
    clearStoredReconnectToken();
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

    console.log(`🔄 Scheduling reconnection attempt ${attempt}/${reconnection.maxAttempts} in ${nextRetryIn}s`);

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
      console.log(`🔄 Executing reconnection attempt ${attempt}`);
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
    const { reconnection } = get();
    
    if (reconnection.retryTimeout) {
      clearTimeout(reconnection.retryTimeout);
    }
    
    clearStoredReconnectToken();
    set({ 
      lastLobbySnapshot: null,
      reconnection: {
        status: 'disconnected',
        attempt: 0,
        maxAttempts: 8,
        nextRetryIn: 0
      }
    });
  },

  storeLobbySnapshot: (snapshot: LobbySnapshot) => {
    try {
      localStorage.setItem(LOBBY_SNAPSHOT_KEY, JSON.stringify(snapshot));
      set({ lastLobbySnapshot: snapshot });
    } catch (error) {
      console.warn('Failed to store lobby snapshot:', error);
    }
  },

  emit: (event, data) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn(`Cannot emit ${String(event)}: socket not connected`);
    }
  }
}));
