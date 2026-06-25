---
title: "Hit Tab for controls" throws an exception (long-standing)
discovered: long-standing; re-flagged 2026-06-24 during Phase 47–52 UAT
severity: medium (functional — the debug/controls overlay is the intended Tab action)
status: code-analyzed, NOT yet reproduced in automation, fix not applied
area: client / battle-phase Tab key handling
reporter: Preston (observed manually); confirmed code paths during UAT
---

# Bug: pressing Tab in battle ("Hit Tab for controls") throws an exception

## Symptom (user-reported)

During battle, the boss header shows the hint **"Hit Tab for controls"**. Pressing Tab
throws a runtime exception. Long-standing; user wants it marked for a fix.

## Key finding: TWO competing Tab keydown handlers fire on the same press

There are two independent `window` keydown listeners that both react to Tab, both call
`event.preventDefault()`, and both toggle a modal:

1. **`client/src/components/game/PlayerController.tsx:127`**
   ```js
   if (event.code === 'Tab') {
     event.preventDefault();
     setShowDebugModal(prev => !prev);   // debug overlay (viewport/world/camera + players)
     return;
   }
   ```
   The debug modal it opens (PlayerController.tsx ~L1105–1145) reads `viewport.worldWidth`,
   `viewport.worldHeight`, `viewport.scale`, `viewport.cameraX`, `viewport.cameraY`. If
   `viewport` (or any of these) is undefined/partial in the current phase, the render throws.

2. **`client/src/components/game/BattleScreen.tsx:164`**
   ```js
   if (event.key === 'Tab' && currentLobby?.gamePhase === 'battle' && !showEmoteModal) {
     event.preventDefault();
     setShowTeamCompetitionModal(prev => !prev);   // TeamCompetitionModal
   }
   ```
   Note one handler keys off `event.code === 'Tab'` and the other off `event.key === 'Tab'`.
   During `gamePhase === 'battle'` BOTH fire on a single Tab press → the debug modal AND the
   TeamCompetitionModal both toggle at once. The exception most likely originates in one of
   these two modal renders (TeamCompetitionModal needs team-competition data that may be
   absent; the debug modal needs a fully-populated `viewport`).

There is also a Tab/Escape close handler in `TeamCompetitionModal.tsx:13`.

## Reproduction status (automation)

Could NOT reproduce a catchable error via Playwright in this UAT run:
- Pressed Tab in the **discussion** sub-phase → no console.error / pageerror, debug modal
  toggled fine.
- Pressed Tab during the **battle** phase (boss 141/141, before reveal) with pageerror +
  console.error listeners attached → no error captured.
- Advancing the single-ticket battle jumped straight to VICTORY before a clean re-test.

Hypothesis for why automation didn't surface it: the throw is likely swallowed by a React
error boundary (so it shows in React's dev error overlay / red screen rather than as an
uncaught `pageerror`), OR it requires a specific data state (e.g. TeamCompetitionModal with
>1 team actively scored, or `viewport` not yet initialized on the very first Tab). The user
reproduces it manually, so the exact trigger state is known to them.

## Recommended next steps to fix

1. Reproduce with React DevTools open (or check the dev red-screen overlay) in an active
   `gamePhase === 'battle'` with the boss present, to capture the component + stack.
2. Decide the intended Tab behavior — it currently does TWO things. Almost certainly only
   ONE modal should open on Tab. Consolidate to a single handler (or gate them mutually
   exclusive) so Tab isn't double-handled.
3. Harden the opened modal against missing data:
   - Debug modal: guard `viewport` (`viewport?.worldWidth ?? 0`, etc.) before rendering.
   - TeamCompetitionModal: guard against undefined team-competition/score data.
4. Add a smoke test: render the battle view in `gamePhase === 'battle'`, dispatch a Tab
   keydown, assert no throw and that exactly one modal opens.

## Related observation (possible separate bug — scale inconsistency)

During the same session: lobby Estimation Scale was set to **doubling** (initial vote
picker correctly showed 1,2,4,8,16,32,64,128,256). But the **TEAM DISCUSSION "update your
estimate" picker showed Fibonacci** (1,2,3,5,8,13,21). The discussion-phase re-vote picker
may be hardcoded to Fibonacci / not reading the configured scale. Worth confirming
separately; not related to the Tab exception.
