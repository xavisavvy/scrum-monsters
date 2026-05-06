---
phase: 39-tutorial-foundation
plan: 02
subsystem: ui
tags: [tutorial, overlay, radix-popover, framer-motion, jrpg, help-menu, focus-management]

requires:
  - phase: 39-01
    provides: useTutorial Zustand store, useHintTarget hook, data-hint-target attributes on key game elements
provides:
  - SpotlightMask SVG-cutout overlay with reduced-motion support
  - HintBubble JRPG-themed positioned speech bubble with Skip/Next controls
  - TutorialOverlay orchestrator wiring useTutorial + useHintTarget into a phase-aware render shell
  - HelpMenu Radix Popover with Replay Tutorial / Reset All Hints (TUTR-04)
  - PhaseRenderer mounts TutorialOverlay as sibling to PhaseInterstitial and PhaseTransition
  - Battle-phase focus guard that preserves focus inside open Radix popovers/menus/dialogs
affects: [40-tutorial-content-and-jrpg-narrator, future overlay/popover work in battle phase]

tech-stack:
  added: []
  patterns:
    - Sibling-overlay pattern for tutorial alongside phase rendering (mirrors PhaseInterstitial)
    - Radix Popover portal + explicit z-[200] to render above in-game z-50/z-100 surfaces
    - Battle focus-steal guard: only autofocus when activeElement is body/null and not inside [data-radix-popper-content-wrapper]/[role=dialog|menu|listbox]
    - Pixel-font sizing rule of thumb: w-72 minimum for two-line stacked menu items

key-files:
  created:
    - client/src/components/tutorial/SpotlightMask.tsx
    - client/src/components/tutorial/HintBubble.tsx
    - client/src/components/tutorial/TutorialOverlay.tsx
    - client/src/components/tutorial/HelpMenu.tsx
  modified:
    - client/src/components/game/phases/PhaseRenderer.tsx
    - client/src/components/game/PlayerHUD.tsx
    - client/src/components/game/PlayerController.tsx
    - client/src/components/game/BossDisplay.tsx

key-decisions:
  - "TutorialOverlay reads from store directly (no props) so PhaseRenderer mount point stays trivial"
  - "TUTORIAL_STEPS placeholder + exported TutorialStep type defers content authoring to Phase 40"
  - "PopoverContent z-[200] (above SpotlightMask z-100 / HintBubble z-101) so help menu can never be obscured by tutorial UI"
  - "Battle focus guard uses closest() against Radix selectors instead of an explicit allow-list of components, so future popovers/menus inherit the protection"
  - "boss-health attribute placed on the fullscreen branch of BossDisplay (the path PhaseContainer actually renders); the non-fullscreen branch already had it from Plan 01 but never executed"

patterns-established:
  - "Tutorial overlay sibling-render pattern (TutorialOverlay alongside PhaseInterstitial in PhaseRenderer)"
  - "Radix popover defensive focus-guard pattern for fullscreen-canvas games"
  - "z-index ladder for tutorial: SpotlightMask 100, HintBubble 101, HelpMenu popover 200"

requirements-completed: [TUTR-04]

duration: ~1h (incl. checkpoint debugging)
completed: 2026-05-06
---

# Phase 39 Plan 02: Tutorial Overlay & Help Menu Summary

**SpotlightMask, HintBubble, and TutorialOverlay components plus a Radix-Popover HelpMenu mounted in PlayerHUD — wired to the Plan 01 store/hook with a battle-phase focus guard that keeps popovers from auto-closing.**

## Accomplishments

- Three tutorial visual components (SpotlightMask, HintBubble, TutorialOverlay) ready for Phase 40 content authoring
- HelpMenu in PlayerHUD with Replay Tutorial / Reset All Hints, satisfying TUTR-04
- TutorialOverlay mounted as sibling in PhaseRenderer following the established Phase 38 pattern
- Battle-phase focus auto-steal no longer dismisses Radix popovers/menus/dialogs
- BossDisplay's `data-hint-target="boss-health"` now sits on the actual rendered (fullscreen) branch

## Task Commits

1. **Task 1: SpotlightMask, HintBubble, TutorialOverlay components** — `c592826` (feat)
2. **Task 2: HelpMenu + mount overlay/menu in game UI** — `9514d7c` (feat)
3. **Task 3: Human-verify checkpoint** — verification fixes in `e19726d` (fix)
   - PlayerController focus guard
   - HelpMenu width/z-index/layout
   - BossDisplay boss-health attribute branch fix

## Files Created/Modified

- `client/src/components/tutorial/SpotlightMask.tsx` — full-viewport SVG mask with cutout + framer-motion entry/exit, reduced-motion aware
- `client/src/components/tutorial/HintBubble.tsx` — positioned speech bubble (top/bottom/left/right), Skip/Next controls, optional step label
- `client/src/components/tutorial/TutorialOverlay.tsx` — orchestrator reading useTutorial + useHintTarget; hydration guard; 350ms post-PhaseTransition delay before locating target; exports `TutorialStep` type
- `client/src/components/tutorial/HelpMenu.tsx` — Radix Popover (w-72, z-[200]) with Replay Tutorial / Reset All Hints, toast feedback
- `client/src/components/game/phases/PhaseRenderer.tsx` — mounts `<TutorialOverlay />` as sibling between PhaseInterstitial and PhaseTransition
- `client/src/components/game/PlayerHUD.tsx` — HelpMenu rendered in host controls area, visible to all players (placed before host-gated abandon button)
- `client/src/components/game/PlayerController.tsx` — focus guard skips auto-steal when focus is inside Radix popover/menu/dialog or any non-body element
- `client/src/components/game/BossDisplay.tsx` — moved `data-hint-target="boss-health"` to the fullscreen branch (the path PhaseContainer renders)

## Decisions Made

- **Sibling render over wrapping** — TutorialOverlay sits alongside PhaseInterstitial/PhaseTransition rather than inside them, matching Phase 38's interstitial pattern. Keeps each system's AnimatePresence isolated.
- **z-[200] for HelpMenu popover** — many in-game overlays use z-50, and the tutorial layer uses z-100/101; 200 keeps the help menu reliably on top without competing with future tutorial overlays.
- **Selector-based focus guard** — using `closest('[data-radix-popper-content-wrapper],[role=dialog],[role=menu],[role=listbox]')` instead of named-component checks means future Radix surfaces inherit the protection automatically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: Plan execution issue] PlayerController stole focus from open popovers**
- **Found during:** Task 3 (human-verify) — clicking the help button opened then immediately closed the popover
- **Issue:** PlayerController's ref-callback re-focused the game container on every battle-phase render; Radix Popover auto-closed on focus loss
- **Fix:** Skip auto-focus when activeElement is non-body or sits inside a Radix popper/dialog/menu/listbox
- **Files modified:** client/src/components/game/PlayerController.tsx
- **Verification:** Popover opens and remains open; toasts fire on each menu item
- **Committed in:** e19726d

**2. [Rule: Plan execution issue] HelpMenu popover content clipped/wrapping incorrectly**
- **Found during:** Task 3 (human-verify) — content visually clipped, items wrapped onto two lines, items rendered side-by-side under whitespace-nowrap, then text overflowed button hover bg under pixel font
- **Issue:** w-56 too narrow for the project's pixel font; raw `<button>` is inline-block so `space-y-2` produced horizontal layout; popover z-50 collided with in-game z-50 surfaces
- **Fix:** Switched container to `flex flex-col gap-2` (forces vertical stacking regardless of child display), set buttons to `block whitespace-nowrap`, widened popover to w-72, set z-[200], added collisionPadding=16
- **Files modified:** client/src/components/tutorial/HelpMenu.tsx
- **Verification:** Vertical stacking, no overflow, popover visible above all in-game overlays in battle phase
- **Committed in:** e19726d

**3. [Rule: Plan execution issue] data-hint-target="boss-health" on unreachable branch**
- **Found during:** Task 3 (human-verify) — `document.querySelector('[data-hint-target="boss-health"]')` returned null in battle phase
- **Issue:** Plan 01 placed the attribute on the non-fullscreen branch of BossDisplay; PhaseContainer always renders BossDisplay with `fullscreen=true`, so the attribute was never in the DOM
- **Fix:** Added the same attribute to the HealthBar wrapper in the fullscreen branch (line 385). Left the non-fullscreen attribute in place so any future non-fullscreen usage still works.
- **Files modified:** client/src/components/game/BossDisplay.tsx
- **Verification:** Console snippet returns true for boss-health in battle phase
- **Committed in:** e19726d

---

**Total deviations:** 3 auto-fixed (all surfaced by the human-verify checkpoint; none changed plan scope).
**Impact on plan:** All three were necessary to make the verification criteria pass; no scope creep.

## Issues Encountered

- **Pre-existing reconnection bug (out of scope)** — During checkpoint testing, restarting the dev server while in an active lobby produced duplicate self in the roster and demoted the original host on rejoin. localStorage `scrum-monsters-current-lobby` and `scrum-monsters-lobby-snapshot` referenced different `lobbyId`s and the reconnect token was scoped to the stale snapshot. This pre-dates Phase 39 and was filed as **Phase 41: Reconnection State Bugfix** under v5.0 (blocks milestone ship).
- **Pre-existing `lobby_updated` deprecated-event warning** — Server still emits `lobby_updated` despite the fine-grained-events migration in Phase 5. Out of scope for this plan; surfaced for tracking.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Tutorial overlay infrastructure is ready for Phase 40 to author content (`TUTORIAL_STEPS` constant in TutorialOverlay.tsx, `TutorialStep` type exported)
- All five `data-hint-target` attributes resolve correctly in their respective rendering phases (boss-health and player-* in battle, vote-cards in scoring, ability-bar in battle, help-menu always)
- HelpMenu visible to all players, not host-gated
- Phase 41 reconnection bug should be resolved before milestone ship; does not block Phase 40 work

---
*Phase: 39-tutorial-foundation*
*Completed: 2026-05-06*
