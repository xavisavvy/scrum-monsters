/**
 * PatternSequencer
 *
 * Handles weighted pattern selection with phase filtering and anti-repeat logic.
 */

import type { AttackPattern, BossPhaseNumber } from './types';

/**
 * Pattern sequencer for selecting boss attack patterns
 */
export class PatternSequencer {
  /**
   * Get patterns available in the current phase
   * @param patterns All attack patterns
   * @param phase Current boss phase
   * @returns Patterns valid for this phase
   */
  public static getAvailablePatterns(
    patterns: AttackPattern[],
    phase: BossPhaseNumber
  ): AttackPattern[] {
    return patterns.filter(pattern => pattern.phases.includes(phase));
  }

  /**
   * Select a pattern using weighted random selection
   * @param patterns All attack patterns
   * @param phase Current boss phase
   * @param lastPatternId Last pattern selected (to avoid repeats)
   * @returns Selected pattern or null if none available
   */
  public static selectPattern(
    patterns: AttackPattern[],
    phase: BossPhaseNumber,
    lastPatternId?: string
  ): AttackPattern | null {
    // Filter to available patterns
    let available = PatternSequencer.getAvailablePatterns(patterns, phase);

    if (available.length === 0) {
      return null;
    }

    // Remove last pattern if we have alternatives
    if (lastPatternId && available.length > 1) {
      available = available.filter(p => p.id !== lastPatternId);
    }

    // Weighted random selection
    const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const pattern of available) {
      random -= pattern.weight;
      if (random <= 0) {
        return pattern;
      }
    }

    // Fallback (should never reach here)
    return available[available.length - 1];
  }
}
