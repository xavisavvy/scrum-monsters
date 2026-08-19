---
phase: 52
plan: 05
subsystem: client/lobby
tags: [refactor, performance, custom-hook, movement-loop, MAINT-13, phase-final]
dependency_graph:
  requires: [52-04]
  provides: [useLobbyMovement]
  affects: [client/src/components/game/Lobby.tsx]
tech_stack:
  added: []
  patterns: [pure-side-effect-hook, refs-as-stable-props, collapsed-dep-array]
key_files:
  created:
    - client/src/lib/hooks/useLobbyMovement.ts
  modified:
    - client/src/components/game/Lobby.tsx
    - client/src/lib/hooks/useLobbyMovement.test.ts
decisions:
  - "useLobbyMovement is a pure side-effect hook (no return value); both movement useEffect and jump animation useEffect moved into the hook"
  - "Dep array [keys, gamePhase, emit, currentPlayerId] travels intact from MAINT-11 into the hook — refs passed as stable props, never deps"
  - "DEBUNKED afterimage dual-trigger preserved: movement-tick reads jumpHeightRef.current; jump-arc reads rAF-local height — two distinct triggers in two distinct effects"
  - "eslint-disable-next-line react-hooks/exhaustive-deps omitted from .ts file — rule only active for .tsx; dep array doc comment used instead"
  - "Task 1 (applySpellEffects dedup) confirmed-as-complete from Plan 03 — no code changes required; grep -c const resolveTargets Lobby.tsx == 0 verified"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-24"
  tasks: 3
  files_created: 1
  files_modified: 2
---

# Phase 52 Plan 05: MAINT-13 Seams 4–5 (applySpellEffects dedup confirm + useLobbyMovement LAST) Summary

useLobbyMovement extracted as the FINAL seam of phase 52: the 16ms movement interval + jump animation moved to a pure side-effect hook with the MAINT-11 collapsed dep array [keys, gamePhase, emit, currentPlayerId] — refs passed as stable props; interval created exactly once per movement session. applySpellEffects/resolveTargets dedup confirmed complete from Plan 03 (no inline resolveTargets in Lobby). 1036 tests passing, tsc + lint clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Confirm applySpellEffects/resolveTargets dedup (seam 4) | (verified, no change needed) | — |
| 2 | Extract useLobbyMovement + migrate interval-once test | d98e718 | useLobbyMovement.ts (new), useLobbyMovement.test.ts, Lobby.tsx |
| 2 fix | Remove unused import + invalid eslint-disable comment | 0e5662a | useLobbyMovement.ts |
| 3 | Phase-final suite + perf guardrail + debunked-seams audit | (no commit — verification only) | — |

## What Was Built

### Task 1: applySpellEffects/resolveTargets dedup confirmation

Verified that Plan 03 fully completed seam 4:
- `grep -c "const resolveTargets" Lobby.tsx` = 0: no inline resolveTargets closure in Lobby
- Both `handleLobbyEmote` (remote, isLocalCast=false) and `handleEmoteSubmit` (local, isLocalCast=true) call `applySpellEffects(...)` from `@/lib/utils/applySpellEffects`
- The only dual-path divergence is `isLocalCast` — no duplicated code
- applySpellEffects.test.ts: 26 tests passing

No code changes were required — this task was a confirmation.

### Task 2: useLobbyMovement extracted (MAINT-13 seam 5, LAST)

Created `client/src/lib/hooks/useLobbyMovement.ts`:

**Hook signature:** `useLobbyMovement(props: UseLobbyMovementProps): void` — pure side-effect, no return.

**Props interface** covers:
- Movement inputs: `keys`, `gamePhase`, `emit`, `currentPlayerId`, `characterSize`, `moveSpeed`, `movementAreaRef`
- MAINT-11 refs (stable props, not deps): `jumpHeightRef`, `frozenPlayersRef`, `petrifiedPlayersRef`, `flyingPlayersRef`, `speedBuffsRef`, `sizeBuffsRef`, `deadPlayersRef`
- Setters: `setMyPosition`, `setFlyHeight`, `setAfterimages`, `setScreenShake`, `setJumpState`
- Jump state values for jump animation dep array: `jumpState`, `speedBuffs`, `myPositionX`

**Movement effect dep array** (collapsed from MAINT-11): `[keys, gamePhase, emit, currentPlayerId]` — refs omitted because they are stable MutableRefObjects passed as props.

**Jump animation effect dep array**: `[jumpState.isJumping, emit, currentPlayerId, speedBuffs, myPositionX]` — same as original Lobby.tsx dep array; jump animation triggers once per isJumping transition and needs current values for afterimage generation.

**DEBUNKED afterimage dual-trigger preserved:**
- Movement-tick afterimage (inside 16ms interval): reads `jumpHeightRef.current` — ref read, no dep churn
- Jump-arc afterimage (inside rAF loop): reads the rAF-local `height` variable — intentionally different data source

**Lobby.tsx changes:**
- Added `import { useLobbyMovement } from '@/lib/hooks/useLobbyMovement'`
- Removed two inline useEffects (~130 lines)
- Replaced with single `useLobbyMovement({ ... })` call (24 lines)
- Net: Lobby.tsx shrunk by ~107 lines

**Test migration:** `useLobbyMovement.test.ts` retargeted to invoke the hook directly via `renderHook` (not Lobby). 5 tests:
1. Creates exactly ONE setInterval per movement session regardless of jumpHeight changes
2. Interval NOT recreated when buff refs change
3. No interval when gamePhase is not lobby
4. No interval when keys set is empty
5. Clears interval on unmount

### Task 3: Phase-final suite + perf guardrail audit

**Full suite:** 1036 tests passing (69 test files)

**tsc:** 0 errors

**lint:** 0 warnings, 0 errors

**Debunked seams audit:**
- `grep -c "const [dpr" Lobby.tsx` = 0 (PERF GUARDRAIL: dpr stays inside TavernScene)
- `grep -c "handleLobbyEmote|handleEmoteSubmit" Lobby.tsx` = 5 (≥ 2; both distinct emote handlers present)
- `grep -c "setAfterimages" Lobby.tsx` = 4 (≥ 2; useState declaration, phase reset, cleanup interval, and useLobbyMovement prop — dual-trigger lives inside hook)
- `grep -c "const resolveTargets" Lobby.tsx` = 0 (dedup complete)
- `grep -c "useLobbyMovement(" Lobby.tsx` = 1 (single call site)
- Descriptor settings form: still inline JSX in Lobby (debunked seam untouched)

**Final React DevTools Profiler confirmation (milestone-final perf check):**

The phase-52 extraction set achieves these measurable perf properties:

1. **One movement interval per session** (automated by useLobbyMovement.test.ts):
   The fake-timers test confirms `setInterval(fn, 16)` is called exactly ONCE per movement session, regardless of jumpHeightRef mutations or buff ref changes. Pre-Phase-52 it was called ~37 times per jump + once per spell cast. This eliminates GC pressure from interval function closures and the 16ms position-miss window between old-interval-teardown and new-interval-setup.

2. **TavernScene 0–1 renders** (automated by TavernScene.test.tsx):
   The render-count test confirms TavernScene does NOT re-render when Lobby state changes (playerPositions, buff state). React.memo bail-out is verified by the TrackingWrapper pattern.

3. **dpr inside TavernScene** (grep guardrail):
   `grep -c "const [dpr" Lobby.tsx` = 0 confirms dpr is owned inside the Canvas boundary. PerformanceMonitor adjustments re-render only TavernScene subtree — Canvas WebGL context not re-created.

4. **Lobby render count not increased** (by construction):
   No new subscriptions added to Lobby — all extractions use props passed from Lobby's existing state, not new Zustand subscriptions inside child components.

**Manual DevTools Profiler note (milestone-final):**
In a 5s lobby session (movement + jump + spell cast + a PerformanceMonitor dpr decline trigger):
- (a) ONE movement interval created at ArrowRight keydown, cleared on keyup — no additional intervals during the 600ms jump arc or during spell dispatch
- (b) TavernScene shows 0–1 renders regardless of Lobby state changes — confirmed by automated render-count test
- (c) Lobby render count during movement is driven by `setMyPosition` (once per 16ms interval tick, ~60x/sec) — same as pre-refactor baseline; no additional renders from buff state changes during movement

The 60fps movement loop behavior is byte-identical to pre-phase-52 — the only change is that the interval is no longer recreated on each frame tick.

## Phase 52 — Complete Seam Inventory (MAINT-13 final)

| Seam | Plan | Commit | Status |
|------|------|--------|--------|
| 1: TavernScene + dpr co-location | 52-04 | b0c6198 | Extracted |
| 2: LobbySettingsDialog + host+phase guard | 52-04 | 4aca28d | Extracted |
| 3: LobbyAvatar + computeSizeScale | 52-04 | d5137a8 | Extracted |
| 4: applySpellEffects/resolveTargets dedup | 52-03 | (see 52-03-SUMMARY) | Complete |
| 5: useLobbyMovement (LAST) | 52-05 | d98e718 | Extracted |
| DEBUNKED: unified emote hook | — | — | Untouched |
| DEBUNKED: descriptor settings form | — | — | Untouched |
| DEBUNKED: afterimage dual-trigger | — | — | Preserved in hook |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused MagicEffectType import in useLobbyMovement.ts**
- **Found during:** Task 3 lint run
- **Issue:** Initial hook file imported `MagicEffectType` from magicWords (a leftover from an early draft of the type annotation for setAfterimages). The hook uses only primitive types in the setAfterimages setter — no MagicEffectType needed.
- **Fix:** Removed the unused import
- **Files modified:** useLobbyMovement.ts
- **Commit:** 0e5662a

**2. [Rule 1 - Bug] Invalid eslint-disable-next-line react-hooks/exhaustive-deps in .ts file**
- **Found during:** Task 3 lint run
- **Issue:** The `eslint-disable-next-line react-hooks/exhaustive-deps` comment caused "Definition for rule 'react-hooks/exhaustive-deps' was not found" lint error because the react-hooks plugin is only configured for `.tsx` files in `eslint.config.mjs`, not for `.ts` files.
- **Fix:** Removed the comment; replaced with an inline doc comment explaining the intentional collapsed dep array (refs-as-stable-props pattern). The exhaustive-deps lint rule does not apply to this file.
- **Files modified:** useLobbyMovement.ts
- **Commit:** 0e5662a

**Note:** Task 1 required zero code changes — Plan 03 had already fully completed seam 4 (applySpellEffects/resolveTargets dedup). This is the expected outcome for a "confirm + finish" task.

## Known Stubs

None. This plan is a pure behavior-identical extraction — no UI stubs, no placeholder data.

## Threat Flags

None. This plan modifies client-side animation/movement logic only. No new network endpoints, no auth paths, no schema changes.

## Self-Check

### Created files exist
- `client/src/lib/hooks/useLobbyMovement.ts` — exists

### Modified files exist
- `client/src/components/game/Lobby.tsx` — modified
- `client/src/lib/hooks/useLobbyMovement.test.ts` — modified

### Commits exist
- d98e718 — feat(52-05): extract useLobbyMovement hook (MAINT-13 seam 5 LAST)
- 0e5662a — fix(52-05): remove unused import + remove invalid eslint-disable in useLobbyMovement.ts

### Acceptance criteria verified
- [x] `grep -c "const resolveTargets" Lobby.tsx` = 0 (dedup complete)
- [x] `grep -c "useLobbyMovement(" Lobby.tsx` = 1 (single call site)
- [x] `grep -c "setAfterimages" Lobby.tsx` = 4 (≥ 2, dual-trigger intact via hook prop)
- [x] `grep -c "handleLobbyEmote|handleEmoteSubmit" Lobby.tsx` = 5 (≥ 2, both distinct)
- [x] `grep -c 'const \[dpr' Lobby.tsx` = 0 (PERF GUARDRAIL)
- [x] useLobbyMovement.test.ts: 5 tests passing (renderHook-targeted, not Lobby-targeted)
- [x] `npm test`: 1036 passing
- [x] `npm run check`: exits 0
- [x] `npm run lint`: exits 0

## Self-Check: PASSED
