/**
 * Zod schemas for Socket.IO event payload validation.
 *
 * These schemas mirror the TypeScript types in gameEvents.ts and can be used for
 * runtime validation of Socket.IO messages. They enable type-safe event handling
 * with automatic validation.
 *
 * Usage:
 * ```typescript
 * import { CreateLobbyPayloadSchema, validatePayload } from '@shared/socket-schemas';
 *
 * socket.on('create_lobby', (data) => {
 *   const result = validatePayload(CreateLobbyPayloadSchema, data);
 *   if (!result.success) {
 *     socket.emit('game_error', { message: result.error.message });
 *     return;
 *   }
 *   // data is now typed and validated
 *   createLobby(result.data);
 * });
 * ```
 */

import { z } from 'zod';

// ============================================
// Core Type Schemas (matching gameEvents.ts)
// ============================================

/**
 * 2D position coordinates
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Player team assignment
 */
export const TeamTypeSchema = z.enum(['developers', 'qa', 'spectators']);

/**
 * Character avatar class
 */
export const AvatarClassSchema = z.enum([
  'ranger',
  'rogue',
  'bard',
  'sorcerer',
  'wizard',
  'warrior',
  'paladin',
  'cleric',
  'oathbreaker',
  'monk',
]);

/**
 * Current game phase
 */
export const GamePhaseSchema = z.enum([
  'lobby',
  'avatar_selection',
  'battle',
  'scoring',
  'reveal',
  'discussion',
  'victory',
  'next_level',
  'game_over',
]);

/**
 * Estimation scale type
 */
export const EstimationScaleTypeSchema = z.enum(['fibonacci', 'doubling', 'tshirt']);

/**
 * Score value - can be a number or '?' for abstain
 */
export const ScoreValueSchema = z.union([z.number(), z.literal('?')]);

/**
 * Reconnection attempt result
 */
export const ReconnectResultSchema = z.enum([
  'success',
  'lobby_closed',
  'host_changed',
  'invalid_token',
  'grace_expired',
  'server_error',
]);

// ============================================
// Settings Schemas
// ============================================

/**
 * Timer configuration
 */
export const TimerSettingsSchema = z.object({
  enabled: z.boolean(),
  durationMinutes: z.number().positive(),
});

/**
 * Jira integration settings
 */
export const JiraSettingsSchema = z.object({
  baseUrl: z.string().optional(),
});

/**
 * Consensus countdown settings
 */
export const ConsensusSettingsSchema = z.object({
  countdownSeconds: z.number().positive().default(5),
});

/**
 * Estimation scale settings
 */
export const EstimationSettingsSchema = z.object({
  scaleType: EstimationScaleTypeSchema,
  customTshirtMapping: z.record(z.string(), z.number()).optional(),
  autoAdvance: z.boolean().optional().default(false),
});

/**
 * Active timer state
 */
export const TimerStateSchema = z.object({
  startedAt: z.number(),
  durationMs: z.number().positive(),
  isActive: z.boolean(),
});

// ============================================
// Entity Schemas
// ============================================

/**
 * Jira ticket for estimation
 */
export const JiraTicketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  storyPoints: z.number().optional(),
});

/**
 * Boss entity
 */
export const BossSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxHealth: z.number().positive(),
  currentHealth: z.number(),
  phase: z.number(),
  maxPhases: z.number().positive(),
  sprite: z.string(),
  defeated: z.boolean(),
  lastRingAttack: z.number().optional(),
});

/**
 * Player combat state
 */
export const PlayerCombatStateSchema = z.object({
  maxHp: z.number().positive(),
  hp: z.number(),
  isDowned: z.boolean(),
  lastDamagedBy: z.string().optional(),
  revivedBy: z.string().optional(),
  reviveEndsAt: z.number().optional(),
  position: PositionSchema.optional(),
  isJumping: z.boolean().optional(),
});

/**
 * Player in a lobby
 */
export const PlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: AvatarClassSchema,
  avatarClass: AvatarClassSchema,
  team: TeamTypeSchema,
  isHost: z.boolean(),
  currentScore: ScoreValueSchema.optional(),
  hasSubmittedScore: z.boolean(),
  isReady: z.boolean().optional(),
});

// ============================================
// Client-to-Server Event Payload Schemas
// ============================================

/**
 * Create lobby event payload
 */
export const CreateLobbyPayloadSchema = z.object({
  lobbyName: z.string().min(1).max(100),
  hostName: z.string().min(1).max(50),
  initialSettings: z
    .object({
      timerSettings: TimerSettingsSchema.optional(),
      jiraSettings: JiraSettingsSchema.optional(),
      estimationSettings: EstimationSettingsSchema.optional(),
      customLobbyId: z
        .string()
        .regex(/^[a-zA-Z0-9-]{3,30}$/)
        .optional(),
    })
    .optional(),
});

/**
 * Join lobby event payload
 */
export const JoinLobbyPayloadSchema = z.object({
  lobbyId: z.string().min(1),
  playerName: z.string().min(1).max(50),
});

/**
 * Select avatar event payload
 */
export const SelectAvatarPayloadSchema = z.object({
  avatarClass: AvatarClassSchema,
});

/**
 * Assign team event payload (host only)
 */
export const AssignTeamPayloadSchema = z.object({
  playerId: z.string().min(1),
  team: TeamTypeSchema,
});

/**
 * Change own team event payload
 */
export const ChangeOwnTeamPayloadSchema = z.object({
  team: TeamTypeSchema,
});

/**
 * Add tickets event payload
 */
export const AddTicketsPayloadSchema = z.object({
  tickets: z.array(JiraTicketSchema).min(1),
});

/**
 * Remove ticket event payload
 */
export const RemoveTicketPayloadSchema = z.object({
  ticketId: z.string().min(1),
});

/**
 * Update Jira settings event payload
 */
export const UpdateJiraSettingsPayloadSchema = z.object({
  jiraSettings: JiraSettingsSchema,
});

/**
 * Lobby player position event payload
 */
export const LobbyPlayerPosPayloadSchema = z.object({
  x: z.number(),
  y: z.number(),
  direction: z.string().optional(),
});

/**
 * Lobby player jump event payload
 */
export const LobbyPlayerJumpPayloadSchema = z.object({
  isJumping: z.boolean(),
});

/**
 * Lobby emote event payload
 */
export const LobbyEmotePayloadSchema = z.object({
  message: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

/**
 * Toggle ready state event payload
 */
export const ToggleReadyPayloadSchema = z.object({
  ready: z.boolean(),
});

/**
 * Submit score event payload
 */
export const SubmitScorePayloadSchema = z.object({
  score: ScoreValueSchema,
});

/**
 * Update discussion vote event payload
 */
export const UpdateDiscussionVotePayloadSchema = z.object({
  score: ScoreValueSchema,
});

/**
 * Attack boss event payload
 */
export const AttackBossPayloadSchema = z.object({
  damage: z.number().nonnegative(),
});

/**
 * Player performance event payload
 */
export const PlayerPerformancePayloadSchema = z.object({
  playerId: z.string().min(1),
  team: TeamTypeSchema,
  estimationTime: z.number().nonnegative(),
  score: z.number(),
  ticketId: z.string().optional(),
});

/**
 * Update timer settings event payload
 */
export const UpdateTimerSettingsPayloadSchema = z.object({
  timerSettings: TimerSettingsSchema,
});

/**
 * YouTube play event payload
 */
export const YoutubePlayPayloadSchema = z.object({
  videoId: z.string().min(1),
  url: z.string().url(),
});

/**
 * Advance phase now event payload (admin)
 */
export const AdvancePhaseNowPayloadSchema = z.object({
  lobbyId: z.string().min(1),
  playerId: z.string().min(1),
});

/**
 * Force voting progression event payload
 */
export const ForceVotingProgressionPayloadSchema = z.object({
  lobbyId: z.string().min(1),
});

/**
 * Battle player position event payload
 */
export const PlayerPosPayloadSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Attack player event payload
 */
export const AttackPlayerPayloadSchema = z.object({
  targetId: z.string().min(1),
  damage: z.number().positive(),
});

/**
 * Revive target event payload (start/cancel/tick)
 */
export const ReviveTargetPayloadSchema = z.object({
  targetId: z.string().min(1),
});

/**
 * Player jump event payload (in battle)
 */
export const PlayerJumpPayloadSchema = z.object({
  isJumping: z.boolean(),
});

/**
 * Boss damage player event payload
 */
export const BossDamagePlayerPayloadSchema = z.object({
  playerId: z.string().min(1),
  damage: z.number().positive(),
});

/**
 * Player projectile event payload
 */
export const PlayerProjectilePayloadSchema = z.object({
  startX: z.number(),
  startY: z.number(),
  targetX: z.number(),
  targetY: z.number(),
  emoji: z.string().min(1),
  targetPlayerId: z.string().optional(),
});

/**
 * Reconnect with token event payload
 */
export const ReconnectWithTokenPayloadSchema = z.object({
  reconnectToken: z.string().min(1),
});

/**
 * Request missed events event payload
 */
export const RequestMissedEventsPayloadSchema = z.object({
  lastSeq: z.number().nonnegative(),
});

/**
 * Attack minion event payload
 */
export const AttackMinionPayloadSchema = z.object({
  minionPlayerId: z.string().min(1),
});

/**
 * Finalize estimate event payload
 */
export const FinalizeEstimatePayloadSchema = z.object({
  estimate: z.number(),
});

// ============================================
// Phase 45-05B L2/L8: Coverage gaps filled
// ============================================

/** Update lobby name (host only) */
export const UpdateLobbyNamePayloadSchema = z.object({
  name: z.string().min(1).max(100),
});

/** Heal-party ability use (paladin/cleric) */
export const HealPartyPayloadSchema = z.object({}).strict();

/** Magic charge lobby UX */
export const PlayerChargePayloadSchema = z.object({
  isCharging: z.boolean(),
  chargePower: z.number().optional(),
});

/** Battle emote */
export const BattleEmotePayloadSchema = z.object({
  message: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

/** Update estimation settings (host only) */
export const UpdateEstimationSettingsPayloadSchema = z.object({
  estimationSettings: EstimationSettingsSchema,
});

/** Use class ability */
export const UseAbilityPayloadSchema = z.object({
  abilityId: z.string().min(1),
});

/** Use inventory item */
export const UseItemPayloadSchema = z.object({
  itemType: z.string().min(1),
});

/** Parameterless events — z.void() so the registry can validate they have no payload */
export const EmptyPayloadSchema = z.void();

// ============================================
// Server-to-Client Event Payload Schemas
// ============================================

/**
 * Game error event payload
 *
 * Phase 45-05B L3: aligned with shared/gameEvents.ts ServerToClientEvents —
 * `code` and `tiedValues` are emitted by force_estimate / use_item / etc.
 */
export const GameErrorPayloadSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  tiedValues: z.array(ScoreValueSchema).optional(),
});

/**
 * Voting timeout event payload
 */
export const VotingTimeoutPayloadSchema = z.object({
  submittedCount: z.number().nonnegative(),
  totalCount: z.number().positive(),
  message: z.string(),
});

/**
 * Player disconnected event payload
 */
export const PlayerDisconnectedPayloadSchema = z.object({
  playerId: z.string().min(1),
});

/**
 * Host transferred event payload
 */
export const HostTransferredPayloadSchema = z.object({
  oldHostId: z.string(),
  newHostId: z.string(),
  newHostName: z.string(),
  reason: z.string(),
});

/**
 * Reconnect attempt event payload
 */
export const ReconnectAttemptPayloadSchema = z.object({
  attempt: z.number().positive(),
  maxAttempts: z.number().positive(),
  nextRetryIn: z.number().nonnegative(),
});

/**
 * Reconnect response event payload
 */
export const ReconnectResponsePayloadSchema = z.object({
  result: ReconnectResultSchema,
  lobbySync: z.any().optional(), // Full lobby sync is complex, use passthrough
  message: z.string().optional(),
  newHost: z.string().optional(),
});

// ============================================
// Type Exports (inferred from Zod schemas)
// ============================================

// Core types
export type Position = z.infer<typeof PositionSchema>;
export type TeamType = z.infer<typeof TeamTypeSchema>;
export type AvatarClass = z.infer<typeof AvatarClassSchema>;
export type GamePhase = z.infer<typeof GamePhaseSchema>;
export type EstimationScaleType = z.infer<typeof EstimationScaleTypeSchema>;
export type ScoreValue = z.infer<typeof ScoreValueSchema>;
export type ReconnectResult = z.infer<typeof ReconnectResultSchema>;

// Settings
export type TimerSettings = z.infer<typeof TimerSettingsSchema>;
export type JiraSettings = z.infer<typeof JiraSettingsSchema>;
export type ConsensusSettings = z.infer<typeof ConsensusSettingsSchema>;
export type EstimationSettings = z.infer<typeof EstimationSettingsSchema>;
export type TimerState = z.infer<typeof TimerStateSchema>;

// Entities
export type JiraTicket = z.infer<typeof JiraTicketSchema>;
export type Boss = z.infer<typeof BossSchema>;
export type PlayerCombatState = z.infer<typeof PlayerCombatStateSchema>;
export type Player = z.infer<typeof PlayerSchema>;

// Client-to-Server payloads
export type CreateLobbyPayload = z.infer<typeof CreateLobbyPayloadSchema>;
export type JoinLobbyPayload = z.infer<typeof JoinLobbyPayloadSchema>;
export type SelectAvatarPayload = z.infer<typeof SelectAvatarPayloadSchema>;
export type AssignTeamPayload = z.infer<typeof AssignTeamPayloadSchema>;
export type ChangeOwnTeamPayload = z.infer<typeof ChangeOwnTeamPayloadSchema>;
export type AddTicketsPayload = z.infer<typeof AddTicketsPayloadSchema>;
export type RemoveTicketPayload = z.infer<typeof RemoveTicketPayloadSchema>;
export type UpdateJiraSettingsPayload = z.infer<typeof UpdateJiraSettingsPayloadSchema>;
export type LobbyPlayerPosPayload = z.infer<typeof LobbyPlayerPosPayloadSchema>;
export type LobbyPlayerJumpPayload = z.infer<typeof LobbyPlayerJumpPayloadSchema>;
export type LobbyEmotePayload = z.infer<typeof LobbyEmotePayloadSchema>;
export type ToggleReadyPayload = z.infer<typeof ToggleReadyPayloadSchema>;
export type SubmitScorePayload = z.infer<typeof SubmitScorePayloadSchema>;
export type UpdateDiscussionVotePayload = z.infer<typeof UpdateDiscussionVotePayloadSchema>;
export type AttackBossPayload = z.infer<typeof AttackBossPayloadSchema>;
export type PlayerPerformancePayload = z.infer<typeof PlayerPerformancePayloadSchema>;
export type UpdateTimerSettingsPayload = z.infer<typeof UpdateTimerSettingsPayloadSchema>;
export type YoutubePlayPayload = z.infer<typeof YoutubePlayPayloadSchema>;
export type AdvancePhaseNowPayload = z.infer<typeof AdvancePhaseNowPayloadSchema>;
export type ForceVotingProgressionPayload = z.infer<typeof ForceVotingProgressionPayloadSchema>;
export type PlayerPosPayload = z.infer<typeof PlayerPosPayloadSchema>;
export type AttackPlayerPayload = z.infer<typeof AttackPlayerPayloadSchema>;
export type ReviveTargetPayload = z.infer<typeof ReviveTargetPayloadSchema>;
export type PlayerJumpPayload = z.infer<typeof PlayerJumpPayloadSchema>;
export type BossDamagePlayerPayload = z.infer<typeof BossDamagePlayerPayloadSchema>;
export type PlayerProjectilePayload = z.infer<typeof PlayerProjectilePayloadSchema>;
export type ReconnectWithTokenPayload = z.infer<typeof ReconnectWithTokenPayloadSchema>;
export type RequestMissedEventsPayload = z.infer<typeof RequestMissedEventsPayloadSchema>;
export type AttackMinionPayload = z.infer<typeof AttackMinionPayloadSchema>;
export type FinalizeEstimatePayload = z.infer<typeof FinalizeEstimatePayloadSchema>;

// Server-to-Client payloads
export type GameErrorPayload = z.infer<typeof GameErrorPayloadSchema>;
export type VotingTimeoutPayload = z.infer<typeof VotingTimeoutPayloadSchema>;
export type PlayerDisconnectedPayload = z.infer<typeof PlayerDisconnectedPayloadSchema>;
export type HostTransferredPayload = z.infer<typeof HostTransferredPayloadSchema>;
export type ReconnectAttemptPayload = z.infer<typeof ReconnectAttemptPayloadSchema>;
export type ReconnectResponsePayload = z.infer<typeof ReconnectResponsePayloadSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Result type for payload validation
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

/**
 * Validates a payload against a Zod schema.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns A result object with either the validated data or the Zod error
 *
 * @example
 * ```typescript
 * const result = validatePayload(CreateLobbyPayloadSchema, data);
 * if (result.success) {
 *   console.log('Valid:', result.data);
 * } else {
 *   console.error('Invalid:', result.error.message);
 * }
 * ```
 */
export function validatePayload<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validates a payload and throws on error.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns The validated data
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * try {
 *   const payload = parsePayload(CreateLobbyPayloadSchema, data);
 *   // payload is typed as CreateLobbyPayload
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Validation failed:', error.issues);
 *   }
 * }
 * ```
 */
export function parsePayload<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// ============================================
// Schema Registry for Event Validation
// ============================================

/**
 * Registry mapping client-to-server event names to their Zod schemas.
 * Useful for dynamic event validation in middleware.
 */
export const ClientEventSchemas = {
  create_lobby: CreateLobbyPayloadSchema,
  join_lobby: JoinLobbyPayloadSchema,
  leave_lobby: EmptyPayloadSchema,
  update_lobby_name: UpdateLobbyNamePayloadSchema,
  select_avatar: SelectAvatarPayloadSchema,
  assign_team: AssignTeamPayloadSchema,
  change_own_team: ChangeOwnTeamPayloadSchema,
  add_tickets: AddTicketsPayloadSchema,
  remove_ticket: RemoveTicketPayloadSchema,
  update_jira_settings: UpdateJiraSettingsPayloadSchema,
  lobby_player_pos: LobbyPlayerPosPayloadSchema,
  lobby_player_jump: LobbyPlayerJumpPayloadSchema,
  lobby_emote: LobbyEmotePayloadSchema,
  toggle_ready: ToggleReadyPayloadSchema,
  start_battle: EmptyPayloadSchema,
  submit_score: SubmitScorePayloadSchema,
  update_discussion_vote: UpdateDiscussionVotePayloadSchema,
  attack_boss: AttackBossPayloadSchema,
  proceed_next_level: EmptyPayloadSchema,
  restart_game: EmptyPayloadSchema,
  player_performance: PlayerPerformancePayloadSchema,
  abandon_quest: EmptyPayloadSchema,
  force_reveal: EmptyPayloadSchema,
  update_timer_settings: UpdateTimerSettingsPayloadSchema,
  youtube_play: YoutubePlayPayloadSchema,
  youtube_stop: EmptyPayloadSchema,
  advancePhaseNow: AdvancePhaseNowPayloadSchema,
  forceVotingProgression: ForceVotingProgressionPayloadSchema,
  player_pos: PlayerPosPayloadSchema,
  attack_player: AttackPlayerPayloadSchema,
  revive_start: ReviveTargetPayloadSchema,
  revive_cancel: ReviveTargetPayloadSchema,
  revive_tick: ReviveTargetPayloadSchema,
  heal_party: HealPartyPayloadSchema,
  player_jump: PlayerJumpPayloadSchema,
  boss_damage_player: BossDamagePlayerPayloadSchema,
  player_projectile: PlayerProjectilePayloadSchema,
  reconnect_with_token: ReconnectWithTokenPayloadSchema,
  request_missed_events: RequestMissedEventsPayloadSchema,
  attack_minion: AttackMinionPayloadSchema,
  finalize_estimate: FinalizeEstimatePayloadSchema,
  player_charge: PlayerChargePayloadSchema,
  battle_emote: BattleEmotePayloadSchema,
  return_to_lobby: EmptyPayloadSchema,
  update_estimation_settings: UpdateEstimationSettingsPayloadSchema,
  use_ability: UseAbilityPayloadSchema,
  use_item: UseItemPayloadSchema,
} as const;

/**
 * Type-safe event name for client events with schemas
 */
export type ClientEventName = keyof typeof ClientEventSchemas;

/**
 * Get the schema for a client event by name
 */
export function getClientEventSchema(eventName: string): z.ZodSchema | undefined {
  return ClientEventSchemas[eventName as ClientEventName];
}
