---
phase: 16-class-mastery-system
plan: 02
subsystem: backend
tags:
  - class-mastery
  - storage
  - websocket
  - event-forwarding
dependency_graph:
  requires:
    - 16-01 (ClassMasteryManager domain foundation)
  provides:
    - Wired ClassMasteryManager with storage and event forwarding
    - Class mastery persistence to database
    - Client synchronization on join/create/reconnect
  affects:
    - server/domains/index.ts
    - server/storage.ts
    - server/events/ClientEventEmitter.ts
    - server/websocket.ts
    - shared/gameEvents.ts
tech_stack:
  added: []
  patterns:
    - Fire-and-forget async IIFE for non-blocking DB operations
    - Storage interface extension pattern
    - Client event forwarding via EventBus subscription
key_files:
  created: []
  modified:
    - server/domains/index.ts
    - server/storage.ts
    - server/events/ClientEventEmitter.ts
    - server/websocket.ts
    - server/domains/ClassMasteryManager.ts
    - shared/gameEvents.ts
decisions:
  - Use fire-and-forget async IIFE pattern for class mastery sync (consistent with progression sync)
  - Emit class_mastery:sync only when masteryData has entries (avoid empty payloads)
  - Class mastery events follow progression:* naming pattern for consistency
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_modified: 6
  completed_at: "2026-02-11T17:20:39Z"
---

# Phase 16 Plan 02: Class Mastery Infrastructure Wiring Summary

**One-liner:** Wired ClassMasteryManager to server infrastructure with storage persistence, event forwarding, and WebSocket synchronization.

## Objective

Connect the ClassMasteryManager domain to the rest of the server so class mastery XP is actually awarded, persisted, and communicated to clients during gameplay.

## Implementation

### Task 1: Wire ClassMasteryManager instance and extend storage interface

**Extended IStorage interface:**
- Added `getClassMastery(userId, avatarClass)` - Fetch single class mastery record
- Added `updateClassMastery(userId, avatarClass, classXP, currentTier)` - Upsert class mastery data
- Added `getAllClassMastery(userId)` - Fetch all class mastery records for user

**Implemented in MemStorage:**
- In-memory map storage with auto-incrementing IDs
- Upsert logic checks for existing record and updates, or creates new

**Implemented in PgStorage:**
- Database queries using Drizzle ORM
- `onConflictDoUpdate` for upsert on unique(userId, avatarClass) constraint
- Uses `classMasteryProgress` table from schema

**Wired ClassMasteryManager in domains/index.ts:**
- Created instance after progressionManager
- Provided `getPlayerClass` callback from SessionManager (checks lobby.players for avatar)
- Provided `getVoters` callback from EstimationManager (extracts voters from team votes)
- Connected storage and playerUserIdMap for persistence
- Exported classMasteryManager instance and types

**Files modified:**
- server/storage.ts - Extended IStorage, implemented methods in both storage classes
- server/domains/index.ts - Created and exported classMasteryManager instance

**Commit:** 9eac8ea

### Task 2: Add client event forwarding and websocket mastery sync

**Added Socket.IO event types to shared/gameEvents.ts:**
- `class_mastery:xp_awarded` - XP awarded event with playerId, avatarClass, amount, source, newTotal
- `class_mastery:tier_up` - Tier upgrade event with oldTier and newTier
- `class_mastery:sync` - Full mastery data sync with masteryData map

**ClientEventEmitter forwarding:**
- Subscribed to `class_mastery:xp_awarded` and `class_mastery:tier_up` EventBus events
- Forwarded to clients via `emitToLobby` with seq and timestamp

**WebSocket mastery sync:**
- Added mastery sync to `create_lobby`, `join_lobby`, and `reconnect_with_token` handlers
- Fire-and-forget async IIFE pattern (consistent with progression sync)
- Only emits `class_mastery:sync` if masteryData has entries (avoids empty payloads)
- Non-blocking - uses `loadAllClassMastery` followed by `getAllMasteryData`

**Added ClassMasteryManager helper method:**
- `getAllMasteryData(lobbyId, playerId)` - Returns Record<avatarClass, {classXP, currentTier}>
- Used to build sync payload for clients

**Files modified:**
- shared/gameEvents.ts - Added 3 new Socket.IO event types
- server/events/ClientEventEmitter.ts - Added EventBus subscriptions and forwarding
- server/websocket.ts - Imported classMasteryManager, added sync in 3 locations
- server/domains/ClassMasteryManager.ts - Added getAllMasteryData method

**Commit:** 3a4a5f3

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

All tests pass (430 passing).

Production build succeeds with no errors.

## Verification

- [x] ClassMasteryManager instance created and exported from server/domains/index.ts
- [x] IStorage extended with getClassMastery, updateClassMastery, getAllClassMastery
- [x] Both MemStorage and DatabaseStorage implement new methods
- [x] ClientEventEmitter forwards class_mastery:xp_awarded and class_mastery:tier_up
- [x] websocket.ts emits class_mastery:sync on create_lobby, join_lobby, reconnect_with_token
- [x] shared/gameEvents.ts has class_mastery:* event types in ServerToClientEvents
- [x] All tests pass, production build succeeds

## Impact

Class mastery XP now flows end-to-end:
1. Game events trigger XP awards (vote, boss damage, consensus, revival)
2. ClassMasteryManager calculates tier and persists to DB (fire-and-forget)
3. Events forwarded to clients via Socket.IO
4. Players receive full mastery data on join/reconnect

Next step: Client-side UI to display class mastery progress and tier badges (Plan 03).

## Self-Check: PASSED

**Created files exist:**
- N/A (no new files created)

**Modified files exist:**
```
FOUND: server/domains/index.ts
FOUND: server/storage.ts
FOUND: server/events/ClientEventEmitter.ts
FOUND: server/websocket.ts
FOUND: server/domains/ClassMasteryManager.ts
FOUND: shared/gameEvents.ts
```

**Commits exist:**
```
FOUND: 9eac8ea
FOUND: 3a4a5f3
```

**Key functionality verified:**
- `grep "classMasteryManager" server/domains/index.ts` - Instance created and exported
- `grep "getClassMastery" server/storage.ts` - Storage methods exist
- `grep "class_mastery:xp_awarded" server/events/ClientEventEmitter.ts` - Event forwarding exists
- `grep "class_mastery:sync" server/websocket.ts` - Sync exists in 3 locations
- All tests pass, build succeeds
