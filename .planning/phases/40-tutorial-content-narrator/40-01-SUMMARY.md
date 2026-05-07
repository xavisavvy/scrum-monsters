---
phase: 40-tutorial-content-narrator
plan: 01
subsystem: tutorial
tags: [tutorial, content, hints, zustand, narrator-data]
requires:
  - phase-39 tutorial foundation (useTutorial store, TutorialOverlay, HintBubble, useHintTarget)
provides:
  - NarratorId / NARRATORS / TutorialStep / TUTORIAL_STEPS exported from useTutorial
  - useFirstEncounter hook (latched first-condition-true firing of `hint:*`)
  - TutorialOverlay per-phase auto-start + auto-skip-on-missing-target (hint complete, walkthrough advance/complete)
  - HelpMenu Replay Tutorial = current phase walkthrough
  - 10 new data-hint-target attributes wired across game UI
  - 4 contextual hint mounts (combo/item/telegraph/vote-reveal) in BattlePhase + RevealPhase
affects:
  - client/src/components/tutorial/HintBubble.tsx (narrator prop accepted, render in 40-02)
tech-stack:
  added: []
  patterns:
    - Zustand selector subscriptions for per-phase reactivity
    - Ref-latch + completedHints persistent latch (Pitfall 5 ordering: dismissHint before startTutorial)
    - 350ms locateTarget debounce + auto-skip policy split by id namespace (hint vs walkthrough)
key-files:
  created:
    - client/src/lib/hooks/useFirstEncounter.ts
    - client/src/lib/hooks/useFirstEncounter.test.ts
    - client/src/components/tutorial/TutorialOverlay.test.tsx
  modified:
    - client/src/lib/stores/useTutorial.tsx
    - client/src/lib/stores/useTutorial.test.ts
    - client/src/components/tutorial/TutorialOverlay.tsx
    - client/src/components/tutorial/HintBubble.tsx
    - client/src/components/tutorial/HelpMenu.tsx
    - client/src/components/game/Lobby.tsx
    - client/src/components/game/LobbyReadyButton.tsx
    - client/src/components/game/AvatarSelection.tsx
    - client/src/components/game/ScoreSubmission.tsx
    - client/src/components/game/BossTelegraph.tsx
    - client/src/components/game/combat/ItemBar.tsx
    - client/src/components/game/phases/BattlePhase.tsx
    - client/src/components/game/phases/RevealPhase.tsx
decisions:
  - First-combo hint anchored to persistent boss-health (not transient combo-notification) — eliminates typewriter-vs-dismissal timing race
  - Walkthrough auto-skip-on-missing-target advances mid-walkthrough or completes on last step — closes ROADMAP Phase 40 success criterion #4 generically (non-host lobby step 3 etc.)
  - HintBubble narrator prop wired through but unused (visual rendering deferred to plan 40-02)
  - ComboNotification.tsx intentionally NOT modified — its data-hint-target is no longer needed
metrics:
  duration_minutes: 11
  completed_date: "2026-05-07"
  task_count: 3
  file_count: 16
---

# Phase 40 Plan 01: Tutorial walkthrough content and contextual hints — Summary

**One-liner:** Authored 14 tutorial step entries (10 walkthrough + 4 hints) wired through three narrators (Guild Master / Battle Advisor / Sage), shipped useFirstEncounter hook for latched contextual hints, and extended TutorialOverlay with per-phase auto-start plus generic auto-skip-on-missing-target for both hints and walkthroughs.

## What Shipped

### Data
- `useTutorial.tsx` now exports `NarratorId`, `NARRATORS` const map (3 narrators), `TutorialStep` type with required `narrator` field, and a populated `TUTORIAL_STEPS` map.
- 3 walkthroughs: `walkthrough:lobby` (3 steps, Guild Master), `walkthrough:avatar_selection` (2 steps, Guild Master), `walkthrough:battle` (5 steps, Battle Advisor).
- 4 hints: `hint:first-combo` (Battle Advisor → boss-health), `hint:first-item` (Battle Advisor → item-bar), `hint:first-telegraph` (Battle Advisor → boss-telegraph), `hint:first-vote-reveal` (Sage → reveal-summary).

### Hook
- `useFirstEncounter(hintId, condition)` — fires `startTutorial("hint:${id}")` once when condition flips true and `completedHints[id]` is false. Calls `dismissHint` BEFORE `startTutorial` so HMR/remount cannot replay (Pitfall 5).

### Orchestration
- `TutorialOverlay` gained per-phase auto-start effect (subscribes to `currentLobby?.gamePhase`).
- The 350ms `locateTarget` debounce now applies a self-skip policy when the rect resolves to null:
  - `hint:*` → `completeTutorial(activeTutorial)` (clears zombie state).
  - `walkthrough:*` with a next step → `advanceStep()`.
  - `walkthrough:*` on the last step → `completeTutorial(activeTutorial)`.
- Cascade is intentional: if multiple steps in a walkthrough have missing targets, the overlay walks through them automatically until it finds one or completes.

### UI wiring
- 10 new `data-hint-target` attributes added (Lobby ×3, LobbyReadyButton, AvatarSelection ×2, ScoreSubmission, BossTelegraph, ItemBar, RevealPhase). Existing `boss-health`, `vote-cards`, `ability-bar`, `help-menu`, `player-hud`, `player-info` are reused (no double-up).
- BattlePhase mounts three `useFirstEncounter` calls (combo/item/telegraph) using selector subscriptions over `useComboState`/`useItemStore`/`useGameState`.
- RevealPhase mounts the `first-vote-reveal` hook on `phase === 'reveal'`.
- HelpMenu's "Replay Tutorial" now resets and starts `walkthrough:${currentPhase}`, falling back to a toast if the phase has no walkthrough.

## Verification

- `npm run check`: TypeScript clean.
- `npm test`: full suite green — 30 test files, 656 tests, 0 failures.
- New tests: `useFirstEncounter.test.ts` (3), `TutorialOverlay.test.tsx` (7), `useTutorial.test.ts` extended with `TUTORIAL_STEPS integrity` block (4 new tests).
- All 10 data-hint-target attributes verified present via node grep gate (acceptance criteria for Task 3).
- Lint: 12 pre-existing errors, none added by this plan (verified by stash + lint comparison).

## Deviations from Plan

### Adjustments

**1. [Rule 1 - Bug] TutorialOverlay test isolation** — During Task 0+1+2 verification, three tests failed because Zustand action references leaked between test cases (one test's `vi.fn` spy persisted into the next test's reads of `useTutorial.getState().completeTutorial`).
- Fix: Captured pristine action references once at top of test file via `const PRISTINE = { ... }`, then restored them inside `beforeEach` via `useTutorial.setState({ ...PRISTINE, ... })`.
- Files modified: `client/src/components/tutorial/TutorialOverlay.test.tsx`.
- Commit: 2475762.

**2. [Process] RED-only commit blocked by pre-commit `npm test`** — The husky pre-commit hook runs the full test suite, so the planned standalone Wave-0 RED commit (which expects failing tests) cannot land. Test scaffolds were instead bundled with their corresponding implementation commits (Task 1 store + integrity tests; Task 2 overlay + overlay tests). Net effect: still RED→GREEN, but at the per-task level rather than the per-wave level. Commit boundaries match the plan's task boundaries.

### CLAUDE.md compliance
- All commits use Conventional Commits (`feat(40-01): ...`); commitlint hook passed (after a single body-line-length retry on commit messages).
- Path aliases preserved (`@/` and `@shared`).

## Known Stubs

None. All wiring is functional — narrator prop on HintBubble flows through but is intentionally unrendered until plan 40-02 adds the typewriter + name header (documented in code as `// consumed in plan 40-02`).

## Threat Flags

None. Phase 40 introduces no new trust boundaries; all tutorial content is author-controlled compile-time literals.

## Phase 39 Invariants Preserved

- z-index ladder unchanged (SpotlightMask 100, HintBubble 101, HelpMenu popover 200).
- Battle focus guard untouched (no new `autoFocus`/`tabIndex` added inside HintBubble).
- `useTutorial` store still decoupled from `useGameState` — auto-start logic lives in TutorialOverlay (not in the store), per Phase 39 anti-pattern guidance.

## Commits

| Hash | Subject |
| ---- | ------- |
| cba7378 | feat(40-01): extend useTutorial with NARRATORS and TUTORIAL_STEPS; add useFirstEncounter |
| 2475762 | feat(40-01): TutorialOverlay auto-start and auto-skip-on-missing-target |
| a20cb49 | feat(40-01): wire 10 data-hint-target attrs and mount useFirstEncounter hooks |

## Self-Check: PASSED

- All listed `created` files exist on disk.
- All listed `modified` files exist on disk and contain the documented changes.
- All three commit hashes resolve in `git log`.
- 656 tests pass, 0 fail.
