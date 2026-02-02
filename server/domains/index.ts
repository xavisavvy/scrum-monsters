/**
 * Domain Manager Barrel Export
 *
 * Central export point for all domain managers and their dependencies.
 * Provides shared infrastructure (eventBus) and domain manager instances.
 */

import { ScopedEventBus } from '../events';
import { SessionManager } from './SessionManager';
import { EstimationManager } from './EstimationManager';

// Create shared event bus instance
const eventBus = new ScopedEventBus();

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

// Export instances
export { eventBus, sessionManager, estimationManager };

// Re-export types
export type { SessionManager, SessionManagerDeps, CreateLobbyOptions } from './SessionManager';
export type { EstimationManager, EstimationManagerDeps } from './EstimationManager';

// Re-export errors
export * from '../errors/SessionErrors';
export * from '../errors/EstimationErrors';
