import { describe, it, expect, beforeEach } from 'vitest';
import { useClassMastery } from './useClassMastery';

describe('useClassMastery', () => {
  beforeEach(() => {
    // Reset store before each test
    useClassMastery.getState().reset();
  });

  describe('handleXPAwarded', () => {
    it('should update classXP for correct class', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 100,
        source: 'vote',
        newTotal: 100,
      });

      const masteryData = useClassMastery.getState().masteryData;
      expect(masteryData['ranger']).toBeDefined();
      expect(masteryData['ranger'].classXP).toBe(100);
      expect(masteryData['ranger'].currentTier).toBe('Novice');
    });

    it('should NOT update other classes', () => {
      const store = useClassMastery.getState();

      // Award XP to ranger
      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 100,
        source: 'vote',
        newTotal: 100,
      });

      const masteryData = useClassMastery.getState().masteryData;
      expect(masteryData['ranger']).toBeDefined();
      expect(masteryData['warrior']).toBeUndefined();
      expect(masteryData['cleric']).toBeUndefined();
    });

    it('should update tier when XP crosses threshold to Expert', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 1000,
        source: 'consensus',
        newTotal: 1000,
      });

      const masteryData = useClassMastery.getState().masteryData;
      expect(masteryData['ranger'].currentTier).toBe('Expert');
    });

    it('should update tier when XP crosses threshold to Master', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 5000,
        source: 'consensus',
        newTotal: 5000,
      });

      const masteryData = useClassMastery.getState().masteryData;
      expect(masteryData['ranger'].currentTier).toBe('Master');
    });
  });

  describe('handleTierUp', () => {
    it('should set pendingTierUp', () => {
      const store = useClassMastery.getState();

      store.handleTierUp({
        playerId: 'player-1',
        avatarClass: 'ranger',
        oldTier: 'Novice',
        newTier: 'Expert',
      });

      const { pendingTierUp } = useClassMastery.getState();
      expect(pendingTierUp).toBeDefined();
      expect(pendingTierUp?.avatarClass).toBe('ranger');
      expect(pendingTierUp?.oldTier).toBe('Novice');
      expect(pendingTierUp?.newTier).toBe('Expert');
    });
  });

  describe('handleSync', () => {
    it('should replace all mastery data', () => {
      const store = useClassMastery.getState();

      // Set initial data
      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 100,
        source: 'vote',
        newTotal: 100,
      });

      // Sync with server data
      store.handleSync({
        playerId: 'player-1',
        masteryData: {
          warrior: { classXP: 500, currentTier: 'Novice' },
          cleric: { classXP: 1200, currentTier: 'Expert' },
        },
      });

      const masteryData = useClassMastery.getState().masteryData;
      expect(masteryData['warrior']).toBeDefined();
      expect(masteryData['warrior'].classXP).toBe(500);
      expect(masteryData['cleric']).toBeDefined();
      expect(masteryData['cleric'].classXP).toBe(1200);
      expect(masteryData['cleric'].currentTier).toBe('Expert');
      // Original ranger data should be replaced (not in sync)
      expect(masteryData['ranger']).toBeUndefined();
    });
  });

  describe('clearTierUp', () => {
    it('should clear pendingTierUp', () => {
      const store = useClassMastery.getState();

      // Set pendingTierUp
      store.handleTierUp({
        playerId: 'player-1',
        avatarClass: 'ranger',
        oldTier: 'Novice',
        newTier: 'Expert',
      });

      expect(useClassMastery.getState().pendingTierUp).not.toBeNull();

      // Clear it
      store.clearTierUp();

      expect(useClassMastery.getState().pendingTierUp).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      const store = useClassMastery.getState();

      // Set some data
      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 100,
        source: 'vote',
        newTotal: 100,
      });
      store.handleTierUp({
        playerId: 'player-1',
        avatarClass: 'ranger',
        oldTier: 'Novice',
        newTier: 'Expert',
      });

      expect(useClassMastery.getState().masteryData['ranger']).toBeDefined();
      expect(useClassMastery.getState().pendingTierUp).not.toBeNull();

      // Reset
      store.reset();

      const { masteryData, pendingTierUp } = useClassMastery.getState();
      expect(Object.keys(masteryData).length).toBe(0);
      expect(pendingTierUp).toBeNull();
    });
  });

  describe('getMasteryForClass', () => {
    it('should return null for unknown class', () => {
      const store = useClassMastery.getState();
      const result = store.getMasteryForClass('ranger');
      expect(result).toBeNull();
    });

    it('should return correct data for known class', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 100,
        source: 'vote',
        newTotal: 100,
      });

      const result = store.getMasteryForClass('ranger');
      expect(result).toBeDefined();
      expect(result?.classXP).toBe(100);
      expect(result?.currentTier).toBe('Novice');
    });
  });

  describe('getProgressToNextTier', () => {
    it('should calculate correct percentage for Novice → Expert', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 500,
        source: 'consensus',
        newTotal: 500,
      });

      const progress = store.getProgressToNextTier('ranger');
      expect(progress.current).toBe(500);
      expect(progress.needed).toBe(1000);
      expect(progress.percentage).toBe(50);
      expect(progress.currentTier).toBe('Novice');
      expect(progress.nextTier).toBe('Expert');
    });

    it('should calculate correct percentage for Expert → Master', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 3000,
        source: 'consensus',
        newTotal: 3000,
      });

      const progress = store.getProgressToNextTier('ranger');
      expect(progress.current).toBe(2000); // 3000 - 1000 (Expert threshold)
      expect(progress.needed).toBe(4000); // 5000 - 1000
      expect(progress.percentage).toBe(50);
      expect(progress.currentTier).toBe('Expert');
      expect(progress.nextTier).toBe('Master');
    });

    it('should return 100% and null nextTier for Master', () => {
      const store = useClassMastery.getState();

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 7000,
        source: 'consensus',
        newTotal: 7000,
      });

      const progress = store.getProgressToNextTier('ranger');
      expect(progress.currentTier).toBe('Master');
      expect(progress.nextTier).toBeNull();
      expect(progress.percentage).toBe(100);
    });

    it('should return default values for unknown class', () => {
      const store = useClassMastery.getState();
      const progress = store.getProgressToNextTier('ranger');

      expect(progress.current).toBe(0);
      expect(progress.needed).toBe(1000);
      expect(progress.percentage).toBe(0);
      expect(progress.currentTier).toBe('Novice');
      expect(progress.nextTier).toBe('Expert');
    });
  });

  describe('Multiple classes tracked independently', () => {
    it('should track multiple classes independently', () => {
      const store = useClassMastery.getState();

      // Award XP to multiple classes
      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'ranger',
        amount: 500,
        source: 'vote',
        newTotal: 500,
      });

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'warrior',
        amount: 1500,
        source: 'consensus',
        newTotal: 1500,
      });

      store.handleXPAwarded({
        playerId: 'player-1',
        avatarClass: 'cleric',
        amount: 6000,
        source: 'consensus',
        newTotal: 6000,
      });

      const masteryData = useClassMastery.getState().masteryData;

      // Each class has independent XP and tier
      expect(masteryData['ranger'].classXP).toBe(500);
      expect(masteryData['ranger'].currentTier).toBe('Novice');

      expect(masteryData['warrior'].classXP).toBe(1500);
      expect(masteryData['warrior'].currentTier).toBe('Expert');

      expect(masteryData['cleric'].classXP).toBe(6000);
      expect(masteryData['cleric'].currentTier).toBe('Master');

      // Verify progress calculations are independent
      const rangerProgress = store.getProgressToNextTier('ranger');
      expect(rangerProgress.percentage).toBe(50);

      const warriorProgress = store.getProgressToNextTier('warrior');
      expect(warriorProgress.currentTier).toBe('Expert');
      expect(warriorProgress.nextTier).toBe('Master');

      const clericProgress = store.getProgressToNextTier('cleric');
      expect(clericProgress.currentTier).toBe('Master');
      expect(clericProgress.nextTier).toBeNull();
    });
  });
});
