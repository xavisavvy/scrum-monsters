---
phase: 42-v5-0-pre-ship-fixes-polish
plan: 01
subsystem: combat-feedback
tags: [combat, ui-feedback, sockets, fix-04]
requirements: [FIX-04]
dependency_graph:
  requires:
    - useGameState (existing zustand store)
    - combat:player_damaged socket event (existing, server-authoritative)
    - HealthBar primitive (existing)
    - FloatingXPManager pattern (existing analog)
  provides:
    - useGameState.pendingDamageEvents slice
    - useGameState.addPendingDamage / clearPendingDamage actions
    - FloatingDamage + FloatingDamageManager components
    - PlayerCharacter HP-decrement damage-flash hook
    - PlayerHUD HP bar (battle phase)
  affects:
    - BattleScreen.tsx (mounts FloatingDamageManager)
    - phases/BattlePhase.tsx (mounts FloatingDamageManager)
tech-stack:
  added: []
  patterns:
    - "queue-consumer floating-overlay (mirrors FloatingXPManager)"
    - "previousHpRef HP-decrement detection"
key-files:
  created:
    - client/src/components/game/FloatingDamage.tsx
    - client/src/components/game/FloatingDamageManager.tsx
    - client/src/components/game/FloatingDamageManager.test.tsx
    - client/src/components/game/PlayerCharacter.test.tsx
  modified:
    - client/src/lib/stores/useGameState.tsx
    - client/src/lib/socket/eventHandlers.ts
    - client/src/components/game/PlayerCharacter.tsx
    - client/src/components/game/PlayerHUD.tsx
    - client/src/components/game/BattleScreen.tsx
    - client/src/components/game/phases/BattlePhase.tsx
    - client/src/components/game/index.ts
decisions:
  - "Mounted FloatingDamageManager in BattleScreen.tsx + phases/BattlePhase.tsx (the actual sibling sites of FloatingXPManager). The plan referenced PhaseRenderer.tsx, which does not exist in the repo — applied Rule 3 deviation."
  - "Server-side damage path (CombatManager.applyDamageToPlayer) intentionally NOT modified, per RESEARCH.md finding that damage IS applied server-side; only client perceptual signal was missing."
  - "Added data-damaged attribute to PlayerCharacter outermost div for testability (no existing class marker reflected isDamaged in a stable way)."
metrics:
  duration_minutes: 8
  tasks_completed: 3
  tests_added: 6
  test_total: 683
  test_baseline: 670
  completed: 2026-05-07
---

# Phase 42 Plan 01: Boss Damage Client Feedback (FIX-04) — Summary

Wires `combat:player_damaged` into the existing damage-flash machinery, adds a
FloatingDamage popup that mirrors `FloatingXPManager`, and renders an HP bar in
PlayerHUD. Closes FIX-04 by making boss attacks (single-target and AoE)
visibly land for the local player without modifying the authoritative server
damage path.

## What Changed

### Task 0 — store slice + handler extension (commit `e34754e`)

- `client/src/lib/stores/useGameState.tsx`
  - New `PendingDamageEvent` interface (exported)
  - GameState gains `pendingDamageEvents`, `addPendingDamage`,
    `clearPendingDamage` (mirrors the existing `attackAnimations` slice
    shape).
  - `clearAll()` resets the new slice.
- `client/src/lib/socket/eventHandlers.ts:351-381`
  - The existing `combat:player_damaged` handler now ALSO calls
    `addPendingDamage({ id: '${playerId}-${seq ?? Date.now()}', playerId,
    amount: data.damage, position: { x, y } })` after the existing
    `setLobby` update inside the `if (processed)` block.
  - The existing seq-gated `handleEvent` ordering (Phase 41 reconnect-safe)
    is preserved.

### Task 1 — FloatingDamage + FloatingDamageManager (commit `2aa0eac`)

- `client/src/components/game/FloatingDamage.tsx` (new, 51 lines)
  - Red `-{amount}` text, `1.4rem` `Press Start 2P`, zIndex 60, reuses the
    global `floatUp` keyframes; default 1000ms duration.
- `client/src/components/game/FloatingDamageManager.tsx` (new, 51 lines)
  - Queue consumer reading `useGameState.pendingDamageEvents`; per-event
    `processedRef` gate; `handleComplete` clears active list +
    `clearPendingDamage`. Renders inside an absolute `pointer-events-none`
    container at zIndex 55 (below Phase 39 ladder: SpotlightMask 100,
    HintBubble 101, HelpMenu popover 200).
- `client/src/components/game/FloatingDamageManager.test.tsx` (new) —
  3 cases: empty render, popup-on-add, clear-on-completion.
- Mounted in `BattleScreen.tsx:357` and `phases/BattlePhase.tsx:91` as a
  sibling to the existing `<FloatingXPManager />`.
- Exported from `client/src/components/game/index.ts`.

### Task 2 — HP-decrement flash + HUD HealthBar (commit `1a0b619`)

- `client/src/components/game/PlayerCharacter.tsx:88-103`
  - New `previousHpRef` + `useEffect` that watches `currentHp`. On
    decrement (and only when `playerId` is present), reuses the existing
    `setIsDamaged(true)` + 400ms timeout machinery. The pre-existing
    `attackAnimations` hook stays untouched — both paths now feed the same
    flash state.
  - Outer div now exposes `data-damaged={isDamaged ? 'true' : 'false'}` for
    test assertions.
- `client/src/components/game/PlayerHUD.tsx`
  - Imports `HealthBar` from `@/components/ui/HealthBar`.
  - Derives `combatState`, `hp`, `maxHp` from
    `currentLobby.playerCombatStates?.[currentPlayer.id]`.
  - Renders `<HealthBar size="sm" showValue label="Player HP" />` as a
    sibling to `<XPBar />`, gated on `gamePhase === 'battle' && combatState`.
  - HealthBar already auto-pulses at ≤25% HP, so the low-HP signal is free.
- `client/src/components/game/PlayerCharacter.test.tsx` (new) — 3 cases:
  default render (data-damaged false), HP-decrement triggers
  data-damaged true, and 400ms auto-clear with fake timers. SpriteRenderer
  is mocked to keep the unit test asset-free.

## Vitest Commands

```bash
npx vitest run client/src/components/game/FloatingDamageManager.test.tsx
npx vitest run client/src/components/game/PlayerCharacter.test.tsx
npx tsc --noEmit
npm test   # 683 passed (35 files), no regressions
```

## Server-Side Damage Path: NOT MODIFIED

Per RESEARCH.md (lines 11–14, 487–493), the server already applies damage
correctly via `CombatManager.applyDamageToPlayer` and emits
`combat:player_damaged` through `ClientEventEmitter`. This plan only
addresses the missing client perceptual signal. **Zero server files were
touched in this plan.** Verified by `git show --stat` for each commit:
all source-file changes are under `client/src/`.

## Deviations from Plan

### Rule 3 — Auto-fixed blocking issue

**1. PhaseRenderer.tsx does not exist**
- **Found during:** Task 1 (file inventory)
- **Issue:** Plan instructed mounting `<FloatingDamageManager />` in
  `client/src/components/game/PhaseRenderer.tsx`. This file does not exist
  anywhere in the repo (`Glob` returned nothing; no analog in
  `git ls-files`).
- **Fix:** Mounted in the actual `<FloatingXPManager />` mount sites
  (`BattleScreen.tsx:357` and `phases/BattlePhase.tsx:91`) per the plan's
  intent ("mount as a sibling to FloatingXPManager"). Both sites cover the
  battle render path (BattleScreen is the live wrapper; BattlePhase is the
  alternate phase-renderer scaffold used in some flows).
- **Files modified:** `client/src/components/game/BattleScreen.tsx`,
  `client/src/components/game/phases/BattlePhase.tsx`
- **Commit:** `2aa0eac`

### Rule 2 — Auto-added testability marker

**2. PlayerCharacter exposed `data-damaged` for the new test**
- **Found during:** Task 2 (writing the test)
- **Issue:** The plan suggested falling back to adding `data-damaged` if
  no existing CSS class reflected `isDamaged` in a testable way.
- **Fix:** Added `data-damaged={isDamaged ? 'true' : 'false'}` to the
  outermost div in `PlayerCharacter`. The existing `isDamaged` only flowed
  into a `style={{ filter: ..., transform: ... }}` block — not stable to
  query.
- **Commit:** `1a0b619`

### Pre-commit hook scope (informational)

The repo's husky/lint-staged hook auto-includes other modified files in
the working tree on commit. This plan's three commits ride alongside
unrelated 42-02a/42-03 in-progress changes that were already on disk
when execution began (visible in the original `git status`). These
co-stages do NOT touch any 42-01 invariant and do not affect FIX-04
behavior; they're flagged here for traceability:

- `e34754e` (Task 0) co-included: `lobbySettingsStorage.{ts,test.ts}`,
  `shared/gameEvents.ts`, `shared/socket-schemas.ts` (42-02a autoAdvance
  schema work, in-progress on disk).
- `0c1419f` (between Task 1 and Task 2) is a fully separate 42-03 commit
  that the hook produced during the Task 1 commit chain — it's the BAL-01
  XP pacing tune.
- `1a0b619` (Task 2) co-included: 42-03 ProgressionManager updates were
  already committed by `0c1419f`, no further drift.

These are not 42-01 deviations; they are the hook surfacing
already-on-disk multi-plan work.

## Authentication Gates

None — no auth surfaces touched.

## Self-Check: PASSED

Files exist:
- FOUND: client/src/components/game/FloatingDamage.tsx
- FOUND: client/src/components/game/FloatingDamageManager.tsx
- FOUND: client/src/components/game/FloatingDamageManager.test.tsx
- FOUND: client/src/components/game/PlayerCharacter.test.tsx
- FOUND: client/src/lib/stores/useGameState.tsx (modified)
- FOUND: client/src/lib/socket/eventHandlers.ts (modified)
- FOUND: client/src/components/game/PlayerCharacter.tsx (modified)
- FOUND: client/src/components/game/PlayerHUD.tsx (modified)

Commits exist (verified by `git log --oneline`):
- FOUND: e34754e — feat(42-01) Task 0 store slice + handler
- FOUND: 2aa0eac — feat(42-01) Task 1 FloatingDamage components
- FOUND: 1a0b619 — feat(42-01) Task 2 HP-decrement flash + HealthBar

Acceptance criteria:
- `grep "previousHpRef" client/src/components/game/PlayerCharacter.tsx` → matches present
- `grep "HealthBar" client/src/components/game/PlayerHUD.tsx` → matches present
- `grep "FloatingDamageManager" client/src/components/game/BattleScreen.tsx` → matches present
- `npx vitest run` for both new test files → 6/6 passing
- `npx tsc --noEmit` → clean
- `npm test` → 683 passing (was 670 baseline; +13 new tests across 42-01 and 42-03 hook-included work)
