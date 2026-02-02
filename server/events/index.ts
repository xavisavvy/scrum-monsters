/**
 * Domain Event Infrastructure
 *
 * Internal event system for server-side cross-domain coordination.
 * This is separate from Socket.IO events which handle client-server communication.
 *
 * The domain event system enables loose coupling between domain managers:
 * - SessionManager can emit session:* events without knowing who listens
 * - EstimationManager can emit estimation:* events for combat coordination
 * - CombatManager can react to estimation events without tight coupling
 *
 * Usage:
 *   import { EventBus, DomainEventMap, DomainEventName } from './events';
 *
 *   const eventBus = new EventBus();
 *
 *   // Type-safe event subscription
 *   eventBus.on('estimation:vote_cast', (payload) => {
 *     console.log(`${payload.playerId} voted ${payload.vote}`);
 *   });
 *
 *   // Type-safe event emission
 *   eventBus.emit('estimation:vote_cast', {
 *     lobbyId: 'lobby-123',
 *     playerId: 'player-456',
 *     vote: 5,
 *     team: 'developers'
 *   });
 */

export { EventBus, DomainEventListener } from './EventBus';
export { DomainEventMap, DomainEventName } from './eventTypes';

// Re-export individual payload types for consumers who need them
export type {
  // Session events
  SessionPlayerJoinedPayload,
  SessionPlayerLeftPayload,
  SessionHostChangedPayload,
  SessionPhaseChangedPayload,
  SessionLobbyDestroyedPayload,
  // Estimation events
  EstimationVoteCastPayload,
  EstimationVoteChangedPayload,
  EstimationConsensusReachedPayload,
  EstimationVotingStartedPayload,
  EstimationVotingTimeoutPayload,
  // Combat events
  CombatBossDamagedPayload,
  CombatBossHealedPayload,
  CombatBossDefeatedPayload,
  CombatPlayerDamagedPayload,
  CombatPlayerDownedPayload,
  CombatPlayerRevivedPayload,
  CombatBattleStartedPayload,
  CombatModifierUpdatedPayload,
  // System events
  TransitionRejectedPayload,
} from './eventTypes';
