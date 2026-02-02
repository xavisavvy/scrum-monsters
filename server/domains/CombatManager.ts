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
   */
  initializeCombat(lobbyId: string, players: Array<{id: string; team: TeamType}>, ticketIndex: number = 0): void {
    // Filter out spectators for HP calculation
    const activePlayers = players.filter(p => p.team !== 'spectators');
    const activePlayerCount = activePlayers.length;

    // Calculate boss HP with ticket scaling
    const difficultyMultiplier = 1 + (ticketIndex * 0.2);
    const bossMaxHp = Math.floor(this.BASE_HP_PER_PLAYER * activePlayerCount * difficultyMultiplier);

    // Create boss combat state
    const bossId = `boss-${lobbyId}-${Date.now()}`;
    const boss: BossCombat = {
      bossId,
      bossName: 'Boss',
      hp: bossMaxHp,
      maxHp: bossMaxHp,
      isEnraged: false,
      lastAttackAt: 0,
      threatTable: new Map(),
    };

    // Create player combat states (excluding spectators)
    const playerStates = new Map<string, PlayerCombat>();
    for (const player of activePlayers) {
      playerStates.set(player.id, {
        playerId: player.id,
        hp: this.PLAYER_MAX_HP,
        maxHp: this.PLAYER_MAX_HP,
        isDowned: false,
        hasBeenRevived: false,
        combatState: 'fighting',
      });
    }

    // Create lobby combat state
    const combatState: LobbyCombatState = {
      lobbyId,
      boss,
      players: playerStates,
      battleModifier: 1.0,
      ticketIndex,
    };

    this.combatStates.set(lobbyId, combatState);

    // Emit battle initialized event
    this.eventBus.emit('combat:battle_initialized', {
      lobbyId,
      bossId,
      bossMaxHp,
    });
  }

  /**
   * Player attacks boss (click-to-attack)
   */
  playerAttackBoss(lobbyId: string, playerId: string): number {
    // Get combat state
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      throw new CombatNotActiveError(lobbyId);
    }

    // Check player is in combat and fighting
    const playerState = combatState.players.get(playerId);
    if (!playerState || playerState.combatState !== 'fighting') {
      throw new PlayerNotInCombatError(playerId);
    }

    // Get player class and calculate damage
    const playerClass = this.getPlayerClass?.(lobbyId, playerId);
    const baseDamage = this.getClassBaseDamage(playerClass);
    const damage = Math.floor(baseDamage * combatState.battleModifier);

    // Reduce boss HP
    const boss = combatState.boss;
    boss.hp = Math.max(0, boss.hp - damage);

    // Update threat table
    const existingThreat = boss.threatTable.get(playerId);
    if (existingThreat) {
      existingThreat.threat += damage;
    } else {
      boss.threatTable.set(playerId, {
        playerId,
        threat: damage,
      });
    }

    // Emit boss damaged event
    this.eventBus.emit('combat:boss_damaged', {
      lobbyId,
      playerId,
      damage,
      bossHealth: boss.hp,
    });

    // Check for enrage (50% HP threshold)
    if (!boss.isEnraged && boss.hp <= boss.maxHp * 0.5 && boss.hp > 0) {
      boss.isEnraged = true;
      this.eventBus.emit('combat:boss_enraged', {
        lobbyId,
        message: 'The boss has become enraged!',
      });
    }

    // Check for boss defeat
    if (boss.hp <= 0) {
      // Clear attack timer if running (placeholder for Plan 04-03)
      if (boss.attackTimerHandle) {
        clearTimeout(boss.attackTimerHandle);
        boss.attackTimerHandle = undefined;
      }

      this.eventBus.emit('combat:boss_defeated', {
        lobbyId,
        bossId: boss.bossId,
      });
    }

    return damage;
  }

  /**
   * Get base damage for a class
   */
  private getClassBaseDamage(avatarClass: AvatarClass | null | undefined): number {
    switch (avatarClass) {
      // Tank classes - lower damage
      case 'warrior':
      case 'paladin':
      case 'oathbreaker':
        return 15;

      // DPS classes - standard damage
      case 'ranger':
      case 'rogue':
      case 'monk':
        return 20;

      // Glass cannon - high damage
      case 'sorcerer':
      case 'wizard':
        return 25;

      // Healer classes - lowest damage
      case 'cleric':
      case 'bard':
        return 12;

      default:
        return 20; // Default to standard DPS damage
    }
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
