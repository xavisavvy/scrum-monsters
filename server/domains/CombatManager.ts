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
  EstimationFullConsensusReachedPayload,
  MinionState,
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
  minions: Map<string, MinionState>;
  minionAttackIntervalHandle?: NodeJS.Timeout;
  battleModifier: number;
  battleStartTime?: number;
  modifierIntervalHandle?: NodeJS.Timeout;
  ticketIndex: number;
  countdownActive: boolean;
  countdownStartedAt?: number;
  countdownIntervalHandle?: NodeJS.Timeout;
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

  // Countdown constants
  private readonly COUNTDOWN_DURATION_SECONDS = 10;
  private readonly MAX_MULTIPLIER = 3.0;
  private readonly MIN_MULTIPLIER = 1.5;

  // Minion constants
  private readonly MINION_BASE_HP = 50;
  private readonly MINION_HP_SCALE_PER_VOTER = 10;
  private readonly MINION_ATTACK_DAMAGE = 15;
  private readonly MINION_BOSS_HEAL = 25;
  private readonly MINION_ATTACK_INTERVAL_MS = 4000;

  // Dependencies
  private readonly eventBus: ScopedEventBus;
  private readonly getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;
  private readonly getPlayerClass?: (lobbyId: string, playerId: string) => AvatarClass | null;

  constructor(deps: CombatManagerDeps) {
    this.eventBus = deps.eventBus;
    this.getPlayerTeam = deps.getPlayerTeam;
    this.getPlayerClass = deps.getPlayerClass;

    // Subscribe to cross-domain events
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
    this.eventBus.on('session:lobby_destroyed', this.handleLobbyDestroyed.bind(this));
    this.eventBus.on(
      'estimation:full_consensus_reached',
      this.handleFullConsensus.bind(this)
    );
  }

  // =============================================================================
  // Countdown Methods
  // =============================================================================

  /**
   * Calculate damage multiplier based on remaining countdown time
   * Linear interpolation from MAX_MULTIPLIER at 10s to MIN_MULTIPLIER at 0s
   */
  private calculateCountdownMultiplier(remainingSeconds: number): number {
    const t = remainingSeconds / this.COUNTDOWN_DURATION_SECONDS;
    return this.MIN_MULTIPLIER + (this.MAX_MULTIPLIER - this.MIN_MULTIPLIER) * t;
  }

  /**
   * Start the countdown timer when all players have voted
   */
  public startCountdown(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || combatState.countdownActive) return;

    combatState.countdownActive = true;
    combatState.countdownStartedAt = Date.now();

    this.eventBus.emit('combat:countdown_started', {
      lobbyId,
      durationSeconds: this.COUNTDOWN_DURATION_SECONDS,
      startedAt: combatState.countdownStartedAt,
    });

    // Start tick interval (every 1 second)
    combatState.countdownIntervalHandle = setInterval(() => {
      this.tickCountdown(lobbyId);
    }, 1000);
  }

  /**
   * Process countdown tick - emit remaining time and multiplier
   */
  private tickCountdown(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.countdownActive) return;

    const elapsed = Math.floor(
      (Date.now() - combatState.countdownStartedAt!) / 1000
    );
    const remaining = this.COUNTDOWN_DURATION_SECONDS - elapsed;
    const multiplier = this.calculateCountdownMultiplier(remaining);

    if (remaining <= 0) {
      // Countdown complete
      this.completeCountdown(lobbyId, multiplier);
    } else {
      this.eventBus.emit('combat:countdown_tick', {
        lobbyId,
        remainingSeconds: remaining,
        multiplier,
      });
    }
  }

  /**
   * Complete the countdown - clear interval and emit complete event
   */
  private completeCountdown(lobbyId: string, finalMultiplier: number): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) return;

    // Clear interval
    if (combatState.countdownIntervalHandle) {
      clearInterval(combatState.countdownIntervalHandle);
      combatState.countdownIntervalHandle = undefined;
    }

    combatState.countdownActive = false;

    this.eventBus.emit('combat:countdown_complete', {
      lobbyId,
      finalMultiplier,
    });

    // Apply team attack damage after brief delay for animation
    setTimeout(() => {
      this.applyTeamAttack(lobbyId, finalMultiplier);
    }, 500);
  }

  /**
   * Handle full consensus event - triggers countdown
   */
  private handleFullConsensus(payload: EstimationFullConsensusReachedPayload): void {
    const { lobbyId } = payload;
    this.startCountdown(lobbyId);
  }

  // =============================================================================
  // Cross-Domain Event Handlers
  // =============================================================================

  /**
   * Handle vote cast event - triggers battle entry
   */
  private handleVoteCast(payload: EstimationVoteCastPayload): void {
    const { lobbyId, playerId } = payload;

    // Get combat state for lobby
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) {
      return; // Combat not initialized yet
    }

    // Check if player is in combat state
    const playerState = combatState.players.get(playerId);
    if (!playerState) {
      return; // Player not in combat
    }

    // Emit player entered battle event
    this.eventBus.emit('combat:player_entered_battle', {
      lobbyId,
      playerId,
      transitionDurationMs: this.BATTLE_ENTRY_TRANSITION_MS,
    });

    // If this is the first player entry, start combat loops
    if (!combatState.battleStartTime) {
      combatState.battleStartTime = Date.now();

      // Start boss attack loop
      this.startBossAttackLoop(lobbyId);

      // Start modifier loop
      this.startModifierLoop(lobbyId);

      // Emit battle started event
      this.eventBus.emit('combat:battle_started', {
        lobbyId,
        bossId: combatState.boss.bossId,
      });
    }
  }

  /**
   * Handle player left event - cleanup player from combat
   */
  private handlePlayerLeft(payload: SessionPlayerLeftPayload): void {
    const { lobbyId, playerId } = payload;

    // Get combat state
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      return; // No combat for this lobby
    }

    // Cancel any revival sessions involving this player
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.reviverId === playerId || session.targetId === playerId) {
        this.cancelRevivalSession(sessionKey, 'player_left');
      }
    }

    // Remove player from combat state
    const playerState = combatState.players.get(playerId);
    if (playerState) {
      // Clear down timer if active
      if (playerState.downTimerHandle) {
        clearTimeout(playerState.downTimerHandle);
        playerState.downTimerHandle = undefined;
      }

      // Remove from threat table
      combatState.boss?.threatTable.delete(playerId);

      // Remove from players map
      combatState.players.delete(playerId);
    }
  }

  /**
   * Handle lobby destroyed event - cleanup all combat state
   */
  private handleLobbyDestroyed(payload: SessionLobbyDestroyedPayload): void {
    const { lobbyId } = payload;
    this.cleanupLobby(lobbyId);
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

    // Initialize minions for spectators
    const spectators = players.filter(p => p.team === 'spectators');
    const voterCount = activePlayers.length;
    const minionMaxHp = this.MINION_BASE_HP + (voterCount * this.MINION_HP_SCALE_PER_VOTER);

    const minionStates = new Map<string, MinionState>();
    for (const spectator of spectators) {
      const minionState: MinionState = {
        playerId: spectator.id,
        hp: minionMaxHp,
        maxHp: minionMaxHp,
        isAlive: true,
      };
      minionStates.set(spectator.id, minionState);

      // Emit spawn event for each minion
      this.eventBus.emit('combat:minion_spawned', {
        lobbyId,
        playerId: spectator.id,
        avatar: 'warrior', // Would get from session in full implementation
        hp: minionMaxHp,
        maxHp: minionMaxHp,
      });
    }

    // Create lobby combat state
    const combatState: LobbyCombatState = {
      lobbyId,
      boss,
      players: playerStates,
      minions: minionStates,
      battleModifier: 1.0,
      ticketIndex,
      countdownActive: false,
    };

    this.combatStates.set(lobbyId, combatState);

    // Emit battle initialized event
    this.eventBus.emit('combat:battle_initialized', {
      lobbyId,
      bossId,
      bossMaxHp,
    });

    // Start minion attack loop if there are spectators
    if (spectators.length > 0) {
      this.startMinionAttackLoop(lobbyId);
    }
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
   * Apply team attack damage when countdown completes
   * Calculates combined player damage multiplied by countdown multiplier
   */
  private applyTeamAttack(lobbyId: string, multiplier: number): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) return;

    // Calculate base team damage (sum of all fighting player base damages)
    let baseDamage = 0;
    for (const player of combatState.players.values()) {
      if (player.combatState === 'fighting') {
        const playerClass = this.getPlayerClass?.(lobbyId, player.playerId);
        baseDamage += this.getClassBaseDamage(playerClass);
      }
    }

    // Apply multiplier and battle modifier
    const totalDamage = Math.floor(baseDamage * multiplier * combatState.battleModifier);

    // Apply damage to boss
    combatState.boss.hp = Math.max(0, combatState.boss.hp - totalDamage);

    // Emit team attack event
    this.eventBus.emit('combat:team_attack', {
      lobbyId,
      damage: totalDamage,
      multiplier,
      targetBossId: combatState.boss.bossId,
      newBossHp: combatState.boss.hp,
    });

    // Check for boss defeat
    if (combatState.boss.hp <= 0) {
      // Clear attack timer
      if (combatState.boss.attackTimerHandle) {
        clearTimeout(combatState.boss.attackTimerHandle);
        combatState.boss.attackTimerHandle = undefined;
      }

      this.eventBus.emit('combat:boss_defeated', {
        lobbyId,
        bossId: combatState.boss.bossId,
      });
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
   * Start battle modifier loop - increments every 10 seconds
   */
  startModifierLoop(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      return; // Combat not active
    }

    // Increment modifier and emit event
    const incrementModifier = () => {
      const state = this.combatStates.get(lobbyId);
      if (!state || !state.boss || state.boss.hp <= 0) {
        return; // Combat ended or boss defeated
      }

      // Increment modifier
      state.battleModifier += this.MODIFIER_INCREMENT;

      // Emit modifier updated event
      this.eventBus.emit('combat:modifier_updated', {
        lobbyId,
        modifier: state.battleModifier,
      });

      // Schedule next increment
      state.modifierIntervalHandle = setTimeout(incrementModifier, this.MODIFIER_INTERVAL_MS) as NodeJS.Timeout;
    };

    // Start first increment after interval
    combatState.modifierIntervalHandle = setTimeout(incrementModifier, this.MODIFIER_INTERVAL_MS) as NodeJS.Timeout;
  }

  /**
   * Start minion attack loop - minions perform actions every 4 seconds
   */
  private startMinionAttackLoop(lobbyId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) return;

    const performMinionActions = () => {
      const state = this.combatStates.get(lobbyId);
      if (!state || !state.boss || state.boss.hp <= 0) return;

      // Get alive minions
      const aliveMinions = Array.from(state.minions.values()).filter(m => m.isAlive);
      if (aliveMinions.length === 0) {
        // No minions alive, reschedule check
        state.minionAttackIntervalHandle = setTimeout(
          performMinionActions,
          this.MINION_ATTACK_INTERVAL_MS
        );
        return;
      }

      // Each alive minion performs an action
      for (const minion of aliveMinions) {
        this.performMinionAction(lobbyId, minion.playerId);
      }

      // Schedule next round
      state.minionAttackIntervalHandle = setTimeout(
        performMinionActions,
        this.MINION_ATTACK_INTERVAL_MS
      );
    };

    // Start after initial delay
    combatState.minionAttackIntervalHandle = setTimeout(
      performMinionActions,
      this.MINION_ATTACK_INTERVAL_MS
    );
  }

  /**
   * Perform a single minion action (attack player, heal boss, or debuff)
   * Action weights: 50% attack, 30% heal boss, 20% debuff
   */
  private performMinionAction(lobbyId: string, minionPlayerId: string): void {
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState || !combatState.boss) return;

    const minion = combatState.minions.get(minionPlayerId);
    if (!minion || !minion.isAlive) return;

    // Action weights: 50% attack, 30% heal boss, 20% debuff
    const roll = Math.random();

    if (roll < 0.5) {
      // Attack random fighting player
      const fightingPlayers = Array.from(combatState.players.values())
        .filter(p => p.combatState === 'fighting');
      if (fightingPlayers.length > 0) {
        const target = fightingPlayers[
          Math.floor(Math.random() * fightingPlayers.length)
        ];
        this.applyDamageToPlayer(lobbyId, target.playerId, this.MINION_ATTACK_DAMAGE);
        this.eventBus.emit('combat:minion_attack', {
          lobbyId,
          minionPlayerId,
          targetId: target.playerId,
          damage: this.MINION_ATTACK_DAMAGE,
          attackType: 'attack',
        });
      }
    } else if (roll < 0.8) {
      // Heal boss
      const healAmount = Math.min(
        this.MINION_BOSS_HEAL,
        combatState.boss.maxHp - combatState.boss.hp
      );
      if (healAmount > 0) {
        combatState.boss.hp += healAmount;
        this.eventBus.emit('combat:minion_heal_boss', {
          lobbyId,
          minionPlayerId,
          healAmount,
          newBossHp: combatState.boss.hp,
        });
      }
    } else {
      // Debuff - emit event for visual effect, no mechanical damage
      const fightingPlayers = Array.from(combatState.players.values())
        .filter(p => p.combatState === 'fighting');
      if (fightingPlayers.length > 0) {
        const target = fightingPlayers[
          Math.floor(Math.random() * fightingPlayers.length)
        ];
        this.eventBus.emit('combat:minion_attack', {
          lobbyId,
          minionPlayerId,
          targetId: target.playerId,
          damage: 0,
          attackType: 'debuff',
        });
      }
    }
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

    // Check if player was channeling revival - damage interrupts
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.reviverId === playerId) {
        this.cancelRevivalSession(sessionKey, 'took_damage');
        break;
      }
    }

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

    // Cancel any revival sessions targeting this player
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.targetId === playerId) {
        this.cancelRevivalSession(sessionKey, 'permanent_down');
      }
    }
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
   */
  startRevival(lobbyId: string, reviverId: string, targetId: string): boolean {
    // Get combat state
    const combatState = this.combatStates.get(lobbyId);
    if (!combatState) {
      return false;
    }

    // Get reviver state
    const reviverState = combatState.players.get(reviverId);
    if (!reviverState) {
      return false;
    }

    // Check reviver is fighting
    if (reviverState.combatState !== 'fighting') {
      return false;
    }

    // Validate reviver is healer class
    if (this.getPlayerClass) {
      const reviverClass = this.getPlayerClass(lobbyId, reviverId);
      if (!reviverClass || !this.HEALER_CLASSES.includes(reviverClass)) {
        throw new RevivalNotAllowedError(
          `Player ${reviverId} with class ${reviverClass ?? 'unknown'} cannot revive (must be healer)`
        );
      }
    }

    // Get target state
    const targetState = combatState.players.get(targetId);
    if (!targetState) {
      return false;
    }

    // Check target is downed (not fighting or ghost)
    if (targetState.combatState !== 'downed') {
      return false;
    }

    // Check target hasn't been revived yet (one revive per fight)
    if (targetState.hasBeenRevived) {
      return false;
    }

    // Check if target is already being revived
    const sessionKey = `${reviverId}:${targetId}`;
    const existingSession = Array.from(this.revivalSessions.values()).find(
      session => session.targetId === targetId
    );
    if (existingSession) {
      return false; // Target already being revived by someone
    }

    // Create revival session
    const session: RevivalSession = {
      reviverId,
      targetId,
      lobbyId,
      startedAt: Date.now(),
      channelDurationMs: this.REVIVAL_CHANNEL_DURATION_MS,
      intervalHandle: setInterval(() => {
        this.tickRevival(sessionKey);
      }, 100) as NodeJS.Timeout,
    };

    this.revivalSessions.set(sessionKey, session);

    // Emit revival started event
    this.eventBus.emit('combat:revival_started', {
      lobbyId,
      reviverId,
      targetId,
      durationMs: this.REVIVAL_CHANNEL_DURATION_MS,
    });

    return true;
  }

  /**
   * Tick a revival session to check for completion or interruption
   */
  private tickRevival(sessionKey: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) {
      return; // Session already cancelled
    }

    const combatState = this.combatStates.get(session.lobbyId);
    if (!combatState) {
      // Combat ended
      this.cancelRevivalSession(sessionKey, 'combat_ended');
      return;
    }

    // Check if reviver still fighting
    const reviverState = combatState.players.get(session.reviverId);
    if (!reviverState || reviverState.combatState !== 'fighting') {
      // Reviver downed or left
      this.cancelRevivalSession(sessionKey, 'reviver_downed');
      return;
    }

    // Check if target still downed
    const targetState = combatState.players.get(session.targetId);
    if (!targetState || targetState.combatState !== 'downed') {
      // Target died, revived by someone else, or left
      this.cancelRevivalSession(sessionKey, 'target_state_changed');
      return;
    }

    // Check if channel duration reached
    const elapsed = Date.now() - session.startedAt;
    if (elapsed >= session.channelDurationMs) {
      this.completeRevival(sessionKey);
    }
  }

  /**
   * Complete a revival session
   */
  private completeRevival(sessionKey: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) {
      return;
    }

    const combatState = this.combatStates.get(session.lobbyId);
    if (!combatState) {
      return;
    }

    const targetState = combatState.players.get(session.targetId);
    if (!targetState) {
      return;
    }

    // Clear down timer (prevent ghost transition)
    if (targetState.downTimerHandle) {
      clearTimeout(targetState.downTimerHandle);
      targetState.downTimerHandle = undefined;
    }

    // Restore target to fighting state at 50% HP
    targetState.hp = Math.floor(targetState.maxHp * 0.5);
    targetState.combatState = 'fighting';
    targetState.isDowned = false;
    targetState.hasBeenRevived = true;

    // Clear interval
    clearInterval(session.intervalHandle);

    // Remove session
    this.revivalSessions.delete(sessionKey);

    // Emit revival completed event
    this.eventBus.emit('combat:player_revived', {
      lobbyId: session.lobbyId,
      playerId: session.targetId,
      reviverId: session.reviverId,
    });
  }

  /**
   * Cancel a revival session
   */
  private cancelRevivalSession(sessionKey: string, reason: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) {
      return;
    }

    // Clear interval
    clearInterval(session.intervalHandle);

    // Remove session
    this.revivalSessions.delete(sessionKey);

    // Emit cancellation event
    this.eventBus.emit('combat:revival_cancelled', {
      lobbyId: session.lobbyId,
      reviverId: session.reviverId,
      targetId: session.targetId,
      reason,
    });
  }

  /**
   * Cancel ongoing revival session (public interface for external cancellation)
   */
  cancelRevival(reviverId: string, reason: string): void {
    // Find session where player is reviver
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.reviverId === reviverId) {
        this.cancelRevivalSession(sessionKey, reason);
        break;
      }
    }
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

      // Clear modifier interval
      if (combatState.modifierIntervalHandle) {
        clearTimeout(combatState.modifierIntervalHandle);
        combatState.modifierIntervalHandle = undefined;
      }

      // Clear countdown interval
      if (combatState.countdownIntervalHandle) {
        clearInterval(combatState.countdownIntervalHandle);
        combatState.countdownIntervalHandle = undefined;
      }

      // Clear minion attack interval
      if (combatState.minionAttackIntervalHandle) {
        clearTimeout(combatState.minionAttackIntervalHandle);
        combatState.minionAttackIntervalHandle = undefined;
      }

      // Clear all player down timers
      for (const player of combatState.players.values()) {
        if (player.downTimerHandle) {
          clearTimeout(player.downTimerHandle);
          player.downTimerHandle = undefined;
        }
      }

      // Clear all revival sessions for this lobby
      for (const [sessionKey, session] of this.revivalSessions) {
        if (session.lobbyId === lobbyId) {
          clearInterval(session.intervalHandle);
          this.revivalSessions.delete(sessionKey);
        }
      }
    }

    this.combatStates.delete(lobbyId);

    // Emit cleanup complete event
    this.eventBus.emit('combat:cleanup_complete', { lobbyId });
  }
}
