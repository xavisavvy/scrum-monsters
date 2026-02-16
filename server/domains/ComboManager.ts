/**
 * ComboManager Domain
 *
 * Manages team combo detection, cooldown tracking, and consensus ultimates.
 * Subscribes to ability:used and estimation:full_consensus_reached events.
 *
 * Responsibilities:
 * - Detect class-pair combos when abilities used within timing window
 * - Track per-combo cooldowns to prevent spam
 * - Trigger consensus ultimates on full team agreement
 * - Calculate damage multipliers based on voting speed
 * - Emit combo events for downstream consumers
 */

import { ScopedEventBus } from '../events';
import { AvatarClass } from '../../shared/gameEvents';
import {
  CLASS_COMBOS,
  ComboDefinition,
  ComboTrigger,
  CONSENSUS_ULTIMATE_BASE_DAMAGE,
  CONSENSUS_MIN_MULTIPLIER,
  CONSENSUS_MAX_MULTIPLIER,
  CONSENSUS_FAST_VOTE_MS,
  CONSENSUS_SLOW_VOTE_MS,
} from '../../shared/comboTypes';
import { AbilityUsedPayload, EstimationFullConsensusReachedPayload } from '../events/eventTypes';

/**
 * Dependencies required by ComboManager
 */
export interface ComboManagerDeps {
  eventBus: ScopedEventBus;
  combatManager: {
    applyComboMultiplier: (lobbyId: string, comboId: string, damage: number) => void;
  };
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
  getVotingStartTime: (lobbyId: string) => number | null;
}

/**
 * Ability usage timestamp for combo detection
 */
interface AbilityTimestamp {
  playerId: string;
  playerClass: AvatarClass;
  timestamp: number;
}

/**
 * Cooldown state for a combo
 */
interface ComboCooldown {
  expiresAt: number;
}

/**
 * ComboManager manages combo detection and cooldowns
 */
export class ComboManager {
  // State: Map<lobbyId, AbilityTimestamp[]>
  private recentAbilities = new Map<string, AbilityTimestamp[]>();

  // State: Map<lobbyId, Map<comboId, ComboCooldown>>
  private comboCooldowns = new Map<string, Map<string, ComboCooldown>>();

  // Consensus ultimate guard: Set<lobbyId:ticketId>
  private consensusUsed = new Set<string>();

  private readonly ABILITY_WINDOW_MS = 3000; // 3 second window for combos

  private readonly eventBus: ScopedEventBus;
  private readonly deps: ComboManagerDeps;

  constructor(deps: ComboManagerDeps) {
    this.deps = deps;
    this.eventBus = deps.eventBus;

    // Subscribe to events
    this.eventBus.on('ability:used', this.handleAbilityUsed.bind(this));
    this.eventBus.on('estimation:full_consensus_reached', this.handleFullConsensus.bind(this));
  }

  /**
   * Handle ability usage - check for combo triggers
   */
  private handleAbilityUsed(payload: AbilityUsedPayload): void {
    const { lobbyId, playerId } = payload;

    // Get player class
    const playerClass = this.deps.getPlayerClass(lobbyId, playerId);
    if (!playerClass) return;

    // Record ability timestamp
    const timestamp: AbilityTimestamp = {
      playerId,
      playerClass,
      timestamp: Date.now(),
    };

    if (!this.recentAbilities.has(lobbyId)) {
      this.recentAbilities.set(lobbyId, []);
    }
    const recentList = this.recentAbilities.get(lobbyId)!;
    recentList.push(timestamp);

    // Clean old timestamps (outside window)
    this.cleanOldTimestamps(lobbyId);

    // Check for combo triggers
    this.checkComboTriggers(lobbyId, timestamp);
  }

  /**
   * Check if recent ability usage triggers any combos
   */
  private checkComboTriggers(lobbyId: string, newAbility: AbilityTimestamp): void {
    const recentList = this.recentAbilities.get(lobbyId) || [];

    // Check each combo definition
    for (const combo of CLASS_COMBOS) {
      // Skip if combo on cooldown
      if (this.isComboOnCooldown(lobbyId, combo.id)) continue;

      // Check if combo conditions met
      if (this.isComboTriggered(combo, newAbility, recentList)) {
        this.triggerCombo(lobbyId, combo, newAbility.playerId, recentList);
        break; // First match wins
      }
    }
  }

  /**
   * Check if combo conditions are met
   */
  private isComboTriggered(
    combo: ComboDefinition,
    newAbility: AbilityTimestamp,
    recentList: AbilityTimestamp[]
  ): boolean {
    const now = Date.now();

    // Filter abilities within window
    const validAbilities = recentList.filter(
      (a) => now - a.timestamp <= this.ABILITY_WINDOW_MS
    );

    // Check trigger conditions
    for (const trigger of combo.triggers) {
      if (this.checkTrigger(trigger, validAbilities)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a single trigger condition is met
   */
  private checkTrigger(
    trigger: ComboTrigger,
    validAbilities: AbilityTimestamp[]
  ): boolean {
    const { classA, classB, requireBothClasses } = trigger;

    // Count abilities from each class (from different players)
    const classAPlayers = new Set(
      validAbilities
        .filter((a) => a.playerClass === classA)
        .map((a) => a.playerId)
    );
    const classBPlayers = new Set(
      validAbilities
        .filter((a) => a.playerClass === classB)
        .map((a) => a.playerId)
    );

    if (requireBothClasses) {
      // Both classes must have used abilities within window (from different players)
      return classAPlayers.size > 0 && classBPlayers.size > 0;
    } else {
      // Either class can trigger (for single-class ultimates)
      return classAPlayers.size > 0 || classBPlayers.size > 0;
    }
  }

  /**
   * Trigger combo effect
   */
  private triggerCombo(
    lobbyId: string,
    combo: ComboDefinition,
    triggeringPlayerId: string,
    recentList: AbilityTimestamp[]
  ): void {
    // Start cooldown
    this.startComboCooldown(lobbyId, combo.id, combo.cooldownMs);

    // Calculate damage: baseDamage * damageMultiplier
    const damage = Math.floor(combo.baseDamage * combo.damageMultiplier);

    // Get participant player IDs
    const now = Date.now();
    const validAbilities = recentList.filter(
      (a) => now - a.timestamp <= this.ABILITY_WINDOW_MS
    );
    const participantPlayerIds = Array.from(
      new Set(validAbilities.map((a) => a.playerId))
    );

    // Apply damage via CombatManager
    this.deps.combatManager.applyComboMultiplier(lobbyId, combo.id, damage);

    // Emit combo event
    this.eventBus.emit('combo:triggered', {
      lobbyId,
      comboId: combo.id,
      comboName: combo.name,
      triggeringPlayerId,
      participantPlayerIds,
      damage,
      damageMultiplier: combo.damageMultiplier,
      visualEffect: combo.visualEffect,
    });
  }

  /**
   * Handle full consensus - trigger ultimate attack
   */
  private handleFullConsensus(payload: EstimationFullConsensusReachedPayload): void {
    const { lobbyId, ticketId } = payload;

    // Build guard key
    const guardKey = `${lobbyId}:${ticketId}`;

    // Skip if already used for this ticket
    if (this.consensusUsed.has(guardKey)) {
      return;
    }

    // Add to guard set
    this.consensusUsed.add(guardKey);

    // Get voting start time
    const votingStartTime = this.deps.getVotingStartTime(lobbyId);
    const votingDurationMs = votingStartTime
      ? Date.now() - votingStartTime
      : 30000; // Default 30s if unknown

    // Calculate multiplier based on voting speed
    const multiplier = this.calculateConsensusMultiplier(votingDurationMs);

    // Calculate damage: base * multiplier
    const damage = Math.floor(CONSENSUS_ULTIMATE_BASE_DAMAGE * multiplier);

    // Apply damage via CombatManager
    this.deps.combatManager.applyComboMultiplier(lobbyId, 'consensus_ultimate', damage);

    // Emit consensus ultimate event
    this.eventBus.emit('combo:consensus_ultimate', {
      lobbyId,
      damage,
      damageMultiplier: multiplier,
      votingDurationMs,
    });
  }

  /**
   * Calculate consensus multiplier based on voting speed
   * Faster voting = higher multiplier (max 3.0x, min 1.5x)
   */
  private calculateConsensusMultiplier(votingDurationMs: number): number {
    // Clamp duration to range
    const clampedDuration = Math.max(
      CONSENSUS_FAST_VOTE_MS,
      Math.min(CONSENSUS_SLOW_VOTE_MS, votingDurationMs)
    );

    // Linear interpolation: faster = higher multiplier
    const ratio =
      (CONSENSUS_SLOW_VOTE_MS - clampedDuration) /
      (CONSENSUS_SLOW_VOTE_MS - CONSENSUS_FAST_VOTE_MS);
    const multiplier =
      CONSENSUS_MIN_MULTIPLIER +
      ratio * (CONSENSUS_MAX_MULTIPLIER - CONSENSUS_MIN_MULTIPLIER);

    return Math.round(multiplier * 100) / 100; // Round to 2 decimals
  }

  /**
   * Check if combo is on cooldown
   */
  private isComboOnCooldown(lobbyId: string, comboId: string): boolean {
    const lobbyCooldowns = this.comboCooldowns.get(lobbyId);
    if (!lobbyCooldowns) return false;

    const cooldown = lobbyCooldowns.get(comboId);
    if (!cooldown) return false;

    // Cooldown is active through the full duration (inclusive)
    return Date.now() <= cooldown.expiresAt;
  }

  /**
   * Start combo cooldown
   */
  private startComboCooldown(
    lobbyId: string,
    comboId: string,
    durationMs: number
  ): void {
    if (!this.comboCooldowns.has(lobbyId)) {
      this.comboCooldowns.set(lobbyId, new Map());
    }
    const lobbyCooldowns = this.comboCooldowns.get(lobbyId)!;

    lobbyCooldowns.set(comboId, {
      expiresAt: Date.now() + durationMs,
    });
  }

  /**
   * Clean old timestamps outside combo window
   */
  private cleanOldTimestamps(lobbyId: string): void {
    const recentList = this.recentAbilities.get(lobbyId);
    if (!recentList) return;

    const now = Date.now();
    const filtered = recentList.filter(
      (a) => now - a.timestamp <= this.ABILITY_WINDOW_MS
    );

    this.recentAbilities.set(lobbyId, filtered);
  }

  /**
   * Reset combo state for lobby (for new ticket)
   */
  public resetCombos(lobbyId: string): void {
    this.recentAbilities.delete(lobbyId);
    this.comboCooldowns.delete(lobbyId);
    // Note: consensusUsed is per-ticket, not per-lobby, so don't clear it here
  }

  /**
   * Cleanup all state for a lobby
   */
  public cleanupLobby(lobbyId: string): void {
    this.resetCombos(lobbyId);

    // Remove consensus guard entries for this lobby
    const toDelete: string[] = [];
    for (const key of Array.from(this.consensusUsed)) {
      if (key.startsWith(`${lobbyId}:`)) {
        toDelete.push(key);
      }
    }
    toDelete.forEach((key) => this.consensusUsed.delete(key));
  }
}
