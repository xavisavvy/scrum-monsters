---
phase: 48-testability-seams
plan: 01
subsystem: testing
tags: [vitest, typescript, dependency-injection, gamestate, refactor]

# Dependency graph
requires:
  - phase: 47-ability-effects-data-driven-registries
    provides: stable server gameState.ts base before testability seams
provides:
  - exported GameStateManager class constructable with startWatchdogs opt
  - public handleVotingTimeout method callable without as any
  - MAINT-01 seam describe block with timer-safe tests
affects:
  - 48-02-plan (MAINT-02 damageInterceptor seam)
  - 48-03-plan (MAINT-03 wireDomains factory)
  - all future phases needing direct GameStateManager instantiation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - constructor-injectable singleton with opts param and ?? default
    - vi.useFakeTimers scoped to describe block for timer-safe tests
    - getLobby() mutable reference for fixture setup without as any

key-files:
  created: []
  modified:
    - server/gameState.ts
    - server/gameState.test.ts

key-decisions:
  - "Added ! definite-assignment to revivalWatchdog/disconnectWatchdog fields so tsc does not flag conditional assignment"
  - "Test 3 uses getLobby() mutable reference to set gamePhase=battle without as any on gs; only player fixture object uses as any"
  - "vi.useFakeTimers scoped to MAINT-01 describe only via beforeEach/afterEach; real timer cleanup via vi.clearAllTimers() in Test 2 finally block"

patterns-established:
  - "Constructor-injectable singleton with opts?: { flag?: boolean } and ?? true default"
  - "Fake timer scope: vi.useFakeTimers in beforeEach, vi.useRealTimers in afterEach, never global"

requirements-completed: [MAINT-01]

# Metrics
duration: 15min
completed: 2026-06-22
---

# Phase 48 Plan 01: Export GameStateManager with startWatchdogs opt and public handleVotingTimeout

**GameStateManager exported and constructable with `{ startWatchdogs: false }` — no leaked timers; `handleVotingTimeout` promoted to public; 3 new MAINT-01 seam tests prove the seam without `as any`**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-22T19:07:00Z
- **Completed:** 2026-06-22T19:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `GameStateManager` exported from `server/gameState.ts` — future plans can import by name with no `as any`
- Constructor opts param `{ startWatchdogs?: boolean }` (default true) gates both watchdog `setInterval` calls — tests construct without timer leaks
- `handleVotingTimeout` promoted from `private` to `public` — callable directly on an instance
- Production singleton `export const gameState = new GameStateManager()` byte-identical — both watchdogs still start by default
- 3 new MAINT-01 tests: timer absence, interval count, public-method callability — suite grew from 890 to 893 passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Export GameStateManager, gate watchdogs, make handleVotingTimeout public** - `f412ec7` (refactor)
2. **Task 2: Add MAINT-01 seam describe block to server/gameState.test.ts** - `ad89ed0` (test)

**Plan metadata:** (committed as part of final docs commit)

## Files Created/Modified

- `server/gameState.ts` — exported class, opts constructor param, if (startWatchdogs) guard, public handleVotingTimeout, ! on watchdog fields
- `server/gameState.test.ts` — added `GameStateManager` named import and `describe('GameStateManager — MAINT-01 testability seam', ...)` block with 3 tests

## Decisions Made

- Added definite-assignment `!` to `revivalWatchdog` and `disconnectWatchdog` field declarations so tsc does not flag conditional assignment in the `if (startWatchdogs)` block — no runtime behavior change
- Test 3 (handleVotingTimeout) uses `getLobby()` mutable reference to set `gamePhase = 'battle'` on the lobby — avoids `as any` on `gs`; only the player fixture object literal uses `as any` for incomplete type (acceptable, does not bypass class privacy)
- `vi.useFakeTimers()` scoped to the new describe block via `beforeEach`/`afterEach` — does not affect the rest of the 56-file suite

## Deviations from Plan

None - plan executed exactly as written. Three keyword changes applied; singleton unchanged; tsc, lint, and all 893 tests green.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MAINT-01 seam is fully open: any later plan (48-02, 48-03, 49-52) can `import { GameStateManager }` and construct with `{ startWatchdogs: false }` to avoid timer leaks in tests
- `handleVotingTimeout` is public — tests can call it without `as any`
- No blockers

## Threat Flags

None — this plan makes no changes to authentication, authorization, input validation, or network endpoints.

## Known Stubs

None — this is a pure refactor; no UI stubs, placeholder text, or wired-but-empty data sources were introduced.

## Self-Check: PASSED

- `server/gameState.ts` contains `export class GameStateManager` — FOUND
- `server/gameState.ts` contains `opts?.startWatchdogs ?? true` — FOUND
- `server/gameState.ts` contains `public handleVotingTimeout` — FOUND
- `server/gameState.test.ts` contains `import { gameState, GameStateManager }` — FOUND
- `server/gameState.test.ts` contains `describe('GameStateManager — MAINT-01 testability seam'` — FOUND
- Commit `f412ec7` (Task 1) — verified in git log
- Commit `ad89ed0` (Task 2) — verified in git log
- `npm test` — 893 tests passed, 0 failures
- `npm run check` — 0 errors
- `npm run lint` — 0 problems

---
*Phase: 48-testability-seams*
*Completed: 2026-06-22*
