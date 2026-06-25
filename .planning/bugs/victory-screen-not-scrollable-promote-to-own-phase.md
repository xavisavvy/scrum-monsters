---
title: Victory screen not scrollable — promote it out of battle phase into its own phase
discovered: 2026-06-24 (Phase 47–52 UAT)
type: feature / refactor (UX)
severity: medium (content/buttons can be unreachable on shorter viewports)
status: proposed by user, root-caused, not yet implemented
area: client / VictoryPhase + BattleScreen phase structure
reporter: Preston
---

# Victory screen: not scrollable; move into its own phase

## Observation (user)

The victory screen shown after defeating all bosses is **not scrollable**. The content at
the bottom is mostly low-value except the **Return Home** button. Proposal: move the victory
screen **out of the battle phase into its own dedicated phase**, and de-emphasize the
bottom content while keeping Return Home reachable.

## Root cause

`client/src/components/game/phases/VictoryPhase.tsx:85` already declares a scroll container:

```jsx
<div className="p-6 max-h-screen overflow-y-auto">
```

…and the Battle Summary list has its own `max-h-[40vh] overflow-y-auto` (L132). BUT
VictoryPhase is rendered **inside the BattleScreen**, whose outer wrapper is a fixed,
clipped layer (`fixed inset-0 ... overflow-hidden` — confirmed at runtime: the only
overflowing element on the victory screen was that background wrapper, `overflowY: hidden`).
Because the victory content lives within that fixed/overflow-hidden battle container, its
own `overflow-y-auto` can't engage against the true viewport — so on viewports shorter than
the content, the bottom (potentially including Return Home / Copy All Results buttons) is
clipped with no scroll.

Buttons present on the victory screen: `📋 Copy All Results (Host)`, `Return Home`.

## Proposed change (per user)

1. **Promote victory to its own top-level game phase** (e.g. a `victory` phase rendered by
   GamePage directly, NOT nested under BattleScreen). This gives it a real, viewport-height
   scroll container instead of inheriting BattleScreen's `overflow-hidden` fixed layer.
   - Note: `GamePhase` already includes `'victory'` in the union (see CLAUDE.md game-flow);
     this is wiring the render path, not inventing a new phase.
2. **Reprioritize the layout**: keep the headline (VICTORY! + story-point totals) and a
   **prominent, always-reachable Return Home** action (e.g. sticky footer / top action bar),
   and demote the detailed Battle Summary list (it's the least useful part — collapse it,
   or keep it in its own scroll region below the fold).
3. Ensure the new phase container is `min-h-screen` with `overflow-y-auto` at the top level
   so the whole screen scrolls naturally on any viewport.

## Acceptance

- On a short viewport (e.g. 800×600), the entire victory screen is scrollable and the
  Return Home button is always reachable.
- Victory renders as its own phase, not inside the BattleScreen fixed/overflow-hidden layer.
- Return Home remains visible without scrolling (sticky or above-the-fold).

## Related files

- `client/src/components/game/phases/VictoryPhase.tsx` (the screen)
- `client/src/components/game/BattleScreen.tsx` (current parent — fixed/overflow-hidden)
- Phase routing in GamePage / wherever `gamePhase` selects the rendered screen
