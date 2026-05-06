# Phase 41: Reconnection State Bugfix - Research

**Researched:** 2026-05-06
**Domain:** Client-side persistence + server-side reconnect/host-transfer (Socket.IO + Zustand + in-memory SessionManager)
**Confidence:** HIGH (read-only audit of all relevant files; no source modified)

## Summary

The reconnection bug has two independent root causes that compound when a dev-server restart wipes server-side `lobbies`/`disconnectedPlayers`/`reconnectTokens` Maps while the client retains stale localStorage:

1. **Client never validates that the stored `reconnectToken` matches the current route's `lobbyId` before sending it.** `useWebSocket.reconnectToLobby()` blindly emits whatever token is in localStorage. The server decodes the token and trusts the lobbyId inside it — so a token for lobby `36I0RL` on a tab navigated to `/game/MT1Q4L` causes the client to attempt rejoin into the *wrong* lobby. When the server says `lobby_closed` (because the in-memory lobby is gone post-restart), `useWebSocket` clears the token but `LastLobbyStorage` is only cleared by the `GamePage` handler — and only on the `lobby_closed` branch, not the more common `invalid_token` branch (which fires when `reconnectTokens` Map is empty post-restart even though the HMAC signature still verifies because `SESSION_SECRET` is stable).

2. **The lobby snapshot in localStorage (`scrum-monsters-lobby-snapshot`) is write-only.** The key is `setItem`-ed inside `lobby_sync` handler but never `getItem`-ed on cold page load. The in-memory `lastLobbySnapshot` field starts as `null` on every page load. The "use snapshot to gate auto-reconnect" branch in `socket.on('connect')` (`if (storedToken && lastLobbySnapshot)`) is therefore unreachable on cold load. This decouples the snapshot from any active enforcement: the snapshot can drift arbitrarily far from `last-lobby` and nothing notices.

The duplicate-self + lost-host effect comes from the server side: `joinLobby()` only deduplicates by name when the existing player is in the in-memory `disconnectedPlayers` Map. After a server restart, that Map is empty, so when the client falls back to `join_lobby` (or when the client opens a second tab and the original tab's player is still listed in `lobby.players` from a not-yet-restarted server), a brand-new player record with a new ID is appended. The host-demotion path is in `handlePlayerDisconnect` (lines 700-724): when the host's socket disconnects, host status is *immediately* transferred to the next connected player without checking whether the original host has a valid reconnect token; on rejoin, `attemptPlayerReconnect` finds the player record but with `isHost: false`, and there is no path that restores host on successful reconnect.

**Primary recommendation for the planner:** Treat this as two surgical fixes in one phase — (a) **client-side coherence** (validate snapshot/token/last-lobby agree by lobbyId on both write and read; clear all three together when any is invalidated), and (b) **server-side host preservation** (during the disconnect grace window, do not transfer host irrevocably — defer host-transfer until grace expires, OR restore host on successful reconnect). The "duplicate self" symptom is mostly a downstream effect of (a); fixing (a) likely eliminates it without server-side changes to `joinLobby` dedup.

## Repro key clarification

The repro mentions a `scrum-monsters-current-lobby` localStorage key. **This key does not exist in the codebase.** The closest match is `scrum-monsters-last-lobby` (`LAST_LOBBY_KEY` in `client/src/lib/utils/lastLobbyStorage.ts:5`). The planner should treat the repro's "current-lobby" as referring to `scrum-monsters-last-lobby`. The three localStorage keys actually involved are:

| Key | Owner file | Purpose |
|-----|-----------|---------|
| `scrum-monsters-last-lobby` | `client/src/lib/utils/lastLobbyStorage.ts:5` | Powers the "Rejoin" button on MenuPage |
| `scrum-monsters-lobby-snapshot` | `client/src/lib/stores/useWebSocket.tsx:43` | Intended cache of last `LobbySnapshot`; **write-only on cold load** |
| `scrum-monsters-reconnect-token` | `client/src/lib/stores/useWebSocket.tsx:42` | Signed token sent to server's `reconnect_with_token` handler |

The Three.js multiple-imports warning in the repro is unrelated (Vite HMR artifact in dev only); confirmed not on the reconnection code path.

## File map (read-only)

### Client — persistence layer

| File | Lines | Role |
|------|-------|------|
| `client/src/lib/utils/lastLobbyStorage.ts` | 5, 17-32, 37-48, 53-59 | `LAST_LOBBY_KEY`; `loadLastLobby` (24h TTL), `saveLastLobby`, `clearLastLobby` |
| `client/src/lib/stores/useWebSocket.tsx` | 42-77 | `RECONNECT_TOKEN_KEY`, `LOBBY_SNAPSHOT_KEY`; `storeReconnectToken`/`getStoredReconnectToken`/`clearStoredReconnectToken` helpers |
| `client/src/lib/stores/useWebSocket.tsx` | 88, 473-482 | `lastLobbySnapshot` initial = `null`; `storeLobbySnapshot()` writes both localStorage + memory |
| `client/src/lib/stores/useWebSocket.tsx` | 503-513 | `reconnectToLobby()` — emits token without lobbyId validation |
| `client/src/lib/stores/useGameState.tsx` | 33-171 | Pure in-memory Zustand store; **no persistence**, `clearAll` resets all fields |

### Client — page/effect layer

| File | Lines | Role |
|------|-------|------|
| `client/src/pages/GamePage.tsx` | 58-91 | Auto-join effect: try `reconnectToLobby()` then fall back to `emit('join_lobby')` |
| `client/src/pages/GamePage.tsx` | 97-105 | `lobby_created` handler — `LastLobbyStorage.saveLastLobby` |
| `client/src/pages/GamePage.tsx` | 107-113 | `lobby_joined` handler — `LastLobbyStorage.saveLastLobby` |
| `client/src/pages/GamePage.tsx` | 115-120 | `lobby_sync` handler — sets `currentLobby`/`currentPlayer`; **does NOT update LastLobbyStorage** |
| `client/src/pages/GamePage.tsx` | 122-137 | `reconnect_response` handler — clears `LastLobbyStorage` only on `lobby_closed`, not on `invalid_token` / `grace_expired` / `server_error` |
| `client/src/pages/GamePage.tsx` | 220-230 | `game_error` handler — clears `LastLobbyStorage` if message contains "lobby not found" |
| `client/src/pages/GamePage.tsx` | 262-270 | `handleBackToMenu` — clears all three (snapshot via `clearReconnectionState`, last-lobby via `LastLobbyStorage.clearLastLobby`, in-memory via `clearAll`) |
| `client/src/pages/MenuPage.tsx` | 25, 46-70 | "Rejoin" button — uses `LastLobbyStorage.loadLastLobby()` + `reconnectToLobby()` (same blind-token issue) |
| `client/src/App.tsx` | 76-77, 128 | `connect()` on mount, `disconnect()` on unmount |

### Client — useWebSocket reconnect lifecycle

| File | Lines | Role |
|------|-------|------|
| `useWebSocket.tsx` | 121-156 | `socket.on('connect')` — auto-reconnect attempt is gated on `storedToken && lastLobbySnapshot`; **`lastLobbySnapshot` is null on cold load**, so this gate is dead on cold reload |
| `useWebSocket.tsx` | 203-220 | `socket.on('lobby_sync')` — stores token + writes snapshot to localStorage + sets in-memory snapshot |
| `useWebSocket.tsx` | 222-240 | `socket.on('reconnect_response')` — on failure: clears token + clears in-memory snapshot, but **does NOT clear `LOBBY_SNAPSHOT_KEY` from localStorage** |
| `useWebSocket.tsx` | 357-394 | `disconnect()` action — clears token + clears in-memory snapshot, but **does NOT clear `LOBBY_SNAPSHOT_KEY` from localStorage** |
| `useWebSocket.tsx` | 449-471 | `clearReconnectionState()` — same gap: clears token but not the snapshot localStorage key |

### Server — reconnect path

| File | Lines | Role |
|------|-------|------|
| `server/websocket.ts` | 1444-1533 | `socket.on('reconnect_with_token')` handler — calls `sessionManager.attemptPlayerReconnect`, joins socket room, syncs gameState, emits `lobby_sync` + `reconnect_response` |
| `server/websocket.ts` | 2058-2130 | `socket.on('disconnect')` — calls `sessionManager.handlePlayerDisconnect` which transfers host immediately and emits `host_transferred` to all clients |
| `server/websocket.ts` | 277-287 | `create_lobby` — emits `lobby_created` then `lobby_sync` (so host's snapshot is populated for that lobby) |
| `server/websocket.ts` | 340-386 | `join_lobby` — emits `lobby_joined` then `lobby_sync` (overwrites snapshot for joining lobby) |
| `server/domains/SessionManager.ts` | 78-80 | Constants: `DISCONNECT_GRACE_PERIOD = 10min`, `TOKEN_EXPIRY_TIME = 5min` (mismatch — token can expire before grace ends) |
| `server/domains/SessionManager.ts` | 88-96 | `TOKEN_SECRET` from `process.env.SESSION_SECRET` or random fallback per process; dev `.env` has `SESSION_SECRET="localsessionsecret123456"` so signatures *do* survive restart, but the in-memory `reconnectTokens` Map does not |
| `server/domains/SessionManager.ts` | 202-306 | `joinLobby` — only dedupes by name when existing player is in `disconnectedPlayers` Map (line 213-215); after server restart that Map is empty so duplicate is appended |
| `server/domains/SessionManager.ts` | 580-612 | `generateReconnectToken` — base64(JSON{playerId, lobbyId, playerName, issuedAt, expiresAt, signature}); also stored in `reconnectTokens` Map |
| `server/domains/SessionManager.ts` | 617-651 | `validateReconnectToken` — requires both signature match **AND** entry in `reconnectTokens` Map. Post-restart the Map is empty so all old tokens fail with "invalid_token" even though signature is valid |
| `server/domains/SessionManager.ts` | 657-740 | `handlePlayerDisconnect` — creates DisconnectedPlayer, generates new token, **immediately transfers host if host disconnected** (lines 700-724) — no deferral during grace |
| `server/domains/SessionManager.ts` | 745-845 | `attemptPlayerReconnect` — re-syncs the existing player record but **never restores `isHost: true`** even if the original disconnect record shows they were host. The `newHost` field in the response is informational only |
| `server/gameState.ts` | 182-200, 274-278, 334, 400-441 | Legacy duplicate of reconnect token + host-transfer logic; appears unused (websocket.ts uses sessionManager, not gameState, for reconnect) but still present |

### Existing tests

| File | Lines | Coverage |
|------|-------|----------|
| `server/domains/SessionManager.test.ts` | 91-152 | `joinLobby` — does not cover stale-rejoin-after-restart scenario |
| `server/domains/SessionManager.test.ts` | 316-358 | `generateReconnectToken` |
| `server/domains/SessionManager.test.ts` | 360-435 | `validateReconnectToken` — covers invalid/expired/tampered |
| `server/domains/SessionManager.test.ts` | 437-506 | `handlePlayerDisconnect` — line 475-487 tests "host transfer triggers on host disconnect" (the very behavior that loses host status on rejoin) |
| `server/domains/SessionManager.test.ts` | 508-588 | `attemptPlayerReconnect` — line 551-565 only checks `result === 'success'`, no assertion on `isHost` post-rejoin |
| `server/domains/SessionManager.test.ts` | 590-616 | `processDisconnectedPlayers` — grace expiry |
| `server/domains/SessionManager.test.ts` | 619+ | Host transfer suite — confirms current behavior of irrevocable host transfer |

**No client-side tests exist** for `useWebSocket`, `LastLobbyStorage`, `useGameState` reconnect interactions. No E2E test simulates server restart + tab reload. These are the test gaps the planner must fill.

## Sequence diagram — page load with stale state

```
[Tab reload, server already restarted, localStorage carries last session's keys]

App mount
  └─ useEffect: connect()
       └─ io(...) → socket.on('connect') fires
            ├─ Sets isConnected=true
            ├─ Starts heartbeat
            └─ Auto-reconnect gate:
                 if (storedToken && lastLobbySnapshot)        ← DEAD on cold load
                                                                 (lastLobbySnapshot=null)

GamePage mount (route /game/MT1Q4L)
  └─ useEffect [lobbyId, socket, currentLobby, isAttemptingJoin]
       ├─ currentLobby?.id === 'MT1Q4L'?  No (currentLobby=null)
       ├─ isAttemptingJoin? No → set true
       ├─ getReconnectToken() returns stale token for 36I0RL
       └─ reconnectToLobby() → socket.connected? yes → emits
              reconnect_with_token { token-for-36I0RL }
              ╭─ NO VALIDATION that token.lobbyId === route lobbyId ╮
              ╰─────────────────────────────────────────────────────╯

Server: socket.on('reconnect_with_token')
  └─ sessionManager.attemptPlayerReconnect(token)
       ├─ validateReconnectToken: signature OK (SESSION_SECRET stable in dev .env)
       │                          BUT reconnectTokens Map is empty post-restart
       │                          → returns null → 'invalid_token'
       └─ emits reconnect_response { result: 'invalid_token' }

Client: socket.on('reconnect_response') — TWO handlers fire:
  ├─ useWebSocket handler:
  │    ├─ clearStoredReconnectToken()  ✓ token gone from localStorage
  │    └─ set lastLobbySnapshot=null   ← but LOBBY_SNAPSHOT_KEY still in localStorage
  └─ GamePage handler:
       └─ result === 'lobby_closed'?  NO (result='invalid_token')
            → does nothing            ← LastLobbyStorage NOT cleared
            → isAttemptingJoin stays true

GamePage useEffect re-fires (deps changed via socket events)
  ├─ currentLobby still null
  ├─ isAttemptingJoin still true → early return
  └─ Stuck — UI shows "Connecting to Lobby..." spinner forever
     unless user navigates away

If user navigates back / clicks Rejoin on MenuPage:
  ├─ MenuPage shows "Rejoin: <name>" using stale LastLobbyStorage value
  └─ Same blind-token-emit pattern repeats
```

## Origin of the snapshot/last-lobby drift

The drift in the repro (snapshot=36I0RL while last-lobby=MT1Q4L) can occur via this sequence:

1. User created lobby 36I0RL → `lobby_created` fires → `LastLobbyStorage.saveLastLobby(36I0RL)`; then `lobby_sync` fires → `storeLobbySnapshot({lobby: 36I0RL})` and `storeReconnectToken(token-for-36I0RL)`.
2. User navigated to a new lobby creation flow for MT1Q4L. `LobbyCreation.tsx` emits `create_lobby`. Server emits `lobby_created` → `LastLobbyStorage.saveLastLobby(MT1Q4L)` overwrites last-lobby. Server then emits `lobby_sync` for MT1Q4L → snapshot/token *should* overwrite to MT1Q4L.
3. **Race / drop scenario:** if the socket transitions (transport upgrade, brief disconnect) between `lobby_created` and `lobby_sync`, the `lobby_sync` event is missed by the listener. Listener registration is in a `useEffect` whose deps include `socket`, `currentPlayer`, `currentLobby`, `lastGamePhase` — when `currentLobby` flips on `lobby_created`, the effect re-runs, tearing down all listeners (`socket.off(...)` in cleanup at lines 246-259) and re-registering. If `lobby_sync` arrives during the gap, it is lost. Snapshot/token stay scoped to 36I0RL while last-lobby flips to MT1Q4L.
4. Server restart wipes 36I0RL and MT1Q4L from `lobbies` Map. Client reload finds: `last-lobby = MT1Q4L` (from step 2), `snapshot = 36I0RL` (from step 1, never cleanly overwritten), `token = token-for-36I0RL`.

The listener-teardown-during-event-emission is the most likely structural cause. `useEffect` listing `currentLobby` and `lastGamePhase` in deps means *every* lobby state change re-installs all socket listeners — a known anti-pattern with Socket.IO event handlers.

## Why the host is demoted on rejoin

`SessionManager.handlePlayerDisconnect` (lines 700-724) makes host transfer **immediate and irrevocable**:

```
if (lobby.hostId === playerId) {
  const connectedPlayers = lobby.players.filter(
    (p) => p.id !== playerId && !this.disconnectedPlayers.has(p.id)
  );
  if (connectedPlayers.length > 0) {
    const newHost = connectedPlayers[0];
    lobby.hostId = newHost.id;
    newHost.isHost = true;
    // ...emits session:host_changed
  }
}
```

There is **no symmetric restoration** in `attemptPlayerReconnect`. The reconnecting player's `isHost` field is whatever it was set to when host transfer happened (`false`), and `lobby.hostId` points at the new host. The reconnect handler simply re-attaches the socket and returns the player record as-is. The `newHost` field returned in `ReconnectResponse` (used at GamePage line 131-136) is purely informational — it tells the user "X became host while you were away" but does not restore your host status.

This means: **even with no client bugs at all**, the host who briefly disconnects (network blip, tab switch on mobile, server restart with grace period intact) and reconnects within grace period is permanently demoted. This is independent of the snapshot/token drift bug.

## Why duplicate self appears

Two paths create duplicates:

**Path A (client-side, dominant in repro):** Stale token rejected by server → GamePage falls through to `emit('join_lobby', { lobbyId: <route>, playerName: savedName })`. Server's `joinLobby` only dedupes against `disconnectedPlayers` Map (line 213-215). If that Map is empty (post-restart) but `lobby.players` still contains a player with the same name (e.g., if the original session was created under a *different* server PID and somehow restored from cache, OR if the user opens a second tab while the first is still alive), the new player is appended with a fresh ID. Both records appear in `lobby.players`, both render in roster.

**Path B (timing-related):** During the brief window between `socket.on('disconnect')` firing on the server and the client's reconnect attempt arriving, the client may auto-emit `reconnect_with_token` *before* the server has populated `disconnectedPlayers` (the disconnect handler is synchronous so this is unlikely on a single Node process, but possible if event ordering is preempted). The "stillInLobby" branch at SessionManager.ts:768-792 handles this — it returns success without restoring state if the player is still in `lobby.players` and not in `disconnectedPlayers`. This branch was added specifically to handle the lobby_created → GamePage auto-reconnect race.

Path B is benign (existing mitigation works). Path A is the active bug.

## Implementation strategies (planner picks)

### Strategy 1: Client-side coherence guard (smallest blast radius)

**Idea:** Treat `last-lobby`, `lobby-snapshot`, and `reconnect-token` as a single atomic triple. Always read all three together and validate `lobbyId` consistency before any reconnect attempt; when any one is invalidated, clear all three.

**Changes:**
- New helper `client/src/lib/utils/lobbySessionStorage.ts` (or extend `lastLobbyStorage`) exporting `loadSession()`, `saveSession({lobbyId, lobbyName, snapshot, token})`, `clearSession()`. Internally writes/reads all three localStorage keys.
- On cold load, `useWebSocket` initializes `lastLobbySnapshot` from localStorage (parse `LOBBY_SNAPSHOT_KEY`).
- `reconnectToLobby(expectedLobbyId?: string)` accepts a `lobbyId` and decodes the token (base64-decode JSON, no signature check needed client-side); if `token.lobbyId !== expectedLobbyId`, *clear the session and return false* (don't emit).
- `useWebSocket`'s `socket.on('reconnect_response')` failure path calls `clearSession()` (covers all three keys uniformly).
- `GamePage`'s `lobby_sync` handler calls `LastLobbyStorage.saveLastLobby` so last-lobby updates whenever snapshot does (currently it only updates on `lobby_created`/`lobby_joined`).

**Trade-off:** Pure client-side — no server changes. Eliminates the wrong-lobby reconnect attempt entirely. Does NOT fix host demotion (Strategy 3 needed for that). May expose an additional UX gap: when the consistency check fails on load, what does the UI show? Probably needs a one-time toast: "Your previous session expired."

**Risk:** Decoding the token client-side requires duplicating the base64 JSON shape; if the server changes token format the decode breaks silently. Mitigation: store `lobbyId` redundantly alongside the token in the snapshot wrapper so decoding the token is unnecessary.

### Strategy 2: Snapshot validation on read with cleanup

**Idea:** Only fix the read-side. On every cold load and on every connect, read all three keys, compare lobbyIds; if any disagree, wipe all three and never attempt reconnect.

**Changes:**
- One new function in `useWebSocket` called from `connect()` and `App` mount: `validateAndReconcileStoredSession()`. Reads `LOBBY_SNAPSHOT_KEY`, `RECONNECT_TOKEN_KEY` (decode), `LAST_LOBBY_KEY`. If lobbyIds don't match, clear all and emit toast.
- No changes to write paths.

**Trade-off:** Smaller diff than Strategy 1. Doesn't fix the underlying drift (writes can still get out of sync); just detects and recovers. If drift recurs mid-session (not just on load), the user sees ghost state until next reload. Doesn't address `reconnectToLobby()`'s lack of lobbyId validation when called from GamePage with a route-bound lobbyId.

**Recommended only if** the planner wants to ship a hot-fix and revisit drift origin in a follow-up.

### Strategy 3: Server-side host preservation during grace window

**Idea:** Defer host transfer until grace period actually expires (when `processDisconnectedPlayers` cleans up). On reconnect during grace, restore `isHost: true` and revert `lobby.hostId`.

**Changes (server):**
- `SessionManager.handlePlayerDisconnect`: when host disconnects, **do not** transfer host immediately. Instead, store `wasHost: true` flag on the `DisconnectedPlayer` record (already has the structure for it).
- `SessionManager.processDisconnectedPlayers` (called by interval): when a disconnected host's grace expires, *then* perform the host transfer (current logic moves here).
- `SessionManager.attemptPlayerReconnect`: if `disconnectedPlayer.wasHost`, restore `player.isHost = true` and `lobby.hostId = playerId`. Demote any interim host that was promoted (but with deferral, no interim host exists).
- `websocket.ts` disconnect handler: only emit `host_transferred` *after* grace expires (the disconnect notification still emits `player_disconnected` immediately so other clients know).
- Add a "host disconnected, X seconds remaining before transfer" UX state for other players.

**Trade-off:** Improves UX significantly (brief network blips no longer demote host). More server-side change; touches event ordering. Backwards-compatible with existing client. Tests in `SessionManager.test.ts:475-487` and 619+ Host Transfer suite must be updated to reflect deferred behavior.

**Risk:** What if no one is left in the lobby? Currently if host's the only one, `connectedPlayers.length === 0` and no transfer happens — same behavior under deferral. What if other players also disconnect? On grace expiry, `processDisconnectedPlayers` would need to pick from remaining connected players (same as current logic, just delayed).

### Strategy 4 (combined, recommended for full fix): Strategy 1 + Strategy 3

Pair the client-side coherence guard with server-side host preservation. Strategy 1 alone fixes "wrong lobby + duplicate self"; Strategy 3 alone fixes "lost host status." Both root-cause fixes are independent and small. Plan as two plans (the ROADMAP already anticipates this split: 41-01 client snapshot/token consistency, 41-02 reconnect handler identity/host).

## Cross-system interaction notes

- **Order of operations on cold load currently:** App mounts → `connect()` → socket.on('connect') fires → auto-reconnect gate fails (snapshot=null) → GamePage mounts → effect reads stored token → fires `reconnect_with_token` for whatever lobby the token points at. The route's lobbyId is *not* part of the token-reconnect decision.
- **Two `reconnect_response` handlers** (useWebSocket + GamePage) both fire — useWebSocket clears the token, GamePage handles UI/navigation. They overlap but don't conflict; they do *not* together clear the snapshot's localStorage entry.
- **`lobby_updated` event is deprecated** (logs warning at GamePage:140) but still wired up; the reconnect path emits it from `socket.to(lobbyId)` (websocket.ts:1518) so other clients learn about the reconnection. Not directly related to the bug.
- **`gameState.ts` has a legacy duplicate** `attemptReconnect` implementation (lines 370-441) that is not invoked by the active socket handler. The active path is `sessionManager.attemptPlayerReconnect`. Planner should leave gameState.ts's copy alone unless explicitly cleaning up dead code; modifying it has no effect on the bug.

## Risks and edge cases

| Risk | Description | Mitigation in plan |
|------|-------------|---------------------|
| Token expires mid-session | `TOKEN_EXPIRY_TIME = 5min` < `DISCONNECT_GRACE_PERIOD = 10min`. Player can be in grace window with valid disconnect record but expired token. Currently returns `invalid_token`. | Either widen token expiry to match grace, or fall back to "by-name reconnect" if disconnectedPlayer record exists for the matching player. Strategy 4 plan should consider this. |
| Server restart wipes `reconnectTokens` Map | All in-flight tokens become invalid even with stable SESSION_SECRET. | Strategy 1 detects this on response and clears cleanly. A fancier fix would persist the tokens Map (Redis) — out of scope for a bugfix phase per the v5.0 milestone goal. |
| Multiple tabs racing on storage | Tab A and Tab B both have the same token; both reconnect; server allows only one socket per playerId? | Currently the second `reconnect_with_token` would re-attach the socket to the same playerId (no per-playerId socket guard found). Cross-tab is out of scope for this phase but worth noting in the plan's "non-goals." |
| `LastLobbyStorage` 24h TTL | If a lobby still exists server-side after >24h, MenuPage will not show "Rejoin" even though reconnect is technically possible. Existing behavior, not a regression. | No action needed. |
| Token format change | Client-side token decode (Strategy 1) couples client to token shape. | Store lobbyId redundantly in the saved-session wrapper; never decode the token client-side. |
| The `lobby_sync` listener teardown race | `useEffect` deps cause listeners to be torn down/re-registered on every lobby state change, can drop events. | Plan should consider stabilizing socket listener registration (deps `[socket]` only, with handlers reading state via `useGameState.getState()` or refs). This is a separate but related fix that prevents recurrence of drift. |
| Duplicate event handler emit on `reconnect_response` | Two handlers, one in useWebSocket, one in GamePage. Currently fine but easy to break. | Document handler ownership explicitly in the plan; consider centralizing reconnect-response handling in useWebSocket and exposing state to GamePage. |

## Summary of where to fix

| Symptom | Root cause file:lines | Strategy |
|---------|------------------------|----------|
| Snapshot/last-lobby drift (different lobbyIds) | `useWebSocket.tsx:222-240`, `357-394`, `449-471` (snapshot localStorage never cleared on failure paths); `GamePage.tsx:115-120` (lobby_sync doesn't update LastLobbyStorage); useEffect listener teardown race | Strategy 1 (or 2) |
| Wrong-lobby reconnect attempt | `useWebSocket.tsx:503-513` (`reconnectToLobby` doesn't validate lobbyId vs caller's route) | Strategy 1 |
| Duplicate self in roster | Downstream of stale rejoin reaching server with name-only join. `SessionManager.ts:213-215` (only dedupes vs `disconnectedPlayers`) | Strategy 1 (eliminates the upstream cause); optional server-side belt-and-braces: also dedupe by name across `lobby.players` for any active socket |
| Host demoted after reconnect | `SessionManager.ts:700-724` (immediate host transfer on disconnect); `SessionManager.ts:745-845` (no host restoration on reconnect) | Strategy 3 |
| Stale snapshot in localStorage on cold load | `useWebSocket.tsx:88` initial state ignores localStorage | Strategy 1 (read on init) or Strategy 2 (validate on init) |
| `reconnect_response: invalid_token` doesn't clear last-lobby | `GamePage.tsx:122-137` only clears on `lobby_closed` | Add same cleanup for `invalid_token`/`grace_expired`/`server_error` (part of Strategy 1) |

## Sources

- Codebase read-only inspection (HIGH confidence on file:line references)
- `.planning/ROADMAP.md` Phase 41 entry
- `.planning/codebase/CONCERNS.md` (SESSION_SECRET handling)
- No external sources required — bug is fully internal
