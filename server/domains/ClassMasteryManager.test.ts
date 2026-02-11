/**
 * ClassMasteryManager Tests
 *
 * Tests for per-class XP tracking and mastery tier progression.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClassMasteryManager } from './ClassMasteryManager';
import { ScopedEventBus } from '../events';
import { ClassMasteryXPCurve } from '../../shared/classMasteryTypes';
import type { AvatarClass } from '../../shared/gameEvents';
import type {
  EstimationVoteCastPayload,
  CombatBossDamagedPayload,
  EstimationFullConsensusReachedPayload,
  CombatPlayerRevivedPayload,
} from '../events/eventTypes';

describe('ClassMasteryXPCurve', () => {
  const curve = new ClassMasteryXPCurve();

  describe('calculateTier', () => {
    it('returns Novice for 0 XP', () => {
      expect(curve.calculateTier(0)).toBe('Novice');
    });

    it('returns Novice for 999 XP', () => {
      expect(curve.calculateTier(999)).toBe('Novice');
    });

    it('returns Expert for 1000 XP', () => {
      expect(curve.calculateTier(1000)).toBe('Expert');
    });

    it('returns Expert for 4999 XP', () => {
      expect(curve.calculateTier(4999)).toBe('Expert');
    });

    it('returns Master for 5000 XP', () => {
      expect(curve.calculateTier(5000)).toBe('Master');
    });

    it('returns Master for 99999 XP', () => {
      expect(curve.calculateTier(99999)).toBe('Master');
    });
  });

  describe('getTierMultiplier', () => {
    it('returns 1.0 for Novice range', () => {
      expect(curve.getTierMultiplier(0)).toBe(1.0);
      expect(curve.getTierMultiplier(500)).toBe(1.0);
      expect(curve.getTierMultiplier(999)).toBe(1.0);
    });

    it('returns 1.1 for Expert range', () => {
      expect(curve.getTierMultiplier(1000)).toBe(1.1);
      expect(curve.getTierMultiplier(3000)).toBe(1.1);
      expect(curve.getTierMultiplier(4999)).toBe(1.1);
    });

    it('returns 1.2 for Master range', () => {
      expect(curve.getTierMultiplier(5000)).toBe(1.2);
      expect(curve.getTierMultiplier(10000)).toBe(1.2);
      expect(curve.getTierMultiplier(99999)).toBe(1.2);
    });
  });

  describe('getUnlockedAbilities', () => {
    it('returns empty array for Novice', () => {
      expect(curve.getUnlockedAbilities(0)).toEqual([]);
      expect(curve.getUnlockedAbilities(500)).toEqual([]);
      expect(curve.getUnlockedAbilities(999)).toEqual([]);
    });

    it('returns class_ability_1 for Expert', () => {
      expect(curve.getUnlockedAbilities(1000)).toEqual(['class_ability_1']);
      expect(curve.getUnlockedAbilities(3000)).toEqual(['class_ability_1']);
      expect(curve.getUnlockedAbilities(4999)).toEqual(['class_ability_1']);
    });

    it('returns both abilities for Master', () => {
      expect(curve.getUnlockedAbilities(5000)).toEqual(['class_ability_1', 'class_ability_2']);
      expect(curve.getUnlockedAbilities(10000)).toEqual(['class_ability_1', 'class_ability_2']);
    });
  });

  describe('getProgressToNextTier', () => {
    it('returns correct progress at 500 XP (50% to Expert)', () => {
      const progress = curve.getProgressToNextTier(500);
      expect(progress.current).toBe(500);
      expect(progress.needed).toBe(1000);
      expect(progress.percentage).toBe(50);
      expect(progress.currentTier).toBe('Novice');
      expect(progress.nextTier).toBe('Expert');
    });

    it('returns correct progress at 3000 XP (50% from Expert to Master)', () => {
      const progress = curve.getProgressToNextTier(3000);
      expect(progress.current).toBe(2000); // 3000 - 1000 (Expert start)
      expect(progress.needed).toBe(4000); // 5000 - 1000
      expect(progress.percentage).toBe(50);
      expect(progress.currentTier).toBe('Expert');
      expect(progress.nextTier).toBe('Master');
    });

    it('returns 100% with null nextTier at Master', () => {
      const progress = curve.getProgressToNextTier(5000);
      expect(progress.percentage).toBe(100);
      expect(progress.currentTier).toBe('Master');
      expect(progress.nextTier).toBe(null);
    });
  });
});

describe('ClassMasteryManager', () => {
  let eventBus: ScopedEventBus;
  let manager: ClassMasteryManager;
  let getPlayerClassMock: ReturnType<typeof vi.fn>;
  let getVotersMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    getPlayerClassMock = vi.fn();
    getVotersMock = vi.fn();

    manager = new ClassMasteryManager({
      eventBus: eventBus,
      getPlayerClass: getPlayerClassMock,
      getVoters: getVotersMock,
    });
  });

  describe('Constructor', () => {
    it('creates instance without errors', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('awardClassXP', () => {
    it('increases class XP for correct class only', () => {
      manager.awardClassXP('lobby1', 'player1', 'warrior', 100, 'vote');
      expect(manager.getClassXP('lobby1', 'player1', 'warrior')).toBe(100);
      expect(manager.getClassXP('lobby1', 'player1', 'wizard')).toBe(0);
    });

    it('emits class_mastery:xp_awarded event with correct payload', () => {
      const spy = vi.fn();
      eventBus.on('class_mastery:xp_awarded', spy);

      manager.awardClassXP('lobby1', 'player1', 'ranger', 50, 'consensus');

      expect(spy).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        playerId: 'player1',
        avatarClass: 'ranger',
        amount: 50,
        source: 'consensus',
        newTotal: 50,
      });
    });

    it('does NOT emit tier_up when XP stays in same tier', () => {
      const spy = vi.fn();
      eventBus.on('class_mastery:tier_up', spy);

      manager.awardClassXP('lobby1', 'player1', 'rogue', 100, 'vote');
      manager.awardClassXP('lobby1', 'player1', 'rogue', 100, 'vote');

      expect(spy).not.toHaveBeenCalled();
    });

    it('emits class_mastery:tier_up when XP crosses Expert threshold', () => {
      const spy = vi.fn();
      eventBus.on('class_mastery:tier_up', spy);

      manager.awardClassXP('lobby1', 'player1', 'bard', 900, 'vote');
      manager.awardClassXP('lobby1', 'player1', 'bard', 200, 'vote'); // 1100 total, crosses 1000

      expect(spy).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        playerId: 'player1',
        avatarClass: 'bard',
        oldTier: 'Novice',
        newTier: 'Expert',
      });
    });

    it('emits class_mastery:tier_up when XP crosses Master threshold', () => {
      const spy = vi.fn();
      eventBus.on('class_mastery:tier_up', spy);

      manager.initializeClassMastery('lobby1', 'player1', 'sorcerer', 4900);
      manager.awardClassXP('lobby1', 'player1', 'sorcerer', 200, 'vote'); // 5100 total, crosses 5000

      expect(spy).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        playerId: 'player1',
        avatarClass: 'sorcerer',
        oldTier: 'Expert',
        newTier: 'Master',
      });
    });
  });

  describe('getClassXP', () => {
    it('returns 0 for uninitialized player', () => {
      expect(manager.getClassXP('lobby1', 'player1', 'warrior')).toBe(0);
    });

    it('returns correct XP after awards to different classes', () => {
      manager.awardClassXP('lobby1', 'player1', 'warrior', 100, 'vote');
      manager.awardClassXP('lobby1', 'player1', 'wizard', 200, 'vote');
      manager.awardClassXP('lobby1', 'player1', 'warrior', 50, 'vote');

      expect(manager.getClassXP('lobby1', 'player1', 'warrior')).toBe(150);
      expect(manager.getClassXP('lobby1', 'player1', 'wizard')).toBe(200);
    });
  });

  describe('getMasteryTier', () => {
    it('returns Novice for new player', () => {
      expect(manager.getMasteryTier('lobby1', 'player1', 'paladin')).toBe('Novice');
    });

    it('returns Expert for 1000+ XP', () => {
      manager.awardClassXP('lobby1', 'player1', 'paladin', 1000, 'vote');
      expect(manager.getMasteryTier('lobby1', 'player1', 'paladin')).toBe('Expert');
    });

    it('returns Master for 5000+ XP', () => {
      manager.awardClassXP('lobby1', 'player1', 'paladin', 5000, 'vote');
      expect(manager.getMasteryTier('lobby1', 'player1', 'paladin')).toBe('Master');
    });
  });

  describe('getMasteryMultiplier', () => {
    it('returns 1.0 for Novice', () => {
      expect(manager.getMasteryMultiplier('lobby1', 'player1', 'cleric')).toBe(1.0);
    });

    it('returns 1.1 for Expert', () => {
      manager.awardClassXP('lobby1', 'player1', 'cleric', 1000, 'vote');
      expect(manager.getMasteryMultiplier('lobby1', 'player1', 'cleric')).toBe(1.1);
    });

    it('returns 1.2 for Master', () => {
      manager.awardClassXP('lobby1', 'player1', 'cleric', 5000, 'vote');
      expect(manager.getMasteryMultiplier('lobby1', 'player1', 'cleric')).toBe(1.2);
    });
  });

  describe('getUnlockedAbilities', () => {
    it('returns correct abilities based on class XP tier', () => {
      expect(manager.getUnlockedAbilities('lobby1', 'player1', 'oathbreaker')).toEqual([]);

      manager.awardClassXP('lobby1', 'player1', 'oathbreaker', 1000, 'vote');
      expect(manager.getUnlockedAbilities('lobby1', 'player1', 'oathbreaker')).toEqual(['class_ability_1']);

      manager.awardClassXP('lobby1', 'player1', 'oathbreaker', 4000, 'vote');
      expect(manager.getUnlockedAbilities('lobby1', 'player1', 'oathbreaker')).toEqual(['class_ability_1', 'class_ability_2']);
    });
  });

  describe('Event Handlers', () => {
    describe('handleVoteCast', () => {
      it('awards XP to player\'s CURRENT class', () => {
        getPlayerClassMock.mockReturnValue('monk');

        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'player1',
          vote: 5,
          team: 'developers',
        } as EstimationVoteCastPayload);

        expect(manager.getClassXP('lobby1', 'player1', 'monk')).toBe(10);
      });

      it('does not award XP if player class is unknown', () => {
        getPlayerClassMock.mockReturnValue(null);

        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'player1',
          vote: 5,
          team: 'developers',
        } as EstimationVoteCastPayload);

        // Should not error, just no-op
        expect(manager.getClassXP('lobby1', 'player1', 'monk')).toBe(0);
      });
    });

    describe('handleBossDamaged', () => {
      it('awards class XP proportional to damage', () => {
        getPlayerClassMock.mockReturnValue('warrior');

        eventBus.emit('combat:boss_damaged', {
          lobbyId: 'lobby1',
          playerId: 'player1',
          damage: 50,
          bossHealth: 1000,
        } as CombatBossDamagedPayload);

        // 50 damage * 2 XP per damage = 100 XP
        expect(manager.getClassXP('lobby1', 'player1', 'warrior')).toBe(100);
      });
    });

    describe('handleConsensus', () => {
      it('awards class XP to all voters', () => {
        getVotersMock.mockReturnValue(['player1', 'player2']);
        getPlayerClassMock.mockImplementation((lobbyId: string, playerId: string) => {
          if (playerId === 'player1') return 'ranger';
          if (playerId === 'player2') return 'rogue';
          return null;
        });

        eventBus.emit('estimation:full_consensus_reached', {
          lobbyId: 'lobby1',
          ticketId: 'ticket1',
        } as EstimationFullConsensusReachedPayload);

        expect(manager.getClassXP('lobby1', 'player1', 'ranger')).toBe(50);
        expect(manager.getClassXP('lobby1', 'player2', 'rogue')).toBe(50);
      });
    });

    describe('handleRevival', () => {
      it('awards class XP to reviver', () => {
        getPlayerClassMock.mockReturnValue('cleric');

        eventBus.emit('combat:player_revived', {
          lobbyId: 'lobby1',
          playerId: 'player2',
          reviverId: 'player1',
        } as CombatPlayerRevivedPayload);

        expect(manager.getClassXP('lobby1', 'player1', 'cleric')).toBe(30);
      });
    });
  });

  describe('cleanupLobby', () => {
    it('removes all class XP data for lobby', () => {
      manager.awardClassXP('lobby1', 'player1', 'warrior', 100, 'vote');
      manager.awardClassXP('lobby1', 'player2', 'wizard', 200, 'vote');
      manager.awardClassXP('lobby2', 'player3', 'rogue', 300, 'vote');

      manager.cleanupLobby('lobby1');

      expect(manager.getClassXP('lobby1', 'player1', 'warrior')).toBe(0);
      expect(manager.getClassXP('lobby1', 'player2', 'wizard')).toBe(0);
      expect(manager.getClassXP('lobby2', 'player3', 'rogue')).toBe(300);
    });
  });

  describe('initializeClassMastery', () => {
    it('sets initial XP without emitting events', () => {
      const xpSpy = vi.fn();
      const tierSpy = vi.fn();
      eventBus.on('class_mastery:xp_awarded', xpSpy);
      eventBus.on('class_mastery:tier_up', tierSpy);

      manager.initializeClassMastery('lobby1', 'player1', 'paladin', 2000);

      expect(manager.getClassXP('lobby1', 'player1', 'paladin')).toBe(2000);
      expect(xpSpy).not.toHaveBeenCalled();
      expect(tierSpy).not.toHaveBeenCalled();
    });
  });

  describe('loadAllClassMastery', () => {
    it('loads stored data for all classes', async () => {
      const mockStorage = {
        getAllClassMastery: vi.fn().mockResolvedValue([
          { avatarClass: 'warrior', classXP: 1500, currentTier: 'Expert' },
          { avatarClass: 'wizard', classXP: 6000, currentTier: 'Master' },
        ]),
      };

      const managerWithStorage = new ClassMasteryManager({
        eventBus: eventBus,
        getPlayerClass: getPlayerClassMock,
        getVoters: getVotersMock,
        storage: mockStorage as any,
        getUserId: () => 1,
      });

      await managerWithStorage.loadAllClassMastery('lobby1', 'player1', 1);

      expect(managerWithStorage.getClassXP('lobby1', 'player1', 'warrior')).toBe(1500);
      expect(managerWithStorage.getClassXP('lobby1', 'player1', 'wizard')).toBe(6000);
      expect(mockStorage.getAllClassMastery).toHaveBeenCalledWith(1);
    });

    it('handles missing storage gracefully', async () => {
      await manager.loadAllClassMastery('lobby1', 'player1', 1);
      // Should not error
      expect(manager.getClassXP('lobby1', 'player1', 'warrior')).toBe(0);
    });
  });
});
