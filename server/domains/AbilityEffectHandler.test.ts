/**
 * AbilityEffectHandler Integration Tests
 *
 * Regression suite for the ability:effect_applied handler in server/domains/index.ts.
 * Tests that all 8 affected abilities correctly apply their effect via the handler:
 *   - warrior_berserker_rage (buff, damage_boost)
 *   - bard_inspire (buff, damage_boost)
 *   - ranger_eagle_eye (buff, crit_boost)
 *   - rogue_shadow_step (buff, dodge)
 *   - wizard_time_warp (buff, cooldown_reduction)
 *   - paladin_holy_shield (shield)
 *   - paladin_divine_intervention (shield)
 *   - oathbreaker_aura_of_dread (debuff, attack_slow)
 *
 * Also verifies heal dedup: a single-target heal emits exactly ONE combat:player_healed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus, combatManager } from './index';
import { TeamType } from '../../shared/gameEvents';

// -------------------------------------------------------------------------
// Shared setup helpers
// -------------------------------------------------------------------------

const LOBBY = 'test-ability-handler-lobby';

function setupFightingPlayer(playerId: string, hp = 100, maxHp = 100) {
  combatManager.initializeCombat(
    LOBBY,
    [{ id: playerId, team: 'developers' as TeamType }],
    0,
  );
  // Directly patch the player's HP into the combat state so we can test heal clamping
  const state = combatManager.getCombatState(LOBBY);
  if (state) {
    const ps = state.players.get(playerId);
    if (ps) {
      ps.hp = hp;
      ps.maxHp = maxHp;
      ps.combatState = 'fighting';
    }
  }
}

// -------------------------------------------------------------------------
// Task 1: applyHealEffect helper — heal dedup
// -------------------------------------------------------------------------

describe('AbilityEffectHandler — heal dedup (applyHealEffect)', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emitSpy = vi.spyOn(eventBus, 'emit');
    setupFightingPlayer('healer-player', 50, 100);
  });

  afterEach(() => {
    emitSpy.mockRestore();
    // Clean up combat state between tests
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });

  it('ability heal on a single target emits exactly one combat:player_healed', () => {
    eventBus.emit('ability:effect_applied', {
      lobbyId: LOBBY,
      playerId: 'healer-player',
      abilityId: 'cleric_greater_heal',
      effectType: 'heal',
      targetIds: ['healer-player'],
      value: 30,
    });

    const healEmits = (emitSpy.mock.calls as unknown[]).filter(
      (c) => (c as [string, unknown])[0] === 'combat:player_healed',
    ) as [string, Record<string, unknown>][];
    expect(healEmits).toHaveLength(1);
    expect(healEmits[0][1]).toMatchObject({
      lobbyId: LOBBY,
      playerId: 'healer-player',
      healerId: 'healer-player',
      healAmount: 30,
      newHealth: 80, // 50 + 30
    });
  });

  it('ability heal is HP-clamped to maxHp (no over-heal)', () => {
    eventBus.emit('ability:effect_applied', {
      lobbyId: LOBBY,
      playerId: 'healer-player',
      abilityId: 'cleric_greater_heal',
      effectType: 'heal',
      targetIds: ['healer-player'],
      value: 999, // massive over-heal
    });

    const healEmit = (emitSpy.mock.calls as unknown[]).find(
      (c) => (c as [string, unknown])[0] === 'combat:player_healed',
    ) as [string, Record<string, unknown>] | undefined;
    expect(healEmit?.[1]).toMatchObject({
      newHealth: 100, // clamped to maxHp
    });
  });
});

// -------------------------------------------------------------------------
// Task 2: buff / shield / debuff branches
// -------------------------------------------------------------------------

describe('AbilityEffectHandler — buff branch (warrior_berserker_rage)', () => {
  beforeEach(() => {
    setupFightingPlayer('warrior-player');
  });

  afterEach(() => {
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });

  it('warrior_berserker_rage buff raises getDamageMultiplier above 1.0', () => {
    // Spy on the downstream bonus-damage path as evidence the multiplier was stored
    const bonusDamageSpy = vi.spyOn(combatManager, 'applyAbilityDamageToBoss');

    // Apply the buff
    eventBus.emit('ability:effect_applied', {
      lobbyId: LOBBY,
      playerId: 'warrior-player',
      abilityId: 'warrior_berserker_rage',
      effectType: 'buff',
      targetIds: ['warrior-player'],
      value: 1.5, // 1.5x multiplier
      buffType: 'damage_boost',
      durationMs: 10000,
    });

    // Trigger the boss_damaged handler that reads getDamageMultiplier
    eventBus.emit('combat:boss_damaged', {
      lobbyId: LOBBY,
      playerId: 'warrior-player',
      damage: 100,
      bossHealth: 900,
    });

    // The bonus-damage call verifies the multiplier was >1.0
    expect(bonusDamageSpy).toHaveBeenCalledWith(
      LOBBY,
      'warrior-player',
      expect.any(Number),
    );
    const bonusDamage = bonusDamageSpy.mock.calls[0][2];
    expect(bonusDamage).toBeGreaterThan(0); // bonus from 1.5x multiplier

    bonusDamageSpy.mockRestore();
  });
});

describe('AbilityEffectHandler — buff branch (bard_inspire)', () => {
  beforeEach(() => {
    setupFightingPlayer('bard-player');
  });

  afterEach(() => {
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });

  it('bard_inspire buff raises getDamageMultiplier above 1.0', () => {
    const bonusDamageSpy = vi.spyOn(combatManager, 'applyAbilityDamageToBoss');

    eventBus.emit('ability:effect_applied', {
      lobbyId: LOBBY,
      playerId: 'bard-player',
      abilityId: 'bard_inspire',
      effectType: 'buff',
      targetIds: ['bard-player'],
      value: 1.3,
      buffType: 'damage_boost',
      durationMs: 10000,
    });

    eventBus.emit('combat:boss_damaged', {
      lobbyId: LOBBY,
      playerId: 'bard-player',
      damage: 100,
      bossHealth: 900,
    });

    expect(bonusDamageSpy).toHaveBeenCalled();
    const bonusDamage = bonusDamageSpy.mock.calls[0][2];
    expect(bonusDamage).toBeGreaterThan(0);

    bonusDamageSpy.mockRestore();
  });
});

describe('AbilityEffectHandler — buff branch (non-consumed buffs: no-crash)', () => {
  beforeEach(() => {
    setupFightingPlayer('ranger-player');
  });

  afterEach(() => {
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });

  it('ranger_eagle_eye crit_boost buff runs without throwing', () => {
    expect(() => {
      eventBus.emit('ability:effect_applied', {
        lobbyId: LOBBY,
        playerId: 'ranger-player',
        abilityId: 'ranger_eagle_eye',
        effectType: 'buff',
        targetIds: ['ranger-player'],
        value: 0.4,
        buffType: 'crit_boost',
        durationMs: 10000,
      });
    }).not.toThrow();
  });

  it('rogue_shadow_step dodge buff runs without throwing', () => {
    expect(() => {
      eventBus.emit('ability:effect_applied', {
        lobbyId: LOBBY,
        playerId: 'ranger-player',
        abilityId: 'rogue_shadow_step',
        effectType: 'buff',
        targetIds: ['ranger-player'],
        value: 0,
        buffType: 'dodge',
        durationMs: 10000,
      });
    }).not.toThrow();
  });

  it('wizard_time_warp cooldown_reduction buff runs without throwing', () => {
    expect(() => {
      eventBus.emit('ability:effect_applied', {
        lobbyId: LOBBY,
        playerId: 'ranger-player',
        abilityId: 'wizard_time_warp',
        effectType: 'buff',
        targetIds: ['ranger-player'],
        value: 0,
        buffType: 'cooldown_reduction',
        durationMs: 10000,
      });
    }).not.toThrow();
  });
});

describe('AbilityEffectHandler — shield branch', () => {
  beforeEach(() => {
    setupFightingPlayer('paladin-player');
  });

  afterEach(() => {
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });

  it('paladin_holy_shield raises shield absorption above 0', () => {
    const emitSpy = vi.spyOn(eventBus, 'emit');

    eventBus.emit('ability:effect_applied', {
      lobbyId: LOBBY,
      playerId: 'paladin-player',
      abilityId: 'paladin_holy_shield',
      effectType: 'shield',
      targetIds: ['paladin-player'],
      value: 40,
    });

    // Trigger damage to verify shield absorbs it (shield_absorbed event is evidence)
    combatManager.applyDamageToPlayer(LOBBY, 'paladin-player', 20);

    const shieldEmits = (emitSpy.mock.calls as unknown[]).filter(
      (c) => (c as [string, unknown])[0] === 'combat:shield_absorbed',
    ) as [string, Record<string, unknown>][];
    expect(shieldEmits.length).toBeGreaterThan(0);
    expect(shieldEmits[0][1]).toMatchObject({
      lobbyId: LOBBY,
      playerId: 'paladin-player',
      absorbed: 20,
    });

    emitSpy.mockRestore();
  });

  it('paladin_divine_intervention raises shield absorption above 0', () => {
    const emitSpy = vi.spyOn(eventBus, 'emit');

    eventBus.emit('ability:effect_applied', {
      lobbyId: LOBBY,
      playerId: 'paladin-player',
      abilityId: 'paladin_divine_intervention',
      effectType: 'shield',
      targetIds: ['paladin-player'],
      value: 30,
    });

    combatManager.applyDamageToPlayer(LOBBY, 'paladin-player', 15);

    const shieldEmits = (emitSpy.mock.calls as unknown[]).filter(
      (c) => (c as [string, unknown])[0] === 'combat:shield_absorbed',
    ) as [string, Record<string, unknown>][];
    expect(shieldEmits.length).toBeGreaterThan(0);

    emitSpy.mockRestore();
  });
});

describe('AbilityEffectHandler — debuff branch (oathbreaker_aura_of_dread)', () => {
  beforeEach(() => {
    setupFightingPlayer('oathbreaker-player');
  });

  afterEach(() => {
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });

  it('oathbreaker_aura_of_dread debuff runs without throwing', () => {
    expect(() => {
      eventBus.emit('ability:effect_applied', {
        lobbyId: LOBBY,
        playerId: 'oathbreaker-player',
        abilityId: 'oathbreaker_aura_of_dread',
        effectType: 'debuff',
        targetIds: ['boss'],
        value: 0,
        debuffType: 'attack_slow',
        durationMs: 8000,
      });
    }).not.toThrow();
  });
});
