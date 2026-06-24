---
phase: 51-event-contract-hardening-handler-boilerplate
plan: 02
subsystem: ui
tags: [socket-io, zustand, typescript, vitest, refactor]

# Dependency graph
requires:
  - phase: 49-state-source-of-truth-consolidation
    provides: withTeamsDerived threaded through setLobby in useGameState.tsx:129
  - phase: 42-event-sourcing-fine-grained-sockets
    provides: eventHandlers.ts with 50 socket.on handlers
provides:
  - registerSyncedLobbyHandler helper (seq-guard + null-check + setLobby envelope)
  - registerSyncedHandler helper (seq-guard for mixed multi-store handlers)
  - teardownSyncedHandlers (registered-name array, no drift possible)
  - Refactored eventHandlers.ts using helpers for ~29 handlers
affects: [phase-52, future handler additions to eventHandlers.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registerSyncedLobbyHandler: one helper call replaces 15-line seq-guard+null-check+setLobby boilerplate"
    - "registerSyncedHandler: one helper call for mixed handlers (seq-guard + multiple store actions)"
    - "_registeredEvents tracking array: teardown cannot drift from registration"

key-files:
  created:
    - client/src/lib/socket/eventHandlerUtils.ts
    - client/src/lib/socket/eventHandlerUtils.test.ts
  modified:
    - client/src/lib/socket/eventHandlers.ts
    - client/src/lib/socket/eventHandlers.test.ts

key-decisions:
  - "Cast socket.on to untyped inside helpers (Assumption A2) — TypeScript cannot narrow generic E in mapped-type callbacks"
  - "combat:minion_damaged converted to registerSyncedHandler (reads minions Map from store, not from lobby) — cleaner than registerSyncedLobbyHandler"
  - "combat:minion_heal_boss converted to registerSyncedHandler despite not being in plan's exact ~11 list — consistent pattern (seq-guard + setBoss)"
  - "Test for processed=false uses seq gap (seq=5 vs lastSeq=0) not stale seq — handleEvent returns true for stale seq (seq <= lastSeq), false only for gaps"
  - "withTeamsDerived count in eventHandlerUtils.ts kept at 0 (including comments) per acceptance criteria"

patterns-established:
  - "registerSyncedLobbyHandler pattern: (socket, event, (data, lobby) => Partial<Lobby> | null) — pure setLobby handlers"
  - "registerSyncedHandler pattern: (socket, event, (data) => void) — mixed handlers own all store actions"
  - "teardownSyncedHandlers: call first in teardownEventHandlers, then explicit offs for non-standard"

requirements-completed: [MAINT-09]

# Metrics
duration: 25min
completed: 2026-06-23
---

# Phase 51 Plan 02: Handler Boilerplate Collapse Summary

**`registerSyncedLobbyHandler` and `registerSyncedHandler` helpers collapse ~29 handlers' 15-line seq-guard boilerplate into one-liners; registered-name array makes teardown drift structurally impossible**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-23T22:20:00Z
- **Completed:** 2026-06-23T22:40:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 new, 2 modified)

## Accomplishments

- Created `eventHandlerUtils.ts` with `registerSyncedLobbyHandler`, `registerSyncedHandler`, and `teardownSyncedHandlers` exports
- Collapsed ~29 copy-pasted seq-guard + null-check + setLobby envelopes into helper calls in `eventHandlers.ts`
- 21 non-standard handlers remain explicit `socket.on` (correct per plan)
- `teardownSyncedHandlers` uses a module-level `_registeredEvents` array — registration and teardown are structurally linked, drift is impossible
- Added 10 helper unit tests (eventHandlerUtils.test.ts) + 3 new tests in eventHandlers.test.ts (teardown-parity + equivalence)
- Full suite: 938 → 951 tests (13 new), all passing

## Task Commits

1. **Task 1: Create eventHandlerUtils.ts helpers + unit tests** - `33ed4b6` (feat)
2. **Task 2: Refactor eventHandlers.ts + teardown + equivalence tests** - `0370261` (refactor)

## Files Created/Modified

- `client/src/lib/socket/eventHandlerUtils.ts` — New helper module: registerSyncedLobbyHandler, registerSyncedHandler, teardownSyncedHandlers, _registeredEvents array
- `client/src/lib/socket/eventHandlerUtils.test.ts` — New unit tests: 10 cases covering seq-gate, null-lobby skip, partial merge, null-return, teardown loop + array clear
- `client/src/lib/socket/eventHandlers.ts` — Refactored: ~29 handlers use helpers, teardown uses registered-name array + explicit offs for non-standard
- `client/src/lib/socket/eventHandlers.test.ts` — Extended: teardown-parity test + equivalence tests for session:player_left and combat:player_damaged

## Decisions Made

- **TypeScript cast (A2):** `socket.on` cast to untyped inside helpers because TypeScript cannot narrow the generic type parameter `E` in mapped-type callback bodies. This is the documented Assumption A2 from RESEARCH.
- **combat:minion_damaged as registerSyncedHandler:** The original handler reads `minions` Map from the store (not lobby) and calls `addMinion`. `registerSyncedLobbyHandler` (returns Partial<Lobby>) is inappropriate; `registerSyncedHandler` with direct `addMinion` call is correct.
- **combat:minion_heal_boss as registerSyncedHandler:** Not in the plan's explicit ~11 list but follows the identical pattern (seq-guard + setBoss). Converted for consistency.
- **seq-gate test uses gap not stale:** `handleEvent` returns `true` for `seq <= lastSeq` (duplicate — treated as handled/ignorable). The `false` path is only for gaps (`seq > lastSeq + 1`). Tests updated to use `seq=5` with `lastSeq=0` to trigger the gap path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unit tests for stale-seq scenario**
- **Found during:** Task 1 (helper unit tests)
- **Issue:** Tests set `lastSeq: 99` expecting `processed=false`, but `handleEvent` returns `true` for stale seq (it's treated as a duplicate, not a gap). The `processed=false` path is only triggered by sequence gaps.
- **Fix:** Changed test condition to use `seq=5` with default `lastSeq=0` to create a gap (5 > 0+1) which correctly returns `false`.
- **Files modified:** client/src/lib/socket/eventHandlerUtils.test.ts
- **Verification:** All 10 unit tests pass
- **Committed in:** 33ed4b6

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test logic)
**Impact on plan:** Test logic fixed to match actual handleEvent semantics. No scope creep.

## Issues Encountered

- None beyond the test logic fix documented above.

## Verification Summary

- `grep -c withTeamsDerived client/src/lib/socket/eventHandlerUtils.ts` = **0** (no double-derivation)
- `grep -c addPendingDamage client/src/lib/socket/eventHandlers.ts` = **6** (present — combat:player_damaged keeps its second store action)
- `grep -c teardownSyncedHandlers client/src/lib/socket/eventHandlers.ts` = **2** (import + usage)
- `npm run check` = **0 errors**
- `npm run lint` = **0 problems**
- `npm test` = **951 passed** (938 baseline + 13 new)

## Baseline vs Post-Refactor

| Metric | Before | After |
|--------|--------|-------|
| Tests | 938 | 951 |
| Handler boilerplate lines | ~15 per handler × 50 | 1 line for helper-eligible handlers |
| Teardown drift risk | Manual list (O(n) maintenance) | Registered-name array (structural) |
| eventHandlers.ts size | ~1048 lines | ~600 lines |

## Known Stubs

None — this is a mechanical refactor with no UI rendering or data wiring.

## Next Phase Readiness

- Adding a new synced handler now requires one line: `registerSyncedLobbyHandler(socket, 'new:event', (data, lobby) => ({ ...lobby, field: data.field }));`
- Teardown is automatic — no need to add to the explicit off-list
- Non-standard handlers still documented with `// NON-STANDARD:` comments explaining why they stay explicit

---
*Phase: 51-event-contract-hardening-handler-boilerplate*
*Completed: 2026-06-23*

## Self-Check: PASSED
