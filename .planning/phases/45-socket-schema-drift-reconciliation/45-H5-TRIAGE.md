# H5 Dead-Listener Cluster — Triage

Verifies each event in section H5 of `45-RESEARCH.md` against current `client/src/` source. Re-grepped 2026-05-17 with `socket\.on\('<event>'` across `client/src/`. Server emit sites and EventBus fine-grained replacements re-confirmed.

For each event:
- **Server emit**: file:line
- **Schema decl**: `shared/gameEvents.ts:line`
- **Client listeners**: results of `grep socket.on('<event>'` in `client/src/`
- **Fine-grained replacement**: event name + handler file:line + emit file:line
- **Same code path?**: whether the replacement fires from the same server site as the legacy emit
- **Verdict** + **Rationale**

---

## SAFE_TO_DELETE

### `player_left`
- Server emit: `server/websocket.ts:692` (handler for client `leave_lobby`)
- Schema: `shared/gameEvents.ts:353`
- Client listeners: **0**
- Replacement: `session:player_left` — emitted via `server/domains/SessionManager.ts:394` (inside `removePlayer`, which `leave_lobby` invokes at line 680); handled in `client/src/lib/socket/eventHandlers.ts:58` (mutates `players[]` AND mirrors removal across `teams[*]`).
- Same code path: YES — `sessionManager.removePlayer(playerId)` runs immediately before the legacy emit and synchronously fires the fine-grained event via `eventBus`.
- Verdict: **SAFE_TO_DELETE**
- Rationale: superseded by `session:player_left` with a richer client handler.

### `player_disconnected`
- Server emit: `server/websocket.ts:2268` (grace-period path) and `2303` (fallback removal path)
- Schema: `shared/gameEvents.ts:372`
- Client listeners: **0**
- Replacement: roster mutation in fallback path goes through `sessionManager.removePlayer` → `session:player_left` (handled). Grace-period path keeps the player in lobby; UX for "player is disconnected but might reconnect" relies on `players[].isConnected` set elsewhere.
- Same code path: YES for the fallback (2303 → `removePlayer` already fires `session:player_left`).
- Verdict: **SAFE_TO_DELETE**
- Rationale: no client listener, no UX hook reads `player_disconnected`. The `isConnected` flag and `host_transferred` events carry the visible behavior. (If a "ghost dimming" effect ever existed for grace-period disconnects, it's already gone client-side.)

### `player_reconnected`
- Server emit: `server/websocket.ts:1686`
- Schema: `shared/gameEvents.ts:423`
- Client listeners: **0**
- Replacement: reconnecting client receives `lobby_sync` + `sendFullState` on the same code path (lines 1638-1643). Other players' clients receive nothing fine-grained, but they also don't render a "player reconnected" toast anywhere in `client/src/`.
- Same code path: YES.
- Verdict: **SAFE_TO_DELETE**
- Rationale: no UI consumes it. If a reconnection toast is desired, that's a new product feature, not a regression.

### `boss_defeated`
- Server emit: `server/websocket.ts:1016`, `1052`, `1317`
- Schema: `shared/gameEvents.ts:365`
- Client listeners: **0**
- Replacement: `combat:boss_defeated` — emitted from `server/domains/CombatManager.ts:589,681,1770`; handled in `client/src/lib/socket/eventHandlers.ts:513`. The accompanying `session:phase_changed` (battle → victory) is emitted around each of the three legacy sites in `websocket.ts` and handled in `eventHandlers.ts:102`, driving phase transition.
- Same code path: YES — `combat:boss_defeated` fires from `CombatManager` whenever boss hp hits 0; `session:phase_changed` fires from the same `websocket.ts` blocks as the legacy `boss_defeated` emit.
- Verdict: **SAFE_TO_DELETE**
- Rationale: dual coverage by fine-grained `combat:boss_defeated` + `session:phase_changed`.

### `game_over`
- Server emit: `server/websocket.ts:1115`, `1507`
- Schema: `shared/gameEvents.ts:367`
- Client listeners: **0**
- Replacement: `session:phase_changed` to `'game_over'`. Phase transitions to `game_over` are observed via the universal `session:phase_changed` handler at `eventHandlers.ts:102`. `GameOverPhase` is registered in `PhaseRegistry.tsx:74` and renders whenever `gamePhase === 'game_over'`.
- Same code path: PARTIAL — the two legacy emit sites do NOT also emit a phase_changed at the same line (line 1115 is inside `boss_damage_player`, line 1507 inside `attack_player`). However `gameState.bossDamagePlayer` / `gameState.attackPlayer` internally mutate `lobby.gamePhase = 'game_over'`, and other emit paths (e.g. when last player downs) drive `session:phase_changed`. **Worth verifying** during fix that a `session:phase_changed` actually fires when gameOver occurs via these specific paths.
- Verdict: **SAFE_TO_DELETE** (with a fix-phase verification: add a `session:phase_changed` emit at the two legacy `game_over` sites if not already covered by downstream events).
- Rationale: phase routing is now the canonical mechanism; the `lobby` payload on legacy `game_over` was unused.

### `score_submitted`
- Server emit: `server/websocket.ts:953`
- Schema: `shared/gameEvents.ts:355`
- Client listeners: **0**
- Replacement: `estimation:vote_cast` — emitted on the very next lines (960-964); handled in `eventHandlers.ts:300`. Comment at 955-959 explicitly states it replaces the legacy event.
- Same code path: YES (immediately adjacent emit).
- Verdict: **SAFE_TO_DELETE**
- Rationale: explicit replacement already wired and emitted from the same `submit_score` handler.

### `scores_revealed`
- Server emit: `server/websocket.ts:973`, `1292`, `1430`
- Schema: `shared/gameEvents.ts:356`
- Client listeners: **0**
- Replacement: `estimation:votes_revealed` — emitted per non-empty team at lines 980-991, 1434-1445; handled in `eventHandlers.ts:318`. Plus `session:phase_changed` (battle → reveal) at adjacent lines.
- Same code path: YES.
- Verdict: **SAFE_TO_DELETE**
- Rationale: explicit replacement with per-player score population (commented as solo-vote-stuck-discussion fix).

### `voting_timeout`
- Server emit: `server/gameState.ts:1396`
- Schema: `shared/gameEvents.ts:371`
- Client listeners: **0**
- Replacement: `session:phase_changed` (battle → reveal) fires at line 1403 in the same block.
- Same code path: YES.
- Verdict: **SAFE_TO_DELETE**
- Rationale: no client toast consumes the message; phase transition carries the user-visible effect. If we want a "voting time expired" toast back, that's a small new feature (`game_error`-style emit), not a regression.

### `modifier_updated`
- Server emit: `server/websocket.ts:1086`, `1502`
- Schema: `shared/gameEvents.ts:369`
- Client listeners: **0**
- Replacement: `combat:modifier_updated` — emitted from `server/domains/CombatManager.ts:753`; handled in `eventHandlers.ts:608`.
- Same code path: YES — `CombatManager.applyDamage` (the same call path triggered by `attack_boss` / `attack_player`) emits the fine-grained event.
- Verdict: **SAFE_TO_DELETE**
- Rationale: superseded by fine-grained event, both emitted on the same combat tick.

### `player_attacked`
- Server emit: `server/websocket.ts:1106` (boss-damages-player), `1493` (PvP from spectator)
- Schema: `shared/gameEvents.ts:382`
- Client listeners: **0**
- Replacement: `combat:player_damaged` — emitted from `server/domains/CombatManager.ts:1299`; handled in `eventHandlers.ts:528` (writes new hp + floating damage popup).
- Same code path: YES — comments at lines 1118 and 1510 ("Removed lobby_updated: combat:player_damaged event emitted by combatManager") confirm the design intent.
- Verdict: **SAFE_TO_DELETE**
- Rationale: handler-on-fine-grained is already canonical. Note C6 in 45-RESEARCH (`source` hardcoded `'boss'`) is a separate concern about payload fidelity but does not block deletion.

### `party_healed`
- Server emit: `server/websocket.ts:1522`
- Schema: `shared/gameEvents.ts:388`
- Client listeners: **0**
- Replacement: each healed player's HP update would normally come through `combat:player_damaged`-style events. **However**, `heal_party` calls `gameState.healParty(playerId)` which is not routed through `CombatManager.applyHeal` (no `combat:player_healed` fine-grained event exists in the schema; only `combat:boss_healed` for the spectator-heals-boss path). So there is currently no fine-grained replacement that emits per-player healed-amount; the per-player HP is `healedPlayers[i].newHealth` on the legacy payload only.
- Same code path: NO REPLACEMENT.
- Verdict: **NEEDS_PRODUCT_DECISION**
- Rationale: Cleric special-ability healing has no client-visible feedback today (legacy unhandled, no fine-grained equivalent emitted). Either Cleric heal-party is an intentionally-server-only HP buff with no UI flourish (then delete the emit), or its floating-heal popups were never wired (then add `combat:player_healed` schema + emit + handler). User decision.

### `youtube_stop_synced`
- Server emit: `server/websocket.ts:1354`
- Schema: `shared/gameEvents.ts:376`
- Client listeners: **0**
- Replacement: none.
- Same code path: N/A.
- Verdict: **BROKEN_FEATURE** (see `youtube_play_synced` group below — they're a pair; placing here separately for table clarity but the verdict is the same).

### `player_state_updated`
- Server emit: **NONE** (grep across `server/` returns only schema decl + planning docs).
- Schema: `shared/gameEvents.ts:378-381`
- Client listeners: **0**
- Replacement: irrelevant — already dead in both directions.
- Verdict: **SAFE_TO_DELETE**
- Rationale: zero producers, zero consumers. Delete schema entry.

---

## BROKEN_FEATURE

### `revive_complete`, `revive_progress`, `revive_cancelled` (revival cluster)
- Server emit: `revive_complete` `websocket.ts:234` (watchdog interval), `revive_progress` `websocket.ts:1537` (initial 0% on `revive_start`), `revive_cancelled` `websocket.ts:1550,1565`
- Schema: `shared/gameEvents.ts:392-398`
- Client listeners: **0** for all three (no `socket.on('revive_*')` anywhere; also no `socket.on('combat:revival_*')` in `client/src/`).
- Fine-grained replacements declared: `combat:revival_started`, `combat:revival_cancelled`, `combat:player_revived`. Emitted from `CombatManager.ts:1524,1611,1640`. **Bridged to wire by `ClientEventEmitter.ts:262-273` (`revival_started` + `revival_cancelled`) and the `player_revived` bridge near line 254.** BUT only `combat:player_revived` has a client handler (`eventHandlers.ts:584`). NO handler exists for `combat:revival_started` or `combat:revival_cancelled`.
- `combat:revival_progress` — **does not exist in the schema, never emitted, never bridged.** The legacy `revive_progress` only fires once at 0% (`websocket.ts:1537`), never on tick — so even the legacy path was never driving a continuous progress bar; it was at best a "you started a revive" pulse.
- Same code path: PARTIAL — `combat:revival_started` fires from `CombatManager` whenever a revive begins; the legacy `revive_progress` emit at 1537 fires from `websocket.ts` on the `revive_start` handler. They cover the same trigger.
- Verdict: **BROKEN_FEATURE**
- Rationale: The reviver-pulse UX for OTHER players (showing "X is reviving Y", progress ring, cancellation flash) has zero client surface today. The local reviver gets no feedback either (no progress event was ever continuous on the legacy path). At minimum, `combat:revival_started` and `combat:revival_cancelled` need client handlers — `combat:player_revived` already mutates HP but doesn't render a "revived!" flourish. If a true progress bar is wanted, a new `combat:revival_progress` event needs to be added to schema + emit (server side, in the revival tick path inside CombatManager) + handler. Phase-scope minimum: wire handlers for the two existing fine-grained events; flag progress-bar as out of scope unless user wants it.

### `youtube_play_synced`, `youtube_stop_synced`
- Server emit: `websocket.ts:1336` and `:1354`
- Schema: `shared/gameEvents.ts:375,376`
- Client listeners: **0** (`BossMusicControls.tsx` only EMITS `youtube_play`/`youtube_stop`; `YoutubeAudioPlayer.tsx` manages local player state but never listens for sync events).
- Replacement: none — there is no fine-grained or alternate event for this.
- Same code path: N/A.
- Verdict: **BROKEN_FEATURE**
- Rationale: Host-synchronized boss music is the only purpose of these emits. With no listener, non-host clients never receive the sync — the host's YouTube play/stop is silently local-only. This is a regression vs the intended UX (multi-player synchronized boss soundtrack). Fix: wire `socket.on('youtube_play_synced', …)` and `socket.on('youtube_stop_synced', …)` in `YoutubeAudioPlayer.tsx` (or a sibling effect) to drive `useAudio` setters. Until then, the host-only audio is the only behavior.

---

## NEEDS_PRODUCT_DECISION

### `party_healed` (Cleric heal-party feedback)
- See entry above under SAFE_TO_DELETE/NEEDS_PRODUCT_DECISION dual-listing. The emit fires server-side, no client handler exists, AND no fine-grained `combat:player_healed` event exists in the schema for the heal-party path. Decision needed: (a) delete the emit, accept silent HP buffs; or (b) add `combat:player_healed` (schema + emit from CombatManager + handler with floating-heal popup). The latter brings parity with the floating damage UI.

---

## Summary

| Verdict | Count | Events |
|---|---|---|
| SAFE_TO_DELETE | 11 | `player_left`, `player_disconnected`, `player_reconnected`, `boss_defeated`, `game_over`, `score_submitted`, `scores_revealed`, `voting_timeout`, `modifier_updated`, `player_attacked`, `player_state_updated` |
| BROKEN_FEATURE | 2 (clusters) | revival cluster (`revive_complete`/`revive_progress`/`revive_cancelled`), YouTube sync (`youtube_play_synced`/`youtube_stop_synced`) |
| NEEDS_PRODUCT_DECISION | 1 | `party_healed` (Cleric heal-party feedback) |
| Not in H5 — verified handled | 1 | `battle_emote` — `BattleScreen.tsx:208` `socket.on('battle_emote', handleBattleEmote)` IS wired. KEEP. |

### Action required this phase (BROKEN_FEATURE)
1. **Revival cluster**: add client handlers for `combat:revival_started` and `combat:revival_cancelled` in `eventHandlers.ts` to drive a reviver-UI flash/pulse for non-self viewers. Decide whether to introduce `combat:revival_progress` (new event) for a true progress bar, or leave the visual as start-pulse + completion-flash.
2. **YouTube sync**: wire `socket.on('youtube_play_synced', …)` and `socket.on('youtube_stop_synced', …)` in the audio layer (likely `YoutubeAudioPlayer.tsx` or `BossMusicControls.tsx`) so non-host clients hear the host's selected boss music.

### Decision needed from user (NEEDS_PRODUCT_DECISION)
1. **`party_healed`** — should the Cleric's heal-party special show floating-heal popups (= add `combat:player_healed` event + handler), or is silent server-side HP restoration the intended UX (= delete the emit)?

### Additional notes
- `combat:revival_progress` does NOT exist anywhere in `shared/gameEvents.ts`. The legacy `revive_progress` was only ever fired once at 0% — calling it a "progress bar driver" overstates what shipped. A true progress UI is a new feature, not a regression to restore.
- The legacy `game_over` emit at `websocket.ts:1115,1507` is on a code path where I did NOT see an adjacent `session:phase_changed`. Even though deletion is safe (the lobby payload was unused), the fix PR should verify `session:phase_changed` to `'game_over'` actually fires on those two paths, or add it.
