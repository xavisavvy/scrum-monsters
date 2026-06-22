import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CombatManager } from './CombatManager';
import { ScopedEventBus } from '../events';
import { TeamType, AvatarClass } from '../../shared/gameEvents';
import {
  CombatNotActiveError,
  PlayerNotInCombatError,
  NotHealerClassError,
  RevivalNotAllowedError,
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
      expect(result).toBeUndefined();
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

      expect(state).not.toBeUndefined();
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

    it('should trigger boss phase transition and enrage when HP drops to 66% (Phase 2)', () => {
      const enrageListener = vi.fn();
      const phaseTransitionListener = vi.fn();
      eventBus.on('combat:boss_enraged', enrageListener);
      eventBus.on('combat:boss_phase_transition', phaseTransitionListener);

      const state = combatManager.getCombatState('lobby1');
      // Set boss HP just above 66% (phase 2 threshold)
      state!.boss!.hp = 2700; // 67.5% of 4000
      state!.boss!.maxHp = 4000;

      // Attack to stay above 66%
      combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage -> 2675 (66.875% still phase 1)

      expect(enrageListener).not.toHaveBeenCalled();
      expect(phaseTransitionListener).not.toHaveBeenCalled();
      expect(state!.boss!.isEnraged).toBe(false);
      expect(state!.boss!.currentPhase).toBe(1);

      // Attack again to cross 66% threshold
      state!.boss!.hp = 2650; // Just above 66%
      combatManager.playerAttackBoss('lobby1', 'wizard1'); // -> 2625 (65.625% below 66%)

      // Should emit phase transition to phase 2
      expect(phaseTransitionListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        newPhase: 2,
        previousPhase: 1,
        message: expect.any(String),
        bossType: 'bug-hydra',
      });

      // Should also emit enraged for backward compat
      expect(enrageListener).toHaveBeenCalled();
      expect(state!.boss!.isEnraged).toBe(true);
      expect(state!.boss!.currentPhase).toBe(2);
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
      expect(combatManager.getCombatState('lobby1')).not.toBeUndefined();

      combatManager.cleanupLobby('lobby1');
      expect(combatManager.getCombatState('lobby1')).toBeUndefined();
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
      expect(combatManager.getCombatState('lobby1')).toBeUndefined();
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

      it('should use different patterns in phase 2 and phase 3', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Move boss to phase 2 (enraged)
        const state = combatManager.getCombatState('lobby1');
        state!.boss!.hp = Math.floor(state!.boss!.maxHp * 0.5); // Phase 2
        state!.boss!.currentPhase = 2;
        state!.boss!.isEnraged = true;

        combatManager.startBossAttackLoop('lobby1');

        // Run many attack cycles in phase 2
        for (let i = 0; i < 50; i++) {
          vi.advanceTimersByTime(6000);
        }

        // Phase 2 should have attacks (potentially more telegraphed ones)
        expect(playerDamagedListener.mock.calls.length).toBeGreaterThan(0);
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

      it('should use BossAI pattern-based targeting (threat/random/multi)', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat table
        combatManager.playerAttackBoss('lobby1', 'wizard1'); // 25 damage (highest)
        combatManager.playerAttackBoss('lobby1', 'ranger1'); // 20 damage (second)
        combatManager.playerAttackBoss('lobby1', 'warrior1'); // 15 damage (third)

        // BossAI patterns use different targeting modes
        combatManager.startBossAttackLoop('lobby1');

        // Run multiple attack cycles to get variety
        for (let i = 0; i < 10; i++) {
          vi.advanceTimersByTime(6000);
        }

        const damagedEvents = playerDamagedListener.mock.calls;
        expect(damagedEvents.length).toBeGreaterThan(0);

        // All attacked players should be valid fighting players
        const damagedPlayerIds = damagedEvents.map(([payload]) => payload.playerId);
        damagedPlayerIds.forEach(playerId => {
          expect(['wizard1', 'ranger1', 'warrior1']).toContain(playerId);
        });
      });

      it('should occasionally target random player', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat table
        combatManager.playerAttackBoss('lobby1', 'wizard1');

        // Mock random to 95% (10% chance for random)
        const randomMock = vi.spyOn(Math, 'random');
        randomMock
          .mockReturnValueOnce(0.3)  // Attack type: light
          .mockReturnValueOnce(0.5)  // Not AoE
          .mockReturnValueOnce(0.95) // Random player (> 0.9)
          .mockReturnValue(0.5);     // Random selection within players

        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        const damagedEvents = playerDamagedListener.mock.calls;
        expect(damagedEvents.length).toBeGreaterThan(0);
        // Should target someone (random selection among all fighting players)
        expect(['wizard1', 'ranger1', 'warrior1']).toContain(damagedEvents[0][0].playerId);
      });
    });

    describe('AoE Attacks', () => {
      it('should damage fighting players when boss attacks (BossAI patterns)', () => {
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // BossAI will select patterns based on boss behavior
        // Run boss attack loop and let BossAI select patterns
        combatManager.startBossAttackLoop('lobby1');
        vi.advanceTimersByTime(3000);

        const damagedEvents = playerDamagedListener.mock.calls;

        // Boss should have attacked at least one player
        // (BossAI may select single-target or multi-target patterns)
        expect(damagedEvents.length).toBeGreaterThanOrEqual(1);

        const damagedPlayerIds = damagedEvents.map(([payload]) => payload.playerId);
        // All damaged players should be fighting players
        damagedPlayerIds.forEach(playerId => {
          expect(['warrior1', 'ranger1', 'wizard1']).toContain(playerId);
        });
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
      it('should use BossAI patterns for attacks', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        // BossAI will select patterns - run multiple attack cycles
        combatManager.startBossAttackLoop('lobby1');

        // Run several attack cycles to ensure at least one attack happens
        for (let i = 0; i < 5; i++) {
          vi.advanceTimersByTime(6000);
        }

        // Boss should have attacked (either with or without telegraph depending on pattern)
        const attacked = playerDamagedListener.mock.calls.length > 0;
        expect(attacked).toBe(true);

        // If there was a telegraph, it should have proper structure
        if (telegraphListener.mock.calls.length > 0) {
          const firstTelegraph = telegraphListener.mock.calls[0][0];
          expect(firstTelegraph.message).toBeDefined();
          expect(firstTelegraph.delayMs).toBeGreaterThan(0);
          expect(firstTelegraph.bossType).toBe('bug-hydra');
        }
      });

      it('should apply damage after telegraph delay when pattern has telegraph', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Damage boss to trigger phase 2 for more telegraphed patterns
        const state = combatManager.getCombatState('lobby1');
        state!.boss!.hp = Math.floor(state!.boss!.maxHp * 0.5); // Phase 2

        combatManager.startBossAttackLoop('lobby1');

        // Run enough cycles to get a telegraphed attack (Phase 2 has more telegraphs)
        let telegraphedAttack = false;
        for (let i = 0; i < 30; i++) {
          const damageCountBefore = playerDamagedListener.mock.calls.length;
          const telegraphCountBefore = telegraphListener.mock.calls.length;

          vi.advanceTimersByTime(3000);

          if (telegraphListener.mock.calls.length > telegraphCountBefore) {
            // Telegraph happened
            const damageCountAfter = playerDamagedListener.mock.calls.length;

            // Damage should NOT happen immediately
            expect(damageCountAfter).toBe(damageCountBefore);

            // Get the delay from telegraph
            const telegraph = telegraphListener.mock.calls[telegraphCountBefore][0];
            vi.advanceTimersByTime(telegraph.delayMs + 100);

            // Now damage should have occurred
            expect(playerDamagedListener.mock.calls.length).toBeGreaterThan(damageCountAfter);
            telegraphedAttack = true;
            break;
          }
        }

        // Should have found at least one telegraphed attack in 30 cycles at phase 2
        expect(telegraphedAttack).toBe(true);
      });

      it('should use boss-specific telegraph messages from patterns', () => {
        const telegraphListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);

        // Damage boss to phase 2 for more telegraphed patterns
        const state = combatManager.getCombatState('lobby1');
        state!.boss!.hp = Math.floor(state!.boss!.maxHp * 0.5); // Phase 2

        combatManager.startBossAttackLoop('lobby1');

        // Run many attack cycles to collect telegraph messages
        for (let i = 0; i < 50; i++) {
          vi.advanceTimersByTime(6000);
        }

        const messages = telegraphListener.mock.calls.map(([payload]) => payload.message);

        // Should have at least one telegraph message in phase 2
        expect(messages.length).toBeGreaterThan(0);

        // Messages should be bug-hydra specific (from boss patterns)
        const hasHydraMessage = messages.some(m =>
          m.includes('Hydra') || m.includes('head') || m.includes('venom') ||
          m.includes('Toxic') || m.includes('Pestilence') || m.includes('Swarm')
        );
        expect(hasHydraMessage).toBe(true);
      });
    });

    describe('Light Attack', () => {
      it('should execute boss attacks using BossAI patterns', () => {
        const telegraphListener = vi.fn();
        const playerDamagedListener = vi.fn();
        eventBus.on('combat:boss_telegraph', telegraphListener);
        eventBus.on('combat:player_damaged', playerDamagedListener);

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');

        combatManager.startBossAttackLoop('lobby1');

        // Run several attack cycles
        for (let i = 0; i < 10; i++) {
          vi.advanceTimersByTime(6000);
        }

        // Boss should have attacked at least once
        expect(playerDamagedListener.mock.calls.length).toBeGreaterThan(0);

        // Damage values should come from BossAI patterns
        const damages = playerDamagedListener.mock.calls.map(([payload]) => payload.damage);
        damages.forEach(damage => {
          expect(damage).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Player Health & Damage System', () => {
    beforeEach(() => {
      vi.useFakeTimers();

      const players = [
        { id: 'warrior1', team: 'developers' as TeamType },
        { id: 'ranger1', team: 'developers' as TeamType },
        { id: 'cleric1', team: 'qa' as TeamType },
      ];
      combatManager.initializeCombat('lobby1', players, 0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('applyDamageToPlayer', () => {
      it('should reduce player HP by damage amount', () => {
        const state = combatManager.getCombatState('lobby1');
        const playerBefore = state!.players.get('warrior1');
        expect(playerBefore!.hp).toBe(100);

        combatManager.applyDamageToPlayer('lobby1', 'warrior1', 25);

        const playerAfter = state!.players.get('warrior1');
        expect(playerAfter!.hp).toBe(75);
      });

      it('should cap HP at 0', () => {
        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');
        player!.hp = 10;

        combatManager.applyDamageToPlayer('lobby1', 'warrior1', 50);

        expect(player!.hp).toBe(0);
      });

      it('should emit combat:player_damaged event', () => {
        const damagedListener = vi.fn();
        eventBus.on('combat:player_damaged', damagedListener);

        combatManager.applyDamageToPlayer('lobby1', 'warrior1', 25);

        expect(damagedListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          damage: 25,
          playerHealth: 75,
        });
      });

      it('should call downPlayer when HP reaches 0', () => {
        const downedListener = vi.fn();
        eventBus.on('combat:player_downed', downedListener);

        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');
        player!.hp = 25;

        combatManager.applyDamageToPlayer('lobby1', 'warrior1', 25);

        expect(player!.hp).toBe(0);
        expect(player!.combatState).toBe('downed');
        expect(downedListener).toHaveBeenCalled();
      });

      it('should throw CombatNotActiveError for non-existent lobby', () => {
        expect(() => {
          combatManager.applyDamageToPlayer('nonexistent', 'player1', 25);
        }).toThrow(CombatNotActiveError);
      });

      it('should throw PlayerNotInCombatError for non-existent player', () => {
        expect(() => {
          combatManager.applyDamageToPlayer('lobby1', 'nonexistent', 25);
        }).toThrow(PlayerNotInCombatError);
      });
    });

    describe('downPlayer', () => {
      it('should transition player to downed state', () => {
        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');

        combatManager.downPlayer('lobby1', 'warrior1');

        expect(player!.combatState).toBe('downed');
        expect(player!.isDowned).toBe(true);
        expect(player!.downedAt).toBeDefined();
      });

      it('should emit combat:player_downed with 10-second countdown', () => {
        const downedListener = vi.fn();
        eventBus.on('combat:player_downed', downedListener);

        combatManager.downPlayer('lobby1', 'warrior1');

        expect(downedListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          countdownSeconds: 10,
        });
      });

      it('should start 10-second timer for permanent down', () => {
        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');

        combatManager.downPlayer('lobby1', 'warrior1');

        expect(player!.combatState).toBe('downed');

        // Advance timer
        vi.advanceTimersByTime(10000);

        // Should transition to ghost
        expect(player!.combatState).toBe('ghost');
      });

      it('should store timer handle for cleanup', () => {
        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');

        combatManager.downPlayer('lobby1', 'warrior1');

        expect(player!.downTimerHandle).toBeDefined();
      });
    });

    describe('permanentlyDownPlayer', () => {
      it('should transition player to ghost state', () => {
        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');
        player!.combatState = 'downed';

        combatManager.permanentlyDownPlayer('lobby1', 'warrior1');

        expect(player!.combatState).toBe('ghost');
      });

      it('should emit combat:player_permanently_downed event', () => {
        const permanentDownListener = vi.fn();
        eventBus.on('combat:player_permanently_downed', permanentDownListener);

        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');
        player!.combatState = 'downed';

        combatManager.permanentlyDownPlayer('lobby1', 'warrior1');

        expect(permanentDownListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          message: expect.stringContaining('ghost'),
        });
      });

      it('should clear down timer handle', () => {
        const state = combatManager.getCombatState('lobby1');
        const player = state!.players.get('warrior1');

        // Set up downed state with timer
        combatManager.downPlayer('lobby1', 'warrior1');
        expect(player!.downTimerHandle).toBeDefined();

        // Manually trigger permanent down
        combatManager.permanentlyDownPlayer('lobby1', 'warrior1');

        // Timer handle should be cleared
        expect(player!.downTimerHandle).toBeUndefined();
      });
    });

    describe('playerHealTeammate', () => {
      it('should heal target by HEAL_AMOUNT (25 HP)', () => {
        const state = combatManager.getCombatState('lobby1');
        const target = state!.players.get('warrior1');
        target!.hp = 50;

        combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');

        expect(target!.hp).toBe(75);
      });

      it('should cap healing at maxHp', () => {
        const state = combatManager.getCombatState('lobby1');
        const target = state!.players.get('warrior1');
        target!.hp = 90;

        combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');

        expect(target!.hp).toBe(100); // Capped at maxHp
      });

      it('should emit combat:player_healed event', () => {
        const healedListener = vi.fn();
        eventBus.on('combat:player_healed', healedListener);

        const state = combatManager.getCombatState('lobby1');
        const target = state!.players.get('warrior1');
        target!.hp = 50;

        combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');

        expect(healedListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          healerId: 'cleric1',
          healAmount: 25,
          newHealth: 75,
        });
      });

      it('should throw NotHealerClassError for non-healer class', () => {
        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'warrior1', 'ranger1');
        }).toThrow(NotHealerClassError);
      });

      it('should allow cleric to heal', () => {
        const state = combatManager.getCombatState('lobby1');
        const target = state!.players.get('warrior1');
        target!.hp = 50;

        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');
        }).not.toThrow();

        expect(target!.hp).toBe(75);
      });

      it('should allow paladin to heal', () => {
        // Add paladin to combat
        const state = combatManager.getCombatState('lobby1');
        state!.players.set('paladin1', {
          playerId: 'paladin1',
          hp: 100,
          maxHp: 100,
          isDowned: false,
          hasBeenRevived: false,
          combatState: 'fighting',
        });

        const target = state!.players.get('warrior1');
        target!.hp = 50;

        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'paladin1', 'warrior1');
        }).not.toThrow();

        expect(target!.hp).toBe(75);
      });

      it('should throw PlayerNotInCombatError if healer is downed', () => {
        const state = combatManager.getCombatState('lobby1');
        const healer = state!.players.get('cleric1');
        healer!.combatState = 'downed';

        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');
        }).toThrow(PlayerNotInCombatError);
      });

      it('should throw PlayerNotInCombatError if target is downed', () => {
        const state = combatManager.getCombatState('lobby1');
        const target = state!.players.get('warrior1');
        target!.combatState = 'downed';

        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');
        }).toThrow(PlayerNotInCombatError);
      });

      it('should throw PlayerNotInCombatError if target is ghost', () => {
        const state = combatManager.getCombatState('lobby1');
        const target = state!.players.get('warrior1');
        target!.combatState = 'ghost';

        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'cleric1', 'warrior1');
        }).toThrow(PlayerNotInCombatError);
      });

      it('should throw CombatNotActiveError for non-existent lobby', () => {
        expect(() => {
          combatManager.playerHealTeammate('nonexistent', 'cleric1', 'warrior1');
        }).toThrow(CombatNotActiveError);
      });

      it('should throw PlayerNotInCombatError for non-existent healer', () => {
        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'nonexistent', 'warrior1');
        }).toThrow(PlayerNotInCombatError);
      });

      it('should throw PlayerNotInCombatError for non-existent target', () => {
        expect(() => {
          combatManager.playerHealTeammate('lobby1', 'cleric1', 'nonexistent');
        }).toThrow(PlayerNotInCombatError);
      });
    });

    describe('Timer Cleanup', () => {
      it('should clear down timers on cleanupLobby', () => {
        const state = combatManager.getCombatState('lobby1');

        // Down multiple players
        combatManager.downPlayer('lobby1', 'warrior1');
        combatManager.downPlayer('lobby1', 'ranger1');

        const warrior = state!.players.get('warrior1');
        const ranger = state!.players.get('ranger1');
        expect(warrior!.downTimerHandle).toBeDefined();
        expect(ranger!.downTimerHandle).toBeDefined();

        // Cleanup
        combatManager.cleanupLobby('lobby1');

        // Advance timers - should not trigger permanent down
        const permanentDownListener = vi.fn();
        eventBus.on('combat:player_permanently_downed', permanentDownListener);

        vi.advanceTimersByTime(15000);

        expect(permanentDownListener).not.toHaveBeenCalled();
      });
    });
  });

  describe('Revival System', () => {
    beforeEach(() => {
      vi.useFakeTimers();

      const players = [
        { id: 'warrior1', team: 'developers' as TeamType },
        { id: 'ranger1', team: 'developers' as TeamType },
        { id: 'cleric1', team: 'qa' as TeamType },
        { id: 'paladin1', team: 'qa' as TeamType },
      ];
      combatManager.initializeCombat('lobby1', players, 0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('startRevival', () => {
      it('should create revival session for healer reviving downed player', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';
        warrior!.isDowned = true;

        const result = combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        expect(result).toBe(true);
      });

      it('should emit combat:revival_started event', () => {
        const revivalStartedListener = vi.fn();
        eventBus.on('combat:revival_started', revivalStartedListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';
        warrior!.isDowned = true;

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        expect(revivalStartedListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          reviverId: 'cleric1',
          targetId: 'warrior1',
          durationMs: 2500,
        });
      });

      it('should allow cleric to start revival', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        expect(() => {
          combatManager.startRevival('lobby1', 'cleric1', 'warrior1');
        }).not.toThrow();
      });

      it('should allow paladin to start revival', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        expect(() => {
          combatManager.startRevival('lobby1', 'paladin1', 'warrior1');
        }).not.toThrow();
      });

      it('should throw RevivalNotAllowedError for non-healer class', () => {
        const state = combatManager.getCombatState('lobby1');
        const ranger = state!.players.get('ranger1');
        ranger!.combatState = 'downed';

        expect(() => {
          combatManager.startRevival('lobby1', 'warrior1', 'ranger1');
        }).toThrow(RevivalNotAllowedError);
      });

      it('should return false if reviver is not fighting', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        const cleric = state!.players.get('cleric1');
        cleric!.combatState = 'downed';

        const result = combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        expect(result).toBe(false);
      });

      it('should return false if target is not downed', () => {
        const result = combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        expect(result).toBe(false);
      });

      it('should return false if target has already been revived', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';
        warrior!.hasBeenRevived = true;

        const result = combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        expect(result).toBe(false);
      });

      it('should return false if target is ghost (permanent down)', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'ghost';

        const result = combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        expect(result).toBe(false);
      });
    });

    describe('Revival Completion', () => {
      it('should complete revival after 2.5 seconds of channeling', () => {
        const revivalCompletedListener = vi.fn();
        eventBus.on('combat:player_revived', revivalCompletedListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.hp = 0;
        warrior!.combatState = 'downed';
        warrior!.isDowned = true;

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Advance time to complete revival
        vi.advanceTimersByTime(2500);

        expect(revivalCompletedListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          reviverId: 'cleric1',
          newHp: 50,
        });
      });

      it('should set target HP to 50% on revival', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.hp = 0;
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        vi.advanceTimersByTime(2500);

        expect(warrior!.hp).toBe(50); // 50% of 100 maxHp
      });

      it('should set target combatState to fighting on revival', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        vi.advanceTimersByTime(2500);

        expect(warrior!.combatState).toBe('fighting');
        expect(warrior!.isDowned).toBe(false);
      });

      it('should set hasBeenRevived to true after revival', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';
        warrior!.hasBeenRevived = false;

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        vi.advanceTimersByTime(2500);

        expect(warrior!.hasBeenRevived).toBe(true);
      });

      it('should clear down timer when revival completes', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');

        // Down the player (starts timer)
        combatManager.downPlayer('lobby1', 'warrior1');
        expect(warrior!.downTimerHandle).toBeDefined();

        // Start revival
        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Complete revival
        vi.advanceTimersByTime(2500);

        // Down timer should be cleared
        expect(warrior!.downTimerHandle).toBeUndefined();
      });
    });

    describe('Revival Interruption', () => {
      it('should cancel revival when reviver takes damage', () => {
        const revivalCancelledListener = vi.fn();
        eventBus.on('combat:revival_cancelled', revivalCancelledListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        // Start revival
        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Cleric takes damage
        combatManager.applyDamageToPlayer('lobby1', 'cleric1', 25);

        expect(revivalCancelledListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          reviverId: 'cleric1',
          targetId: 'warrior1',
          reason: 'took_damage',
        });
      });

      it('should not complete revival if cancelled by damage', () => {
        const revivalCompletedListener = vi.fn();
        eventBus.on('combat:player_revived', revivalCompletedListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Interrupt with damage at 1 second
        vi.advanceTimersByTime(1000);
        combatManager.applyDamageToPlayer('lobby1', 'cleric1', 25);

        // Advance past completion time
        vi.advanceTimersByTime(2000);

        // Should NOT complete
        expect(revivalCompletedListener).not.toHaveBeenCalled();
        expect(warrior!.combatState).toBe('downed');
      });

      it('should cancel revival if target dies (permanent down)', () => {
        const revivalCancelledListener = vi.fn();
        eventBus.on('combat:revival_cancelled', revivalCancelledListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Target becomes ghost
        combatManager.permanentlyDownPlayer('lobby1', 'warrior1');

        expect(revivalCancelledListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          reviverId: 'cleric1',
          targetId: 'warrior1',
          reason: 'permanent_down',
        });
      });

      it('should cancel revival if reviver gets downed', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Reviver gets downed (HP to 0)
        const cleric = state!.players.get('cleric1');
        cleric!.hp = 25;
        combatManager.applyDamageToPlayer('lobby1', 'cleric1', 25);

        // Tick the revival to check interruption
        vi.advanceTimersByTime(200);

        // Should not complete after full duration
        vi.advanceTimersByTime(3000);
        expect(warrior!.combatState).toBe('downed');
      });
    });

    describe('Revival Cleanup', () => {
      it('should clear all revival sessions on cleanupLobby', () => {
        const revivalCancelledListener = vi.fn();
        eventBus.on('combat:revival_cancelled', revivalCancelledListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        const ranger = state!.players.get('ranger1');
        warrior!.combatState = 'downed';
        ranger!.combatState = 'downed';

        // Start multiple revivals
        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');
        combatManager.startRevival('lobby1', 'paladin1', 'ranger1');

        // Cleanup lobby
        combatManager.cleanupLobby('lobby1');

        // Advance time - should not complete
        vi.advanceTimersByTime(3000);

        // Players should still be in original state (lobby is deleted)
        const stateAfter = combatManager.getCombatState('lobby1');
        expect(stateAfter).toBeUndefined();
      });

      it('should clear interval handles on cleanup', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Cleanup should clear interval
        combatManager.cleanupLobby('lobby1');

        // No events should fire
        const revivalCompletedListener = vi.fn();
        eventBus.on('combat:player_revived', revivalCompletedListener);

        vi.advanceTimersByTime(5000);

        expect(revivalCompletedListener).not.toHaveBeenCalled();
      });
    });

    describe('Revival Edge Cases', () => {
      it('should not allow multiple revivals on same target', () => {
        // Add a bard for testing
        const state = combatManager.getCombatState('lobby1');
        state!.players.set('bard1', {
          playerId: 'bard1',
          hp: 100,
          maxHp: 100,
          isDowned: false,
          hasBeenRevived: false,
          combatState: 'fighting',
        });

        // Update mock to include bard
        getPlayerClass = vi.fn((lobbyId: string, playerId: string) => {
          if (playerId === 'bard1') return 'bard';
          if (playerId === 'cleric1') return 'cleric';
          if (playerId === 'paladin1') return 'paladin';
          if (playerId === 'warrior1') return 'warrior';
          return 'ranger';
        });

        combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });
        const players = [
          { id: 'warrior1', team: 'developers' as TeamType },
          { id: 'cleric1', team: 'qa' as TeamType },
          { id: 'bard1', team: 'qa' as TeamType },
        ];
        combatManager.initializeCombat('lobby1', players, 0);

        const newState = combatManager.getCombatState('lobby1');
        const warrior = newState!.players.get('warrior1');
        warrior!.combatState = 'downed';

        // First revival starts
        const result1 = combatManager.startRevival('lobby1', 'cleric1', 'warrior1');
        expect(result1).toBe(true);

        // Second revival should fail (already being revived)
        const result2 = combatManager.startRevival('lobby1', 'bard1', 'warrior1');
        expect(result2).toBe(false);
      });

      it('should handle reviver leaving lobby during revival', () => {
        const revivalCancelledListener = vi.fn();
        eventBus.on('combat:revival_cancelled', revivalCancelledListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Simulate reviver leaving (remove from combat)
        state!.players.delete('cleric1');

        // Tick should detect missing reviver
        vi.advanceTimersByTime(200);

        // Should not complete
        vi.advanceTimersByTime(3000);
        expect(warrior!.combatState).toBe('downed');
      });
    });
  });

  describe('Cross-Domain Event Subscriptions', () => {
    beforeEach(() => {
      vi.useFakeTimers();

      const players = [
        { id: 'warrior1', team: 'developers' as TeamType },
        { id: 'ranger1', team: 'developers' as TeamType },
        { id: 'cleric1', team: 'qa' as TeamType },
      ];
      combatManager.initializeCombat('lobby1', players, 0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('estimation:vote_cast event', () => {
      it('should trigger battle entry when player votes', () => {
        const battleEntryListener = vi.fn();
        eventBus.on('combat:player_entered_battle', battleEntryListener);

        // Emit vote cast event
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        expect(battleEntryListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          transitionDurationMs: 1500,
        });
      });

      it('should start boss attack loop on first vote', () => {
        const battleStartedListener = vi.fn();
        eventBus.on('combat:battle_started', battleStartedListener);

        // First vote
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        expect(battleStartedListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          bossId: expect.any(String),
        });

        const state = combatManager.getCombatState('lobby1');
        expect(state!.battleStartTime).toBeDefined();
        expect(state!.boss!.attackTimerHandle).toBeDefined();
      });

      it('should start modifier loop on first vote', () => {
        const modifierListener = vi.fn();
        eventBus.on('combat:modifier_updated', modifierListener);

        // First vote
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        const state = combatManager.getCombatState('lobby1');
        expect(state!.modifierIntervalHandle).toBeDefined();

        // Advance 10 seconds for first modifier increment
        vi.advanceTimersByTime(10000);

        expect(modifierListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          modifier: 1.1,
        });
      });

      it('should not start loops multiple times', () => {
        const battleStartedListener = vi.fn();
        eventBus.on('combat:battle_started', battleStartedListener);

        // First vote
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        // Second vote
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'ranger1',
          team: 'developers',
          vote: 5,
        });

        // Should only emit once
        expect(battleStartedListener).toHaveBeenCalledTimes(1);
      });

      it('should ignore votes for non-existent combat', () => {
        const battleEntryListener = vi.fn();
        eventBus.on('combat:player_entered_battle', battleEntryListener);

        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'nonexistent',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        expect(battleEntryListener).not.toHaveBeenCalled();
      });

      it('should ignore votes from players not in combat', () => {
        const battleEntryListener = vi.fn();
        eventBus.on('combat:player_entered_battle', battleEntryListener);

        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'spectator1',
          team: 'spectators',
          vote: 5,
        });

        expect(battleEntryListener).not.toHaveBeenCalled();
      });
    });

    describe('session:player_left event', () => {
      it('should remove player from combat state', () => {
        const state = combatManager.getCombatState('lobby1');
        expect(state!.players.has('warrior1')).toBe(true);

        eventBus.emit('session:player_left', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
        });

        expect(state!.players.has('warrior1')).toBe(false);
      });

      it('should clear player down timer on leave', () => {
        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');

        // Down the player
        warrior!.combatState = 'downed';
        warrior!.hp = 0;
        combatManager.downPlayer('lobby1', 'warrior1');

        expect(warrior!.downTimerHandle).toBeDefined();

        // Player leaves
        eventBus.emit('session:player_left', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
        });

        // Timer should be cleared
        expect(state!.players.has('warrior1')).toBe(false);
      });

      it('should remove player from threat table', () => {
        const state = combatManager.getCombatState('lobby1');

        // Build threat
        combatManager.playerAttackBoss('lobby1', 'warrior1');
        expect(state!.boss!.threatTable.has('warrior1')).toBe(true);

        // Player leaves
        eventBus.emit('session:player_left', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
        });

        expect(state!.boss!.threatTable.has('warrior1')).toBe(false);
      });

      it('should cancel revival if reviver leaves', () => {
        const revivalCancelledListener = vi.fn();
        eventBus.on('combat:revival_cancelled', revivalCancelledListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Reviver leaves
        eventBus.emit('session:player_left', {
          lobbyId: 'lobby1',
          playerId: 'cleric1',
        });

        expect(revivalCancelledListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          reviverId: 'cleric1',
          targetId: 'warrior1',
          reason: 'player_left',
        });
      });

      it('should cancel revival if target leaves', () => {
        const revivalCancelledListener = vi.fn();
        eventBus.on('combat:revival_cancelled', revivalCancelledListener);

        const state = combatManager.getCombatState('lobby1');
        const warrior = state!.players.get('warrior1');
        warrior!.combatState = 'downed';

        combatManager.startRevival('lobby1', 'cleric1', 'warrior1');

        // Target leaves
        eventBus.emit('session:player_left', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
        });

        expect(revivalCancelledListener).toHaveBeenCalledWith({
          lobbyId: 'lobby1',
          reviverId: 'cleric1',
          targetId: 'warrior1',
          reason: 'player_left',
        });
      });
    });

    describe('session:lobby_destroyed event', () => {
      it('should call cleanupLobby when lobby destroyed', () => {
        const cleanupListener = vi.fn();
        eventBus.on('combat:cleanup_complete', cleanupListener);

        const state = combatManager.getCombatState('lobby1');
        expect(state).not.toBeUndefined();

        eventBus.emit('session:lobby_destroyed', {
          lobbyId: 'lobby1',
        });

        expect(cleanupListener).toHaveBeenCalledWith({ lobbyId: 'lobby1' });
        expect(combatManager.getCombatState('lobby1')).toBeUndefined();
      });

      it('should clear all timers on lobby destroyed', () => {
        // Start combat loops
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        const state = combatManager.getCombatState('lobby1');
        expect(state!.boss!.attackTimerHandle).toBeDefined();
        expect(state!.modifierIntervalHandle).toBeDefined();

        // Destroy lobby
        eventBus.emit('session:lobby_destroyed', {
          lobbyId: 'lobby1',
        });

        // Verify state is cleaned up
        expect(combatManager.getCombatState('lobby1')).toBeUndefined();
      });
    });

    describe('Battle Modifier Loop', () => {
      it('should increment modifier every 10 seconds', () => {
        const modifierListener = vi.fn();
        eventBus.on('combat:modifier_updated', modifierListener);

        // Start combat
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        // First increment at 10s
        vi.advanceTimersByTime(10000);
        expect(modifierListener).toHaveBeenCalledTimes(1);
        expect(modifierListener.mock.calls[0][0].lobbyId).toBe('lobby1');
        expect(modifierListener.mock.calls[0][0].modifier).toBeCloseTo(1.1);

        // Second increment at 20s
        vi.advanceTimersByTime(10000);
        expect(modifierListener).toHaveBeenCalledTimes(2);
        expect(modifierListener.mock.calls[1][0].modifier).toBeCloseTo(1.2);

        // Third increment at 30s
        vi.advanceTimersByTime(10000);
        expect(modifierListener).toHaveBeenCalledTimes(3);
        expect(modifierListener.mock.calls[2][0].modifier).toBeCloseTo(1.3);
      });

      it('should stop modifier loop when boss defeated', () => {
        const modifierListener = vi.fn();
        eventBus.on('combat:modifier_updated', modifierListener);

        // Start combat
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        // Defeat boss
        const state = combatManager.getCombatState('lobby1');
        state!.boss!.hp = 0;

        // Try to increment - should not emit
        modifierListener.mockClear();
        vi.advanceTimersByTime(10000);

        expect(modifierListener).not.toHaveBeenCalled();
      });

      it('should clear modifier interval on cleanup', () => {
        const modifierListener = vi.fn();
        eventBus.on('combat:modifier_updated', modifierListener);

        // Start combat
        eventBus.emit('estimation:vote_cast', {
          lobbyId: 'lobby1',
          playerId: 'warrior1',
          team: 'developers',
          vote: 5,
        });

        // Cleanup lobby
        combatManager.cleanupLobby('lobby1');

        // Advance time - should not emit
        vi.advanceTimersByTime(20000);

        expect(modifierListener).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Registry-driven parity tests (Plan 47-03)
  // ---------------------------------------------------------------------------

  describe('getClassBaseDamage registry parity (Plan 47-03)', () => {
    /**
     * All 10 AvatarClass values and their expected baseDamage from AVATAR_CLASSES.
     * These values must match the old switch in CombatManager exactly.
     */
    const CLASS_BASE_DAMAGES: Array<[AvatarClass, number]> = [
      ['warrior',     15],
      ['paladin',     15],
      ['oathbreaker', 15],
      ['ranger',      20],
      ['rogue',       20],
      ['monk',        20],
      ['sorcerer',    25],
      ['wizard',      25],
      ['cleric',      12],
      ['bard',        12],
    ];

    it.each(CLASS_BASE_DAMAGES)(
      '%s base damage equals %i (registry parity)',
      (avatarClass, expectedDamage) => {
        // Configure mock to return the class under test
        getPlayerClass = vi.fn(() => avatarClass);
        combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });

        const players = [
          { id: 'testPlayer', team: 'developers' as TeamType },
          { id: 'dummy', team: 'developers' as TeamType },
        ];
        combatManager.initializeCombat('parityLobby', players, 0);

        const damage = combatManager.playerAttackBoss('parityLobby', 'testPlayer');
        // masteryMultiplier is 1.0 by default → damage should equal baseDamage exactly
        expect(damage).toBe(expectedDamage);
      }
    );
  });

  describe('HEALER_CLASSES derivation from registry (Plan 47-03)', () => {
    /**
     * Healer classes (role === 'healer' in AVATAR_CLASSES) should be allowed to
     * heal teammates; non-healers should throw NotHealerClassError.
     */
    const HEALER_CLASS_IDS: AvatarClass[] = ['cleric', 'paladin', 'bard'];
    const NON_HEALER_CLASS_IDS: AvatarClass[] = ['warrior', 'ranger', 'rogue', 'monk', 'sorcerer', 'wizard', 'oathbreaker'];

    it.each(HEALER_CLASS_IDS)(
      '%s (healer role) does NOT throw NotHealerClassError when healing',
      (healerClass) => {
        getPlayerClass = vi.fn((_, playerId: string) => {
          if (playerId === 'healerPlayer') return healerClass;
          return 'ranger';
        });
        combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });

        const players = [
          { id: 'healerPlayer', team: 'developers' as TeamType },
          { id: 'targetPlayer', team: 'developers' as TeamType },
        ];
        combatManager.initializeCombat('healerLobby', players, 0);

        // Reduce target HP so they can be healed
        const state = combatManager.getCombatState('healerLobby');
        const targetState = state!.players.get('targetPlayer');
        targetState!.hp = 50;

        // Should not throw NotHealerClassError (healer class allowed)
        expect(() => {
          combatManager.playerHealTeammate('healerLobby', 'healerPlayer', 'targetPlayer');
        }).not.toThrow(NotHealerClassError);
      }
    );

    it.each(NON_HEALER_CLASS_IDS)(
      '%s (non-healer role) throws NotHealerClassError when healing',
      (nonHealerClass) => {
        getPlayerClass = vi.fn((_, playerId: string) => {
          if (playerId === 'nonHealerPlayer') return nonHealerClass;
          return 'ranger';
        });
        combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });

        const players = [
          { id: 'nonHealerPlayer', team: 'developers' as TeamType },
          { id: 'targetPlayer', team: 'developers' as TeamType },
        ];
        combatManager.initializeCombat('nonHealerLobby', players, 0);

        expect(() => {
          combatManager.playerHealTeammate('nonHealerLobby', 'nonHealerPlayer', 'targetPlayer');
        }).toThrow(NotHealerClassError);
      }
    );
  });
});
