import { describe, it, expect, beforeEach } from 'vitest';
import { useProgression } from './useProgression';

describe('useProgression', () => {
  beforeEach(() => {
    useProgression.getState().reset();
  });

  describe('handleXPAwarded', () => {
    it('updates currentXP to newTotal', () => {
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 10,
        source: 'vote',
        newTotal: 110,
        timestamp: Date.now(),
      });
      expect(useProgression.getState().currentXP).toBe(110);
    });

    it('adds pending gain for animation', () => {
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 10,
        source: 'vote',
        newTotal: 10,
        timestamp: Date.now(),
      });
      const pending = useProgression.getState().pendingXPGains;
      expect(pending.length).toBe(1);
      expect(pending[0].amount).toBe(10);
      expect(pending[0].source).toBe('vote');
    });

    it('tracks multiple pending gains', () => {
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 10,
        source: 'vote',
        newTotal: 10,
        timestamp: Date.now(),
      });
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 20,
        source: 'boss_damage',
        newTotal: 30,
        timestamp: Date.now() + 100,
      });
      const pending = useProgression.getState().pendingXPGains;
      expect(pending.length).toBe(2);
      expect(pending[0].amount).toBe(10);
      expect(pending[1].amount).toBe(20);
      expect(pending[1].source).toBe('boss_damage');
    });
  });

  describe('handleLevelUp', () => {
    it('sets levelUp state', () => {
      useProgression.getState().handleLevelUp({
        playerId: 'p1',
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now(),
      });
      const levelUp = useProgression.getState().levelUp;
      expect(levelUp?.active).toBe(true);
      expect(levelUp?.newLevel).toBe(2);
      expect(levelUp?.oldLevel).toBe(1);
    });

    it('updates currentLevel', () => {
      useProgression.getState().handleLevelUp({
        playerId: 'p1',
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now(),
      });
      expect(useProgression.getState().currentLevel).toBe(2);
    });
  });

  describe('handleSync', () => {
    it('sets currentXP and currentLevel', () => {
      useProgression.getState().handleSync({
        playerId: 'p1',
        totalXP: 150,
        currentLevel: 2,
        timestamp: Date.now(),
      });
      expect(useProgression.getState().currentXP).toBe(150);
      expect(useProgression.getState().currentLevel).toBe(2);
      expect(useProgression.getState().isLoaded).toBe(true);
    });
  });

  describe('getProgressToNextLevel', () => {
    it('calculates percentage correctly at level 1', () => {
      useProgression.getState().handleSync({
        playerId: 'p1',
        totalXP: 50,
        currentLevel: 1,
        timestamp: Date.now(),
      });
      const progress = useProgression.getState().getProgressToNextLevel();
      expect(progress.current).toBe(50);
      expect(progress.needed).toBe(100);
      expect(progress.percentage).toBe(50);
    });

    it('calculates percentage correctly at level 2', () => {
      // Level 2 threshold = 0, Level 3 threshold = floor(100 * 2^1.5) = floor(282.84) = 282
      useProgression.getState().handleSync({
        playerId: 'p1',
        totalXP: 200,
        currentLevel: 2,
        timestamp: Date.now(),
      });
      const progress = useProgression.getState().getProgressToNextLevel();
      // XP in current level = 200 - 100 = 100
      // XP needed for level = 282 - 100 = 182
      expect(progress.current).toBe(100);
      expect(progress.needed).toBe(182);
      expect(progress.percentage).toBe(54); // floor((100 / 182) * 100)
    });

    it('handles 100% progress (at level threshold)', () => {
      // Level 2 threshold = 100
      useProgression.getState().handleSync({
        playerId: 'p1',
        totalXP: 100,
        currentLevel: 2,
        timestamp: Date.now(),
      });
      const progress = useProgression.getState().getProgressToNextLevel();
      expect(progress.percentage).toBe(0); // At exact threshold = 0% into next level
    });
  });

  describe('clearPendingGain', () => {
    it('removes specific gain by id', () => {
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 10,
        source: 'vote',
        newTotal: 10,
        timestamp: Date.now(),
      });
      const id = useProgression.getState().pendingXPGains[0].id;
      useProgression.getState().clearPendingGain(id);
      expect(useProgression.getState().pendingXPGains.length).toBe(0);
    });

    it('only removes specified gain', () => {
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 10,
        source: 'vote',
        newTotal: 10,
        timestamp: Date.now(),
      });
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 20,
        source: 'boss_damage',
        newTotal: 30,
        timestamp: Date.now() + 100,
      });
      const firstId = useProgression.getState().pendingXPGains[0].id;
      useProgression.getState().clearPendingGain(firstId);
      const remaining = useProgression.getState().pendingXPGains;
      expect(remaining.length).toBe(1);
      expect(remaining[0].amount).toBe(20);
    });
  });

  describe('clearLevelUp', () => {
    it('clears levelUp state', () => {
      useProgression.getState().handleLevelUp({
        playerId: 'p1',
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now(),
      });
      expect(useProgression.getState().levelUp).not.toBeNull();
      useProgression.getState().clearLevelUp();
      expect(useProgression.getState().levelUp).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      useProgression.getState().handleSync({
        playerId: 'p1',
        totalXP: 150,
        currentLevel: 2,
        timestamp: Date.now(),
      });
      useProgression.getState().handleXPAwarded({
        playerId: 'p1',
        amount: 10,
        source: 'vote',
        newTotal: 160,
        timestamp: Date.now(),
      });
      useProgression.getState().handleLevelUp({
        playerId: 'p1',
        oldLevel: 2,
        newLevel: 3,
        timestamp: Date.now(),
      });

      useProgression.getState().reset();

      expect(useProgression.getState().currentXP).toBe(0);
      expect(useProgression.getState().currentLevel).toBe(1);
      expect(useProgression.getState().pendingXPGains.length).toBe(0);
      expect(useProgression.getState().levelUp).toBeNull();
      expect(useProgression.getState().isLoaded).toBe(false);
    });
  });
});
