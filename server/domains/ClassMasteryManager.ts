/**
 * ClassMasteryManager Domain
 *
 * Manages per-class XP tracking and mastery tier progression.
 * Players earn class XP for actions performed while playing each class.
 *
 * Responsibilities:
 * - Track per-lobby, per-player, per-class XP totals
 * - Calculate mastery tiers based on class XP
 * - Detect tier-ups when class XP crosses thresholds
 * - Emit class_mastery:xp_awarded and class_mastery:tier_up events
 */

import { ScopedEventBus } from '../events';
import type { AvatarClass } from '../../shared/gameEvents';
import type { XPSource } from '../../shared/progressionTypes';
import {
  ClassMasteryXPCurve,
  CLASS_XP_RATES,
  type MasteryTier,
} from '../../shared/classMasteryTypes';
import type {
  EstimationVoteCastPayload,
  CombatBossDamagedPayload,
  EstimationFullConsensusReachedPayload,
  CombatPlayerRevivedPayload,
} from '../events/eventTypes';
import type { IStorage } from '../storage';

/**
 * Dependencies required by ClassMasteryManager
 */
export interface ClassMasteryManagerDeps {
  eventBus: ScopedEventBus;
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
  getVoters: (lobbyId: string) => string[];
  storage?: IStorage;
  getUserId?: (lobbyId: string, playerId: string) => number | undefined;
}

/**
 * ClassMasteryManager tracks per-class XP and emits mastery progression events
 */
export class ClassMasteryManager {
  // Dependencies
  private readonly eventBus: ScopedEventBus;
  private readonly curve: ClassMasteryXPCurve;
  private readonly getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
  private readonly getVoters: (lobbyId: string) => string[];
  private readonly storage: IStorage | null;
  private readonly getUserId: ((lobbyId: string, playerId: string) => number | undefined) | null;

  // State: Map<lobbyId, Map<playerId, Map<AvatarClass, classXP>>>
  private lobbyClassXP = new Map<string, Map<string, Map<AvatarClass, number>>>();

  constructor(deps: ClassMasteryManagerDeps) {
    this.eventBus = deps.eventBus;
    this.curve = new ClassMasteryXPCurve();
    this.getPlayerClass = deps.getPlayerClass;
    this.getVoters = deps.getVoters;
    this.storage = deps.storage ?? null;
    this.getUserId = deps.getUserId ?? null;

    // Subscribe to XP-awarding events
    this.setupEventSubscriptions();
  }

  /**
   * Setup event subscriptions for class XP triggers
   */
  private setupEventSubscriptions(): void {
    // Same events as ProgressionManager, but awards class XP to player's CURRENT class
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('combat:boss_damaged', this.handleBossDamaged.bind(this));
    this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));
    this.eventBus.on('combat:player_revived', this.handleRevival.bind(this));
  }

  /**
   * Handle vote cast event - award class XP to player's current class
   */
  private handleVoteCast(payload: EstimationVoteCastPayload): void {
    const avatarClass = this.getPlayerClass(payload.lobbyId, payload.playerId);
    if (!avatarClass) return; // Player class not set yet

    this.awardClassXP(
      payload.lobbyId,
      payload.playerId,
      avatarClass,
      CLASS_XP_RATES.vote,
      'vote'
    );
  }

  /**
   * Handle boss damaged event - award class XP proportional to damage
   */
  private handleBossDamaged(payload: CombatBossDamagedPayload): void {
    const avatarClass = this.getPlayerClass(payload.lobbyId, payload.playerId);
    if (!avatarClass) return;

    const xp = payload.damage * CLASS_XP_RATES.boss_damage;
    this.awardClassXP(payload.lobbyId, payload.playerId, avatarClass, xp, 'boss_damage');
  }

  /**
   * Handle consensus reached event - award class XP to all voters' current classes
   */
  private handleConsensus(payload: EstimationFullConsensusReachedPayload): void {
    const voters = this.getVoters(payload.lobbyId);
    for (const playerId of voters) {
      const avatarClass = this.getPlayerClass(payload.lobbyId, playerId);
      if (!avatarClass) continue;

      this.awardClassXP(
        payload.lobbyId,
        playerId,
        avatarClass,
        CLASS_XP_RATES.consensus,
        'consensus'
      );
    }
  }

  /**
   * Handle player revived event - award class XP to reviver's current class
   */
  private handleRevival(payload: CombatPlayerRevivedPayload): void {
    const avatarClass = this.getPlayerClass(payload.lobbyId, payload.reviverId);
    if (!avatarClass) return;

    this.awardClassXP(
      payload.lobbyId,
      payload.reviverId,
      avatarClass,
      CLASS_XP_RATES.revival,
      'revival'
    );
  }

  /**
   * Award class XP to a player for a specific class
   * Emits class_mastery:xp_awarded and class_mastery:tier_up events
   *
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class that earned the XP
   * @param amount XP amount to award
   * @param source Type of XP source
   */
  awardClassXP(
    lobbyId: string,
    playerId: string,
    avatarClass: AvatarClass,
    amount: number,
    source: XPSource
  ): void {
    // Get current class XP and tier
    const currentXP = this.getClassXP(lobbyId, playerId, avatarClass);
    const oldTier = this.curve.calculateTier(currentXP);

    // Update class XP
    const newXP = currentXP + amount;
    this.setClassXP(lobbyId, playerId, avatarClass, newXP);

    // Emit XP awarded event
    this.eventBus.emit('class_mastery:xp_awarded', {
      lobbyId,
      playerId,
      avatarClass,
      amount,
      source,
      newTotal: newXP,
    });

    // Check for tier up
    const newTier = this.curve.calculateTier(newXP);
    if (newTier !== oldTier) {
      this.eventBus.emit('class_mastery:tier_up', {
        lobbyId,
        playerId,
        avatarClass,
        oldTier,
        newTier,
      });
    }

    // Persist class XP to storage (fire-and-forget, best-effort)
    if (this.storage && this.getUserId) {
      this.persistClassXP(lobbyId, playerId, avatarClass, newXP, newTier).catch(() => {
        // Error already logged in persistClassXP
      });
    }
  }

  /**
   * Get player's current class XP in a lobby
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class to check
   * @returns Class XP (0 if not initialized)
   */
  getClassXP(lobbyId: string, playerId: string, avatarClass: AvatarClass): number {
    const lobbyMap = this.lobbyClassXP.get(lobbyId);
    if (!lobbyMap) return 0;

    const playerMap = lobbyMap.get(playerId);
    if (!playerMap) return 0;

    return playerMap.get(avatarClass) ?? 0;
  }

  /**
   * Get player's mastery tier for a class
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class to check
   * @returns Current mastery tier
   */
  getMasteryTier(lobbyId: string, playerId: string, avatarClass: AvatarClass): MasteryTier {
    const classXP = this.getClassXP(lobbyId, playerId, avatarClass);
    return this.curve.calculateTier(classXP);
  }

  /**
   * Get stat multiplier for a player's class mastery
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class to check
   * @returns Stat multiplier (1.0, 1.1, or 1.2)
   */
  getMasteryMultiplier(lobbyId: string, playerId: string, avatarClass: AvatarClass): number {
    const classXP = this.getClassXP(lobbyId, playerId, avatarClass);
    return this.curve.getTierMultiplier(classXP);
  }

  /**
   * Get unlocked abilities for a player's class mastery
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class to check
   * @returns Array of unlocked ability IDs
   */
  getUnlockedAbilities(lobbyId: string, playerId: string, avatarClass: AvatarClass): string[] {
    const classXP = this.getClassXP(lobbyId, playerId, avatarClass);
    return this.curve.getUnlockedAbilities(classXP);
  }

  /**
   * Initialize class mastery for a player (used when loading from DB)
   * Does not emit events.
   *
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class to initialize
   * @param startingXP Initial class XP
   */
  initializeClassMastery(
    lobbyId: string,
    playerId: string,
    avatarClass: AvatarClass,
    startingXP: number
  ): void {
    this.setClassXP(lobbyId, playerId, avatarClass, startingXP);
  }

  /**
   * Load all class mastery data for a player from storage
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param userId Authenticated user ID
   */
  async loadAllClassMastery(lobbyId: string, playerId: string, userId: number): Promise<void> {
    if (!this.storage) return;

    try {
      const masteryRecords = await this.storage.getAllClassMastery(userId);
      for (const record of masteryRecords) {
        this.initializeClassMastery(
          lobbyId,
          playerId,
          record.avatarClass as AvatarClass,
          record.classXP
        );
      }
    } catch (err) {
      console.error(`Failed to load class mastery for player ${playerId}:`, err);
    }
  }

  /**
   * Clean up lobby from tracking (when lobby is destroyed)
   * @param lobbyId Lobby identifier
   */
  cleanupLobby(lobbyId: string): void {
    this.lobbyClassXP.delete(lobbyId);
  }

  /**
   * Internal: Set class XP directly
   */
  private setClassXP(
    lobbyId: string,
    playerId: string,
    avatarClass: AvatarClass,
    xp: number
  ): void {
    let lobbyMap = this.lobbyClassXP.get(lobbyId);
    if (!lobbyMap) {
      lobbyMap = new Map();
      this.lobbyClassXP.set(lobbyId, lobbyMap);
    }

    let playerMap = lobbyMap.get(playerId);
    if (!playerMap) {
      playerMap = new Map();
      lobbyMap.set(playerId, playerMap);
    }

    playerMap.set(avatarClass, xp);
  }

  /**
   * Persist class XP to storage (best-effort, non-blocking)
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param avatarClass Class that earned XP
   * @param classXP Total class XP to persist
   * @param currentTier Current mastery tier
   */
  private async persistClassXP(
    lobbyId: string,
    playerId: string,
    avatarClass: AvatarClass,
    classXP: number,
    currentTier: MasteryTier
  ): Promise<void> {
    try {
      if (!this.storage || !this.getUserId) return;
      const userId = this.getUserId(lobbyId, playerId);
      if (!userId) return; // Guest player, no persistence

      await this.storage.updateClassMastery(userId, avatarClass, classXP, currentTier);
    } catch (err) {
      // Log but don't fail — persistence is best-effort
      console.error(`Failed to persist class XP for player ${playerId}, class ${avatarClass}:`, err);
    }
  }
}
