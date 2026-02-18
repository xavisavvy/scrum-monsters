---
phase: 23-mobile-ux-critical-path
plan: 02
subsystem: ui
tags: [react-three-fiber, drei, PerformanceMonitor, mobile, gpu, dpr, canvas, three-js]

# Dependency graph
requires:
  - phase: 23-mobile-ux-critical-path-01
    provides: useIsMobile hook and mobile.css foundation
provides:
  - Three.js Canvas DPR capped at 2 (never uses device DPR 3+)
  - Adaptive quality scaling via PerformanceMonitor (FPS-based DPR adjustment)
  - Conditional antialias disabled on mobile (GPU savings)
  - touchAction: none on Canvas element (component-scoped, not global)
affects: [future-3d-components, lobby-performance, mobile-rendering]

# Tech tracking
tech-stack:
  added: ["@react-three/drei (PerformanceMonitor)"]
  patterns:
    - "DPR capped at Math.min(window.devicePixelRatio, 2) for GPU safety"
    - "PerformanceMonitor wraps Canvas children for adaptive FPS-based quality"
    - "useIsMobile toggles antialias — false on mobile for GPU savings"

key-files:
  created: []
  modified:
    - client/src/components/game/Lobby.tsx
    - client/src/styles/mobile.css

key-decisions:
  - "PerformanceMonitor defaults used (250ms window, 10 iterations, 0.75 threshold) — drei defaults match intended behavior"
  - "DPR adjusts between 1.0 and 2.0 in 0.5 increments for smooth transitions"
  - "mobile.css @layer directives removed — plain CSS used instead to avoid PostCSS/Tailwind build failure"

patterns-established:
  - "Canvas DPR pattern: useState initialized to Math.min(window.devicePixelRatio, 2)"
  - "PerformanceMonitor onDecline/onIncline pattern for adaptive quality"
  - "mobile.css must use plain CSS (not @layer) when imported outside Tailwind directive scope"

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 23 Plan 02: DPR Cap and PerformanceMonitor Summary

**Three.js Canvas DPR capped at 2 with PerformanceMonitor adaptive quality scaling and mobile antialias disabled to prevent GPU thermal throttling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T22:36:42Z
- **Completed:** 2026-02-18T22:39:42Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Canvas DPR capped at max 2 — prevents 9-16x pixel overdraw on 3-4 DPR mobile screens
- PerformanceMonitor from @react-three/drei wraps Canvas children — dynamically adjusts DPR between 1.0 and 2.0 based on measured FPS
- Anti-aliasing disabled on mobile via `antialias: !isMobile` — reduces GPU fragment workload
- `touchAction: none` applied via inline Canvas style — component-scoped, replaces any need for global CSS rule

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DPR cap and PerformanceMonitor to Lobby Canvas** - `30da2ea` (feat)

**Plan metadata:** See final docs commit

_Note: Changes were already present in commit 30da2ea from Plan 23-01 execution._

## Files Created/Modified

- `client/src/components/game/Lobby.tsx` - Added PerformanceMonitor, DPR state, useIsMobile hook, updated Canvas props
- `client/src/styles/mobile.css` - Fixed @layer directive build failure (removed Tailwind @layer wrappers, use plain CSS)

## Decisions Made

- Used PerformanceMonitor defaults (250ms collection window, 10 iterations, 0.75 FPS threshold) — drei defaults match intended adaptive behavior
- DPR steps in 0.5 increments (1.0 → 1.5 → 2.0) for smooth visual transitions
- mobile.css uses plain CSS without @layer — Tailwind @layer requires @tailwind utilities in same file scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed mobile.css @layer directives blocking build**
- **Found during:** Task 1 (build verification)
- **Issue:** mobile.css used `@layer utilities` and `@layer base` but those directives require `@tailwind utilities` in the same file. PostCSS/Tailwind threw a fatal error when processing the standalone CSS file.
- **Fix:** Removed `@layer utilities` and `@layer base` wrappers from mobile.css — content works identically as plain CSS rules
- **Files modified:** client/src/styles/mobile.css
- **Verification:** `npm run build` succeeds after fix
- **Committed in:** 30da2ea (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required fix to unblock build. No scope creep — mobile.css utilities work identically without @layer wrappers.

## Issues Encountered

The Lobby.tsx DPR/PerformanceMonitor changes were already present in the working tree from a prior execution session (committed as part of Plan 23-01 commit `30da2ea`). The task was verified complete and the build was confirmed passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Canvas DPR is properly capped — mobile GPU thermal throttling risk eliminated
- PerformanceMonitor will automatically degrade/restore quality based on real FPS
- Ready for Plan 23-03 (social meta tags / OG images) or further mobile UX work

## Self-Check: PASSED

- Lobby.tsx: FOUND
- mobile.css: FOUND
- 23-02-SUMMARY.md: FOUND
- Commit 30da2ea: FOUND
- PerformanceMonitor count in Lobby.tsx: 3 (import + usage open + usage close)
- dpr= in Canvas: FOUND
- antialias: !isMobile in Canvas: FOUND

---
*Phase: 23-mobile-ux-critical-path*
*Completed: 2026-02-18*
