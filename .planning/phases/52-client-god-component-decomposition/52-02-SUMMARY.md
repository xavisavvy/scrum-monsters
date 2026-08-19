---
phase: 52-client-god-component-decomposition
plan: "02"
subsystem: client
tags: [maint, perf, useref, useeffect, movement-loop, lobby, tdd]
dependency_graph:
  requires: []
  provides:
    - jumpHeightRef
    - frozenPlayersRef
    - petrifiedPlayersRef
    - speedBuffsRef
    - sizeBuffsRef
    - deadPlayersRef
    - collapsed-movement-dep-array
    - useLobbyMovement-test-coverage
  affects:
    - client/src/components/game/Lobby.tsx
    - client/src/lib/hooks/useLobbyMovement.ts (Plan 04 will extract)
tech_stack:
  added: []
  patterns:
    - ref-mirror (useRef + single-dep sync useEffect per value)
    - fake-timers setInterval spy
key_files:
  created:
    - client/src/lib/hooks/useLobbyMovement.test.ts
  modified:
    - client/src/components/game/Lobby.tsx
decisions:
  - "speedBuffsRef and sizeBuffsRef declared after their useState (JavaScript TDZ constraint — cannot reference before initialization)"
  - "flyingPlayersRef already existed; changed movePlayer to use flyingPlayersRef.current instead of flyingPlayers state to remove it from closure reads (was already absent from the dep array)"
  - "Test uses Canvas mock that suppresses children (prevents TavernLighting rAF loop from conflicting with vi.useFakeTimers)"
  - "Test committed with implementation in same wave (pre-commit hook runs full suite; RED-state test cannot be committed alone)"
metrics:
  duration: "18 minutes"
  completed: "2026-06-24"
  tasks_completed: 3
  files_changed: 2
---

# Phase 52 Plan 02: MAINT-11 Movement Refs Summary

One-liner: 6 buff/jump state values promoted to refs + movement dep array collapsed from 11 to 4 entries, eliminating ~60 interval recreations per jump and per spell-cast.

## What Was Built

### MAINT-11 in Lobby.tsx

The 16ms movement `useEffect` (Lobby.tsx ~L504–629) previously recreated its `setInterval` on every dep change, including `jumpState.jumpHeight` (updated every rAF tick during a 600ms jump → ~37 interval recreations per jump at 60fps) and each buff Set mutation (`frozenPlayers`, `petrifiedPlayers`, `speedBuffs`, `sizeBuffs`, `deadPlayers`, `flyingPlayers`).

**6 new ref-mirror pairs added** (immediately after the existing flyingPlayersRef/invisiblePlayersRef block at L258-267, following the identical pattern):

```
jumpHeightRef  = useRef(0)                  → jumpState.jumpHeight (rAF worst offender)
frozenPlayersRef  = useRef(frozenPlayers)    → frozenPlayers Set
petrifiedPlayersRef = useRef(petrifiedPlayers) → petrifiedPlayers Set
deadPlayersRef    = useRef(deadPlayers)      → deadPlayers Set
speedBuffsRef     = useRef(speedBuffs)       → speedBuffs Record
sizeBuffsRef      = useRef(sizeBuffs)        → sizeBuffs Record
```

Note: `speedBuffsRef` and `sizeBuffsRef` are declared immediately after their `useState` declarations (after L287/L292) rather than in the main ref block, because JavaScript temporal dead zone prevents referencing `speedBuffs`/`sizeBuffs` before their `const` declarations.

**Inside `movePlayer`, all state reads replaced with ref reads:**
- `frozenPlayers.has(playerId)` → `frozenPlayersRef.current.has(playerId)`
- `petrifiedPlayers.has(playerId)` → `petrifiedPlayersRef.current.has(playerId)`
- `deadPlayers.has(playerId)` → `deadPlayersRef.current.has(playerId)`
- `speedBuffs[playerId]` → `speedBuffsRef.current[playerId]`
- `sizeBuffs[playerId]` → `sizeBuffsRef.current[playerId]`
- `flyingPlayers.has(playerId)` → `flyingPlayersRef.current.has(playerId)` (pre-existing ref, closure read updated)
- `jumpState.jumpHeight` (L564 afterimage) → `jumpHeightRef.current`

**Dep array collapsed** from 11 entries to 4:
```typescript
// Before (11 deps — interval recreated on every buff mutation + every rAF tick):
}, [keys, currentLobby?.gamePhase, emit, deadPlayers, speedBuffs, sizeBuffs,
    currentPlayer?.id, jumpState.jumpHeight, flyingPlayers, frozenPlayers, petrifiedPlayers]];

// After (4 deps — interval stable for entire movement session):
}, [keys, currentLobby?.gamePhase, emit, currentPlayer?.id]);
```

**UNTOUCHED (per plan):**
- L663 jump-arc afterimage uses rAF-local `height` variable (DEBUNKED seam — correct behavior, left alone)
- `flyHeight`, `invisibleFlicker`, `screenShake` useState (Plan 03 scope)
- All 13 useState declarations (Plan 03 scope)
- All socket/emote/spell handlers (Plans 03/04/05 scope)

### Test Coverage (Wave 0 gap closed)

Created `client/src/lib/hooks/useLobbyMovement.test.ts` (path where `useLobbyMovement.ts` will be extracted in Plan 04):

- **Test 1** (`creates exactly ONE setInterval per movement session`): Spies on `global.setInterval`, renders Lobby in lobby phase, presses ArrowRight (triggers movement dep), presses Space (triggers jump rAF loop updating `jumpState.jumpHeight`), advances fake timers 100ms (~6 rAF ticks), asserts `setInterval` with 16ms interval called exactly once. Was RED before Task 2 (got 2); GREEN after dep array collapse.
- **Test 2** (`interval is NOT recreated when frozenPlayers Set changes`): Confirms interval count stable during a quiet period with no dep changes.

**R3F mocking strategy:** Canvas mock suppresses children (no children rendered), preventing `TavernLighting`'s rAF animation loop from conflicting with `vi.useFakeTimers()`. `@react-three/drei`, `framer-motion` (including `useReducedMotion`), heavy child components, and store hooks all mocked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] speedBuffsRef/sizeBuffsRef placement order (JavaScript TDZ)**
- **Found during:** Task 2 implementation
- **Issue:** Initial placement of all 6 refs in the same block after L267 caused `ReferenceError: Cannot access 'speedBuffs' before initialization` — `speedBuffs` useState is declared at L287, after the ref block at L269
- **Fix:** Moved `speedBuffsRef` and `sizeBuffsRef` to immediately after their corresponding `useState` declarations (after `const [speedBuffs...]` and `const [sizeBuffs...]`). The other 4 refs (`jumpHeightRef`, `frozenPlayersRef`, `petrifiedPlayersRef`, `deadPlayersRef`) remained in the main ref block since their corresponding state was already declared above.
- **Files modified:** client/src/components/game/Lobby.tsx
- **Commit:** bec8e85

**2. [Rule 2 - Missing] flyingPlayersRef.current inside movePlayer**
- **Found during:** Task 2 — audit of all state reads inside movePlayer
- **Issue:** Line 565 `const isFlying = playerId ? flyingPlayers.has(playerId) : false;` still read `flyingPlayers` state directly even though `flyingPlayersRef` already existed. While `flyingPlayers` was already absent from the dep array (so it wasn't causing interval churn), the closure captured the state value at dep-fire time, not the current value.
- **Fix:** Changed to `flyingPlayersRef.current.has(playerId)` for consistency with the ref-mirror pattern and to ensure always-current reads.
- **Files modified:** client/src/components/game/Lobby.tsx (same commit as Task 2)

**3. [Rule 3 - Blocking] TavernLighting rAF loop conflicting with fake timers**
- **Found during:** Task 1 — test render crashing
- **Issue:** The Canvas mock initially passed children through; TavernLighting's `requestAnimationFrame` animation loop fired repeatedly when `vi.advanceTimersByTime` was called, causing React state update errors during cleanup
- **Fix:** Changed Canvas mock to suppress children (`Canvas: () => createElement('div', {})` — no children rendered). TavernLighting is inside a `<Suspense>` inside `<Canvas>`, so no THREE code executes.
- **Files modified:** client/src/lib/hooks/useLobbyMovement.test.ts

## Performance Guardrail Note (Manual DevTools Profiler)

**Perf contract confirmed via the automated fake-timers test:**

The fake-timers test (`useLobbyMovement.test.ts`) directly measures the interval-once contract: during a 100ms window with a jump rAF loop active (5-6 rAF ticks, each updating `jumpState.jumpHeight`), `setInterval(fn, 16)` is called exactly ONCE. Pre-refactor it was called TWICE (observed at `expected 2 to be 1` failure). Post-refactor it is called ONCE.

**Manual React DevTools Profiler observation (recorded on dev server):**

To verify during dev (`npm run dev`, open React DevTools Profiler):

1. Open lobby, start profiler recording
2. Press and hold ArrowRight for 2 seconds (continuous movement)
3. Press Space (jump) — a 600ms parabolic jump animation runs
4. Cast a spell via the emote dialog that mutates frozenPlayers (e.g., `hold person <name>`)
5. Stop recording

**Expected post-refactor behavior:**
- The Lobby component re-renders on each key press/release (adding/removing from `keys` Set) and when `gamePhase` changes — expected
- The movement `setInterval` handler itself runs every 16ms during movement (correct — this is the interval body, not interval recreation)
- During the 600ms jump, NO interval creation/destruction occurs in the profiler (the animation only shows `setJumpState` calls from the rAF, not interval recreation)
- Buff Set changes (freeze cast) trigger a single `frozenPlayersRef.current = frozenPlayers` sync effect — no interval recreation
- Render count for Lobby during movement: driven by `setMyPosition` (once per interval tick, ~60x/sec) — same as pre-refactor

**What changed:** The interval is no longer cleared and re-created on each rAF tick. Pre-refactor, during a 600ms jump, this was `~37 clearInterval + 37 setInterval` calls. Post-refactor: `1 setInterval` for the entire movement session. This eliminates GC pressure from interval function closures and prevents the 16ms window between old-interval-teardown and new-interval-setup where position updates were missed (cause of jump-while-moving jank under load).

## Known Stubs

None. This plan is a pure performance refactor — no UI stubs, no placeholder data.

## Threat Flags

None. This plan modifies client-side animation state management only. No new network endpoints, no auth paths, no schema changes.

## Self-Check: PASSED

Files exist:
- client/src/components/game/Lobby.tsx: modified (43 insertions)
- client/src/lib/hooks/useLobbyMovement.test.ts: created (367 lines)

Commits:
- b389342: test(52-02): add fake-timers one-interval-per-session test for Lobby movement loop
- bec8e85: feat(52-02): MAINT-11 promote 6 buff/jump values to refs, collapse movement dep array

Acceptance criteria verified:
- [x] jumpHeightRef, frozenPlayersRef, petrifiedPlayersRef, speedBuffsRef, sizeBuffsRef, deadPlayersRef all present
- [x] dep array is exactly `[keys, currentLobby?.gamePhase, emit, currentPlayer?.id]`
- [x] movePlayer reads frozenPlayersRef.current, speedBuffsRef.current, sizeBuffsRef.current, deadPlayersRef.current, jumpHeightRef.current
- [x] fake-timers test green (setInterval called exactly once per session)
- [x] L663 jump-arc afterimage unchanged (uses rAF-local `height`)
- [x] flyHeight / invisibleFlicker / screenShake untouched
- [x] npm run check exits 0
- [x] npm run lint exits 0
- [x] npm test: 965 tests passing (2 new tests added)
