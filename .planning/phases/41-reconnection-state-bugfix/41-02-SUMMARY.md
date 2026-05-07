---
phase: 41-reconnection-state-bugfix
plan: 02
subsystem: server-session-mgmt
tags: [socket.io, sessionmanager, reconnect, host-transfer, grace-period, hmac-token, vitest, race-condition, defense-in-depth]

requires:
  - phase: 41-reconnection-state-bugfix/41-RESEARCH
    provides: Host-demoted-on-reconnect root cause; token-vs-grace mismatch; immediate host transfer in handlePlayerDisconnect
  - phase: 41-reconnection-state-bugfix/41-01
    provides: Atomic three-key client session storage; lobbyId-guarded reconnect emit; clean inputs to server reconnect path
provides:
  - Deferred host transfer (host status preserved across grace window)
  - Host restoration on attemptPlayerReconnect when wasHost flag set
  - TOKEN_EXPIRY_TIME aligned with DISCONNECT_GRACE_PERIOD (both 10 min)
  - Server-side joinLobby dedupe for already-connected same-name player (defense in depth)
  - Client-side GamePage snapshot-hydrate short-circuit (eliminates create_lobby join race)
  - sessionDisconnectSweeper interval that emits host_transferred only on grace expiry
  - Disconnect log enriched with playerId + lobbyHostId for asymmetry diagnosis
affects:
  - shared/gameEvents.ts DisconnectedPlayer (additive optional field wasHost; not on-wire)
  - All server reconnect callers (host status now preserved across the grace window)
  - All clients (host_transferred broadcast moves from disconnect-time to grace-expiry-time)

tech-stack:
  added: []
  patterns:
    - "Deferred mutation with sweeper-driven finalize (host transfer marked at disconnect, performed only on grace expiry)"
    - "Defense-in-depth host restoration (attemptPlayerReconnect demotes any other isHost holder before restoring)"
    - "Token expiry aligned with state grace period (no structurally-expired-but-still-valid window)"
    - "Snapshot-hydrate short-circuit to break a synchronous-snapshot vs delayed-store race in mounted child"
    - "Connected-same-name dedupe in joinLobby as belt-and-braces against any future race that mints duplicates"

key-files:
  created:
    - .planning/phases/41-reconnection-state-bugfix/41-02-SUMMARY.md
  modified:
    - server/domains/SessionManager.ts
    - server/domains/SessionManager.test.ts
    - server/websocket.ts
    - shared/gameEvents.ts
    - client/src/pages/GamePage.tsx

key-decisions:
  - "TOKEN_EXPIRY_TIME widened 5min→10min to match DISCONNECT_GRACE_PERIOD. Trade-off: wider replay window. Acceptable because tokens are HMAC-signed with SESSION_SECRET and bound to a specific {playerId, lobbyId} pair; without this alignment a player in the legitimate grace window can hold a structurally-expired token, producing spurious invalid_token failures."
  - "Host transfer deferred to grace expiry rather than reverted on reconnect. Simpler invariant: lobby.hostId is stable across the grace window. No interim host UI churn for other clients during a brief network blip."
  - "Deferred host transfer logic moved entirely from handlePlayerDisconnect to processDisconnectedPlayers. websocket.ts polls the sweeper every 30s and emits host_transferred for any returned transfer. The 30s cadence matches the existing legacy gameState watchdog and is acceptable because the only user-visible delay is when the host fails to reconnect AT ALL — by definition no UI is waiting for that transfer to display."
  - "Defense-in-depth in attemptPlayerReconnect: even if some external code path during the grace window flipped lobby.hostId or another player's isHost, the reconnecting wasHost player wins. This guards against legacy/duplicate code paths in gameState.ts (the dead-code reconnect handler at gameState.ts:370-441 per RESEARCH) and any future host-transfer caller."
  - "Added wasHost?: boolean to DisconnectedPlayer in shared/gameEvents.ts as an optional, server-internal field. Although the type is in shared/, it is never emitted on-wire — disconnect events carry only {playerId} per ServerToClientEvents.player_disconnected. Adding the field is purely additive and breaks no schemas."
  - "GamePage snapshot-hydrate short-circuit (b8b969f) chosen over moving the auto-join effect dependency. The race is structural: useWebSocket.lastLobbySnapshot is set synchronously by the lobby_sync handler, but useGameState.currentLobby is set by listeners on the now-unmounted LobbyCreation component. Reading the snapshot directly from useWebSocket and hydrating useGameState in GamePage is the smallest blast-radius fix; alternatives (moving listener into GamePage; wiring lobby_sync to useGameState directly) would have touched more files and risked subtler regressions."
  - "Server-side joinLobby connected-same-name dedupe (4191453) added as defense in depth against the same race after the client patch. If anything else in the future emits a duplicate join_lobby (different client, future feature, test harness), the server now refuses to mint a phantom record."
  - "Disconnect log enriched (6777de9) with playerId + lobbyHostId. The duplicate-self bug spent more time in diagnosis than implementation because the only visible signal was lobby_updated emitting two players — the underlying socket.data.playerId rewrite was invisible. This logging closes the diagnostic gap for the next reconnection regression."

patterns-established:
  - "Defer-and-finalize: state mutations that depend on a grace window should be marked-but-not-applied at the trigger event, then finalized at the sweeper. Caller of the sweeper is responsible for any associated wire emit."
  - "Token-and-state expiry alignment: any token whose validity depends on associated server-side state (a Map entry, a grace window) MUST have its structural expiry equal to or longer than the state expiry, never shorter."
  - "Defense in depth on identity restoration: when restoring an authoritative role (host, owner, etc.), explicitly demote any other holder before promoting self. Do not assume invariants held by callers."
  - "Snapshot-as-hydration-source: when a parent store has a synchronous snapshot of state that a child store will populate asynchronously, the child component MAY hydrate from the snapshot to short-circuit the gap. This is acceptable when the snapshot is authoritative for the route's identity (lobbyId match)."

requirements-completed: [FIX-03]

duration: ~25min total (inc. ~10min post-checkpoint diagnosis loop)
completed: 2026-05-06
---

# Phase 41 Plan 02: Reconnection State Bugfix (server) Summary

**Server defers host transfer until grace expiry; reconnect restores host atomically; token expiry now matches grace period; client GamePage hydrates from useWebSocket snapshot to break the create_lobby join race; joinLobby dedupes connected same-name players as defense in depth.**

## Performance

- **Duration:** ~25 minutes (initial server fix ~10min + post-checkpoint diagnosis & three follow-up patches ~15min)
- **Started:** 2026-05-06 (after Plan 41-01 completed)
- **Completed:** 2026-05-06 (after live repro approval)
- **Tasks:** 3 / 3 (Task 3 was the human-verify checkpoint, approved with Step 5 waived as covered by unit test)
- **Files modified:** 5
- **Tests added:** 5 (4 host-transfer + 1 joinLobby dedupe)
- **Tests updated:** 2 (host-transfer-on-disconnect → deferred semantics; expired-token-vs-grace → no-longer-applicable, replaced)
- **Full suite:** 642 / 642 passing post-plan (was 641 pre-plan; +1 for joinLobby dedupe regression test)

## Accomplishments

### Server-side (the planned scope)

- `SessionManager.handlePlayerDisconnect`: when the host disconnects, sets `wasHost: true` on the DisconnectedPlayer record. **Does NOT** mutate `lobby.hostId`, **does NOT** flip another player's `isHost`, **does NOT** emit `session:host_changed`. The disconnecting host's identity is preserved across the entire 10-minute grace window.
- `SessionManager.attemptPlayerReconnect`: when the matched DisconnectedPlayer has `wasHost === true`, restores `player.isHost = true` and `lobby.hostId = playerId`. Defense in depth: iterates `lobby.players` and demotes any other player whose `isHost` was flipped during the grace window (legacy code path, manual transfer race, etc.) so there is at most one host post-restoration.
- `SessionManager.processDisconnectedPlayers`: when a `wasHost` record's grace expires, performs the host transfer that used to live in `handlePlayerDisconnect`. Selects the first connected non-disconnected player (same filter as before), updates `lobby.hostId` and the new host's `isHost`, and returns an array of `{lobbyId, oldHostId, newHostId, newHostName}` for the caller to broadcast.
- `TOKEN_EXPIRY_TIME` widened from `5 * 60 * 1000` to `10 * 60 * 1000` with an inline comment explaining the trade-off. Now equal to `DISCONNECT_GRACE_PERIOD`. A player in the legitimate grace window can no longer hold a structurally-expired token.
- `shared/gameEvents.ts`: added optional `wasHost?: boolean` to `DisconnectedPlayer` interface, server-internal — never emitted on-wire (the `player_disconnected` event carries only `{playerId}`).
- `server/websocket.ts`:
  - Added `sessionDisconnectSweeperInterval` (30-second cadence) that calls `sessionManager.processDisconnectedPlayers()` and emits `host_transferred` to each lobby for any returned transfer, plus a `lobby_updated` broadcast so connected clients refresh roster + host UI. Cleanup added to the returned `cleanup` function.
  - Disconnect handler's `if (hostTransfer)` block retained as a no-op safety net with explanatory comment (always undefined post-Phase-41-02).

### Post-checkpoint follow-up patches (`b8b969f`, `4191453`, `6777de9`)

The first live-repro attempt revealed the duplicate-self bug was NOT solved by the host-transfer fix alone. Diagnosis: the duplicate was a `create_lobby` → `lobby_created` / `lobby_sync` race. `useWebSocket.lobby_sync` populates `lastLobbySnapshot` synchronously, but `useGameState.currentLobby` is set by listeners on the (about-to-unmount) `LobbyCreation` component. By the time `GamePage` mounts on the new route, `currentLobby` is null and the auto-join effect fires a redundant `join_lobby` for the host's own name — the server (with no dedupe path for connected same-name players) mints a phantom player and overwrites `socket.data.playerId`.

Three patches landed to close this:

- **`b8b969f` — GamePage snapshot-hydrate short-circuit (client):** GamePage's auto-join effect now reads `useWebSocket.getState().lastLobbySnapshot` first. If the snapshot's `lobby.id` matches the route's `lobbyId.toUpperCase()`, hydrate `useGameState` directly via `setLobby` / `setPlayer`, set `isAttemptingJoin = false`, and **return** before the redundant `join_lobby` emit. This is the actual fix.
- **`4191453` — joinLobby connected-same-name dedupe (server):** Defense in depth on the server. Before the existing disconnected-player dedupe runs, check for any connected (`!disconnectedPlayers.has(p.id)`) player with the matching name. If found, log it and return the existing `{lobby, player}` instead of minting a new record. New regression test asserts this behavior keeps the roster at length 1 and preserves `isHost: true`.
- **`6777de9` — disconnect log enrichment (server):** The `Player disconnected` log line in `websocket.ts` now includes `playerId` and `lobbyHostId` alongside the existing fields, so any future asymmetry between `socket.data.playerId` and the lobby's actual `hostId` is visible directly from logs without cross-referencing. This is the diagnostic gap that made the duplicate-self triangulation costlier than necessary.

## Task Commits

1. **Task 1 + Task 2: Defer host transfer + restoration + token expiry alignment + cross-cutting validation** — `fbf125c` (`fix(41-02): defer host transfer; restore host on reconnect; align token expiry`)
2. **Task 3 follow-up: GamePage snapshot-hydrate (client race fix)** — `b8b969f` (`fix(41-02): hydrate GamePage from useWebSocket snapshot to prevent duplicate-self join race`)
3. **Task 3 follow-up: SessionManager.joinLobby dedupe + regression test** — `4191453` (`fix(41-02): dedupe joinLobby for connected same-name player + test`)
4. **Task 3 follow-up: disconnect log enrichment** — `6777de9` (`chore(41-02): log playerId and lobbyHostId on disconnect for asymmetry visibility`)

## Files Modified

| File | Change |
|------|--------|
| `server/domains/SessionManager.ts` | TOKEN_EXPIRY_TIME 5→10min; handlePlayerDisconnect defers host transfer (sets wasHost); attemptPlayerReconnect restores host with defense in depth; processDisconnectedPlayers performs deferred transfer and returns transfer events; joinLobby connected-same-name dedupe |
| `server/domains/SessionManager.test.ts` | 4 new Phase-41-02 tests (host preserved across grace; deferred transfer on grace expiry; token expiry equals grace; interim host roll-back); 1 new joinLobby dedupe regression test; 2 existing tests updated (host-transfer-on-disconnect → deferred; expired-token-vs-grace → 11min instead of 6min) |
| `server/websocket.ts` | sessionDisconnectSweeper interval (30s) emits host_transferred + lobby_updated on grace expiry; cleanup added; disconnect handler comment updated; disconnect log includes playerId + lobbyHostId |
| `shared/gameEvents.ts` | DisconnectedPlayer adds optional `wasHost?: boolean` (server-internal, not on-wire) |
| `client/src/pages/GamePage.tsx` | Auto-join effect reads useWebSocket.lastLobbySnapshot and hydrates useGameState when snapshot.lobby.id matches the route, short-circuiting the redundant join_lobby emit |

## Decisions Made

See `key-decisions` in frontmatter. Notable:

- **Token-expiry widening** is the right trade-off given the HMAC binding. Not widening would have left a legitimate grace-window-but-expired-token failure mode that no client-side fix could repair.
- **Defer rather than revert** for host transfer keeps the invariant simple. Other clients see a stable `lobby.hostId` for the grace window; if the host actually doesn't return, the sweeper transfers cleanly. No interim host churn.
- **GamePage hydrates from useWebSocket snapshot** rather than restructuring the listener placement. Smallest diff, matches the snapshot-as-source-of-truth pattern Plan 41-01 established.
- **joinLobby connected-same-name dedupe** is deliberately defense-in-depth — the client patch already eliminates the duplicate-self trigger; the server guard prevents any future regression from another emit path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Pre-existing test `should reject expired token` failed at 6min after TOKEN_EXPIRY widening**
- **Found during:** Initial Task 1 vitest run after the constant change.
- **Issue:** The test advanced timers by 6 minutes and asserted `validateReconnectToken` returned null. With the new 10-minute expiry the token is still valid at 6min.
- **Fix:** Updated the test to advance 11 minutes with a comment explaining the Phase 41-02 widening. The test still proves expiry rejection, just at the new boundary.
- **Files modified:** `server/domains/SessionManager.test.ts`
- **Committed in:** `fbf125c` (Task 1 commit)

**2. [Rule 2 — Missing critical] Pre-existing test `should return invalid_token for expired token even if grace period remains` no longer makes sense**
- **Found during:** Reviewing test coverage post-widening.
- **Issue:** The test asserted that token expiry beat grace (the bug we just fixed). Post-fix, it can no longer hold.
- **Fix:** Replaced with a positive test (`should accept token at 6min after disconnect (Phase 41-02 widened expiry)`) that proves the fix — token still valid at 6min where it would have been invalid pre-fix. Added a second player so the lobby is not destroyed when host disconnects.
- **Files modified:** `server/domains/SessionManager.test.ts`
- **Committed in:** `fbf125c` (Task 1 commit)

**3. [Rule 1 — Bug] Live repro Step 1 failed: duplicate self in roster after fresh lobby creation**
- **Found during:** Task 3 human verification (first attempt).
- **Issue:** The plan assumed Plan 41-01's client-side fixes had eliminated the duplicate-self vector. They had eliminated the *post-restart* vector but NOT the create_lobby → GamePage mount race. GamePage saw `currentLobby=null` and emitted `join_lobby`, which the server (with no dedupe for connected same-name players) accepted as a brand-new player.
- **Fix:** Three commits as documented above (`b8b969f` client snapshot-hydrate, `4191453` server joinLobby dedupe, `6777de9` disconnect log enrichment for diagnostics). Live repro re-verified by user.
- **Files modified:** `client/src/pages/GamePage.tsx`, `server/domains/SessionManager.ts`, `server/domains/SessionManager.test.ts`, `server/websocket.ts`
- **Verification:** Full suite 642/642; user-approved live repro Steps 1-2; Step 5 (6-min token-expiry wait) waived as covered by the `Phase 41-02: token expiry equals grace period` unit test.

### Scope adjustments

- Plan 41-02's `<files_modified>` boundary was server-only. The `client/src/pages/GamePage.tsx` change is technically out of that boundary, but the diagnosis pinned the duplicate-self race here, so the scope was extended explicitly during the post-checkpoint follow-up. Documented as Decision; accepted by user via approval message.

**Total deviations:** 3 auto-fixed (1 bug, 1 missing-critical, 1 architectural-but-approved-via-checkpoint).
**Impact on plan:** All deviations were correctness-preserving. The Step-1 failure surfaced a second root cause (the join race) the plan didn't anticipate; the three follow-up patches close it cleanly. Plan 41-02's stated goals (host preservation, token alignment) all shipped on the original commit.

## Live Repro Outcome

**Approved by user (2026-05-06).** Verification details from approval:

- **Step 1 (fresh lobby creation):** Pass after `b8b969f` + `4191453`. Single self in roster, host indicator on the correct player. (First attempt failed → diagnosis → patches → re-verified.)
- **Step 2 (post-server-restart):** Pass. Landed on /play with all three localStorage keys cleared. (Plan 41-01's client coherence guard handled cleanup; Plan 41-02's server changes did not regress it.)
- **Step 3-4:** Implicitly covered by Step 1 + Step 2 (no duplicate self, host preserved, three keys consistent or all cleared).
- **Step 5 (6-minute token-expiry wait):** Waived as covered by the `Phase 41-02: token expiry equals grace period` unit test (asserts `validateReconnectToken` is valid at 9min, invalid at 11min, and that `TOKEN_EXPIRY_TIME === DISCONNECT_GRACE_PERIOD`).

## ROADMAP Success Criteria — All Pass

1. **`scrum-monsters-current-lobby` (i.e., `last-lobby`) and `scrum-monsters-lobby-snapshot` always reference the same lobbyId; mismatched/stale snapshots are cleared on detection.** Plan 41-01 closed this via the atomic three-key session storage. Verified again in Step 2 (all three keys cleared together post-restart).
2. **Reconnecting to a lobby restores the original player — no duplicate self.** Closed by Plan 41-01 (post-restart vector) + `b8b969f` GamePage snapshot-hydrate (create_lobby vector) + `4191453` server joinLobby dedupe (defense in depth). Verified in Step 1 after follow-up patches.
3. **The original host retains `isHost: true` after reconnect within the grace window.** Closed by `fbf125c` (handlePlayerDisconnect now defers host transfer; attemptPlayerReconnect restores host). Covered by the new `host preserved across grace-period reconnect` and `interim host roll-back` tests.
4. **`reconnectToken` is invalidated and removed once it expires or the matching lobby/player is gone server-side; `TOKEN_EXPIRY_TIME` no longer fires before grace expiry.** Closed by `fbf125c` (TOKEN_EXPIRY_TIME widened to match DISCONNECT_GRACE_PERIOD). Covered by the new `token expiry equals grace period` test.
5. **Repro is a closed regression: stop dev server during an active lobby, restart, reload tab — single self in roster, host preserved, three localStorage keys consistent or all cleared.** Verified by the user in Steps 1-2.

## Issues Encountered

The duplicate-self bug had two root causes, not one. The plan and 41-RESEARCH.md identified the post-restart vector but did not anticipate the in-process create_lobby race. The diagnostic loop (Step 1 fail → log inspection → patch → re-verify) added ~10min to the wall-clock duration but produced a stronger fix: the GamePage snapshot-hydrate is structurally cleaner than the original auto-join logic, and the server joinLobby dedupe is defense in depth that closes any equivalent future regression.

The lint baseline has 12 pre-existing errors (verified by `git stash` round-trip on the same `npm run lint` invocation pre- and post-plan). All are in files this plan did not touch. Out of scope per execution rules.

## User Setup Required

None.

## Verification Commands

- `npx vitest run server/domains/SessionManager.test.ts` — 65 / 65 (was 64 after Task 1; 65 after the new joinLobby dedupe test landed)
- `npx vitest run` — 642 / 642
- `npm run check` — clean (no TypeScript errors)
- `npm run build` — clean (production build succeeded)
- `npm run lint` — 402 problems, 12 errors — ALL pre-existing, none in files modified by this plan

## Next Phase Readiness

**Phase 41 complete.** v5.0 unblocked from the reconnection regression. v5.0 phases 39, 40 (tutorial work) are next.

**Pointers for future work:**
- The dead-code reconnect handler in `gameState.ts:370-441` (RESEARCH line 82) remains untouched. With the corrected SessionManager path now battle-tested, a future cleanup phase could safely delete that legacy path.
- The `reconnectTokens` Map is still in-process memory. A server restart still wipes all in-flight tokens. Plan 41-01's client coherence guard handles this cleanly (clears all three keys), but a future Redis-backed token persistence would shorten the post-restart re-auth UX.
- The 30-second cadence on `sessionDisconnectSweeperInterval` is acceptable for v5.0 but could be tightened to ~5s if "host disconnected, X seconds remaining" UX becomes a feature (would require hooking the sweeper to a per-disconnect deadline rather than polling).

## Self-Check

Verified by listing files and confirming commit hashes:
- `server/domains/SessionManager.ts` — modified (Phase 41-02 changes present)
- `server/domains/SessionManager.test.ts` — modified (5 new tests + 2 updated)
- `server/websocket.ts` — modified (sessionDisconnectSweeper + log enrichment)
- `shared/gameEvents.ts` — modified (wasHost field on DisconnectedPlayer)
- `client/src/pages/GamePage.tsx` — modified (snapshot-hydrate short-circuit)
- Commits `fbf125c`, `b8b969f`, `4191453`, `6777de9` — present in `git log`
- Final test run: 642/642 pass; `npm run check` clean; `npm run build` clean.

## Self-Check: PASSED

---
*Phase: 41-reconnection-state-bugfix*
*Completed: 2026-05-06*
