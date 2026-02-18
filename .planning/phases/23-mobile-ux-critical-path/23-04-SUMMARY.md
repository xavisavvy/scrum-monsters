---
phase: 23-mobile-ux-critical-path
plan: "04"
subsystem: ui
tags: [mobile, touch, pointer-events, virtual-controls, battle, react, d-pad]

# Dependency graph
requires:
  - phase: 23-01
    provides: viewport-fit=cover meta tag and safe-area CSS utility classes (pb-safe etc.)
provides:
  - MobileControls component: virtual D-pad (4 directional buttons) and action buttons (SHOOT/JUMP/SPECIAL)
  - PlayerController pointer event conversion: onPointerDown replaces onClick for screen shooting
  - Touch-driven battle input updating same keys Set as keyboard (shared movement loop)
affects:
  - Any phase touching PlayerController or battle HUD

# Tech tracking
tech-stack:
  added: []
  patterns:
    - makeButtonHandlers factory function: DRY pointer event handlers spread onto multiple buttons
    - Pointer event pattern: onPointerDown + onPointerUp + onPointerCancel on all interactive game buttons
    - touch-action: none per-button (not global) for gesture interference prevention
    - pointer-events-none container + pointer-events-auto per-button: overlay doesn't block game world

key-files:
  created:
    - client/src/components/game/MobileControls.tsx
  modified:
    - client/src/components/game/PlayerController.tsx

key-decisions:
  - "MobileControls uses makeButtonHandlers factory — DRY pattern creates onPointerDown/onPointerUp/onPointerCancel
    per button via spread, avoiding repetition across 7 buttons"
  - "handleMobileKeyDown replicates handleKeyDown logic (not calls it) — keyboard handler takes KeyboardEvent,
    mobile handler takes string code; same side effects (setKeys, emit, setTimeout)"
  - "handleScreenClick renamed handleScreenPointerDown with pointerType guard — prevents double-fire on mobile
    where touch fires both pointer and click events"
  - "onMouseDown for focus combined into handleScreenPointerDown — reduces handler count, focus happens first
    before shooting logic"
  - "handleMobileKeyDown placed after findNearestTargetPlayer declaration — TypeScript hoisting constraint
    (useCallback with const can't reference later-declared consts)"

patterns-established:
  - "Touch input pattern: MobileControls props accept onKeyDown/onKeyUp with string code — same interface
    as KeyboardEvent.code, works with any keys Set consumer"
  - "Overlay pattern: pointer-events-none container, pointer-events-auto buttons — mobile overlay doesn't
    block game world pointer events except on buttons themselves"

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 23 Plan 04: Mobile Battle Controls Summary

**Virtual D-pad and action buttons (MobileControls) wired into PlayerController via pointer events,
enabling mobile users to move, jump, shoot, and use special attacks during battle through touch input
that updates the same keys Set as keyboard input**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T22:44:02Z
- **Completed:** 2026-02-18T22:47:41Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Created `MobileControls.tsx` with D-pad (4 directional 48px buttons) and action buttons (SHOOT/JUMP/SPECIAL
  at 56px each), all using onPointerDown/onPointerUp/onPointerCancel with touch-action: none
- Converted `handleScreenClick` (onClick) to `handleScreenPointerDown` (onPointerDown) in PlayerController,
  eliminating mobile double-fire risk and combining focus behavior into one handler
- Added `handleMobileKeyDown`/`handleMobileKeyUp` callbacks in PlayerController that update the same `keys`
  Set as keyboard events — movement loop requires no changes, touch and keyboard share code path
- MobileControls rendered conditionally via `useIsMobile()` only when battle is active

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MobileControls virtual D-pad and action buttons** - `9bee141` (feat)
2. **Task 2: Wire MobileControls into PlayerController and convert to pointer events** - `4d4bb46` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified

- `client/src/components/game/MobileControls.tsx` - New virtual gamepad overlay: D-pad at bottom-left,
  action buttons at bottom-right; pointer-events-none container; safe-area-inset padding; returns null
  when isActive is false; context menu prevented
- `client/src/components/game/PlayerController.tsx` - Added MobileControls/useIsMobile imports; added
  isMobile detection; converted handleScreenClick to handleScreenPointerDown (onPointerDown); removed
  separate onMouseDown (combined into pointer handler); added handleMobileKeyDown/handleMobileKeyUp
  callbacks; renders MobileControls when isMobile

## Decisions Made

- `makeButtonHandlers` factory function creates handler object spread onto buttons — avoids repeating
  onPointerDown/onPointerUp/onPointerCancel definitions for each of the 7 buttons.
- `handleMobileKeyDown` replicates `handleKeyDown` logic rather than calling it — the keyboard handler
  signature takes `KeyboardEvent`, not string code. Both produce identical side effects.
- `handleScreenPointerDown` adds `pointerType === 'touch'` guard to call `preventDefault()` — prevents
  the browser from synthesizing a subsequent click event on touch devices (double-fire prevention).
- `handleMobileKeyDown` placed after `findNearestTargetPlayer` — TypeScript block-scoped variable
  constraint: const declarations can't be referenced before their declaration point in a module.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `handleMobileKeyDown` initially placed before `getProjectileEmoji` (which is before `findNearestTargetPlayer`
  and `handleSpecialAttack`). TypeScript raised TS2448/TS2454 (variable used before declaration). Resolved
  by moving the mobile handler block to after `findNearestTargetPlayer` — no logic changes, only ordering.
- Pre-existing TypeScript errors in `shared/schema.ts` (Zod type compatibility) — confirmed pre-existing
  from prior plans, unrelated to this plan's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Touch battle controls fully functional — mobile users can move, jump, shoot, and use special attacks
- MobileControls component available for reuse in any phase that needs virtual button overlays
- Plan 05 (remaining Mobile UX Critical Path plans) can proceed without blockers

---
*Phase: 23-mobile-ux-critical-path*
*Completed: 2026-02-18*

## Self-Check: PASSED

All files verified present:
- FOUND: client/src/components/game/MobileControls.tsx
- FOUND: client/src/components/game/PlayerController.tsx
- FOUND: .planning/phases/23-mobile-ux-critical-path/23-04-SUMMARY.md

All commits verified:
- FOUND: 9bee141 (Task 1 - MobileControls component)
- FOUND: 4d4bb46 (Task 2 - PlayerController pointer events + MobileControls wiring)
