/**
 * ItemManager Domain
 *
 * Manages server-authoritative item inventory and validation.
 * Session-scoped: items exist only during a game session and are cleared on lobby cleanup.
 *
 * Responsibilities:
 * - Track item inventory per player per lobby
 * - Award items with stack limit enforcement
 * - Validate item use (inventory, combat state, player state)
 * - Apply item effects via event emission
 * - Reset and cleanup inventories
 */

import { ScopedEventBus } from '../events';
import type { LobbyCombatState } from './CombatManager';
import { AvatarClass } from '../../shared/gameEvents';
import {
  ItemType,
  ITEM_DEFINITIONS,
  MAX_ITEMS_PER_TYPE,
  selectRandomItemType,
} from '../../shared/itemTypes';

/**
 * Dependencies required by ItemManager
 */
export interface ItemManagerDeps {
  eventBus: ScopedEventBus;
  combatManager: {
    getCombatState: (lobbyId: string) => LobbyCombatState | undefined;
  };
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
}

/**
 * ItemManager manages session-scoped item inventory
 */
export class ItemManager {
  // State: Map<lobbyId, Map<playerId, Map<ItemType, number>>>
  private inventories = new Map<string, Map<string, Map<ItemType, number>>>();

  private readonly eventBus: ScopedEventBus;
  private readonly deps: ItemManagerDeps;

  constructor(deps: ItemManagerDeps) {
    this.deps = deps;
    this.eventBus = deps.eventBus;
  }

  /**
   * Award an item to a player
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param itemType Item type to award (if omitted, random)
   * @returns Result with awarded flag and itemType
   */
  public awardItem(
    lobbyId: string,
    playerId: string,
    itemType?: ItemType
  ): { awarded: boolean; itemType: ItemType } {
    const selectedType = itemType || selectRandomItemType();

    // Get or create player inventory
    const playerInventory = this.getOrCreateInventory(lobbyId, playerId);
    const currentCount = playerInventory.get(selectedType) || 0;

    // Check stack limit
    if (currentCount >= MAX_ITEMS_PER_TYPE) {
      return { awarded: false, itemType: selectedType };
    }

    // Increment count
    const newCount = currentCount + 1;
    playerInventory.set(selectedType, newCount);

    // Emit event
    this.eventBus.emit('item:awarded', {
      lobbyId,
      playerId,
      itemType: selectedType,
      newCount,
    });

    return { awarded: true, itemType: selectedType };
  }

  /**
   * Player attempts to use an item
   * Validates: inventory, combat state, player state
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param itemType Item type to use
   * @returns Result with success flag and optional error message
   */
  public useItem(
    lobbyId: string,
    playerId: string,
    itemType: ItemType
  ): { success: boolean; error?: string } {
    // 1. Validate inventory has item
    const playerInventory = this.getOrCreateInventory(lobbyId, playerId);
    const currentCount = playerInventory.get(itemType) || 0;
    if (currentCount === 0) {
      return { success: false, error: 'Item not in inventory' };
    }

    // 2. Validate combat state exists
    const combatState = this.deps.combatManager.getCombatState(lobbyId);
    if (!combatState) {
      return { success: false, error: 'Combat not active' };
    }

    // 3. Validate player is fighting
    const playerState = combatState.players.get(playerId);
    if (!playerState || playerState.combatState !== 'fighting') {
      return { success: false, error: 'Player not in combat' };
    }

    // 4. Decrement item count
    const newCount = currentCount - 1;
    if (newCount === 0) {
      playerInventory.delete(itemType);
    } else {
      playerInventory.set(itemType, newCount);
    }

    // 5. Emit item:used event
    this.eventBus.emit('item:used', {
      lobbyId,
      playerId,
      itemType,
      remainingCount: newCount,
    });

    // 6. Apply item effect
    this.applyItemEffect(lobbyId, playerId, itemType);

    return { success: true };
  }

  /**
   * Get player's inventory (returns copy)
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @returns Copy of player's item inventory
   */
  public getInventory(lobbyId: string, playerId: string): Map<ItemType, number> {
    const lobbyInventories = this.inventories.get(lobbyId);
    if (!lobbyInventories) {
      return new Map();
    }

    const playerInventory = lobbyInventories.get(playerId);
    if (!playerInventory) {
      return new Map();
    }

    // Return copy to prevent external modification
    return new Map(playerInventory);
  }

  /**
   * Cleanup all state for a lobby
   */
  public cleanupLobby(lobbyId: string): void {
    this.inventories.delete(lobbyId);
  }

  /**
   * Reset all inventories for players in a lobby
   */
  public resetInventories(lobbyId: string): void {
    const lobbyInventories = this.inventories.get(lobbyId);
    if (!lobbyInventories) return;

    lobbyInventories.forEach((playerInventory) => {
      playerInventory.clear();
    });
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Get or create inventory for a player
   */
  private getOrCreateInventory(lobbyId: string, playerId: string): Map<ItemType, number> {
    if (!this.inventories.has(lobbyId)) {
      this.inventories.set(lobbyId, new Map());
    }
    const lobbyInventories = this.inventories.get(lobbyId)!;

    if (!lobbyInventories.has(playerId)) {
      lobbyInventories.set(playerId, new Map());
    }

    return lobbyInventories.get(playerId)!;
  }

  /**
   * Apply item effect based on item definition
   * Emits item:effect_applied event
   */
  private applyItemEffect(lobbyId: string, playerId: string, itemType: ItemType): void {
    const itemDef = ITEM_DEFINITIONS[itemType];

    // Determine target IDs (all items target self for now)
    const targetIds = [playerId];

    // Emit effect_applied event
    this.eventBus.emit('item:effect_applied', {
      lobbyId,
      playerId,
      itemType,
      effectType: itemDef.effectType,
      value: itemDef.power,
      durationMs: itemDef.durationMs,
      targetIds,
    });
  }
}
