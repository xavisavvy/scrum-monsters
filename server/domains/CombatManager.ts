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
  NotHealerClassError,
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
   * Start boss attack loop (recursive setTimeout)
   */
  startBossAttackLoop(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      return; // Combat not active
    }

    // Schedule first attack after grace period
    const attackHandle = setTimeout(() => {
      this.performBossAttack(lobbyId);
    }, this.BOSS_INITIAL_ATTACK_DELAY_MS);

    combatState.boss.attackTimerHandle = attackHandle;
  }

  /**
   * Perform a boss attack and schedule the next one
   */
  private performBossAttack(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      return; // Combat ended
    }

    const boss = combatState.boss;

    // Stop if boss is defeated
    if (boss.hp <= 0) {
      return;
    }

    // Select attack type
    const attackType = this.selectAttackType(boss.isEnraged);

    // Check if AoE
    const isAoE = this.isAoEAttack(boss.isEnraged);

    if (isAoE) {
      this.performAoEAttack(lobbyId, attackType);
    } else {
      // Select single target via threat
      const targetId = this.selectThreatTarget(boss.threatTable, combatState.players);
      if (targetId) {
        this.attackSingleTarget(lobbyId, targetId, attackType);
      }
    }

    // Update last attack time
    boss.lastAttackAt = Date.now();

    // Schedule next attack
    this.scheduleNextAttack(lobbyId);
  }

  /**
   * Select attack type based on enrage state
   */
  private selectAttackType(isEnraged: boolean): 'light' | 'heavy' | 'special' {
    const roll = Math.random();

    if (isEnraged) {
      // Enraged: light 40%, heavy 35%, special 25%
      if (roll < 0.4) return 'light';
      if (roll < 0.75) return 'heavy';
      return 'special';
    } else {
      // Normal: light 60%, heavy 30%, special 10%
      if (roll < 0.6) return 'light';
      if (roll < 0.9) return 'heavy';
      return 'special';
    }
  }

  /**
   * Check if attack should be AoE
   */
  private isAoEAttack(isEnraged: boolean): boolean {
    const roll = Math.random();
    return isEnraged ? roll < 0.25 : roll < 0.15;
  }

  /**
   * Select target based on threat table
   */
  private selectThreatTarget(threatTable: Map<string, ThreatEntry>, players: Map<string, PlayerCombat>): string | null {
    // Filter to alive fighting players
    const alivePlayers = Array.from(players.values()).filter(p => p.combatState === 'fighting');

    if (alivePlayers.length === 0) {
      return null;
    }

    // Get threat entries for alive players
    const aliveThreats = Array.from(threatTable.values())
      .filter(entry => {
        const player = players.get(entry.playerId);
        return player && player.combatState === 'fighting';
      })
      .sort((a, b) => b.threat - a.threat); // Sort by threat descending

    // If no threat history, pick random
    if (aliveThreats.length === 0) {
      const randomIndex = Math.floor(Math.random() * alivePlayers.length);
      return alivePlayers[randomIndex].playerId;
    }

    const roll = Math.random();

    if (roll < 0.7) {
      // 70% chance: highest threat
      return aliveThreats[0].playerId;
    } else if (roll < 0.9 && aliveThreats.length > 1) {
      // 20% chance: second highest
      return aliveThreats[1].playerId;
    } else {
      // 10% chance: random alive player
      const randomIndex = Math.floor(Math.random() * alivePlayers.length);
      return alivePlayers[randomIndex].playerId;
    }
  }

  /**
   * Perform AoE attack hitting all fighting players
   */
  private performAoEAttack(lobbyId: string, attackType: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      return;
    }

    // Get all fighting players
    const fightingPlayers = Array.from(combatState.players.values()).filter(
      p => p.combatState === 'fighting'
    );

    if (fightingPlayers.length === 0) {
      return;
    }

    // For heavy/special, telegraph first
    if (attackType === 'heavy' || attackType === 'special') {
      const message = attackType === 'heavy'
        ? 'Boss winds up a heavy blow...'
        : 'Boss is charging a devastating attack...';

      this.eventBus.emit('combat:boss_telegraph', {
        lobbyId,
        message,
        delayMs: 1000,
      });

      // Apply damage after delay
      setTimeout(() => {
        const damage = this.getAttackDamage(attackType, combatState.boss!.isEnraged);

        fightingPlayers.forEach(player => {
          this.applyDamageToPlayer(lobbyId, player.playerId, damage);
        });
      }, 1000);
    } else {
      // Light attack: instant damage
      const damage = this.getAttackDamage(attackType, combatState.boss.isEnraged);

      fightingPlayers.forEach(player => {
        this.applyDamageToPlayer(lobbyId, player.playerId, damage);
      });
    }
  }

  /**
   * Attack a single target
   */
  private attackSingleTarget(lobbyId: string, targetId: string, attackType: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      return;
    }

    const damage = this.getAttackDamage(attackType, combatState.boss.isEnraged);

    // For heavy/special, telegraph first
    if (attackType === 'heavy' || attackType === 'special') {
      const message = attackType === 'heavy'
        ? 'Boss winds up a heavy blow...'
        : 'Boss is charging a devastating attack...';

      this.eventBus.emit('combat:boss_telegraph', {
        lobbyId,
        message,
        delayMs: 1000,
      });

      // Apply damage after delay
      setTimeout(() => {
        this.applyDamageToPlayer(lobbyId, targetId, damage);
      }, 1000);
    } else {
      // Light attack: instant damage
      this.applyDamageToPlayer(lobbyId, targetId, damage);
    }
  }

  /**
   * Get damage amount for attack type
   */
  private getAttackDamage(attackType: string, isEnraged: boolean): number {
    // Enrage does not increase damage, only frequency
    switch (attackType) {
      case 'light':
        return this.LIGHT_DAMAGE;
      case 'heavy':
        return this.HEAVY_DAMAGE;
      case 'special':
        return this.SPECIAL_DAMAGE;
      default:
        return this.LIGHT_DAMAGE;
    }
  }

  /**
   * Schedule next boss attack with variable timing
   */
  private scheduleNextAttack(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      return;
    }

    const boss = combatState.boss;

    // Check if boss is defeated
    if (boss.hp <= 0) {
      return;
    }

    // Calculate variable interval
    const baseInterval = boss.isEnraged
      ? this.BOSS_ATTACK_ENRAGED_INTERVAL_MS
      : this.BOSS_ATTACK_BASE_INTERVAL_MS;

    // Apply variance: ±30%
    const variance = (Math.random() * 2 - 1) * this.BOSS_ATTACK_VARIANCE; // Range: -0.3 to +0.3
    const interval = Math.floor(baseInterval * (1 + variance));

    // Schedule next attack
    const attackHandle = setTimeout(() => {
      this.performBossAttack(lobbyId);
    }, interval);

    boss.attackTimerHandle = attackHandle;
  }

  /**
   * Apply damage to a player and handle down state
   */
  applyDamageToPlayer(lobbyId: string, playerId: string, damage: number): void {
    // Get combat state
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      throw new CombatNotActiveError(lobbyId);
    }

    // Get player state
    const playerState = combatState.players.get(playerId);
    if (!playerState) {
      throw new PlayerNotInCombatError(playerId);
    }

    // Reduce HP, capped at 0
    const oldHp = playerState.hp;
    playerState.hp = Math.max(0, playerState.hp - damage);

    // Emit player damaged event
    this.eventBus.emit('combat:player_damaged', {
      lobbyId,
      playerId,
      damage,
      playerHealth: playerState.hp,
    });

    // Check if player is downed
    if (playerState.hp === 0 && oldHp > 0) {
      this.downPlayer(lobbyId, playerId);
    }
  }

  /**
   * Transition player to downed state with 10-second timer
   */
  downPlayer(lobbyId: string, playerId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      return; // Combat ended
    }

    const playerState = combatState.players.get(playerId);
    if (!playerState) {
      return; // Player not in combat
    }

    // Transition to downed
    playerState.combatState = 'downed';
    playerState.isDowned = true;
    playerState.downedAt = Date.now();

    // Emit downed event
    this.eventBus.emit('combat:player_downed', {
      lobbyId,
      playerId,
      countdownSeconds: 10,
    });

    // Start 10-second timer
    const timerHandle = setTimeout(() => {
      this.permanentlyDownPlayer(lobbyId, playerId);
    }, this.DOWN_TIMER_MS);

    playerState.downTimerHandle = timerHandle;
  }

  /**
   * Permanently down a player (transition to ghost)
   */
  permanentlyDownPlayer(lobbyId: string, playerId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      return; // Combat ended
    }

    const playerState = combatState.players.get(playerId);
    if (!playerState) {
      return; // Player not in combat
    }

    // Clear timer handle
    if (playerState.downTimerHandle) {
      clearTimeout(playerState.downTimerHandle);
      playerState.downTimerHandle = undefined;
    }

    // Transition to ghost
    playerState.combatState = 'ghost';

    // Emit permanent down event
    this.eventBus.emit('combat:player_permanently_downed', {
      lobbyId,
      playerId,
      message: `${playerId} has become a ghost`,
    });

    // Cancel any revival sessions targeting this player (will be implemented in Plan 04-05)
  }

  /**
   * Player heals a teammate (healer-only)
   */
  playerHealTeammate(lobbyId: string, healerId: string, targetId: string): void {
    // Get combat state
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      throw new CombatNotActiveError(lobbyId);
    }

    // Get healer state
    const healerState = combatState.players.get(healerId);
    if (!healerState) {
      throw new PlayerNotInCombatError(healerId);
    }

    // Check healer is fighting
    if (healerState.combatState !== 'fighting') {
      throw new PlayerNotInCombatError(healerId);
    }

    // Validate healer class
    if (this.getPlayerClass) {
      const healerClass = this.getPlayerClass(lobbyId, healerId);
      if (!healerClass || !this.HEALER_CLASSES.includes(healerClass)) {
        throw new NotHealerClassError(healerId, healerClass ?? 'unknown');
      }
    }

    // Get target state
    const targetState = combatState.players.get(targetId);
    if (!targetState) {
      throw new PlayerNotInCombatError(targetId);
    }

    // Check target is fighting
    if (targetState.combatState !== 'fighting') {
      throw new PlayerNotInCombatError(targetId);
    }

    // Heal target, capped at maxHp
    const oldHp = targetState.hp;
    targetState.hp = Math.min(targetState.maxHp, targetState.hp + this.HEAL_AMOUNT);
    const actualHealAmount = targetState.hp - oldHp;

    // Emit healed event
    this.eventBus.emit('combat:player_healed', {
      lobbyId,
      playerId: targetId,
      healerId,
      healAmount: actualHealAmount,
      newHealth: targetState.hp,
    });
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
    const combatState = this.combatStates.get(lobbyId);

    if (combatState) {
      // Clear boss attack timer
      if (combatState.boss?.attackTimerHandle) {
        clearTimeout(combatState.boss.attackTimerHandle);
        combatState.boss.attackTimerHandle = undefined;
      }

      // Clear all player down timers
      for (const player of combatState.players.values()) {
        if (player.downTimerHandle) {
          clearTimeout(player.downTimerHandle);
          player.downTimerHandle = undefined;
        }
      }

      // TODO: Clear other timers in Plan 04-05 (revival sessions, modifier interval)
    }

    this.combatStates.delete(lobbyId);
  }
}
