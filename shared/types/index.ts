/**
 * Domain State Types
 *
 * These types represent the three separated domains that replace
 * the monolithic Lobby type:
 * - SessionState: Lobby lifecycle, players, host management
 * - EstimationState: Voting, consensus, discussion
 * - CombatState: Boss battles, player health, positions
 *
 * Each domain stores IDs to reference other domains (not embedded objects).
 * This enables domain isolation and future domain manager separation.
 */

export { SessionState } from './SessionState';
export { EstimationState } from './EstimationState';
export { CombatState } from './CombatState';
