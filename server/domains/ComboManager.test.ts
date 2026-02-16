/**
 * ComboManager Domain Tests
 *
 * Tests for class-pair combo detection, consensus ultimates, and cooldown management.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComboManager, ComboManagerDeps } from './ComboManager';
import { ScopedEventBus } from '../events/ScopedEventBus';
import { AvatarClass } from '../../shared/gameEvents';
import { AbilityUsedPayload } from '../../shared/abilityTypes';
import { EstimationFullConsensusReachedPayload } from '../events/eventTypes';
import { CLASS_COMBOS } from '../../shared/comboTypes';

describe('ComboManager', () => {
  let comboManager: ComboManager;
  let eventBus: ScopedEventBus;
  let mockCombatManager: any;
  let mockGetPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
  let mockGetVotingStartTime: (lobbyId: string) => number | null;
  let emittedEvents: Map<string, any[]>;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new ScopedEventBus();
    emittedEvents = new Map();

    // Spy on event emissions
    const originalEmit = eventBus.emit.bind(eventBus);
    vi.spyOn(eventBus, 'emit').mockImplementation((event: any, payload: any) => {
      if (!emittedEvents.has(event)) {
        emittedEvents.set(event, []);
      }
      emittedEvents.get(event)!.push(payload);
      return originalEmit(event, payload);
    });

    // Mock dependencies
    mockCombatManager = {
      applyComboMultiplier: vi.fn(),
    };

    mockGetPlayerClass = vi.fn((lobbyId: string, playerId: string) => {
      // Default mapping for tests
      const classMap: Record<string, AvatarClass> = {
        'player1': 'warrior',
        'player2': 'cleric',
        'player3': 'sorcerer',
        'player4': 'wizard',
        'player5': 'rogue',
      };
      return classMap[playerId] || null;
    });

    mockGetVotingStartTime = vi.fn(() => Date.now() - 30000); // 30s ago by default

    const deps: ComboManagerDeps = {
      eventBus,
      combatManager: mockCombatManager,
      getPlayerClass: mockGetPlayerClass,
      getVotingStartTime: mockGetVotingStartTime,
    };

    comboManager = new ComboManager(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =============================================================================
  // Class-Pair Combo Detection Tests (6 tests)
  // =============================================================================

  describe('Class-pair combo detection', () => {
    it('triggers combo when two matching classes use abilities within 3s window', () => {
      const lobbyId = 'test-lobby';

      // Player1 (warrior) uses ability
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      // Player2 (cleric) uses ability within 3s
      vi.advanceTimersByTime(2000); // 2 seconds later
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      // Should trigger shield_wall combo (warrior + cleric)
      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);
      expect(comboEvents[0].comboId).toBe('shield_wall');
      expect(comboEvents[0].comboName).toBe('Shield Wall');
      expect(comboEvents[0].participantPlayerIds).toContain('player1');
      expect(comboEvents[0].participantPlayerIds).toContain('player2');
    });

    it('does NOT trigger when only one class uses ability (missing partner)', () => {
      const lobbyId = 'test-lobby';

      // Only warrior uses ability
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      // No combo should trigger
      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(0);
    });

    it('does NOT trigger when abilities are >3s apart (outside window)', () => {
      const lobbyId = 'test-lobby';

      // Player1 (warrior) uses ability
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      // Player2 (cleric) uses ability 4s later (outside window)
      vi.advanceTimersByTime(4000);
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      // No combo should trigger
      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(0);
    });

    it('does NOT trigger when classes dont match any combo definition', () => {
      const lobbyId = 'test-lobby';

      // Override class mapping to non-matching classes
      // Just update the mock, don't recreate ComboManager to avoid double event handlers
      (mockGetPlayerClass as any).mockImplementation((lobbyId: string, playerId: string) => {
        if (playerId === 'player1') return 'ranger';
        if (playerId === 'player2') return 'monk';
        return null;
      });

      // Player1 (ranger) uses ability
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'ranger_volley',
        abilityName: 'Volley',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      // Player2 (monk) uses ability within window
      vi.advanceTimersByTime(1000);
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'monk_flurry_of_blows',
        abilityName: 'Flurry of Blows',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      // No combo should trigger (ranger + monk not in combo definitions)
      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(0);
    });

    it('triggers correct combo when multiple combos could match (first match wins)', () => {
      const lobbyId = 'test-lobby';

      // Setup: warrior + cleric could match shield_wall OR perfect_synergy
      // shield_wall appears first in CLASS_COMBOS, so it should win

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);
      expect(comboEvents[0].comboId).toBe('shield_wall'); // First match
    });

    it('emits combo:triggered event with correct payload', () => {
      const lobbyId = 'test-lobby';

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);
      const payload = comboEvents[0];

      expect(payload.lobbyId).toBe(lobbyId);
      expect(payload.comboId).toBe('shield_wall');
      expect(payload.comboName).toBe('Shield Wall');
      expect(payload.triggeringPlayerId).toBe('player2'); // Last player to trigger
      expect(payload.participantPlayerIds).toEqual(expect.arrayContaining(['player1', 'player2']));
      expect(payload.damage).toBeGreaterThan(0);
      expect(payload.damageMultiplier).toBe(1.3);
    });
  });

  // =============================================================================
  // Combo Cooldowns Tests (4 tests)
  // =============================================================================

  describe('Combo cooldowns', () => {
    it('does NOT trigger same combo again while on cooldown', () => {
      const lobbyId = 'test-lobby';

      // First combo trigger
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      // First combo should trigger
      let comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);

      // Try to trigger again immediately
      vi.advanceTimersByTime(2000); // Still within cooldown (30s for shield_wall)

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      // Should still be only 1 combo event (not 2)
      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);
    });

    it('allows combo after cooldown expires', () => {
      const lobbyId = 'test-lobby';

      // First combo trigger
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      let comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);

      // Advance past cooldown (30s for shield_wall)
      vi.advanceTimersByTime(30000);

      // Try to trigger again
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      // Should now have 2 combo events
      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(2);
    });

    it('different combos have independent cooldowns', () => {
      const lobbyId = 'test-lobby';

      // Setup: player3 is sorcerer, player4 is wizard
      // Just update the mock, don't recreate ComboManager to avoid double event handlers
      (mockGetPlayerClass as any).mockImplementation((lobbyId: string, playerId: string) => {
        if (playerId === 'player1') return 'warrior';
        if (playerId === 'player2') return 'cleric';
        if (playerId === 'player3') return 'sorcerer';
        if (playerId === 'player4') return 'wizard';
        return null;
      });

      // Trigger shield_wall (warrior + cleric)
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      let comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);
      expect(comboEvents[0].comboId).toBe('shield_wall');

      // Wait for warrior/cleric to leave the window, then trigger elemental_fury
      vi.advanceTimersByTime(3500); // Advance past 3s window

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player3',
        abilityId: 'sorcerer_fireball',
        abilityName: 'Fireball',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player4',
        abilityId: 'wizard_arcane_missile',
        abilityName: 'Arcane Missile',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      // Should trigger elemental_fury even though shield_wall is on cooldown
      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(2);
      expect(comboEvents[1].comboId).toBe('elemental_fury');
    });

    it('cooldown duration matches combo definitions cooldownMs', () => {
      const lobbyId = 'test-lobby';

      // Trigger shield_wall (30s cooldown)
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      let comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);

      // 29s later - still on cooldown
      vi.advanceTimersByTime(29000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1); // Still on cooldown

      // 1s more (total 31s) - cooldown expired
      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(2); // Cooldown expired, should trigger
    });
  });

  // =============================================================================
  // Consensus Ultimate Tests (4 tests)
  // =============================================================================

  describe('Consensus ultimate', () => {
    it('triggers on estimation:full_consensus_reached event', () => {
      const lobbyId = 'test-lobby';

      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      const ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents.length).toBe(1);
      expect(ultimateEvents[0].lobbyId).toBe(lobbyId);
    });

    it('does NOT trigger twice for same ticket (one-per-ticket guard)', () => {
      const lobbyId = 'test-lobby';

      // First consensus
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      let ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents.length).toBe(1);

      // Try to trigger again with same ticket
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      // Should still be only 1 ultimate event
      ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents.length).toBe(1);

      // Different ticket should work
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-2',
      } as EstimationFullConsensusReachedPayload);

      ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents.length).toBe(2);
    });

    it('calculates multiplier correctly based on voting duration', () => {
      const lobbyId = 'test-lobby';

      // Test fast voting (10s) = 3.0x multiplier
      (mockGetVotingStartTime as any).mockReturnValue(Date.now() - 10000);
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      let ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents[0].damageMultiplier).toBeCloseTo(3.0, 1);
      expect(ultimateEvents[0].votingDurationMs).toBe(10000);

      // Test slow voting (60s) = 1.5x multiplier
      comboManager.resetCombos(lobbyId); // Reset for fresh test
      emittedEvents.clear();
      (mockGetVotingStartTime as any).mockReturnValue(Date.now() - 60000);
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-2',
      } as EstimationFullConsensusReachedPayload);

      ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents[0].damageMultiplier).toBeCloseTo(1.5, 1);
      expect(ultimateEvents[0].votingDurationMs).toBe(60000);

      // Test medium voting (30s) ≈ 2.25x multiplier
      comboManager.resetCombos(lobbyId);
      emittedEvents.clear();
      (mockGetVotingStartTime as any).mockReturnValue(Date.now() - 30000);
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-3',
      } as EstimationFullConsensusReachedPayload);

      ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents[0].damageMultiplier).toBeGreaterThan(2.0);
      expect(ultimateEvents[0].damageMultiplier).toBeLessThan(2.5);
    });

    it('emits combo:consensus_ultimate event with correct payload', () => {
      const lobbyId = 'test-lobby';
      (mockGetVotingStartTime as any).mockReturnValue(Date.now() - 20000); // 20s voting

      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      const ultimateEvents = emittedEvents.get('combo:consensus_ultimate') || [];
      expect(ultimateEvents.length).toBe(1);
      const payload = ultimateEvents[0];

      expect(payload.lobbyId).toBe(lobbyId);
      expect(payload.damage).toBeGreaterThan(0);
      expect(payload.damageMultiplier).toBeGreaterThan(1.5);
      expect(payload.damageMultiplier).toBeLessThan(3.0);
      expect(payload.votingDurationMs).toBe(20000);
    });
  });

  // =============================================================================
  // Damage Application Tests (3 tests)
  // =============================================================================

  describe('Damage application', () => {
    it('calls combatManager.applyComboMultiplier on combo trigger with correct damage', () => {
      const lobbyId = 'test-lobby';

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      expect(mockCombatManager.applyComboMultiplier).toHaveBeenCalledWith(
        lobbyId,
        'shield_wall',
        expect.any(Number)
      );

      // Verify damage calculation: baseDamage (150) * damageMultiplier (1.3) = 195
      const callArgs = mockCombatManager.applyComboMultiplier.mock.calls[0];
      expect(callArgs[2]).toBe(195);
    });

    it('calls combatManager.applyComboMultiplier on consensus ultimate with correct damage', () => {
      const lobbyId = 'test-lobby';
      (mockGetVotingStartTime as any).mockReturnValue(Date.now() - 30000); // 30s voting

      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      expect(mockCombatManager.applyComboMultiplier).toHaveBeenCalledWith(
        lobbyId,
        'consensus_ultimate',
        expect.any(Number)
      );

      // Damage should be CONSENSUS_ULTIMATE_BASE_DAMAGE (250) * multiplier (~2.25 for 30s)
      const callArgs = mockCombatManager.applyComboMultiplier.mock.calls[0];
      const damage = callArgs[2];
      expect(damage).toBeGreaterThan(500); // 250 * 2.0 = 500
      expect(damage).toBeLessThan(650); // 250 * 2.5 = 625
    });

    it('combo damage = baseDamage * damageMultiplier', () => {
      const lobbyId = 'test-lobby';

      // Setup for elemental_fury: baseDamage 140, multiplier 1.7
      // Just update the mock, don't recreate ComboManager to avoid double event handlers
      (mockGetPlayerClass as any).mockImplementation((lobbyId: string, playerId: string) => {
        if (playerId === 'player3') return 'sorcerer';
        if (playerId === 'player4') return 'wizard';
        return null;
      });

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player3',
        abilityId: 'sorcerer_fireball',
        abilityName: 'Fireball',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player4',
        abilityId: 'wizard_arcane_missile',
        abilityName: 'Arcane Missile',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      const callArgs = mockCombatManager.applyComboMultiplier.mock.calls[0];
      // elemental_fury: baseDamage 140 * multiplier 1.7 = 238
      expect(callArgs[2]).toBe(238);
    });
  });

  // =============================================================================
  // Cleanup Tests (3 tests)
  // =============================================================================

  describe('Cleanup', () => {
    it('resetCombos clears all state for lobby', () => {
      const lobbyId = 'test-lobby';

      // Trigger a combo
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      let comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);

      // Reset combos
      comboManager.resetCombos(lobbyId);

      // Try to trigger same combo immediately (should work if cooldown cleared)
      emittedEvents.clear();

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1); // Should trigger again
    });

    it('cleanupLobby removes all tracked data', () => {
      const lobbyId = 'test-lobby';

      // Trigger combo
      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      // Trigger consensus ultimate
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: 'ticket-1',
      } as EstimationFullConsensusReachedPayload);

      // Cleanup lobby
      comboManager.cleanupLobby(lobbyId);

      // After cleanup, everything should reset
      emittedEvents.clear();

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      const comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1); // Should work after cleanup
    });

    it('different lobbies have isolated combo state', () => {
      const lobby1 = 'lobby-1';
      const lobby2 = 'lobby-2';

      // Trigger combo in lobby1
      eventBus.emit('ability:used', {
        lobbyId: lobby1,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId: lobby1,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      let comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(1);
      expect(comboEvents[0].lobbyId).toBe(lobby1);

      // Immediately trigger same combo in lobby2 (should work - different lobby)
      eventBus.emit('ability:used', {
        lobbyId: lobby2,
        playerId: 'player1',
        abilityId: 'warrior_shield_bash',
        abilityName: 'Shield Bash',
        effectType: 'damage',
        targetType: 'boss',
      } as AbilityUsedPayload);

      vi.advanceTimersByTime(1000);

      eventBus.emit('ability:used', {
        lobbyId: lobby2,
        playerId: 'player2',
        abilityId: 'cleric_greater_heal',
        abilityName: 'Greater Heal',
        effectType: 'heal',
        targetType: 'single',
      } as AbilityUsedPayload);

      comboEvents = emittedEvents.get('combo:triggered') || [];
      expect(comboEvents.length).toBe(2);
      expect(comboEvents[1].lobbyId).toBe(lobby2);
    });
  });
});
