import { create } from 'zustand';
import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useGameState } from './useGameState';
import { ItemType, ITEM_DEFINITIONS } from '@shared/itemTypes';

/**
 * Item display information for UI rendering
 */
interface ItemDisplayInfo {
  name: string;
  icon: string;
  color: string;
  borderColor: string;
  description: string;
}

/**
 * Item store state
 */
interface ItemStoreState {
  inventory: Map<ItemType, number>; // Current player's items
  pendingItem: string | null; // Optimistic UI to prevent spam

  // Actions
  handleItemAwarded: (data: { playerId: string; itemType: string; newCount: number; seq: number; timestamp: number }) => void;
  handleItemUsed: (data: { playerId: string; itemType: string; remainingCount: number; seq: number; timestamp: number }) => void;
  handleItemEffectApplied: (data: { playerId: string; itemType: string; effectType: string; value: number; seq: number; timestamp: number }) => void;
  useItem: (itemType: ItemType) => void;
  resetInventory: () => void;
}

/**
 * Get display information for an item type
 */
export function getItemDisplayInfo(itemType: ItemType): ItemDisplayInfo {
  const def = ITEM_DEFINITIONS[itemType];

  const displayInfo: Record<ItemType, Omit<ItemDisplayInfo, 'name' | 'description'>> = {
    heal_potion: {
      icon: '💚', // Green heart
      color: 'text-green-400',
      borderColor: 'green-500',
    },
    damage_boost: {
      icon: '⚔️', // Sword
      color: 'text-red-400',
      borderColor: 'red-500',
    },
    shield: {
      icon: '🛡️', // Shield
      color: 'text-blue-400',
      borderColor: 'blue-500',
    },
  };

  return {
    name: def.name,
    description: def.description,
    ...displayInfo[itemType],
  };
}

/**
 * Zustand store for player item inventory
 */
export const useItemStore = create<ItemStoreState>((set, get) => ({
  // Initial state
  inventory: new Map(),
  pendingItem: null,

  // Actions
  handleItemAwarded: (data) => {
    const { playerId, itemType, newCount } = data;
    const currentPlayer = useGameState.getState().currentPlayer;

    if (currentPlayer && playerId === currentPlayer.id) {
      const newInventory = new Map(get().inventory);
      newInventory.set(itemType as ItemType, newCount);
      set({ inventory: newInventory });
    }
  },

  handleItemUsed: (data) => {
    const { playerId, itemType, remainingCount } = data;
    const currentPlayer = useGameState.getState().currentPlayer;

    if (currentPlayer && playerId === currentPlayer.id) {
      const newInventory = new Map(get().inventory);
      if (remainingCount === 0) {
        newInventory.delete(itemType as ItemType);
      } else {
        newInventory.set(itemType as ItemType, remainingCount);
      }
      set({ inventory: newInventory, pendingItem: null });
    }
  },

  handleItemEffectApplied: (data) => {
    // Optional: trigger visual feedback based on effectType
    // For now, just clear pending state when effect lands
    const currentPlayer = useGameState.getState().currentPlayer;
    if (currentPlayer && data.playerId === currentPlayer.id) {
      set({ pendingItem: null });
    }
  },

  useItem: (itemType: ItemType) => {
    const socket = useWebSocket.getState().socket;
    if (!socket) return;

    const count = get().inventory.get(itemType) ?? 0;
    if (count === 0) return;
    if (get().pendingItem) return; // Already using an item

    // Set pending for optimistic UI
    set({ pendingItem: itemType });

    // Emit to server
    socket.emit('use_item', { itemType });
  },

  resetInventory: () => {
    set({ inventory: new Map(), pendingItem: null });
  },
}));

/**
 * Hook to sync item events from server
 * Should be called once in BattlePhase or similar component
 */
export function useItemSync() {
  const socket = useWebSocket(state => state.socket);
  const { handleItemAwarded, handleItemUsed, handleItemEffectApplied } = useItemStore();

  useEffect(() => {
    if (!socket) return;

    // Listen for item events
    socket.on('item:awarded', handleItemAwarded);
    socket.on('item:used', handleItemUsed);
    socket.on('item:effect_applied', handleItemEffectApplied);

    return () => {
      socket.off('item:awarded', handleItemAwarded);
      socket.off('item:used', handleItemUsed);
      socket.off('item:effect_applied', handleItemEffectApplied);
    };
  }, [socket, handleItemAwarded, handleItemUsed, handleItemEffectApplied]);
}
