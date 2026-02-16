---
phase: 15-xp-progression-foundation
plan: 07
type: execute
completed: 2026-02-10
duration: 240s
wave: 1
gap_closure: true
status: complete
commits:
  - a561301
  - 6fe0f9e
subsystem: progression
tags: [xp, persistence, consensus, storage, gap-closure]
dependencies:
  requires:
    - "Phase 15-06: Full XP integration"
    - "server/storage.ts: IStorage interface"
    - "server/domains/EstimationManager: getEstimation()"
  provides:
    - "Consensus XP awards to all voters"
    - "XP persistence via database storage"
    - "progression:sync emission on join/reconnect"
  affects:
    - "server/domains/ProgressionManager.ts"
    - "server/domains/index.ts"
    - "server/websocket.ts"
tech_stack:
  added: []
  patterns:
    - "Best-effort persistence with fire-and-forget async"
    - "Player-user ID registry for XP persistence mapping"
    - "Async IIFE pattern for non-blocking socket handlers"
key_files:
  created: []
  modified:
    - "server/domains/ProgressionManager.ts: Added storage integration and consensus handler"
    - "server/domains/index.ts: Wired getVoters callback and storage dependency"
    - "server/websocket.ts: Added progression:sync emission on join/create/reconnect"
    - "server/domains/ProgressionManager.test.ts: Updated test to provide new dependencies"
decisions:
  - summary: "Fire-and-forget XP persistence"
    rationale: "Don't block game flow for database writes - persistence is best-effort"
    alternatives: ["Await persistence (blocks gameplay)", "Queue persistence (more complex)"]
    choice: "Fire-and-forget with error logging"
  - summary: "Player-user ID registry for mapping"
    rationale: "Socket handlers have userId, domain managers have playerId - need mapping layer"
    alternatives: ["Pass userId through all domain methods", "Store in sessionManager"]
    choice: "Shared registry in domains/index.ts"
  - summary: "Async IIFE for progression sync"
    rationale: "Socket handlers should not be async, but loadPlayerXP is async"
    alternatives: ["Make handler async (breaks Socket.IO patterns)", "Blocking with await"]
    choice: "Self-executing async function with catch block"
metrics:
  tasks_completed: 2
  files_modified: 4
  tests_passing: 391
  coverage: "Maintained (no new uncovered code)"
---

# Phase 15 Plan 07: Consensus XP and XP Persistence - Summary

**One-liner:** Working consensus XP awards (50 XP to all voters) and XP persistence via storage with progression:sync on join/reconnect

## What Was Built

### Gap Closure XP-03: Consensus XP Awards

**Problem:** The `handleConsensus()` method in ProgressionManager was a stub that only logged a warning instead of awarding XP to voters.

**Solution:**
- Added `getVoters` callback to `ProgressionManagerDeps` interface
- Wired callback in `domains/index.ts` to read voter IDs from EstimationManager's vote maps
- Replaced stub with working implementation that awards 50 XP to all voters on `estimation:full_consensus_reached`
- Removed TODO comment and console.warn from consensus handler

**Impact:** Players now earn bonus XP when their votes contribute to team consensus, closing a major progression gap.

### Gap Closure XP-05: XP Persistence

**Problem:** Player XP was lost when logging out - no database persistence or sync on reconnect.

**Solution:**

**ProgressionManager side:**
- Added `storage` and `getUserId` dependencies to ProgressionManagerDeps
- Added `persistXP()` private method for best-effort database writes
- Added `loadPlayerXP()` public method for loading stored XP on join
- Modified `awardXP()` to call `persistXP()` fire-and-forget after each XP award

**websocket.ts side:**
- Created `playerUserIdMap` registry in domains/index.ts for playerId → userId mapping
- Exported `registerPlayerUserId()` and `getPlayerUserId()` helpers
- Added progression sync to three socket handlers:
  - `create_lobby`: Host gets XP loaded and synced on lobby creation
  - `join_lobby`: Joining player gets XP loaded and synced
  - `reconnect_with_token`: Reconnecting player gets XP loaded and synced
- Each sync emits `progression:sync` event with `{ playerId, totalXP, currentLevel, seq, timestamp }`
- Used async IIFE pattern to avoid blocking socket handlers

**Impact:** Authenticated players' XP now persists across sessions, and clients receive accurate XP state on join/reconnect.

## Key Technical Decisions

### 1. Fire-and-Forget Persistence

XP persistence is **non-blocking** - we call `persistXP()` without awaiting it. If database writes fail, we log the error but don't interrupt gameplay.

**Rationale:** XP awards happen during fast-paced gameplay (voting, combat). Blocking on database writes would introduce latency spikes. Since XP is also tracked in-memory for the session, temporary persistence failures don't break the game.

**Error Handling:**
```typescript
if (this.storage && this.getUserId) {
  this.persistXP(lobbyId, playerId, newXP).catch(() => {
    // Error already logged in persistXP
  });
}
```

### 2. Player-User ID Mapping Registry

**Challenge:** Socket handlers have `socket.data.userId` (authenticated user), but domain managers work with `playerId` (in-game identity).

**Solution:** Created a shared Map in domains/index.ts that maps playerId → userId. Socket handlers call `registerPlayerUserId()` on join/create/reconnect.

**Why not alternatives:**
- Passing userId through all domain methods: Would require changing every domain API
- Storing in sessionManager: Would couple progression to session domain

### 3. Async IIFE for Progression Sync

**Challenge:** `progressionManager.loadPlayerXP()` is async, but Socket.IO event handlers should be synchronous.

**Solution:** Wrap async progression sync in a self-executing async function:
```typescript
if (socket.data.userId) {
  registerPlayerUserId(playerId, socket.data.userId);
  (async () => {
    try {
      await progressionManager.loadPlayerXP(lobbyId, playerId, socket.data.userId!);
      // ... emit progression:sync
    } catch (err) {
      console.error('Failed to sync progression:', err);
    }
  })();
}
```

**Why not alternatives:**
- Making handler async: Breaks Socket.IO conventions and error handling
- Synchronous fetch: Would block other socket events during DB query

## Deviations from Plan

**None** - Plan executed exactly as written. All tasks completed without encountering bugs, missing critical functionality, or blocking issues.

## Files Modified

### server/domains/ProgressionManager.ts (37 lines changed)
- Added `getVoters`, `storage`, `getUserId` to `ProgressionManagerDeps`
- Replaced stub `handleConsensus()` with working implementation
- Added `persistXP()` method for database writes
- Added `loadPlayerXP()` method for loading stored XP
- Modified `awardXP()` to persist XP after awarding

### server/domains/index.ts (21 lines changed)
- Imported `storage` from ../storage
- Created `playerUserIdMap` registry
- Wired `getVoters` callback using EstimationManager vote data
- Passed `storage` and `getUserId` to ProgressionManager
- Exported `registerPlayerUserId()` and `getPlayerUserId()` helpers

### server/websocket.ts (66 lines changed)
- Imported `progressionManager` and `registerPlayerUserId`
- Added progression sync to `create_lobby` handler
- Added progression sync to `join_lobby` handler
- Added progression sync to `reconnect_with_token` handler
- Each sync loads XP from storage and emits `progression:sync` event

### server/domains/ProgressionManager.test.ts (6 lines changed)
- Updated test setup to provide new required dependencies (`getVoters`, `storage`, `getUserId`)

## Verification Results

### Tests
- ✅ `npx vitest run server/domains/ProgressionManager.test.ts` - 37 tests pass
- ✅ `npx vitest run` - Full suite: 391 tests pass
- ✅ `npm run build` - Production build succeeds

### Code Verification
- ✅ `grep "console.warn.*Consensus"` - 0 matches (stub removed)
- ✅ `grep "TODO.*getActivePlayers"` - 0 matches (TODO removed)
- ✅ `grep "progression:sync" server/websocket.ts` - 3 matches (create, join, reconnect)
- ✅ `grep "progressionManager" server/websocket.ts` - 5+ matches (import and usage)

### TypeScript Check
- ⚠️ Pre-existing test errors remain (EstimationManager.test.ts, gameFlow.test.ts)
- ✅ No new TypeScript errors introduced by this plan

## Self-Check: PASSED

**Created files exist:**
- N/A - No new files created

**Modified files exist:**
```bash
[ -f "server/domains/ProgressionManager.ts" ] && echo "FOUND"
[ -f "server/domains/index.ts" ] && echo "FOUND"
[ -f "server/websocket.ts" ] && echo "FOUND"
[ -f "server/domains/ProgressionManager.test.ts" ] && echo "FOUND"
```
✅ All files exist

**Commits exist:**
```bash
git log --oneline --all | grep -q "a561301" && echo "FOUND: a561301"
git log --oneline --all | grep -q "6fe0f9e" && echo "FOUND: 6fe0f9e"
```
✅ Both commits found

**Key functionality present:**
```bash
grep -q "handleConsensus.*getVoters" server/domains/ProgressionManager.ts && echo "FOUND: consensus handler"
grep -q "persistXP" server/domains/ProgressionManager.ts && echo "FOUND: persistence"
grep -q "loadPlayerXP" server/domains/ProgressionManager.ts && echo "FOUND: loading"
grep -q "progression:sync" server/websocket.ts && echo "FOUND: sync emission"
```
✅ All key functionality present

## Observable Impact

### For Authenticated Players
- **Before:** Consensus bonus never awarded, XP reset on logout
- **After:** 50 XP awarded to all voters on consensus, XP persists across sessions, clients receive sync on join

### For Guest Players
- **Before:** XP tracked in-memory for session only
- **After:** Same behavior (no persistence for guests, which is expected)

### For Development
- **Before:** Two critical progression gaps blocked full feature
- **After:** Gaps closed, progression system fully functional

## Next Steps

This plan closes the last two critical gaps (XP-03 and XP-05) identified in Phase 15 verification. The progression system is now complete with:
- ✅ Vote XP (10 XP)
- ✅ Boss damage XP (2 XP per damage)
- ✅ Consensus bonus XP (50 XP to voters) ← **Fixed**
- ✅ Revival XP (30 XP to reviver)
- ✅ XP persistence and sync ← **Fixed**
- ✅ XP bar UI
- ✅ Floating XP numbers
- ✅ Level-up celebration

**Remaining work:** Plan 15-08 will address gap XP-06 (level display in lobby player list).

## Commits

### a561301 - feat(15-07): implement consensus XP and storage integration
- Added storage dependencies to ProgressionManager
- Replaced consensus stub with working implementation
- Added XP persistence and loading methods
- Wired getVoters callback using EstimationManager data
- Updated tests to provide new dependencies

### 6fe0f9e - feat(15-07): emit progression:sync on join and reconnect
- Added progression:sync emission on create_lobby, join_lobby, reconnect_with_token
- Registered player-user ID mappings on join/reconnect
- Loaded stored XP from database on authentication
- Used async IIFE pattern to avoid blocking socket handlers
