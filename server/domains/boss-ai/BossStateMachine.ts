/**
 * BossStateMachine
 *
 * Explicit finite state machine for boss behavior.
 * Replaces boolean `isEnraged` flag with type-safe states and validated transitions.
 */

import type { BossState, BossPhaseNumber } from './types';

/**
 * Boss state machine implementation
 */
export class BossStateMachine {
  private currentState: BossState = 'idle';
  private previousState: BossState = 'idle';
  private stateEnteredAt: number = Date.now();

  /**
   * Valid state transitions map
   * Each state maps to an array of allowed next states
   */
  private readonly validTransitions: Record<BossState, BossState[]> = {
    'idle': ['telegraphing', 'phase_transition'],
    'telegraphing': ['attacking'],
    'attacking': ['recovering'],
    'recovering': ['idle'],
    'phase_transition': ['idle'],
  };

  /**
   * Attempt to transition to a new state
   * @param newState The state to transition to
   * @returns true if transition successful, false if invalid
   */
  public transitionTo(newState: BossState): boolean {
    const allowed = this.validTransitions[this.currentState];
    if (!allowed.includes(newState)) {
      return false; // Invalid transition
    }

    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateEnteredAt = Date.now();
    return true;
  }

  /**
   * Get elapsed time in current state
   * @returns Milliseconds since state was entered
   */
  public getStateElapsedMs(): number {
    return Date.now() - this.stateEnteredAt;
  }

  /**
   * Get current state
   */
  public getCurrentState(): BossState {
    return this.currentState;
  }

  /**
   * Get previous state
   */
  public getPreviousState(): BossState {
    return this.previousState;
  }

  /**
   * Calculate boss phase based on HP ratio
   * Phase 1: >66% HP
   * Phase 2: 34-66% HP
   * Phase 3: <=33% HP
   *
   * @param hp Current boss HP
   * @param maxHp Maximum boss HP
   * @returns Current phase number (1, 2, or 3)
   */
  public static getCurrentPhase(hp: number, maxHp: number): BossPhaseNumber {
    const ratio = hp / maxHp;
    if (ratio > 0.66) return 1;
    if (ratio > 0.33) return 2;
    return 3;
  }

  /**
   * Check if boss has transitioned to a new phase
   * Phase transitions are one-way only (phase can only increase)
   *
   * @param hp Current boss HP
   * @param maxHp Maximum boss HP
   * @param lastPhase Last known phase
   * @returns Object with transitioned flag and new phase
   */
  public static checkPhaseTransition(
    hp: number,
    maxHp: number,
    lastPhase: BossPhaseNumber
  ): { transitioned: boolean; newPhase: BossPhaseNumber } {
    const currentPhase = BossStateMachine.getCurrentPhase(hp, maxHp);

    // Phase transitions are one-way: can only increase
    if (currentPhase > lastPhase) {
      return { transitioned: true, newPhase: currentPhase };
    }

    return { transitioned: false, newPhase: lastPhase };
  }
}
