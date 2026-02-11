/**
 * BossAI Coordinator
 *
 * Orchestrates all boss AI subsystems:
 * - BossStateMachine for phase tracking
 * - PatternSequencer for attack selection
 * - ThreatEvaluator for targeting
 *
 * Provides a simple API for CombatManager to call.
 */

import type {
  BossType,
  BossBehavior,
  BossAction,
  BattleContext,
  ThreatEntry,
  BossPhaseNumber,
  AttackPattern,
} from './types';
import { BossStateMachine } from './BossStateMachine';
import { PatternSequencer } from './PatternSequencer';
import { ThreatEvaluator } from './ThreatEvaluator';
import { getBossBehavior } from './boss-definitions';

/**
 * BossAI coordinator class
 * Combines state machine, pattern selection, and threat evaluation
 */
export class BossAI {
  private readonly bossType: BossType;
  private readonly behavior: BossBehavior;
  private readonly stateMachine: BossStateMachine;
  private lastPatternId: string | null = null;
  private lastPhase: BossPhaseNumber = 1;

  /**
   * Create a new BossAI instance
   * @param bossType Type of boss to create AI for
   */
  constructor(bossType: BossType) {
    this.bossType = bossType;
    this.behavior = getBossBehavior(bossType);
    this.stateMachine = new BossStateMachine();
  }

  /**
   * Select the next action for the boss to take
   * @param context Battle context (HP, player counts, etc.)
   * @param threatTable Threat table for targeting
   * @param alivePlayers List of alive player IDs
   * @returns Boss action with pattern and targets, or null if no action possible
   */
  public selectNextAction(
    context: BattleContext,
    threatTable: Map<string, ThreatEntry>,
    alivePlayers: string[]
  ): BossAction | null {
    // No action if no alive players
    if (alivePlayers.length === 0) {
      return null;
    }

    // Get current phase based on HP
    const currentPhase = BossStateMachine.getCurrentPhase(context.bossHp, context.bossMaxHp);

    // Get available patterns for this phase
    const availablePatterns = PatternSequencer.getAvailablePatterns(
      this.behavior.patterns,
      currentPhase
    );

    if (availablePatterns.length === 0) {
      return null;
    }

    // Select pattern with anti-repeat logic
    const pattern = PatternSequencer.selectPattern(
      this.behavior.patterns,
      currentPhase,
      this.lastPatternId || undefined
    );

    if (!pattern) {
      return null;
    }

    // Determine targets based on pattern target mode
    const targetPlayerIds = this.selectTargets(pattern, threatTable, alivePlayers, context);

    // Update last pattern
    this.lastPatternId = pattern.id;

    return {
      pattern,
      targetPlayerIds,
    };
  }

  /**
   * Select targets based on pattern targeting mode
   */
  private selectTargets(
    pattern: AttackPattern,
    threatTable: Map<string, ThreatEntry>,
    alivePlayers: string[],
    context: BattleContext
  ): string[] {
    switch (pattern.targetMode) {
      case 'highest_threat': {
        // Force highest threat selection
        const aliveThreats = Array.from(threatTable.values())
          .filter(entry => alivePlayers.includes(entry.playerId))
          .sort((a, b) => b.threat - a.threat);

        if (aliveThreats.length > 0) {
          return [aliveThreats[0].playerId];
        }
        // Fallback to random if no threat data
        return [alivePlayers[Math.floor(Math.random() * alivePlayers.length)]];
      }

      case 'lowest_hp': {
        // Find player with lowest HP
        // Note: This requires HP data in context, which we'll need to add
        // For now, use random as a placeholder
        // TODO: Add player HP tracking to BattleContext
        return [alivePlayers[Math.floor(Math.random() * alivePlayers.length)]];
      }

      case 'random': {
        const randomIndex = Math.floor(Math.random() * alivePlayers.length);
        return [alivePlayers[randomIndex]];
      }

      case 'all': {
        return [...alivePlayers];
      }

      case 'multi': {
        const count = Math.min(pattern.targetCount || 2, alivePlayers.length);
        const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
      }

      default: {
        return [alivePlayers[0]];
      }
    }
  }

  /**
   * Check if boss has transitioned to a new phase
   * @param hp Current boss HP
   * @param maxHp Maximum boss HP
   * @returns Object with transition info and phase message
   */
  public checkPhaseTransition(
    hp: number,
    maxHp: number
  ): { transitioned: boolean; newPhase: BossPhaseNumber; message: string | null } {
    const result = BossStateMachine.checkPhaseTransition(hp, maxHp, this.lastPhase);

    if (result.transitioned) {
      this.lastPhase = result.newPhase;
      const message = this.behavior.phaseTransitionMessages[result.newPhase];
      return {
        transitioned: true,
        newPhase: result.newPhase,
        message: message || null,
      };
    }

    return {
      transitioned: false,
      newPhase: this.lastPhase,
      message: null,
    };
  }

  /**
   * Get boss type
   */
  public getBossType(): BossType {
    return this.bossType;
  }

  /**
   * Get boss behavior definition
   */
  public getBehavior(): BossBehavior {
    return this.behavior;
  }

  /**
   * Record threat from a player action
   * @param threatTable Threat table to update
   * @param playerId Player generating threat
   * @param actionType Type of action
   * @param amount Amount (damage/healing)
   */
  public recordThreat(
    threatTable: Map<string, ThreatEntry>,
    playerId: string,
    actionType: 'damage' | 'healing' | 'revival',
    amount: number
  ): void {
    ThreatEvaluator.addThreat(threatTable, playerId, actionType, amount);
  }

  /**
   * Remove a player from the threat table
   * @param threatTable Threat table
   * @param playerId Player to remove
   */
  public cleanupPlayer(threatTable: Map<string, ThreatEntry>, playerId: string): void {
    ThreatEvaluator.cleanupPlayer(threatTable, playerId);
  }
}
