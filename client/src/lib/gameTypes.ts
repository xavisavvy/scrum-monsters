// Re-export shared types for client use
export * from '../../../shared/gameEvents.js';

// Client-specific types
export interface GameClient {
  socket: any;
  playerId?: string;
  lobbyId?: string;
  isConnected: boolean;
}

export interface AttackAnimation {
  id: string;
  playerId: string;
  damage: number;
  timestamp: number;
  x: number;
  y: number;
}

export interface SoundEffect {
  name: string;
  src: string;
  volume: number;
}
