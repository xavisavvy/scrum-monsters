/**
 * Domain Manager Barrel Export
 *
 * Central export point for all domain managers and their dependencies.
 * Provides shared infrastructure (eventBus) and domain manager instances.
 */

import { ScopedEventBus } from '../events';
import { LobbyEventSequencer, createClientEventEmitter, ClientEventEmitter } from '../events';
import { SessionManager } from './SessionManager';
import { EstimationManager } from './EstimationManager';
import { CombatManager } from './CombatManager';
import { ProgressionManager } from './ProgressionManager';
import { Server } from 'socket.io';

// Create shared event bus instance
const eventBus = new ScopedEventBus();

// Create sequencer for event ordering
const lobbyEventSequencer = new LobbyEventSequencer();

// ClientEventEmitter will be initialized when io is available
let clientEventEmitter: ClientEventEmitter | null = null;

// Function to initialize ClientEventEmitter (called from websocket.ts after io is created)
export function initializeClientEventEmitter(io: Server): ClientEventEmitter {
  if (clientEventEmitter) {
    return clientEventEmitter;
  }

  clientEventEmitter = createClientEventEmitter({
    io,
    eventBus,
    sequencer: lobbyEventSequencer
  });

  return clientEventEmitter;
}

// Getter for clientEventEmitter (throws if not initialized)
export function getClientEventEmitter(): ClientEventEmitter {
  if (!clientEventEmitter) {
    throw new Error('ClientEventEmitter not initialized. Call initializeClientEventEmitter first.');
  }
  return clientEventEmitter;
}

// Create domain manager instances with shared eventBus
const sessionManager = new SessionManager({ eventBus });
const estimationManager = new EstimationManager({
  eventBus,
  // Provide team lookup callback
  getPlayerTeam: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.team ?? null;
  }
});
const combatManager = new CombatManager({
  eventBus,
  // Provide team lookup callback
  getPlayerTeam: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.team ?? null;
  },
  // Provide class lookup callback
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  }
});
const progressionManager = new ProgressionManager({
  eventBus,
  // Provide active players callback for consensus XP awards
  getActivePlayers: (lobbyId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    return lobby.players.map(p => p.id);
  },
});

// Export instances
export { eventBus, sessionManager, estimationManager, combatManager, progressionManager };

// Export sequencer for testing if needed
export { lobbyEventSequencer };

// Re-export types
export type { SessionManager, SessionManagerDeps, CreateLobbyOptions } from './SessionManager';
export type { EstimationManager, EstimationManagerDeps } from './EstimationManager';
export type { CombatManager, CombatManagerDeps } from './CombatManager';
export type { ProgressionManager, ProgressionManagerDeps } from './ProgressionManager';

// Re-export errors
export * from '../errors/SessionErrors';
export * from '../errors/EstimationErrors';
export * from '../errors/CombatErrors';
