/**
 * ProgressionManager Unit Tests
 *
 * Tests XP curve calculations and XP award logic using TDD approach.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { XPCurve, ProgressionManager } from './ProgressionManager';
import { ScopedEventBus } from '../events';
import type { DomainEventMap } from '../events/eventTypes';

// =============================================================================
// XPCurve Tests
// =============================================================================

describe('XPCurve', () => {
  let curve: XPCurve;

  beforeEach(() => {
    curve = new XPCurve({ baseXP: 100, exponent: 1.5 });
  });

  describe('calculateLevel', () => {
    it('returns level 1 for 0 XP', () => {
      expect(curve.calculateLevel(0)).toBe(1);
    });

    it('returns level 2 at exactly 100 XP', () => {
      expect(curve.calculateLevel(100)).toBe(2);
    });

    it('returns level 1 at 99 XP (just under threshold)', () => {
      expect(curve.calculateLevel(99)).toBe(1);
    });

    it('returns level 3 at 382 XP', () => {
      expect(curve.calculateLevel(382)).toBe(3);
    });

    it('handles high levels without overflow', () => {
      const level = curve.calculateLevel(1000000);
      expect(level).toBeGreaterThan(40);
      expect(level).toBeLessThan(100); // Sanity check
    });
  });

  describe('getLevelThreshold', () => {
    it('calculates correct threshold for level 2', () => {
      expect(curve.getLevelThreshold(2)).toBe(100);
    });

    it('calculates correct threshold for level 3', () => {
      // Level 3 threshold is 100 * 2^1.5 = 282.84..., floored to 282
      expect(curve.getLevelThreshold(3)).toBe(282);
    });

    it('calculates correct threshold for level 10', () => {
      // Level 10 threshold is 100 * 9^1.5 = 2700
      expect(curve.getLevelThreshold(10)).toBeGreaterThan(2500);
      expect(curve.getLevelThreshold(10)).toBeLessThan(3000);
    });

    it('returns 0 for level 1', () => {
      expect(curve.getLevelThreshold(1)).toBe(0);
    });
  });

  describe('getTotalXPForLevel', () => {
    it('returns 0 for level 1', () => {
      expect(curve.getTotalXPForLevel(1)).toBe(0);
    });

    it('returns 100 for level 2', () => {
      expect(curve.getTotalXPForLevel(2)).toBe(100);
    });

    it('returns cumulative XP for level 3', () => {
      // 100 (level 2) + 282 (level 3) = 382
      expect(curve.getTotalXPForLevel(3)).toBe(382);
    });
  });

  describe('getProgressToNextLevel', () => {
    it('calculates progress at level 1 with 50 XP', () => {
      const progress = curve.getProgressToNextLevel(50);
      expect(progress.current).toBe(50);
      expect(progress.needed).toBe(100);
      expect(progress.percentage).toBe(50);
    });

    it('calculates progress at level 1 with 0 XP', () => {
      const progress = curve.getProgressToNextLevel(0);
      expect(progress.current).toBe(0);
      expect(progress.needed).toBe(100);
      expect(progress.percentage).toBe(0);
    });

    it('calculates progress at level boundary', () => {
      const progress = curve.getProgressToNextLevel(100);
      expect(progress.current).toBe(0);
      expect(progress.needed).toBe(282);
      expect(progress.percentage).toBe(0);
    });

    it('calculates progress mid-level 2', () => {
      const progress = curve.getProgressToNextLevel(200); // 100 XP into level 2
      expect(progress.current).toBe(100);
      expect(progress.needed).toBe(282);
      expect(progress.percentage).toBe(35); // 100/282 = 35.46%, floored to 35
    });
  });
});

// =============================================================================
// ProgressionManager Tests
// =============================================================================

describe('ProgressionManager', () => {
  let manager: ProgressionManager;
  let eventBus: ScopedEventBus;
  let emittedEvents: Record<string, any[]>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    emittedEvents = {};

    // Spy on event emissions
    const originalEmit = eventBus.emit.bind(eventBus);
    eventBus.emit = (<K extends keyof DomainEventMap>(event: K, payload: DomainEventMap[K]) => {
      if (!emittedEvents[event as string]) {
        emittedEvents[event as string] = [];
      }
      emittedEvents[event as string].push(payload);
      return originalEmit(event, payload);
    }) as typeof eventBus.emit;

    manager = new ProgressionManager({ eventBus });
  });

  describe('awardXP', () => {
    it('awards XP and emits xp_awarded event', () => {
      manager.awardXP('lobby1', 'player1', 10, 'vote');

      expect(emittedEvents['progression:xp_awarded']).toBeDefined();
      expect(emittedEvents['progression:xp_awarded'].length).toBe(1);
      expect(emittedEvents['progression:xp_awarded'][0].amount).toBe(10);
      expect(emittedEvents['progression:xp_awarded'][0].source).toBe('vote');
      expect(emittedEvents['progression:xp_awarded'][0].newTotal).toBe(10);
    });

    it('emits level_up when crossing threshold', () => {
      // Initialize player just under level 2
      manager.initializePlayer('lobby1', 'player1', 95);
      emittedEvents = {}; // Clear initialization events

      // Award XP that crosses threshold
      manager.awardXP('lobby1', 'player1', 10, 'vote');

      expect(emittedEvents['progression:level_up']).toBeDefined();
      expect(emittedEvents['progression:level_up'][0].oldLevel).toBe(1);
      expect(emittedEvents['progression:level_up'][0].newLevel).toBe(2);
    });

    it('does not emit level_up when staying same level', () => {
      manager.awardXP('lobby1', 'player1', 5, 'vote');

      expect(emittedEvents['progression:level_up']).toBeUndefined();
    });

    it('calculates damage XP based on damage amount', () => {
      manager.awardXP('lobby1', 'player1', 10, 'boss_damage');

      // 10 damage * 2 XP/damage = 20 XP
      expect(emittedEvents['progression:xp_awarded'][0].amount).toBe(20);
      expect(emittedEvents['progression:xp_awarded'][0].newTotal).toBe(20);
    });

    it('awards fixed XP for vote action', () => {
      manager.awardXP('lobby1', 'player1', 1, 'vote');

      // Vote always awards 10 XP regardless of input amount
      expect(emittedEvents['progression:xp_awarded'][0].amount).toBe(10);
    });

    it('awards fixed XP for consensus action', () => {
      manager.awardXP('lobby1', 'player1', 1, 'consensus');

      // Consensus always awards 50 XP
      expect(emittedEvents['progression:xp_awarded'][0].amount).toBe(50);
    });

    it('awards fixed XP for revival action', () => {
      manager.awardXP('lobby1', 'player1', 1, 'revival');

      // Revival awards 30 XP base
      expect(emittedEvents['progression:xp_awarded'][0].amount).toBe(30);
    });

    it('accumulates XP correctly over multiple awards', () => {
      manager.awardXP('lobby1', 'player1', 10, 'vote'); // 10 XP
      manager.awardXP('lobby1', 'player1', 5, 'boss_damage'); // 10 XP (5*2)
      manager.awardXP('lobby1', 'player1', 1, 'consensus'); // 50 XP

      expect(emittedEvents['progression:xp_awarded'][2].newTotal).toBe(70);
    });

    it('emits multiple level_up events when skipping levels', () => {
      // Award massive XP to skip multiple levels
      manager.awardXP('lobby1', 'player1', 500, 'boss_damage'); // 1000 XP (500*2)

      // Should trigger multiple level-ups
      expect(emittedEvents['progression:level_up']).toBeDefined();
      expect(emittedEvents['progression:level_up'].length).toBeGreaterThan(1);
    });
  });

  describe('getPlayerXP', () => {
    it('returns 0 for uninitialized player', () => {
      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(0);
    });

    it('returns correct XP after awards', () => {
      manager.awardXP('lobby1', 'player1', 10, 'vote');
      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(10);
    });

    it('returns initialized XP', () => {
      manager.initializePlayer('lobby1', 'player1', 250);
      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(250);
    });
  });

  describe('getPlayerLevel', () => {
    it('returns 1 for uninitialized player', () => {
      expect(manager.getPlayerLevel('lobby1', 'player1')).toBe(1);
    });

    it('returns correct level after XP awards', () => {
      manager.awardXP('lobby1', 'player1', 50, 'boss_damage'); // 100 XP total
      expect(manager.getPlayerLevel('lobby1', 'player1')).toBe(2);
    });

    it('returns correct level for initialized player', () => {
      manager.initializePlayer('lobby1', 'player1', 400);
      expect(manager.getPlayerLevel('lobby1', 'player1')).toBe(3);
    });
  });

  describe('initializePlayer', () => {
    it('sets initial XP correctly', () => {
      manager.initializePlayer('lobby1', 'player1', 150);
      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(150);
    });

    it('does not emit events', () => {
      manager.initializePlayer('lobby1', 'player1', 150);
      expect(emittedEvents['progression:xp_awarded']).toBeUndefined();
      expect(emittedEvents['progression:level_up']).toBeUndefined();
    });
  });

  describe('cleanupLobby', () => {
    it('removes lobby from tracking', () => {
      manager.awardXP('lobby1', 'player1', 10, 'vote');
      manager.cleanupLobby('lobby1');

      // After cleanup, player should be back to 0 XP
      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(0);
    });

    it('handles cleanup of non-existent lobby', () => {
      expect(() => manager.cleanupLobby('nonexistent')).not.toThrow();
    });
  });

  describe('multi-lobby isolation', () => {
    it('tracks XP separately per lobby', () => {
      manager.awardXP('lobby1', 'player1', 10, 'vote');
      manager.awardXP('lobby2', 'player1', 20, 'boss_damage');

      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(10);
      expect(manager.getPlayerXP('lobby2', 'player1')).toBe(40); // 20*2
    });

    it('cleanup only affects specific lobby', () => {
      manager.awardXP('lobby1', 'player1', 10, 'vote');
      manager.awardXP('lobby2', 'player1', 10, 'vote');

      manager.cleanupLobby('lobby1');

      expect(manager.getPlayerXP('lobby1', 'player1')).toBe(0);
      expect(manager.getPlayerXP('lobby2', 'player1')).toBe(10);
    });
  });
});
