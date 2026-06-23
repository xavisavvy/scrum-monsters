# Phase 50: Finish the GameState → Domain-Manager Migration — Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 7 modified files
**Analogs found:** 7 / 7

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `server/gameState.ts` | service | CRUD (mutation + deletion) | Self (existing SessionManager pattern) | exact |
| `server/websocket.ts` | middleware/route | request-response + event-driven | `server/websocket.ts` existing handlers | exact |
| `server/domains/SessionManager.ts` | service | CRUD | `server/domains/SessionManager.ts` `updatePlayerTeam`/`changeOwnTeam` (lines 566-604) | exact |
| `server/events/eventTypes.ts` | config | event-driven | `server/events/eventTypes.ts` `SessionHostChangedPayload` (lines 82-86) | exact |
| `server/events/ClientEventEmitter.ts` | middleware | event-driven | `server/events/ClientEventEmitter.ts` `session:host_changed` bridge (lines 109-113) | exact |
| `server/websocket.autoAdvance.reconnect.test.ts` | test | request-response | `server/domains/SessionManager.test.ts` `createLobby` block (lines 21-54) | role-match |
| `server/domains/SessionManager.test.ts` | test | CRUD | `server/domains/SessionManager.test.ts` `assignTeam`/`changeOwnTeam` blocks (lines 979-1043) | exact |

---

## Pattern Assignments

### `server/gameState.ts` — MAINT-07: Fix syncPlayerToLobby + delete dead methods

**Role:** service, CRUD mutation

**Analog for the alias-loop fix:** `server/domains/SessionManager.ts` player-iteration patterns (e.g., `processDisconnectedPlayers`, lines 999-1053 — iterates `lobby.players` with a for-of loop)

**Current implementation to replace** (lines 694-701):
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

**Target implementation** (additive only — no behavior removed):
```typescript
syncPlayerToLobby(playerId: string, lobby: Lobby): void {
  // Always update reference (not conditional — covers reconnect-staleness)
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

**Lobby player iteration analog** (from `SessionManager.ts:999-1016`):
```typescript
for (const [playerId, disconnectedPlayer] of this.disconnectedPlayers.entries()) {
  // ... filter logic ...
  const connectedPlayers = lobby.players.filter(
    (p) => p.id !== playerId && !this.disconnectedPlayers.has(p.id)
  );
  if (connectedPlayers.length > 0) {
    const newHost = connectedPlayers[0];
```

**Methods safe to delete immediately** (no call sites — confirmed by RESEARCH.md Call-Site Audit):
- `GameStateManager.joinLobby` (lines 574-621)
- `GameStateManager.updatePlayerTeam` (lines 703-714)
- `GameStateManager.updatePlayerAvatar` (lines 716-727)

**Methods requiring test migration before deletion:**
- `GameStateManager.createLobby` (lines 482-572) — blocked on `websocket.autoAdvance.reconnect.test.ts:18` and `gameState.test.ts:197`

**DEFERRED — cannot delete independently:**
- `GameStateManager.removePlayer` (lines 623-661) — has live internal caller at line 193 (`processDisconnectedPlayers`). Out of scope for Phase 50.

**Settings methods to delete after SessionManager equivalents added** (MAINT-07 Step 3):
- `updateTimerSettings` (lines 2006-2015)
- `updateJiraSettings` (lines 2017-2026)
- `updateEstimationSettings` (lines 2028-2037)

**Current GameState settings method shape** (lines 2006-2015 — all three are structurally identical):
```typescript
updateTimerSettings(playerId: string, timerSettings: TimerSettings): Lobby | null {
  const lobby = this.getLobbyByPlayerId(playerId);
  if (!lobby) return null;

  const requester = lobby.players.find(p => p.id === playerId);
  if (!requester?.isHost) return null;

  lobby.timerSettings = timerSettings;
  return lobby;
}
```

**MAINT-08: revival watchdog deletion** — `gameState.ts` constructor lines 63-66:
```typescript
// THIS BLOCK TO DELETE (after websocket.ts revivalWatchdogInterval is removed):
this.revivalWatchdog = setInterval(() => {
  this.processRevivalSessions();
}, 100); // Check every 100ms
```
The `startWatchdogs` guard (line 61) keeps the deletion safe: pass `{ startWatchdogs: false }` in tests. After deletion, also remove the `revivalWatchdog` field declaration and the methods: `startRevive`, `cancelRevive`, `tickRevive`, `processRevivalSessions`, `getActiveRevivalSessions`.

---

### `server/domains/SessionManager.ts` — MAINT-07: Add settings methods + MAINT-08: emit session:host_transferred

**Role:** service, CRUD

**Analog for settings methods:** Existing `updatePlayerTeam` private method (lines 566-597) — same pattern: get lobby, find player, validate isHost, mutate field, return lobby.

**Settings method target pattern** (modeled on `updatePlayerTeam`, lines 566-597):
```typescript
/**
 * Updates a player's team and refreshes team assignments
 */
private updatePlayerTeam(playerId: string, team: TeamType): Lobby {
  const lobby = this.getPlayerLobby(playerId);
  if (!lobby) {
    throw new PlayerNotFoundError(playerId);
  }

  const player = lobby.players.find((p) => p.id === playerId);
  if (!player) {
    throw new PlayerNotFoundError(playerId);
  }

  // Save old team for event
  const oldTeam = player.team;

  // Update player team
  player.team = team;

  // Update team assignments
  this.updateTeamAssignments(lobby);

  // Emit team changed event
  if (oldTeam !== team) {
    this.eventBus.emit('session:team_changed', {
      lobbyId: lobby.id,
      playerId,
      oldTeam,
      newTeam: team,
    });
  }

  return lobby;
}
```

**Target signatures for the three new PUBLIC settings methods** (note: return `Lobby`, throw errors rather than returning null, NO eventBus emit — emit stays in websocket.ts handler per Pitfall 5):
```typescript
updateTimerSettings(playerId: string, timerSettings: TimerSettings): Lobby {
  const lobby = this.getPlayerLobby(playerId);
  if (!lobby) throw new PlayerNotFoundError(playerId);
  const player = lobby.players.find(p => p.id === playerId);
  if (!player?.isHost) throw new PlayerNotHostError(playerId);
  lobby.timerSettings = timerSettings;
  return lobby;
}

updateJiraSettings(playerId: string, jiraSettings: JiraSettings): Lobby {
  const lobby = this.getPlayerLobby(playerId);
  if (!lobby) throw new PlayerNotFoundError(playerId);
  const player = lobby.players.find(p => p.id === playerId);
  if (!player?.isHost) throw new PlayerNotHostError(playerId);
  lobby.jiraSettings = jiraSettings;
  return lobby;
}

updateEstimationSettings(playerId: string, estimationSettings: EstimationSettings): Lobby {
  const lobby = this.getPlayerLobby(playerId);
  if (!lobby) throw new PlayerNotFoundError(playerId);
  const player = lobby.players.find(p => p.id === playerId);
  if (!player?.isHost) throw new PlayerNotHostError(playerId);
  lobby.estimationSettings = estimationSettings;
  return lobby;
}
```

**MAINT-08: emit session:host_transferred inside processDisconnectedPlayers** — analog is the existing `session:host_changed` emit at lines 1025-1029:
```typescript
this.eventBus.emit('session:host_changed', {
  lobbyId: lobby.id,
  oldHostId,
  newHostId: newHost.id,
});
```

**Target insertion point** (after `hostTransfers.push(...)` at line 1018, before `this.removePlayer(playerId)` at line 1042):
```typescript
this.eventBus.emit('session:host_transferred', {
  lobbyId: lobby.id,
  oldHostId,
  newHostId: newHost.id,
  newHostName: newHost.name,
});
```

After this is added, the `hostTransfers.push(...)` call and the `hostTransfers` array return value become dead — the array return can be changed to `void` once the websocket.ts sweeper no longer reads it (Task 2.4).

**getPlayerLobby signature** (lines 438-444 — used in all new methods):
```typescript
getPlayerLobby(playerId: string): Lobby | null {
  const lobbyId = this.playerToLobby.get(playerId);
  if (!lobbyId) {
    return null;
  }
```

---

### `server/websocket.ts` — MAINT-07: redirect settings calls + MAINT-08: remove watchdogs + fix sweeper

**Role:** middleware/route, request-response + event-driven

**Current settings handlers to redirect** (lines 1621-1654):
```typescript
// Timer settings update
on('update_timer_settings', ({ timerSettings }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  const lobby = gameState.updateTimerSettings(playerId, timerSettings);
  if (lobby) {
    // Phase 42-02b row #19: lobby_updated -> session:settings_updated.
    emitFineGrained(lobby.id, 'session:settings_updated', { timerSettings: lobby.timerSettings });
  }
});
```

**Target pattern** — replace `gameState.updateTimerSettings(...)` with `sessionManager.updateTimerSettings(...)`. The `emitFineGrained` call stays. The try/catch wrapper from the RESEARCH.md SessionManager pattern applies:
```typescript
on('update_timer_settings', ({ timerSettings }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  try {
    const lobby = sessionManager.updateTimerSettings(playerId, timerSettings);
    emitFineGrained(lobby.id, 'session:settings_updated', { timerSettings: lobby.timerSettings });
  } catch (err) {
    socket.emit('game_error', { message: (err as Error).message });
  }
});
```

**MAINT-08: revivalWatchdogInterval to delete** (lines 246-280):
```typescript
// DELETE THIS ENTIRE BLOCK:
const revivalWatchdogInterval = setInterval(() => {
  const result = gameState.processRevivalSessions();
  for (const revival of result) {
    // ... emit combat:player_revived ...
  }
  // ... emit throttled combat:revival_progress ...
}, 100);
```
Also remove the `revivalWatchdogInterval` reference in `cleanup()` at line 1838.

**MAINT-08: revive_start handler replacement** (lines 1553-1569):

Current:
```typescript
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
```

Target (eventBus.emit is now inside combatManager.startRevival — no duplicate emit needed):
```typescript
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

**MAINT-08: revive_cancel handler replacement** (lines 1571-1587):

Current:
```typescript
on('revive_cancel', ({ targetId }: { targetId: string }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  const success = gameState.cancelRevive(playerId, targetId);
  if (success) {
    const lobby = gameState.getLobbyByPlayerId(playerId);
    if (lobby) {
      eventBus.emit('combat:revival_cancelled', { lobbyId: lobby.id, reviverId: playerId, targetId, reason: 'cancelled_by_reviver' });
    }
  }
});
```

Target (cancelRevival emits combat:revival_cancelled internally — no eventBus.emit needed):
```typescript
on('revive_cancel', ({ targetId }: { targetId: string }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;
  combatManager.cancelRevival(playerId, 'cancelled_by_reviver');
});
```

**MAINT-08: revive_tick handler to delete** (lines 1589-1607) — remove entirely. CombatManager's self-managing interval replaces the keep-alive pattern.

**MAINT-08: sessionDisconnectSweeperInterval replacement** (lines 287-309):

Current (naked io.to() call — the only such direct call in websocket.ts):
```typescript
const sessionDisconnectSweeperInterval = setInterval(() => {
  try {
    const hostTransfers = sessionManager.processDisconnectedPlayers();
    for (const transfer of hostTransfers) {
      io.to(transfer.lobbyId).emit('host_transferred', {
        oldHostId: transfer.oldHostId,
        newHostId: transfer.newHostId,
        newHostName: transfer.newHostName,
        reason: 'Host disconnected (grace period expired)',
      });
      socketLogger.info({ ... }, 'Deferred host transfer broadcast (Phase 41-02)');
    }
  } catch (err) {
    socketLogger.error({ err }, 'sessionDisconnectSweeper failed');
  }
}, 30000);
```

Target (events now emitted via eventBus → ClientEventEmitter bridge):
```typescript
const sessionDisconnectSweeperInterval = setInterval(() => {
  try {
    sessionManager.processDisconnectedPlayers(); // host_transferred fires via eventBus bridge
  } catch (err) {
    socketLogger.error({ err }, 'sessionDisconnectSweeper failed');
  }
}, 30000);
```

---

### `server/events/eventTypes.ts` — MAINT-08: Add session:host_transferred

**Role:** config, event-driven

**Analog:** `SessionHostChangedPayload` (lines 82-86) + `DomainEventMap` entry (line 514):
```typescript
/** Emitted when host transfers to another player */
export interface SessionHostChangedPayload {
  lobbyId: string;
  oldHostId: string;
  newHostId: string;
}

// In DomainEventMap:
'session:host_changed': SessionHostChangedPayload;
```

**New payload to add** (after `SessionHostChangedPayload`, ~line 87):
```typescript
/** Emitted when deferred host transfer completes (grace period expiry path) */
export interface SessionHostTransferredPayload {
  lobbyId: string;
  oldHostId: string;
  newHostId: string;
  newHostName: string;
}
```

**New DomainEventMap entry to add** (after `'session:host_changed'` on line 514):
```typescript
'session:host_transferred': SessionHostTransferredPayload;
```

Note the distinction from Pitfall 4 in RESEARCH.md: `session:host_changed` (immediate path → wire event `session:host_changed`) vs `session:host_transferred` (deferred grace-expiry path → wire event `host_transferred`). These are separate.

---

### `server/events/ClientEventEmitter.ts` — MAINT-08: Add session:host_transferred bridge

**Role:** middleware, event-driven

**Analog:** Any of the 9 existing session event bridges in `setupInternalEventListeners()`. The closest structural match is `session:host_changed` (lines 109-113):
```typescript
this.eventBus.on('session:host_changed', (payload) => {
  this.emitToLobby(payload.lobbyId, 'session:host_changed', {
    oldHostId: payload.oldHostId,
    newHostId: payload.newHostId,
  });
});
```

**Target bridge to add** (in the Session Events section, after the `session:host_changed` block):
```typescript
this.eventBus.on('session:host_transferred', (payload) => {
  // Wire to legacy 'host_transferred' event (GamePage.tsx:232 listens here).
  // Different wire name than 'session:host_changed' — see Pitfall 4.
  this.emitToLobby(payload.lobbyId, 'host_transferred', {
    oldHostId: payload.oldHostId,
    newHostId: payload.newHostId,
    newHostName: payload.newHostName,
    reason: 'Host disconnected (grace period expired)',
  });
});
```

Note: `emitToLobby` is private — used from within `setupInternalEventListeners`. The wire event name (`'host_transferred'`) differs from the internal bus name (`'session:host_transferred'`). This matches the existing pattern: `'combat:boss_damaged'` bus event → `'combat:boss_damaged'` wire, but `'stats:session_complete'` bus event → `'stats:session_summary'` wire (line 560).

---

### `server/websocket.autoAdvance.reconnect.test.ts` — MAINT-07: Migrate createLobby call site

**Role:** test, request-response

**Current call site** (lines 17-22):
```typescript
function setupHostWithAutoAdvance(autoAdvance: boolean): { lobbyId: string; hostId: string } {
  const lobby = gameState.createLobby('TestHost', 'Reconnect Test Lobby', {
    estimationSettings: { scaleType: 'fibonacci', autoAdvance },
  });
  return { lobbyId: lobby.id, hostId: lobby.hostId };
}
```

**Analog for migration target:** `SessionManager.test.ts` lines 1-19 (setup pattern) + lines 22-36 (createLobby test with options):
```typescript
import { SessionManager } from './SessionManager';
import { ScopedEventBus } from '../events';

describe('SessionManager - Lobby Lifecycle', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
  });

  // createLobby with options:
  const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
```

**Target migration** — the test must switch from the production singleton to constructed instances, and add `gameState.syncPlayerToLobby` to register the alias (so `getLobbyByPlayerId` still works for the reconnect assertion):
```typescript
import { describe, it, expect } from 'vitest';
import { GameStateManager } from './gameState';
import { SessionManager } from './domains/SessionManager';
import { ScopedEventBus } from './events';

describe('autoAdvance reconnect round-trip (Phase 41 regression)', () => {
  function setupHostWithAutoAdvance(autoAdvance: boolean) {
    const eventBus = new ScopedEventBus();
    const sessionManager = new SessionManager({ eventBus });
    const gameStateMgr = new GameStateManager(undefined, { startWatchdogs: false });

    const lobby = sessionManager.createLobby('TestHost', 'Reconnect Test Lobby', {
      estimationSettings: { scaleType: 'fibonacci', autoAdvance },
    });
    // Sync alias so gameStateMgr.getLobbyByPlayerId works (production pattern)
    gameStateMgr.syncPlayerToLobby(lobby.hostId, lobby);

    return { lobbyId: lobby.id, hostId: lobby.hostId, sessionManager, gameStateMgr };
  }
  // ... remainder: replace gameState.* with sessionManager.* / gameStateMgr.*
});
```

The reconnect path (`handlePlayerDisconnect`, `attemptPlayerReconnect`) is now on `sessionManager` — calls after migration use `sessionManager.handlePlayerDisconnect(hostId)` and `sessionManager.attemptPlayerReconnect(token)`.

---

### `server/domains/SessionManager.test.ts` — MAINT-07: Add settings delegation tests

**Role:** test, CRUD

**Analog:** `changeOwnTeam` and `assignTeam` test blocks (lines 979-1043) — same structure: create lobby, call method, assert mutation on returned lobby.

**`changeOwnTeam` test pattern** (lines 979-990):
```typescript
describe('changeOwnTeam', () => {
  it('should work same as updatePlayerTeam', () => {
    const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
    const hostId = lobby.players[0].id;

    const updatedLobby = (sessionManager as any).changeOwnTeam(hostId, 'qa');

    const player = updatedLobby.players.find((p: any) => p.id === hostId);
    expect(player.team).toBe('qa');
    expect(updatedLobby.teams.qa).toHaveLength(1);
  });
});
```

**`assignTeam` host-guard pattern** (lines 993-1018 — exact template for non-host rejection):
```typescript
describe('assignTeam', () => {
  it('should require host privileges', () => {
    const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
    const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');
    const { player: player3 } = sessionManager.joinLobby(lobby.id, 'Player 3');

    expect(() => {
      (sessionManager as any).assignTeam(player2.id, player3.id, 'qa');
    }).toThrow(PlayerNotHostError);
  });
```

**Target tests to add** (three `describe` blocks mirroring `changeOwnTeam` + `assignTeam` patterns):
```typescript
describe('updateTimerSettings', () => {
  it('updates timerSettings on the lobby and returns it', () => {
    const lobby = sessionManager.createLobby('Host', 'Test');
    const hostId = lobby.players[0].id;
    const settings = { enabled: true, durationMinutes: 5 };

    const updated = sessionManager.updateTimerSettings(hostId, settings);

    expect(updated.timerSettings).toEqual(settings);
  });

  it('throws PlayerNotHostError for non-host', () => {
    const lobby = sessionManager.createLobby('Host', 'Test');
    const { player: p2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

    expect(() => sessionManager.updateTimerSettings(p2.id, { enabled: true, durationMinutes: 3 }))
      .toThrow(PlayerNotHostError);
  });
});
// (repeat pattern for updateJiraSettings, updateEstimationSettings)
```

---

## Shared Patterns

### Error Class Imports
**Source:** `server/domains/SessionManager.ts` lines 30-34
**Apply to:** New `SessionManager` settings methods, `websocket.ts` settings handlers (catch block)
```typescript
import {
  SessionError,
  LobbyNotFoundError,
  PlayerNotFoundError,
  PlayerNotHostError,
} from '../errors/SessionErrors';
```

### eventBus.emit Pattern
**Source:** `server/domains/SessionManager.ts` lines 499-503 (`session:host_changed` emit)
**Apply to:** New `session:host_transferred` emit in `processDisconnectedPlayers`
```typescript
this.eventBus.emit('session:host_changed', {
  lobbyId: lobby.id,
  oldHostId,
  newHostId: newHost.id,
});
```

### ClientEventEmitter bridge pattern (setupInternalEventListeners)
**Source:** `server/events/ClientEventEmitter.ts` lines 109-113
**Apply to:** New `session:host_transferred` bridge
```typescript
this.eventBus.on('session:host_changed', (payload) => {
  this.emitToLobby(payload.lobbyId, 'session:host_changed', {
    oldHostId: payload.oldHostId,
    newHostId: payload.newHostId,
  });
});
```

### CombatManager self-managing revival lifecycle
**Source:** `server/domains/CombatManager.ts` lines 1459-1535
**Apply to:** MAINT-08 — confirms websocket.ts no longer needs to call `eventBus.emit('combat:revival_started')` after delegating to `combatManager.startRevival`. The internal `setInterval` on line 1519 and the `this.eventBus.emit('combat:revival_started', ...)` on line 1528 are already there.
```typescript
startRevival(lobbyId: string, reviverId: string, targetId: string): boolean {
  // ... validation ...
  const session: RevivalSession = {
    reviverId,
    targetId,
    lobbyId,
    startedAt: Date.now(),
    channelDurationMs: this.REVIVAL_CHANNEL_DURATION_MS,
    intervalHandle: setInterval(() => {
      this.tickRevival(sessionKey);
    }, 100) as NodeJS.Timeout,
    lastProgressBucket: -1,
  };
  this.revivalSessions.set(sessionKey, session);
  this.eventBus.emit('combat:revival_started', { lobbyId, reviverId, targetId, durationMs: this.REVIVAL_CHANNEL_DURATION_MS });
  return true;
}
```

### cancelRevival public entry point
**Source:** `server/domains/CombatManager.ts` — search for `cancelRevival`:
```typescript
// Called from websocket.ts revive_cancel handler target:
combatManager.cancelRevival(playerId, 'cancelled_by_reviver');
```
Verify the public method signature matches `(reviverId: string, reason: string)` before writing the handler.

### Test setup for CombatManager (Phase 48 seam)
**Source:** `server/domains/CombatManager.test.ts` lines 18-39
```typescript
beforeEach(() => {
  eventBus = new ScopedEventBus();
  getPlayerTeam = vi.fn((lobbyId, playerId) => { ... });
  getPlayerClass = vi.fn((lobbyId, playerId) => { ... });
  combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });
});
```

### Test setup for GameStateManager (Phase 48 seam)
**Source:** `server/gameState.test.ts` lines 193-197
```typescript
const gs = new GameStateManager(undefined, { startWatchdogs: false });
const lobby = gs.createLobby('Host', 'Test Lobby');
```
The `startWatchdogs: false` option prevents timer leaks in tests.

### makeMockSocket helper
**Source:** `server/test/makeMockSocket.ts` lines 19-39
```typescript
export function makeMockSocket() {
  const handlers = new Map<string, (data: unknown) => void>();
  const emitted: Array<{ event: string; data: unknown }> = [];
  const joinedRooms: string[] = [];
  const socket = {
    data: {} as Record<string, unknown>,
    on: vi.fn((event, handler) => { handlers.set(event, handler); }),
    emit: vi.fn((event, data) => { emitted.push({ event, data }); }),
    join: vi.fn((room) => { joinedRooms.push(room); }),
    // ...
  };
  return { socket, handlers, emitted, joinedRooms };
}
```

---

## Deletion Safety Summary

| Method | Location | Phase 50 Safe? | Condition |
|--------|----------|----------------|-----------|
| `GameStateManager.syncPlayerToLobby` | `gameState.ts:694` | FIX (not delete) | Add alias loop |
| `GameStateManager.createLobby` | `gameState.ts:482` | YES | After migrating 2 test call sites |
| `GameStateManager.joinLobby` | `gameState.ts:574` | YES — immediately | No live callers |
| `GameStateManager.removePlayer` | `gameState.ts:623` | **NO — OUT OF SCOPE** | Internal caller at line 193; disconnectWatchdog still live |
| `GameStateManager.updatePlayerTeam` | `gameState.ts:703` | YES — immediately | No live callers |
| `GameStateManager.updatePlayerAvatar` | `gameState.ts:716` | YES — immediately | No live callers |
| `GameStateManager.updateTimerSettings` | `gameState.ts:2006` | YES | After SM methods added + handlers redirected |
| `GameStateManager.updateJiraSettings` | `gameState.ts:2017` | YES | After SM methods added + handlers redirected |
| `GameStateManager.updateEstimationSettings` | `gameState.ts:2028` | YES | After SM methods added + handlers redirected |
| `GameStateManager.startRevive/cancelRevive/tickRevive` | `gameState.ts` | YES | After websocket handlers redirected to combatManager |
| `GameStateManager.processRevivalSessions/getActiveRevivalSessions` | `gameState.ts` | YES | After revivalWatchdogInterval deleted |
| `gameState.revivalWatchdog` ctor | `gameState.ts:63-66` | YES | After websocket.ts revivalWatchdogInterval deleted |
| `revivalWatchdogInterval` | `websocket.ts:246-280` | YES | After revive_start/cancel/tick handlers redirected |
| `io.to().emit('host_transferred')` sweeper | `websocket.ts:291-297` | YES | After ClientEventEmitter bridge added |

---

## No Analog Found

None. All modified files have direct structural analogs within the existing codebase.

---

## Metadata

**Analog search scope:** `server/`, `server/domains/`, `server/events/`, `server/test/`
**Files scanned:** 12 source files read directly
**Pattern extraction date:** 2026-06-23
