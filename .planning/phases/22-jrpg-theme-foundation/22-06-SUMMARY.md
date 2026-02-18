---
phase: 22-jrpg-theme-foundation
plan: 06
subsystem: ui
tags: [react, design-system, jrpg, accessibility, aria, progress-bar]

# Dependency graph
requires:
  - phase: 22-03
    provides: StatBar and HealthBar components with JRPG token integration and ARIA progressbar roles
provides:
  - BossDisplay.tsx using HealthBar for dynamic green/yellow/red HP display
  - XPBar.tsx using StatBar variant=xp inside existing animation wrapper
  - CharacterDetailsPanel.tsx using StatBar with per-class color prop for all 6 stat bars
  - StatBar optional color prop for arbitrary color override
affects: [battle-phase, avatar-selection-phase, scoring-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "color? prop pattern: optional override for design system token colors, enables per-class coloring without new variants"
    - "ARIA progressbar via StatBar: stat bars are accessible role=progressbar with aria-valuenow/max/label"
    - "Component wiring pattern: replace CSS-only and local implementations with shared design system components"

key-files:
  created: []
  modified:
    - client/src/components/ui/StatBar.tsx
    - client/src/components/game/BossDisplay.tsx
    - client/src/components/game/XPBar.tsx
    - client/src/components/game/CharacterDetailsPanel.tsx
    - client/src/components/game/XPBar.test.tsx

key-decisions:
  - "StatBar color prop uses color ?? VARIANT_COLORS[variant] — caller overrides variant color without touching variant system"
  - "XPBar test updated: check role=progressbar ARIA attrs instead of .xp-bar-fill CSS class (implementation detail test was tied to removed DOM node)"

patterns-established:
  - "Gap closure pattern: orphaned design system components wired to consumers, replacing ad-hoc CSS/local implementations"

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 22 Plan 06: StatBar/HealthBar Gap Closure Summary

**HealthBar wired into BossDisplay replacing .retro-health-bar CSS; StatBar wired into XPBar and CharacterDetailsPanel replacing .xp-bar-fill and local renderStatBar, eliminating 3 orphaned design system components**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T20:49:55Z
- **Completed:** 2026-02-18T20:53:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- StatBar accepts optional `color` prop enabling per-class color override without new variants
- BossDisplay imports and renders HealthBar in both fullscreen and non-fullscreen modes with dynamic green/yellow/red HP coloring, ARIA accessibility, and low-HP pulse animation
- XPBar uses StatBar variant=xp for progress fill; all existing pulse/level-up flash/hover expand animations preserved via XPBar.css container
- CharacterDetailsPanel replaces local `renderStatBar` function with StatBar using per-class `color` prop and per-stat ARIA labels for all 6 stats

## Task Commits

Each task was committed atomically:

1. **Task 1: Add color prop to StatBar and wire HealthBar into BossDisplay** - `39c6506` (feat)
2. **Task 2: Wire StatBar into XPBar and CharacterDetailsPanel** - `73405e6` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified
- `client/src/components/ui/StatBar.tsx` - Added optional `color?: string` prop; fill uses `color ?? VARIANT_COLORS[variant]`
- `client/src/components/game/BossDisplay.tsx` - Imports HealthBar; both health bar blocks replaced with `<HealthBar>` inside 300px wrapper div; healthPercentage calculation removed
- `client/src/components/game/XPBar.tsx` - Imports StatBar; .xp-bar-track/.xp-bar-fill replaced with `<StatBar variant="xp" size="sm">`
- `client/src/components/game/CharacterDetailsPanel.tsx` - Imports StatBar; renderStatBar deleted; renderStat helper added using StatBar with color prop and ARIA labels
- `client/src/components/game/XPBar.test.tsx` - Updated test from .xp-bar-fill DOM query to role=progressbar ARIA attribute assertion

## Decisions Made
- StatBar `color` prop uses `color ?? VARIANT_COLORS[variant]` — caller override without touching variant system. Maintains backward compatibility for all existing StatBar usages.
- XPBar test updated to check `role="progressbar"` ARIA attributes instead of `.xp-bar-fill` CSS class. The original test was testing an implementation detail (DOM node with a CSS class) that no longer exists after replacing with StatBar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated XPBar test: .xp-bar-fill selector broken after StatBar wiring**
- **Found during:** Task 2 (Wire StatBar into XPBar and CharacterDetailsPanel)
- **Issue:** XPBar.test.tsx queried `document.querySelector('.xp-bar-fill')` which no longer exists after replacing with StatBar; test "sets fill width based on progress percentage" failed
- **Fix:** Updated test to assert `role="progressbar"` element exists with correct `aria-valuenow` and `aria-valuemax` attributes — tests the same behavior via the ARIA interface StatBar provides
- **Files modified:** client/src/components/game/XPBar.test.tsx
- **Verification:** `npx vitest run client/src/components/game/XPBar.test.tsx` — 4/4 pass; full suite 575/575 pass
- **Committed in:** `73405e6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix necessary for test suite correctness after the planned implementation change. The test was asserting on a DOM node that was intentionally removed. No scope creep.

## Issues Encountered
None — plan executed as specified with one test fix required for the intentional DOM change.

## Next Phase Readiness
- StatBar and HealthBar are now fully utilized across battle, avatar selection, and scoring screens
- Phase 22 gap closure complete: all design system components from 22-03 are wired to consumers
- Phase 23 (Social Meta Tags & OG Images) can proceed — no UI component blockers

---
*Phase: 22-jrpg-theme-foundation*
*Completed: 2026-02-18*
