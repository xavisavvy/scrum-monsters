---
phase: 23-mobile-ux-critical-path
plan: "03"
subsystem: ui
tags: [mobile, orientation, css, react, portrait, landscape, media-query]

# Dependency graph
requires:
  - phase: 23-01
    provides: mobile.css file and safe-area utility classes to append orientation rules to
  - phase: 23-02
    provides: canvas DPR cap and PerformanceMonitor adaptive quality for battle scene
provides:
  - useOrientation hook: reactive portrait/landscape detection via matchMedia
  - RotateDeviceOverlay: soft "rotate device" prompt for portrait mobile battle phases
  - Orientation-responsive CSS: portrait sidebar becomes bottom sheet, landscape sidebar narrowed
  - battle-sidebar / battle-sidebar-toggle CSS classes on BattleScreen sidebar elements
affects:
  - 23-04 (further mobile UX polish in battle screen)
  - any phase styling the battle sidebar

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Orientation detection via matchMedia('(orientation: portrait)') — reactive, no polling
    - Dismissed-state pattern: overlay dismissal stored in local useState, reset on phase change
    - CSS class wiring: feature-specific CSS classes (battle-sidebar) added to components for media query targeting

key-files:
  created:
    - client/src/hooks/useOrientation.ts
    - client/src/components/game/RotateDeviceOverlay.tsx
  modified:
    - client/src/styles/mobile.css
    - client/src/components/game/BattleScreen.tsx

key-decisions:
  - "RotateDeviceOverlay uses local dismissed state reset on phase change — soft nudge per phase, not a one-time global dismiss"
  - "battle-sidebar CSS class added to existing sidebar div — minimal BattleScreen change, no logic refactor"
  - "Portrait bottom-sheet uses fixed positioning so it overlays game world without reflowing game layout"

patterns-established:
  - "Orientation pattern: import useOrientation, combine with useIsMobile for responsive conditional rendering"
  - "CSS class targeting pattern: add feature-specific CSS classes to JSX elements so mobile.css @media rules can target them without inline styles"

# Metrics
duration: 12min
completed: 2026-02-18
---

# Phase 23 Plan 03: Dual Orientation Support Summary

**useOrientation hook, RotateDeviceOverlay soft prompt, and portrait/landscape CSS rules converting BattleScreen sidebar to bottom sheet on portrait mobile and narrowing it on landscape**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-18T22:43:58Z
- **Completed:** 2026-02-18T22:55:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created)

## Accomplishments

- Created `useOrientation` hook using `matchMedia('(orientation: portrait)')` — reactive without polling, SSR-safe with `typeof window !== 'undefined'` guard
- Created `RotateDeviceOverlay` component that shows only when `isMobile + isPortrait + battlePhase`; dismissed state resets on each phase change making it a per-phase soft nudge
- Added orientation-responsive CSS: portrait mobile sidebar becomes a full-width bottom sheet (45vh), landscape mobile sidebar narrowed to 35vw with compacted HUD padding
- Wired `RotateDeviceOverlay` and CSS classes into `BattleScreen.tsx` without changing any existing logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useOrientation hook and RotateDeviceOverlay component** - `796d36a` (feat)
2. **Task 2: Add responsive sidebar CSS and wire RotateDeviceOverlay into BattleScreen** - `973f5eb` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified

- `client/src/hooks/useOrientation.ts` - Reactive orientation detection hook via matchMedia
- `client/src/components/game/RotateDeviceOverlay.tsx` - Soft rotate prompt for portrait mobile battle phases with dismiss button
- `client/src/styles/mobile.css` - Added portrait bottom-sheet and landscape compact rules for `.battle-sidebar`
- `client/src/components/game/BattleScreen.tsx` - Added `battle-sidebar` / `battle-sidebar-toggle` CSS classes and rendered `RotateDeviceOverlay`

## Decisions Made

- `RotateDeviceOverlay` uses local `useState` for dismissed, reset via `useEffect` on `gamePhase` — this means the prompt reappears each phase transition (battle → scoring → reveal → discussion) but stays dismissed within a phase. Appropriate for a soft nudge, not an annoyance blocker.
- `battle-sidebar` class added as prefix to existing className string — minimal diff, no Tailwind class removal, no logic change.
- Portrait bottom-sheet uses `position: fixed !important` to override the existing `position: fixed` on the parent wrapper without touching the React JSX positioning logic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in `shared/schema.ts` (Zod type compatibility) are present before and after changes — unrelated to this plan, as documented in prior summaries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `useOrientation` hook is available for any component needing portrait/landscape detection
- `RotateDeviceOverlay` renders automatically in BattleScreen — no further wiring needed
- Portrait and landscape @media rules target `.battle-sidebar` and `.player-hud-mobile` classes
- Plan 04+ can use the `useOrientation` hook or `.battle-sidebar` CSS class freely

---
*Phase: 23-mobile-ux-critical-path*
*Completed: 2026-02-18*

## Self-Check: PASSED

All files verified present:
- FOUND: client/src/hooks/useOrientation.ts
- FOUND: client/src/components/game/RotateDeviceOverlay.tsx
- FOUND: client/src/styles/mobile.css
- FOUND: client/src/components/game/BattleScreen.tsx
- FOUND: .planning/phases/23-mobile-ux-critical-path/23-03-SUMMARY.md

All commits verified:
- FOUND: 796d36a (Task 1)
- FOUND: 973f5eb (Task 2)
