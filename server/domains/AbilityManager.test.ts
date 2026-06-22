/**
 * AbilityManager Tests
 *
 * TDD suite for server-authoritative ability cooldown tracking and validation.
 * Tests cooldown management, mastery gating, combat state validation, and effect emission.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AbilityManager, AbilityManagerDeps } from './AbilityManager';
import { ScopedEventBus } from '../events';
import { AvatarClass } from '../../shared/gameEvents';

// Mock combat state for testing
interface MockPlayerCombat {
  playerId: string;
  hp: number;
  maxHp: number;
  combatState: 'fighting' | 'downed' | 'ghost';
}

interface MockBossCombat {
  bossId: string;
  hp: number;
  maxHp: number;
}

interface MockCombatState {
  lobbyId: string;
  boss?: MockBossCombat;
  players: Map<string, MockPlayerCombat>;
}

describe('AbilityManager - Cooldown Validation', () => {
  let abilityManager: AbilityManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: AbilityManagerDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new ScopedEventBus();

    mockCombatState = {
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 100, maxHp: 100, combatState: 'fighting' }],
      ]),
    };

    deps = {
      eventBus,
      combatManager: {
        getCombatState: vi.fn((lobbyId: string) => {
          if (lobbyId === mockCombatState.lobbyId) {
            return mockCombatState as any;
          }
          return undefined;
        }),
        canUseClassAbility: vi.fn(() => true), // Default: all abilities unlocked
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass),
    };

    abilityManager = new AbilityManager(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow ability use when no cooldown is active', () => {
    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject ability use when ability is on cooldown', () => {
    // First use succeeds
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');

    // Second use immediately after should fail
    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(false);
    expect(result.error).toContain('cooldown');
  });

  it('should allow ability use after cooldown expires', () => {
    // First use
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');

    // Advance time past cooldown (15000ms for shield bash)
    vi.advanceTimersByTime(15001);

    // Should succeed now
    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(true);
  });

  it('should track multiple abilities with independent cooldowns', () => {
    // Use ability 1
    const result1 = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result1.success).toBe(true);

    // Use ability 2 (different ability, should work)
    const result2 = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_berserker_rage');
    expect(result2.success).toBe(true);

    // Both should be on cooldown now
    const result3 = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result3.success).toBe(false);

    const result4 = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_berserker_rage');
    expect(result4.success).toBe(false);
  });

  it('should correctly calculate remaining cooldown time', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');

    // Immediately after use
    const remaining1 = abilityManager.getRemainingCooldown('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(remaining1).toBe(15); // 15 seconds

    // After 5 seconds
    vi.advanceTimersByTime(5000);
    const remaining2 = abilityManager.getRemainingCooldown('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(remaining2).toBe(10); // 10 seconds left

    // After cooldown expires
    vi.advanceTimersByTime(10001);
    const remaining3 = abilityManager.getRemainingCooldown('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(remaining3).toBe(0);
  });
});

describe('AbilityManager - Mastery Tier Gating', () => {
  let abilityManager: AbilityManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: AbilityManagerDeps;
  let canUseAbility: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();

    mockCombatState = {
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 100, maxHp: 100, combatState: 'fighting' }],
      ]),
    };

    canUseAbility = vi.fn(() => false) as any; // Default: abilities locked

    deps = {
      eventBus,
      combatManager: {
        getCombatState: vi.fn(() => mockCombatState as any),
        canUseClassAbility: canUseAbility as any,
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass) as any,
    };

    abilityManager = new AbilityManager(deps);
  });

  it('should reject ability use when ability is not unlocked', () => {
    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not unlocked');
  });

  it('should allow ability use when canUseClassAbility returns true', () => {
    canUseAbility.mockReturnValue(true);

    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(true);
  });

  it('should call canUseClassAbility with correct parameters', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');

    expect(canUseAbility).toHaveBeenCalledWith('lobby-1', 'player-1', 'warrior_shield_bash');
  });
});

describe('AbilityManager - Combat State Validation', () => {
  let abilityManager: AbilityManager;
  let eventBus: ScopedEventBus;
  let deps: AbilityManagerDeps;
  let getCombatState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    getCombatState = vi.fn();

    deps = {
      eventBus,
      combatManager: {
        getCombatState: getCombatState as any,
        canUseClassAbility: vi.fn(() => true) as any,
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass) as any,
    };

    abilityManager = new AbilityManager(deps);
  });

  it('should reject ability use when combat is not active', () => {
    getCombatState.mockReturnValue(undefined); // No combat state

    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });

  it('should reject ability use when player is not in combat', () => {
    getCombatState.mockReturnValue({
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map(), // Player not in combat
    });

    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in combat');
  });

  it('should reject ability use when player is downed', () => {
    getCombatState.mockReturnValue({
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 0, maxHp: 100, combatState: 'downed' }],
      ]),
    });

    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in combat');
  });

  it('should reject ability use when player is a ghost', () => {
    getCombatState.mockReturnValue({
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 0, maxHp: 100, combatState: 'ghost' }],
      ]),
    });

    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in combat');
  });

  it('should allow ability use when player is fighting', () => {
    getCombatState.mockReturnValue({
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 100, maxHp: 100, combatState: 'fighting' }],
      ]),
    });

    const result = abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(result.success).toBe(true);
  });
});

describe('AbilityManager - Effect Application', () => {
  let abilityManager: AbilityManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: AbilityManagerDeps;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    emitSpy = vi.spyOn(eventBus, 'emit');

    mockCombatState = {
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 100, maxHp: 100, combatState: 'fighting' }],
        ['player-2', { playerId: 'player-2', hp: 50, maxHp: 100, combatState: 'fighting' }],
      ]),
    };

    deps = {
      eventBus,
      combatManager: {
        getCombatState: vi.fn(() => mockCombatState as any),
        canUseClassAbility: vi.fn(() => true),
      },
      getPlayerClass: vi.fn((lobbyId, playerId) => {
        if (playerId === 'player-1') return 'warrior' as AvatarClass;
        if (playerId === 'player-2') return 'cleric' as AvatarClass;
        return 'warrior' as AvatarClass;
      }),
    };

    abilityManager = new AbilityManager(deps);
  });

  it('should emit ability:used event when ability is used', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');

    expect(emitSpy).toHaveBeenCalledWith('ability:used', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'warrior_shield_bash',
      abilityName: 'Shield Bash',
      effectType: 'damage',
      targetType: 'boss',
    }));
  });

  it('should emit ability:cooldown_started event with correct duration', () => {
    const beforeTime = Date.now();
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    const afterTime = Date.now();

    expect(emitSpy).toHaveBeenCalledWith('ability:cooldown_started', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'warrior_shield_bash',
      durationMs: 15000, // Shield Bash cooldown
    }));

    const call = emitSpy.mock.calls.find((c: any) => c[0] === 'ability:cooldown_started');
    const payload = call?.[1] as any;
    expect(payload.expiresAt).toBeGreaterThanOrEqual(beforeTime + 15000);
    expect(payload.expiresAt).toBeLessThanOrEqual(afterTime + 15000);
  });

  it('should emit ability:effect_applied for damage abilities', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');

    expect(emitSpy).toHaveBeenCalledWith('ability:effect_applied', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'warrior_shield_bash',
      effectType: 'damage',
      targetIds: ['boss'],
      value: 80, // Shield Bash power
    }));
  });

  it('should emit ability:effect_applied for heal abilities', () => {
    abilityManager.useAbility('lobby-1', 'player-2', 'cleric_greater_heal');

    expect(emitSpy).toHaveBeenCalledWith('ability:effect_applied', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-2',
      abilityId: 'cleric_greater_heal',
      effectType: 'heal',
      value: 50, // Greater Heal power
    }));

    const call = emitSpy.mock.calls.find((c: any) => c[0] === 'ability:effect_applied');
    const payload = call?.[1] as any;
    expect(payload.targetIds).toContain('player-2'); // Should heal lowest HP (player-2 has 50hp)
  });

  it('should emit ability:effect_applied for buff abilities', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_berserker_rage');

    expect(emitSpy).toHaveBeenCalledWith('ability:effect_applied', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'warrior_berserker_rage',
      effectType: 'buff',
      targetIds: ['player-1'], // Self buff
      value: 50, // Berserker Rage power
    }));
  });

  it('should emit ability:effect_applied for shield abilities', () => {
    deps.getPlayerClass = vi.fn(() => 'paladin' as AvatarClass);
    const paladinManager = new AbilityManager(deps);
    const paladinEmitSpy = vi.spyOn(deps.eventBus, 'emit');

    paladinManager.useAbility('lobby-1', 'player-1', 'paladin_holy_shield');

    expect(paladinEmitSpy).toHaveBeenCalledWith('ability:effect_applied', expect.objectContaining({
      effectType: 'shield',
      targetIds: ['player-1'], // Self shield
      value: 40, // Holy Shield power
    }));
  });

  it('should emit ability:effect_applied for debuff abilities', () => {
    deps.getPlayerClass = vi.fn(() => 'oathbreaker' as AvatarClass);
    const oathManager = new AbilityManager(deps);
    const oathEmitSpy = vi.spyOn(deps.eventBus, 'emit');

    oathManager.useAbility('lobby-1', 'player-1', 'oathbreaker_aura_of_dread');

    expect(oathEmitSpy).toHaveBeenCalledWith('ability:effect_applied', expect.objectContaining({
      effectType: 'debuff',
      targetIds: ['boss'],
    }));
  });

  it('should emit buffType for warrior_berserker_rage (buff ability)', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_berserker_rage');

    const call = emitSpy.mock.calls.find((c: any) => c[0] === 'ability:effect_applied');
    const payload = call?.[1] as any;
    expect(payload).toBeDefined();
    expect(payload.buffType).toBe('damage_boost');
    expect(payload.durationMs).toBe(10000);
    expect(payload.debuffType).toBeUndefined();
  });

  it('should emit buffType undefined for paladin_holy_shield (shield ability)', () => {
    deps.getPlayerClass = vi.fn(() => 'paladin' as AvatarClass);
    const paladinManager = new AbilityManager(deps);
    const paladinEmitSpy = vi.spyOn(deps.eventBus, 'emit');

    paladinManager.useAbility('lobby-1', 'player-1', 'paladin_holy_shield');

    const call = paladinEmitSpy.mock.calls.find((c: any) => c[0] === 'ability:effect_applied');
    const payload = call?.[1] as any;
    expect(payload).toBeDefined();
    expect(payload.effectType).toBe('shield');
    expect(payload.buffType).toBeUndefined();
    expect(payload.debuffType).toBeUndefined();
    expect(payload.durationMs).toBeUndefined();
  });
});

describe('AbilityManager - Cooldown Reset', () => {
  let abilityManager: AbilityManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: AbilityManagerDeps;

  beforeEach(() => {
    eventBus = new ScopedEventBus();

    mockCombatState = {
      lobbyId: 'lobby-1',
      boss: { bossId: 'boss-1', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-1', { playerId: 'player-1', hp: 100, maxHp: 100, combatState: 'fighting' }],
      ]),
    };

    deps = {
      eventBus,
      combatManager: {
        getCombatState: vi.fn(() => mockCombatState as any),
        canUseClassAbility: vi.fn(() => true),
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass),
    };

    abilityManager = new AbilityManager(deps);
  });

  it('should reset all cooldowns for a lobby', () => {
    // Use multiple abilities
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_berserker_rage');

    // Both should be on cooldown
    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_shield_bash')).toBe(true);
    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_berserker_rage')).toBe(true);

    // Reset cooldowns
    abilityManager.resetCooldowns('lobby-1');

    // Both should be off cooldown now
    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_shield_bash')).toBe(false);
    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_berserker_rage')).toBe(false);
  });

  it('should only reset cooldowns for specified lobby', () => {
    const lobby2State = {
      lobbyId: 'lobby-2',
      boss: { bossId: 'boss-2', hp: 1000, maxHp: 1000 },
      players: new Map([
        ['player-2', { playerId: 'player-2', hp: 100, maxHp: 100, combatState: 'fighting' }],
      ]),
    };

    deps.combatManager.getCombatState = vi.fn((lobbyId) => {
      if (lobbyId === 'lobby-1') return mockCombatState as any;
      if (lobbyId === 'lobby-2') return lobby2State as any;
      return undefined;
    });

    // Use abilities in both lobbies
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    abilityManager.useAbility('lobby-2', 'player-2', 'warrior_shield_bash');

    // Reset lobby-1 only
    abilityManager.resetCooldowns('lobby-1');

    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_shield_bash')).toBe(false);
    expect(abilityManager.isOnCooldown('lobby-2', 'player-2', 'warrior_shield_bash')).toBe(true);
  });

  it('should cleanup all state for a lobby', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_shield_bash')).toBe(true);

    abilityManager.cleanupLobby('lobby-1');

    expect(abilityManager.isOnCooldown('lobby-1', 'player-1', 'warrior_shield_bash')).toBe(false);
  });

  it('should return all active cooldowns for a player', () => {
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_shield_bash');
    abilityManager.useAbility('lobby-1', 'player-1', 'warrior_berserker_rage');

    const cooldowns = abilityManager.getActiveCooldowns('lobby-1', 'player-1');

    expect(cooldowns).toHaveLength(2);
    expect(cooldowns.find(c => c.abilityId === 'warrior_shield_bash')).toBeDefined();
    expect(cooldowns.find(c => c.abilityId === 'warrior_berserker_rage')).toBeDefined();
  });
});
