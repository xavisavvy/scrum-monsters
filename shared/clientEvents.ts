/**
 * Client Event Type Definitions
 *
 * This file defines fine-grained events sent from server to client via Socket.IO.
 * These events replace the coarse `lobby_updated` broadcast with targeted updates.
 *
 * Event naming convention: domain:action (e.g., session:player_joined, estimation:vote_cast)
 * All events include sequence number (seq) and timestamp for ordering and recovery.
 */

import { GamePhase, TeamType, AvatarClass, Lobby } from './gameEvents';

/**
 * Base interface for all client events
 * Every event includes these fields for ordering and recovery
 */
export interface BaseClientEvent {
  seq: number; // Sequence number for event ordering per lobby
  timestamp: number; // Unix timestamp (ms) when event was generated
}

// =============================================================================
// Session Events
// =============================================================================

export interface SessionPlayerJoinedEvent extends BaseClientEvent {
  playerId: string;
  playerName: string;
  team: TeamType;
  avatar?: AvatarClass;
}

export interface SessionPlayerLeftEvent extends BaseClientEvent {
  playerId: string;
}

// Phase 45-03: SessionPlayerReconnectedEvent removed — was never emitted,
// never bridged, never handled. Legacy `player_reconnected` (no session:
// prefix) also removed in 45-03; reconnecting clients receive lobby_sync
// instead.

export interface SessionHostChangedEvent extends BaseClientEvent {
  oldHostId: string;
  newHostId: string;
  newHostName: string;
}

export interface SessionPhaseChangedEvent extends BaseClientEvent {
  oldPhase: GamePhase;
  newPhase: GamePhase;
}

export interface SessionTeamChangedEvent extends BaseClientEvent {
  playerId: string;
  oldTeam: TeamType;
  newTeam: TeamType;
}

export interface SessionAvatarSelectedEvent extends BaseClientEvent {
  playerId: string;
  avatar: AvatarClass;
}

// =============================================================================
// Estimation Events
// =============================================================================

/**
 * Emitted when a player casts or changes their vote
 * Vote value is masked (hasVoted boolean) during voting phase, revealed in estimation:votes_revealed
 */
export interface EstimationVoteCastEvent extends BaseClientEvent {
  playerId: string;
  team: TeamType;
  hasVoted: boolean; // Masked during voting phase - actual value hidden until reveal
}

export interface EstimationVotesRevealedEvent extends BaseClientEvent {
  votes: Record<string, number | '?'>; // playerId -> vote value
  team: TeamType;
}

export interface EstimationConsensusReachedEvent extends BaseClientEvent {
  team: TeamType;
  consensusValue: number;
}

export interface EstimationTimerStartedEvent extends BaseClientEvent {
  team: TeamType;
  endsAt: number; // Unix timestamp (ms) when timer expires
  durationMs: number;
}

export interface EstimationTimerPausedEvent extends BaseClientEvent {
  team: TeamType;
  remainingMs: number; // Time remaining when paused
}

export interface EstimationTimerResumedEvent extends BaseClientEvent {
  team: TeamType;
  endsAt: number; // New absolute end time after resume
}

export interface EstimationTimerExpiredEvent extends BaseClientEvent {
  team: TeamType;
  votedCount: number; // Players who submitted votes
  eligibleCount: number; // Total eligible voters
}

export interface EstimationEstimateForcedEvent extends BaseClientEvent {
  team: TeamType;
  consensusValue: number; // Final estimate chosen by host
}

// =============================================================================
// Combat Events
// =============================================================================

export interface CombatBossDamagedEvent extends BaseClientEvent {
  playerId: string;
  damage: number;
  newHp: number; // Resulting boss HP after damage
}

export interface CombatBossHealedEvent extends BaseClientEvent {
  healAmount: number;
  newHp: number; // Resulting boss HP after heal
}

export interface CombatBossEnragedEvent extends BaseClientEvent {
  message: string; // Flavor text for enrage
}

export interface CombatBossTelegraphEvent extends BaseClientEvent {
  targetId?: string; // Undefined for AoE attacks
  attackType?: 'light' | 'heavy' | 'special'; // Undefined if inferred from message
  message: string; // Telegraph message displayed to players
  delayMs: number; // Milliseconds until attack executes
}

export interface CombatBossDefeatedEvent extends BaseClientEvent {
  // No additional fields - seq and timestamp sufficient
}

export interface CombatPlayerDamagedEvent extends BaseClientEvent {
  playerId: string;
  damage: number;
  newHp: number; // Resulting player HP after damage
  source: 'boss' | 'player'; // Damage source
}

export interface CombatPlayerDownedEvent extends BaseClientEvent {
  playerId: string;
  countdownSeconds: number; // Time until permanent death
}

export interface CombatPlayerRevivedEvent extends BaseClientEvent {
  playerId: string;
  reviverId: string;
  newHp: number; // HP after revival (typically 50% max)
}

export interface CombatRevivalStartedEvent extends BaseClientEvent {
  reviverId: string;
  targetId: string;
  durationMs: number; // Total channel duration
}

export interface CombatRevivalCancelledEvent extends BaseClientEvent {
  reviverId: string;
  targetId: string;
  reason: string; // Why revival was interrupted
}

export interface CombatPlayerEnteredBattleEvent extends BaseClientEvent {
  playerId: string;
}

export interface CombatModifierUpdatedEvent extends BaseClientEvent {
  modifier: number; // Current battle modifier value
}

// =============================================================================
// System Events
// =============================================================================

/**
 * Full state sync event for late joiners or when event buffer is exhausted
 * Client receives entire lobby state and resets local state
 */
export interface SystemFullStateEvent extends BaseClientEvent {
  lobby: Lobby; // Complete lobby snapshot
}

/**
 * Response to missed event request
 * Contains array of events client missed during disconnect
 */
export interface SystemMissedEventsEvent {
  events: Array<{
    event: string; // Event name (e.g., 'session:player_joined')
    data: unknown; // Event payload with seq and timestamp
  }>;
}

// =============================================================================
// Client Event Map
// =============================================================================

/**
 * Maps client event names to their payload types
 * Used for type-safe event emission and handling
 */
export interface ClientEventMap {
  // Session events
  'session:player_joined': SessionPlayerJoinedEvent;
  'session:player_left': SessionPlayerLeftEvent;
  'session:host_changed': SessionHostChangedEvent;
  'session:phase_changed': SessionPhaseChangedEvent;
  'session:team_changed': SessionTeamChangedEvent;
  'session:avatar_selected': SessionAvatarSelectedEvent;

  // Estimation events
  'estimation:vote_cast': EstimationVoteCastEvent;
  'estimation:votes_revealed': EstimationVotesRevealedEvent;
  'estimation:consensus_reached': EstimationConsensusReachedEvent;
  'estimation:timer_started': EstimationTimerStartedEvent;
  'estimation:timer_paused': EstimationTimerPausedEvent;
  'estimation:timer_resumed': EstimationTimerResumedEvent;
  'estimation:timer_expired': EstimationTimerExpiredEvent;
  'estimation:estimate_forced': EstimationEstimateForcedEvent;

  // Combat events
  'combat:boss_damaged': CombatBossDamagedEvent;
  'combat:boss_healed': CombatBossHealedEvent;
  'combat:boss_enraged': CombatBossEnragedEvent;
  'combat:boss_telegraph': CombatBossTelegraphEvent;
  'combat:boss_defeated': CombatBossDefeatedEvent;
  'combat:player_damaged': CombatPlayerDamagedEvent;
  'combat:player_downed': CombatPlayerDownedEvent;
  'combat:player_revived': CombatPlayerRevivedEvent;
  'combat:revival_started': CombatRevivalStartedEvent;
  'combat:revival_cancelled': CombatRevivalCancelledEvent;
  'combat:player_entered_battle': CombatPlayerEnteredBattleEvent;
  'combat:modifier_updated': CombatModifierUpdatedEvent;

  // System events
  'system:full_state': SystemFullStateEvent;
  'system:missed_events': SystemMissedEventsEvent;
}

/**
 * Union type of all valid client event names
 * Use for type-safe event name parameters
 */
export type ClientEventName = keyof ClientEventMap;
