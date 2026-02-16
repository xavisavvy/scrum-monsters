---
phase: 20-combat-items-lifetime-stats
plan: 01
subsystem: combat
tags: [items, tdd, domain, server-auth]
dependency-graph:
  requires: [events, combat-state]
  provides: [item-inventory, item-validation, item-effects]
  affects: [combat-manager]
tech-stack:
  added: [ItemManager, itemTypes]
  patterns: [tdd-red-green, event-emission, session-scoped-state]
key-files:
  created:
    - shared/itemTypes.ts
    - server/domains/ItemManager.ts
    - server/domains/ItemManager.test.ts
  modified:
    - server/events/eventTypes.ts
    - server/events/index.ts
decisions:
  - Session-scoped items (exist only during game session, cleared on lobby cleanup)
  - MAX_ITEMS_PER_TYPE = 5 for stack limit enforcement
  - Server-authoritative validation (inventory, combat state, player state)
  - Event-driven effect application (item:effect_applied, no direct CombatManager calls)
  - All items currently target self (extensible for future party/boss targeting)
metrics:
  duration: 231s
  completed: 2026-02-11T21:24:00Z
  tasks: 2
  tests: 16
  files: 5
---

# Phase 20 Plan 01: Item System Foundation Summary

**One-liner:** Server-authoritative item inventory with TDD validation for session-scoped combat consumables (heal potion, damage boost, shield)

## Overview

Established the foundation for the item system with shared type definitions and server-side ItemManager domain following TDD methodology. Items are session-scoped consumables that provide temporary combat advantages (instant heal, damage buff, damage absorption).

## Implementation Details

### Shared Types (shared/itemTypes.ts)
- **ItemType union:** `'heal_potion' | 'damage_boost' | 'shield'`
- **ItemDefinition interface:** id, name, description, effectType, power, durationMs
- **ITEM_DEFINITIONS constant:** Complete definitions for all 3 items
  - heal_potion: instant 30 HP heal (durationMs: null)
  - damage_boost: 1.5x damage multiplier for 10 seconds
  - shield: 50 damage absorption for 15 seconds
- **ItemInventory type:** `Map<ItemType, number>` for count tracking
- **MAX_ITEMS_PER_TYPE constant:** 5 (stack limit)
- **Helper functions:** getItemDefinition(), selectRandomItemType()
- **Event payloads:** ItemAwardedPayload, ItemUsedPayload, ItemEffectAppliedPayload

### ItemManager Domain (server/domains/ItemManager.ts)
**State structure:** `Map<lobbyId, Map<playerId, Map<ItemType, number>>>`

**Public API:**
- `awardItem(lobbyId, playerId, itemType?)`: Awards item with stack limit check, emits item:awarded
- `useItem(lobbyId, playerId, itemType)`: Validates and consumes item, emits item:used and item:effect_applied
- `getInventory(lobbyId, playerId)`: Returns copy of player inventory
- `cleanupLobby(lobbyId)`: Removes all inventories for lobby
- `resetInventories(lobbyId)`: Clears player inventories within lobby

**Validation chain (useItem):**
1. Inventory check (count > 0)
2. Combat state active check
3. Player fighting state check (not downed/ghost)
4. Decrement count (remove key at 0)
5. Emit item:used
6. Apply effect (emit item:effect_applied)

**Effect application (private applyItemEffect):**
- Looks up ITEM_DEFINITIONS for item metadata
- Currently all items target self (targetIds = [playerId])
- Emits item:effect_applied with effectType, value, durationMs, targetIds

### Event Registration
**DomainEventMap additions:**
- `'item:awarded': ItemAwardedPayload`
- `'item:used': ItemUsedPayload`
- `'item:effect_applied': ItemEffectAppliedPayload`

Re-exported from server/events/index.ts for consumer access.

### TDD Test Suite (16 tests)
**Inventory Management (5 tests):**
- Add item to empty inventory
- Increment existing item count
- Enforce MAX_ITEMS_PER_TYPE stack limit
- Random item selection when type not specified
- Empty map for unknown player

**Item Use Validation (5 tests):**
- Success when player has item and is fighting
- Fail when item not in inventory
- Fail when combat not active
- Fail when player not fighting (downed state)
- Decrement count and remove key at 0

**Effect Application (3 tests):**
- Emit item:used event with correct payload
- Emit item:effect_applied for heal_potion (instant, durationMs: null)
- Emit item:effect_applied for damage_boost (with durationMs: 10000)

**Cleanup (3 tests):**
- cleanupLobby removes all inventories for lobby
- cleanupLobby doesn't affect other lobbies
- resetInventories clears player inventories within lobby

## Deviations from Plan

None - plan executed exactly as written. TDD RED-GREEN cycle followed correctly.

## Technical Decisions

**Session-scoped design:** Items are temporary inventory that exist only during active game session. When lobby is destroyed (cleanupLobby), all items are cleared. This prevents item accumulation across sessions and ensures fresh start for each game.

**Stack limit rationale:** MAX_ITEMS_PER_TYPE = 5 prevents inventory spam and maintains strategic resource management. Players must choose when to use items rather than hoarding unlimited quantities.

**Event-driven effects:** ItemManager emits item:effect_applied events rather than directly calling CombatManager methods. This follows the AbilityManager pattern and maintains loose coupling. Socket handlers or CombatManager can subscribe to these events to apply actual game state changes.

**Self-targeting only (for now):** All items currently target the user (targetIds = [playerId]). The infrastructure supports extensible targeting (targetIds array), allowing future items to target allies or boss by modifying applyItemEffect logic.

## Success Criteria

- [x] shared/itemTypes.ts has 3 item definitions with effects
- [x] ItemManager validates inventory, combat state, and player state before item use
- [x] Items are consumed (count decremented) on successful use
- [x] item:* events emitted for awards, usage, and effects
- [x] cleanupLobby removes all session-scoped inventory data
- [x] All tests pass with TDD RED-GREEN cycle

## Commits

1. **96ce448** - feat(20-01): add item type definitions and event payloads
2. **ad4bb8f** - test(20-01): add failing tests for ItemManager (RED phase)
3. **5eae9ba** - feat(20-01): implement ItemManager domain (GREEN phase)

## Next Steps

Plan 20-02 will wire ItemManager into the game loop:
- Award items on boss defeat or milestone events
- Integrate use_item socket handler
- Sync inventory state to clients
- Apply item effects to combat state (heal HP, apply buffs, add shields)

## Self-Check: PASSED

All files created:
- FOUND: shared/itemTypes.ts
- FOUND: server/domains/ItemManager.ts
- FOUND: server/domains/ItemManager.test.ts

All commits exist:
- FOUND: 96ce448
- FOUND: ad4bb8f
- FOUND: 5eae9ba
