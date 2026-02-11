---
phase: 18-class-abilities
plan: 03
subsystem: ui
tags: [zustand, react, abilities, cooldowns, ui]

# Dependency graph
requires:
  - phase: 18-02
    provides: AbilityManager server integration with use_ability handler
provides:
  - Client-side ability UI with cooldown tracking and visual feedback
  - Zustand store for cooldown state with server event synchronization
  - AbilityBar component showing class-specific abilities during battle
  - AbilityButton with CSS conic-gradient cooldown overlay
affects: [18-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [ref-based animation loops, CSS conic-gradient for visual progress]

key-files:
  created:
    - client/src/lib/stores/useAbilities.tsx
    - client/src/components/game/AbilityButton.tsx
    - client/src/components/game/AbilityBar.tsx
  modified:
    - client/src/components/game/phases/BattlePhase.tsx

key-decisions:
  - "Ref-based requestAnimationFrame loop for smooth cooldown animations (avoid per-tick re-renders)"
  - "CSS conic-gradient for cooldown overlay (performant, no canvas needed)"
  - "100ms client buffer on isOnCooldown to prevent client/server race conditions"
  - "Border color based on ability role: amber (tank), green (healer), blue (DPS)"
  - "Lock icon (&#x1F512;) with required tier text for locked abilities"

patterns-established:
  - "Ref-based animation loops for visual state that updates frequently"
  - "Optimistic UI with pendingAbility state to prevent spam clicks"

# Metrics
duration: 2 min
completed: 2026-02-11
---

# Phase 18 Plan 03: Client Ability UI Summary

**Zustand cooldown store with server event sync, AbilityBar showing class abilities, AbilityButton with CSS conic-gradient cooldown overlay**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T19:23:37Z
- **Completed:** 2026-02-11T19:26:22Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- useAbilities Zustand store tracks cooldowns with server timestamps and provides progress/remaining calculations
- AbilityBar container shows 2 ability buttons for player's current class during battle phase
- AbilityButton displays ability with CSS conic-gradient cooldown overlay, lock indicator, and role-based border colors
- BattlePhase integrates AbilityBar positioned bottom-right above XP bar with useAbilitySync hook

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useAbilities store with server event sync** - `4b2cedb` (feat)
2. **Task 2: Create AbilityBar and AbilityButton components, integrate into BattlePhase** - `8ec4f0e` (feat)

**Plan metadata:** (will be added in metadata commit)

## Files Created/Modified

- `client/src/lib/stores/useAbilities.tsx` - Zustand store for client-side cooldown tracking with server sync via socket events
- `client/src/components/game/AbilityButton.tsx` - Individual ability button with cooldown overlay using requestAnimationFrame loop
- `client/src/components/game/AbilityBar.tsx` - Container for ability buttons, filtered to current player's class with mastery checks
- `client/src/components/game/phases/BattlePhase.tsx` - Integrated AbilityBar and useAbilitySync hook

## Decisions Made

**Ref-based animation loops:** Used requestAnimationFrame with refs instead of React state for cooldown progress to avoid re-renders on every frame. Reads directly from store via `getState()` inside animation loop.

**CSS conic-gradient cooldown:** Implemented cooldown visualization using CSS `conic-gradient` instead of canvas or SVG for simplicity and performance. Progress sweeps from 0% (just started) to 100% (ready).

**100ms client buffer:** Added 100ms buffer to `isOnCooldown` check to prevent race condition where client shows ready but server hasn't processed yet (research pitfall #1).

**Role-based colors:** Border color varies by ability effectType: amber for tank (taunt/shield), green for healer (heal), blue for DPS (damage/buff/debuff).

**Lock icon approach:** Used HTML entity `&#x1F512;` for lock icon with required tier text below, positioned over locked abilities.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-04 (ability effect application and combat integration). All client UI components in place with server event wiring complete.

## Self-Check: PASSED

All claimed files exist on disk:
- FOUND: client/src/lib/stores/useAbilities.tsx
- FOUND: client/src/components/game/AbilityButton.tsx
- FOUND: client/src/components/game/AbilityBar.tsx
- FOUND: client/src/components/game/phases/BattlePhase.tsx

All claimed commits exist in git history:
- FOUND: 4b2cedb (Task 1)
- FOUND: 8ec4f0e (Task 2)

---
*Phase: 18-class-abilities*
*Completed: 2026-02-11*
