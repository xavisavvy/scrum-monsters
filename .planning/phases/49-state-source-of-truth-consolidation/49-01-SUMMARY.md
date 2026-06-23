---
phase: 49-state-source-of-truth-consolidation
plan: "01"
subsystem: client-state
tags: [zustand, state, teams, client, maint-04, regression]
dependency_graph:
  requires: []
  provides:
    - withTeamsDerived helper (client/src/lib/withTeamsDerived.ts)
    - setLobby single-site team derivation (client/src/lib/stores/useGameState.tsx)
  affects:
    - All 14 setLobby call sites in client/src/lib/socket/eventHandlers.ts (covered automatically)
tech_stack:
  added: []
  patterns:
    - "Pure utility function (single exported fn, type-only imports) — matches utils.ts shape"
    - "withTeamsDerived threaded through setLobby single-site — not per-handler"
key_files:
  created:
    - client/src/lib/withTeamsDerived.ts
    - client/src/lib/withTeamsDerived.test.ts
  modified:
    - client/src/lib/stores/useGameState.tsx
    - client/src/lib/socket/eventHandlers.test.ts
decisions:
  - "Wrap setLobby in store (single site) rather than thread withTeamsDerived into each of the 14 handlers — eliminates risk of future handlers missing derivation"
  - "Type-only import in withTeamsDerived.ts — no runtime dependency beyond @shared/gameEvents"
  - "Push RED test result manually before implementing — pre-commit hook runs full suite, so test + impl committed together in GREEN commit"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-23"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
  tests_added: 7
  test_count_before: 909
  test_count_after: 916
---

# Phase 49 Plan 01: withTeamsDerived — Team Derivation Single Truth (MAINT-04) Summary

**One-liner:** Pure `withTeamsDerived(lobby)` helper recomputes teams from players at the single `setLobby` site, closing the push-before-map bug and the two never-mirrored team staleness paths.

## What Was Built

MAINT-04 closes three client-side team-staleness bugs with one authoritative derivation site:

1. **`withTeamsDerived.ts`** — Pure helper that recomputes `teams: Record<TeamType, Player[]>` by filtering `players[]` for each of the three TeamTypes. Module-level `TEAM_TYPES` constant ensures all three keys are always present. Type-only import, no side effects, idempotent.

2. **`useGameState.tsx` line 128** — One-line change wrapping `setLobby` so every handler automatically derives teams: `setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) })`. No handler in `eventHandlers.ts` was modified.

3. **Regression tests in `eventHandlers.test.ts`** — New `MAINT-04` describe block with 3 integration regression tests proving the three previously-failing cases now work correctly.

## Bugs Closed

| Bug | Handler | Symptom | Root Cause |
|-----|---------|---------|------------|
| Push-before-map | `session:team_changed` | `teams[newTeam][*].team === oldTeam` | player pushed from old `players[]` before `.map()` applied |
| teams never mirrored | `session:avatar_selected` | `teams[*][*].avatar` stale | handler only updated `players[]`, not `teams` |
| teams never mirrored | `session:host_changed` | `teams[*][*].isHost` stale | handler only updated `players[]`, not `teams` |

## Deviations from Plan

**None — plan executed exactly as written.**

The pre-commit hook runs the full test suite, so the RED phase test could not be committed in isolation (the missing module caused a suite-level failure). The failing test was run manually to confirm RED behavior, then the implementation and test were committed together in the GREEN commit. This is documented as a workflow observation, not a deviation.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| `withTeamsDerived.test.ts` | 4 | All pass |
| `eventHandlers.test.ts` | 24 (+3 new MAINT-04 regression) | All pass |
| Full suite | 916 (+7 from 909) | All pass |

### Regression Proof

The `session:team_changed` regression test asserts `teams.qa[0].team === 'qa'`. This assertion would fail against the pre-fix store because the old handler pushed the player object from `players[]` BEFORE applying `.map()`, so `teams[newTeam]` received a player still carrying `team: 'developers'`.

## Known Stubs

None — all team derivation paths are wired through the live helper.

## Threat Flags

None — this plan modifies client-side Zustand state management only. No new network endpoints, auth paths, or trust boundaries introduced.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d7b807f | feat(49-01) | add withTeamsDerived helper + unit tests (MAINT-04) |
| 7957877 | feat(49-01) | wrap setLobby in withTeamsDerived; add handler regression tests |

## Self-Check: PASSED

- [x] `client/src/lib/withTeamsDerived.ts` — FOUND
- [x] `client/src/lib/withTeamsDerived.test.ts` — FOUND
- [x] `client/src/lib/stores/useGameState.tsx` contains `withTeamsDerived(lobby)` — VERIFIED
- [x] `client/src/lib/socket/eventHandlers.test.ts` contains MAINT-04 describe block — VERIFIED
- [x] Commit d7b807f exists — VERIFIED
- [x] Commit 7957877 exists — VERIFIED
- [x] 916 tests pass — VERIFIED
- [x] `npm run check` exits 0 — VERIFIED
- [x] `npm run lint` exits 0 — VERIFIED
