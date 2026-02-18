/**
 * ItemManager Tests
 *
 * TDD suite for server-authoritative item inventory and validation.
 * Tests inventory management, item use validation, effect emission, and cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ItemManager, ItemManagerDeps } from './ItemManager';
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

describe('ItemManager - Inventory Management', () => {
  let itemManager: ItemManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: ItemManagerDeps;

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
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass),
    };

    itemManager = new ItemManager(deps);
  });

  it('should add item to empty inventory', () => {
    const result = itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');

    expect(result.awarded).toBe(true);
    expect(result.itemType).toBe('heal_potion');

    const inventory = itemManager.getInventory('lobby-1', 'player-1');
    expect(inventory.get('heal_potion')).toBe(1);
  });

  it('should increment existing item count', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');

    const inventory = itemManager.getInventory('lobby-1', 'player-1');
    expect(inventory.get('heal_potion')).toBe(2);
  });

  it('should respect MAX_ITEMS_PER_TYPE', () => {
    // Award 5 items (max)
    for (let i = 0; i < 5; i++) {
      const result = itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
      expect(result.awarded).toBe(true);
    }

    // 6th item should fail
    const result = itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    expect(result.awarded).toBe(false);

    const inventory = itemManager.getInventory('lobby-1', 'player-1');
    expect(inventory.get('heal_potion')).toBe(5);
  });

  it('should select random item type when none specified', () => {
    const result = itemManager.awardItem('lobby-1', 'player-1');

    expect(result.awarded).toBe(true);
    expect(['heal_potion', 'damage_boost', 'shield']).toContain(result.itemType);

    const inventory = itemManager.getInventory('lobby-1', 'player-1');
    expect(inventory.get(result.itemType)).toBe(1);
  });

  it('should return empty map for unknown player', () => {
    const inventory = itemManager.getInventory('lobby-1', 'unknown-player');

    expect(inventory).toBeInstanceOf(Map);
    expect(inventory.size).toBe(0);
  });
});

describe('ItemManager - Item Use Validation', () => {
  let itemManager: ItemManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: ItemManagerDeps;

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
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass),
    };

    itemManager = new ItemManager(deps);
  });

  it('should succeed when player has item and is fighting', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');

    const result = itemManager.useItem('lobby-1', 'player-1', 'heal_potion');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail when item not in inventory', () => {
    const result = itemManager.useItem('lobby-1', 'player-1', 'heal_potion');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in inventory');
  });

  it('should fail when combat not active', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    deps.combatManager.getCombatState = vi.fn(() => undefined);

    const result = itemManager.useItem('lobby-1', 'player-1', 'heal_potion');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });

  it('should fail when player not fighting (downed)', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    mockCombatState.players.get('player-1')!.combatState = 'downed';

    const result = itemManager.useItem('lobby-1', 'player-1', 'heal_potion');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in combat');
  });

  it('should decrement count and remove at 0', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');

    // Use first item
    itemManager.useItem('lobby-1', 'player-1', 'heal_potion');
    let inventory = itemManager.getInventory('lobby-1', 'player-1');
    expect(inventory.get('heal_potion')).toBe(1);

    // Use second item
    itemManager.useItem('lobby-1', 'player-1', 'heal_potion');
    inventory = itemManager.getInventory('lobby-1', 'player-1');
    expect(inventory.get('heal_potion')).toBeUndefined();
  });
});

describe('ItemManager - Effect Application', () => {
  let itemManager: ItemManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: ItemManagerDeps;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    emitSpy = vi.spyOn(eventBus, 'emit');

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
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass),
    };

    itemManager = new ItemManager(deps);
  });

  it('should emit item:used event', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.useItem('lobby-1', 'player-1', 'heal_potion');

    expect(emitSpy).toHaveBeenCalledWith('item:used', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      itemType: 'heal_potion',
      remainingCount: 0,
    }));
  });

  it('should emit item:effect_applied for heal_potion with correct payload', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.useItem('lobby-1', 'player-1', 'heal_potion');

    expect(emitSpy).toHaveBeenCalledWith('item:effect_applied', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      itemType: 'heal_potion',
      effectType: 'heal',
      value: 30,
      durationMs: null,
      targetIds: ['player-1'],
    }));
  });

  it('should emit item:effect_applied for damage_boost with durationMs', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'damage_boost');
    itemManager.useItem('lobby-1', 'player-1', 'damage_boost');

    expect(emitSpy).toHaveBeenCalledWith('item:effect_applied', expect.objectContaining({
      lobbyId: 'lobby-1',
      playerId: 'player-1',
      itemType: 'damage_boost',
      effectType: 'buff',
      value: 1.5,
      durationMs: 10000,
      targetIds: ['player-1'],
    }));
  });
});

describe('ItemManager - Cleanup', () => {
  let itemManager: ItemManager;
  let eventBus: ScopedEventBus;
  let mockCombatState: MockCombatState;
  let deps: ItemManagerDeps;

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
      },
      getPlayerClass: vi.fn(() => 'warrior' as AvatarClass),
    };

    itemManager = new ItemManager(deps);
  });

  it('should remove all inventories for lobby', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.awardItem('lobby-1', 'player-2', 'damage_boost');

    itemManager.cleanupLobby('lobby-1');

    const inventory1 = itemManager.getInventory('lobby-1', 'player-1');
    const inventory2 = itemManager.getInventory('lobby-1', 'player-2');
    expect(inventory1.size).toBe(0);
    expect(inventory2.size).toBe(0);
  });

  it('should not affect other lobbies', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.awardItem('lobby-2', 'player-2', 'damage_boost');

    itemManager.cleanupLobby('lobby-1');

    const inventory1 = itemManager.getInventory('lobby-1', 'player-1');
    const inventory2 = itemManager.getInventory('lobby-2', 'player-2');
    expect(inventory1.size).toBe(0);
    expect(inventory2.get('damage_boost')).toBe(1);
  });

  it('should clear player inventories within lobby', () => {
    itemManager.awardItem('lobby-1', 'player-1', 'heal_potion');
    itemManager.awardItem('lobby-1', 'player-2', 'shield');

    itemManager.resetInventories('lobby-1');

    const inventory1 = itemManager.getInventory('lobby-1', 'player-1');
    const inventory2 = itemManager.getInventory('lobby-1', 'player-2');
    expect(inventory1.size).toBe(0);
    expect(inventory2.size).toBe(0);
  });
});
