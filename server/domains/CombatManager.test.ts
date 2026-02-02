import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CombatManager } from './CombatManager';
import { ScopedEventBus } from '../events';
import { TeamType, AvatarClass } from '../../shared/gameEvents';
import {
  CombatNotActiveError,
  PlayerNotInCombatError,
} from '../errors/CombatErrors';

describe('CombatManager', () => {
  let eventBus: ScopedEventBus;
  let combatManager: CombatManager;
  let getPlayerTeam: (lobbyId: string, playerId: string) => TeamType | null;
  let getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;

  beforeEach(() => {
    eventBus = new ScopedEventBus();

    // Mock team lookup function
    getPlayerTeam = vi.fn((lobbyId: string, playerId: string) => {
      if (playerId.startsWith('qa')) return 'qa';
      if (playerId.startsWith('spectator')) return 'spectators';
      return 'developers';
    });

    // Mock class lookup function
    getPlayerClass = vi.fn((lobbyId: string, playerId: string) => {
      // Default classes for testing
      if (playerId === 'warrior1') return 'warrior';
      if (playerId === 'ranger1') return 'ranger';
      if (playerId === 'wizard1') return 'wizard';
      if (playerId === 'cleric1') return 'cleric';
      if (playerId === 'paladin1') return 'paladin';
      return 'ranger'; // Default to ranger
    });

    combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });
  });

  describe('instantiation', () => {
    it('should instantiate with ScopedEventBus dependency', () => {
      expect(combatManager).toBeInstanceOf(CombatManager);
    });

    it('should return null for non-existent combat state', () => {
      const result = combatManager.getCombatState('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('initializeCombat', () => {
    it('should initialize combat state with proper boss HP for 3 players', () => {
      const players = [
        { id: 'player1', team: 'developers' as TeamType },
        { id: 'player2', team: 'developers' as TeamType },
        { id: 'qa1', team: 'qa' as TeamType },
      ];

      combatManager.initializeCombat('lobby1', players, 0);
      const state = combatManager.getCombatState('lobby1');

      expect(state).not.toBeNull();
      expect(state!.lobbyId).toBe('lobby1');
      expect(state!.boss).toBeDefined();
      expect(state!.boss!.maxHp).toBe(3000); // 3 players * 1000 BASE_HP_PER_PLAYER
      expect(state!.boss!.hp).toBe(3000);
      expect(state!.boss!.isEnraged).toBe(false);
    });

    it('should scale boss HP with ticketIndex for dungeon crawl difficulty', () => {
      const players = [
        { id: 'player1', team: 'developers' as TeamType },
        { id: 'player2', team: 'developers' as TeamType },
      ];

      // ticketIndex=4 should multiply by (1 + 4 * 0.2) = 1.8
      combatManager.initializeCombat('lobby1', players, 4);
      const state = combatManager.getCombatState('lobby1');

      expect(state!.boss!.maxHp).toBe(3600); // 2 players * 1000 * 1.8
      expect(state!.boss!.hp).toBe(3600);
    });

    it('should filter out spectators from player count for boss HP', () => {
      const players = [
        { id: 'player1', team: 'developers' as TeamType },
        { id: 'player2', team: 'developers' as TeamType },
        { id: 'spectator1', team: 'spectators' as TeamType },
        { id: 'spectator2', team: 'spectators' as TeamType },
      ];

      combatManager.initializeCombat('lobby1', players, 0);
      const state = combatManager.getCombatState('lobby1');

      // Only 2 non-spectator players
      expect(state!.boss!.maxHp).toBe(2000);
    });

    it('should initialize player combat states with maxHp=100', () => {
      const players = [
        { id: 'player1', team: 'developers' as TeamType },
        { id: 'player2', team: 'qa' as TeamType },
      ];

      combatManager.initializeCombat('lobby1', players, 0);
      const state = combatManager.getCombatState('lobby1');

      expect(state!.players.size).toBe(2);

      const player1State = state!.players.get('player1');
      expect(player1State).toBeDefined();
      expect(player1State!.hp).toBe(100);
      expect(player1State!.maxHp).toBe(100);
      expect(player1State!.combatState).toBe('fighting');
      expect(player1State!.hasBeenRevived).toBe(false);
    });

    it('should not include spectators in player combat states', () => {
      const players = [
        { id: 'player1', team: 'developers' as TeamType },
        { id: 'spectator1', team: 'spectators' as TeamType },
      ];

      combatManager.initializeCombat('lobby1', players, 0);
      const state = combatManager.getCombatState('lobby1');

      expect(state!.players.size).toBe(1);
      expect(state!.players.has('player1')).toBe(true);
      expect(state!.players.has('spectator1')).toBe(false);
    });

    it('should emit combat:battle_initialized event', () => {
      const battleInitListener = vi.fn();
      eventBus.on('combat:battle_initialized', battleInitListener);

      const players = [
        { id: 'player1', team: 'developers' as TeamType },
        { id: 'player2', team: 'developers' as TeamType },
      ];

      combatManager.initializeCombat('lobby1', players, 0);

      expect(battleInitListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        bossId: expect.any(String),
        bossMaxHp: 2000,
      });
    });

    it('should set battleModifier to 1.0 initially', () => {
      const players = [{ id: 'player1', team: 'developers' as TeamType }];

      combatManager.initializeCombat('lobby1', players, 0);
      const state = combatManager.getCombatState('lobby1');

      expect(state!.battleModifier).toBe(1.0);
    });

    it('should store ticketIndex in combat state', () => {
      const players = [{ id: 'player1', team: 'developers' as TeamType }];

      combatManager.initializeCombat('lobby1', players, 5);
      const state = combatManager.getCombatState('lobby1');

      expect(state!.ticketIndex).toBe(5);
    });
  });

  describe('playerAttackBoss', () => {
    beforeEach(() => {
      const players = [
        { id: 'warrior1', team: 'developers' as TeamType },
        { id: 'ranger1', team: 'developers' as TeamType },
        { id: 'wizard1', team: 'developers' as TeamType },
        { id: 'cleric1', team: 'qa' as TeamType },
      ];
      combatManager.initializeCombat('lobby1', players, 0);
    });

    it('should reduce boss HP by class base damage for warrior', () => {
      const stateBefore = combatManager.getCombatState('lobby1');
      const bossHpBefore = stateBefore!.boss!.hp;

      const damage = combatManager.playerAttackBoss('lobby1', 'warrior1');

      expect(damage).toBe(15); // Warrior base damage

      const stateAfter = combatManager.getCombatState('lobby1');
      expect(stateAfter!.boss!.hp).toBe(bossHpBefore - 15);
    });

    it('should reduce boss HP by class base damage for ranger', () => {
      const stateBefore = combatManager.getCombatState('lobby1');
      const bossHpBefore = stateBefore!.boss!.hp;

      const damage = combatManager.playerAttackBoss('lobby1', 'ranger1');

      expect(damage).toBe(20); // Ranger base damage

      const stateAfter = combatManager.getCombatState('lobby1');
      expect(stateAfter!.boss!.hp).toBe(bossHpBefore - 20);
    });

    it('should reduce boss HP by class base damage for wizard', () => {
      const stateBefore = combatManager.getCombatState('lobby1');
      const bossHpBefore = stateBefore!.boss!.hp;

      const damage = combatManager.playerAttackBoss('lobby1', 'wizard1');

      expect(damage).toBe(25); // Wizard base damage

      const stateAfter = combatManager.getCombatState('lobby1');
      expect(stateAfter!.boss!.hp).toBe(bossHpBefore - 25);
    });

    it('should reduce boss HP by class base damage for cleric', () => {
      const stateBefore = combatManager.getCombatState('lobby1');
      const bossHpBefore = stateBefore!.boss!.hp;

      const damage = combatManager.playerAttackBoss('lobby1', 'cleric1');

      expect(damage).toBe(12); // Cleric base damage

      const stateAfter = combatManager.getCombatState('lobby1');
      expect(stateAfter!.boss!.hp).toBe(bossHpBefore - 12);
    });

    it('should multiply damage by battleModifier', () => {
      const state = combatManager.getCombatState('lobby1');
      // Manually set battleModifier to 1.5 for testing
      state!.battleModifier = 1.5;

      const damage = combatManager.playerAttackBoss('lobby1', 'ranger1');

      expect(damage).toBe(30); // 20 base * 1.5 modifier
    });

    it('should update threat table with cumulative damage', () => {
      combatManager.playerAttackBoss('lobby1', 'ranger1');
      combatManager.playerAttackBoss('lobby1', 'ranger1');
      combatManager.playerAttackBoss('lobby1', 'wizard1');

      const state = combatManager.getCombatState('lobby1');
      const threatTable = state!.boss!.threatTable;

      expect(threatTable.get('ranger1')?.threat).toBe(40); // 20 + 20
      expect(threatTable.get('wizard1')?.threat).toBe(25); // 25
    });

    it('should emit combat:boss_damaged event', () => {
      const bossDamagedListener = vi.fn();
      eventBus.on('combat:boss_damaged', bossDamagedListener);

      combatManager.playerAttackBoss('lobby1', 'ranger1');

      const state = combatManager.getCombatState('lobby1');

      expect(bossDamagedListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        playerId: 'ranger1',
        damage: 20,
        bossHealth: state!.boss!.hp,
      });
    });

    it('should throw CombatNotActiveError when no combat active', () => {
      expect(() => {
        combatManager.playerAttackBoss('nonexistent', 'player1');
      }).toThrow(CombatNotActiveError);
    });

    it('should throw PlayerNotInCombatError when player is downed', () => {
      const state = combatManager.getCombatState('lobby1');
      const playerState = state!.players.get('warrior1');
      playerState!.combatState = 'downed';

      expect(() => {
        combatManager.playerAttackBoss('lobby1', 'warrior1');
      }).toThrow(PlayerNotInCombatError);
    });

    it('should throw PlayerNotInCombatError when player is ghost', () => {
      const state = combatManager.getCombatState('lobby1');
      const playerState = state!.players.get('warrior1');
      playerState!.combatState = 'ghost';

      expect(() => {
        combatManager.playerAttackBoss('lobby1', 'warrior1');
      }).toThrow(PlayerNotInCombatError);
    });

    it('should trigger boss enrage when HP drops to 50% or below', () => {
      const enrageListener = vi.fn();
      eventBus.on('combat:boss_enraged', enrageListener);

      const state = combatManager.getCombatState('lobby1');
      // Set boss HP just above 50%
      state!.boss!.hp = 2100; // 51% of 4000
      state!.boss!.maxHp = 4000;

      // Attack to bring below 50%
      combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage -> 2075 (51.875% still above)

      expect(enrageListener).not.toHaveBeenCalled();
      expect(state!.boss!.isEnraged).toBe(false);

      // Attack again to bring below 50%
      state!.boss!.hp = 2010; // Just above 50%
      combatManager.playerAttackBoss('lobby1', 'wizard1'); // -> 1985 (49.625% below 50%)

      expect(enrageListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        message: expect.stringContaining('enraged'),
      });
      expect(state!.boss!.isEnraged).toBe(true);
    });

    it('should only enrage once, not on subsequent attacks below 50%', () => {
      const enrageListener = vi.fn();
      eventBus.on('combat:boss_enraged', enrageListener);

      const state = combatManager.getCombatState('lobby1');
      state!.boss!.hp = 2000; // 50% of 4000
      state!.boss!.maxHp = 4000;

      // First attack below 50%
      combatManager.playerAttackBoss('lobby1', 'ranger1');
      expect(enrageListener).toHaveBeenCalledTimes(1);

      // Second attack - should not trigger again
      combatManager.playerAttackBoss('lobby1', 'ranger1');
      expect(enrageListener).toHaveBeenCalledTimes(1);
    });

    it('should emit combat:boss_defeated when HP reaches 0', () => {
      const defeatedListener = vi.fn();
      eventBus.on('combat:boss_defeated', defeatedListener);

      const state = combatManager.getCombatState('lobby1');
      state!.boss!.hp = 15; // Just enough for warrior to kill

      combatManager.playerAttackBoss('lobby1', 'warrior1'); // 15 damage -> 0 HP

      expect(defeatedListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        bossId: state!.boss!.bossId,
      });
    });

    it('should not reduce boss HP below 0', () => {
      const state = combatManager.getCombatState('lobby1');
      state!.boss!.hp = 5;

      combatManager.playerAttackBoss('lobby1', 'ranger1'); // 20 damage on 5 HP

      expect(state!.boss!.hp).toBe(0); // Should stop at 0, not go negative
    });
  });

  describe('cleanupLobby', () => {
    it('should remove combat state for a lobby', () => {
      const players = [{ id: 'player1', team: 'developers' as TeamType }];
      combatManager.initializeCombat('lobby1', players, 0);
      expect(combatManager.getCombatState('lobby1')).not.toBeNull();

      combatManager.cleanupLobby('lobby1');
      expect(combatManager.getCombatState('lobby1')).toBeNull();
    });

    it('should handle cleanup of non-existent lobby gracefully', () => {
      // Should not throw
      combatManager.cleanupLobby('nonexistent');
    });
  });
});
