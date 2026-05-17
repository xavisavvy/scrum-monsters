# Socket Schema Drift Inventory

Audit of `shared/gameEvents.ts` (`ServerToClientEvents` / `ClientToServerEvents`) vs actual server emits and client handlers as of 2026-05-16. Goal: enumerate every mismatch so a typed `Socket<ServerToClientEvents, ClientToServerEvents>` will compile and runtime behavior stays correct.

Scope notes:
- "Schema" = `shared/gameEvents.ts` typed signature
- "Zod" = `shared/socket-schemas.ts` runtime validator (only covers C→S subset)
- `clientEvents.ts` declares duplicate (mostly stricter) typing for fine-grained events — drift between `clientEvents.ts` and `gameEvents.ts` flagged as a secondary concern at the end.
- Tests, `.bak` files, and `combat:battle_complete`-style **internal** eventBus events (server-only, never bridged) are not counted as drift.

Severity:
1. **Critical** — handler reads field that's `undefined` at runtime → silent bug.
2. **High** — schema lies / event exists with no producer or no consumer → blocks typed socket, dead code.
3. **Low** — cosmetic (optional vs required, unused payload field, comment-only).

---

## CRITICAL — Handler reads undefined at runtime

### C1. `combat:boss_healed` — `newHealth` vs `newHp`
- **Direction**: S→C
- **Schema** (`shared/gameEvents.ts:463`): `{ healAmount: number; newHp: number; ... }`
- **Server emit** (`server/events/ClientEventEmitter.ts:201-206`): sends `{ healAmount, newHp: payload.bossHealth }`
- **Client handler** (`client/src/lib/socket/eventHandlers.ts:505,508`): reads **`data.newHealth`** (does not exist) → boss HP is set to `undefined`.
- **Drift**: `field-renamed`
- **Impact**: When a spectator heals the boss, the client overwrites `currentBoss.currentHealth` with `undefined`, breaking the boss HP bar until next damage event. (`combat:boss_damaged` handler on line 491 already defensively reads `data.newHp ?? data.newHealth` — same drift was caught there.)
- **Fix**: handler → `data.newHp` (one-word edit).

### C2. `estimation:timer_started` — handler reads non-existent `startedAt`
- **Direction**: S→C
- **Schema** (`shared/gameEvents.ts:451`): `{ team, endsAt, durationMs, seq, timestamp }`
- **Server emit** (`server/events/ClientEventEmitter.ts:130-136`): `{ team, endsAt: payload.startedAt + payload.durationMs, durationMs }` — no `startedAt`.
- **Client handler** (`client/src/lib/socket/eventHandlers.ts:357-376`): builds `TimerState` with `startedAt: data.startedAt` (undefined), `durationMs: data.durationMs` (OK).
- **Drift**: `field-missing-in-emit` (or handler reading wrong field; schema is the contract).
- **Impact**: `currentTimer.startedAt` becomes `undefined` → any countdown UI computing `Date.now() - startedAt` produces `NaN`. Possibly silently masked because most timer UIs read `endsAt` from elsewhere; needs verification.
- **Fix**: handler should derive `startedAt = data.endsAt - data.durationMs` OR add `startedAt` to emit + schema.

### C3. `estimation:timer_resumed` — handler reads non-existent `startedAt` and `durationMs`
- **Direction**: S→C
- **Schema** (`shared/gameEvents.ts:453`): `{ team, endsAt, seq, timestamp }` — only `endsAt`.
- **Server emit** (`server/events/ClientEventEmitter.ts:145-150`): `{ team, endsAt: Date.now() + payload.remainingMs }`.
- **Client handler** (`client/src/lib/socket/eventHandlers.ts:397-415`): builds `TimerState` with `startedAt: data.startedAt`, `durationMs: data.durationMs` (BOTH undefined).
- **Drift**: `field-missing-in-emit`
- **Impact**: After pause→resume, `currentTimer` is `{ startedAt: undefined, durationMs: undefined, isActive: true }`. Any subsequent expiry calculation breaks.
- **Fix**: Recompute on client from `data.endsAt`, or extend schema/emit to include `startedAt`/`durationMs`.

### C4. `boss_ring_attack` — whole shape mismatch
- **Direction**: S→C
- **Schema** (`shared/gameEvents.ts:399-410`): `{ bossX, bossY, projectiles: [{ id, x, y, targetX, targetY, emoji }] }`
- **Server emit** (`server/websocket.ts:1091` + `server/gameState.ts:1857-1861`): `{ type: 'ring', projectiles: [{ id, startX, startY, targetX, targetY, progress, emoji }], targetCount }` — **no `bossX`/`bossY`/`x`/`y` fields**; projectiles use `startX`/`startY` instead.
- **Client handler** (`client/src/components/game/PlayerController.tsx:284-306`): reads `proj.startX`, `proj.startY`, `proj.targetX`, `proj.targetY`, `proj.emoji`, `proj.id`. Currently works **because handler is typed `any`** (see in-code comment lines 279-283).
- **Drift**: `shape-mismatch` (schema is entirely fictional vs emit+handler reality)
- **Impact**: Currently functional because handler and emitter agree and bypass typing. Will fail compilation when socket is strongly typed.
- **Fix**: rewrite schema to match emit shape; mark `bossX`/`bossY` removal (handler infers boss position from `startX`/`startY`).

### C5. `combat:player_revived` — hardcoded `newHp: 50` regardless of actual HP
- **Direction**: S→C
- **Schema** (`shared/gameEvents.ts:470`): `{ playerId, reviverId, newHp, seq, timestamp }` — generic number.
- **Server emit** (`server/events/ClientEventEmitter.ts:254-260`): **literally hardcoded `newHp: 50`**, ignoring the actual revived HP from `payload`. Comment says "Standard revive HP amount".
- **Client handler** (`client/src/lib/socket/eventHandlers.ts:584-606`): writes `hp: data.newHp` (=50) into `playerCombatStates`.
- **Drift**: `field-missing-in-emit` (the actual computed HP is dropped on the bridge)
- **Impact**: If `CombatManager` ever revives to anything other than 50 (different class, future buff, item), the client HP will diverge from server until next damage tick. May already be subtly wrong depending on max-HP variations across classes.
- **Fix**: thread actual `newHp` through the internal `combat:player_revived` payload; remove hardcode.

### C6. `combat:player_damaged` — handler relies on `data.seq` for unique key, schema says required
- **Direction**: S→C (low confidence — likely fine, flagged for review)
- **Schema** (`shared/gameEvents.ts:468`): `{ playerId, damage, newHp, source, seq, timestamp }` — all required.
- **Server emit** (`server/events/ClientEventEmitter.ts:238-245`): hardcodes `source: 'boss'` regardless of actual source. Comment: "Default source if not provided". `payload.source` from CombatManager is ignored.
- **Client handler** (`client/src/lib/socket/eventHandlers.ts:528-560`): uses `data.seq ?? Date.now()` for floating-damage popup id.
- **Drift**: `field-missing-in-emit` for `source`
- **Impact**: Any future UI that styles boss-damage vs player-damage (PvP) differently will be wrong — all damage is labeled `'boss'`.
- **Fix**: pass actual source through CombatManager → bridge → emit.

---

## HIGH — Schema lies / dead emit / dead listener (technical debt, blocks typed socket)

### H1. Server emits using `as any` to bypass schema — entire family
- **Direction**: S→C
- **Affected emits** in `server/websocket.ts`:
  - `1775`: `'estimation_started' as any` `{ ticketId }`
  - `1815,1860,2037`: `'vote_state_updated' as any` (visibility object)
  - `1898`: `'timer_paused' as any` `{ team }`
  - `1929`: `'timer_resumed' as any` `{ team }`
  - `1961`: `'timer_extended' as any` `{ team, additionalSeconds }`
  - `1992`: `'estimate_forced' as any` `{ team, consensusValue }`
- **Schema**: none declared for any of these.
- **Client handler**: **NONE** (grep verified — no `socket.on('estimation_started'…)` etc. anywhere in `client/src/`).
- **Drift**: `field-missing-in-schema` AND **dead emits — nothing listens**.
- **Impact**: Wire traffic with zero consumers. Removing them is safe (covered by sibling fine-grained `estimation:*` events that ARE handled).
- **Fix**: delete these emits entirely. They're vestigial from the pre-fine-grained-event era.

### H2. `consensus_countdown_update` emitted, schema undeclared, no listener
- **Direction**: S→C
- **Server emit** (`server/gameState.ts:1718`): `this.io.to(lobbyId).emit('consensus_countdown_update', { countdown })`
- **Schema**: not in `ServerToClientEvents`.
- **Client handler**: NONE.
- **Drift**: `field-missing-in-schema` + dead emit.
- **Fix**: delete emit, or define schema + add handler if countdown UI is intended.

### H3. `estimation:discussion_started` bridged but undeclared and unhandled
- **Direction**: S→C
- **Server emit** (`server/events/ClientEventEmitter.ts:167-173`): emits `'estimation:discussion_started'` with `{ team }`.
- **Schema**: not in `ServerToClientEvents` (`estimation:discussion_timer_started` IS, but that's different).
- **Client handler**: NONE.
- **Drift**: `field-missing-in-schema` + dead emit.
- **Fix**: delete bridge or wire up a handler.

### H4. Legacy `boss_attacked` schema field-rename risk
- **Direction**: S→C
- **Schema** (`shared/gameEvents.ts:360`): `{ playerId, damage, bossHealth }`
- **Server emit** (`server/websocket.ts:1073`): `{ playerId, damage, bossHealth }` ✅
- **Client handler** (`client/src/pages/GamePage.tsx:227`): destructures `bossHealth` ✅
- **Drift**: NONE on this one — the prompt's example (`newHp` vs `newHealth`) is actually accurate for **`combat:boss_healed`** (C1), not for the legacy `boss_attacked`. Calling it out so it doesn't get "fixed" by accident.
- **Action**: leave as-is. Co-existence: BOTH the legacy `boss_attacked` (handled in GamePage) AND the fine-grained `combat:boss_damaged` (handled in eventHandlers.ts) fire on every boss hit. Worth tracking as duplication (Low item L4).

### H5. Legacy schema events with no client listeners
The following declared `ServerToClientEvents` are emitted by server but **no client `socket.on` listens** (grep verified):
- `score_submitted` (`gameEvents.ts:355`, emit `websocket.ts:953`)
- `scores_revealed` (`gameEvents.ts:356`, emit `websocket.ts:973,1292,1430`)
- `voting_timeout` (`gameEvents.ts:371`, emit `gameState.ts:1396`)
- `modifier_updated` (`gameEvents.ts:369`, emit `websocket.ts:1086,1502`)
- `player_attacked` (`gameEvents.ts:382-387`, emit `websocket.ts:1106,1493`)
- `party_healed` (`gameEvents.ts:388-391`, emit `websocket.ts:1522`)
- `revive_complete` (`gameEvents.ts:397`, emit `websocket.ts:234`)
- `revive_progress` (`gameEvents.ts:392-396`, emit `websocket.ts:1537`)
- `revive_cancelled` (`gameEvents.ts:398`, emit `websocket.ts:1550,1565`)
- `player_disconnected` (`gameEvents.ts:372`, emit `websocket.ts:2268,2303`)
- `player_reconnected` (`gameEvents.ts:423`, emit `websocket.ts:1686`)
- `player_left` (`gameEvents.ts:353`, emit `websocket.ts:692`)
- `boss_defeated` (`gameEvents.ts:365`, emit `websocket.ts:1016,1052,1317`)
- `game_over` (`gameEvents.ts:367`, emit `websocket.ts:1115,1507`)
- `youtube_play_synced` (`gameEvents.ts:375`, emit `websocket.ts:1336`)
- `youtube_stop_synced` (`gameEvents.ts:376`, emit `websocket.ts:1354`)
- `battle_emote` (`gameEvents.ts:346-351`, emit `websocket.ts:872`) — Lobby.tsx + BattleScreen `socket.on('battle_emote'…)` DOES handle it via the in-file handler (verify; not in grep results); reconfirm.
- `player_state_updated` (`gameEvents.ts:378-381`, no emit site found, no handler) — likely dead in both directions.
- **Drift**: `field-missing-in-schema`? No — schema declares them; **producers exist, consumers gone**. Reverse drift: emit-without-listen.
- **Impact**: Wire bandwidth waste. Many were superseded by fine-grained events (e.g. `combat:player_revived`, `combat:player_damaged`, `combat:modifier_updated`, `session:player_left`). State updates DO happen via fine-grained paths, so behavior is OK. But typed socket compile is fine because schemas exist.
- **Fix**: per-event decision. Most can be deleted (post-Phase-42 cleanup). Some (e.g. `youtube_play_synced`) need a handler added; verify whether YouTube sync is currently broken.

### H6. `consensus_countdown` field on `Lobby` but no event to populate it
- Lobby type declares `consensusCountdown` (`gameEvents.ts:76-80`); only path that would update client-side state went away with `lobby_updated`. The `consensus_countdown_update` emit (H2) is unscoped and unhandled. Likely real UX regression hidden here.

### H7. `combat:boss_telegraph` schema vs emit — `attackType` typing
- **Schema** (`gameEvents.ts:465`): `attackType?: string` (any string).
- **Alt schema** (`clientEvents.ts:136`): `attackType?: 'light' | 'heavy' | 'special'` (strict union).
- **Server emit** (`ClientEventEmitter.ts:223-232`): forwards `payload.attackType` as-is from `CombatManager` (where it's a string).
- **Client handler** (`eventHandlers.ts:688`): forwards to `setTelegraph({ attackType: data.attackType })`.
- **Drift**: `clientEvents.ts` and `gameEvents.ts` disagree (the former is stricter). Two sources of truth for the same event.
- **Fix**: dedupe — pick one canonical event type module.

### H8. `combat:revival_started` / `combat:revival_cancelled` — schema duplicates legacy `revive_*`
- Both paths exist but only one is listened to (`combat:revival_*` via `eventHandlers.ts` — actually NEITHER is in `eventHandlers.ts` — verify). The legacy `revive_complete` / `revive_progress` / `revive_cancelled` emits have no client listener (H5). Result: revival UI may be entirely broken for non-self viewers.

### H9. `'session:player_reconnected'` declared in `clientEvents.ts` only
- Declared in `clientEvents.ts:37-40` but **not** in `ServerToClientEvents` and not emitted anywhere.
- **Drift**: dead type. Server uses legacy `player_reconnected` (no `session:` prefix) at `websocket.ts:1686`.
- **Fix**: remove from `clientEvents.ts`.

---

## LOW — Cosmetic / housekeeping

### L1. `clientEvents.ts` ⇄ `gameEvents.ts` duplication
- Many fine-grained events are typed in BOTH files with subtle differences (`attackType` strict-vs-string, missing `bossType`, etc.). Code imports from `gameEvents.ts` in handlers but `clientEvents.ts` is still exported. Pick one source of truth and delete the other (likely keep `gameEvents.ts`; it's wired into the socket type slot).

### L2. `socket-schemas.ts` Zod coverage gaps
- Zod registry (`ClientEventSchemas`, lines 637-670) is missing schemas for:
  - `update_lobby_name`
  - `leave_lobby`
  - `start_battle`
  - `restart_game`
  - `abandon_quest`
  - `force_reveal`
  - `youtube_stop`
  - `heal_party`
  - `player_charge`
  - `battle_emote`
  - `return_to_lobby`
  - `update_estimation_settings`
  - `use_ability`
  - `use_item`
- **Impact**: middleware-based runtime validation only covers a subset; the rest go through untyped. Low priority because schema types still check at compile time.

### L3. `game_error` schema permissive vs zod strict
- Schema (`gameEvents.ts:370`): `{ message, code?, tiedValues? }`
- Zod (`socket-schemas.ts:451`): `{ message }` only — no `code` or `tiedValues`.
- **Impact**: outbound validation would reject valid payloads if used. Bring Zod in sync.

### L4. `boss_attacked` + `combat:boss_damaged` duplication
- Both fire on every attack. Both update boss HP on client (GamePage handler + eventHandlers handler). State sets are idempotent so no race, but it's wasteful.
- **Fix**: pick fine-grained as canonical, remove legacy emit + handler.

### L5. `boss_healed` + (implicit) `combat:boss_healed` duplication
- Same as L4 — both legacy `boss_healed` (handled by GamePage) and fine-grained `combat:boss_healed` (handled by eventHandlers but BROKEN — see C1) fire on heal.
- After fixing C1 this becomes pure duplication.

### L6. `select_avatar` → server emits BOTH `avatar_selected` and `session:avatar_selected`
- `server/websocket.ts:538` and `547`. Schema declares both. GamePage handles legacy, eventHandlers handles fine-grained. Pure duplication.
- **Fix**: keep `session:avatar_selected`, remove legacy.

### L7. `lobby_player_charge` schema requires `chargePower: number`, but C→S `player_charge` makes it optional
- **C→S schema** (`gameEvents.ts:303`): `{ isCharging, chargePower?: number }` — optional.
- **S→C schema** (`gameEvents.ts:339`): `{ playerId, isCharging, chargePower: number }` — required.
- **Server bridge** (`websocket.ts:785` area): forwards whatever client sent.
- **Impact**: if a client sends `{ isCharging: false }` (no power), the broadcast violates its own schema.
- **Fix**: align — make `chargePower` optional on broadcast.

### L8. `start_battle` is declared as `() => void` in `ClientToServerEvents` but no Zod entry
- Same for `restart_game`, `leave_lobby`, `abandon_quest`, `force_reveal`, `heal_party`, `youtube_stop`, `return_to_lobby` — all parameterless. Low priority.

### L9. `request_missed_events` emitted with `as any` cast
- `useEventSync.ts:96`: `socket.emit('request_missed_events' as any, { lastSeq })`. Schema actually exists; cast is unnecessary.
- **Fix**: drop cast.

### L10. `'session:tickets_updated' | 'session:player_ready_changed' | 'session:lobby_renamed' | 'session:settings_updated' | 'session:game_reset' | 'session:ticket_advanced' | 'estimation:discussion_vote_updated'`
- All present in `ServerToClientEvents` and handled in `eventHandlers.ts`. **Need to verify** server actually emits each — many phase-42-02b emit sites live in `gameState.ts`/`EstimationManager.ts` and could be missing. Sample grep didn't surface explicit emit sites; recommend audit during fix phase.

### L11. `'system:full_state'` listener doesn't pass `seq` correctly
- `eventHandlers.ts:813-819`: calls `handleFullStateRefresh(data.lobby, data.seq)` then `setLobby(data.lobby)`. Fine. `system:missed_events` (line 821) reads `data.events` — schema matches. OK.

### L12. `progression:xp_awarded` handler reads `data.timestamp || Date.now()` — schema declares timestamp as required
- Defensive fallback even though schema guarantees presence. Pure cosmetic.

---

## Summary Table

| Event | Drift kind | Severity | Files |
|---|---|---|---|
| `combat:boss_healed` | field-renamed (`newHp` vs `newHealth`) | Critical | ClientEventEmitter.ts, eventHandlers.ts |
| `estimation:timer_started` | field-missing-in-emit (`startedAt`) | Critical | ClientEventEmitter.ts, eventHandlers.ts |
| `estimation:timer_resumed` | field-missing-in-emit (`startedAt`, `durationMs`) | Critical | ClientEventEmitter.ts, eventHandlers.ts |
| `boss_ring_attack` | shape-mismatch | Critical | gameEvents.ts, gameState.ts, PlayerController.tsx |
| `combat:player_revived` | field-missing-in-emit (hardcoded `newHp: 50`) | Critical | ClientEventEmitter.ts |
| `combat:player_damaged` | field-missing-in-emit (hardcoded `source: 'boss'`) | Critical | ClientEventEmitter.ts |
| `estimation_started` / `vote_state_updated` / `timer_paused` / `timer_resumed` / `timer_extended` / `estimate_forced` (`as any` family) | field-missing-in-schema + dead emit | High | websocket.ts |
| `consensus_countdown_update` | field-missing-in-schema + dead emit | High | gameState.ts |
| `estimation:discussion_started` | field-missing-in-schema + dead emit | High | ClientEventEmitter.ts |
| `score_submitted`, `scores_revealed`, `voting_timeout`, `modifier_updated`, `player_attacked`, `party_healed`, `revive_complete`, `revive_progress`, `revive_cancelled`, `player_disconnected`, `player_reconnected`, `player_left`, `boss_defeated`, `game_over`, `youtube_play_synced`, `youtube_stop_synced`, `player_state_updated` | emit-without-listen (dead consumer) | High | websocket.ts, gameState.ts |
| `combat:boss_telegraph` `attackType` | shape-mismatch between gameEvents/clientEvents | High | gameEvents.ts, clientEvents.ts |
| `session:player_reconnected` | dead-type | High | clientEvents.ts |
| `clientEvents.ts` ⇄ `gameEvents.ts` duplication | duplicate-source-of-truth | Low | clientEvents.ts |
| Zod registry gaps | coverage gap | Low | socket-schemas.ts |
| `game_error` Zod missing `code`/`tiedValues` | optional-vs-required | Low | socket-schemas.ts |
| `boss_attacked` + `combat:boss_damaged` dual emit | duplicate-emit | Low | websocket.ts |
| `boss_healed` + `combat:boss_healed` dual emit | duplicate-emit | Low | websocket.ts, ClientEventEmitter.ts |
| `avatar_selected` + `session:avatar_selected` dual emit | duplicate-emit | Low | websocket.ts |
| `lobby_player_charge` `chargePower` required on broadcast | optional-vs-required | Low | gameEvents.ts |
| `request_missed_events` `as any` cast | cosmetic-cast | Low | useEventSync.ts |
| `progression:xp_awarded` defensive `data.timestamp \|\| Date.now()` | cosmetic | Low | useWebSocket.tsx |

---

## Recommended phase scope (suggested order)

1. **Hot-fix critical handlers (C1, C2, C3)** — pure handler edits, no schema or emit change. Restores correct boss-HP and timer behavior.
2. **Fix `combat:player_revived` HP hardcode (C5) and `combat:player_damaged` source hardcode (C6)** — thread real values through the eventBus bridge.
3. **Rewrite `boss_ring_attack` schema to match reality (C4)** — schema-only change; emit/handler already aligned.
4. **Delete the `as any` legacy emit family (H1, H2, H3)** — 100% dead wire traffic.
5. **Audit and either delete or rewire H5 dead-listener events** — particularly `youtube_play_synced` (likely broken feature), `revive_*` (broken multiplayer revive feedback), `game_over` / `boss_defeated` (probably handled via fine-grained `combat:boss_defeated` + `session:phase_changed`).
6. **Dedupe `clientEvents.ts` vs `gameEvents.ts` (L1, H7, H9)** — pick one source.
7. **Cosmetic cleanups (L2-L12)** — batch into the same PR or a follow-up.

After steps 1-5, typing `Socket<ServerToClientEvents, ClientToServerEvents>` should compile cleanly and clear the remaining `any` warnings in `eventHandlers.ts`.
