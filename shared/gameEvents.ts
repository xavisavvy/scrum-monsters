// Shared types and events for the multiplayer scrum poker game

import type { ItemType } from './itemTypes';

/**
 * Envelope added by ClientEventEmitter.emitToLobby to every fine-grained event.
 * All session:*, estimation:*, combat:*, progression:*, class_mastery:*,
 * ability:*, combo:*, item:*, stats:*, and system:full_state events carry this.
 * Excluded: system:missed_events, server_shutdown, connection_lost,
 * reconnect_attempt (these 4 have no seq/timestamp in their payload).
 */
export type Sequenced<T> = T & { seq: number; timestamp: number };

export interface Position {
  x: number;
  y: number;
}

export interface PlayerCombatState {
  maxHp: number;
  hp: number;
  isDowned: boolean;
  lastDamagedBy?: string;
  revivedBy?: string;
  reviveEndsAt?: number;
  position?: Position;
  isJumping?: boolean;
}

export interface Player {
  id: string;
  name: string;
  avatar: AvatarClass;
  avatarClass: AvatarClass; // Alias for compatibility
  team: TeamType;
  isHost: boolean;
  currentScore?: number | "?";
  hasSubmittedScore: boolean;
  level: number; // Player level from XP progression (default 1)
  isReady?: boolean; // Player ready state for lobby phase
  // Per-player gate for avatar_selection -> lobby UX transition. Server initializes
  // false for fresh players; flipped true on `select_avatar`. Preserved on
  // reconnect via SessionManager.joinLobby so reconnecting players skip
  // re-selecting. See .planning/debug/resolved/avatar-selection-skipped.md.
  hasSelectedAvatar?: boolean;
}

export interface TeamStats {
  totalStoryPoints: number;
  ticketsCompleted: number;
  averageEstimationTime: number;
  consensusRate: number;
  accuracyScore: number;
  participationRate: number;
  achievements: string[];
  currentStreak: number;
  bestStreak: number;
}

export interface TeamCompetition {
  developers: TeamStats;
  qa: TeamStats;
  currentRound: number;
  winnerHistory: TeamType[];
  seasonStart: string;
}

export interface Lobby {
  id: string;
  name: string;
  hostId: string;
  players: Player[];
  teams: Record<TeamType, Player[]>;
  currentTicket?: JiraTicket;
  tickets: JiraTicket[];
  gamePhase: GamePhase;
  boss?: Boss;
  completedTickets: CompletedTicket[];
  teamCompetition: TeamCompetition;
  playerCombatStates: Record<string, PlayerCombatState>;
  playerPositions: Record<string, Position>;
  timerSettings?: TimerSettings;
  jiraSettings?: JiraSettings;
  consensusSettings?: ConsensusSettings;
  estimationSettings?: EstimationSettings;
  currentTimer?: TimerState;
  consensusCountdown?: {
    isActive: boolean;
    remainingSeconds: number;
    startedAt: number;
  };
  votingStartedAt?: number;
  battleModifier?: number; // Increases every 10s during battle
  battleStartTime?: number; // Timestamp when battle started
}

export interface TimerSettings {
  enabled: boolean;
  durationMinutes: number;
}

export interface JiraSettings {
  baseUrl?: string; // e.g. "https://yourcompany.atlassian.net/browse/"
}

export interface ConsensusSettings {
  countdownSeconds: number; // Default 5 seconds
}

export interface EstimationSettings {
  scaleType: EstimationScaleType;
  customTshirtMapping?: Record<string, number>; // Custom point values for T-shirt sizes
  autoAdvance?: boolean; // Default false (host-only opt-in); gates consensus countdown auto-advance
}

export interface TimerState {
  startedAt: number; // timestamp when timer started
  durationMs: number; // timer duration in milliseconds
  isActive: boolean;
}

export interface JiraTicket {
  id: string;
  title: string;
  description: string;
  storyPoints?: number;
}

export interface CompletedTicket {
  id: string;
  title: string;
  description: string;
  storyPoints: number;
  completedAt: string; // ISO 8601 date string for JSON serialization
  teamBreakdown: {
    developers: { participated: boolean; consensusScore?: number };
    qa: { participated: boolean; consensusScore?: number };
  };
}

export interface Boss {
  id: string;
  name: string;
  maxHealth: number;
  currentHealth: number;
  phase: number;
  maxPhases: number;
  sprite: string;
  defeated: boolean;
  lastRingAttack?: number;
}

export type GamePhase =
  | "lobby"
  | "avatar_selection"
  | "battle"
  | "scoring"
  | "reveal"
  | "discussion"
  | "victory"
  | "next_level"
  | "game_over";

export type TeamType = "developers" | "qa" | "spectators";

export type AvatarClass =
  | "ranger"
  | "rogue"
  | "bard"
  | "sorcerer"
  | "wizard"
  | "warrior"
  | "paladin"
  | "cleric"
  | "oathbreaker"
  | "monk";

// Ring-attack wire shape — used by boss_ring_attack (server emits the in-memory
// shape from gameState.createRingAttack directly to clients with no
// seq/timestamp wrapper, unlike the fine-grained combat:* events).
export interface RingAttackProjectile {
  id: string;
  startX: number;       // boss origin X (percent)
  startY: number;       // boss origin Y (percent)
  targetX: number;      // landing X (percent)
  targetY: number;      // landing Y (percent)
  progress: number;     // 0-1 animation cursor, advanced client-side
  emoji: string;
}

export interface RingAttack {
  type: 'ring';
  projectiles: RingAttackProjectile[];
  targetCount: number;
}

// Reconnection System Types
export interface ReconnectToken {
  playerId: string;
  lobbyId: string;
  playerName: string;
  issuedAt: number;
  expiresAt: number;
  signature: string; // Signed token to prevent tampering
}

export interface DisconnectedPlayer {
  playerId: string;
  lobbyId: string;
  playerName: string;
  disconnectedAt: number;
  graceExpiresAt: number;
  lastKnownPosition?: Position;
  lastKnownCombatState?: PlayerCombatState;
  // Phase 41-02: marks that this player was the host at disconnect time. Host
  // transfer is deferred until grace expiry; if the player reconnects within
  // the grace window, host status is restored. Server-internal field — not
  // emitted on-wire.
  wasHost?: boolean;
}

export interface LobbySnapshot {
  lobby: Lobby;
  player: Player;
  timestamp: number;
  reconnectToken: string;
}

export interface LobbySync {
  lobby: Lobby;
  yourPlayer: Player;
  reconnectToken: string;
  pendingActions?: {
    timers?: TimerState;
    consensus?: unknown;
    battleState?: unknown;
  };
  stateChanges?: {
    playersJoined?: string[];
    playersLeft?: string[];
    phaseChanged?: boolean;
    ticketsChanged?: boolean;
  };
}

export type ReconnectResult = 'success' | 'lobby_closed' | 'host_changed' | 'invalid_token' | 'grace_expired' | 'server_error';

export interface ReconnectResponse {
  result: ReconnectResult;
  lobbySync?: LobbySync;
  message?: string;
  newHost?: string; // If host changed during disconnect
}

// WebSocket Events (Socket.IO function signature format)
export interface ClientToServerEvents {
  // Phase 45-05: parameterless heartbeat sent every 25s by useWebSocket.tsx to
  // keep idle proxy connections alive (NPM / VPS-level timeouts ~30-60s).
  // Server handler at server/websocket.ts is a no-op acknowledgment.
  client_heartbeat: () => void;
  create_lobby: (data: {
    lobbyName: string;
    hostName: string;
    initialSettings?: {
      timerSettings?: TimerSettings;
      jiraSettings?: JiraSettings;
      estimationSettings?: EstimationSettings;
      customLobbyId?: string;
    };
  }) => void;
  join_lobby: (data: { lobbyId: string; playerName: string }) => void;
  leave_lobby: (data: Record<string, never>) => void;
  update_lobby_name: (data: { name: string }) => void;
  select_avatar: (data: { avatarClass: AvatarClass }) => void;
  assign_team: (data: { playerId: string; team: TeamType }) => void;
  change_own_team: (data: { team: TeamType }) => void;
  add_tickets: (data: { tickets: JiraTicket[] }) => void;
  remove_ticket: (data: { ticketId: string }) => void;
  update_jira_settings: (data: { jiraSettings: JiraSettings }) => void;
  lobby_player_pos: (data: {
    x: number;
    y: number;
    direction?: string;
  }) => void;
  lobby_player_jump: (data: { isJumping: boolean }) => void;
  lobby_emote: (data: {
    message: string;
    x: number;
    y: number;
  }) => void;
  toggle_ready: (data: { ready: boolean }) => void;
  start_battle: () => void;
  submit_score: (data: { score: number | "?" }) => void;
  update_discussion_vote: (data: { score: number | "?" }) => void;
  attack_boss: (data: { damage: number }) => void;
  proceed_next_level: () => void;
  restart_game: () => void;
  player_performance: (data: {
    playerId: string;
    team: TeamType;
    estimationTime: number;
    score: number;
    ticketId?: string;
  }) => void;
  abandon_quest: () => void;
  force_reveal: () => void;
  update_timer_settings: (data: { timerSettings: TimerSettings }) => void;
  youtube_play: (data: { videoId: string; url: string }) => void;
  youtube_stop: () => void;
  advancePhaseNow: (data: { lobbyId: string; playerId: string }) => void;
  forceVotingProgression: (data: { lobbyId: string }) => void;
  player_pos: (data: { x: number; y: number }) => void;
  attack_player: (data: { targetId: string; damage: number }) => void;
  revive_start: (data: { targetId: string }) => void;
  revive_cancel: (data: { targetId: string }) => void;
  revive_tick: (data: { targetId: string }) => void;
  heal_party: () => void;
  player_jump: (data: { isJumping: boolean }) => void;
  boss_damage_player: (data: { playerId: string; damage: number }) => void;
  player_projectile: (data: {
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    emoji: string;
    targetPlayerId?: string;
  }) => void;
  // Reconnection events
  reconnect_with_token: (data: { reconnectToken: string }) => void;
  // Missed events recovery
  request_missed_events: (data: { lastSeq: number }) => void;
  // Minion interaction
  attack_minion: (data: { minionPlayerId: string }) => void;
  // Discussion finalization
  finalize_estimate: (data: { estimate: number }) => void;
  // Lobby magic/charge events
  player_charge: (data: { isCharging: boolean; chargePower?: number }) => void;
  // Battle events
  battle_emote: (data: { message: string; x: number; y: number }) => void;
  return_to_lobby: () => void;
  // Settings update
  update_estimation_settings: (data: { estimationSettings: EstimationSettings }) => void;
  // Class abilities
  use_ability: (data: { abilityId: string }) => void;
  // Items
  use_item: (data: { itemType: ItemType }) => void;
}

export interface TeamScores {
  developers: Record<string, number | "?">;
  qa: Record<string, number | "?">;
}

export interface TeamConsensus {
  developers: { hasConsensus: boolean; score?: number };
  qa: { hasConsensus: boolean; score?: number };
}

export interface ServerToClientEvents {
  lobby_created: (data: { lobby: Lobby; inviteLink: string }) => void;
  lobby_joined: (data: { lobby: Lobby; player: Player }) => void;
  // Phase 42-02b: `lobby_updated` retired. Server emits scoped fine-grained
  // events (session:*, combat:*, estimation:*) for every state mutation;
  // tsc --noEmit will catch any forgotten emit. See 42-02b-SUMMARY.md.
  // Phase 45-05B L6: legacy `avatar_selected` removed; replaced by
  // session:avatar_selected (declared below in the fine-grained block).
  lobby_player_pos: (data: {
    playerId: string;
    x: number;
    y: number;
    direction?: string;
  }) => void;
  lobby_player_jump: (data: { playerId: string; isJumping: boolean }) => void;
  // Phase 45-05B L7: chargePower optional on the broadcast to match the C→S
  // optional shape (player_charge). Server defaults to 0 in the emit.
  lobby_player_charge: (data: { playerId: string; isCharging: boolean; chargePower?: number }) => void;
  lobby_emote: (data: {
    playerId: string;
    message: string;
    x: number;
    y: number;
  }) => void;
  battle_emote: (data: {
    playerId: string;
    message: string;
    x: number;
    y: number;
  }) => void;
  player_joined: (data: { player: Player; lobby: Lobby }) => void;
  // Phase 45-03: player_left, score_submitted, scores_revealed, boss_defeated,
  // game_over, modifier_updated, voting_timeout, player_disconnected,
  // player_state_updated, player_attacked removed — superseded by fine-grained
  // session:* / combat:* / estimation:* events.
  battle_started: (data: { lobby: Lobby; boss: Boss }) => void;
  // Phase 45-05B L4/L5: legacy boss_attacked / boss_healed removed; superseded
  // by combat:boss_damaged / combat:boss_healed (fine-grained block below).
  quest_abandoned: (data: { lobby: Lobby }) => void;
  game_error: (data: { message: string; code?: string; tiedValues?: (number | "?")[] }) => void;
  host_transferred: (data: { oldHostId: string; newHostId: string; newHostName: string; reason: string }) => void;
  timer_updated: (data: { timerState: TimerState | null }) => void;
  youtube_play_synced: (data: { videoId: string; url: string }) => void;
  youtube_stop_synced: () => void;
  players_pos: (data: { positions: Record<string, Position> }) => void;
  // Phase 45-04: party_healed, revive_progress, revive_complete,
  // revive_cancelled removed — replaced by combat:player_healed +
  // combat:revival_started / revival_progress / revival_cancelled +
  // combat:player_revived (the gameState legacy revival path now emits
  // via eventBus, matching the CombatManager path).
  boss_ring_attack: (data: RingAttack) => void;
  player_projectile_fired: (data: {
    playerId: string;
    playerName: string;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    emoji: string;
    targetPlayerId?: string;
    projectileId: string;
  }) => void;
  // Reconnection events
  // Phase 45-03: player_reconnected removed — superseded by lobby_sync to the
  // reconnecting client. Other peers receive no fine-grained reconnection
  // signal today (no toast UX consumed this).
  lobby_sync: (data: LobbySync) => void;
  reconnect_response: (data: ReconnectResponse) => void;
  connection_lost: () => void;
  reconnect_attempt: (data: { attempt: number; maxAttempts: number; nextRetryIn: number }) => void;

  // Fine-grained session events
  'session:player_joined': (data: Sequenced<{ playerId: string; playerName: string; team: TeamType; avatar?: AvatarClass }>) => void;
  'session:player_left': (data: Sequenced<{ playerId: string }>) => void;
  'session:host_changed': (data: Sequenced<{ oldHostId: string; newHostId: string; newHostName: string }>) => void;
  'session:phase_changed': (data: Sequenced<{ oldPhase: GamePhase; newPhase: GamePhase; completedTickets?: CompletedTicket[] }>) => void;
  'session:team_changed': (data: Sequenced<{ playerId: string; oldTeam: TeamType; newTeam: TeamType }>) => void;
  'session:avatar_selected': (data: Sequenced<{ playerId: string; avatar: AvatarClass }>) => void;
  // Note: payload intentionally does not include hasSelectedAvatar — clients
  // infer the flipped-true transition from receipt of this event itself.

  // Phase 42-02b: New fine-grained events to absorb the retiring `lobby_updated` full-state push.
  'session:tickets_updated': (data: Sequenced<{ tickets: JiraTicket[] }>) => void;
  'session:player_ready_changed': (data: Sequenced<{ playerId: string; isReady: boolean }>) => void;
  'session:lobby_renamed': (data: Sequenced<{ name: string }>) => void;
  'session:settings_updated': (data: Sequenced<{ timerSettings?: TimerSettings; jiraSettings?: JiraSettings; estimationSettings?: EstimationSettings }>) => void;
  'session:game_reset': (data: Sequenced<{ lobby: Lobby }>) => void;
  'session:ticket_advanced': (data: Sequenced<{ currentTicket: JiraTicket }>) => void;

  // Fine-grained estimation events
  'estimation:vote_cast': (data: Sequenced<{ playerId: string; team: TeamType; hasVoted: boolean }>) => void;
  'estimation:votes_revealed': (data: Sequenced<{ votes: Record<string, number | '?'>; team: TeamType }>) => void;
  'estimation:consensus_reached': (data: Sequenced<{ team: TeamType; consensusValue: number }>) => void;
  'estimation:timer_started': (data: Sequenced<{ team: TeamType; endsAt: number; durationMs: number }>) => void;
  'estimation:timer_paused': (data: Sequenced<{ team: TeamType; remainingMs: number }>) => void;
  'estimation:timer_resumed': (data: Sequenced<{ team: TeamType; endsAt: number }>) => void;
  'estimation:timer_expired': (data: Sequenced<{ team: TeamType; votedCount: number; eligibleCount: number }>) => void;
  'estimation:estimate_forced': (data: Sequenced<{ team: TeamType; consensusValue: number }>) => void;
  'estimation:discussion_timer_started': (data: Sequenced<{ durationMs: number; endsAt: number }>) => void;
  'estimation:discussion_ended': (data: Sequenced<{ reason: string; finalEstimate: number }>) => void;
  // Phase 42-02b: Per-vote update during discussion phase (replaces lobby_updated for site websocket.ts:959).
  'estimation:discussion_vote_updated': (data: Sequenced<{ playerId: string; score: number | string }>) => void;

  // Fine-grained combat events
  'combat:boss_damaged': (data: Sequenced<{ playerId: string; damage: number; newHp: number }>) => void;
  'combat:boss_healed': (data: Sequenced<{ healAmount: number; newHp: number }>) => void;
  'combat:boss_enraged': (data: Sequenced<{ message: string }>) => void;
  'combat:boss_telegraph': (data: Sequenced<{ targetId?: string; attackType?: string; message: string; delayMs: number; visualEffect?: string; bossType?: string }>) => void;
  'combat:boss_phase_transition': (data: Sequenced<{ newPhase: number; previousPhase: number; message: string; bossType: string }>) => void;
  'combat:boss_defeated': (data: Sequenced<Record<never, never>>) => void;
  'combat:player_damaged': (data: Sequenced<{ playerId: string; damage: number; newHp: number; source: 'boss' | 'player' }>) => void;
  'combat:player_downed': (data: Sequenced<{ playerId: string; countdownSeconds: number }>) => void;
  'combat:player_revived': (data: Sequenced<{ playerId: string; reviverId: string; newHp: number }>) => void;
  'combat:revival_started': (data: Sequenced<{ reviverId: string; targetId: string; durationMs: number }>) => void;
  'combat:revival_progress': (data: Sequenced<{ reviverId: string; targetId: string; percent: number; remainingMs: number }>) => void;
  'combat:revival_cancelled': (data: Sequenced<{ reviverId: string; targetId: string; reason: string }>) => void;
  'combat:player_healed': (data: Sequenced<{ playerId: string; healerId: string; healAmount: number; newHp: number }>) => void;
  'combat:player_entered_battle': (data: Sequenced<{ playerId: string }>) => void;
  'combat:modifier_updated': (data: Sequenced<{ modifier: number }>) => void;
  'combat:countdown_started': (data: Sequenced<{ durationSeconds: number; startedAt: number }>) => void;
  'combat:countdown_tick': (data: Sequenced<{ remainingSeconds: number; multiplier: number }>) => void;
  'combat:countdown_complete': (data: Sequenced<{ finalMultiplier: number }>) => void;
  'combat:team_attack': (data: Sequenced<{ damage: number; multiplier: number; newBossHp: number }>) => void;
  'combat:minion_spawned': (data: Sequenced<{ playerId: string; avatar: AvatarClass; hp: number; maxHp: number }>) => void;
  'combat:minion_attack': (data: Sequenced<{ minionPlayerId: string; targetId: string; damage: number; attackType: string }>) => void;
  'combat:minion_heal_boss': (data: Sequenced<{ minionPlayerId: string; healAmount: number; newBossHp: number }>) => void;
  'combat:minion_damaged': (data: Sequenced<{ playerId: string; damage: number; newHp: number; attackerId: string }>) => void;
  'combat:minion_killed': (data: Sequenced<{ playerId: string; killerId: string; respawnInSeconds: number }>) => void;

  // Fine-grained progression events
  'progression:xp_awarded': (data: Sequenced<{
    playerId: string;
    amount: number;
    source: 'vote' | 'boss_damage' | 'consensus' | 'revival';
    newTotal: number;
  }>) => void;

  'progression:level_up': (data: Sequenced<{
    playerId: string;
    oldLevel: number;
    newLevel: number;
  }>) => void;

  'progression:sync': (data: Sequenced<{
    playerId: string;
    totalXP: number;
    currentLevel: number;
  }>) => void;

  // Class mastery events
  'class_mastery:xp_awarded': (data: Sequenced<{
    playerId: string;
    avatarClass: AvatarClass;
    amount: number;
    source: string;
    newTotal: number;
  }>) => void;

  'class_mastery:tier_up': (data: Sequenced<{
    playerId: string;
    avatarClass: AvatarClass;
    oldTier: string;
    newTier: string;
  }>) => void;

  'class_mastery:sync': (data: Sequenced<{
    playerId: string;
    masteryData: Record<string, { classXP: number; currentTier: string }>;
  }>) => void;

  // Ability events
  'ability:used': (data: Sequenced<{
    playerId: string;
    abilityId: string;
    abilityName: string;
    effectType: string;
    targetType: string;
  }>) => void;

  'ability:cooldown_started': (data: Sequenced<{
    playerId: string;
    abilityId: string;
    durationMs: number;
    expiresAt: number;
  }>) => void;

  'ability:effect_applied': (data: Sequenced<{
    playerId: string;
    abilityId: string;
    effectType: string;
    targetIds: string[];
    value: number;
    buffType?: import('./abilityTypes').BuffType;
    debuffType?: import('./abilityTypes').DebuffType;
    durationMs?: number;
  }>) => void;

  // Combo events
  'combo:triggered': (data: Sequenced<{
    comboId: string;
    comboName: string;
    triggeringPlayerId: string;
    participantPlayerIds: string[];
    damage: number;
    damageMultiplier: number;
    visualEffect: string;
  }>) => void;

  'combo:consensus_ultimate': (data: Sequenced<{
    damage: number;
    damageMultiplier: number;
    votingDurationMs: number;
  }>) => void;

  // Item events
  'item:awarded': (data: Sequenced<{
    playerId: string;
    itemType: ItemType;
    newCount: number;
  }>) => void;

  'item:used': (data: Sequenced<{
    playerId: string;
    itemType: ItemType;
    remainingCount: number;
  }>) => void;

  'item:effect_applied': (data: Sequenced<{
    playerId: string;
    itemType: ItemType;
    effectType: string;
    value: number;
    durationMs: number | null;
    targetIds: string[];
  }>) => void;

  // Stats events
  'stats:session_summary': (data: Sequenced<{
    summaries: Record<string, {
      totalVotes: number;
      consensusCount: number;
      averageVotingSpeedMs: number;
      totalDamageDealt: number;
      bossesDefeated: number;
      revives: number;
      deaths: number;
      itemsUsed: number;
    }>;
  }>) => void;

  // System events
  'system:full_state': (data: Sequenced<{ lobby: Lobby }>) => void;
  'system:missed_events': (data: { events: Array<{ event: string; data: unknown }> }) => void;

  // Server lifecycle events
  server_shutdown: (data: { message: string; reconnectDelayMs: number }) => void;
}

export const FIBONACCI_NUMBERS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

// Estimation scale types
export type EstimationScaleType = 'fibonacci' | 'doubling' | 'tshirt';

export interface EstimationScale {
  type: EstimationScaleType;
  name: string;
  options: (string | number)[];
  pointMapping?: Record<string, number>; // For T-shirt sizes
}

export const ESTIMATION_SCALES: Record<EstimationScaleType, EstimationScale> = {
  fibonacci: {
    type: 'fibonacci',
    name: 'Fibonacci',
    options: [1, 2, 3, 5, 8, 13, 21, 34, 55]
  },
  doubling: {
    type: 'doubling', 
    name: 'Doubling',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256]
  },
  tshirt: {
    type: 'tshirt',
    name: 'T-Shirt Sizes',
    options: ['XS', 'S', 'M', 'L', 'XL'],
    pointMapping: { 'XS': 1, 'S': 3, 'M': 5, 'L': 8, 'XL': 13 }
  }
};

/**
 * Validates a submitted estimation score on the server. Accepts the abstain
 * sentinel `'?'` or any numeric value that belongs to a built-in scale deck
 * (Fibonacci / doubling / T-shirt point mappings) or this lobby's custom
 * T-shirt mapping. A legitimate client only ever submits a value from its
 * configured deck — all of which are covered here — so this never rejects a
 * real vote, while rejecting arbitrary/out-of-range/NaN/non-numeric values
 * that would corrupt consensus math and the reveal grid. (Security: M-1)
 */
export function isValidEstimationScore(
  score: unknown,
  settings?: EstimationSettings
): score is number | '?' {
  if (score === '?') return true;
  if (typeof score !== 'number' || !Number.isFinite(score)) return false;
  for (const scale of Object.values(ESTIMATION_SCALES)) {
    for (const opt of scale.options) {
      if (opt === score) return true;
    }
    if (scale.pointMapping) {
      for (const pts of Object.values(scale.pointMapping)) {
        if (pts === score) return true;
      }
    }
  }
  if (settings?.customTshirtMapping) {
    for (const pts of Object.values(settings.customTshirtMapping)) {
      if (pts === score) return true;
    }
  }
  return false;
}

export interface CharacterStats {
  str: number; // Strength - Physical damage, HP
  dex: number; // Dexterity - Attack speed, critical chance
  con: number; // Constitution - HP, damage resistance
  wis: number; // Wisdom - Mana, spell resistance
  int: number; // Intelligence - Spell damage, mana
  cha: number; // Charisma - Team buffs, leadership bonuses
}

export type ClassRole = 'tank' | 'healer' | 'dps';

export interface ClassDef {
  name: string;
  description: string;
  color: string;
  stats: CharacterStats;
  specialties: string[];
  /** Derives HEALER_CLASSES: role === 'healer' */
  role: ClassRole;
  /** Base damage before mastery multiplier — matches the old CombatManager switch */
  baseDamage: number;
  /** Emoji icon used in all getClassIcon lookups (never an image path) */
  icon: string;
}

export const AVATAR_CLASSES: Record<AvatarClass, ClassDef> = {
  ranger: {
    name: "Ranger",
    description: "Swift archer with keen eyes",
    color: "#228B22",
    stats: { str: 12, dex: 16, con: 10, wis: 14, int: 12, cha: 14 },
    specialties: ["Ranged Combat", "Tracking", "Nature Magic"],
    role: 'dps',
    baseDamage: 20,
    icon: '🏹',
  },
  rogue: {
    name: "Rogue",
    description: "Stealthy assassin",
    color: "#2F4F4F",
    stats: { str: 10, dex: 18, con: 8, wis: 12, int: 14, cha: 16 },
    specialties: ["Stealth", "Critical Strikes", "Lockpicking"],
    role: 'dps',
    baseDamage: 20,
    icon: '🗡️',
  },
  bard: {
    name: "Bard",
    description: "Musical storyteller",
    color: "#9370DB",
    stats: { str: 6, dex: 12, con: 10, wis: 12, int: 16, cha: 22 },
    specialties: ["Support Magic", "Inspiration", "Versatility"],
    role: 'healer',
    baseDamage: 12,
    icon: '🎵',
  },
  sorcerer: {
    name: "Sorcerer",
    description: "Raw magic wielder",
    color: "#FF4500",
    stats: { str: 6, dex: 10, con: 12, wis: 8, int: 22, cha: 20 },
    specialties: ["Elemental Magic", "Raw Power", "Metamagic"],
    role: 'dps',
    baseDamage: 25,
    icon: '🔥',
  },
  wizard: {
    name: "Wizard",
    description: "Learned spellcaster",
    color: "#4169E1",
    stats: { str: 6, dex: 8, con: 10, wis: 16, int: 22, cha: 16 },
    specialties: ["Arcane Knowledge", "Spell Variety", "Research"],
    role: 'dps',
    baseDamage: 25,
    icon: '🧙',
  },
  warrior: {
    name: "Warrior",
    description: "Brave melee fighter",
    color: "#B22222",
    stats: { str: 20, dex: 10, con: 16, wis: 8, int: 6, cha: 18 },
    specialties: ["Melee Combat", "Defense", "Leadership"],
    role: 'tank',
    baseDamage: 15,
    icon: '⚔️',
  },
  paladin: {
    name: "Paladin",
    description: "Holy knight",
    color: "#FFD700",
    stats: { str: 16, dex: 8, con: 14, wis: 12, int: 10, cha: 18 },
    specialties: ["Divine Magic", "Protection", "Healing"],
    role: 'healer',
    baseDamage: 15,
    icon: '🛡️',
  },
  cleric: {
    name: "Cleric",
    description: "Divine healer",
    color: "#F0F8FF",
    stats: { str: 10, dex: 6, con: 12, wis: 20, int: 12, cha: 18 },
    specialties: ["Healing Magic", "Divine Power", "Support"],
    role: 'healer',
    baseDamage: 12,
    icon: '✨',
  },
  oathbreaker: {
    name: "Oathbreaker",
    description: "Fallen paladin wielding dark power",
    color: "#8A2BE2",
    stats: { str: 16, dex: 10, con: 14, wis: 8, int: 12, cha: 18 },
    specialties: ["Dark Magic", "Corruption", "Fear Aura"],
    role: 'tank',
    baseDamage: 15,
    icon: '💀',
  },
  monk: {
    name: "Monk",
    description: "Disciplined martial artist",
    color: "#8B4513",
    stats: { str: 14, dex: 16, con: 14, wis: 18, int: 10, cha: 12 },
    specialties: ["Martial Arts", "Inner Peace", "Chi Manipulation"],
    role: 'dps',
    baseDamage: 20,
    icon: '🥋',
  },
};

export const TEAM_NAMES: Record<TeamType, string> = {
  developers: "Developers",
  qa: "QA Engineers",
  spectators: "Spectators",
};
