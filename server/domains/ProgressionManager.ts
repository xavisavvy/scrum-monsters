/**
 * ProgressionManager Domain
 *
 * Manages XP awards and leveling progression for players.
 * Owns the XP curve calculations and emits progression events.
 *
 * Responsibilities:
 * - Track per-lobby player XP totals
 * - Calculate XP awards based on action type and amount
 * - Detect level-ups when XP crosses thresholds
 * - Emit progression:xp_awarded and progression:level_up events
 */

import { ScopedEventBus } from '../events';
import type { XPCurveConfig, XPSource, XP_RATES } from '../../shared/progressionTypes';
import type {
  EstimationVoteCastPayload,
  CombatBossDamagedPayload,
  EstimationFullConsensusReachedPayload,
  CombatPlayerRevivedPayload,
} from '../events/eventTypes';
import { dbLogger } from '../logger.js';

/**
 * Dependencies required by ProgressionManager
 */
export interface ProgressionManagerDeps {
  eventBus: ScopedEventBus;
  getActivePlayers?: (lobbyId: string) => string[] | null;
  getVoters: (lobbyId: string) => string[];
  storage?: import('../storage').IStorage;
  getUserId?: (lobbyId: string, playerId: string) => number | undefined;
}

// =============================================================================
// XP Curve Configuration
// =============================================================================

/**
 * Default XP curve configuration
 * Exponential curve: XP needed for level N = baseXP * (N-1)^exponent
 */
const DEFAULT_CURVE_CONFIG: XPCurveConfig = {
  baseXP: 100,
  exponent: 1.8, // Phase 42 BAL-01: 1.5 → 1.8 (steepens late-level requirements)
};

/**
 * XP rates per action type
 * Imported from shared types, but we need to use the actual values
 * NOTE: Must mirror shared/progressionTypes.ts XP_RATES.
 */
const XP_RATE_VALUES: typeof XP_RATES = {
  vote: 10,
  boss_damage: 1, // Phase 42 BAL-01: 2 → 1 (mirrors shared)
  consensus: 50,
  revival: 30,
};

// =============================================================================
// XP Curve Class
// =============================================================================

/**
 * XPCurve handles all XP-to-level calculations
 *
 * Formula: To reach level N requires baseXP * sum((i-1)^exponent) for i=2 to N
 * This creates an exponential growth curve for XP requirements.
 */
export class XPCurve {
  private readonly config: XPCurveConfig;

  constructor(config: XPCurveConfig = DEFAULT_CURVE_CONFIG) {
    this.config = config;
  }

  /**
   * Calculate the cumulative XP required to reach a specific level
   * @param level Target level (1-based)
   * @returns Total XP needed to be at the start of that level
   */
  getTotalXPForLevel(level: number): number {
    if (level <= 1) return 0;

    let total = 0;
    for (let i = 2; i <= level; i++) {
      total += this.getLevelThreshold(i);
    }
    return Math.floor(total);
  }

  /**
   * Calculate XP needed to level up FROM a specific level
   * @param level Current level (1-based)
   * @returns XP needed to reach next level from this level
   */
  getLevelThreshold(level: number): number {
    if (level <= 1) return 0;
    return Math.floor(this.config.baseXP * Math.pow(level - 1, this.config.exponent));
  }

  /**
   * Calculate player's current level based on total XP
   * @param totalXP Player's cumulative XP
   * @returns Current level (1-based)
   */
  calculateLevel(totalXP: number): number {
    if (totalXP < 0) return 1;

    let level = 1;
    let cumulativeXP = 0;

    // Iterate until we find the level where cumulative XP exceeds player's XP
    while (true) {
      const nextLevelXP = this.getLevelThreshold(level + 1);
      if (cumulativeXP + nextLevelXP > totalXP) {
        break;
      }
      cumulativeXP += nextLevelXP;
      level++;

      // Safety check to prevent infinite loops
      if (level > 1000) break;
    }

    return level;
  }

  /**
   * Calculate progress toward next level
   * @param totalXP Player's cumulative XP
   * @returns Object with current XP in level, XP needed for next level, and percentage
   */
  getProgressToNextLevel(totalXP: number): {
    current: number;
    needed: number;
    percentage: number;
  } {
    const currentLevel = this.calculateLevel(totalXP);
    const currentLevelStart = this.getTotalXPForLevel(currentLevel);
    const nextLevelThreshold = this.getLevelThreshold(currentLevel + 1);

    const current = totalXP - currentLevelStart;
    const needed = nextLevelThreshold;
    const percentage = needed > 0 ? Math.floor((current / needed) * 100) : 0;

    return { current, needed, percentage };
  }
}

// =============================================================================
// ProgressionManager Class
// =============================================================================

/**
 * ProgressionManager tracks XP and emits progression events
 */
export class ProgressionManager {
  // Dependencies
  private readonly eventBus: ScopedEventBus;
  private readonly curve: XPCurve;
  private readonly getActivePlayers: (lobbyId: string) => string[] | null;
  private readonly getVoters: (lobbyId: string) => string[];
  private readonly storage: import('../storage').IStorage | null;
  private readonly getUserId: ((lobbyId: string, playerId: string) => number | undefined) | null;

  // State: Map<lobbyId, Map<playerId, totalXP>>
  private lobbyXP = new Map<string, Map<string, number>>();

  constructor(deps: ProgressionManagerDeps) {
    this.eventBus = deps.eventBus;
    this.curve = new XPCurve(DEFAULT_CURVE_CONFIG);
    this.getActivePlayers = deps.getActivePlayers ?? (() => null);
    this.getVoters = deps.getVoters;
    this.storage = deps.storage ?? null;
    this.getUserId = deps.getUserId ?? null;

    // Subscribe to XP-awarding events
    this.setupEventSubscriptions();
  }

  /**
   * Setup event subscriptions for XP triggers
   */
  private setupEventSubscriptions(): void {
    // XP-01: Vote submission (10 XP)
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));

    // XP-02: Boss damage (2 XP per damage point)
    this.eventBus.on('combat:boss_damaged', this.handleBossDamaged.bind(this));

    // XP-03: Consensus bonus (50 XP to all voters)
    this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));

    // XP-04: Revival (30 XP to reviver)
    this.eventBus.on('combat:player_revived', this.handleRevival.bind(this));
  }

  /**
   * Handle vote cast event - award 10 XP for voting
   */
  private handleVoteCast(payload: EstimationVoteCastPayload): void {
    this.awardXP(payload.lobbyId, payload.playerId, XP_RATE_VALUES.vote, 'vote');
  }

  /**
   * Handle boss damaged event - award 2 XP per damage point
   */
  private handleBossDamaged(payload: CombatBossDamagedPayload): void {
    // Pass raw damage — awardXP applies the boss_damage rate multiplier
    this.awardXP(payload.lobbyId, payload.playerId, payload.damage, 'boss_damage');
  }

  /**
   * Handle consensus reached event - award 50 XP to all active players
   */
  private handleConsensus(payload: EstimationFullConsensusReachedPayload): void {
    const voters = this.getVoters(payload.lobbyId);
    for (const playerId of voters) {
      this.awardXP(payload.lobbyId, playerId, XP_RATE_VALUES.consensus, 'consensus');
    }
  }

  /**
   * Handle player revived event - award 30 XP to reviver
   */
  private handleRevival(payload: CombatPlayerRevivedPayload): void {
    this.awardXP(payload.lobbyId, payload.reviverId, XP_RATE_VALUES.revival, 'revival');
  }

  /**
   * Award XP to a player for a specific action
   * Emits progression:xp_awarded and progression:level_up events
   *
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param amount Base amount (for boss_damage, this is damage dealt; for others it's ignored)
   * @param source Type of XP source
   */
  awardXP(lobbyId: string, playerId: string, amount: number, source: XPSource): void {
    // Calculate actual XP based on source type
    let xpAwarded: number;
    switch (source) {
      case 'vote':
        xpAwarded = XP_RATE_VALUES.vote;
        break;
      case 'boss_damage':
        xpAwarded = amount * XP_RATE_VALUES.boss_damage;
        break;
      case 'consensus':
        xpAwarded = XP_RATE_VALUES.consensus;
        break;
      case 'revival':
        xpAwarded = XP_RATE_VALUES.revival;
        break;
      default:
        xpAwarded = 0;
    }

    // Get current XP and level
    const currentXP = this.getPlayerXP(lobbyId, playerId);
    const oldLevel = this.curve.calculateLevel(currentXP);

    // Update XP
    const newXP = currentXP + xpAwarded;
    this.setPlayerXP(lobbyId, playerId, newXP);

    // Emit XP awarded event
    this.eventBus.emit('progression:xp_awarded', {
      lobbyId,
      playerId,
      amount: xpAwarded,
      source,
      newTotal: newXP,
    });

    // Check for level up
    const newLevel = this.curve.calculateLevel(newXP);
    if (newLevel > oldLevel) {
      // Emit level-up event for each level gained
      for (let level = oldLevel + 1; level <= newLevel; level++) {
        this.eventBus.emit('progression:level_up', {
          lobbyId,
          playerId,
          oldLevel: level - 1,
          newLevel: level,
        });
      }
    }

    // Persist XP to storage (fire-and-forget, best-effort)
    if (this.storage && this.getUserId) {
      this.persistXP(lobbyId, playerId, newXP).catch(() => {
        // Error already logged in persistXP
      });
    }
  }

  /**
   * Get player's current XP total in a lobby
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @returns Total XP (0 if not initialized)
   */
  getPlayerXP(lobbyId: string, playerId: string): number {
    const lobbyMap = this.lobbyXP.get(lobbyId);
    if (!lobbyMap) return 0;
    return lobbyMap.get(playerId) ?? 0;
  }

  /**
   * Get player's current level in a lobby
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @returns Current level (1 if not initialized)
   */
  getPlayerLevel(lobbyId: string, playerId: string): number {
    const xp = this.getPlayerXP(lobbyId, playerId);
    return this.curve.calculateLevel(xp);
  }

  /**
   * Initialize player XP (used when loading from DB)
   * Does not emit events.
   *
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param startingXP Initial XP total
   */
  initializePlayer(lobbyId: string, playerId: string, startingXP: number): void {
    this.setPlayerXP(lobbyId, playerId, startingXP);
  }

  /**
   * Internal: Set player XP directly
   */
  private setPlayerXP(lobbyId: string, playerId: string, xp: number): void {
    let lobbyMap = this.lobbyXP.get(lobbyId);
    if (!lobbyMap) {
      lobbyMap = new Map();
      this.lobbyXP.set(lobbyId, lobbyMap);
    }
    lobbyMap.set(playerId, xp);
  }

  /**
   * Persist player XP to storage (best-effort, non-blocking)
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param totalXP Total XP to persist
   */
  private async persistXP(lobbyId: string, playerId: string, totalXP: number): Promise<void> {
    try {
      if (!this.storage || !this.getUserId) return;
      const userId = this.getUserId(lobbyId, playerId);
      if (!userId) return; // Guest player, no persistence
      const level = this.curve.calculateLevel(totalXP);
      await this.storage.updateUserProfile(userId, { totalXP, currentLevel: level });
    } catch (err) {
      // Log but don't fail — persistence is best-effort
      dbLogger.error({ err, playerId }, 'Failed to persist XP');
    }
  }

  /**
   * Load player XP from storage on join
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param userId Authenticated user ID
   */
  async loadPlayerXP(lobbyId: string, playerId: string, userId: number): Promise<void> {
    if (!this.storage) return;
    try {
      const profile = await this.storage.getUserProfile(userId);
      if (profile && profile.totalXP > 0) {
        this.initializePlayer(lobbyId, playerId, profile.totalXP);
      }
    } catch (err) {
      dbLogger.error({ err, playerId }, 'Failed to load XP');
    }
  }

  /**
   * Clean up lobby from tracking (when lobby is destroyed)
   * @param lobbyId Lobby identifier
   */
  cleanupLobby(lobbyId: string): void {
    this.lobbyXP.delete(lobbyId);
  }
}
