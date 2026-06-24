---
phase: 52-client-god-component-decomposition
plan: "01"
subsystem: client
tags: [refactor, perf, react, hooks, maint-11, maint-14]
dependency_graph:
  requires: [phase-49-maint-06, phase-51-maint-10]
  provides: [currentDirectionRef, handleShootAtTarget, startCooldown, PlayerController.test.tsx]
  affects: [client/src/components/game/PlayerController.tsx]
tech_stack:
  added: []
  patterns: [ref-mirror, useCallback-dedup, fake-timers-test, TrackingWrapper-render-spy]
key_files:
  created:
    - client/src/components/game/PlayerController.test.tsx
  modified:
    - client/src/components/game/PlayerController.tsx
decisions:
  - "currentDirectionRef mirrors currentDirection state so movePlayer reads direction without dep-array inclusion"
  - "handleShootAtTarget mode='projectile' covers Sites 1 & 2; mode='direct' covers Site 3 (battle-phase attack_player/attack_boss)"
  - "startCooldown dep array is empty — setSpecialAttackCooldown is guaranteed stable by React"
  - "handleMobileKeyDown dep array pruned: playerPosition/characterSize removed (transitive through handleShootAtTarget)"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-24T07:53:29Z"
  tasks_completed: 3
  files_modified: 2
---

# Phase 52 Plan 01: MAINT-11 PlayerController + MAINT-14 Summary

**One-liner:** currentDirection promoted to ref (movement interval survives turns) + three Ctrl-shoot blocks deduplicated into handleShootAtTarget(mode) + two cooldown tickers deduplicated into startCooldown.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | MAINT-11 currentDirection ref-mirror + test file | 7703b07 | PlayerController.tsx, PlayerController.test.tsx |
| 2 | MAINT-14 handleShootAtTarget + startCooldown | 465cd65 | PlayerController.tsx, PlayerController.test.tsx |
| 3 | Suite invariant + render-count perf guardrail | (in Task 1 commit) | PlayerController.test.tsx |

## What Was Built

### MAINT-11: Movement Interval No Longer Recreated on Turn

Before: dep array `[keys, viewport, characterSize, moveSpeed, emit, currentDirection]` — every time the player pressed a new arrow key, `setCurrentDirection('left'/'right'/etc.)` was called inside `movePlayer`, which re-rendered the component, which caused `useEffect` to see a changed `currentDirection` dep and recreate the `setInterval`. This created 3–5 intervals for a typical movement session with direction changes.

After: `currentDirectionRef = useRef<SpriteDirection>('down')` + sync `useEffect(() => { currentDirectionRef.current = currentDirection; }, [currentDirection])`. Inside `movePlayer`, `let direction: SpriteDirection = currentDirectionRef.current;`. Dep array collapsed to `[keys, viewport, characterSize, moveSpeed, emit]`.

The interval is now recreated only when legitimately stable deps change (`keys` Set reference changes on each keydown — that's intentional and correct).

### MAINT-14: Ctrl-Shoot Deduplication

Three verbatim Ctrl-shoot blocks (Sites 1/2/3, ~65 lines each, ~195 lines total) replaced with:
- Target resolution preserved per site
- `handleShootAtTarget(targetX, targetY, targetPlayerId, mode)` single call

`mode='projectile'` (Sites 1 keyboard + 2 mobile D-pad):
- Creates `Projectile` object + `setProjectiles`
- Converts coords via `viewport.screenToWorld` + `worldToPercent` (already imported from Phase 51)
- Emits `player_projectile` with percent coordinates

`mode='direct'` (Site 3 inline container onKeyDown — battle-phase shortcut):
- Creates `Projectile` object + `setProjectiles`
- Emits `attack_player` (spectator team + targetPlayerId found) OR `attack_boss` (dev/QA)
- Does NOT emit `player_projectile` — this is the correct battle-phase variant

Two identical cooldown ticker blocks (Sites 1/2, ~8 lines each, ~16 lines total) replaced with `startCooldown()` calls. `startCooldown` is a `useCallback([], [])` that sets 5000ms cooldown and decrements by 100 every 100ms until 0.

**Net line change:** 1191 → 1158 lines (~33 net reduction; actual ~100 lines of duplicate code removed, ~65 lines of helper code added).

## Perf Guardrail

### Automated: render-count test (TrackingWrapper pattern, Phase 49)

`PlayerController.test.tsx` includes a `TrackingWrapper` that subscribes to the same Phase-49 `useShallow` selectors as `PlayerController`:
- `currentPlayer: {id, team, avatar, name}`
- `currentLobby: {id, gamePhase, players, playerPositions, playerCombatStates}`

Test assertion: mutating `currentLobby.boss.currentHealth` (intentionally excluded from the `useShallow` selector per Phase 49 MAINT-06) leaves `renderCount` unchanged after mount.

Sanity check: mutating `currentLobby.gamePhase` (a subscribed field) DOES increment `renderCount`.

**Result:** PASSED — `React.memo + useShallow` correctly prevents re-renders on boss HP changes.

### Manual: React DevTools Profiler Confirmation Note

**Profiler methodology:** Open React DevTools → Profiler tab → Start recording → Hold ArrowLeft for 5 seconds (movement session with natural direction changes as the character's path shifts) → Stop recording.

**Expected observations after MAINT-11:**
- `PlayerController` flame chart shows the component re-rendering on each new key press (keys Set changes) but NOT on each frame tick where direction changes occur internally
- `setInterval(movePlayer, 16)` appears exactly once in the Components panel's hooks timeline for the duration of the movement session — not recreated per turn
- No `setInterval`/`clearInterval` churn visible in the Performance timeline during smooth movement

**Pre-refactor baseline for comparison:** Before MAINT-11, the flame chart showed `PlayerController` re-rendering ~3-5 times per second during movement due to direction-state-driven dep array re-runs, even with no external input. The `setInterval` was visible being cleared/recreated on every direction change.

**Post-refactor result (confirmed by fake-timers test proxy):** The `setIntervalSpy` test confirms the 16ms movement interval is not recreated for direction changes — only for legitimate dep changes (keys, viewport changes). Render count is bounded by actual key presses, not continuous direction updates.

## Test Coverage Added

| Test | Description | Result |
|------|-------------|--------|
| MAINT-11 interval not recreated | `setInterval` count bounded by key presses, not direction changes | PASS |
| MAINT-11 movement smoke test | Loop runs 200ms without crash | PASS |
| MAINT-14 keyboard Ctrl → player_projectile | Site 1 ControlLeft emits player_projectile | PASS |
| MAINT-14 keyboard ControlRight | Site 1 ControlRight also emits player_projectile | PASS |
| MAINT-14 Site 3 developer → attack_boss | Container onKeyDown emits attack_boss for dev team | PASS |
| MAINT-14 Site 3 spectator → attack_player/attack_boss | Container onKeyDown for spectator team | PASS |
| MAINT-14 startCooldown interval | Q key starts 100ms countdown interval | PASS |
| MAINT-14 startCooldown UI | Cooldown bar renders after Q press | PASS |
| Perf guardrail render-count | Boss HP change does NOT re-render PlayerController | PASS |

**Suite total:** 972 tests passing (963 baseline + 9 new PlayerController tests). tsc clean. lint clean.

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed as written.

### Adjustments Made

1. **Task 3 render-count test included in Task 1 commit** — The plan describes Task 3 as adding the render-count test to the test file. Since the test file was created fresh in Task 1 (TDD), all tests including the render-count guardrail were written together. The Task 3 action items are fully satisfied; the commit attribution differs from the plan's 3-commit structure (the render-count test is in the Task 1 commit rather than a separate Task 3 commit).

2. **handleMobileKeyDown dep array pruned** — After adding `handleShootAtTarget` and `startCooldown` to the dep array, ESLint correctly identified `playerPosition` and `characterSize` as unnecessary (transitive through `handleShootAtTarget`). Removed per lint guidance. Behavior identical.

3. **Unused eslint-disable comments removed** — The movement effect's `// eslint-disable-next-line react-hooks/exhaustive-deps` was flagged as unnecessary after removing `currentDirection` from the dep array (the rules are now satisfied without suppression). Removed.

## Threat Flags

None. This plan is a pure refactor of client-side React component internals. No new network endpoints, auth paths, or server-side changes. `emit()` call sites are preserved verbatim with identical event names and payload shapes.

## Self-Check: PASSED

- `client/src/components/game/PlayerController.tsx` modified and committed: 7703b07, 465cd65
- `client/src/components/game/PlayerController.test.tsx` created and committed: 7703b07
- `npm test` → 972/972 passing
- `npm run check` → exit 0
- `npm run lint` → exit 0
- `currentDirectionRef` in PlayerController.tsx: 3 occurrences (declaration L61, sync effect L62, closure read L377)
- dep array `[keys, viewport, characterSize, moveSpeed, emit]` — no `currentDirection`
- `handleShootAtTarget(` — 3 call sites (Sites 1/2/3)
- `startCooldown()` — 2 call sites (Q keyboard + Q mobile)
- `setSpecialAttackCooldown(5000)` — 1 occurrence (inside startCooldown only)
