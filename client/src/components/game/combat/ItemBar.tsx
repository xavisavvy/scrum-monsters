import React from 'react';
import { useItemStore, getItemDisplayInfo } from '@/lib/stores/useItemStore';
import { ItemType } from '@shared/itemTypes';

/**
 * ItemBar - Shows 3 item buttons horizontally for combat item usage
 *
 * Features:
 * - Shows item count for each type
 * - Disabled when count is 0 or item is pending
 * - Colored borders matching item type (green/red/blue)
 * - Tooltip with item name and description
 * - Optimistic UI with pending state animation
 */
export function ItemBar() {
  const { inventory, pendingItem, useItem } = useItemStore();
  const items: ItemType[] = ['heal_potion', 'damage_boost', 'shield'];

  return (
    <div className="flex gap-2 items-center">
      {items.map(itemType => {
        const count = inventory.get(itemType) ?? 0;
        const info = getItemDisplayInfo(itemType);
        const isPending = pendingItem === itemType;
        const disabled = count === 0 || isPending;

        return (
          <button
            key={itemType}
            // eslint-disable-next-line react-hooks/rules-of-hooks -- useItem is a Zustand store action, not a React hook
            onClick={() => !disabled && useItem(itemType)}
            disabled={disabled}
            className={`
              relative flex flex-col items-center justify-center
              w-14 h-14 rounded-lg border-2
              ${disabled
                ? 'opacity-40 border-gray-600 bg-gray-800 cursor-not-allowed'
                : `border-${info.borderColor} bg-gray-900 hover:bg-gray-800 cursor-pointer transition-all duration-150`
              }
              ${isPending ? 'animate-pulse' : ''}
            `}
            title={`${info.name}: ${info.description}`}
          >
            <span className="text-lg">{info.icon}</span>
            <span className={`text-xs font-bold ${count > 0 ? info.color : 'text-gray-500'}`}>
              x{count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
