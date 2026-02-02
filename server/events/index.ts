/**
 * Domain Event Infrastructure
 *
 * Internal event system for server-side cross-domain coordination.
 * This is separate from Socket.IO events which handle client-server communication.
 *
 * MEMORY LEAK PREVENTION:
 * Use ScopedEventBus.subscribeScoped() for lobby-specific listeners.
 * Always call cleanupScope(lobbyId) when a lobby is destroyed.
 *
 * Usage:
 *   import { ScopedEventBus, DomainEventMap } from './events';
 *   const eventBus = new ScopedEventBus();
 *   eventBus.subscribeScoped(lobbyId, 'estimation:vote_cast', (payload) => { ... });
 *   // When lobby destroyed:
 *   eventBus.cleanupScope(lobbyId);
 */

export { EventBus } from './EventBus';
export type { DomainEventListener } from './EventBus';
export { ScopedEventBus } from './ScopedEventBus';
export { LobbyEventSequencer } from './LobbyEventSequencer';
export type { BufferedEvent } from './LobbyEventSequencer';
export { ClientEventEmitter, createClientEventEmitter } from './ClientEventEmitter';
export type { ClientEventEmitterDeps } from './ClientEventEmitter';
export type { DomainEventMap, DomainEventName } from './eventTypes';

// Re-export individual payload types for consumers who need them
export type {
  // Session events
  SessionPlayerJoinedPayload,
  SessionPlayerLeftPayload,
  SessionPlayerDisconnectedPayload,
  SessionHostChangedPayload,
  SessionPhaseChangedPayload,
  SessionLobbyDestroyedPayload,
  // Estimation events
  EstimationVoteCastPayload,
  EstimationVoteChangedPayload,
  EstimationConsensusReachedPayload,
  EstimationFullConsensusReachedPayload,
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
  CombatBattleInitializedPayload,
  CombatPlayerEnteredBattlePayload,
  CombatBossEnragedPayload,
  CombatBossTelegraphPayload,
  CombatRevivalStartedPayload,
  CombatRevivalCancelledPayload,
  CombatPlayerPermanentlyDownedPayload,
  CombatCleanupCompletePayload,
  CombatPlayerHealedPayload,
  CombatTeamAttackPayload,
  // Minion types and events
  MinionState,
  CombatMinionSpawnedPayload,
  CombatMinionAttackPayload,
  CombatMinionHealBossPayload,
  // System events
  TransitionRejectedPayload,
} from './eventTypes';
