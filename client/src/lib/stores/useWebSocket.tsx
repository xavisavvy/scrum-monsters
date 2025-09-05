import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '../gameTypes';

interface WebSocketState {
  socket: Socket<ServerEvents, ClientEvents> | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  emit: <K extends keyof ClientEvents>(event: K, data: ClientEvents[K]) => void;
}

export const useWebSocket = create<WebSocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connect: () => {
    const socket = io(window.location.origin, {
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      set({ isConnected: false });
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      set({ isConnected: false });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  emit: (event, data) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
  }
}));
