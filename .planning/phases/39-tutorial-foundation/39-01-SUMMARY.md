---
phase: 39-tutorial-foundation
plan: 01
subsystem: ui
tags: [zustand, persist, tutorial, hooks, data-attributes]

requires:
  - phase: none
    provides: standalone foundation
provides:
  - useTutorial Zustand store with localStorage persistence
  - useHintTarget hook for DOM element targeting
  - data-hint-target attributes on key game elements
affects: [39-02 tutorial overlay components]

tech-stack:
  added: []
  patterns: [zustand persist with partialize for selective persistence, data-hint-target DOM targeting pattern]

key-files:
  created:
    - client/src/lib/stores/useTutorial.tsx
    - client/src/lib/stores/useTutorial.test.ts
    - client/src/lib/hooks/useHintTarget.ts
  modified:
    - client/src/components/game/BossDisplay.tsx
    - client/src/components/game/ScoreSubmission.tsx
    - client/src/components/game/PlayerHUD.tsx
    - client/src/components/game/AbilityBar.tsx

key-decisions:
  - "zustand persist partialize excludes all runtime state from localStorage"
  - "useHintTarget uses RAF loop for moving elements, one-shot for static"
  - "Resize listener debounced to 100ms to avoid layout thrash"

patterns-established:
  - "data-hint-target attribute pattern for tutorial overlay targeting"
  - "Separate persist store (useTutorial) isolated from useGameState"

duration: 6min
completed: 2026-03-11
---

# Phase 39 Plan 01: Tutorial State & Hint Targets Summary

**Zustand tutorial store with partialize persistence and useHintTarget hook for DOM element targeting via data attributes**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-11T19:35:49Z
- **Completed:** 2026-03-11T19:42:03Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- useTutorial Zustand store with persist middleware saving only completion flags to localStorage
- useHintTarget hook with locateTarget (one-shot) and trackTarget (RAF loop) for overlay positioning
- 5 data-hint-target attributes added to BossDisplay, ScoreSubmission, PlayerHUD, and AbilityBar
- 8 unit tests covering all store actions and persistence behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useTutorial Zustand store with persist middleware** - `6ec9e18` (feat)
2. **Task 2: Create useHintTarget hook and add data-hint-target attributes** - `949eb84` (feat)

## Files Created/Modified
- `client/src/lib/stores/useTutorial.tsx` - Zustand store with persist partialize for tutorial state
- `client/src/lib/stores/useTutorial.test.ts` - 8 unit tests for store actions and persistence
- `client/src/lib/hooks/useHintTarget.ts` - Hook for locating DOM elements by data-hint-target
- `client/src/components/game/BossDisplay.tsx` - Added data-hint-target="boss-health"
- `client/src/components/game/ScoreSubmission.tsx` - Added data-hint-target="vote-cards"
- `client/src/components/game/PlayerHUD.tsx` - Added data-hint-target="player-hud" and "player-info"
- `client/src/components/game/AbilityBar.tsx` - Added data-hint-target="ability-bar"

## Decisions Made
- zustand persist partialize excludes all runtime state from localStorage
- useHintTarget uses RAF loop for moving elements, one-shot for static
- Resize listener debounced to 100ms to avoid layout thrash

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tutorial store and hint targeting ready for Plan 02 overlay components
- All 5 data-hint-target attributes in place for spotlight/popover positioning
- Store completely isolated from useGameState (verified)

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 39-tutorial-foundation*
*Completed: 2026-03-11*
