# Phase 45-03 — Deleted Wire Traffic Audit Trail

Per-event record of what was removed and where the equivalent signal lives now. Grep against this file when investigating regressions: if you're looking for an event that "should be firing" and isn't, check whether it was deleted here and what replaced it.

Verified 2026-05-17 against `client/src/` with `grep "socket\.on('<event>'"` — every event below has **zero** client listeners.

---

## Pre-fix (added before deletions)

### `session:phase_changed` from `gameState.attackPlayer` / `gameState.bossDamagePlayer`

The legacy `game_over` emit (deleted below) was the only client signal that the game ended via player attrition. The two `gameState` methods mutated `lobby.gamePhase = 'game_over'` but never emitted `session:phase_changed`. Added the emit inline next to each mutation, with the new phase derived from the pre-mutation value.

Files: `server/gameState.ts:1000-1010`, `1097-1107` (approximate).

---

## H5 — SAFE_TO_DELETE (11 events)

All verified to have a working fine-grained replacement firing from the same code path.

| Event | Schema entry removed | Server emit(s) removed | Fine-grained replacement | Replacement handler |
|---|---|---|---|---|
| `player_left` | `gameEvents.ts:372` | `websocket.ts:692` | `session:player_left` from `SessionManager.removePlayer` | `eventHandlers.ts:58` |
| `player_disconnected` | `gameEvents.ts:391` | `websocket.ts:2268`, `2303` | `session:player_left` (fallback path); `players[].isConnected` flag (grace path) | `eventHandlers.ts:58` |
| `player_reconnected` | `gameEvents.ts:431` | `websocket.ts:1686` | `lobby_sync` to the reconnecting client (already wired); peers receive no fine-grained signal (no toast UX consumed legacy) | — |
| `boss_defeated` | `gameEvents.ts:384` | `websocket.ts:1016`, `1052`, `1317` | `combat:boss_defeated` from `CombatManager` + `session:phase_changed` (battle→victory) | `eventHandlers.ts:513`, `:102` |
| `game_over` | `gameEvents.ts:386` | `websocket.ts:1115`, `1507` | `session:phase_changed` to `'game_over'` — **added in pre-fix** above | `eventHandlers.ts:102` |
| `score_submitted` | `gameEvents.ts:374` | `websocket.ts:953` | `estimation:vote_cast` emitted immediately after | `eventHandlers.ts:300` |
| `scores_revealed` | `gameEvents.ts:375` | `websocket.ts:973`, `1292`, `1430` | `estimation:votes_revealed` per non-empty team (populates per-player `currentScore`) + `session:phase_changed` (battle→reveal) | `eventHandlers.ts:318`, `:102` |
| `voting_timeout` | `gameEvents.ts:390` | `gameState.ts:1396` | `session:phase_changed` (battle→reveal) emitted immediately after | `eventHandlers.ts:102` |
| `modifier_updated` | `gameEvents.ts:388` | `websocket.ts:1086`, `1502` | `combat:modifier_updated` from `CombatManager.applyDamage` | `eventHandlers.ts:608` |
| `player_attacked` | `gameEvents.ts:401-406` | `websocket.ts:1106`, `1493` | `combat:player_damaged` from `CombatManager.applyDamage` | `eventHandlers.ts:528` |
| `player_state_updated` | `gameEvents.ts:397-400` | (no emit existed) | — | dead in both directions |

---

## H1 — Legacy `as any` emit family (7 emits, 6 distinct events)

All were emitted with an `as any` cast because no schema entry existed. None had client listeners. Replacements exist as `estimation:*` fine-grained events; some have full handler coverage, some are partially wired and flagged for Phase 45-05.

| Event | Server emit removed | Fine-grained replacement | Bridged? | Handler? |
|---|---|---|---|---|
| `estimation_started` | `websocket.ts:1775` | `estimation:vote_cast` (fires on first vote) | Yes | Yes (`eventHandlers.ts:300`) |
| `vote_state_updated` × 3 | `websocket.ts:1815`, `1860`, `2037` | `estimation:vote_cast` / `estimation:vote_changed` / `estimation:discussion_started` depending on call site | Mixed — `vote_changed` NOT bridged; `discussion_started` bridge removed (H3) | Mixed — handler exists for `vote_cast` only |
| `timer_paused` | `websocket.ts:1898` | `estimation:timer_paused` from `EstimationManager.pauseTimer` | Yes | Yes (`eventHandlers.ts:379`) |
| `timer_resumed` | `websocket.ts:1929` | `estimation:timer_resumed` from `EstimationManager.resumeTimer` | Yes | Yes (`eventHandlers.ts:398`) |
| `timer_extended` | `websocket.ts:1961` | `estimation:timer_extended` from `EstimationManager.extendTimer` | **NOT bridged** | **NO handler** — flagged for 45-05 |
| `estimate_forced` | `websocket.ts:1992` | `estimation:estimate_forced` from `EstimationManager.forceEstimate` | Yes | **NO handler** — flagged for 45-05 |

**Already-broken UX notes**: `timer_extended` and `estimate_forced` were silent at both the legacy `as any` path AND the fine-grained path before this plan. Deletion does not regress them; 45-05 should wire the missing bridge/handler if those UX behaviors are needed.

---

## H2 — `consensus_countdown_update`

- Server emit removed: `gameState.ts:1730` (inside private `emitConsensusCountdownUpdate` method, also removed)
- Schema entry: never existed
- Client listener: 0
- Internal state retained: `lobby.consensusCountdown` is still tracked server-side for the auto-advance timer. Just nothing reaches clients.
- Future: if a "X seconds until auto-advance" UI is desired, add a dedicated fine-grained event then.

---

## H3 — `estimation:discussion_started` bridge

- Bridge removed: `ClientEventEmitter.ts:167-173`
- Schema entry: never existed
- Client listener: 0
- Internal `eventBus` emit retained: `EstimationManager.ts:715` still emits the internal event for cross-domain coordination (e.g. `CombatManager` listens via `cleric:discussion_started` handler).
- Test updated: `ClientEventEmitter.test.ts` "emits discussion_started without vote values (placeholder)" rewritten to assert the bridge does NOT fire.

---

## H9 — Dead `session:player_reconnected` type

- Type definition removed: `clientEvents.ts:37-40` (`SessionPlayerReconnectedEvent`)
- Map entry removed: `clientEvents.ts:218` (`'session:player_reconnected'` in `ClientEventMap`)
- Schema: never existed in `ServerToClientEvents` (was only in `clientEvents.ts`)
- Emit site: none anywhere
- Listener: none anywhere
- Fully dead in both directions before this plan.

---

## Out of scope (NOT deleted in this plan)

- `party_healed` — Phase 45-04 replaces with new `combat:player_healed` event + floating-heal popup. Legacy emit stays until then.
- `revive_complete`, `revive_progress`, `revive_cancelled` — Phase 45-04 wires the existing `combat:revival_started` / `combat:revival_cancelled` handlers and adds a new `combat:revival_progress` event. Legacy emits stay until then.
- `youtube_play_synced`, `youtube_stop_synced` — Phase 45-04 wires listeners on the client. Legacy emits stay (they ARE the canonical signal; just no handler existed).

---

## Verification

- `npm run check` — clean
- `npm run lint` — clean (one transient `updatedLobby` unused-var fixed inline by switching to a statement-form call)
- `npm test` — 743/743 pass
- `grep "socket\.on('<event>'" client/src/` returns zero matches for every deleted event listed above
