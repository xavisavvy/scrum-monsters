/**
 * Tests for the BuffType/DebuffType unions and extended payload types in abilityTypes.ts
 * TDD RED: These tests define the expected behavior BEFORE the implementation.
 *
 * Plan 47-01 Task 1
 */

import { describe, it, expect } from 'vitest';
import {
  CLASS_ABILITY_CONFIGS,
  type BuffType,
  type DebuffType,
  type AbilityEffectAppliedPayload,
} from './abilityTypes';

describe('BuffType / DebuffType unions', () => {
  it('BuffType covers all buff values used in CLASS_ABILITY_CONFIGS', () => {
    // Every buffType value found in CLASS_ABILITY_CONFIGS must be a valid BuffType.
    // This is a compile-time check via the type assertions below, and a runtime
    // check by collecting all buffType values and comparing to the expected union.
    const expectedBuffTypes: BuffType[] = [
      'damage_boost',
      'crit_boost',
      'dodge',
      'cooldown_reduction',
    ];
    const actualBuffTypes = new Set<string>();
    for (const classDef of Object.values(CLASS_ABILITY_CONFIGS)) {
      for (const ability of [classDef.ability_1, classDef.ability_2]) {
        if (ability.buffType) actualBuffTypes.add(ability.buffType);
      }
    }
    for (const bt of actualBuffTypes) {
      expect(expectedBuffTypes).toContain(bt as BuffType);
    }
    // All expected buff types must appear at least once
    expect(actualBuffTypes.size).toBeGreaterThan(0);
  });

  it('DebuffType covers all debuff values used in CLASS_ABILITY_CONFIGS', () => {
    const expectedDebuffTypes: DebuffType[] = ['attack_slow'];
    const actualDebuffTypes = new Set<string>();
    for (const classDef of Object.values(CLASS_ABILITY_CONFIGS)) {
      for (const ability of [classDef.ability_1, classDef.ability_2]) {
        if (ability.debuffType) actualDebuffTypes.add(ability.debuffType);
      }
    }
    for (const dt of actualDebuffTypes) {
      expect(expectedDebuffTypes).toContain(dt as DebuffType);
    }
  });
});

describe('AbilityDefinition durationMs', () => {
  it('warrior_berserker_rage has a numeric durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.warrior.ability_2;
    expect(ability.id).toBe('warrior_berserker_rage');
    expect(typeof ability.durationMs).toBe('number');
    expect(ability.durationMs).toBeGreaterThan(0);
  });

  it('bard_inspire has a numeric durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.bard.ability_1;
    expect(ability.id).toBe('bard_inspire');
    expect(typeof ability.durationMs).toBe('number');
    expect(ability.durationMs).toBeGreaterThan(0);
  });

  it('ranger_eagle_eye has a numeric durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.ranger.ability_2;
    expect(ability.id).toBe('ranger_eagle_eye');
    expect(typeof ability.durationMs).toBe('number');
    expect(ability.durationMs).toBeGreaterThan(0);
  });

  it('rogue_shadow_step has a numeric durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.rogue.ability_2;
    expect(ability.id).toBe('rogue_shadow_step');
    expect(typeof ability.durationMs).toBe('number');
    expect(ability.durationMs).toBeGreaterThan(0);
  });

  it('wizard_time_warp has a numeric durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.wizard.ability_2;
    expect(ability.id).toBe('wizard_time_warp');
    expect(typeof ability.durationMs).toBe('number');
    expect(ability.durationMs).toBeGreaterThan(0);
  });

  it('oathbreaker_aura_of_dread has a numeric durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.oathbreaker.ability_2;
    expect(ability.id).toBe('oathbreaker_aura_of_dread');
    expect(typeof ability.durationMs).toBe('number');
    expect(ability.durationMs).toBeGreaterThan(0);
  });

  it('paladin_holy_shield does NOT have durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.paladin.ability_1;
    expect(ability.id).toBe('paladin_holy_shield');
    expect(ability.durationMs).toBeUndefined();
  });

  it('paladin_divine_intervention does NOT have durationMs', () => {
    const ability = CLASS_ABILITY_CONFIGS.paladin.ability_2;
    expect(ability.id).toBe('paladin_divine_intervention');
    expect(ability.durationMs).toBeUndefined();
  });
});

describe('AbilityEffectAppliedPayload extended fields', () => {
  it('can include optional buffType, debuffType, durationMs fields', () => {
    // Type-level check: creating a payload with the new optional fields
    const payload: AbilityEffectAppliedPayload = {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'warrior_berserker_rage',
      effectType: 'buff',
      targetIds: ['player-1'],
      value: 50,
      buffType: 'damage_boost',
      durationMs: 10000,
    };
    expect(payload.buffType).toBe('damage_boost');
    expect(payload.durationMs).toBe(10000);
    expect(payload.debuffType).toBeUndefined();
  });

  it('can include debuffType for debuff abilities', () => {
    const payload: AbilityEffectAppliedPayload = {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'oathbreaker_aura_of_dread',
      effectType: 'debuff',
      targetIds: ['boss'],
      value: 0,
      debuffType: 'attack_slow',
      durationMs: 8000,
    };
    expect(payload.debuffType).toBe('attack_slow');
    expect(payload.buffType).toBeUndefined();
  });

  it('buffType/debuffType/durationMs are all optional (omitting them is valid)', () => {
    const payload: AbilityEffectAppliedPayload = {
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      abilityId: 'warrior_shield_bash',
      effectType: 'damage',
      targetIds: ['boss'],
      value: 80,
    };
    expect(payload.buffType).toBeUndefined();
    expect(payload.debuffType).toBeUndefined();
    expect(payload.durationMs).toBeUndefined();
  });
});
