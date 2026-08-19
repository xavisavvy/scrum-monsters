# Phase 50: Finish the GameState → Domain-Manager Migration — Research

**Researched:** 2026-06-23
**Domain:** Server-side TypeScript refactoring — GameStateManager decommission, revival migration, host-transfer event
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAINT-07 | Fix syncPlayerToLobby alias bug FIRST; delete dead duplicate GameState methods (createLobby, joinLobby, removePlayer, updatePlayerTeam, updatePlayerAvatar); migrate settings handlers to SessionManager | Fully mapped — all 5 methods located with line numbers, all call sites audited (see Call-Site Audit section) |
| MAINT-08 | Route all revival traffic through CombatManager; remove gameState revivalWatchdog (constructor) AND websocket.ts legacy watchdog (revivalWatchdogInterval); add session:host_transferred eventBus event | Both watchdogs located with line numbers; CombatManager already owns startRevival/tickRevival/cancelRevival; websocket.ts still calls gameState.startRevive/cancelRevive/tickRevive |

</phase_requirements>

---

## Summary

Phase 50 completes the stalled monolith-to-domain-manager migration. Two distinct streams (MAINT-07 and MAINT-08) both touch `server/gameState.ts` and `server/websocket.ts`, making them **sequentially dependent within each stream but parallel between streams only if different lines are affected**. In practice MAINT-07 deletes methods and MAINT-08 moves watchdog logic, so they do share the same files — execute MAINT-07 first, then MAINT-08, or treat them as separate waves with a checkpoint between.

**MAINT-07 — three-step ordered sequence:**
1. Fix the `syncPlayerToLobby` alias bug unconditionally (adds one line; safe to land first).
2. Audit and delete the 5 dead GameState duplicate methods.
3. Migrate the three settings handlers (`updateTimerSettings`, `updateJiraSettings`, `updateEstimationSettings`) into SessionManager.

**MAINT-08 — two independent deliverables:**
1. Route `revive_start` / `revive_cancel` / `revive_tick` through `combatManager.startRevival` / `.cancelRevival` / (no-op tick); remove `gameState.startRevive`, `cancelRevive`, `tickRevive`; gut the `websocket.ts` legacy `revivalWatchdogInterval` (it only wraps `gameState.processRevivalSessions`).
2. Add `session:host_transferred` to the internal eventBus contract (eventTypes.ts), emit it from `SessionManager.processDisconnectedPlayers`, bridge it through `ClientEventEmitter` as the existing `host_transferred` wire event, and remove the naked `io.to(transfer.lobbyId).emit('host_transferred', ...)` call from the `sessionDisconnectSweeperInterval` in `websocket.ts`.

The gameState 100ms `revivalWatchdog` (constructor line 64) is separate from the websocket.ts 100ms `revivalWatchdogInterval` (line 246). Both poll `gameState.processRevivalSessions()`. After MAINT-08, `CombatManager` owns all revival life-cycles internally via its own 100ms `setInterval` inside each `RevivalSession.intervalHandle`, so the two external polling loops become dead code.

**Primary recommendation:** Land MAINT-07 in Wave 1 (three tasks: alias-fix, delete audit, settings migration). Land MAINT-08 in Wave 2 (two tasks: revival consolidation, host_transferred event). Do NOT combine into a single wave — each deletion needs a green CI commit before proceeding.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lobby lifecycle (create, join, remove player) | SessionManager | — | SessionManager is the declared owner; GameState duplicate methods are legacy |
| Player-team updates | SessionManager | — | SessionManager.changeOwnTeam / assignTeam already live; GameState versions are unused |
| Settings (timer, jira, estimation) | SessionManager | — | Settings live on Lobby object owned by SessionManager |
| Revival channeling | CombatManager | — | CombatManager.startRevival drives a self-contained 100ms interval per session |
| Host transfer broadcast | ClientEventEmitter (eventBus bridge) | — | All other domain events flow through the eventBus bridge; io.to() direct call in sweeper is the anomaly |
| Player-id → lobby-id alias (battle dispatch) | GameStateManager | SessionManager | GameState.playerToLobby is still needed for battle methods; alias must be kept in sync |

---

## Standard Stack

No new packages. All work is TypeScript refactoring within existing files.

---

## Package Legitimacy Audit

No packages installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
BEFORE Phase 50
================
revive_start ───► gameState.startRevive() ──► GameState.revivalSessions Map
                                               ↑
                    gameState revivalWatchdog  │  (constructor, 100ms setInterval, line 64)
                    websocket.ts revivalWatchdogInterval  (line 246, 100ms setInterval)
                      both call processRevivalSessions() ──► eventBus.emit('combat:player_revived')

sessionDisconnectSweeperInterval (30s) ──► sessionManager.processDisconnectedPlayers()
                                             returns hostTransfers[]
                                               ──► io.to(lobbyId).emit('host_transferred', ...) DIRECT CALL

AFTER Phase 50
===============
revive_start ───► combatManager.startRevival() ──► CombatManager.revivalSessions Map
                                                      │
                                              setInterval per session (100ms, self-managed)
                                                      │
                                              eventBus.emit('combat:player_revived')
                                              eventBus.emit('combat:revival_progress')
                    [gameState revivalWatchdog DELETED]
                    [websocket.ts revivalWatchdogInterval DELETED]

sessionDisconnectSweeperInterval (30s) ──► sessionManager.processDisconnectedPlayers()
                                             returns hostTransfers[]
                                               ──► eventBus.emit('session:host_transferred', ...)
                                                     │
                                             ClientEventEmitter bridge
                                                     │
                                             io.to(lobbyId).emit('host_transferred', ...)
                    [naked io.to() call DELETED from sweeper]
```

### Recommended Project Structure (files touched)

```
server/
├── gameState.ts              # alias-fix; delete 5 methods + 3 settings methods; delete revivalWatchdog ctor
├── websocket.ts              # revivalWatchdogInterval deleted; sweeper io.to() replaced by eventBus.emit
├── websocket.handlers.ts     # no change needed (syncPlayerToLobby calls remain)
├── domains/
│   ├── SessionManager.ts     # add updateTimerSettings/Jira/Estimation; emit session:host_transferred
│   ├── CombatManager.ts      # no change (startRevival, tickRevival, cancelRevival already exist)
│   └── index.ts              # no change needed
├── events/
│   ├── eventTypes.ts         # add SessionHostTransferredPayload + 'session:host_transferred' to EventMap
│   └── ClientEventEmitter.ts # add bridge listener for 'session:host_transferred'
└── domains/SessionManager.test.ts   # add settings delegation tests
```

---

## Call-Site Audit

> This is the deletion-safety gate for MAINT-07. Every row must read "SAFE" before the corresponding method is deleted.

### Method: `GameStateManager.createLobby`
**Definition:** `server/gameState.ts:482-572`

| Call Site | File | Line | Live or Dead? | Notes |
|-----------|------|------|---------------|-------|
| `gameState.createLobby(...)` | `server/websocket.autoAdvance.reconnect.test.ts` | 18 | **TEST ONLY** | Regression test for autoAdvance round-trip; uses GameState singleton directly |
| `gs.createLobby(...)` | `server/gameState.test.ts` | 197 (internal fixture) | **TEST ONLY** | `gs = gameState as any` — test fixture construction |

**SessionManager equivalent:** `SessionManager.createLobby` at `server/domains/SessionManager.ts:119`

**Identical-shape comparison:**

| Aspect | GameState.createLobby | SessionManager.createLobby |
|--------|----------------------|---------------------------|
| Params | `(hostName, lobbyName, initialSettings?)` | `(hostName, lobbyName, options?)` |
| Returns | `Lobby` | `Lobby` |
| Lobby structure | Nearly identical; same fields | Identical; `currentRound: 1` vs `currentRound: 0` (minor) |
| Emits | None | `session:player_joined` via eventBus |
| playerToLobby | `this.playerToLobby.set(hostId, lobbyId)` | `this.playerToLobby.set(hostId, lobbyId)` (identical) |
| Redis cache | `this.syncLobbyToCache(lobby)` | None (Redis responsibility unclear) |
| MAX_LOBBIES guard | None | Yes — throws `SessionError('LOBBY_CAPACITY_REACHED')` |

**Side-effect difference:** SessionManager emits `session:player_joined` on create; GameState does not. SessionManager enforces `MAX_LOBBIES`. These are improvements, not regressions.

**Test migration required:** `websocket.autoAdvance.reconnect.test.ts:18` uses `gameState.createLobby` directly because it tests the GameState reconnect path (which is also being migrated). This test should be updated to use `sessionManager.createLobby` + `gameState.syncPlayerToLobby` (the production pattern). The test remains valid.

**SAFE TO DELETE:** YES — after updating the two test call sites to use `sessionManager.createLobby`.

---

### Method: `GameStateManager.joinLobby`
**Definition:** `server/gameState.ts:574-621`

| Call Site | File | Line | Live or Dead? | Notes |
|-----------|------|------|---------------|-------|
| (none in server production code) | — | — | DEAD | All production join_lobby handling goes through `sessionManager.joinLobby` at websocket.ts:429 |

**SessionManager equivalent:** `SessionManager.joinLobby` at `server/domains/SessionManager.ts:240`

**Identical-shape comparison:**

| Aspect | GameState.joinLobby | SessionManager.joinLobby |
|--------|---------------------|--------------------------|
| Params | `(lobbyId, playerName)` | `(lobbyId, playerName)` |
| Returns | `{ lobby, player } \| null` | `{ lobby, player }` (throws on error) |
| Dedup guard | `find by name, return existing` (no disconnect check) | `find by name AND not in disconnectedPlayers` — more precise |
| Stale player cleanup | None | Removes stale disconnected players with same name |
| Avatar preservation | None | Preserves avatar/team from stale player |
| Emits | None | `session:player_joined` via eventBus |
| MAX_LOBBIES | None | Via createLobby only |

**SAFE TO DELETE:** YES — no production call sites. SessionManager version is strictly more capable.

---

### Method: `GameStateManager.removePlayer`
**Definition:** `server/gameState.ts:623-661`

| Call Site | File | Line | Live or Dead? | Notes |
|-----------|------|------|---------------|-------|
| `this.removePlayer(playerId)` | `server/gameState.ts` | 193 | **INTERNAL** | Called from `processDisconnectedPlayers()` when grace expires |

**SessionManager equivalent:** `SessionManager.removePlayer` at `server/domains/SessionManager.ts:450`

**Critical detail:** The internal call at line 193 is inside `GameState.processDisconnectedPlayers()`, which is called from the `GameState.disconnectWatchdog` (30s interval). When the full migration is complete, `GameState.processDisconnectedPlayers` will be dead code (SessionManager handles this) — but until then, the internal self-call at line 193 keeps the GameState.removePlayer method alive.

**Resolution:** GameState.removePlayer cannot be deleted independently. It becomes deletable only after GameState.processDisconnectedPlayers is also deleted (which happens when the GameState disconnect watchdog is removed). The watchdog is the correct deletion target; removePlayer falls away with it.

**Side-effect difference:** GameState.removePlayer calls `this.removePlayerSessionFromCache(playerId)` (Redis deletion). SessionManager.removePlayer does not do Redis cleanup. Redis cleanup is a separate concern; if needed it should be moved to SessionManager separately.

**SAFE TO DELETE (conditionally):** YES — but only AFTER `GameState.processDisconnectedPlayers()` and the `disconnectWatchdog` are removed. Cannot delete independently.

---

### Method: `GameStateManager.updatePlayerTeam`
**Definition:** `server/gameState.ts:703-714`

| Call Site | File | Line | Live or Dead? | Notes |
|-----------|------|------|---------------|-------|
| (none found) | — | — | DEAD | All team changes go through `sessionManager.changeOwnTeam` / `sessionManager.assignTeam` |

**SessionManager equivalent:** `SessionManager.updatePlayerTeam` (private) called via `changeOwnTeam`/`assignTeam`

**SAFE TO DELETE:** YES — no call sites found anywhere.

---

### Method: `GameStateManager.updatePlayerAvatar`
**Definition:** `server/gameState.ts:716-727`

| Call Site | File | Line | Live or Dead? | Notes |
|-----------|------|------|---------------|-------|
| (none found) | — | — | DEAD | Avatar selection handled by direct mutation in `select_avatar` handler (websocket.ts:541-571) via `sessionManager.getPlayerLobby`, then `emitFineGrained` |

**Note:** `GameState.selectAvatar` (lines 729-740) is a separate method that IS still called indirectly — but only `updatePlayerAvatar` is the target here. `selectAvatar` is not in scope.

**SAFE TO DELETE:** YES — no call sites found anywhere.

---

### Deletion Pre-Condition Summary

| Method | Location | Safe? | Condition |
|--------|----------|-------|-----------|
| `createLobby` | `gameState.ts:482` | YES | After migrating 2 test call sites to `sessionManager.createLobby` |
| `joinLobby` | `gameState.ts:574` | YES | Immediately; zero production call sites |
| `removePlayer` | `gameState.ts:623` | CONDITIONAL | Only after `processDisconnectedPlayers()` + `disconnectWatchdog` are removed |
| `updatePlayerTeam` | `gameState.ts:703` | YES | Immediately; zero call sites |
| `updatePlayerAvatar` | `gameState.ts:716` | YES | Immediately; zero call sites |

---

## syncPlayerToLobby Alias Bug (Fix FIRST)

### Current Implementation
`server/gameState.ts:694-701`

```typescript
syncPlayerToLobby(playerId: string, lobby: Lobby): void {
  // Store the lobby if not already present
  if (!this.lobbies.has(lobby.id)) {
    this.lobbies.set(lobby.id, lobby);
  }
  // Map player to lobby
  this.playerToLobby.set(playerId, lobby.id);
}
```

### The Bug

The lobby is only stored in `this.lobbies` when `!this.lobbies.has(lobby.id)`. This is correct.

But `this.playerToLobby.set(playerId, lobby.id)` only maps ONE player at a time. This method is called three times per session:

1. `websocket.handlers.ts:62` — `deps.gameState.syncPlayerToLobby(lobby.hostId, lobby)` — called on `create_lobby`
2. `websocket.ts:432` — `gameState.syncPlayerToLobby(player.id, lobby)` — called on `join_lobby`
3. `websocket.handlers.ts:159` — `deps.gameState.syncPlayerToLobby(playerId, lobbySync.lobby)` — called on `reconnect_with_token`

**The staleness scenario:** A player reconnects (call site 3). `syncPlayerToLobby` is called with the reconnecting player's ID. The lobby is already in `this.lobbies` (from the original create/join call), so it's not re-stored — correct. The reconnecting player gets their alias set — correct.

**However:** Other players who were in the lobby but did NOT reconnect may not have their aliases in `gameState.playerToLobby` if the server was restarted between their join and the next battle event. In a normal session this is fine because join_lobby calls syncPlayerToLobby for each joiner. The real gap is: after reconnect, if another player in the lobby then calls `attack_boss` (which uses `gameState.getLobbyByPlayerId(playerId)` → `playerToLobby.get(playerId)`), that OTHER player's alias may be stale if they were present when the lobby was created but their join happened before the server restart.

**The actual Phase 50 bug referenced (latent reconnect-staleness):** The issue is that `syncPlayerToLobby` is NOT called for ALL players when a lobby is synced — only for the reconnecting player. After reconnect, the lobby object in `gameState.lobbies` contains all players (from SessionManager), but `gameState.playerToLobby` only has aliases for players who explicitly triggered `syncPlayerToLobby`. Any player whose `join_lobby` predated the current server instance won't have an alias registered.

### The Fix

Register ALL players' aliases unconditionally when syncing any player to the lobby:

```typescript
syncPlayerToLobby(playerId: string, lobby: Lobby): void {
  // Store or replace lobby reference
  this.lobbies.set(lobby.id, lobby);
  // Register alias for the triggering player
  this.playerToLobby.set(playerId, lobby.id);
  // Register aliases for ALL other players in the lobby (covers reconnect-staleness)
  for (const player of lobby.players) {
    if (!this.playerToLobby.has(player.id)) {
      this.playerToLobby.set(player.id, lobby.id);
    }
  }
}
```

**Safety check — is unconditional registration safe?**

Yes. `playerToLobby` is purely a read-side index: `getLobbyByPlayerId` reads it, `joinLobby`/`removePlayer` write it. Over-registering (multiple calls for the same player) simply overwrites with the same lobby.id value — idempotent. There is no double-write risk because the lobby.id for a player never changes.

**Alias map consumer (reconnect path):** `gameState.getLobbyByPlayerId` (line 684) → used by: `gameState.attackBoss`, `gameState.submitScore`, `gameState.updateDiscussionVote`, `gameState.handlePlayerDisconnect`, `gameState.startRevive`, `gameState.cancelRevive`, `gameState.tickRevive`, and many battle methods. All of these fail silently (return null) if the alias is missing. The fix prevents silent failures for players joining before the lobbying player's reconnect.

---

## Settings Migration (MAINT-07 Step 3)

### Current State

The three settings handlers in `websocket.ts` (lines 1621–1653) call GameState methods:

| Handler | GameState method | Line |
|---------|-----------------|------|
| `update_timer_settings` | `gameState.updateTimerSettings(playerId, timerSettings)` | 1625 |
| `update_jira_settings` | `gameState.updateJiraSettings(playerId, jiraSettings)` | 1636 |
| `update_estimation_settings` | `gameState.updateEstimationSettings(playerId, estimationSettings)` | 1647 |

GameState methods (`gameState.ts:2006-2037`):
- `updateTimerSettings` (line 2006): validates `isHost`, sets `lobby.timerSettings`, returns lobby.
- `updateJiraSettings` (line 2017): validates `isHost`, sets `lobby.jiraSettings`, returns lobby.
- `updateEstimationSettings` (line 2028): validates `isHost`, sets `lobby.estimationSettings`, returns lobby.

After each call, `websocket.ts` calls `emitFineGrained(lobby.id, 'session:settings_updated', ...)` — the emit is **in the handler, not in the GameState method** (which just mutates state and returns). The emitFineGrained call is the correct pattern used by all other fine-grained events.

### SessionManager Target

SessionManager currently has no settings methods. Adding them is straightforward:

```typescript
// server/domains/SessionManager.ts
updateTimerSettings(playerId: string, timerSettings: TimerSettings): Lobby {
  const lobby = this.getPlayerLobby(playerId);
  if (!lobby) throw new PlayerNotFoundError(playerId);
  const player = lobby.players.find(p => p.id === playerId);
  if (!player?.isHost) throw new PlayerNotHostError(playerId);
  lobby.timerSettings = timerSettings;
  // Session:settings_updated is emitted by the websocket handler (not here)
  // to match the existing pattern for other settings events.
  return lobby;
}
// (repeat for jira, estimation)
```

### websocket.ts Migration

Replace `gameState.updateTimerSettings(...)` with `sessionManager.updateTimerSettings(...)` — no behavior change since the emit is already in the handler. The `session:settings_updated` client event payload is already defined in `shared/gameEvents.ts:433` and handled client-side in `eventHandlers.ts:247`. No client changes needed.

**Emit-timing consideration:** The emit remains in the websocket.ts handler (not moved into SessionManager), matching the existing pattern where all emitFineGrained calls live in websocket.ts handlers. This is consistent with Phase 42-02b design decisions.

---

## Revival Consolidation (MAINT-08 Step 1)

### Two Existing Watchdog Loops (Both Must Die)

**Watchdog 1 — GameState constructor** (`server/gameState.ts:63-66`):
```typescript
this.revivalWatchdog = setInterval(() => {
  this.processRevivalSessions();
}, 100); // Check every 100ms
```
This is guarded by `startWatchdogs` flag (Phase 48 seam). Runs only in production (singleton) and tests that set `startWatchdogs: true`.

**Watchdog 2 — websocket.ts legacy watchdog** (`server/websocket.ts:246-280`):
```typescript
const revivalWatchdogInterval = setInterval(() => {
  const result = gameState.processRevivalSessions();
  for (const revival of result) {
    // emit combat:player_revived
    eventBus.emit('combat:player_revived', { ... });
  }
  // emit throttled combat:revival_progress for in-flight sessions
}, 100);
```
This is cleaned up in `cleanup()` at line 1838. The progress emission logic here is the "bridge" that converts GameState revival completions to eventBus events.

### What CombatManager Already Owns

`CombatManager.startRevival` (line 1459) creates a `RevivalSession` with its own `setInterval(() => { this.tickRevival(sessionKey); }, 100)`. This interval:
- Calls `completeRevival` when elapsed >= `channelDurationMs` (3000ms) — emits `combat:player_revived` via eventBus
- Calls `cancelRevivalSession` on interruption — emits `combat:revival_cancelled`
- Emits `combat:revival_progress` throttled to 500ms buckets

**CombatManager's revival is fully self-contained and event-driven.** The websocket.ts watchdog is redundant once all revival traffic routes through CombatManager.

### Current Revival Flow (Broken Split)

```
revive_start ──► gameState.startRevive()    (websocket.ts:1557)
                    └─► GameState.revivalSessions Map
                    └─► eventBus.emit('combat:revival_started')  ✓

revive_cancel ──► gameState.cancelRevive()  (websocket.ts:1575)
                    └─► GameState.revivalSessions Map
                    └─► eventBus.emit('combat:revival_cancelled') ✓

revive_tick ──► gameState.tickRevive()      (websocket.ts:1594)
                    └─► updates session.lastTick (keep-alive)
                    └─► NO eventBus emit (watchdog handles completion)
```

### Target Revival Flow

```
revive_start ──► combatManager.startRevival(lobbyId, reviverId, targetId)
                    └─► CombatManager.revivalSessions Map
                    └─► eventBus.emit('combat:revival_started')  ✓
                    └─► self-managing 100ms setInterval

revive_cancel ──► combatManager.cancelRevival(reviverId, reason)
                    └─► clears interval + removes session
                    └─► eventBus.emit('combat:revival_cancelled') ✓

revive_tick ──► [NO-OP or DELETE] — CombatManager doesn't use external ticks
               The keep-alive mechanism is internal to CombatManager's interval
```

### Migration Notes

`CombatManager.startRevival` requires `lobbyId` (first param). The revive_start handler at `websocket.ts:1553` has `socket.data.playerId` but NOT `lobbyId`. Use `sessionManager.getPlayerLobby(playerId)?.id` — already done for the `combat:revival_started` eventBus emit at line 1561.

`CombatManager.startRevival` validates that the reviver is a **healer class**. The current `gameState.startRevive` has no class check. This is a behavioral improvement (restriction, not regression) — only healers should be able to revive. If there are non-healer revives in the wild, the CombatManager will throw a `RevivalNotAllowedError`.

`revive_tick` becomes a no-op in the CombatManager world because the interval is internal. The `revive_tick` socket event handler should be removed from `websocket.ts` (it was only needed for the GameState keep-alive pattern). Alternatively, keep the handler as a no-op for forward compatibility, but it adds noise.

**After migration:** Delete `gameState.startRevive`, `gameState.cancelRevive`, `gameState.tickRevive`, `gameState.processRevivalSessions`, `gameState.getActiveRevivalSessions`, and the `revivalWatchdog` field + constructor code. Remove the websocket.ts `revivalWatchdogInterval` and its `cleanup()` reference.

---

## host_transferred Event (MAINT-08 Step 2)

### Current State — Direct io.to() Call

`server/websocket.ts:287-309` (inside `sessionDisconnectSweeperInterval`):

```typescript
for (const transfer of hostTransfers) {
  io.to(transfer.lobbyId).emit('host_transferred', {
    oldHostId: transfer.oldHostId,
    newHostId: transfer.newHostId,
    newHostName: transfer.newHostName,
    reason: 'Host disconnected (grace period expired)',
  });
}
```

This is the only place in the codebase where `websocket.ts` directly calls `io.to().emit()` for a domain event rather than routing through the eventBus bridge. All other domain events go via `eventBus.emit` → `ClientEventEmitter` → `io.to().emit()`.

### Why This Matters

The disconnect sweeper has `io` in its closure, which means any test of the `processDisconnectedPlayers` path currently requires a real or mocked `io` object. After adding `session:host_transferred` to the eventBus, the sweeper only needs `sessionManager` — no `io` dependency.

### Required Changes

**1. Add `SessionHostTransferredPayload` to `server/events/eventTypes.ts`:**

```typescript
export interface SessionHostTransferredPayload {
  lobbyId: string;
  oldHostId: string;
  newHostId: string;
  newHostName: string;
}

// In EventMap:
'session:host_transferred': SessionHostTransferredPayload;
```

**2. Emit from `SessionManager.processDisconnectedPlayers` (`server/domains/SessionManager.ts:1018-1029`):**

After the deferred host transfer logic (where `hostTransfers.push(...)` currently happens at line 1018), emit the event before returning:

```typescript
this.eventBus.emit('session:host_transferred', {
  lobbyId: lobby.id,
  oldHostId,
  newHostId: newHost.id,
  newHostName: newHost.name,
});
```

This replaces the `hostTransfers` array return value — the sweeper no longer needs to iterate the return value for emitting.

**3. Bridge in `server/events/ClientEventEmitter.ts`:**

```typescript
this.eventBus.on('session:host_transferred', (payload) => {
  // Wire to existing 'host_transferred' client event (declared in ServerToClientEvents)
  this.emitToLobby(payload.lobbyId, 'host_transferred', {
    oldHostId: payload.oldHostId,
    newHostId: payload.newHostId,
    newHostName: payload.newHostName,
    reason: 'Host disconnected (grace period expired)',
  });
});
```

**4. Remove naked io.to().emit() from `websocket.ts:291-297`.**

The sweeper body becomes:
```typescript
try {
  sessionManager.processDisconnectedPlayers(); // events emitted internally
} catch (err) {
  socketLogger.error({ err }, 'sessionDisconnectSweeper failed');
}
```

### Client Side — No Change Needed

`GamePage.tsx:232` already listens on `socket.on('host_transferred', ...)`. The wire event name stays the same (`host_transferred`); only the server-side delivery path changes.

### Existing Legacy io.to() in websocket.handlers.ts

`server/websocket.handlers.ts:302` also emits `host_transferred` — but this is in the `handleDisconnect` function, for the **immediate disconnect path** (only reached if the reconnection setup fails, which is rare). This path emits when `hostTransfer` is returned by `sessionManager.handlePlayerDisconnect`. Since Phase 41-02 the `handlePlayerDisconnect` method always returns `hostTransfer: undefined` (host transfer is deferred to grace expiry), so this branch is effectively dead code. Leave it as-is in Phase 50 to avoid scope creep — it is a no-op in practice.

---

## Ordering and Reversibility

### Wave 1 — MAINT-07

| Task | Action | Point of No Return? | Precondition |
|------|--------|---------------------|--------------|
| 1.1 | Fix `syncPlayerToLobby` (add loop body) | No — additive only | None |
| 1.2 | Delete `GameState.joinLobby` | YES — write characterization test first | No live callers (confirmed) |
| 1.3 | Delete `GameState.updatePlayerTeam` | YES | No live callers (confirmed) |
| 1.4 | Delete `GameState.updatePlayerAvatar` | YES | No live callers (confirmed) |
| 1.5 | Migrate 2 test call sites from `gameState.createLobby` to `sessionManager.createLobby` | No — test change only | None |
| 1.6 | Delete `GameState.createLobby` | YES | Task 1.5 complete |
| 1.7 | Add settings methods to `SessionManager` | No — additive | None |
| 1.8 | Update 3 websocket.ts handlers to call `sessionManager.*` | Low risk | Task 1.7 complete |
| 1.9 | Delete `GameState.updateTimerSettings`, `updateJiraSettings`, `updateEstimationSettings` | YES | Task 1.8 complete + tests green |

**Characterization test requirement before deletions:** Write a test that calls the EXISTING method and captures its output. This test will fail after deletion — confirming the deletion happened — and should then be replaced by a test of the SessionManager equivalent.

### Wave 2 — MAINT-08

| Task | Action | Point of No Return? | Precondition |
|------|--------|---------------------|--------------|
| 2.1 | Add `session:host_transferred` to eventTypes.ts | No — additive | None |
| 2.2 | Bridge in ClientEventEmitter.ts | No — additive | Task 2.1 complete |
| 2.3 | Emit `session:host_transferred` from SessionManager | No — additive (sweeper still also runs old path) | Tasks 2.1, 2.2 complete |
| 2.4 | Delete io.to().emit() from sweeper in websocket.ts | YES | Tasks 2.1-2.3 complete + manual test |
| 2.5 | Update `revive_start` handler to use `combatManager.startRevival` | YES | CombatManager in scope for lobby's combat state |
| 2.6 | Update `revive_cancel` handler to use `combatManager.cancelRevival` | YES | Task 2.5 complete |
| 2.7 | Remove `revive_tick` handler (no-op in CombatManager world) | YES | Tasks 2.5-2.6 complete |
| 2.8 | Remove `revivalWatchdogInterval` from websocket.ts | YES | Tasks 2.5-2.7 complete |
| 2.9 | Remove `revivalWatchdog` from GameState constructor | YES — delete revivalWatchdog field too | Task 2.8 complete |
| 2.10 | Delete `gameState.startRevive`, `cancelRevive`, `tickRevive`, `processRevivalSessions`, `getActiveRevivalSessions` | YES | Task 2.9 complete |

**MAINT-07 and MAINT-08 are NOT parallel-safe** — both modify `server/gameState.ts` and `server/websocket.ts`. Execute Wave 1 first, get CI green, then execute Wave 2.

---

## Common Pitfalls

### Pitfall 1: removePlayer Cannot Be Deleted Before processDisconnectedPlayers
**What goes wrong:** `GameState.removePlayer` has one internal caller: `GameState.processDisconnectedPlayers` at line 193. If `removePlayer` is deleted before `processDisconnectedPlayers` and the `disconnectWatchdog`, the server crashes when a player's grace period expires.
**Why it happens:** The 30s disconnect watchdog in the GameState constructor is still running and calls `processDisconnectedPlayers` → `this.removePlayer`.
**How to avoid:** Delete `GameState.removePlayer` only as part of deleting the entire `processDisconnectedPlayers` + `disconnectWatchdog` block. These three are coupled. Phase 50 does NOT decommission the GameState disconnect watchdog — it only removes the revival watchdog. Therefore `GameState.removePlayer` is OUT OF SCOPE for Phase 50 deletion.

### Pitfall 2: Double Revival if Both Paths Are Active Simultaneously
**What goes wrong:** During the transition (MAINT-08 Wave 2), if `revive_start` is updated to call `combatManager.startRevival` but the `revivalWatchdogInterval` still polls `gameState.processRevivalSessions()`, the CombatManager revival will complete correctly while the GameState watchdog fires a spurious `combat:player_revived` for the stale GameState.revivalSessions Map (which is now empty because nothing calls `gameState.startRevive` anymore).
**Why it happens:** The GameState revival sessions Map is empty after the migration, so `processRevivalSessions()` returns an empty array — safe. The websocket.ts watchdog loop is a no-op on an empty array. No double-emit occurs.
**Conclusion:** Actually safe to remove in any order. Remove the watchdog before or after updating the handler — no double-emit risk.

### Pitfall 3: CombatManager Healer-Class Restriction
**What goes wrong:** `combatManager.startRevival` throws `RevivalNotAllowedError` for non-healer classes. `gameState.startRevive` has NO class check. Migrating the handler changes the behavior — non-healer revive attempts that previously succeeded silently will now throw.
**How to avoid:** The `revive_start` handler currently catches nothing — if `combatManager.startRevival` throws, the error propagates to the `socket.on('revive_start', ...)` handler and causes an unhandled error. Wrap in try/catch and emit `game_error` on `RevivalNotAllowedError`.
**Warning signs:** Watch for `RevivalNotAllowedError` in server logs after migration. Add a test asserting non-healer revive returns `false` (CombatManager returns false, not throws, when class validation is false — but it DOES throw when class is present and wrong).

### Pitfall 4: session:host_changed vs host_transferred Are Two Different Events
**What goes wrong:** `session:host_changed` (the existing eventBus internal event bridged to clients as the fine-grained `session:host_changed` wire event) and `host_transferred` (the legacy wire event that triggers `GamePage.tsx` toast) are separate. Adding `session:host_transferred` must bridge to `host_transferred`, NOT `session:host_changed`.
**Why it happens:** There are now two paths that notify about host change: (1) immediate changes via `session:host_changed` → `ClientEventEmitter` → `session:host_changed` wire event, (2) deferred grace-expiry changes via `host_transferred` wire event. After Phase 50, deferred changes flow through `session:host_transferred` → `ClientEventEmitter` → `host_transferred` wire event. The `GamePage.tsx` toast listens on `host_transferred`; `eventHandlers.ts:91` listens on `session:host_changed`. Do NOT conflate.

### Pitfall 5: Settings Emit Lives in websocket.ts, Not in SessionManager
**What goes wrong:** If settings are moved entirely into SessionManager (including the `emitFineGrained` call), the `session:settings_updated` event would fire from inside SessionManager, which currently has no reference to `ClientEventEmitter` or `emitFineGrained`. This would require adding a new dependency.
**How to avoid:** Keep `emitFineGrained` in the websocket.ts handler, exactly as all other Phase 42-02b row migrations did. SessionManager.updateTimerSettings only mutates `lobby.timerSettings` and returns the lobby — the handler emits.

### Pitfall 6: revive_tick Removal May Break Client-Side Retry Logic
**What goes wrong:** If the client sends `revive_tick` events expecting a server-side "keep-alive" acknowledgment, removing the handler would fail silently (the event has no reply). Currently the handler returns a boolean (`isValid`) but the socket event has no ack callback in the wire contract.
**How to avoid:** Check `shared/gameEvents.ts` `ClientToServerEvents` for `revive_tick` definition. Since it's defined with no return type (void), the client does not wait for an ack. Removing the handler is safe — unhandled socket events are silently dropped by Socket.IO.

---

## Code Examples

### syncPlayerToLobby — Before vs After
```typescript
// BEFORE: server/gameState.ts:694 (only maps triggering player)
syncPlayerToLobby(playerId: string, lobby: Lobby): void {
  if (!this.lobbies.has(lobby.id)) {
    this.lobbies.set(lobby.id, lobby);
  }
  this.playerToLobby.set(playerId, lobby.id);
}

// AFTER: register ALL players unconditionally
syncPlayerToLobby(playerId: string, lobby: Lobby): void {
  this.lobbies.set(lobby.id, lobby);  // always update reference
  this.playerToLobby.set(playerId, lobby.id);
  for (const player of lobby.players) {
    if (!this.playerToLobby.has(player.id)) {
      this.playerToLobby.set(player.id, lobby.id);
    }
  }
}
```

### revive_start Handler — Before vs After
```typescript
// BEFORE: server/websocket.ts:1553
on('revive_start', ({ targetId }: { targetId: string }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;
  const success = gameState.startRevive(playerId, targetId);
  if (success) {
    const lobby = gameState.getLobbyByPlayerId(playerId);
    if (lobby) {
      eventBus.emit('combat:revival_started', { lobbyId: lobby.id, reviverId: playerId, targetId, durationMs: 3000 });
    }
  }
});

// AFTER: delegate to combatManager; eventBus.emit('combat:revival_started') is emitted inside combatManager.startRevival
on('revive_start', ({ targetId }: { targetId: string }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;
  const lobby = sessionManager.getPlayerLobby(playerId);
  if (!lobby) return;
  try {
    const success = combatManager.startRevival(lobby.id, playerId, targetId);
    if (!success) {
      socket.emit('game_error', { message: 'Cannot start revival' });
    }
  } catch (err) {
    // RevivalNotAllowedError for non-healer classes
    socket.emit('game_error', { message: (err as Error).message });
  }
});
```

### sessionDisconnectSweeperInterval — Before vs After
```typescript
// BEFORE: server/websocket.ts:287
const sessionDisconnectSweeperInterval = setInterval(() => {
  try {
    const hostTransfers = sessionManager.processDisconnectedPlayers();
    for (const transfer of hostTransfers) {
      io.to(transfer.lobbyId).emit('host_transferred', { ... });
    }
  } catch (err) { ... }
}, 30000);

// AFTER: events emitted by SessionManager via eventBus → ClientEventEmitter bridge
const sessionDisconnectSweeperInterval = setInterval(() => {
  try {
    sessionManager.processDisconnectedPlayers(); // host_transferred fires via eventBus bridge
  } catch (err) { ... }
}, 30000);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| GameState.createLobby/joinLobby/removePlayer | SessionManager domain methods (Phase 41-45) | Old methods are dead; SessionManager is the authority |
| GameState revival watchdog + websocket.ts watchdog | CombatManager self-managing intervals per session (Phase 45-05B) | Two 100ms global polls → event-driven per-session intervals |
| Direct io.to().emit() for host_transferred in sweeper | Will be: eventBus → ClientEventEmitter bridge (Phase 50) | Consistent with all other domain events |
| gameState.updateTimerSettings/Jira/Estimation | Will be: SessionManager methods (Phase 50) | Settings owned by SessionManager |

---

## Open Questions (RESOLVED)

**Q1: Is GameState.removePlayer in scope for Phase 50 deletion?**
Recommendation: NO. It cannot be deleted independently because it is called from `GameState.processDisconnectedPlayers` (the 30s watchdog is still needed until a full GameState decommission phase). Mark as OUT OF SCOPE; document the dependency chain.

**Q2: Does the `revive_tick` handler need to stay for client compatibility?**
Recommendation: Remove it. The socket event has no ack contract (`void` return in `ClientToServerEvents`). If the client sends it after the handler is removed, Socket.IO silently drops it. The CombatManager revival interval is self-managing and does not need external ticks.

**Q3: Should settings methods emit session:settings_updated from inside SessionManager?**
Recommendation: NO. Keep emitFineGrained in the websocket.ts handler, matching the Phase 42-02b pattern. SessionManager does not hold a reference to ClientEventEmitter and adding that dependency would expand scope. The event is a wire-layer concern, not a domain concern.

**Q4: Does `CombatManager.startRevival` need the lobby object or just lobbyId?**
Resolved: CombatManager.startRevival takes `(lobbyId, reviverId, targetId)` — lobbyId only. The handler gets it via `sessionManager.getPlayerLobby(playerId)?.id`.

**Q5: Are MAINT-07 and MAINT-08 safe to execute in parallel (different branches)?**
Recommendation: NO. Both modify `server/gameState.ts` and `server/websocket.ts`. Execute sequentially: MAINT-07 Wave 1 → green CI → MAINT-08 Wave 2.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run server/gameState.test.ts server/domains/SessionManager.test.ts server/domains/CombatManager.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| MAINT-07 | syncPlayerToLobby registers all players' aliases unconditionally | unit | `npx vitest run server/gameState.test.ts` |
| MAINT-07 | Reconnecting player can reach battle functions for lobby-mates | integration | New: `reconnect-alias-coverage.test.ts` |
| MAINT-07 | Settings methods on SessionManager update lobby and return it | unit | `npx vitest run server/domains/SessionManager.test.ts` |
| MAINT-07 | Deleted methods are gone from GameStateManager public API | type-check | `npm run check` |
| MAINT-08 | revive_start routes to combatManager.startRevival | unit | `npx vitest run server/domains/CombatManager.test.ts` |
| MAINT-08 | combat:player_revived fires exactly once per revival (no double-emit) | unit | `npx vitest run server/domains/CombatManager.test.ts` |
| MAINT-08 | host_transferred wire event fires after grace period expiry | integration | `npx vitest run server/domains/SessionManager.test.ts` |
| MAINT-08 | revivalWatchdog is absent from GameState constructor (no timer leak) | unit | `npx vitest run server/gameState.test.ts` (startWatchdogs:false) |

### Characterization Tests (Pre-Deletion Gate)

Before deleting any of the 5 GameState methods, write a characterization test that:
1. Calls the existing method and records its output shape.
2. Calls the SessionManager equivalent with identical inputs.
3. Asserts identical output shape.
4. This test is then the replacement regression test for the SessionManager method.

Example pattern (using Phase 48's `GameStateManager` export):
```typescript
// server/gameState-characterization.test.ts (NEW — delete after Phase 50 lands)
import { GameStateManager } from './gameState';
import { SessionManager } from './domains/SessionManager';

it('createLobby: SessionManager output shape matches GameState output shape', () => {
  const gs = new GameStateManager(undefined, { startWatchdogs: false });
  const sm = new SessionManager({ eventBus: new ScopedEventBus() });
  
  const gsLobby = gs.createLobby('Host', 'Test', {});
  const smLobby = sm.createLobby('Host', 'Test', {});
  
  // Same structural shape (ignore id/timestamp differences)
  expect(Object.keys(gsLobby)).toEqual(expect.arrayContaining(Object.keys(smLobby)));
  expect(gsLobby.players).toHaveLength(1);
  expect(smLobby.players).toHaveLength(1);
});
```

### Regression Tests Required — Phase 41 Invariants

The following Phase 41 invariants must remain green throughout Phase 50:

1. `reconnect_with_token` path: `sessionManager.attemptPlayerReconnect` returns `{ result: 'success', lobbySync: { lobby, yourPlayer, reconnectToken } }` — covered by `server/domains/SessionManager.test.ts:582-704`
2. `host transfer deferred`: host disconnects, grace period expires, new host is promoted — covered by `SessionManager.test.ts:654-704`
3. `autoAdvance preserved through reconnect`: `websocket.autoAdvance.reconnect.test.ts` — will need updating (task 1.5) but must remain green

### Sampling Rate
- **Per task commit:** `npx vitest run server/gameState.test.ts server/domains/SessionManager.test.ts server/domains/CombatManager.test.ts server/websocket.handlers.test.ts`
- **Per wave merge:** `npm test` (full suite — 919 tests as of research date)
- **Phase gate:** Full suite green + `npm run check` clean before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/gameState-characterization.test.ts` — pre-deletion shape comparison (new, delete after phase lands)
- [ ] `server/reconnect-alias-coverage.test.ts` — OR add test to `server/gameState.test.ts` asserting syncPlayerToLobby registers all lobby members' aliases
- [ ] `server/domains/SessionManager.test.ts` — new `updateTimerSettings`, `updateJiraSettings`, `updateEstimationSettings` tests

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | Yes | Reconnect token validation remains in SessionManager (no change) |
| V4 Access Control | Yes | Host-only settings changes validated in SessionManager.updateTimerSettings etc. |
| V5 Input Validation | No | No new input paths |
| V6 Cryptography | No | Reconnect token HMAC unchanged |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-host settings update | Tampering | `player.isHost` check in SessionManager settings methods |
| Non-healer forced revive | Tampering | `RevivalNotAllowedError` in CombatManager.startRevival |
| Double host promotion | Elevation | SessionManager.processDisconnectedPlayers: checks `lobby.hostId === playerId` before transferring |

---

## Environment Availability

Step 2.6: SKIPPED — this is a pure server-side TypeScript refactor; no external runtime dependencies beyond the existing Node.js server stack.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GameState.selectAvatar` (lines 729-740) is NOT called from production code and is therefore not in scope (only `updatePlayerAvatar` is) | Call-Site Audit | If `selectAvatar` has live callers not found in grep, the audit is incomplete |
| A2 | The `revive_tick` socket event has no ack contract in `ClientToServerEvents` (void return) | Common Pitfalls | If client expects a response, removing the handler breaks revival UI |

---

## Sources

### Primary (HIGH confidence)
- `server/gameState.ts` — read directly (lines 1-2127, all methods mapped with line numbers)
- `server/websocket.ts` — read directly (lines 1-1846, all intervals and handler call sites mapped)
- `server/websocket.handlers.ts` — read directly (all syncPlayerToLobby call sites)
- `server/domains/SessionManager.ts` — read directly (all lifecycle methods with signatures)
- `server/domains/CombatManager.ts` — read directly (revival methods lines 1459-1683)
- `server/events/ClientEventEmitter.ts` — read directly (bridge subscriptions lines 78-300)
- `server/events/eventTypes.ts` — read directly (SessionHostChangedPayload at line 82)
- `shared/gameEvents.ts` — read directly (wire event declarations)
- `.planning/STATE.md` — read directly (Phase 41, 48, 49 invariants and decisions)
- `.planning/phases/49-state-source-of-truth-consolidation/49-02-SUMMARY.md` — Phase 49 P02 outcome confirming applyBasicDamageToBoss seam

### Secondary (MEDIUM confidence)
- `.planning/phases/48-testability-seams/48-RESEARCH.md` — Phase 48 seam documentation
- `.planning/phases/41-reconnection-state-bugfix/` — Phase 41 reconnection invariants (referenced via STATE.md)
- `server/websocket.autoAdvance.reconnect.test.ts` — test call site for `gameState.createLobby` (live caller evidence)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; pure TypeScript refactor
- Architecture (call-site audit): HIGH — all call sites found via grep on live codebase; 919 passing tests confirm current behavior
- Revival migration: HIGH — CombatManager already owns the full revival lifecycle; websocket.ts call sites are clear
- host_transferred event: HIGH — pattern is identical to 9 other eventBus→ClientEventEmitter bridges already in place
- Pitfalls: HIGH — derived from reading actual code paths

**Research date:** 2026-06-23
**Valid until:** 2026-07-21 (30 days — stable TypeScript codebase)
