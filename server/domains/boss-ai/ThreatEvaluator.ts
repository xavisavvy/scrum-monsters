/**
 * ThreatEvaluator
 *
 * Enhanced threat tracking with action-specific weights and weighted target selection.
 */

import type { ThreatEntry } from './types';

/**
 * Action type for threat calculation
 */
type ThreatAction = 'damage' | 'healing' | 'revival' | 'buff_applied';

/**
 * Threat evaluator for enhanced boss targeting
 */
export class ThreatEvaluator {
  /**
   * Threat weight constants
   */
  private static readonly THREAT_WEIGHTS = {
    damage: 1.0,         // 1 damage = 1 threat
    healing: 0.8,        // 1 healing = 0.8 threat
    revival: 150,        // Fixed threat for revival
    buff_applied: 50,    // Fixed threat for buffs
  };

  /**
   * Add threat to the threat table
   * @param threatTable Threat table map
   * @param playerId Player generating threat
   * @param actionType Type of action
   * @param amount Amount (damage/healing)
   */
  public static addThreat(
    threatTable: Map<string, ThreatEntry>,
    playerId: string,
    actionType: ThreatAction,
    amount: number
  ): void {
    const threatGain = ThreatEvaluator.calculateThreat(actionType, amount);

    const existing = threatTable.get(playerId);
    if (existing) {
      existing.threat += threatGain;
      existing.lastActionAt = Date.now();
    } else {
      threatTable.set(playerId, {
        playerId,
        threat: threatGain,
        lastActionAt: Date.now(),
      });
    }
  }

  /**
   * Calculate threat based on action type and amount
   */
  private static calculateThreat(actionType: ThreatAction, amount: number): number {
    switch (actionType) {
      case 'damage':
        return amount * ThreatEvaluator.THREAT_WEIGHTS.damage;
      case 'healing':
        return amount * ThreatEvaluator.THREAT_WEIGHTS.healing;
      case 'revival':
        return ThreatEvaluator.THREAT_WEIGHTS.revival;
      case 'buff_applied':
        return ThreatEvaluator.THREAT_WEIGHTS.buff_applied;
      default:
        return 0;
    }
  }

  /**
   * Select target using weighted randomness
   * 70% highest threat, 20% second highest, 10% random
   * @param threatTable Threat table
   * @param alivePlayers List of alive player IDs
   * @returns Selected target ID or null
   */
  public static selectTarget(
    threatTable: Map<string, ThreatEntry>,
    alivePlayers: string[]
  ): string | null {
    if (alivePlayers.length === 0) {
      return null;
    }

    // Get threat entries for alive players, sorted descending
    const aliveThreats = Array.from(threatTable.values())
      .filter(entry => alivePlayers.includes(entry.playerId))
      .sort((a, b) => b.threat - a.threat);

    // If no threat history, random target
    if (aliveThreats.length === 0) {
      const randomIndex = Math.floor(Math.random() * alivePlayers.length);
      return alivePlayers[randomIndex];
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
      return alivePlayers[randomIndex];
    }
  }

  /**
   * Remove a player from the threat table
   * @param threatTable Threat table
   * @param playerId Player to remove
   */
  public static cleanupPlayer(
    threatTable: Map<string, ThreatEntry>,
    playerId: string
  ): void {
    threatTable.delete(playerId);
  }

  /**
   * Decay threat for all players
   * Removes entries that reach 0 or below
   * @param threatTable Threat table
   * @param decayAmount Amount to reduce from each entry
   */
  public static decayThreat(
    threatTable: Map<string, ThreatEntry>,
    decayAmount: number
  ): void {
    const toRemove: string[] = [];

    for (const [playerId, entry] of Array.from(threatTable.entries())) {
      entry.threat -= decayAmount;
      if (entry.threat <= 0) {
        toRemove.push(playerId);
      }
    }

    for (const playerId of toRemove) {
      threatTable.delete(playerId);
    }
  }
}
