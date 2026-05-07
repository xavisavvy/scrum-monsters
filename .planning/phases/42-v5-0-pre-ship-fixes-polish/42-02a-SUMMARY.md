---
phase: 42-v5-0-pre-ship-fixes-polish
plan: 02a
subsystem: lobby-settings
tags: [lobby-settings, host-controls, schema, sockets, auto-advance]
requires:
  - shared/socket-schemas.ts EstimationSettingsSchema
  - shared/gameEvents.ts EstimationSettings interface
  - client/src/lib/utils/lobbySettingsStorage.ts (3-tier persistence)
  - client/src/components/game/Lobby.tsx (host-gated estimation settings panel)
  - server/gameState.ts checkDiscussionConsensus + handleVotingTimeout
provides:
  - autoAdvance host toggle in Lobby UI (default OFF)
  - server-side gate on consensus countdown (handleVotingTimeout untouched)
  - reconnect round-trip regression guard
affects:
  - all consensus-discussion phase transitions for hosts who enable the toggle
  - Phase 41 reconnect contract (lobbySync.lobby.estimationSettings.autoAdvance now survives)
tech_stack:
  added: []
  patterns: [3-tier persistence, host-gate, zod schema extension]
key_files:
  created:
    - client/src/lib/utils/lobbySettingsStorage.test.ts (7 tests)
    - server/gameState.test.ts (5 tests)
    - server/websocket.autoAdvance.reconnect.test.ts (2 tests)
  modified:
    - shared/socket-schemas.ts (line 128 — autoAdvance field on EstimationSettingsSchema)
    - shared/gameEvents.ts (line 97 — autoAdvance on EstimationSettings interface)
    - client/src/lib/utils/lobbySettingsStorage.ts (line 108 default; lines 142-144 validator)
    - client/src/components/game/Lobby.tsx (lines 1901-1916 — host-gated checkbox)
    - server/gameState.ts (line 1536 — gate condition)
decisions:
  - autoAdvance defaults to false (matches current behavior; opt-in)
  - Gate only consensus countdown; 3-min handleVotingTimeout safety net unchanged
  - session:settings_updated event payload (designed for 42-02b absorption) NOT emitted in this plan — schema-only addition rides the existing update_estimation_settings emit
metrics:
  duration: ~25min (with parallel-executor coordination overhead)
  tasks: 3
  files_changed: 8
  tests_added: 14
  completed: 2026-05-07
---

# Phase 42 Plan 02a: Auto-Advance Host Toggle Summary

**One-liner:** Restored auto-advance as a host-only Lobby checkbox (default OFF) gating consensus countdown; 3-min voting safety net preserved; full reconnect round-trip regression test added.

## Tasks Completed

### Task 0 — Schema/type/storage extensions (TDD)
**Commit:** `e34754e` (parallel-executor sweep, see Deviations)
**Tests:** `client/src/lib/utils/lobbySettingsStorage.test.ts` (7 tests, all passing)

- `shared/socket-schemas.ts:128` — `EstimationSettingsSchema` now has `autoAdvance: z.boolean().optional().default(false)`. Zod default ensures both wire validation and storage validation default to OFF when absent.
- `shared/gameEvents.ts:97` — `EstimationSettings` interface gains `autoAdvance?: boolean`.
- `client/src/lib/utils/lobbySettingsStorage.ts:108` — `getDefaultSettings()` includes `autoAdvance: false`.
- `client/src/lib/utils/lobbySettingsStorage.ts:142-144` — `validateSettings()` boolean coercion: tampered storage values fall back to false.

### Task 1 — Lobby UI checkbox + server gate (TDD)
**Commit:** `9841241`
**Tests:** `server/gameState.test.ts` (5 tests, all passing)

- **Client UI:** `client/src/components/game/Lobby.tsx:1901-1916` — checkbox inside Estimation Settings dialog, sibling to scaleType select. Mirrors timer-enabled checkbox styling. `disabled={!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby'}` enforces host-only + lobby-phase-only mutation. Reuses existing `updateEstimationSettings` (Lobby.tsx:1638-1648) — no new emit/persist wiring.
- **Server gate:** `server/gameState.ts:1536` — single-line condition extension:
  ```typescript
  // BEFORE: if (teamsAgree && lobby.boss && lobby.currentTicket) {
  // AFTER:  if (teamsAgree && lobby.boss && lobby.currentTicket && lobby.estimationSettings?.autoAdvance) {
  ```
- **3-min safety net unchanged:** `handleVotingTimeout` at gameState.ts:1346 reads no autoAdvance — verified by tests "advances the phase to reveal when autoAdvance=false/true (safety net fires)" + by visual inspection.

### Task 2 — Reconnect round-trip regression test
**Commit:** `5c7ab93`
**Tests:** `server/websocket.autoAdvance.reconnect.test.ts` (2 tests, all passing)

- Asserts `estimationSettings.autoAdvance` survives `gameState.handlePlayerDisconnect → attemptPlayerReconnect` for both `true` and `false` values.
- Guard against 42-RESEARCH.md Pitfall 5: should `getLobbySnapshot` ever shift to manual field copying, this test fails immediately rather than silently breaking host auto-advance preference on every disconnect cycle.

## Cross-Plan Handoff to 42-02b

`session:settings_updated` payload **schema** (`{ timerSettings?; jiraSettings?; estimationSettings?; seq; timestamp }`) was designed in this plan's `<interfaces>` block to absorb the future timer/jira/estimation emit-site migration. **However, no new socket event is emitted in 42-02a** — the existing `update_estimation_settings` → `lobby_updated` flow rides through unchanged (`autoAdvance` is just a new field on a value that was already crossing the wire). When 42-02b retires `lobby_updated`, the three settings emit sites at `websocket.ts:1453, 1464, 1475` should fold into a single `session:settings_updated` emission — the field shape is ready.

## Deviations from Plan

### Deviation 1 [Rule 1 — Bug, parallel-executor scope leak]

**Found during:** Task 0 commit attempt (~13:13).
**Issue:** A parallel executor running plan 42-01 swept my Task 0 working-tree changes into its own commit (`e34754e`) — that commit's title says `feat(42-01): add pendingDamageEvents store slice + extend combat:player_damaged handler`, but its file list includes `shared/gameEvents.ts`, `shared/socket-schemas.ts`, `client/src/lib/utils/lobbySettingsStorage.ts`, and `client/src/lib/utils/lobbySettingsStorage.test.ts` (all 42-02a Task 0 surface).
**Fix:** Verified the bundled changes are correct and tested — ran `npx vitest run client/src/lib/utils/lobbySettingsStorage.test.ts` after the sweep (7/7 pass) and `npx tsc --noEmit` (clean). Continued with Tasks 1 and 2 atomically. Did not retroactively rewrite history.
**Commit:** `e34754e` (carries Task 0 surface despite mislabeled message).
**Implications:** Future re-spawns or audits should know that `e34754e` IS the canonical Task 0 commit for 42-02a. The acceptance-criteria scripts (autoAdvance occurrence counts) all pass against current HEAD.

### Deviation 2 [Rule 1 — TypeScript strict-mode test fixture]

**Found during:** Task 1 `npx tsc --noEmit` after writing `server/gameState.test.ts`.
**Issue:** Test fixture's `lobby.teams` typed as `{ developers: string[]; qa: string[] }` but the `Lobby` interface expects `Player[]` arrays.
**Fix:** Added `as any` cast on the fixture's teams field — fixture is intentionally minimal (the `checkDiscussionConsensus` algorithm reads `lobby.players[*].team`, not `lobby.teams[*]`, so the field shape doesn't matter for the tests).
**Files modified:** server/gameState.test.ts:28
**Commit:** `9841241`

## Auth Gates

None.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Storage tests | `npx vitest run client/src/lib/utils/lobbySettingsStorage.test.ts` | 7/7 pass |
| GameState gate tests | `npx vitest run server/gameState.test.ts` | 5/5 pass |
| Reconnect regression | `npx vitest run server/websocket.autoAdvance.reconnect.test.ts` | 2/2 pass |
| Type check | `npx tsc --noEmit` | clean |
| Full test suite (final commit hook) | `npm test` | 690/690 pass, 37 files |

## Acceptance Criteria

- [x] `autoAdvance` present in `shared/socket-schemas.ts` (line 128)
- [x] `autoAdvance` appears 3+ times in `client/src/lib/utils/lobbySettingsStorage.ts` (default + validator + cast — verify script `(s.match(/autoAdvance/g)||[]).length<2` passes)
- [x] `Auto-advance to next ticket` string in Lobby.tsx (line 1914)
- [x] `estimationSettings?.autoAdvance` in non-comment lines of server/gameState.ts (line 1536)
- [x] `handleVotingTimeout` still present in server/gameState.ts (safety net intact)
- [x] All three new test files green
- [x] `npx tsc --noEmit` clean

## Self-Check: PASSED

- [x] `shared/socket-schemas.ts` (autoAdvance line 128) — verified at HEAD
- [x] `client/src/components/game/Lobby.tsx` (checkbox, line ~1914) — verified at HEAD via git show 9841241
- [x] `server/gameState.ts:1536` — gated condition verified at HEAD
- [x] Commit `e34754e` exists (Task 0 sweep)
- [x] Commit `9841241` exists (Task 1)
- [x] Commit `5c7ab93` exists (Task 2)
