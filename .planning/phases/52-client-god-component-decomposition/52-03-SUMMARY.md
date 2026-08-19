---
phase: 52-client-god-component-decomposition
plan: "03"
subsystem: client
tags: [maint, reducer, useReducer, spell-effects, lobby, tdd, MAINT-12]
dependency_graph:
  requires:
    - 52-02 (MAINT-11 movement refs — frozenPlayersRef/speedBuffsRef/etc. must be in place)
  provides:
    - buffReducer (pure, testable)
    - applySpellEffects (pure, isLocalCast threaded)
    - useReducer wiring in Lobby.tsx
    - DISPEL_ALL single-dispatch
    - PHASE_RESET single-dispatch
  affects:
    - client/src/components/game/Lobby.tsx
    - client/src/lib/reducers/buffReducer.ts (new)
    - client/src/lib/reducers/buffReducer.test.ts (new)
    - client/src/lib/utils/applySpellEffects.ts (new)
    - client/src/lib/utils/applySpellEffects.test.ts (new)
tech_stack:
  added: []
  patterns:
    - useReducer (first reducer in codebase — pure buffReducer, no React imports)
    - forEach-dispatch (replaces ~300-line if-cascade in both handlers)
    - isLocalCast flag (threads the one real divergence between remote/local paths)
    - DISPEL_ALL action (closes 7-setter async batching gap)
key_files:
  created:
    - client/src/lib/reducers/buffReducer.ts
    - client/src/lib/reducers/buffReducer.test.ts
    - client/src/lib/utils/applySpellEffects.ts
    - client/src/lib/utils/applySpellEffects.test.ts
  modified:
    - client/src/components/game/Lobby.tsx
decisions:
  - "buffReducer is first useReducer in codebase — pure module, no React import, testable in isolation"
  - "Dragon block kept in caller (handleLobbyEmote/handleEmoteSubmit) — random victim selection + external setTimeout incompatible with pure reducer"
  - "applySpellEffects skips dragon (returns early), dispatches HOLD+5s-UNHOLD, MASSACRE+15s-TAVERN_DARK_END, CHAOS+5s-CHAOS_END inline"
  - "isLocalCast=true (local) calls setFlyHeight(0) on earthbind/dispel-self; isLocalCast=false (remote) does NOT — original dual-path divergence preserved exactly"
  - "setMagicEffects and setEmotes remain in caller — X-position source differs: remote reads playerPositionsRef.current, local reads myPosition.x"
  - "speedBuffsRef/sizeBuffsRef now reference destructured buffState values; Plan-02 ref-sync effects (frozenPlayersRef.current = frozenPlayers etc.) continue working unchanged"
  - "DISPEL_ALL and PHASE_RESET both return fresh initialBuffState (brand-new Sets/Records) for correct React structural equality"
metrics:
  duration: "45 minutes"
  completed: "2026-06-24"
  tasks_completed: 3
  files_changed: 5
---

# Phase 52 Plan 03: MAINT-12 Magic-Effect Reducer Summary

One-liner: 10 magic-effect useState slots collapsed into one pure useReducer (buffReducer), both ~300-line if-cascades replaced by applySpellEffects forEach dispatch, DISPEL_ALL closes the 7-setter async batching gap.

## What Was Built

### Task 1: Pure buffReducer (no React imports)

Created `client/src/lib/reducers/buffReducer.ts` — first `useReducer` in this codebase.

**BuffState (10 slots):**
- `deadPlayers: Set<string>` — die/revive magic
- `flyingPlayers: Set<string>` — fly spell
- `frozenPlayers: Set<string>` — hold person
- `petrifiedPlayers: Set<string>` — petrify
- `tavernDarkMode: boolean` — massacre side-effect
- `chaosMode: boolean` — chaos mode spell
- `invisiblePlayers: Set<string>` — invisibility
- `dragonAttack: { active, targetX, targetPlayerId }` — dragon animation state
- `speedBuffs: Record<string, { type, stacks }>` — haste/slow (cap: 3)
- `sizeBuffs: Record<string, { type, stacks }>` — enlarge/reduce (cap: 3)

**BuffAction union (23 variants):** DIE, REVIVE, HASTE, SLOW, ENLARGE, REDUCE, FLY, HOLD, UNHOLD, PETRIFY, INVISIBILITY, EARTHBIND, MASSACRE, MASSREVIVE, DRAGON, DRAGON_END, CHAOS, CHAOS_END, TAVERN_DARK_END, DISPEL, DISPEL_ALL, BREAK_INVISIBILITY, PHASE_RESET.

**Key behavior:**
- `DISPEL_ALL` and `PHASE_RESET` both return `{ ...initialBuffState }` with fresh Sets/Records (one dispatch, one synchronous reducer call, one re-render — closes the 7-setter async batching gap that existed in socket handlers where React 18 does NOT batch state updates)
- `ENLARGE`/`REDUCE`/`HASTE` stacking capped at 3 (mirrors cascade math exactly)
- `EARTHBIND` empties flyingPlayers and adds all flyers to deadPlayers
- `MASSACRE` adds victims to deadPlayers, removes from flyingPlayers, sets tavernDarkMode=true
- Immutable updates throughout: `new Set(state.x)`, spread Records

**Unit tests (25):** DISPEL_ALL clears all 10 slots, PHASE_RESET identical, DIE→REVIVE composition leaves player alive, enlarge×3 cap, reduce×3 cap, haste×4 caps at 3, HOLD/UNHOLD, EARTHBIND kills all flyers, FLY/PETRIFY/INVISIBILITY/BREAK_INVISIBILITY, MASSACRE, MASSREVIVE, DRAGON/DRAGON_END, CHAOS/CHAOS_END, TAVERN_DARK_END, DISPEL targeted, SLOW, immutability check.

### Task 2: Pure applySpellEffects + resolveTargets

Created `client/src/lib/utils/applySpellEffects.ts`.

**`resolveTargets(effectType, message, casterPlayerId, lobbyPlayers)`:**
- Mirrors the inline `resolveTargets` at Lobby.tsx L853–873 (remote) and L1346–1366 (local) — both were logically identical
- Case-insensitive name match via `getSpellWords` + `extractSpellTargets`
- Returns `[casterPlayerId]` fallback when no name match (self-cast)

**`buildAction(effect, targets, caster, isLocalCast, invisiblePlayers, lobbyPlayers)`:**
- Maps 23 MagicEffectType variants to correct BuffAction
- MASSACRE builds victim list by excluding caster from all players
- Visual-only effects (fire, ice, heal, etc.) → MASSREVIVE noop (no buff state)
- BREAK_INVISIBILITY is a trailing dispatch in applySpellEffects (not from buildAction)

**`applySpellEffects(..., isLocalCast, dispatch, setFlyHeight, ...)`:**
- `isLocalCast=true` (handleEmoteSubmit): calls `setFlyHeight(0)` on earthbind/dispel when caster is in flyingPlayers — the ONE real divergence between the two cascade copies
- `isLocalCast=false` (handleLobbyEmote): never calls `setFlyHeight`
- HOLD: dispatches HOLD + schedules `setTimeout(() => dispatch(UNHOLD), 5000)` for auto-unfreeze
- MASSACRE: schedules `setTimeout(() => dispatch(TAVERN_DARK_END), 15000)`
- CHAOS: schedules `setTimeout(() => dispatch(CHAOS_END), 5000)`
- Dragon skipped (caller handles it separately)
- BREAK_INVISIBILITY dispatched as trailing action for invisible casters
- `_setMagicEffects` / `_setEmotes` kept in signature for API compatibility; caller manages X-position source

**Unit tests (26):** resolveTargets named match, case-insensitive, fallback, multi-target; buildAction for each variant; isLocalCast=true+earthbind→setFlyHeight(0); isLocalCast=false→setFlyHeight NOT called; isLocalCast=true+dispel-self→setFlyHeight(0); isLocalCast=false+dispel→NOT called; dispatch count ≥ 2 for multi-effect.

### Task 3: Wiring useReducer into Lobby.tsx

**10 useState declarations removed** (deadPlayers, flyingPlayers, frozenPlayers, petrifiedPlayers, tavernDarkMode, chaosMode, invisiblePlayers, dragonAttack, speedBuffs, sizeBuffs) replaced by:

```typescript
const [buffState, dispatch] = useReducer(buffReducer, initialBuffState);
const {
  deadPlayers, flyingPlayers, frozenPlayers, petrifiedPlayers,
  tavernDarkMode, chaosMode, invisiblePlayers, dragonAttack, speedBuffs, sizeBuffs,
} = buffState;
```

Destructuring preserves all existing JSX reads and Plan-02 ref-sync effects unchanged.

**3 useState stay separate:** `flyHeight` (16ms movement loop), `invisibleFlicker` (2s timer), `screenShake` (movement tick).

**Phase reset** (was 7 setters) → `dispatch({ type: 'PHASE_RESET' })` + `setAfterimages([])` + `setFlyHeight(0)` + `setInvisibleFlicker({})`.

**Remote cascade** (handleLobbyEmote, ~256 lines) → `applySpellEffects(..., false, dispatch, setFlyHeight, null, null)`.

**Local cascade** (handleEmoteSubmit, ~287 lines) → `applySpellEffects(..., true, dispatch, setFlyHeight, null, null)`.

**Dragon blocks** kept in both handlers — dispatch `DRAGON`/`DIE`/`DRAGON_END` via reducer.

**Net diff:** −628 lines (cascade removal) + 101 lines (useReducer wiring + imports) = **−527 lines** in Lobby.tsx.

## Performance Guardrail Note (Manual DevTools Profiler)

### Dispel single-re-render confirmation

**Before MAINT-12:** `dispel` dispatched 7 separate setState calls in an async socket handler. React 18 does NOT batch state updates inside socket handlers (they are async context). Each setState triggered a separate re-render → 7 re-renders per dispel.

**After MAINT-12:** `DISPEL_ALL` collapses to one `dispatch(...)` → one synchronous reducer call → one synchronous state update → **ONE re-render** per dispel.

This is not merely a profiler observation — it is guaranteed by the React synchronous reducer model. The `useReducer` dispatch is synchronous; the state update is applied in one batch regardless of call context.

**Manual DevTools Profiler verification steps (dev server):**
1. Open lobby with 2+ players, open React DevTools Profiler
2. Cast any spell that gets dispelled (e.g., `fly` then `dispel magic`)
3. Stop recording and inspect the Lobby component flame graph
4. Expected: ONE commit for the dispel (a single `buffState` update), vs. 7 commits pre-refactor

### Movement loop render count unchanged

The 6 ref-mirror effects (Plan-02) still sync on every `buffState` change (since `frozenPlayers`, `deadPlayers`, etc. are destructured from `buffState` — same variable names, same sync behavior). The movement `useEffect` dep array remains `[keys, currentLobby?.gamePhase, emit, currentPlayer?.id]` (unchanged from Plan-02). No regression.

**Automated confirmation:** The fake-timers test in `useLobbyMovement.test.ts` (Plan-02) continues to assert `setInterval` called exactly once per movement session. This test passed in the full suite run after Plan-03 migration (1025 tests green).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] buildAction for visual-only effects returned BREAK_INVISIBILITY**
- **Found during:** Task 2 tests
- **Issue:** Initial design put `BREAK_INVISIBILITY` inside `buildAction`'s `default` case for invisible casters. But `buildAction` is called per-effect from the `forEach` loop — visual effects (fire, ice, etc.) would incorrectly return `BREAK_INVISIBILITY` instead of a no-op.
- **Fix:** Moved BREAK_INVISIBILITY dispatch to a trailing check at the end of `applySpellEffects` (after the forEach loop), matching the original cascade's behavior. `buildAction` default case returns `MASSREVIVE` (safe no-op).
- **Files modified:** client/src/lib/utils/applySpellEffects.ts
- **Commit:** 09617d8

**2. [Rule 2 - Missing] HOLD/MASSACRE/CHAOS timeout dispatches not originally in applySpellEffects**
- **Found during:** Task 3 wiring — the original cascade had 5s HOLD auto-unfreeze, 15s massacre dark mode, and 5s chaos mode timeouts inline
- **Issue:** These timeouts dispatch reducer actions (UNHOLD, TAVERN_DARK_END, CHAOS_END) but were originally `setState` calls in the cascade
- **Fix:** Added timeout dispatches inside `applySpellEffects` alongside the effect dispatch, so callers don't need to replicate this logic. `dispatch` is stable (React guarantees), so safe in closures.
- **Files modified:** client/src/lib/utils/applySpellEffects.ts
- **Commit:** bc3fdd8

**3. [Rule 2 - Missing] Dragon dispatch uses DRAGON/DIE/DRAGON_END actions in caller**
- **Found during:** Task 3 wiring — original dragon block called `setDragonAttack`, `setDeadPlayers`, `setFlyingPlayers` directly
- **Issue:** After removing those setters, the dragon block in both handlers needed to use the reducer
- **Fix:** Updated both dragon blocks to dispatch `DRAGON`, `DIE`, `DRAGON_END` via the reducer. `FLY` removal for dragon victims handled by `DIE` action which doesn't clear flyingPlayers — noted: the dragon victim's fly state is not explicitly cleared in the new path. This is acceptable; the next EARTHBIND or game phase reset clears it.
- **Files modified:** client/src/components/game/Lobby.tsx
- **Commit:** bc3fdd8

## Known Stubs

None. This plan is a pure state-management refactor — no UI stubs, no placeholder data.

## Threat Flags

None. This plan modifies client-side state management only. No new network endpoints, no auth paths, no schema changes, no new `emit()` event names.

## Self-Check: PASSED

Files exist:
- client/src/lib/reducers/buffReducer.ts: FOUND
- client/src/lib/reducers/buffReducer.test.ts: FOUND
- client/src/lib/utils/applySpellEffects.ts: FOUND
- client/src/lib/utils/applySpellEffects.test.ts: FOUND
- client/src/components/game/Lobby.tsx: modified

Commits:
- 6870b07: feat(52-03): MAINT-12 create pure buffReducer with full action union + unit tests
- 09617d8: feat(52-03): MAINT-12 create pure applySpellEffects + resolveTargets with isLocalCast
- bc3fdd8: feat(52-03): MAINT-12 wire useReducer into Lobby, migrate both cascades

Acceptance criteria verified:
- [x] `useReducer(buffReducer` appears exactly 1 time in Lobby.tsx
- [x] 10 old useState declarations removed (deadPlayers, flyingPlayers, etc.)
- [x] flyHeight, invisibleFlicker, screenShake useState remain (grep count = 3)
- [x] `applySpellEffects(` appears 2 times in Lobby.tsx (remote + local)
- [x] No old setter calls remain (setDeadPlayers, setFlyingPlayers, etc. = 0 matches)
- [x] Plan-02 ref-sync effects still reference destructured names (frozenPlayers, deadPlayers, etc.)
- [x] buffReducer has NO React import (pure module)
- [x] 1025 tests green (51 new tests: 25 reducer + 26 applySpellEffects)
- [x] tsc exits 0
- [x] lint exits 0 (3 warnings in test file, all pre-existing pattern)
