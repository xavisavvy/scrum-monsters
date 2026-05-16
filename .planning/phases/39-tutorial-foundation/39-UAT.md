---
status: complete
phase: 39-tutorial-foundation
source: [39-01-SUMMARY.md, 39-02-SUMMARY.md]
started: 2026-05-06T22:30:00Z
updated: 2026-05-15T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Help menu button visible in battle phase
expected: In battle phase, a Help button is visible in PlayerHUD for all players (not host-only).
result: PASS (2026-05-09)

### 2. Help menu opens and stays open
expected: Clicking the Help button opens a popover containing "Replay Tutorial" and "Reset All Hints" options. The popover stays open (does not auto-close from focus stealing) until you click outside or press Escape.
result: PASS (2026-05-09)

### 3. Replay Tutorial triggers overlay
expected: Clicking "Replay Tutorial" closes the help menu and renders the tutorial overlay — a darkened SpotlightMask with a JRPG-styled HintBubble somewhere on screen. (Step text may be placeholder; actual content authoring lands in Phase 40.) Skip/Next controls are visible in the bubble.
result: PASS (2026-05-15) — Gap #1 resolved (3 compounding bugs fixed: GamePage mount, HelpMenu phase resolution, useTutorial hydration). Tutorial walkthrough renders correctly across all 5 battle steps.

### 4. Reset All Hints fires confirmation
expected: Clicking "Reset All Hints" produces a toast notification confirming the action (e.g., "Hints reset" / "All hints cleared").
result: PASS (2026-05-15)

### 5. Tutorial completion persists across reload
expected: After dismissing/completing the tutorial overlay, reload the browser tab. The tutorial does NOT auto-replay (completion state was persisted to localStorage via the useTutorial store's partialize). DevTools → Application → Local Storage should show a `useTutorial`-keyed entry with the completion flag.
result: PASS (2026-05-15) — `scrumquest-tutorial` localStorage entry shows `completedTutorials: { 'walkthrough:battle': true }` after completion and survives reload.

## Summary

total: 5
passed: 5
failed: 0
blocked: 0
pending: 0
skipped: 0
gaps: 1 resolved (Gap #1 in-scope); 1 still open (Gap #2 out-of-scope avatar regression)

## Gaps

### Gap #1 — Replay Tutorial fires toast but no overlay renders (Test 3) — RESOLVED 2026-05-15

**Resolution:** Three compounding bugs were uncovered by `/gsd-debug` session `tutorial-overlay-no-render` and fixed together:

1. **Mount bug** (`client/src/pages/GamePage.tsx`) — `<TutorialOverlay />` was only rendered inside `PhaseRenderer.tsx`, which is dead code (the migration from `BattleScreen`'s inline render path was never completed; comment at `BattleScreen.tsx:721` flags this). Fixed by mounting `<TutorialOverlay />` at the GamePage shell so a single mount covers every phase.
2. **Phase resolution bug** (`client/src/components/tutorial/HelpMenu.tsx`) — `handleReplay` did `walkthrough:${currentPhase}`, which fails for battle sub-phases (`discussion`, `reveal`, `scoring`, `next_level`, `victory`) because those don't have their own tutorials. Fixed by mapping all battle sub-phases to `walkthrough:battle`.
3. **Hydration bug** (`client/src/lib/stores/useTutorial.tsx`) — the inline `onRehydrateStorage` callback was not firing reliably, leaving `isHydrated: false` and causing `TutorialOverlay` to short-circuit at its hydration guard. Fixed by replacing with the canonical `useTutorial.persist.onFinishHydration(...)` + `useTutorial.persist.hasHydrated()` post-creation pattern.

Verified end-to-end 2026-05-15: replay fires from any battle sub-phase, all 5 walkthrough steps render and advance correctly, completion persists across reload.

**Original diagnosis (kept for historical context):**

**Symptom:** Clicking "Replay Tutorial" in the Help menu while in the battle phase shows the toast `Tutorial started!` but no SpotlightMask + HintBubble overlay ever appears. (Verified 2026-05-09 against `localhost:5002/game/1AT7GJ`, battle phase active with boss visible.)

**What we know:**
- `client/src/components/tutorial/HelpMenu.tsx:13-26` correctly resolves `walkthrough:battle`, calls `resetTutorial(id)` then `startTutorial(id)`, then toasts.
- `TUTORIAL_STEPS['walkthrough:battle']` is populated (`client/src/lib/stores/useTutorial.tsx:174+`) with multiple steps targeting `boss-health`, `vote-cards`, `vote-submit`, etc.
- `data-hint-target="boss-health"` exists in `BossDisplay.tsx:383,440`. `vote-cards` + `vote-submit` exist in `ScoreSubmission.tsx:144,178`.
- `<TutorialOverlay />` is mounted in `PhaseRenderer.tsx:116`.
- The overlay's render gates (line 100-106) require `isHydrated`, `activeTutorial`, `steps.length > 0` — all should pass after `startTutorial`.

**Likely cause (untested):** The 350ms `locateTarget` effect in `TutorialOverlay.tsx:62-93` self-skips when target is missing. If `startTutorial` runs while React hasn't re-rendered the boss-health div yet (timing race after popover close), the auto-skip cascades through every step and silently calls `completeTutorial`. The user sees: toast → nothing.

**Suggested investigation paths (in priority order):**
1. Add a console.log in TutorialOverlay's locateTarget effect to confirm whether it's auto-skipping. If yes, the fix is either: increase the timeout, retry on null before skipping, or only auto-skip after a configurable retry budget.
2. Verify `isSpotlightVisible` is being set to `true` by `startTutorial`. If the store action only sets activeTutorial but not the visibility flag, the SpotlightMask stays hidden.
3. Check whether `resetTutorial` is clearing `activeTutorial` AFTER `startTutorial` set it (a race in the same handler).

**Severity:** high — this breaks the entire user-facing tutorial replay flow that Phase 39 was supposed to deliver. INFRA-01 of Phase 39 (the help menu) works; the actual tutorial doesn't render.

### Gap #2 — Character selection skipped on first battle creation

**Symptom:** Creating a fresh battle drops the user directly into lobby with `warrior` pre-selected, never showing the avatar selection screen. Reported during 2026-05-09 UAT; not part of the original test list.

**Suspected scope:** Could be:
- A persistence bug — avatar from a prior session is being read from localStorage and treated as "already selected"
- A phase-router bug — `avatar_selection` is being skipped if `currentLobby.localPlayer.avatar !== null`
- A regression from Phase 41 (reconnection) or Phase 43 (auth) where session restoration leaks avatar state into a fresh lobby

**Investigation needed:** This is likely outside Phase 39's scope (avatar selection ships in earlier phases) but was discovered during Phase 39 UAT and warrants a separate /gsd-debug session to pin down which phase introduced the regression.

**Severity:** medium — UX regression but doesn't block gameplay; user can still play with the default avatar. Worth investigating before the next milestone ships.
