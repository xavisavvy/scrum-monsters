---
phase: 50-finish-the-gamestate-domain-manager-migration
plan: "01"
subsystem: server/domains
tags: [refactor, migration, gamestate, session-manager, deletion]
dependency_graph:
  requires: []
  provides: [MAINT-07]
  affects:
    - server/gameState.ts
    - server/domains/SessionManager.ts
    - server/websocket.ts
tech_stack:
  added: []
  patterns:
    - SessionManager owns settings (host-guarded); emit stays in websocket handler
    - syncPlayerToLobby registers all lobby members idempotently
    - Constructable GameStateManager seam (startWatchdogs: false) for test fixtures
key_files:
  created:
    - server/gameState-characterization.test.ts
  modified:
    - server/gameState.ts
    - server/domains/SessionManager.ts
    - server/domains/SessionManager.test.ts
    - server/websocket.ts
    - server/gameState.test.ts
    - server/websocket.autoAdvance.reconnect.test.ts
decisions:
  - syncPlayerToLobby unconditionally refreshes lobby reference and registers all players idempotently
  - Settings emit stays in websocket.ts handler (Phase 42-02b pattern); not moved into SessionManager
  - removePlayer DEFERRED — live internal caller in processDisconnectedPlayers / 30s disconnectWatchdog
  - Battle methods (attackBoss/startBattle/submitScore/revealScores) explicitly NOT migrated (non-goal)
  - characterization test gs.createLobby/joinLobby sections removed after deletion (point-of-no-return)
  - TimerSettings/JiraSettings/EstimationSettings imports removed from gameState.ts (now unused)
metrics:
  duration_seconds: 811
  completed_date: "2026-06-23"
  tasks_completed: 4
  files_modified: 7
---

# Phase 50 Plan 01: Finish GameState Domain Manager Migration (MAINT-07) Summary

Completed the ordered, reversible decommission of dead/duplicate GameStateManager methods and migrated the three settings setters into SessionManager. The syncPlayerToLobby alias-staleness fix landed first (additive), followed by settings migration, characterization gate, and finally the deletions — each gated on green tests and zero-caller greps.

## What Was Built

**Task 1 — syncPlayerToLobby alias fix (additive):**
Fixed a latent reconnect-staleness bug where `syncPlayerToLobby` only registered the triggering player's alias. The new implementation unconditionally refreshes `this.lobbies.set(lobby.id, lobby)` and iterates `for (const player of lobby.players)` to idempotently register every player's alias. Regression tests added to `server/gameState.test.ts` with constructed `GameStateManager(undefined, { startWatchdogs: false })` seam.

**Task 2 — Settings migration:**
Added three public methods to `SessionManager`: `updateTimerSettings`, `updateJiraSettings`, `updateEstimationSettings`. Each follows the `updatePlayerTeam` guard sequence: `getPlayerLobby` → `PlayerNotFoundError` if null → isHost check → `PlayerNotHostError` if non-host → mutate field → return lobby. `emitFineGrained(session:settings_updated)` stays in the websocket handler (Pitfall 5 avoided). Websocket handlers now call `sessionManager.*` wrapped in try/catch emitting `game_error`. GameState settings methods retained through this task (deleted in Task 4).

**Task 3 — Characterization gate + test migration:**
Created `server/gameState-characterization.test.ts` pinning structural equivalence between SessionManager and GameState lobby shapes BEFORE deletion. Known divergence documented: GameState lobby includes `consensusSettings` field; SessionManager does not (safe difference). Migrated both `createLobby` test callers: `websocket.autoAdvance.reconnect.test.ts` now uses constructed `SessionManager + GameStateManager` instances with `sessionManager.handlePlayerDisconnect` / `sessionManager.attemptPlayerReconnect`; `gameState.test.ts` handleVotingTimeout fixture now uses `sessionManager.createLobby + gs.syncPlayerToLobby`.

**Task 4 — Deletions (point of no return):**
Deleted from `server/gameState.ts`: `createLobby`, `joinLobby`, `updatePlayerTeam`, `updatePlayerAvatar`, `updateTimerSettings`, `updateJiraSettings`, `updateEstimationSettings`. Added deferral comment near `removePlayer`. Characterization test's GameState sections removed (expected — compilation errors confirmed deletion). Unused imports `TimerSettings`, `JiraSettings`, `EstimationSettings` removed. syncPlayerToLobby tests migrated to use `SessionManager` fixtures.

## Test Results

| Phase | Tests | Status |
|-------|-------|--------|
| After Task 1 | 922 passing (11 new) | GREEN |
| After Task 2 | 929 passing (+7 new) | GREEN |
| After Task 3 | 932 passing (+3 new) | GREEN |
| After Task 4 | 932 passing | GREEN |

Full suite: 932 tests (up from 919 baseline — 13 new tests added)
`npm run check`: clean
`npm run lint`: clean

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | bcfc7b9 | fix(50-01): fix syncPlayerToLobby to register aliases for all lobby members |
| 2 | 76da60a | feat(50-01): migrate settings setters to SessionManager; redirect websocket handlers |
| 3 | f651688 | test(50-01): add pre-deletion characterization gate; migrate createLobby test callers |
| 4 | 194bf87 | refactor(50-01): delete 4 dead GameState methods + 3 settings setters; retain removePlayer |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Fixed unused imports after deletion**
- **Found during:** Task 4
- **Issue:** After removing the 3 settings setters from GameState, `TimerSettings`, `JiraSettings`, and `EstimationSettings` were no longer imported anywhere in `gameState.ts`, causing lint warnings.
- **Fix:** Removed all three from the import line.
- **Files modified:** `server/gameState.ts`
- **Commit:** 194bf87

**2. [Rule 1 - Bug] syncPlayerToLobby tests used gs.createLobby after deletion**
- **Found during:** Task 4 — tsc error revealed that Task 1's regression tests used `mgr.createLobby()` which was deleted in Task 4.
- **Fix:** Migrated the 3 syncPlayerToLobby test fixtures in `gameState.test.ts` to use `SessionManager.createLobby + sm.joinLobby` (production pattern), matching all other post-migration tests.
- **Files modified:** `server/gameState.test.ts`
- **Commit:** 194bf87

## MAINT-07 Scope Notes (Required per Plan)

**removePlayer was DEFERRED — not an oversight:**
`GameStateManager.removePlayer` (gameState.ts:487 post-deletion) is intentionally retained. `processDisconnectedPlayers` (the 30s `disconnectWatchdog`) still calls `this.removePlayer(playerId)` at line 193. Deletion is gated on removing `processDisconnectedPlayers` + `disconnectWatchdog` together — a future GameState-decommission phase. A deferral comment is present near the definition.

**Battle methods confirmed NOT migrated (explicit non-goal):**
`attackBoss`, `startBattle`, `submitScore`, `revealScores` all remain on `GameStateManager`. `grep -c "attackBoss\|startBattle\|submitScore\|revealScores" server/gameState.ts` returns 9.

## Phase 41 Reconnect Invariants

`websocket.autoAdvance.reconnect.test.ts` — Phase 41 regression suite — remains green throughout all 4 tasks. The migration to `sessionManager.handlePlayerDisconnect / attemptPlayerReconnect` preserved the autoAdvance round-trip invariant.

## Known Stubs

None. All changes are refactoring/deletion with no data rendering stubs.

## Threat Flags

None. No new network endpoints or auth paths introduced. The settings methods on `SessionManager` apply the same host guard that already existed in `GameState` — no security regression.

## Self-Check: PASSED

- server/gameState.ts: FOUND
- server/domains/SessionManager.ts: FOUND
- server/gameState-characterization.test.ts: FOUND
- Commits bcfc7b9, 76da60a, f651688, 194bf87: verified
- removePlayer retained at gameState.ts:487 with deferral comment
- Battle methods retained (grep count: 9)
- Full suite: 932 tests passing
