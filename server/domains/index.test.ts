/**
 * wireDomains factory unit tests (MAINT-03a)
 *
 * Verifies that wireDomains(ctx).dispose() removes all 9 event listeners
 * registered on the provided ScopedEventBus.
 *
 * Key design choices:
 * - Each test gets a FRESH new ScopedEventBus() (not the module-level singleton)
 *   so listener counts don't accumulate and trigger MaxListenersExceededWarning.
 * - dispose() is called in afterEach as a safety net even if the test itself
 *   already called it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { wireDomains } from './index';
import { ScopedEventBus } from '../events';

// Minimal mocks for WireDomainsContext dependencies — only the methods called
// by the 9 listener bodies are needed.
function makeMockDeps(testBus: ScopedEventBus) {
  return {
    eventBus: testBus,
    abilityManager: {
      resetCooldowns: vi.fn(),
      cleanupLobby: vi.fn(),
    } as unknown as import('./AbilityManager').AbilityManager,
    comboManager: {
      resetCombos: vi.fn(),
      cleanupLobby: vi.fn(),
    } as unknown as import('./ComboManager').ComboManager,
    itemManager: {
      cleanupLobby: vi.fn(),
      awardItem: vi.fn(),
    } as unknown as import('./ItemManager').ItemManager,
    combatManager: {
      applyAbilityDamageToBoss: vi.fn(),
      getBossAI: vi.fn(() => null),
      getCombatState: vi.fn(() => null),
    } as unknown as import('./CombatManager').CombatManager,
    statsTracker: {
      cleanupLobby: vi.fn(),
    } as unknown as import('./StatsTracker').StatsTracker,
    sessionManager: {
      getLobby: vi.fn(() => null),
    } as unknown as import('./SessionManager').SessionManager,
  };
}

describe('wireDomains — dispose removes all 9 listeners', () => {
  let testBus: ScopedEventBus;
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('registers listeners for each of the 9 events', () => {
    testBus = new ScopedEventBus();
    const handle = wireDomains(makeMockDeps(testBus));
    dispose = handle.dispose;

    // combat:battle_initialized has 2 listeners (ability + combo reset)
    expect(testBus.listenerCount('combat:battle_initialized')).toBe(2);
    // session:lobby_destroyed has 3 listeners (ability + combo + items cleanup)
    expect(testBus.listenerCount('session:lobby_destroyed')).toBe(3);
    // The remaining 4 events have 1 listener each
    expect(testBus.listenerCount('estimation:discussion_ended')).toBe(1);
    expect(testBus.listenerCount('item:effect_applied')).toBe(1);
    expect(testBus.listenerCount('combat:boss_damaged')).toBe(1);
    expect(testBus.listenerCount('ability:effect_applied')).toBe(1);
  });

  it('dispose() removes all registered listeners (listener count returns to 0)', () => {
    testBus = new ScopedEventBus();
    const handle = wireDomains(makeMockDeps(testBus));
    dispose = handle.dispose;

    // Sanity: listeners are registered before dispose
    expect(testBus.listenerCount('combat:battle_initialized')).toBeGreaterThan(0);
    expect(testBus.listenerCount('session:lobby_destroyed')).toBeGreaterThan(0);

    handle.dispose();
    dispose = undefined; // prevent double-call in afterEach

    // All 9 listener slots should be empty after dispose
    expect(testBus.listenerCount('combat:battle_initialized')).toBe(0);
    expect(testBus.listenerCount('session:lobby_destroyed')).toBe(0);
    expect(testBus.listenerCount('estimation:discussion_ended')).toBe(0);
    expect(testBus.listenerCount('item:effect_applied')).toBe(0);
    expect(testBus.listenerCount('combat:boss_damaged')).toBe(0);
    expect(testBus.listenerCount('ability:effect_applied')).toBe(0);
  });

  it('calling wireDomains multiple times with fresh buses does not accumulate listeners', () => {
    // Each test should be safe to call wireDomains independently — fresh bus
    // means the module-level production wiring is completely isolated.
    const bus1 = new ScopedEventBus();
    const bus2 = new ScopedEventBus();
    const handle1 = wireDomains(makeMockDeps(bus1));
    const handle2 = wireDomains(makeMockDeps(bus2));

    expect(bus1.listenerCount('combat:battle_initialized')).toBe(2);
    expect(bus2.listenerCount('combat:battle_initialized')).toBe(2);

    handle1.dispose();
    handle2.dispose();

    expect(bus1.listenerCount('combat:battle_initialized')).toBe(0);
    expect(bus2.listenerCount('combat:battle_initialized')).toBe(0);
  });
});
