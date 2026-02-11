/**
 * Item System Type Definitions
 *
 * Defines types and constants for session-scoped combat consumables.
 * Items are temporary inventory that exists only during a game session.
 */

/**
 * Available item types in the game
 */
export type ItemType = 'heal_potion' | 'damage_boost' | 'shield';

/**
 * Item definition with effect mechanics
 */
export interface ItemDefinition {
  id: ItemType;
  name: string;
  description: string;
  effectType: 'heal' | 'buff' | 'shield';
  power: number;
  durationMs: number | null;
}

/**
 * Complete item configurations for all 3 items
 */
export const ITEM_DEFINITIONS: Record<ItemType, ItemDefinition> = {
  heal_potion: {
    id: 'heal_potion',
    name: 'Heal Potion',
    description: 'Instantly restores 30 HP',
    effectType: 'heal',
    power: 30,
    durationMs: null, // Instant effect
  },
  damage_boost: {
    id: 'damage_boost',
    name: 'Damage Boost',
    description: 'Increases damage by 50% for 10 seconds',
    effectType: 'buff',
    power: 1.5, // 1.5x multiplier
    durationMs: 10000, // 10 seconds
  },
  shield: {
    id: 'shield',
    name: 'Shield Charm',
    description: 'Absorbs 50 damage for 15 seconds',
    effectType: 'shield',
    power: 50, // Damage absorbed
    durationMs: 15000, // 15 seconds
  },
};

/**
 * Player item inventory (tracks count per item type)
 */
export type ItemInventory = Map<ItemType, number>;

/**
 * Maximum items of each type a player can hold
 */
export const MAX_ITEMS_PER_TYPE = 5;

// =============================================================================
// Event Payload Interfaces
// =============================================================================

/**
 * Emitted when a player is awarded an item
 */
export interface ItemAwardedPayload {
  lobbyId: string;
  playerId: string;
  itemType: ItemType;
  newCount: number;
}

/**
 * Emitted when a player uses an item
 */
export interface ItemUsedPayload {
  lobbyId: string;
  playerId: string;
  itemType: ItemType;
  remainingCount: number;
}

/**
 * Emitted when an item effect is applied
 */
export interface ItemEffectAppliedPayload {
  lobbyId: string;
  playerId: string;
  itemType: ItemType;
  effectType: string;
  value: number;
  durationMs: number | null;
  targetIds: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get item definition by type
 */
export function getItemDefinition(itemType: ItemType): ItemDefinition {
  return ITEM_DEFINITIONS[itemType];
}

/**
 * Select a random item type
 */
export function selectRandomItemType(): ItemType {
  const types: ItemType[] = ['heal_potion', 'damage_boost', 'shield'];
  return types[Math.floor(Math.random() * types.length)];
}
