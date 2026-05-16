---
status: resolved
slug: tutorial-overlay-no-render
trigger: |
  Tutorial overlay does not render after Replay Tutorial button is clicked
  in battle phase. Toast confirms action fired but no SpotlightMask +
  HintBubble appears. See .planning/phases/39-tutorial-foundation/39-UAT.md
  Gap #1 for full investigation hypotheses, suspected causes (autoskip race,
  isSpotlightVisible not set, resetTutorial racing startTutorial), and
  file:line refs.
phase: 39
created: 2026-05-09
updated: 2026-05-15
resolved: 2026-05-15
---

# Debug Session — Tutorial Overlay No-Render

## Symptoms

- **Expected:** Click "Replay Tutorial" in Help menu → SpotlightMask darkens screen + JRPG-styled HintBubble renders with first walkthrough step (e.g. for `walkthrough:battle`, target `boss-health`).
- **Actual:** Toast `Tutorial started!` appears in upper-right. No overlay renders. Help popover closes (correct). User remains in battle phase with no visible tutorial.
- **Errors:** None reported in browser console (per user observation).
- **Timeline:** Discovered during Phase 39 UAT Test 3 on 2026-05-09. Phase 39 implementation summaries (39-01-SUMMARY.md, 39-02-SUMMARY.md) claim the feature works; UAT proves otherwise.
- **Reproduction:**
  1. Start dev server (`npm run dev`)
  2. Create or join a lobby, select avatar, enter battle phase
  3. Click Help button (HelpCircle icon) in lower-right of PlayerHUD
  4. In the popover, click "Replay Tutorial"
  5. Observe: toast appears, no overlay
  - Verified at `localhost:5002/game/1AT7GJ` (battle phase, boss "Deadline Dragon" visible).

## Known Context (from UAT Gap #1 documentation)

- `client/src/components/tutorial/HelpMenu.tsx:13-26` — `handleReplay` correctly resolves `walkthrough:battle`, calls `resetTutorial(id)` then `startTutorial(id)`, then toasts.
- `client/src/lib/stores/useTutorial.tsx:174+` — `TUTORIAL_STEPS['walkthrough:battle']` is populated with multiple steps (`boss-health`, `vote-cards`, `vote-submit`, etc.).
- `client/src/components/game/BossDisplay.tsx:383,440` — has `data-hint-target="boss-health"`.
- `client/src/components/game/ScoreSubmission.tsx:144,178` — has `data-hint-target="vote-cards"` / `vote-submit`.
- `client/src/components/game/phases/PhaseRenderer.tsx:116` — `<TutorialOverlay />` is mounted **unconditionally** for all phases (re-confirmed 2026-05-09).
- `client/src/components/tutorial/TutorialOverlay.tsx:100-106` — render gates: `isHydrated`, `activeTutorial`, `steps.length > 0`. All should pass after `startTutorial`.
- `client/src/components/tutorial/TutorialOverlay.tsx:62-93` — 350ms `locateTarget` effect with self-skip-on-missing-target policy. Was top hypothesis until console-blank evidence arrived.

## Hypotheses to investigate (in priority order)

1. **HMR did not apply the diagnostic instrumentation** — render-trace `[DEBUG-TUT] render` is at the very top of the `TutorialOverlay()` function body and TutorialOverlay is unconditionally mounted, so it MUST fire on every store update during normal battle play. The user reports a TRULY blank console (no `[DEBUG-TUT]` lines at all). The only explanation consistent with the code: the instrumented file is not loaded in the browser. Causes could be: (a) Vite HMR failed silently for that module, (b) user is on a different tab/old build, (c) dev server on port 5002 is a separate process that isn't watching `client/src/...`, (d) browser console filter is hiding logs. **Highest priority — must disambiguate before any other hypothesis is investigable.**
2. **Auto-skip race on locateTarget** (was H1 in prior round) — Re-promote IFF after hard refresh the render trace fires but locate logs show `rect=null` cascading.
3. ~~`isSpotlightVisible` never set to true~~ — eliminated.
4. ~~resetTutorial races startTutorial~~ — eliminated.

## Current Focus

hypothesis: HMR did not apply the diagnostic instrumentation to the live browser tab. The render-trace at TutorialOverlay.tsx:39 is unconditional and TutorialOverlay is unconditionally mounted in PhaseRenderer.tsx:116, so a blank `[DEBUG-TUT]` filter in console is incompatible with the instrumented code being loaded.
test: Ask user to (a) hard-refresh the tab (Ctrl+Shift+R / Cmd+Shift+R) at localhost:5002, (b) confirm the console filter is not active or is set to "All levels", (c) immediately on page load — BEFORE clicking anything — check whether `[DEBUG-TUT] render` lines appear (they should, repeatedly, during normal battle play). Then click Replay Tutorial and capture the new logs.
expecting:
  - (a) After hard refresh + no clicks, `[DEBUG-TUT] render` lines appear → HMR was the issue. Proceed to capture click-time logs and re-evaluate H2.
  - (b) After hard refresh + no clicks, still no logs → instrumentation truly not in the bundle. Investigate Vite config, dev server port mismatch (5002 vs 5000), or browser console filter.
  - (c) Logs appear pre-click but DISAPPEAR after click → TutorialOverlay is unmounting on click (e.g., a phase transition triggered).
next_action: Awaiting user (a) hard-refresh confirmation, (b) pre-click console state, (c) post-click console state. All log lines start with `[DEBUG-TUT]`.

## Evidence

- timestamp: 2026-05-09 (static analysis)
  - `useTutorial.startTutorial` correctly sets `{ activeTutorial: id, activeStep: 0, isSpotlightVisible: true }` in one batched `set` call (`useTutorial.tsx:39-44`). Hypothesis 2 eliminated.
  - `useTutorial.resetTutorial` only removes the id from `completedTutorials`; does NOT clear `activeTutorial`. Hypothesis 3 eliminated.
  - `data-hint-target="boss-health"` exists on the fullscreen-rendered BossDisplay branch (BossDisplay.tsx:383, fullscreen=true is the path used by PhaseContainer.tsx:98). DOM target should be present at the time of Replay.
  - `<TutorialOverlay />` is unconditionally mounted in `PhaseRenderer.tsx:116` for all phases. Not unmounted on popover interactions.
  - `locateTarget` callback in `useHintTarget.ts:22-45` is stable (`useCallback(..., [])`), calls `el.getBoundingClientRect()`, returns rect or null. If element exists but is `display:none`, `getBoundingClientRect()` returns a zero-rect (not null) — overlay would render at 0,0 (still partially visible). User reports nothing renders → likely the element is genuinely absent OR the rect path is short-circuited.

- timestamp: 2026-05-09 (user repro #1 — instrumented build)
  - User report: "the console is blank" — no `[DEBUG-TUT]` lines after clicking Replay Tutorial.
  - Inconsistency: `console.log('[DEBUG-TUT] render', {...})` is at TutorialOverlay.tsx line 39, in the function body BEFORE any conditional return. TutorialOverlay is mounted in PhaseRenderer.tsx:116 with no gating. Therefore the log MUST fire on every render, including initial mount during battle phase. A truly blank console is only consistent with the instrumented bundle not being in the live tab.
  - Tests 1+2 of UAT had passed (Help button visible, popover stays open, click fires) — those were established in a prior session and may or may not have been on the instrumented build.
  - Dev server port is 5002 (not the default 5000). Possible separate process or port-shifted instance.

## Eliminated Hypotheses

- **H2** (`isSpotlightVisible` never set): `startTutorial` does set it. Confirmed by reading `useTutorial.tsx`.
- **H3** (`resetTutorial` races `startTutorial`): `resetTutorial` does not touch runtime state. Confirmed by reading `useTutorial.tsx`.

## Resolution

**Root cause (2026-05-15):** `TutorialOverlay` was imported and rendered only inside `client/src/components/game/phases/PhaseRenderer.tsx:9,116`. `PhaseRenderer` is dead code — the migration from `BattleScreen`'s inline render path to `PhaseRenderer` was never completed (see comment at `BattleScreen.tsx:721` — *"End of old render function - remove this once PhaseRenderer is working"*). `BattleScreen` mounts `<PlayerHUD />` directly (`BattleScreen.tsx:736`), bypassing `PhaseRenderer` entirely. Therefore `TutorialOverlay` had **zero live mount points** in the running app.

This explained every symptom:
- Help button + popover working (UAT Tests 1+2 ✓) — they're inside PlayerHUD, independent of PhaseRenderer
- `startTutorial()` Zustand state updates fine, toast fires — store works
- No overlay ever renders — nothing consumes the store state
- Console `[DEBUG-TUT]` instrumentation never fired — the instrumented component was on disk but never mounted
- Vitest tests for HelpMenu / HintBubble / useTutorial all pass — they mount components directly; production never did

**Hypotheses ruled out (red herrings, all assumed component was mounting):**
- HMR not applying instrumentation — refuted; instrumented file IS served, just from never-rendered tree
- `locateTarget` 350ms auto-skip cascade — irrelevant, never reached
- `isSpotlightVisible` not set — confirmed irrelevant (state is set, just not consumed)
- `resetTutorial` racing `startTutorial` — confirmed irrelevant
- Reduced motion suppressing overlay — independently verified false by user (overlay blank with reduced motion off)

**Diagnostic path that worked:** Instrument `TutorialOverlay()` at function-body entry with an unconditional render log; observe that the log NEVER fires even on initial page load. The only explanation: TutorialOverlay is not mounted. `grep -rn TutorialOverlay client/src/` confirmed the only live import was in `PhaseRenderer.tsx`; `grep -rn PhaseRenderer client/src/` confirmed PhaseRenderer has no live callers.

**Fix applied (2026-05-15):**
- `client/src/pages/GamePage.tsx` — imported `TutorialOverlay` and rendered it as a sibling to `renderGamePhase()` at the page shell level. Single mount covers every phase (lobby, avatar_selection, battle, scoring, reveal, discussion, victory, next_level, game_over) without per-phase wiring. TutorialOverlay's own render gates (`!isHydrated`, `!activeTutorial`, `steps.length === 0`) make it a no-op outside active tutorials.
- `client/src/components/tutorial/TutorialOverlay.tsx` — debug instrumentation reverted; file restored to pre-debug state.

**Update 2026-05-15 — Second-round UAT exposed two more compounding bugs:**

The GamePage mount fix was necessary but NOT sufficient. User re-ran Test 3 with the overlay mounted and got toast `No tutorial available for this phase` instead of the expected overlay. Direct fiber-API inspection of the Zustand store proved that manual `setState({ isHydrated: true })` + `startTutorial("walkthrough:battle")` rendered the overlay correctly across all 5 steps — confirming the overlay code is sound and isolating the two remaining bugs:

**Bug A — Phase resolution in HelpMenu (`client/src/components/tutorial/HelpMenu.tsx`)**
- `handleReplay` did `walkthrough:${currentPhase}`. For battle sub-phases (`discussion`, `reveal`, `scoring`, `next_level`, `victory`), there is no matching entry in `TUTORIAL_STEPS` — only `walkthrough:lobby`, `walkthrough:avatar_selection`, and `walkthrough:battle` exist. Replay during any battle sub-phase fell through to the "no tutorial" toast.
- Fix: Added `BATTLE_SUB_PHASES` set; `resolveTutorialPhase()` maps all battle sub-phases to `'battle'`.

**Bug B — Hydration callback not firing (`client/src/lib/stores/useTutorial.tsx`)**
- The inline `onRehydrateStorage: () => (_state, error) => { if (!error) setState({ isHydrated: true }); }` was not reliably firing — observed `isHydrated: false` on page load. `TutorialOverlay.tsx:99` `if (!isHydrated) return null` short-circuited the entire render.
- Likely cause: `persist` with synchronous localStorage can complete rehydration BEFORE the inline callback subscriber is wired up, especially under certain bundler output orderings. The callback timing was racing module initialization.
- Fix: Removed the inline `onRehydrateStorage`. Replaced with the canonical post-creation API at module bottom:
  - `useTutorial.persist.hasHydrated()` synchronous check for "already done" case
  - `useTutorial.persist.onFinishHydration(...)` subscriber for the async case
  Both set `isHydrated: true`, so it's reliably true under any timing.

**Final fix verified 2026-05-15:** Tutorial overlay renders correctly when replayed from any battle sub-phase. All 5 walkthrough steps advance and complete. Completion persists across reload — localStorage `scrumquest-tutorial` shows `completedTutorials: { 'walkthrough:battle': true }`.

**Files changed (final):**
- `client/src/pages/GamePage.tsx` — +2 lines (import + JSX sibling mount of `<TutorialOverlay />`)
- `client/src/components/tutorial/HelpMenu.tsx` — added BATTLE_SUB_PHASES set and resolveTutorialPhase() helper
- `client/src/lib/stores/useTutorial.tsx` — replaced inline `onRehydrateStorage` with post-creation `persist.onFinishHydration` + `hasHydrated()` guard

**Lessons for future debugging:**
1. When a component instrumented with an unconditional render trace shows zero logs, the FIRST step is to verify the component is actually mounted in the live tree — not to investigate render-internal logic.
2. Vitest passing for HelpMenu / HintBubble / useTutorial gave false confidence: tests mounted components directly, hiding the dead-mount-tree issue. Add an integration test that asserts `<TutorialOverlay />` mounts somewhere in the GamePage tree.
3. Zustand persist's inline `onRehydrateStorage` is timing-fragile. Prefer the post-creation `persist.onFinishHydration` + `hasHydrated()` pattern for hydration-completion side effects.

**Follow-up cleanup (out of scope for this gap):**
- `client/src/components/game/phases/PhaseRenderer.tsx` and the rest of the `phases/` registry are dead code. Either complete the migration in a future tech-debt phase or delete the dead path. Track separately.
- `client/src/components/tutorial/TutorialOverlay.tsx.debugbak` and other `.bak`/`.debugbak` files in the working tree can be deleted.
- Add an integration test asserting `<TutorialOverlay />` is mounted in the GamePage tree (would have caught this).
