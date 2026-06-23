/**
 * Domain Event Type Definitions
 *
 * This file defines the INTERNAL domain events for server-side coordination.
 * These events are NOT Socket.IO events for client-server communication.
 *
 * Domain events enable cross-domain coordination without tight coupling:
 * - SessionManager emits session:* events when players join/leave/phase changes
 * - EstimationManager emits estimation:* events during voting
 * - CombatManager emits combat:* events during battles
 *
 * Event naming convention: domain:action (e.g., estimation:vote_cast)
 */

import { GamePhase, TeamType, AvatarClass, CompletedTicket } from '../../shared/gameEvents';
import type {
  ProgressionXPAwardedPayload,
  ProgressionLevelUpPayload,
} from '../../shared/progressionTypes';
import type {
  ClassMasteryXPAwardedPayload,
  ClassMasteryTierUpPayload,
} from '../../shared/classMasteryTypes';
import type {
  AbilityUsedPayload as AbilityUsedPayloadImport,
  AbilityCooldownStartedPayload as AbilityCooldownStartedPayloadImport,
  AbilityEffectAppliedPayload as AbilityEffectAppliedPayloadImport,
} from '../../shared/abilityTypes';
import type {
  ComboTriggeredPayload as ComboTriggeredPayloadImport,
  ConsensusUltimatePayload as ConsensusUltimatePayloadImport,
} from '../../shared/comboTypes';
import type {
  ItemAwardedPayload as ItemAwardedPayloadImport,
  ItemUsedPayload as ItemUsedPayloadImport,
  ItemEffectAppliedPayload as ItemEffectAppliedPayloadImport,
} from '../../shared/itemTypes';
import type {
  StatsSessionCompletePayload,
} from '../../shared/statsTypes';

// Re-export ability types for server event usage
export type AbilityUsedPayload = AbilityUsedPayloadImport;
export type AbilityCooldownStartedPayload = AbilityCooldownStartedPayloadImport;
export type AbilityEffectAppliedPayload = AbilityEffectAppliedPayloadImport;

// Re-export combo types for server event usage
export type ComboTriggeredPayload = ComboTriggeredPayloadImport;
export type ConsensusUltimatePayload = ConsensusUltimatePayloadImport;

// Re-export item types for server event usage
export type ItemAwardedPayload = ItemAwardedPayloadImport;
export type ItemUsedPayload = ItemUsedPayloadImport;
export type ItemEffectAppliedPayload = ItemEffectAppliedPayloadImport;

// Re-export stats types for server event usage
export type { StatsSessionCompletePayload } from '../../shared/statsTypes';

// =============================================================================
// Session Domain Events
// =============================================================================

/** Emitted when a player joins a lobby */
export interface SessionPlayerJoinedPayload {
  lobbyId: string;
  playerId: string;
  playerName: string;
  /** Player's initial team. Required so clients can place the player in
   * the right Battle Teams panel without waiting for a follow-up event. */
  team: TeamType;
  /** Player's initial avatar/class (optional — set later via select_avatar). */
  avatar?: AvatarClass;
}

/** Emitted when a player leaves a lobby (disconnect or explicit leave) */
export interface SessionPlayerLeftPayload {
  lobbyId: string;
  playerId: string;
}

/** Emitted when host transfers to another player */
export interface SessionHostChangedPayload {
  lobbyId: string;
  oldHostId: string;
  newHostId: string;
}

/** Emitted when deferred host transfer completes (grace period expiry path) */
export interface SessionHostTransferredPayload {
  lobbyId: string;
  oldHostId: string;
  newHostId: string;
  newHostName: string;
}

/** Emitted when game phase transitions */
export interface SessionPhaseChangedPayload {
  lobbyId: string;
  oldPhase: GamePhase;
  newPhase: GamePhase;
  completedTickets?: CompletedTicket[];
}

/** Emitted when a lobby is destroyed (all players left or host closed) */
export interface SessionLobbyDestroyedPayload {
  lobbyId: string;
}

/** Emitted when a player disconnects (starts grace period) */
export interface SessionPlayerDisconnectedPayload {
  lobbyId: string;
  playerId: string;
  disconnectedAt: number;
  graceExpiresAt: number;
}

/** Emitted when a player changes their team */
export interface SessionTeamChangedPayload {
  lobbyId: string;
  playerId: string;
  oldTeam: TeamType;
  newTeam: TeamType;
}

// =============================================================================
// Estimation Domain Events
// =============================================================================

/** Emitted when a player casts their vote */
export interface EstimationVoteCastPayload {
  lobbyId: string;
  playerId: string;
  vote: number | '?';
  team: TeamType;
}

/** Emitted when a player changes their existing vote */
export interface EstimationVoteChangedPayload {
  lobbyId: string;
  playerId: string;
  team: TeamType;
  oldVote?: number | '?';
  newVote: number | '?';
}

/** Emitted when all members of one or more teams reach consensus */
export interface EstimationConsensusReachedPayload {
  lobbyId: string;
  consensusValue: number;
  teams: TeamType[];
}

/** Emitted when a single team reaches consensus */
export interface EstimationTeamConsensusReachedPayload {
  lobbyId: string;
  team: TeamType;
  consensusValue: number;
}

/** Emitted when both teams reach consensus */
export interface EstimationFullConsensusReachedPayload {
  lobbyId: string;
  ticketId: string;
}

/** Emitted when voting begins for a ticket */
export interface EstimationVotingStartedPayload {
  lobbyId: string;
  ticketId: string;
}

/** Emitted when voting timer expires before all votes are in */
export interface EstimationVotingTimeoutPayload {
  lobbyId: string;
  submittedCount: number;
  totalCount: number;
}

/** Emitted when voting timer starts for a team */
export interface EstimationTimerStartedPayload {
  lobbyId: string;
  team: TeamType;
  durationMs: number;
  startedAt: number;
}

/** Emitted when host pauses the voting timer */
export interface EstimationTimerPausedPayload {
  lobbyId: string;
  team: TeamType;
  remainingMs: number;
  pausedBy: string;
}

/** Emitted when host resumes the voting timer */
export interface EstimationTimerResumedPayload {
  lobbyId: string;
  team: TeamType;
  remainingMs: number;
  resumedBy: string;
}

/** Emitted when host extends the voting timer */
export interface EstimationTimerExtendedPayload {
  lobbyId: string;
  team: TeamType;
  additionalMs: number;
  extendedBy: string;
}

/** Emitted when voting timer expires */
export interface EstimationTimerExpiredPayload {
  lobbyId: string;
  team: TeamType;
  votedCount: number;
  eligibleCount: number;
}

/** Emitted when discussion phase starts for a team */
export interface EstimationDiscussionStartedPayload {
  lobbyId: string;
  team: TeamType;
}

/** Emitted when host forces an estimate */
export interface EstimationEstimateForcedPayload {
  lobbyId: string;
  team: TeamType;
  consensusValue: number;
  forcedBy: string;
  wasTied: boolean;
}

/** Emitted when discussion phase timer starts */
export interface EstimationDiscussionTimerStartedPayload {
  lobbyId: string;
  durationMs: number;
  endsAt: number;
}

/** Emitted when discussion phase ends */
export interface EstimationDiscussionEndedPayload {
  lobbyId: string;
  reason: 'consensus' | 'host_finalized' | 'timer_expired';
  finalEstimate: number;
}

// =============================================================================
// Combat Domain Events
// =============================================================================

/** Emitted when a player damages the boss */
export interface CombatBossDamagedPayload {
  lobbyId: string;
  playerId: string;
  damage: number;
  bossHealth: number;
}

/** Emitted when the boss heals (e.g., due to disagreement or timeout) */
export interface CombatBossHealedPayload {
  lobbyId: string;
  healAmount: number;
  bossHealth: number;
}

/** Emitted when the boss is defeated */
export interface CombatBossDefeatedPayload {
  lobbyId: string;
  bossId: string;
}

/** Emitted when a player takes damage from boss or other source */
export interface CombatPlayerDamagedPayload {
  lobbyId: string;
  playerId: string;
  damage: number;
  playerHealth?: number; // Optional - will be calculated by handler in Plan 04-04
  timestamp?: number; // For grouping AoE attacks
}

/** Emitted when a player's health reaches zero */
export interface CombatPlayerDownedPayload {
  lobbyId: string;
  playerId: string;
  countdownSeconds: number;
}

/** Emitted when a downed player is revived */
export interface CombatPlayerRevivedPayload {
  lobbyId: string;
  playerId: string;
  reviverId: string;
  /** HP the player was restored to (server-computed, typically floor(maxHp * 0.5)) */
  newHp: number;
}

/** Emitted when a battle phase begins */
export interface CombatBattleStartedPayload {
  lobbyId: string;
  bossId: string;
}

/** Emitted when battle modifier changes (increases over time) */
export interface CombatModifierUpdatedPayload {
  lobbyId: string;
  modifier: number;
}

/** Emitted when combat is initialized for a lobby */
export interface CombatBattleInitializedPayload {
  lobbyId: string;
  bossId: string;
  bossMaxHp: number;
}

/** Emitted when a player enters battle (after voting) */
export interface CombatPlayerEnteredBattlePayload {
  lobbyId: string;
  playerId: string;
  transitionDurationMs: number;
}

/** Emitted when boss becomes enraged (50% HP) */
export interface CombatBossEnragedPayload {
  lobbyId: string;
  message: string;
}

/** Emitted when boss telegraphs a big attack */
export interface CombatBossTelegraphPayload {
  lobbyId: string;
  targetId?: string; // Optional - not specified for AoE attacks
  attackType?: 'light' | 'heavy' | 'special' | 'aoe'; // Optional - inferred from message
  message: string;
  delayMs: number;
  visualEffect?: 'charge' | 'glow' | 'shake' | 'particles' | 'none';
  bossType?: string;  // For boss-specific visual theming
}

/** Emitted when revival channeling starts */
export interface CombatRevivalStartedPayload {
  lobbyId: string;
  reviverId: string;
  targetId: string;
  durationMs: number;
}

/** Emitted periodically while a revival channel is in progress (Phase 45-04) */
export interface CombatRevivalProgressPayload {
  lobbyId: string;
  reviverId: string;
  targetId: string;
  /** 0-100, percent of channelDurationMs elapsed */
  percent: number;
  /** Milliseconds left until completeRevival fires */
  remainingMs: number;
}

/** Emitted when revival is cancelled (moved, took damage, target died) */
export interface CombatRevivalCancelledPayload {
  lobbyId: string;
  reviverId: string;
  targetId: string;
  reason: string;
}

/** Emitted when player enters ghost mode (permanent down) */
export interface CombatPlayerPermanentlyDownedPayload {
  lobbyId: string;
  playerId: string;
  message: string;
}

/** Emitted when combat cleanup completes */
export interface CombatCleanupCompletePayload {
  lobbyId: string;
}

/** Emitted when player is healed by a healer */
export interface CombatPlayerHealedPayload {
  lobbyId: string;
  playerId: string;
  healerId: string;
  healAmount: number;
  newHealth: number;
}

/** Emitted when countdown timer starts after all players voted */
export interface CombatCountdownStartedPayload {
  lobbyId: string;
  durationSeconds: number;
  startedAt: number;
}

/** Emitted every second during countdown */
export interface CombatCountdownTickPayload {
  lobbyId: string;
  remainingSeconds: number;
  multiplier: number;
}

/** Emitted when countdown reaches zero */
export interface CombatCountdownCompletePayload {
  lobbyId: string;
  finalMultiplier: number;
}

/** Emitted when coordinated team attack lands */
export interface CombatTeamAttackPayload {
  lobbyId: string;
  damage: number;
  multiplier: number;
  targetBossId: string;
  newBossHp: number;
}

// =============================================================================
// Minion Types and Events
// =============================================================================

/** Minion combat state */
export interface MinionState {
  playerId: string; // Spectator player ID
  hp: number;
  maxHp: number;
  isAlive: boolean;
  respawnAt?: number;
}

/** Emitted when minion spawns */
export interface CombatMinionSpawnedPayload {
  lobbyId: string;
  playerId: string;
  avatar: string;
  hp: number;
  maxHp: number;
}

/** Emitted when minion attacks a player */
export interface CombatMinionAttackPayload {
  lobbyId: string;
  minionPlayerId: string;
  targetId: string;
  damage: number;
  attackType: 'attack' | 'debuff';
}

/** Emitted when minion heals boss */
export interface CombatMinionHealBossPayload {
  lobbyId: string;
  minionPlayerId: string;
  healAmount: number;
  newBossHp: number;
}

/** Emitted when minion takes damage */
export interface CombatMinionDamagedPayload {
  lobbyId: string;
  playerId: string;
  damage: number;
  newHp: number;
  attackerId: string;
}

/** Emitted when minion is killed */
export interface CombatMinionKilledPayload {
  lobbyId: string;
  playerId: string;
  killerId: string;
  respawnInSeconds: number;
}

/** Emitted when battle phase completes (team attack landed or boss defeated) */
export interface CombatBattleCompletePayload {
  lobbyId: string;
}

/** Emitted when boss crosses HP phase threshold */
export interface CombatBossPhaseTransitionPayload {
  lobbyId: string;
  newPhase: number;       // 1, 2, or 3
  previousPhase: number;
  message: string;        // Boss-specific transition message
  bossType: string;       // e.g., 'bug-hydra'
}

/** Emitted when shield absorbs damage */
export interface CombatShieldAbsorbedPayload {
  lobbyId: string;
  playerId: string;
  absorbed: number;
  shieldRemaining: number;
}

// =============================================================================
// System Events
// =============================================================================

/** Emitted when a phase transition is rejected (invalid state) */
export interface TransitionRejectedPayload {
  lobbyId: string;
  reason: string;
  attemptedTransition: string;
}

// =============================================================================
// Domain Event Map
// =============================================================================

/**
 * Maps domain event names to their payload types.
 *
 * This interface provides compile-time type checking for the EventBus.
 * All event names follow the domain:action naming convention.
 */
export interface DomainEventMap {
  // Session events
  'session:player_joined': SessionPlayerJoinedPayload;
  'session:player_left': SessionPlayerLeftPayload;
  'session:player_disconnected': SessionPlayerDisconnectedPayload;
  'session:host_changed': SessionHostChangedPayload;
  'session:host_transferred': SessionHostTransferredPayload;
  'session:phase_changed': SessionPhaseChangedPayload;
  'session:lobby_destroyed': SessionLobbyDestroyedPayload;
  'session:team_changed': SessionTeamChangedPayload;

  // Estimation events
  'estimation:vote_cast': EstimationVoteCastPayload;
  'estimation:vote_changed': EstimationVoteChangedPayload;
  'estimation:consensus_reached': EstimationConsensusReachedPayload;
  'estimation:team_consensus_reached': EstimationTeamConsensusReachedPayload;
  'estimation:full_consensus_reached': EstimationFullConsensusReachedPayload;
  'estimation:voting_started': EstimationVotingStartedPayload;
  'estimation:voting_timeout': EstimationVotingTimeoutPayload;
  'estimation:timer_started': EstimationTimerStartedPayload;
  'estimation:timer_paused': EstimationTimerPausedPayload;
  'estimation:timer_resumed': EstimationTimerResumedPayload;
  'estimation:timer_extended': EstimationTimerExtendedPayload;
  'estimation:timer_expired': EstimationTimerExpiredPayload;
  'estimation:discussion_started': EstimationDiscussionStartedPayload;
  'estimation:estimate_forced': EstimationEstimateForcedPayload;
  'estimation:discussion_timer_started': EstimationDiscussionTimerStartedPayload;
  'estimation:discussion_ended': EstimationDiscussionEndedPayload;

  // Combat events
  'combat:boss_damaged': CombatBossDamagedPayload;
  'combat:boss_healed': CombatBossHealedPayload;
  'combat:boss_defeated': CombatBossDefeatedPayload;
  'combat:player_damaged': CombatPlayerDamagedPayload;
  'combat:player_downed': CombatPlayerDownedPayload;
  'combat:player_revived': CombatPlayerRevivedPayload;
  'combat:battle_started': CombatBattleStartedPayload;
  'combat:modifier_updated': CombatModifierUpdatedPayload;
  'combat:battle_initialized': CombatBattleInitializedPayload;
  'combat:player_entered_battle': CombatPlayerEnteredBattlePayload;
  'combat:boss_enraged': CombatBossEnragedPayload;
  'combat:boss_telegraph': CombatBossTelegraphPayload;
  'combat:revival_started': CombatRevivalStartedPayload;
  'combat:revival_progress': CombatRevivalProgressPayload;
  'combat:revival_cancelled': CombatRevivalCancelledPayload;
  'combat:player_permanently_downed': CombatPlayerPermanentlyDownedPayload;
  'combat:cleanup_complete': CombatCleanupCompletePayload;
  'combat:player_healed': CombatPlayerHealedPayload;
  'combat:countdown_started': CombatCountdownStartedPayload;
  'combat:countdown_tick': CombatCountdownTickPayload;
  'combat:countdown_complete': CombatCountdownCompletePayload;
  'combat:team_attack': CombatTeamAttackPayload;
  'combat:minion_spawned': CombatMinionSpawnedPayload;
  'combat:minion_attack': CombatMinionAttackPayload;
  'combat:minion_heal_boss': CombatMinionHealBossPayload;
  'combat:minion_damaged': CombatMinionDamagedPayload;
  'combat:minion_killed': CombatMinionKilledPayload;
  'combat:battle_complete': CombatBattleCompletePayload;
  'combat:boss_phase_transition': CombatBossPhaseTransitionPayload;
  'combat:shield_absorbed': CombatShieldAbsorbedPayload;

  // Progression events
  'progression:xp_awarded': ProgressionXPAwardedPayload;
  'progression:level_up': ProgressionLevelUpPayload;

  // Class Mastery events
  'class_mastery:xp_awarded': ClassMasteryXPAwardedPayload;
  'class_mastery:tier_up': ClassMasteryTierUpPayload;

  // Ability events
  'ability:used': AbilityUsedPayload;
  'ability:cooldown_started': AbilityCooldownStartedPayload;
  'ability:effect_applied': AbilityEffectAppliedPayload;

  // Combo events
  'combo:triggered': ComboTriggeredPayload;
  'combo:consensus_ultimate': ConsensusUltimatePayload;

  // Item events
  'item:awarded': ItemAwardedPayload;
  'item:used': ItemUsedPayload;
  'item:effect_applied': ItemEffectAppliedPayload;

  // Stats events
  'stats:session_complete': StatsSessionCompletePayload;

  // System events
  'transition_rejected': TransitionRejectedPayload;
}

/**
 * Union type of all valid domain event names.
 * Use this for type-safe event name parameters.
 */
export type DomainEventName = keyof DomainEventMap;
