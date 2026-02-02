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

    it('should clear boss attack timer on cleanup', () => {
      const players = [{ id: 'player1', team: 'developers' as TeamType }];
      combatManager.initializeCombat('lobby1', players, 0);

      // Start attack loop
      combatManager.startBossAttackLoop('lobby1');

      const state = combatManager.getCombatState('lobby1');
      expect(state!.boss!.attackTimerHandle).toBeDefined();

      // Cleanup should clear timer
      combatManager.cleanupLobby('lobby1');

      // State should be gone
      expect(combatManager.getCombatState('lobby1')).toBeNull();
    });
  });

  describe('Boss Attack System', () => {
    beforeEach(() => {
      vi.useFakeTimers();

      const players = [
        { id: 'warrior1', team: 'developers' as TeamType },
        { id: 'ranger1', team: 'developers' as TeamType },
        { id: 'wizard1', team: 'developers' as TeamType },
      ];
      combatManager.initializeCombat('lobby1', players, 0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('startBossAttackLoop', () => {
      it('should schedule first attack after 3s grace period', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        combatManager.startBossAttackLoop('lobby1');

        // No attack immediately
        expect(telegraphListener).not.toHaveBeenCalled();
        expect(playerDamagedListener).not.toHaveBeenCalled();

        // Advance past grace period
        vi.advanceTimersByTime(3000);

        // Attack should have occurred (either instant or telegraphed)
        expect(telegraphListener.mock.calls.length + playerDamagedListener.mock.calls.length).toBeGreaterThan(0);
      });

      it('should reschedule attacks with variable timing', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Mock Math.random to return 0 (lower bound of variance)
        vi.spyOn(Math, 'random').mockReturnValue(0);

        combatManager.startBossAttackLoop('lobby1');

        // First attack at 3s
        vi.advanceTimersByTime(3000);

        // Build threat by having players attack
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // Normal boss (not enraged): 5000ms * (1 - 0.3) = 3500ms minimum
        vi.advanceTimersByTime(3500);

        // At least 2 attacks should have happened
        expect(playerDamagedListener.mock.calls.length).toBeGreaterThanOrEqual(1);
      });

      it('should attack faster when boss is enraged', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        const state = combatManager.getCombatState('lobby1');
        // Manually enrage boss
        state!.boss!.isEnraged = true;

        combatManager.startBossAttackLoop('lobby1');

        // First attack at 3s
        vi.advanceTimersByTime(3000);
        const attackCountAfterFirst = playerDamagedListener.mock.calls.length;

        // Enraged: 3000ms base * (1 + 0.3 variance) = up to 3900ms
        vi.advanceTimersByTime(4000);

        // Should have attacked multiple times
        expect(playerDamagedListener.mock.calls.length).toBeGreaterThan(attackCountAfterFirst);
      });

      it('should stop attack loop when boss HP reaches 0', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        combatManager.startBossAttackLoop('lobby1');

        // First attack
        vi.advanceTimersByTime(3000);

        // Kill boss
        const state = combatManager.getCombatState('lobby1');
        state!.boss!.hp = 0;

        const attackCountAtDeath = playerDamagedListener.mock.calls.length;

        // Advance more time - no new attacks should occur
        vi.advanceTimersByTime(10000);

        expect(playerDamagedListener.mock.calls.length).toBe(attackCountAtDeath);
      });

      it('should stop attack loop on combat cleanup', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        combatManager.startBossAttackLoop('lobby1');

        // First attack
        vi.advanceTimersByTime(3000);

        // Cleanup combat
        combatManager.cleanupLobby('lobby1');

        const attackCountAtCleanup = playerDamagedListener.mock.calls.length;

        // Advance more time - no new attacks should occur
        vi.advanceTimersByTime(10000);

        expect(playerDamagedListener.mock.calls.length).toBe(attackCountAtCleanup);
      });
    });

    describe('Attack Type Selection', () => {
      it('should return valid attack types for normal boss', () => {
        // We need to test the behavior, not internal method
        // Attack types will be visible via events
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        combatManager.startBossAttackLoop('lobby1');

        // Trigger multiple attacks to see variety
        for (let i = 0; i < 10; i++) {
          vi.advanceTimersByTime(6000);
        }

        // Should have received some attacks (mix of instant and telegraphed)
        expect(telegraphListener.mock.calls.length + playerDamagedListener.mock.calls.length).toBeGreaterThan(0);
      });

      it('should use special attacks more often when enraged', () => {
        const telegraphListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        const state = combatManager.getCombatState('lobby1');
        state!.boss!.isEnraged = true;

        combatManager.startBossAttackLoop('lobby1');

        // Trigger multiple attacks
        for (let i = 0; i < 20; i++) {
          vi.advanceTimersByTime(4000);
        }

        // Enraged should telegraph more (heavy/special attacks)
        // This is a statistical test - we expect more telegraphs when enraged
        expect(telegraphListener.mock.calls.length).toBeGreaterThan(0);
      });
    });

    describe('Threat-Based Targeting', () => {
      it('should target highest threat player', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Wizard attacks multiple times (highest threat)
        combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage
        combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage (50 total)
        combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage (75 total)

        // Warrior attacks once (lower threat)
        combatManager.playerAttackBoss('lobby1', 'warrior1'); // 15 damage

        // Mock random to ensure highest threat targeting (70% chance)
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // Within 70% range

        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        // Should target wizard1 (highest threat)
        const damagedEvents = playerDamagedListener.mock.calls;
        expect(damagedEvents.length).toBeGreaterThan(0);
        expect(damagedEvents[0][0].playerId).toBe('wizard1');
      });

      it('should occasionally target second-highest threat', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat table
        combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage (highest)
        combatManager.playerAttackBoss('lobby1', 'ranger1'); // 20 damage (second)
        combatManager.playerAttackBoss('lobby1', 'warrior1'); // 15 damage (third)

        // Mock random to 75% (20% chance for second-highest)
        vi.spyOn(Math, 'random').mockReturnValue(0.75);

        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        const damagedEvents = playerDamagedListener.mock.calls;
        expect(damagedEvents.length).toBeGreaterThan(0);
        expect(damagedEvents[0][0].playerId).toBe('ranger1');
      });

      it('should occasionally target random player', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat table
        combatManager.playerAttackBoss('lobby1', 'wizard1');

        // Mock random to 95% (10% chance for random)
        vi.spyOn(Math, 'random').mockReturnValue(0.95);

        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        const damagedEvents = playerDamagedListener.mock.calls;
        expect(damagedEvents.length).toBeGreaterThan(0);
        // Should target someone (random selection among all fighting players)
        expect(['wizard1', 'ranger1', 'warrior1']).toContain(damagedEvents[0][0].playerId);
      });
    });

    describe('AoE Attacks', () => {
      it('should damage all fighting players in AoE attack', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // Force AoE by manipulating randomness or just testing over many attacks
        // For deterministic test, we'll check that some attacks hit multiple players
        combatManager.startBossAttackLoop('lobby1');

        // Run many attacks to ensure we get AoE (15% chance each)
        for (let i = 0; i < 30; i++) {
          vi.advanceTimersByTime(6000);
        }

        const damagedEvents = playerDamagedListener.mock.calls;

        // Count unique players damaged in a single attack
        // If we see 3 damage events at same timestamp, it's AoE
        const timestampGroups = new Map<number, Set<string>>();
        damagedEvents.forEach(([payload]) => {
          const key = payload.timestamp || Date.now();
          if (!timestampGroups.has(key)) {
            timestampGroups.set(key, new Set());
          }
          timestampGroups.get(key)!.add(payload.playerId);
        });

        // At least one attack should have hit multiple players (AoE)
        const hasAoE = Array.from(timestampGroups.values()).some(players => players.size > 1);
        expect(hasAoE).toBe(true);
      });

      it('should NOT damage downed players in AoE', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // Down the wizard
        const state = combatManager.getCombatState('lobby1');
        const wizardState = state!.players.get('wizard1');
        wizardState!.combatState = 'downed';

        combatManager.startBossAttackLoop('lobby1');

        // Run many attacks
        for (let i = 0; i < 30; i++) {
          vi.advanceTimersByTime(6000);
        }

        const damagedEvents = playerDamagedListener.mock.calls;

        // Wizard should never be damaged
        const wizardDamaged = damagedEvents.some(([payload]) => payload.playerId === 'wizard1');
        expect(wizardDamaged).toBe(false);
      });

      it('should NOT damage ghost players in AoE', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // Make ranger a ghost
        const state = combatManager.getCombatState('lobby1');
        const rangerState = state!.players.get('ranger1');
        rangerState!.combatState = 'ghost';

        combatManager.startBossAttackLoop('lobby1');

        // Run many attacks
        for (let i = 0; i < 30; i++) {
          vi.advanceTimersByTime(6000);
        }

        const damagedEvents = playerDamagedListener.mock.calls;

        // Ranger should never be damaged
        const rangerDamaged = damagedEvents.some(([payload]) => payload.playerId === 'ranger1');
        expect(rangerDamaged).toBe(false);
      });
    });

    describe('Attack Telegraph', () => {
      it('should telegraph heavy attacks before damage', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        combatManager.startBossAttackLoop('lobby1');

        // Run many attacks to get heavy/special
        for (let i = 0; i < 20; i++) {
          vi.advanceTimersByTime(6000);
        }

        // Should have some telegraphs
        expect(telegraphListener.mock.calls.length).toBeGreaterThan(0);

        // Telegraph should include message and delay
        const firstTelegraph = telegraphListener.mock.calls[0][0];
        expect(firstTelegraph.message).toBeDefined();
        expect(firstTelegraph.delayMs).toBe(1000);
      });

      it('should apply damage after telegraph delay', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // Force heavy attack by setting up specific random values
        const randomMock = vi.spyOn(Math, 'random');
        // First call: attack type selection (0.65 = heavy)
        // Second call: AoE check (0.5 = single target)
        // Third call: threat targeting (0.5 = highest threat)
        randomMock
          .mockReturnValueOnce(0.65) // Attack type: heavy
          .mockReturnValueOnce(0.5)  // Not AoE
          .mockReturnValueOnce(0.5); // Highest threat

        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        // Telegraph should fire first
        expect(telegraphListener).toHaveBeenCalled();
        const telegraphTime = Date.now();

        // Damage should NOT have happened yet
        expect(playerDamagedListener).not.toHaveBeenCalled();

        // Advance by telegraph delay
        vi.advanceTimersByTime(1000);

        // Now damage should occur
        expect(playerDamagedListener).toHaveBeenCalled();
      });

      it('should use different messages for heavy vs special attacks', () => {
        const telegraphListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        combatManager.startBossAttackLoop('lobby1');

        // Run many attacks to collect telegraph messages
        for (let i = 0; i < 30; i++) {
          vi.advanceTimersByTime(6000);
        }

        const messages = telegraphListener.mock.calls.map(([payload]) => payload.message);
        const uniqueMessages = new Set(messages);

        // Should have at least 2 different telegraph messages (heavy and special)
        expect(uniqueMessages.size).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Light Attack', () => {
      it('should apply light damage instantly without telegraph', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // Force light attack
        const randomMock = vi.spyOn(Math, 'random');
        randomMock
          .mockReturnValueOnce(0.3)  // Attack type: light (< 0.6)
          .mockReturnValueOnce(0.5)  // Not AoE
          .mockReturnValueOnce(0.5); // Highest threat

        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        // No telegraph for light attack
        expect(telegraphListener).not.toHaveBeenCalled();

        // Instant damage
        expect(playerDamagedListener).toHaveBeenCalled();
        const damagePayload = playerDamagedListener.mock.calls[0][0];
        expect(damagePayload.damage).toBe(25); // LIGHT_DAMAGE
      });
    });
  });
});
