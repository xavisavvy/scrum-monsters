---
phase: 48-testability-seams
plan: 03
subsystem: server/domains, server/websocket
tags: [refactor, testability, wireDomains, factory, mock-socket, handler-extraction]
dependency_graph:
  requires: [48-01, 48-02]
  provides: [wireDomains-factory, makeMockSocket, handler-extraction-seam]
  affects:
    - server/domains/index.ts
    - server/websocket.ts
    - server/websocket.handlers.ts
    - server/test/makeMockSocket.ts
    - server/domains/index.test.ts
    - server/websocket.handlers.test.ts
tech_stack:
  added: []
  patterns:
    - wireDomains factory with named listener consts + dispose() teardown
    - mutable-ref pattern for activeConnections (pass-by-reference to extracted fn)
    - vi.mock for module-level singletons in handler unit tests
    - fresh ScopedEventBus per test for listener-count isolation
key_files:
  created:
    - server/domains/index.ts (wireDomains factory section)
    - server/test/makeMockSocket.ts
    - server/domains/index.test.ts
    - server/websocket.handlers.ts
    - server/websocket.handlers.test.ts
  modified:
    - server/domains/index.ts
    - server/websocket.ts
    - .planning/phases/48-testability-seams/48-VALIDATION.md
decisions:
  - wireDomains defined inside domains/index.ts to close over module-private helpers (activeBuffs, reduceShield, etc.) without exposing them
  - activeConnections changed from let primitive to mutable ref {value:number} so handleDisconnect can decrement it via the passed HandlerDeps
  - getClientEventEmitter kept as a direct import in handleReconnectWithToken (not added to HandlerDeps); unit tests mock the domains/index.js module
  - vi.mock for getClientEventEmitter in handler tests; io mock extended with sockets.sockets map for updateWebsocketMetrics compatibility
  - Three session:lobby_destroyed listeners stored in distinct named consts (onLobbyDestroyedAbility, onLobbyDestroyedCombo, onLobbyDestroyedItems) so each can be individually removed by dispose()
metrics:
  duration: "~15 minutes"
  completed: "2026-06-22"
  tasks: 2
  files: 7
---

# Phase 48 Plan 03: MAINT-03 wireDomains + makeMockSocket + Handler Extraction Summary

**One-liner:** Extract 9 module-scope eventBus listeners into wireDomains(ctx): {dispose()} factory; add server-side makeMockSocket; extract create_lobby/disconnect/reconnect_with_token to standalone handler functions with 10 mock-socket unit tests.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extract wireDomains factory + add makeMockSocket + dispose test | 4e68e95 | index.ts, makeMockSocket.ts, index.test.ts |
| 2 | Extract create_lobby / disconnect / reconnect handlers + unit tests | 1f5e6ac | websocket.handlers.ts, websocket.handlers.test.ts, websocket.ts, VALIDATION.md |

## What Was Built

**server/domains/index.ts changes (Task 1):**

1. Added `import type { DomainEventMap }` to support typed listener const annotations.
2. Defined `WireDomainsContext` interface and `export function wireDomains(ctx): { dispose() }` inside `index.ts` so it closes over module-private helpers (`activeBuffs`, `activeDebuffs`, `reduceShield`, `addBuff`, `addDebuff`, `cleanupBuffs`, `cleanupDebuffs`, `getDamageMultiplier`, `getShieldAbsorption`, `applyHealEffect`).
3. The factory stores all 9 listeners in named `const` references:
   - `onBattleInitAbility` → `combat:battle_initialized` → abilityManager.resetCooldowns
   - `onLobbyDestroyedAbility` → `session:lobby_destroyed` → abilityManager.cleanupLobby
   - `onBattleInitCombo` → `combat:battle_initialized` → comboManager.resetCombos
   - `onLobbyDestroyedCombo` → `session:lobby_destroyed` → comboManager.cleanupLobby
   - `onLobbyDestroyedItems` → `session:lobby_destroyed` → itemManager+buffs+debuffs+statsTracker cleanup
   - `onDiscussionEndedItems` → `estimation:discussion_ended` → award items to players
   - `onItemEffectApplied` → `item:effect_applied` → heal/buff/shield branches
   - `onBossDamagedBuff` → `combat:boss_damaged` → damage_boost bonus damage
   - `onAbilityEffectApplied` → `ability:effect_applied` → damage/heal/buff/shield/debuff/taunt branches
4. `dispose()` calls `eventBus.off(event, namedConst)` for all 9.
5. Module-bottom call: `wireDomains({ eventBus, abilityManager, comboManager, itemManager, combatManager, statsTracker, sessionManager })` replaces the 9 inline registrations.

**server/test/makeMockSocket.ts (Task 1):**

New file exporting `makeMockSocket()` returning `{ socket, handlers, emitted, joinedRooms }`:
- `socket.data` as mutable `Record<string, unknown>` for playerId/lobbyId/userId writes
- `socket.on/off/emit/join/listeners/id` all vi.fn()
- `emitted` captures all `{event, data}` pairs
- `joinedRooms` captures all `socket.join(room)` calls

**server/domains/index.test.ts (Task 1):**

3 tests in `describe('wireDomains — dispose removes all 9 listeners')`:
1. Verifies registration: `combat:battle_initialized` = 2 listeners, `session:lobby_destroyed` = 3, others = 1 each.
2. Verifies `dispose()` removes all listeners (counts return to 0).
3. Verifies fresh buses don't accumulate listeners across wireDomains calls.
All tests use fresh `new ScopedEventBus()` with `dispose?.()` in `afterEach`.

**server/websocket.handlers.ts (Task 2):**

New file exporting `HandlerDeps` interface and three handler functions:
- `handleCreateLobby(socket, data, deps)`: full create_lobby logic (byte-identical)
- `handleReconnectWithToken(socket, data, deps)`: full reconnect logic (byte-identical)
- `handleDisconnect(socket, reason, deps)`: full disconnect/host-transfer logic (byte-identical)

**server/websocket.ts (Task 2):**

- Import `handleCreateLobby`, `handleReconnectWithToken`, `handleDisconnect`, `HandlerDeps`
- `activeConnections` changed from `let number` to `const { value: number }` mutable ref (required for pass-by-reference in extracted handler)
- All 6 `activeConnections` usages updated to `activeConnections.value`
- Added `handlerDeps: HandlerDeps` assembly from in-scope singletons
- Three handler registration sites replaced with thin delegations: `on('create_lobby', (data) => handleCreateLobby(socket, data, handlerDeps))` etc.
- `socket.on('disconnect', ...)` similarly delegates to `handleDisconnect`

**server/websocket.handlers.test.ts (Task 2):**

10 mock-socket tests across 3 describes:
- `handleCreateLobby` (4 tests): lobby_created emitted, socket.data.playerId/lobbyId set, gameState.syncPlayerToLobby called, game_error on throws
- `handleDisconnect` (3 tests): activeConnections decrements, host_transferred emitted to room, removePlayer fallback when handlePlayerDisconnect returns null
- `handleReconnectWithToken` (3 tests): failed token → reconnect_response failure, success → syncPlayerToLobby + join + response, exception → server_error

## Verification Results

- `npx vitest run server/domains/index.test.ts server/domains/AbilityEffectHandler.test.ts` — 13/13 pass
- `npx vitest run server/websocket.handlers.test.ts` — 10/10 pass
- `npm test` — **909/909 tests pass** (13 more than 896 after 48-02; 3 dispose tests + 10 handler tests)
- `npm run check` — 0 TypeScript errors
- `npm run lint` — 0 problems
- `grep "export function wireDomains" server/domains/index.ts` — 1 match
- Module-bottom wireDomains({ ... }) call — 1 match
- No bare `eventBus.on(` registrations at module scope outside the factory
- No NEW MaxListenersExceededWarning (pre-existing estimation:vote_cast warning unchanged)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `wireDomains` defined inside `domains/index.ts` (not a separate module) | Closes over module-private helpers (activeBuffs, etc.) without exposing internal state; follows Assumption A3 from research |
| `activeConnections` changed to `{value: number}` mutable ref | Allows `handleDisconnect` to decrement the counter via the passed HandlerDeps; only 6 usages in websocket.ts updated |
| `getClientEventEmitter` kept as direct import in handlers (not in HandlerDeps) | Avoids expanding HandlerDeps surface; mocked via `vi.mock` in tests — documents the trade-off in test comments |
| Mock `io.sockets.sockets = new Map()` in disconnect tests | `updateWebsocketMetrics(io)` iterates `io.sockets.sockets.values()`; minimal stub prevents TypeError |
| Three distinct `session:lobby_destroyed` named consts | Required by Pitfall 5: eventBus.off() matches by reference; arrow functions create new refs per call |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] io mock missing sockets.sockets for updateWebsocketMetrics**
- **Found during:** Task 2 first test run
- **Issue:** `updateWebsocketMetrics(io)` called in `handleDisconnect` iterates `io.sockets.sockets.values()`, throwing TypeError with a minimal `{to: vi.fn()}` mock
- **Fix:** Extended io mock in `makeMockDeps` with `sockets: { sockets: new Map() }` stub
- **Files modified:** server/websocket.handlers.test.ts
- **Commit:** 1f5e6ac (included in same commit)

**2. [Rule 1 - Bug] Unused default imports in websocket.handlers.ts causing lint warnings**
- **Found during:** Task 2 lint check
- **Issue:** `sessionManager as defaultSessionManager` etc. were imported but never used (deps are always caller-provided)
- **Fix:** Removed the 4 unused default imports; kept only `getClientEventEmitter` and `SessionError`
- **Files modified:** server/websocket.handlers.ts
- **Commit:** 1f5e6ac (included in same commit)

## Known Stubs

None — all code paths are wired to production data.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The extracted handlers maintain byte-identical validation and rate-limiting behavior (rate-limit `on()` wrapper in setupWebSocket remains the gate; delegation happens inside the existing wrapper, satisfying T-48-03).

## Self-Check: PASSED

- [x] `server/domains/index.ts` — contains `export function wireDomains`, `WireDomainsContext`, module-bottom call
- [x] `server/test/makeMockSocket.ts` — exists, exports `makeMockSocket`
- [x] `server/domains/index.test.ts` — exists, 3 tests pass
- [x] `server/websocket.handlers.ts` — exists, exports `handleCreateLobby`, `handleReconnectWithToken`, `handleDisconnect`, `HandlerDeps`
- [x] `server/websocket.handlers.test.ts` — exists, 10 tests pass
- [x] `server/websocket.ts` — delegates 3 handlers, `activeConnections` is mutable ref
- [x] `.planning/phases/48-testability-seams/48-VALIDATION.md` — nyquist_compliant: true, wave_0_complete: true
- [x] Commit 4e68e95 exists (Task 1)
- [x] Commit 1f5e6ac exists (Task 2)
- [x] 909 tests pass, tsc clean, lint clean
