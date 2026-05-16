/**
 * BossStateMachine Tests
 *
 * Tests for the explicit boss state machine.
 * RED phase: These tests should FAIL initially.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BossStateMachine } from './BossStateMachine';

describe('BossStateMachine', () => {
  let fsm: BossStateMachine;

  beforeEach(() => {
    fsm = new BossStateMachine();
  });

  describe('Initial State', () => {
    it('starts in idle state', () => {
      expect(fsm.getCurrentState()).toBe('idle');
    });
  });

  describe('Valid Transitions', () => {
    it('transitions from idle to telegraphing', () => {
      const result = fsm.transitionTo('telegraphing');
      expect(result).toBe(true);
      expect(fsm.getCurrentState()).toBe('telegraphing');
    });

    it('transitions from idle to phase_transition', () => {
      const result = fsm.transitionTo('phase_transition');
      expect(result).toBe(true);
      expect(fsm.getCurrentState()).toBe('phase_transition');
    });

    it('follows full attack cycle: idle -> telegraphing -> attacking -> recovering -> idle', () => {
      expect(fsm.transitionTo('telegraphing')).toBe(true);
      expect(fsm.getCurrentState()).toBe('telegraphing');

      expect(fsm.transitionTo('attacking')).toBe(true);
      expect(fsm.getCurrentState()).toBe('attacking');

      expect(fsm.transitionTo('recovering')).toBe(true);
      expect(fsm.getCurrentState()).toBe('recovering');

      expect(fsm.transitionTo('idle')).toBe(true);
      expect(fsm.getCurrentState()).toBe('idle');
    });

    it('follows phase transition cycle: idle -> phase_transition -> idle', () => {
      expect(fsm.transitionTo('phase_transition')).toBe(true);
      expect(fsm.getCurrentState()).toBe('phase_transition');

      expect(fsm.transitionTo('idle')).toBe(true);
      expect(fsm.getCurrentState()).toBe('idle');
    });
  });

  describe('Invalid Transitions', () => {
    it('rejects transition from idle to attacking (must telegraph first)', () => {
      const result = fsm.transitionTo('attacking');
      expect(result).toBe(false);
      expect(fsm.getCurrentState()).toBe('idle'); // State unchanged
    });

    it('rejects transition from idle to recovering', () => {
      const result = fsm.transitionTo('recovering');
      expect(result).toBe(false);
      expect(fsm.getCurrentState()).toBe('idle');
    });
  });

  describe('State Timing', () => {
    it('tracks time elapsed in current state via getStateElapsedMs()', async () => {
      fsm.transitionTo('telegraphing');
      const elapsed1 = fsm.getStateElapsedMs();
      expect(elapsed1).toBeGreaterThanOrEqual(0);

      // Wait 50ms
      await new Promise(resolve => setTimeout(resolve, 50));

      const elapsed2 = fsm.getStateElapsedMs();
      expect(elapsed2).toBeGreaterThanOrEqual(45); // Allow slight variance for timing
    });
  });

  describe('Previous State Tracking', () => {
    it('tracks previous state after transitions', () => {
      expect(fsm.getPreviousState()).toBe('idle'); // Initially same as current

      fsm.transitionTo('telegraphing');
      expect(fsm.getPreviousState()).toBe('idle');

      fsm.transitionTo('attacking');
      expect(fsm.getPreviousState()).toBe('telegraphing');
    });
  });

  describe('Phase Calculation', () => {
    it('getCurrentPhase returns phase 1 for 100-67% HP', () => {
      expect(BossStateMachine.getCurrentPhase(1000, 1000)).toBe(1);
      expect(BossStateMachine.getCurrentPhase(800, 1000)).toBe(1);
      expect(BossStateMachine.getCurrentPhase(670, 1000)).toBe(1);
    });

    it('getCurrentPhase returns phase 2 for 66-34% HP', () => {
      expect(BossStateMachine.getCurrentPhase(660, 1000)).toBe(2);
      expect(BossStateMachine.getCurrentPhase(500, 1000)).toBe(2);
      expect(BossStateMachine.getCurrentPhase(340, 1000)).toBe(2);
    });

    it('getCurrentPhase returns phase 3 for 33-0% HP', () => {
      expect(BossStateMachine.getCurrentPhase(330, 1000)).toBe(3);
      expect(BossStateMachine.getCurrentPhase(100, 1000)).toBe(3);
      expect(BossStateMachine.getCurrentPhase(1, 1000)).toBe(3);
    });
  });

  describe('Phase Transition Detection', () => {
    it('detects phase transition when phase changes', () => {
      // Boss at phase 1 (100% HP)
      const result1 = BossStateMachine.checkPhaseTransition(1000, 1000, 1);
      expect(result1.transitioned).toBe(false);
      expect(result1.newPhase).toBe(1);

      // Boss drops to phase 2 (65% HP)
      const result2 = BossStateMachine.checkPhaseTransition(650, 1000, 1);
      expect(result2.transitioned).toBe(true);
      expect(result2.newPhase).toBe(2);

      // Boss stays in phase 2
      const result3 = BossStateMachine.checkPhaseTransition(500, 1000, 2);
      expect(result3.transitioned).toBe(false);
      expect(result3.newPhase).toBe(2);

      // Boss drops to phase 3 (30% HP)
      const result4 = BossStateMachine.checkPhaseTransition(300, 1000, 2);
      expect(result4.transitioned).toBe(true);
      expect(result4.newPhase).toBe(3);
    });

    it('phase transitions are one-way only (phase only increases)', () => {
      // Boss at phase 3, heals to phase 2 HP range
      const result = BossStateMachine.checkPhaseTransition(400, 1000, 3);
      expect(result.transitioned).toBe(false);
      expect(result.newPhase).toBe(3); // Stays in phase 3
    });
  });
});
