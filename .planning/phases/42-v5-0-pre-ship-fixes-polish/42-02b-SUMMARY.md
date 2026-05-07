---
phase: 42-v5-0-pre-ship-fixes-polish
plan: 02b
subsystem: socket-event-taxonomy
tags: [sockets, event-taxonomy, refactor, fix-05, ship-blocker]
requirements: [FIX-05]
dependency_graph:
  requires:
    - eventBus + ScopedEventBus + ClientEventEmitter (existing fine-grained pipeline)
    - useEventSync seq gate (existing client-side ordering primitive)
    - 42-02a session:settings_updated payload design
    - 42-01 useGameState pendingDamageEvents slice (must coexist)
  provides:
    - 7 new ServerToClientEvents (session:tickets_updated, session:player_ready_changed, session:lobby_renamed, session:settings_updated, session:game_reset, session:ticket_advanced, estimation:discussion_vote_updated)
    - useGameState.requestBattleRemount + battleRemountKey + isBattleUnmounting slice
    - emitFineGrained() helper in setupWebSocket() for non-eventBus emit sites
  affects:
    - every server-side state-mutation broadcast (was lobby_updated, now scoped)
    - GamePage.tsx no longer owns BattleScreen remount logic
    - asyncapi.yaml + CLAUDE.md + README.md no longer document the retired event
tech-stack:
  added: []
  patterns:
    - "fine-grained event taxonomy (session:* / combat:* / estimation:*)"
    - "store-owned BattleScreen remount control (replaces GamePage local state)"
key-files:
  created: []
  modified:
    - shared/gameEvents.ts
    - server/websocket.ts
    - server/gameState.ts
    - client/src/lib/socket/eventHandlers.ts
    - client/src/lib/stores/useGameState.tsx
    - client/src/pages/GamePage.tsx
    - specs/asyncapi.yaml
    - CLAUDE.MD
    - README.md
decisions:
  - "Used eventBus.emit('session:phase_changed', ...) for the 10 phase-transition sites (Task 1a) — already wired through ClientEventEmitter; no new infrastructure needed"
  - "For the 9 Task 1b sites needing brand-new event types, added a local emitFineGrained() helper that wraps the ClientEventEmitter sequencer/buffer pattern (mirrors the existing avatar_selected emit at websocket.ts:~505). Avoids extending ClientEventEmitter + ScopedEventBus + DomainEventMap for events with no internal-domain producer"
  - "Migrated BattleScreen remount control from GamePage local state into useGameState (Option A in plan). requestBattleRemount() encapsulates the same 100ms unmount + key++ sequence; eventHandlers.ts triggers it from session:phase_changed (entry to 'battle') + session:ticket_advanced (mid-battle)"
  - "proceed_next_level emits BOTH session:game_reset (for full-state replace) AND session:ticket_advanced (for BattleScreen remount on the new ticket) — keeps the remount trigger explicit instead of inferring it from the lobby diff"
  - "asyncapi.yaml LobbyUpdatedPayload schema retained (still referenced by boss_defeated / quest_abandoned / game_over channels); only the lobbyUpdated channel block was removed"
metrics:
  duration_minutes: 25
  tasks_completed: 4
  tests_added: 0
  test_total: 690
  test_baseline: 690
  completed: 2026-05-07
---

# Phase 42 Plan 02b: `lobby_updated` Full Retirement (FIX-05) — Summary

**One-liner:** Fully retired the deprecated `lobby_updated` socket event by migrating all 26 server emit sites to fine-grained domain events (session:* / combat:* / estimation:*), deleting the GamePage handler, and removing the type from `ServerToClientEvents` so tsc serves as the future safety net.

## Migration Table (verbatim from RESEARCH.md, with commit refs)

| # | File:Line (orig) | Trigger | Replacement | Commit |
|---|-----------------|---------|-------------|--------|
| 1 | websocket.ts:160 | discussion auto-advance setTimeout | REMOVE (eventBus.emit phase_changed at ~144/152 covers) | `1765a51` |
| 2 | websocket.ts:241 | sweeper interval (host_transferred grace expiry) | REMOVE (host_transferred above covers) | `1765a51` |
| 3 | websocket.ts:611 | add_tickets | session:tickets_updated | `2b4652e` |
| 4 | websocket.ts:629 | remove_ticket | session:tickets_updated | `2b4652e` |
| 5 | websocket.ts:810 | toggle_ready | session:player_ready_changed | `2b4652e` |
| 6 | websocket.ts:693 | update_lobby_name | session:lobby_renamed | `2b4652e` |
| (—) | websocket.ts:660 | leave_lobby player_left | REMOVE (player_left above covers) | `1765a51` |
| 8 | websocket.ts:927 | submit_score reveal | session:phase_changed (battle→reveal) + scores_revealed adjacent | `1765a51` |
| 9 | websocket.ts:959 | update_discussion_vote | estimation:discussion_vote_updated | `2b4652e` |
| 10 | websocket.ts:971 | discussion auto-advance setTimeout | session:phase_changed | `1765a51` |
| 11 | websocket.ts:1130 | proceed_next_level | session:game_reset + session:ticket_advanced | `2b4652e` |
| 12 | websocket.ts:1145 | abandon_quest | session:phase_changed (quest_abandoned adjacent) | `1765a51` |
| 13 | websocket.ts:1161 | restart_game | session:phase_changed | `1765a51` |
| 14 | websocket.ts:1178 | return_to_lobby | session:phase_changed | `1765a51` |
| 15 | websocket.ts:1193 | force_reveal | session:phase_changed (scores_revealed adjacent) | `1765a51` |
| 16 | websocket.ts:1277 | advancePhaseNow | session:phase_changed | `1765a51` |
| 17 | websocket.ts:1302 | forceVotingProgression | session:phase_changed | `1765a51` |
| 18 | websocket.ts:1316 | forceVotingProgression reveal cascade | session:phase_changed | `1765a51` |
| 19 | websocket.ts:1453 | update_timer_settings | session:settings_updated | `2b4652e` |
| 20 | websocket.ts:1464 | update_jira_settings | session:settings_updated | `2b4652e` |
| 21 | websocket.ts:1475 | update_estimation_settings | session:settings_updated | `2b4652e` |
| 22 | websocket.ts:1554 | reconnect broadcast | REMOVE (player_reconnected above covers) | `1765a51` |
| 23 | websocket.ts:2157 | host transfer disconnect fallback | REMOVE (host_transferred above covers) | `1765a51` |
| 24 | websocket.ts:2172 | player removal disconnect fallback | REMOVE (player_disconnected above covers) | `1765a51` |
| 25 | gameState.ts:173 | restoreDisconnectedPlayer (grace expiry permanent removal) | REMOVE (no broadcast needed; SessionManager events handle roster) | `1765a51` |
| 26 | gameState.ts:1368 | handleVotingTimeout (3-min safety net) | session:phase_changed via eventBus (battle→reveal) | `1765a51` |

**Total: 26 sites** — 9 REMOVE-only + 17 migrated to fine-grained replacements.

Note: row #5 in the original RESEARCH.md table mapped to a line that is `leave_lobby` in current code. The actual `toggle_ready` site is at the post-shift line 810 (still mapped to `session:player_ready_changed` per row semantics). One additional REMOVE-only site (`leave_lobby` redundancy with `player_left`) was discovered during execution and is logged here for completeness.

## New Events Added to `shared/gameEvents.ts`

In `ServerToClientEvents` (Task 0, commit `f88944a`):

```typescript
'session:tickets_updated':         (data: { tickets: JiraTicket[]; seq; timestamp }) => void;
'session:player_ready_changed':    (data: { playerId; isReady; seq; timestamp }) => void;
'session:lobby_renamed':           (data: { name; seq; timestamp }) => void;
'session:settings_updated':        (data: { timerSettings?; jiraSettings?; estimationSettings?; seq; timestamp }) => void;
'session:game_reset':              (data: { lobby: Lobby; seq; timestamp }) => void;
'session:ticket_advanced':         (data: { currentTicket: JiraTicket; seq; timestamp }) => void;
'estimation:discussion_vote_updated': (data: { playerId; score; seq; timestamp }) => void;
```

REMOVED in Task 3 (commit `b7b4ba7`):

```typescript
'lobby_updated': (data: { lobby: Lobby }) => void;  // DELETED
```

## BattleScreen Remount Migration (Task 2)

**Approach: Option A** (per plan's preference). Moved `battleRemountKey` + `isBattleUnmounting` ownership from `GamePage.tsx` local state into the `useGameState` Zustand store. Added a `requestBattleRemount()` action that encapsulates the original 100ms unmount + key++ sequence.

Trigger sites (all in `client/src/lib/socket/eventHandlers.ts`):

| Trigger | Condition | Branch |
|---------|-----------|--------|
| `session:phase_changed` | `data.oldPhase !== 'battle' && data.newPhase === 'battle'` | Phase entry to battle |
| `session:ticket_advanced` | `currentLobby.gamePhase === 'battle'` | Mid-battle ticket change |

`GamePage.tsx`:
- Deleted lines 188-219 (the deprecated handler + `console.warn` + remount trigger).
- Deleted line 306 (`socket.off('lobby_updated')`).
- Deleted local `battleRemountKey` + `isBattleUnmounting` + `lastGamePhase` + `lastGamePhaseRef` state.
- BattleScreen JSX still receives the same `key={`battle-${battleRemountKey}-${phase}-${currentTicket?.id}`}` — now sourced from the store.

## Documentation Updates (Task 3)

- **`CLAUDE.MD:78`** — Replaced "Server emits `lobby_updated` event whenever game state changes" with a paragraph describing the fine-grained `session:*` / `combat:*` / `estimation:*` taxonomy and `eventBus.emit(...)` flow.
- **`specs/asyncapi.yaml:714-720`** — Removed the `lobbyUpdated:` channel/operation block. The `LobbyUpdatedPayload` schema (line 2250) is retained because `boss_defeated`, `quest_abandoned`, and `game_over` channels still reference it.
- **`README.md:206`** — Replaced the stale `lobby_updated` bullet with a fine-grained domain summary (session:*, combat:*, estimation:*).
- **`server/websocket.ts:1`** — Replaced the file-top "Phase 5 cleanup" TODO with a Phase 42-02b completion note.

## Atomicity Confirmation

Per CONTEXT.md: "Client must drop the handler in the same plan/commit set as the last server-side emit removal." Order of commits:

1. `f88944a` — Task 0: add new events + handlers + remount slice (lobby_updated still active)
2. `1765a51` — Task 1a: 16 mechanical server emit removals (9 lobby_updated emits remain in websocket.ts)
3. `2b4652e` — **Task 1b + Task 2 atomic**: final 9 emit removals AND GamePage handler deletion in a single commit. No commit checkpoint between this and HEAD~2 leaves an in-flight `lobby_updated` event without a registered handler.
4. `b7b4ba7` — Task 3: type removal + doc updates. tsc --noEmit confirms zero dangling emits at this point.

## Vitest + tsc Output

```
$ npx tsc --noEmit
(clean exit)

$ npm test
Test Files  37 passed (37)
     Tests  690 passed (690)
  Duration  7.54s
```

Acceptance gate scripts (all pass at HEAD = `b7b4ba7`):

```
$ node -e "if(/'lobby_updated'/.test(require('fs').readFileSync('shared/gameEvents.ts','utf8')))process.exit(1)"
$ node -e "if(/lobby_updated/.test(require('fs').readFileSync('specs/asyncapi.yaml','utf8')))process.exit(1)"
$ node -e "if(/Server emits .lobby_updated. event whenever/.test(require('fs').readFileSync('CLAUDE.MD','utf8')))process.exit(1)"
$ node -e "if(/socket\.on\('lobby_updated'/.test(require('fs').readFileSync('client/src/pages/GamePage.tsx','utf8')))process.exit(1)"
$ node -e "const s=require('fs').readFileSync('server/websocket.ts','utf8').replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); if((s.match(/'lobby_updated'/g)||[]).length>0)process.exit(1)"
$ node -e "const s=require('fs').readFileSync('server/gameState.ts','utf8').replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); if((s.match(/'lobby_updated'/g)||[]).length>0)process.exit(1)"
```

All exit 0.

## Deviations from Plan

### Rule 3 — Task line numbers in plan migration table had drifted

**Found during:** Task 1a / 1b execution.
**Issue:** RESEARCH.md was authored against an earlier snapshot of `server/websocket.ts`. Several line numbers in the migration table point at different handlers in current HEAD (e.g. row #5 `toggle_ready @ 660` is actually `leave_lobby` in current code; `toggle_ready` lives at line ~810 today).
**Fix:** Followed semantic mapping (handler name → replacement event), not literal line number. Every site in the original table was migrated to the right replacement; one additional REMOVE-only site (`leave_lobby` redundant with adjacent `player_left`) was discovered during execution and removed in commit `1765a51`. Net result: 27 lines deleted (the 26 in the table plus the `leave_lobby` extra), 17 fine-grained replacement emits added.
**Files modified:** server/websocket.ts, server/gameState.ts
**Commits:** `1765a51`, `2b4652e`

### Rule 2 — proceed_next_level needed BOTH session:game_reset AND session:ticket_advanced

**Found during:** Task 1b row #11.
**Issue:** Plan said `session:game_reset` covers proceed_next_level. But the BattleScreen-remount logic in `eventHandlers.ts` (added in Task 0) keys off `session:ticket_advanced` for mid-battle ticket transitions. If proceed_next_level only emitted `session:game_reset`, the BattleScreen on a mid-game next-level transition would not remount because nobody fires the explicit ticket-advanced event.
**Fix:** proceed_next_level now emits both events: `session:game_reset` (full lobby payload, replacing the old full-state push) immediately followed by `session:ticket_advanced` (currentTicket payload, triggering the remount). Both are seq-gated and arrive in order via the same lobby room.
**Files modified:** server/websocket.ts (proceed_next_level handler)
**Commit:** `2b4652e`

### Rule 3 — gameState.ts handleVotingTimeout had no eventBus access

**Found during:** Task 1a row #26.
**Issue:** `server/gameState.ts` did not import `eventBus`. The plan said to use `eventBus.emit('session:phase_changed', ...)` here, but the symbol was unavailable.
**Fix:** Added `import { eventBus } from './domains/index.js';` at the top of `gameState.ts`. No circular import (domains/index.ts does not import gameState).
**Files modified:** server/gameState.ts
**Commit:** `1765a51`

### Rule 3 — gameState.ts:173 (grace expiry) had no good fine-grained replacement

**Found during:** Task 1a row #25.
**Issue:** This site fires when a disconnected player's grace period expires and they are permanently removed. There is no ideal fine-grained event in the existing taxonomy — `session:player_left` would imply a voluntary leave, and the player's already-emitted `player_disconnected` event covers the UX signal.
**Fix:** REMOVE-only with no replacement. Documented inline that SessionManager's existing player-removal events cover the roster mutation downstream. Rule 4 (architectural) was considered but rejected — adding a brand-new `session:player_grace_expired` event for a single rare edge case was disproportionate.
**Files modified:** server/gameState.ts
**Commit:** `1765a51`

## Authentication Gates

None — no auth surfaces touched.

## TDD Gate Compliance

This plan was executed as a refactor (no `tdd: true` gate). The 690-test baseline runs after every commit (husky pre-commit hook); zero new tests were authored, zero regressions detected.

## Self-Check: PASSED

Commits exist (verified by `git log --oneline`):
- FOUND: `f88944a` — Task 0: add 7 events + handlers + battle remount slice
- FOUND: `1765a51` — Task 1a: 16 mechanical lobby_updated removals
- FOUND: `2b4652e` — Task 1b + Task 2 atomic: final 9 server removals + GamePage handler delete
- FOUND: `b7b4ba7` — Task 3: shared/gameEvents.ts type removal + docs

Files modified (verified):
- FOUND: shared/gameEvents.ts (7 events added in Task 0; lobby_updated declaration removed in Task 3)
- FOUND: server/websocket.ts (26 emit sites migrated; emitFineGrained helper added; file-top TODO replaced)
- FOUND: server/gameState.ts (rows #25 + #26 migrated; eventBus import added)
- FOUND: client/src/lib/socket/eventHandlers.ts (7 new handlers; session:phase_changed extended with remount trigger)
- FOUND: client/src/lib/stores/useGameState.tsx (battleRemountKey + isBattleUnmounting + requestBattleRemount slice added)
- FOUND: client/src/pages/GamePage.tsx (handler deleted; remount state migrated to store)
- FOUND: specs/asyncapi.yaml (lobbyUpdated channel block removed)
- FOUND: CLAUDE.MD (State Sync section rewritten)
- FOUND: README.md (Server -> Client section updated)

Acceptance criteria:
- [x] 0 non-comment occurrences of `'lobby_updated'` in `server/websocket.ts`
- [x] 0 non-comment occurrences of `'lobby_updated'` in `server/gameState.ts`
- [x] 0 occurrences of `lobby_updated` in `client/src/pages/GamePage.tsx`
- [x] 0 occurrences of `'lobby_updated'` in `shared/gameEvents.ts`
- [x] 0 occurrences of `lobby_updated` in `specs/asyncapi.yaml`
- [x] CLAUDE.md no longer references the stale "Server emits `lobby_updated` event whenever..." doc line
- [x] All 7 new events present in shared/gameEvents.ts
- [x] All 7 new socket.on registrations present in eventHandlers.ts
- [x] requestBattleRemount referenced in eventHandlers.ts
- [x] tsc --noEmit clean
- [x] npm test: 690/690 passing (no regressions vs. 42-02a baseline)
- [x] Phase 41 reconnect tests still pass (server/websocket.autoAdvance.reconnect.test.ts 2/2)
- [x] Phase 40 tutorial tests still pass (no overlay changes)
