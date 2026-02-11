---
phase: 20-combat-items-lifetime-stats
plan: 03
subsystem: combat
tags: [items, client-ui, server-integration, websocket, buffs]
dependency-graph:
  requires: [item-manager, combat-state, socket-events]
  provides: [item-ui, item-effects, buff-tracking]
  affects: [battle-phase, combat-manager]
tech-stack:
  added: [useItemStore, ItemBar, buff-tracking]
  patterns: [zustand-socket-sync, buff-expiry-timeouts, damage-wrapping]
key-files:
  created:
    - client/src/lib/stores/useItemStore.tsx
    - client/src/components/game/combat/ItemBar.tsx
  modified:
    - shared/gameEvents.ts
    - server/domains/index.ts
    - server/websocket.ts
    - server/events/ClientEventEmitter.ts
    - server/events/eventTypes.ts
    - client/src/components/game/phases/BattlePhase.tsx
decisions:
  - ItemBar positioned bottom-left (opposite AbilityBar) for spatial balance
  - Buff tracking uses module-level Map with setTimeout for automatic expiry
  - Shield absorption wraps applyDamageToPlayer to intercept before HP reduction
  - Damage boost applied as bonus damage on boss_damaged event (not inline multiplier)
  - Optimistic UI with pendingItem state prevents item spam clicks
  - Only non-spectator players see ItemBar in battle phase
metrics:
  duration: 396s
  completed: 2026-02-11T21:33:00Z
  tasks: 2
  files: 9
---

# Phase 20 Plan 03: Item System Integration Summary

**Server-authoritative item system with Socket.IO events, active buff tracking, and client ItemBar UI for combat item usage**

## Overview

Completed end-to-end integration of the item system: wired ItemManager into server event pipeline, implemented active buff tracking with timed effects (damage_boost, shield), added Socket.IO event handlers, and created client Zustand store with ItemBar combat UI.

## Implementation Details

### Server Wiring (Task 1)

**Socket.IO Events (shared/gameEvents.ts):**
- Added `use_item` to ClientToServerEvents with itemType parameter
- Added 3 ServerToClientEvents with seq/timestamp:
  - `item:awarded`: playerId, itemType, newCount
  - `item:used`: playerId, itemType, remainingCount
  - `item:effect_applied`: playerId, itemType, effectType, value, durationMs, targetIds

**ItemManager Instantiation (server/domains/index.ts):**
- Created itemManager with combatManager.getCombatState and getPlayerClass deps
- Exported itemManager instance and ItemManagerDeps type

**Active Buff Tracking (server/domains/index.ts):**
- Module-level `activeBuffs` Map with `${lobbyId}:${playerId}` keys
- `ActiveBuff` interface: buffType (damage_boost | shield), value, expiresAt, timeoutHandle
- `addBuff`: adds buff with setTimeout for automatic removal at expiry (refreshes, doesn't stack)
- `removeBuff`: clears timeout and removes buff from map
- `getDamageMultiplier`: returns 1.5 if active damage_boost, else 1.0
- `getShieldAbsorption`: returns remaining shield value if active
- `reduceShield`: absorbs damage, updates shield value, returns remaining damage
- `cleanupBuffs`: clears all buffs for lobby on destruction

**Item Award Hook:**
- `estimation:discussion_ended` listener awards 1 random item to each non-spectator player

**Item Effect Application:**
- `item:effect_applied` listener handles 3 effect types:
  - `heal`: restores HP up to maxHp, emits combat:player_healed
  - `buff`: adds damage_boost buff with 1.5x multiplier for 10s
  - `shield`: adds shield buff with 50 HP absorption for 15s

**Damage Boost Integration:**
- `combat:boss_damaged` listener calculates bonus damage for players with active damage_boost
- Skips combo damage (playerId starts with "combo:")
- Applies bonus via `combatManager.applyAbilityDamageToBoss`

**Shield Integration:**
- Wraps `combatManager.applyDamageToPlayer` with shield absorption logic
- Calls `reduceShield` before applying damage
- Emits `combat:shield_absorbed` event with absorbed amount and remaining shield
- Added `CombatShieldAbsorbedPayload` to DomainEventMap

**Socket Handler (server/websocket.ts):**
- `use_item` handler validates lobby membership and battle phase
- Delegates to `itemManager.useItem` with type assertion
- Emits game_error on failure, logs success

**Event Forwarding (server/events/ClientEventEmitter.ts):**
- Forwards item:awarded, item:used, item:effect_applied to clients
- Adds seq/timestamp via `emitToLobby`

**Cleanup:**
- `session:lobby_destroyed` listener cleans up inventories and buffs

### Client UI (Task 2)

**Item Store (client/src/lib/stores/useItemStore.tsx):**
- Zustand store with inventory Map (ItemType -> count) and pendingItem (optimistic UI)
- `handleItemAwarded`: updates inventory when current player receives item
- `handleItemUsed`: decrements count or deletes key at 0, clears pendingItem
- `handleItemEffectApplied`: clears pendingItem when effect lands (optional visual feedback hook)
- `useItem`: sets pendingItem, emits use_item socket event if count > 0 and not pending
- `resetInventory`: clears all state
- `getItemDisplayInfo` helper: returns name, icon, color, borderColor, description per item type:
  - heal_potion: 💚 green heart, "Restore 30 HP"
  - damage_boost: ⚔️ red sword, "1.5x damage for 10s"
  - shield: 🛡️ blue shield, "Absorb 50 damage"
- `useItemSync` hook: attaches socket listeners for item:* events

**ItemBar Component (client/src/components/game/combat/ItemBar.tsx):**
- 3 item type buttons rendered horizontally
- Each button shows emoji icon and count (x0, x1, etc.)
- Disabled when count is 0 or pendingItem matches itemType
- Colored borders: green (heal), red (damage_boost), blue (shield)
- Tooltip with item name and description on hover
- Optimistic UI: animate-pulse class when pending
- Click handler calls useItem(itemType) if not disabled

**BattlePhase Integration:**
- Imported ItemBar and useItemSync
- Called useItemSync() alongside useAbilitySync and useComboSync
- Positioned ItemBar at `fixed bottom-20 left-4 z-40` (opposite AbilityBar on right)
- Conditional render: only show for currentPlayer with team !== 'spectators'

## Deviations from Plan

None - plan executed exactly as written. All server wiring, buff tracking, and client UI implemented per specification.

## Technical Decisions

**Buff tracking location:** Module-level state in domains/index.ts rather than separate BuffManager class for simplicity. Small scope (2 buff types) doesn't justify full domain.

**Shield absorption approach:** Wrapping applyDamageToPlayer is cleanest interception point. Alternative (listening to player_damaged) would require retroactive HP adjustment.

**Damage boost as bonus damage:** Applying bonus damage via boss_damaged listener avoids modifying CombatManager internals. Clean separation of concerns.

**ItemBar positioning:** Bottom-left creates spatial balance with AbilityBar (bottom-right) and XP bar (bottom-center). Left side is less crowded in battle UI.

**Optimistic UI pattern:** Matches AbilityBar pattern with pendingAbility state. Prevents spam clicks while server processes request.

## Success Criteria

- [x] Items awarded to non-spectator players when tickets complete (estimation:discussion_ended)
- [x] use_item socket handler validates battle phase before ItemManager delegation
- [x] Item effects applied server-side: heal restores HP, damage_boost applies timed 1.5x multiplier, shield wraps applyDamageToPlayer for absorption
- [x] Active buff tracking with automatic expiry via setTimeout
- [x] combat:shield_absorbed event registered in DomainEventMap
- [x] Buff cleanup on session:lobby_destroyed
- [x] ClientEventEmitter forwards all item events with seq/timestamp
- [x] Client store tracks inventory and provides useItem action
- [x] ItemBar shows 3 item types with counts, disabled when empty
- [x] ItemBar integrated into BattlePhase combat UI

## Commits

1. **535b620** - feat(20-03): wire ItemManager into server event pipeline (Task 1)
2. **982cbca** - feat(20-02): implement StatsTracker domain (includes Task 2 client files)

Note: Task 2 client files (useItemStore, ItemBar, BattlePhase integration) were committed as part of 982cbca due to concurrent development with plan 20-02.

## Test Results

All 575 tests passing (558 pre-existing + 17 from concurrent plan 20-02).

**Verification commands:**
- `npm run check` - no item-related type errors
- `npm test` - all tests pass, no regressions
- `grep "use_item" server/websocket.ts` - handler exists
- `grep "itemManager" server/domains/index.ts` - wiring confirmed
- `grep "addBuff\|reduceShield" server/domains/index.ts` - buff tracking confirmed
- `grep "combat:shield_absorbed" server/events/eventTypes.ts` - event registered
- `grep "ItemBar" client/src/components/game/phases/BattlePhase.tsx` - UI integrated

## Next Steps

Plan 20-04 will implement server-side stat persistence:
- Track lifetime player stats (items used, damage dealt, healing done, etc.)
- Aggregate stats at session end
- Persist to database for player progression
- Provide stat query endpoints for profile/leaderboards

## Self-Check: PASSED

All files created/modified:
- FOUND: shared/gameEvents.ts (use_item, item:* events)
- FOUND: server/domains/index.ts (itemManager, buff tracking)
- FOUND: server/websocket.ts (use_item handler)
- FOUND: server/events/ClientEventEmitter.ts (event forwarding)
- FOUND: server/events/eventTypes.ts (combat:shield_absorbed)
- FOUND: client/src/lib/stores/useItemStore.tsx
- FOUND: client/src/components/game/combat/ItemBar.tsx
- FOUND: client/src/components/game/phases/BattlePhase.tsx

All commits exist:
- FOUND: 535b620 (Task 1)
- FOUND: 982cbca (Task 2 client files)
