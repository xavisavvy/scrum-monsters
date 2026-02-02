/**
 * Domain Manager Barrel Export
 *
 * Central export point for all domain managers and their dependencies.
 * Provides shared infrastructure (eventBus) and domain manager instances.
 */

import { ScopedEventBus } from '../events';
import { SessionManager } from './SessionManager';

// Create shared event bus instance
const eventBus = new ScopedEventBus();

// Create domain manager instances
const sessionManager = new SessionManager({ eventBus });

// Export instances
export { eventBus, sessionManager };

// Re-export types
export type { SessionManager, SessionManagerDeps, CreateLobbyOptions } from './SessionManager';

// Re-export errors
export * from '../errors/SessionErrors';
