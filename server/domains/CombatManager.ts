/**
 * CombatManager Domain
 *
 * Manages battle mechanics, health tracking, and revival systems.
 * Owns the lifecycle of combat encounters, boss state, and player combat states.
 *
 * Responsibilities:
 * - Initialize and manage combat encounters
 * - Track boss HP, enrage states, and attack patterns
 * - Track player HP, downed states, and ghost mode
 * - Manage threat-based boss targeting
 * - Handle revival channeling and interruption
 * - Emit combat:* events for cross-domain coordination
 */

import { ScopedEventBus } from '../events';
import type {
  SessionPlayerLeftPayload,
  SessionLobbyDestroyedPayload,
  EstimationVoteCastPayload,
} from '../events';
import { TeamType, AvatarClass } from '../../shared/gameEvents';
import {
  CombatNotActiveError,
  PlayerNotInCombatError,
  RevivalNotAllowedError,
} from '../errors/CombatErrors';

/**
 * Dependencies required by CombatManager
 */
export interface CombatManagerDeps {
  eventBus: ScopedEventBus;
  getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;
  getPlayerClass?: (lobbyId: string, playerId: string) => AvatarClass | null;
}

// =============================================================================
// State Types
// =============================================================================

/**
 * Player combat state enum
 */
type PlayerCombatState = 'fighting' | 'downed' | 'ghost';

/**
 * Threat table entry for boss targeting
 */
interface ThreatEntry {
  playerId: string;
  threat: number;
}

/**
 * Player combat state tracking
 */
interface PlayerCombat {
  playerId: string;
  hp: number;
  maxHp: number;
  isDowned: boolean;
  downedAt?: number;
  downTimerHandle?: NodeJS.Timeout;
  hasBeenRevived: boolean;
  combatState: PlayerCombatState;
  position?: { x: number; y: number };
}

/**
 * Boss combat state tracking
 */
interface BossCombat {
  bossId: string;
  bossName: string;
  hp: number;
  maxHp: number;
  isEnraged: boolean;
  attackTimerHandle?: NodeJS.Timeout;
  lastAttackAt: number;
  threatTable: Map<string, ThreatEntry>;
}

/**
 * Revival session for channel-based revival tracking
 */
interface RevivalSession {
  reviverId: string;
  targetId: string;
  lobbyId: string;
  startedAt: number;
  channelDurationMs: number;
  intervalHandle: NodeJS.Timeout;
}

/**
 * Lobby combat state
 */
interface LobbyCombatState {
  lobbyId: string;
  boss?: BossCombat;
  players: Map<string, PlayerCombat>;
  battleModifier: number;
  battleStartTime?: number;
  modifierIntervalHandle?: NodeJS.Timeout;
  ticketIndex: number;
}

// =============================================================================
// CombatManager Class
// =============================================================================

/**
 * CombatManager manages combat encounters and battle mechanics
 */
export class CombatManager {
  // State Maps
  private combatStates = new Map<string, LobbyCombatState>();
  private revivalSessions = new Map<string, RevivalSession>();

  // HP and damage tuning
  private readonly BASE_HP_PER_PLAYER = 1000;
  private readonly PLAYER_MAX_HP = 100;
  private readonly LIGHT_DAMAGE = 25;   // 4 hits to down
  private readonly HEAVY_DAMAGE = 40;   // 2.5 hits to down
  private readonly SPECIAL_DAMAGE = 50; // 2 hits to down
  private readonly HEAL_AMOUNT = 25;    // Click-to-heal amount

  // Timing
  private readonly BATTLE_ENTRY_TRANSITION_MS = 1500;
  private readonly DOWN_TIMER_MS = 10000;           // 10 seconds
  private readonly REVIVAL_CHANNEL_DURATION_MS = 2500;
  private readonly REVIVAL_DISTANCE_THRESHOLD = 10;
  private readonly MODIFIER_INTERVAL_MS = 10000;
  private readonly MODIFIER_INCREMENT = 0.1;

  // Boss attack timing
  private readonly BOSS_ATTACK_BASE_INTERVAL_MS = 5000;
  private readonly BOSS_ATTACK_ENRAGED_INTERVAL_MS = 3000;
  private readonly BOSS_ATTACK_VARIANCE = 0.3;      // ±30%
  private readonly BOSS_INITIAL_ATTACK_DELAY_MS = 3000;

  // Healer classes that can revive
  private readonly HEALER_CLASSES: AvatarClass[] = ['cleric', 'paladin', 'bard'];

  // Dependencies
  private readonly eventBus: ScopedEventBus;
  private readonly getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;
  private readonly getPlayerClass?: (lobbyId: string, playerId: string) => AvatarClass | null;

  constructor(deps: CombatManagerDeps) {
    this.eventBus = deps.eventBus;
    this.getPlayerTeam = deps.getPlayerTeam;
    this.getPlayerClass = deps.getPlayerClass;

    // Event subscriptions will be added in Plan 04-06
  }

  // =============================================================================
  // Public Methods (stubs for now)
  // =============================================================================

  /**
   * Initialize combat state for a lobby
   * TODO: Implement in Plan 04-02
   */
  initializeCombat(lobbyId: string, players: Array<{id: string; team: TeamType}>, ticketIndex?: number): void {
    // TODO: Implement in Plan 04-02
  }

  /**
   * Player attacks boss (click-to-attack)
   * TODO: Implement in Plan 04-02
   */
  playerAttackBoss(lobbyId: string, playerId: string): number {
    // TODO: Implement in Plan 04-02
    return 0;
  }

  /**
   * Player heals a teammate (healer-only)
   * TODO: Implement in Plan 04-04
   */
  playerHealTeammate(lobbyId: string, healerId: string, targetId: string): void {
    // TODO: Implement in Plan 04-04
  }

  /**
   * Start revival channel for downed player
   * TODO: Implement in Plan 04-05
   */
  startRevival(lobbyId: string, reviverId: string, targetId: string): boolean {
    // TODO: Implement in Plan 04-05
    return false;
  }

  /**
   * Cancel ongoing revival session
   * TODO: Implement in Plan 04-05
   */
  cancelRevival(reviverId: string, reason: string): void {
    // TODO: Implement in Plan 04-05
  }

  /**
   * Get current combat state for a lobby
   */
  getCombatState(lobbyId: string): LobbyCombatState | null {
    return this.combatStates.get(lobbyId) ?? null;
  }

  /**
   * Clean up combat state when lobby is destroyed
   */
  cleanupLobby(lobbyId: string): void {
    // TODO: Implement timer cleanup in Plan 04-04/05
    this.combatStates.delete(lobbyId);
  }
}
