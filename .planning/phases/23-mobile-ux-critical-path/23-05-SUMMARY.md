---
phase: 23-mobile-ux-critical-path
plan: "05"
subsystem: ui
tags: [mobile, safe-area, touch-targets, dvh, css, react, viewport]

# Dependency graph
requires:
  - phase: 23-01
    provides: mobile.css with pb-safe/pt-safe utility classes and viewport-fit=cover
  - phase: 23-03
    provides: battle-sidebar CSS classes and BattleScreen orientation wiring
  - phase: 23-04
    provides: MobileControls and PlayerController pointer event handling
provides:
  - ReconnectionStatus banner with safe-area-inset-top offset and 44px touch targets
  - PlayerHUD with pb-safe bottom padding (home indicator clearance)
  - TimerDisplay with safe-area-inset-top/left offset on fixed positioning
  - BossMusicControls container with safe-area-inset-top/right padding
  - LobbyCreation, LobbyJoin, AvatarSelection with 100dvh height and pb-safe
  - PhaseContainer with 100dvh height covering all phase screens
affects:
  - All game phases (lobby -> avatar_selection -> battle -> scoring -> reveal -> discussion -> victory)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Safe-area fixed-position offset pattern using calc(rem + env(safe-area-inset-*, 0px))
    - dvh height override: style={{ height: '100dvh' }} on h-screen elements
    - pb-safe class for bottom edge clearance on scroll containers

key-files:
  created: []
  modified:
    - client/src/components/ui/ReconnectionStatus.tsx
    - client/src/components/game/PlayerHUD.tsx
    - client/src/components/game/BattleScreen.tsx
    - client/src/components/game/TimerDisplay.tsx
    - client/src/components/game/LobbyCreation.tsx
    - client/src/components/game/LobbyJoin.tsx
    - client/src/components/game/AvatarSelection.tsx
    - client/src/components/game/phases/PhaseContainer.tsx

key-decisions:
  - "ReconnectionStatus uses calc(16px + env(safe-area-inset-top)) in style — replaces top-4
     Tailwind class which cannot incorporate env() values"
  - "TimerDisplay uses top/left inline style with calc(1.5rem + env(safe-area-inset-*)) —
     overrides the Tailwind top-6/left-6 classes while preserving px-4/py-2 padding classes"
  - "BossMusicControls container gets paddingTop/paddingRight via inline style — the component
     has absolute positioning so safe-area adds to its container, not repositions it"
  - "pb-safe on lobby/avatar screens uses pb-safe (not p-safe) — avoids overriding
     existing px-4/py-8 horizontal padding on devices without notches where env() = 0px"
  - "PhaseContainer gets style={{ height: '100dvh' }} inline override — h-screen provides
     100vh fallback, inline style overrides on dvh-supporting browsers"

patterns-established:
  - "Fixed-position safe-area pattern: use style={{ top: 'calc(Xrem + env(safe-area-inset-top, 0px))' }}
     when element uses top-N Tailwind class and cannot benefit from padding approach"
  - "Scroll container bottom safe-area: pb-safe class is sufficient (adds padding only on notch devices)"

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 23 Plan 05: Safe-Area Integration Pass Summary

**Safe-area insets applied to all fixed/absolute edge UI (ReconnectionStatus, PlayerHUD, TimerDisplay, BossMusicControls) and dvh height with pb-safe padding applied to all non-battle screens (LobbyCreation, LobbyJoin, AvatarSelection, PhaseContainer)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T22:50:38Z
- **Completed:** 2026-02-18T22:53:23Z
- **Tasks:** 3
- **Files modified:** 8 (0 created)

## Accomplishments

- Applied `env(safe-area-inset-top, 0px)` to ReconnectionStatus banner top position so it clears the notch on all devices; made banner width responsive with `w-[calc(100vw-32px)] max-w-md` for iPhone SE
- Upgraded Retry Now and Dismiss buttons from `py-1` (~28px) to `py-2 min-h-[44px]` to meet WCAG 2.5.8 touch target requirements
- Added `pb-safe` class to PlayerHUD outer container for home indicator clearance
- Added safe-area offset to TimerDisplay `fixed top-6 left-6` via inline `style={{ top: 'calc(1.5rem + ...)', left: 'calc(1.5rem + ...)' }}`
- Added safe-area padding to BossMusicControls container (`paddingTop`, `paddingRight`) for both battle and discussion phases
- Applied `style={{ minHeight: '100dvh' }}` with `min-h-screen` fallback and `pb-safe` class to LobbyCreation, LobbyJoin, AvatarSelection
- Applied `style={{ height: '100dvh' }}` with `h-screen` fallback to PhaseContainer (covers battle, scoring, reveal, discussion, next_level, victory, game_over)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add safe-area padding to ReconnectionStatus and fix touch targets** - `ab5ed8f` (feat)
2. **Task 2: Add safe-area padding to PlayerHUD and BattleScreen edge elements** - `0036539` (feat)
3. **Task 3: Apply mobile layout fixes to non-battle screens** - `456a215` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified

- `client/src/components/ui/ReconnectionStatus.tsx` - safe-area-inset-top banner offset,
  responsive width, 44px touch targets on both action buttons
- `client/src/components/game/PlayerHUD.tsx` - pb-safe class on outermost div
- `client/src/components/game/BattleScreen.tsx` - safe-area paddingTop/paddingRight on
  BossMusicControls container (applies to both battle and discussion phases)
- `client/src/components/game/TimerDisplay.tsx` - safe-area-inset-top/left incorporated
  into top/left positioning via inline style calc()
- `client/src/components/game/LobbyCreation.tsx` - 100dvh minHeight style, pb-safe class
- `client/src/components/game/LobbyJoin.tsx` - 100dvh minHeight style, pb-safe class
- `client/src/components/game/AvatarSelection.tsx` - 100dvh minHeight style, pb-safe class
- `client/src/components/game/phases/PhaseContainer.tsx` - 100dvh height override

## Decisions Made

- `ReconnectionStatus` was using `top-4` as a Tailwind class. Since Tailwind classes cannot
  incorporate CSS `env()` values, replacing it with inline `style={{ top: 'calc(16px + env(safe-area-inset-top, 0px))' }}` is the correct approach. The `top-4` class was removed.
- `TimerDisplay` is self-positioned as `fixed top-6 left-6`. The safe-area offset is applied
  by overriding those Tailwind classes via inline style with `calc(1.5rem + env(...))`. This
  preserves the `px-4 py-2` padding classes (which are unrelated to positioning).
- `BossMusicControls` appears in both `battle` and `discussion` cases in `renderPhaseContent()`,
  so both containers were updated. `replace_all: true` was used to apply the change atomically.
- `pb-safe` class (not `p-safe`) chosen for lobby screens — `p-safe` would override the
  existing horizontal padding (px-4) on non-notch devices where `env(safe-area-inset-*)` resolves
  to 0px, producing no visible change but eliminating existing spacing. `pb-safe` targets only
  the bottom edge.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written, with one minor interpretation decision:

The plan said for TimerDisplay to "add the safe-area to the container div that positions it" but since
TimerDisplay uses `fixed` positioning internally and is not wrapped in a positioning div in BattleScreen
(it's rendered bare as `<TimerDisplay />`), the safe-area was applied directly to TimerDisplay's own
outermost div via inline style. This is equivalent to the plan's intent and the correct minimal change.

## Issues Encountered

- Pre-existing TypeScript errors in `shared/schema.ts` (Zod type compatibility) are present before
  and after changes — unrelated to this plan, as documented in prior summaries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All fixed/absolute UI elements near screen edges now have safe-area insets
- All game screens (lobby, avatar, battle, scoring, reveal, discussion, victory) handle iOS
  address bar height via dvh
- Full game session flow is mobile-safe from lobby creation through game over
- Phase 23 Plan 06 (social crawlers / meta tags) can proceed without mobile layout blockers

---
*Phase: 23-mobile-ux-critical-path*
*Completed: 2026-02-18*

## Self-Check: PASSED

All files verified present:
- FOUND: client/src/components/ui/ReconnectionStatus.tsx
- FOUND: client/src/components/game/PlayerHUD.tsx
- FOUND: client/src/components/game/BattleScreen.tsx
- FOUND: client/src/components/game/TimerDisplay.tsx
- FOUND: client/src/components/game/LobbyCreation.tsx
- FOUND: client/src/components/game/LobbyJoin.tsx
- FOUND: client/src/components/game/AvatarSelection.tsx
- FOUND: client/src/components/game/phases/PhaseContainer.tsx
- FOUND: .planning/phases/23-mobile-ux-critical-path/23-05-SUMMARY.md

All commits verified:
- FOUND: ab5ed8f (Task 1)
- FOUND: 0036539 (Task 2)
- FOUND: 456a215 (Task 3)
