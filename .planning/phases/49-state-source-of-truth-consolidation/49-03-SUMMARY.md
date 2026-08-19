---
phase: 49-state-source-of-truth-consolidation
plan: "03"
subsystem: client-render-perf
tags: [zustand, selectors, react-memo, useShallow, render-perf, maint-06]
completed: 2026-06-22

dependency_graph:
  requires: []
  provides:
    - scoped-zustand-selectors-battle-components
    - maint-06-perf-guardrail-test
  affects:
    - client/src/components/game/PlayerCharacter.tsx
    - client/src/components/game/PlayerController.tsx
    - client/src/components/game/PlayerCharacter.test.tsx

tech_stack:
  added:
    - zustand/react/shallow (useShallow — first use in project; was bundled, now imported)
  patterns:
    - "scalar Zustand selector: useGameState(s => s.field?.nested ?? default)"
    - "useShallow for multi-field object: useGameState(useShallow(s => s.obj ? { a: s.obj.a } : null))"
    - React.memo wrapping named function export

key_files:
  modified:
    - client/src/components/game/PlayerCharacter.tsx
    - client/src/components/game/PlayerCharacter.test.tsx
    - client/src/components/game/PlayerController.tsx

decisions:
  - "Replaced whole-store useGameState() with scalar selectors in PlayerCharacter (hp, maxHp) and useShallow for attackAnimations"
  - "Used useShallow with explicit field shape for PlayerController currentPlayer {id,team,avatar,name} and currentLobby {id,gamePhase,players,playerPositions,playerCombatStates} — boss intentionally excluded"
  - "Replaced currentLobby?.boss existence guard with currentLobby?.gamePhase === 'battle' (boss not in selector shape)"
  - "TrackingWrapper mirrors PlayerCharacter selectors to get reliable render count matching PlayerCharacter re-render schedule"
  - "Added JSDoc to onPlayerPositionsUpdate prop requiring useCallback at call sites"

metrics:
  duration: 15 minutes
  completed_date: 2026-06-22
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
  tests_added: 1
  test_count_before: 909
  test_count_after: 910
---

# Phase 49 Plan 03: Scoped Selectors (MAINT-06) Summary

Scoped Zustand selectors + React.memo in PlayerCharacter and PlayerController — boss-HP setLobby no longer re-renders the battle component tree.

## What Was Built

**Task 1 — PlayerCharacter scoped selectors + perf guardrail test (commit 567fe1d):**

- `PlayerCharacter.tsx`: replaced `const { currentLobby, attackAnimations } = useGameState()` (whole-store sub) with three targeted selectors: `currentHp` and `maxHp` as scalar selectors keyed on `playerId`, `attackAnimations` via `useShallow`. Removed the now-redundant `combatState` derivation lines. Added `import { useShallow } from 'zustand/react/shallow'`.
- `PlayerCharacter.test.tsx`: added `MAINT-06 perf guardrail` describe block. A `TrackingWrapper` mirrors `PlayerCharacter`'s own selector subscriptions (hp/maxHp), giving a `renderCount` that increments exactly when `PlayerCharacter` re-renders. Boss-HP change: `renderCount === renderCountAfterMount` (no re-render). Own-HP change: `renderCount === renderCountAfterMount + 1` (re-renders). DOM assertion also confirms health bar updates to `70%`.

**Task 2 — PlayerController scoped selectors + React.memo (commit 880589a):**

- `PlayerController.tsx`: added `import { useShallow } from 'zustand/react/shallow'`. Changed export from `export function PlayerController` to `export const PlayerController = React.memo(function PlayerController...)` with closing `});`. Replaced L20 whole-store destructure with: `currentPlayer` via `useShallow` over `{id,team,avatar,name}`; `currentLobby` via `useShallow` over `{id,gamePhase,players,playerPositions,playerCombatStates}` (boss excluded); `addAttackAnimation` as stable scalar. Added JSDoc note on `onPlayerPositionsUpdate` requiring `useCallback` at call sites. Fixed `currentLobby?.boss` guard to `currentLobby?.gamePhase === 'battle'`.

## Verification

- `npx vitest run client/src/components/game/PlayerCharacter.test.tsx` — 4/4 tests pass (3 existing + 1 new guardrail)
- `npm run check` — 0 TypeScript errors
- `npm run lint` — 0 ESLint problems
- `npm test` (full suite) — 910/910 tests pass (0 failures)

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] TrackingWrapper uses mirror-subscription pattern**

- **Found during:** Task 1 (render-count test design)
- **Issue:** `PlayerCharacter` is already `React.memo` wrapped. Since Zustand notifies subscribers directly (not through the parent component tree), a plain `TrackingWrapper` with no store subscriptions would not re-render when `PlayerCharacter`'s own selectors change — making `renderCount` always equal to `renderCountAfterMount` regardless of HP changes.
- **Fix:** `TrackingWrapper` subscribes to the same hp/maxHp selectors as `PlayerCharacter`. This ensures `TrackingWrapper` re-renders at exactly the same time as `PlayerCharacter`, giving a reliable and test-meaningful `renderCount`. A DOM assertion (`healthBar.style.width === '70%'`) was also added as a complementary correctness check.
- **Files modified:** `client/src/components/game/PlayerCharacter.test.tsx`
- **Commit:** 567fe1d

**2. [Rule 2 - Missing critical functionality] currentLobby?.boss guard replaced**

- **Found during:** Task 2 implementation
- **Issue:** `handleProjectileComplete` used `currentLobby?.boss` as a guard before emitting boss damage. Since `boss` is intentionally excluded from the `currentLobby` selector shape (to prevent boss-HP re-renders), accessing `.boss` on the shaped selector result returns `undefined` — silently dropping all dev/qa boss attacks.
- **Fix:** Replaced with `currentLobby?.gamePhase === 'battle'`. Semantically equivalent (boss always present in battle) and does not require including `boss` in the selector.
- **Files modified:** `client/src/components/game/PlayerController.tsx`
- **Commit:** 880589a

## Threat Flags

None — this plan makes no changes to authentication, authorization, input validation, or network surface.

## Known Stubs

None — all selectors wired to live store state.

## Self-Check: PASSED

- `client/src/components/game/PlayerCharacter.tsx` — modified, imports `useShallow`, uses scalar selectors for hp/maxHp, no bare `useGameState()`
- `client/src/components/game/PlayerCharacter.test.tsx` — modified, MAINT-06 describe block with renderCount assertions and DOM health bar check
- `client/src/components/game/PlayerController.tsx` — modified, imports `useShallow`, export is `React.memo(function PlayerController...)`, no bare `useGameState()`
- Commit 567fe1d — confirmed in git log
- Commit 880589a — confirmed in git log
- 910/910 tests pass, TypeScript clean, ESLint clean
