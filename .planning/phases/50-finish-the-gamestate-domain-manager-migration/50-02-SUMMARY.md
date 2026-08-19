---
phase: 50-finish-the-gamestate-domain-manager-migration
plan: "02"
subsystem: server/domains
tags: [refactor, migration, gamestate, combat-manager, revival, host-transfer, deletion]
dependency_graph:
  requires: [MAINT-07, "50-01"]
  provides: [MAINT-08]
  affects:
    - server/events/eventTypes.ts
    - server/events/ClientEventEmitter.ts
    - server/domains/SessionManager.ts
    - server/domains/SessionManager.test.ts
    - server/websocket.ts
    - server/gameState.ts
    - server/gameState.test.ts
    - server/domains/CombatManager.test.ts
tech_stack:
  added: []
  patterns:
    - session:host_transferred eventBus event bridges to wire 'host_transferred' via ClientEventEmitter
    - CombatManager owns all revival lifecycle (self-managed per-session setInterval)
    - All domain events flow through eventBus -> ClientEventEmitter (no more naked io.to() for domain events)
key_files:
  created: []
  modified:
    - server/events/eventTypes.ts
    - server/events/ClientEventEmitter.ts
    - server/domains/SessionManager.ts
    - server/domains/SessionManager.test.ts
    - server/websocket.ts
    - server/gameState.ts
    - server/gameState.test.ts
    - server/domains/CombatManager.test.ts
decisions:
  - session:host_transferred bridges to WIRE name 'host_transferred' (not 'session:host_transferred') to match GamePage.tsx:232
  - disconnectWatchdog + processDisconnectedPlayers + removePlayer RETAINED (out of scope for Phase 50)
  - Legacy websocket.handlers.ts:302 host_transferred emit intentionally left as-is (dead branch per RESEARCH.md)
  - revive_cancel handler uses _targetId (underscore prefix) because cancelRevival only needs reviverId
metrics:
  duration_seconds: 1620
  completed_date: "2026-06-23"
  tasks_completed: 5
  files_modified: 8
---

# Phase 50 Plan 02: Finish GameState Domain Manager Migration (MAINT-08) Summary

Completed the MAINT-08 stream: routed all revival traffic through CombatManager, removed both
redundant 100ms revival watchdogs, replaced the disconnect-sweeper's naked io.to().emit with a
proper eventBus event (session:host_transferred) bridged through ClientEventEmitter, and deleted
the now-dead GameState revival methods. Every step was additive before the point-of-no-return
deletions, each gated on green tests and zero-caller greps.

## What Was Built

**Task 1 — session:host_transferred event + ClientEventEmitter bridge + SessionManager emit (additive):**
Added `SessionHostTransferredPayload` interface and `'session:host_transferred': SessionHostTransferredPayload`
to `DomainEventMap` in `eventTypes.ts`. Added a bridge in `ClientEventEmitter.setupInternalEventListeners`
that listens on `session:host_transferred` and emits to the lobby with wire name `'host_transferred'`
(matching GamePage.tsx:232; distinct from `session:host_changed` per Pitfall 4). Added
`this.eventBus.emit('session:host_transferred', {...})` in `SessionManager.processDisconnectedPlayers`
after the existing `session:host_changed` emit. TDD tests verify grace-expiry path fires the new event
with correct payload AND that the existing `session:host_changed` still fires (additive).

**Task 2 — Remove naked io.to().emit('host_transferred') from the disconnect sweeper:**
Replaced the sweeper body's `const hostTransfers = ... ; for (const transfer of hostTransfers) { io.to(...).emit(...) }` loop with a bare `sessionManager.processDisconnectedPlayers()` call. The sweeper no longer reads the hostTransfers return value. host_transferred now flows exclusively through the eventBus → ClientEventEmitter bridge established in Task 1.

**Task 3 — Route revive_start/revive_cancel through CombatManager; remove revive_tick handler:**
Replaced the `revive_start` handler to call `combatManager.startRevival(lobby.id, playerId, targetId)` — wrapped in try/catch for RevivalNotAllowedError — with lobby retrieved via `sessionManager.getPlayerLobby(playerId)`. No duplicate `eventBus.emit('combat:revival_started')` in the handler (CombatManager emits it internally). Replaced `revive_cancel` to call `combatManager.cancelRevival(playerId, 'cancelled_by_reviver')`. Removed the entire `revive_tick` handler (CombatManager's per-session setInterval replaces the keep-alive; no ack contract). TDD tests assert: `combat:player_revived` fires exactly once (no double-emit with watchdogs absent); `cancelRevival` fires `combat:revival_cancelled` exactly once; non-healer reviver throws `RevivalNotAllowedError`.

**Task 4 — Remove BOTH 100ms revival watchdogs:**
Deleted the `this.revivalWatchdog = setInterval(...)` block from `GameState` constructor AND the `private revivalWatchdog!: NodeJS.Timeout` field declaration. Deleted the entire `revivalWatchdogInterval = setInterval(...)` block (35 lines) from `websocket.ts` and its `clearInterval(revivalWatchdogInterval)` from the cleanup function. Two ticks → zero. `disconnectWatchdog` (30s) RETAINED. Updated `gameState.test.ts`: the "exactly two watchdog intervals" test updated to assert exactly ONE interval (the 30s disconnectWatchdog). Added a test confirming no 100ms revival timer is created under `startWatchdogs: true`.

**Task 5 — Delete dead GameState revival methods:**
After zero-caller grep confirmed no callers, deleted from `server/gameState.ts`: the local `RevivalSession` interface, the `revivalSessions` Map field, `processRevivalSessions()`, `cancelRevivalSession()` (private), `completeRevival()` (private), `getActiveRevivalSessions()`, `startRevive()`, `cancelRevive()`, `tickRevive()`. Battle methods (`attackBoss`/`startBattle`/`submitScore`/`revealScores`) retained. `disconnectWatchdog` + `processDisconnectedPlayers` + `removePlayer` retained (out of scope for Phase 50 per RESEARCH.md Pitfall 1).

## Test Results

| Task | Tests | Status |
|------|-------|--------|
| After Task 1 | 934 passing (+2 new SessionManager tests) | GREEN |
| After Task 2 | 934 passing | GREEN |
| After Task 3 | 937 passing (+3 new CombatManager tests) | GREEN |
| After Task 4 | 938 passing (+1 new gameState test) | GREEN |
| After Task 5 | 938 passing | GREEN |

Full suite: 938 tests (up from 932 at start of Phase 50)
`npm run check`: clean
`npm run lint`: clean

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | c8cdded | feat(50-02): add session:host_transferred event + bridge + SessionManager emit |
| 2 | 9175d63 | refactor(50-02): remove naked io.to().emit('host_transferred') from sweeper |
| 3 | 25a01ad | feat(50-02): route revive_start/cancel through CombatManager; remove revive_tick handler |
| 4 | bed08a8 | refactor(50-02): remove both 100ms revival watchdogs (two ticks → zero) |
| 5 | ce01ec7 | refactor(50-02): delete dead GameState revival methods (zero-caller gate passed) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-healer TDD test needed warrior1 in fighting state**
- **Found during:** Task 3 RED phase
- **Issue:** The `beforeEach` set `warrior1` to downed (it was the revival target). The "non-healer throws RevivalNotAllowedError" test tried to use warrior1 as a reviver with warrior1 already downed — CombatManager returns `false` (reviver not fighting) before reaching the class check, so RevivalNotAllowedError never fired.
- **Fix:** Reset warrior1 to `combatState: 'fighting'` at the start of that test, then down cleric1 as the target.
- **Files modified:** `server/domains/CombatManager.test.ts`
- **Commit:** 25a01ad

**2. [Rule 2 - Missing critical] Lint warning: unused `gs` variable in new watchdog test**
- **Found during:** Task 5 lint check
- **Issue:** `const gs = new GameStateManager(...)` in the "no revival timer" test triggered `@typescript-eslint/no-unused-vars` warning (gs is not referenced after construction).
- **Fix:** Changed to `new GameStateManager(...)` (expression statement) with a comment explaining instantiation triggers the watchdog setup.
- **Files modified:** `server/gameState.test.ts`
- **Commit:** ce01ec7

## MAINT-08 Scope Notes (Required per Plan)

**disconnectWatchdog + processDisconnectedPlayers + removePlayer were RETAINED — not an oversight:**
`GameStateManager.removePlayer` and `GameState.processDisconnectedPlayers` (the 30s `disconnectWatchdog`)
are intentionally kept. `processDisconnectedPlayers` still calls `this.removePlayer(playerId)` when
a player's grace expires. Deletion is gated on removing the entire GameState disconnect path —
a future GameState-decommission phase.

**Legacy websocket.handlers.ts:302 host_transferred emit left as-is:**
`server/websocket.handlers.ts:302` emits `host_transferred` on the immediate disconnect path.
Per RESEARCH.md, since Phase 41-02 `handlePlayerDisconnect` always returns `hostTransfer: undefined`,
making this branch effectively dead code. Intentionally left out of scope to avoid scope creep.

## Wire-Name Invariant

`grep -nE "emitToLobby\([^,]+,\s*'host_transferred'" server/events/ClientEventEmitter.ts` confirms
the bridge emits wire name `'host_transferred'` (NOT `'session:host_transferred'`). GamePage.tsx:232
listens on `socket.on('host_transferred', ...)` — invariant preserved.

## Known Stubs

None. All changes are routing/deletion/event-plumbing with no data rendering stubs.

## Threat Flags

None. No new network endpoints or auth paths introduced. The host-transfer path now uses the standard
eventBus bridge pattern (consistent with all other domain events). Revival routing through CombatManager
adds RevivalNotAllowedError enforcement for non-healer classes (hardening, not regression).

## Self-Check: PASSED

- server/events/eventTypes.ts: FOUND
- server/events/ClientEventEmitter.ts: FOUND
- server/domains/SessionManager.ts: FOUND
- server/websocket.ts: FOUND
- server/gameState.ts: FOUND
- Commits c8cdded, 9175d63, 25a01ad, bed08a8, ce01ec7: verified
- disconnectWatchdog retained at gameState.ts field + constructor
- Battle methods retained (grep count: 9)
- Full suite: 938 tests passing
- revivalWatchdogInterval: 0 matches in websocket.ts (grep -c returns 0)
- revivalWatchdog field/ctor: 0 matches in gameState.ts
- startRevive/cancelRevive/tickRevive methods: 0 in gameState.ts
- wire name 'host_transferred' in ClientEventEmitter: verified
