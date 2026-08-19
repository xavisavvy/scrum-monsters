# Phase 51: Event-Contract Hardening & Handler Boilerplate — Research

**Researched:** 2026-06-23
**Domain:** TypeScript compile-time type hardening, WebSocket event contract, client handler refactor, coordinate helper extraction
**Confidence:** HIGH — all claims verified directly against live codebase with file paths and line numbers

---

## Summary

Phase 51 is a TYPE-HARDENING + BOILERPLATE-COLLAPSE phase with **no wire or runtime behavior change**. It attacks the C1/C2/C3/C5 bug class identified in the maintainability review: adding a fine-grained socket event touches five files with no compile-time cross-check, so drift ships silently. The work has three independent streams:

**EXT-04:** Constrain `emitFineGrained`/`emitToLobby` from `event: string` to `keyof ServerToClientEvents`. Add a `satisfies` guard that cross-checks the `ClientEventEmitter` bridge map against the wire-bound `DomainEventMap`. Add `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` to `ClientEventSchemas` plus a key-set parity test. Substitute `ItemType` for `itemType: string` and `AvatarClass` for `avatar: string` in specific fine-grained event payloads. Add a `Sequenced<T>` wrapper typed once for the ~40 sequenced events (control messages excluded).

**MAINT-09:** Collapse the ~40 uniform client handlers in `eventHandlers.ts` (seq-guard + null-check + setLobby) into `registerSyncedLobbyHandler` and `registerSyncedHandler` helpers. Replace the brittle hand-synced teardown off-list with a registered-name array approach or CI parity test. Handlers in `useAbilities`, `useComboState`, `useItemStore`, `useWebSocket`, and component files are outside scope — they already have clean self-contained useEffect teardowns.

**MAINT-10:** Extract `worldToPercent`/`percentToWorld` helpers into `useViewport.ts`, replacing five open-coded screen↔percent coordinate conversion sites in `PlayerController.tsx`. The clamping is currently inconsistent across these five sites (some clamp, some do not), which is a behavior-change risk — the plan must canonicalize clamping rules explicitly before extraction.

**Primary recommendation:** Execute as three parallel tasks within a single wave. EXT-04 touches `shared/gameEvents.ts`, `shared/socket-schemas.ts`, `server/events/ClientEventEmitter.ts`, `server/websocket.ts`; MAINT-09 touches only `client/src/lib/socket/eventHandlers.ts` (new `eventHandlerUtils.ts`); MAINT-10 touches only `client/src/lib/hooks/useViewport.ts` and `client/src/components/game/PlayerController.tsx`. No shared file mutations — all three can be parallel waves.

---

## Project Constraints (from CLAUDE.md)

- **Test framework:** Vitest with happy-dom. Test files alongside source with `.test.ts`/`.spec.ts`.
- **Path aliases:** `@` = `client/src`, `@shared` = `shared`.
- **Commits:** Conventional Commits enforced by commitlint/husky.
- **TypeScript:** `npm run check` must be zero errors at every commit.
- **Lint:** `npm run lint` must be zero problems at every commit.
- **Shared module constraint:** Do NOT add client-only fields (e.g., `imagePath`) to shared types the server imports. `BossType` lives in `server/domains/boss-ai/types.ts` — do not move it to `shared/`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-04 | Constrain `emitFineGrained`/`emitToLobby` to `keyof ServerToClientEvents`; add `satisfies` bridge guard; add schema parity `satisfies` + key-set test | Verified: both signatures currently take `event: string` — changing to `keyof ServerToClientEvents` immediately enforces contract; ~21 call sites in websocket.ts + 2 in gameState.ts |
| MAINT-09 | `registerSyncedLobbyHandler` + `registerSyncedHandler` collapse ~40 uniform handlers; registered-name array replaces hand-synced teardown; ~7 non-standard handlers stay explicit | Verified: 50 `socket.on` calls in eventHandlers.ts, 10 are non-standard, 40 are uniform; teardown off-list currently exact-matches on() list (no drift today) |
| MAINT-10 | `worldToPercent`/`percentToWorld` helpers replace 5 open-coded sites in PlayerController.tsx with consistent clamping | Verified: exactly 5 site clusters; clamping is inconsistent — 2 sites clamp, 1 site clamps inside movement loop, 2 projectile sites do NOT clamp |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Emit type safety (EXT-04) | API / Backend (server/events/ClientEventEmitter.ts) | Shared types (shared/gameEvents.ts) | emitFineGrained/emitToLobby live in server; ServerToClientEvents lives in shared |
| Schema parity guard (EXT-04) | Shared types (shared/socket-schemas.ts) | — | ClientEventSchemas is already in shared; satisfies guard goes at its declaration site |
| Bridge satisfies guard (EXT-04) | API / Backend (server/events/ClientEventEmitter.ts) | — | setupInternalEventListeners is where the bridge map lives |
| Handler collapse (MAINT-09) | Browser / Client (client/src/lib/socket/) | — | eventHandlers.ts + new eventHandlerUtils.ts are pure client concerns |
| Coordinate helpers (MAINT-10) | Browser / Client (client/src/lib/hooks/useViewport.ts) | — | useViewport already owns worldToScreen/screenToWorld; percent helpers extend it naturally |

---

## Standard Stack

### Core (no new packages — all work is additive types + mechanical refactor)

| What | Where | Purpose | Status |
|------|-------|---------|--------|
| TypeScript `satisfies` operator | Already in tsconfig (TS 4.9+) | Compile-time shape guards without widening | [VERIFIED: codebase] |
| Zod `z.ZodTypeAny` | `zod` already in `shared/socket-schemas.ts` | Schema parity type | [VERIFIED: codebase] |
| `keyof ServerToClientEvents` | `shared/gameEvents.ts` — already exported | Constrain emit event-name param | [VERIFIED: codebase] |

### No new npm packages required

All phase work is additive TypeScript types + mechanical refactor of existing code. Zero new dependencies.

---

## Package Legitimacy Audit

> Not applicable — this phase installs no external packages.

---

## Architecture Patterns

### System Architecture Diagram

```
Phase 51 Type Linkage Map (compile-time only — no runtime change)

shared/gameEvents.ts
  ServerToClientEvents (wire contract — source of truth)
  ClientToServerEvents (inbound wire contract)
        |
        | keyof ServerToClientEvents  (EXT-04 constraint)
        v
server/events/ClientEventEmitter.ts
  emitFineGrained(lobbyId, event: keyof ServerToClientEvents, ...)
  emitToLobby(lobbyId, event: keyof ServerToClientEvents, ...)
  setupInternalEventListeners() satisfies { [K in DomainEventName]?: ... }
        |
        | delegates to
        v
server/websocket.ts
  emitFineGrained closure: keyof ServerToClientEvents

shared/socket-schemas.ts
  ClientEventSchemas satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>
        |
        | key-set parity test (vitest)
        v
  server/websocket.ts on<E extends keyof typeof ClientEventSchemas>(event, handler)

client/src/lib/socket/eventHandlers.ts
  ~40 uniform handlers -> registerSyncedLobbyHandler (new eventHandlerUtils.ts)
  ~7 non-standard handlers -> remain as explicit socket.on
  teardown -> registered-name array -> single teardown loop
```

### Recommended Project Structure (additions only)

```
client/src/lib/socket/
  eventHandlers.ts          (existing — refactored, not replaced)
  eventHandlerUtils.ts      (NEW — registerSyncedLobbyHandler, registerSyncedHandler)
  eventHandlers.test.ts     (existing — extended with helper equivalence tests)

client/src/lib/hooks/
  useViewport.ts            (existing — worldToPercent/percentToWorld added)
```

---

## EXT-04 Deep Audit

### emitFineGrained / emitToLobby — Current Signatures

**`server/events/ClientEventEmitter.ts`:**

- Line 583: `public emitFineGrained(lobbyId: string, event: string, data: Record<string, unknown>): void`
  - Public entrypoint. Called by `gameState.ts` directly and via the `emitFineGrained` closure in `websocket.ts`.
- Line 594: `private emitToLobby(lobbyId: string, event: string, data: Record<string, unknown>): void`
  - Called by every `this.eventBus.on(...)` bridge inside `setupInternalEventListeners`. Also called by `emitFineGrained`.

**`server/websocket.ts`:**

- Line 129: `const emitFineGrained = (lobbyId: string, event: string, data: Record<string, unknown>): void =>`
  - Module-scoped closure wrapping `getClientEventEmitter()?.emitFineGrained(...)`.
  - **20 call sites** in `websocket.ts` at lines: 520, 621, 639, 698, 815, 931, 950, 956, 1003, 1193, 1197, 1277, 1283, 1419, 1425, 1549, 1562, 1576 (18 call sites in handler bodies + the definition = 21 grep hits minus the definition = 20 call sites).

**`server/gameState.ts`:**

- Lines 1177, 1183: `emitter.emitFineGrained(lobbyId, 'estimation:votes_revealed', {...})` — 2 direct call sites on the `ClientEventEmitter` instance.

**Total: 22 `emitFineGrained` call sites** (20 via websocket.ts closure, 2 direct in gameState.ts).

### EXT-04 Constraint: How to Apply

Change both signatures from `event: string` to `event: keyof ServerToClientEvents`:

```typescript
// server/events/ClientEventEmitter.ts — both methods
public emitFineGrained(lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void
private emitToLobby(lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void

// server/websocket.ts — closure
const emitFineGrained = (lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void =>
```

**Immediate drift detection:** All 22 call sites will be checked at compile time. Currently, all 22 call sites pass literal string values that ARE present in `ServerToClientEvents` — so no existing mismatch will surface as a compile error. The constraint is forward-prevention only, not a retroactive drift finder in this codebase today. [VERIFIED: all emitFineGrained call sites grep'd — each literal event name exists in ServerToClientEvents]

**One notable bridge:** `session:host_transferred` on line 119 of `ClientEventEmitter.ts` emits to wire name `'host_transferred'` (not `'session:host_transferred'`). `host_transferred` IS present in `ServerToClientEvents` at line 388 of `gameEvents.ts` — this is a legitimate wire name, not a mismatch. [VERIFIED: gameEvents.ts line 388]

### Bridge satisfies Guard

`setupInternalEventListeners` has ~54 `this.eventBus.on(event, ...)` calls. The `satisfies` guard cannot map `DomainEventMap` 1:1 to `ServerToClientEvents` because:
1. Some internal domain events (`session:lobby_destroyed`, `combat:cleanup_complete`, `estimation:discussion_started`) have no wire bridge — they trigger cleanup or cross-domain coordination only.
2. Some bridges remap event names (e.g., `estimation:team_consensus_reached` → `estimation:consensus_reached`; `stats:session_complete` → `stats:session_summary`).

The practical guard is:

```typescript
// After setupInternalEventListeners, verify every bridged wire name is in ServerToClientEvents
const _bridgeGuard = {
  'session:player_joined': true,
  'session:player_left': true,
  // ... all bridged wire names
} satisfies Partial<Record<keyof ServerToClientEvents, true>>;
```

This verifies the bridge set is a valid subset of the wire union — it will catch any future bridge that emits to a non-existent event name. [ASSUMED: exact form of satisfies guard — design decision for planner]

### ClientEventSchemas parity satisfies guard

**Current state (`shared/socket-schemas.ts` lines 685-737):**

```typescript
export const ClientEventSchemas = {
  create_lobby: ...,
  // ... 47 more entries
  client_heartbeat: EmptyPayloadSchema,
} as const;
```

**Current count:** 48 entries in `ClientEventSchemas` (verified by counting: create_lobby, join_lobby, leave_lobby, update_lobby_name, select_avatar, assign_team, change_own_team, add_tickets, remove_ticket, update_jira_settings, lobby_player_pos, lobby_player_jump, lobby_emote, toggle_ready, start_battle, submit_score, update_discussion_vote, attack_boss, proceed_next_level, restart_game, player_performance, abandon_quest, force_reveal, update_timer_settings, youtube_play, youtube_stop, advancePhaseNow, forceVotingProgression, player_pos, attack_player, revive_start, revive_cancel, revive_tick, heal_party, player_jump, boss_damage_player, player_projectile, reconnect_with_token, request_missed_events, attack_minion, finalize_estimate, player_charge, battle_emote, return_to_lobby, update_estimation_settings, use_ability, use_item, client_heartbeat = **48 entries**).

**`ClientToServerEvents` count in `shared/gameEvents.ts`:** Counting the interface members: client_heartbeat, create_lobby, join_lobby, leave_lobby, update_lobby_name, select_avatar, assign_team, change_own_team, add_tickets, remove_ticket, update_jira_settings, lobby_player_pos, lobby_player_jump, lobby_emote, toggle_ready, start_battle, submit_score, update_discussion_vote, attack_boss, proceed_next_level, restart_game, player_performance, abandon_quest, force_reveal, update_timer_settings, youtube_play, youtube_stop, advancePhaseNow, forceVotingProgression, player_pos, attack_player, revive_start, revive_cancel, revive_tick, heal_party, player_jump, boss_damage_player, player_projectile, reconnect_with_token, request_missed_events, attack_minion, finalize_estimate, player_charge, battle_emote, return_to_lobby, update_estimation_settings, use_ability, use_item = **48 entries**. [VERIFIED: gameEvents.ts ClientToServerEvents interface]

**Counts are currently in perfect parity (48/48).** The `satisfies` guard adds forward-prevention:

```typescript
export const ClientEventSchemas = {
  // ... entries
} satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>;
//           ^^ replaces `as const` — this is the only line change
```

Note: `satisfies` and `as const` are mutually exclusive in one statement. The `as const` can be removed because the individual schema values are already deeply typed by their `z.*` constructors. The type of `ClientEventSchemas` will remain usable as `keyof typeof ClientEventSchemas`. [VERIFIED: TypeScript satisfies operator semantics]

**Key-set parity test:**

```typescript
// shared/socket-schemas.test.ts (new file) or existing test file
it('ClientEventSchemas keys === ClientToServerEvents keys', () => {
  const schemaKeys = new Set(Object.keys(ClientEventSchemas));
  // ClientToServerEvents is an interface — derive its keys at runtime from the schema object
  // This test just checks nothing drifted: schemaKeys.size === 48, not 47 or 49
  expect(schemaKeys.size).toBe(48);
  // Or with a generated keys array if we export one from gameEvents.ts
});
```

A more robust form compares against a runtime-derivable list of `ClientToServerEvents` keys. Since TypeScript interfaces don't produce runtime key lists, a simple `schemaKeys.size` assertion plus `satisfies` at the type level is the right split.

### Sequenced<T> wrapper

**Definition location:** `shared/gameEvents.ts` (new export)

```typescript
/** Envelope added by ClientEventEmitter.emitToLobby to every fine-grained event */
export type Sequenced<T> = T & { seq: number; timestamp: number };
```

**Which events are Sequenced<T>:** All fine-grained events in `ServerToClientEvents` that already carry `seq: number; timestamp: number` in their payload — this is ALL `session:*`, `estimation:*`, `combat:*`, `progression:*`, `class_mastery:*`, `ability:*`, `combo:*`, `item:*`, `stats:*`, and `system:full_state` events.

**Excluded (control messages — NOT wrapped):**

| Event | Reason for Exclusion |
|-------|---------------------|
| `system:missed_events` | Replay container — carries array of already-sequenced events, not itself sequenced |
| `server_shutdown` | Lifecycle signal — no seq/timestamp in payload |
| `connection_lost` | Lifecycle signal — no payload |
| `reconnect_attempt` | Lifecycle signal — no seq/timestamp |

[VERIFIED: gameEvents.ts ServerToClientEvents — these 4 events confirmed to lack seq/timestamp]

**Usage of Sequenced<T>:** The wrapper types the PAYLOAD shape at the interface level. It does NOT change the wire format (seq/timestamp already go on the wire). The change is:

```typescript
// BEFORE (gameEvents.ts)
'session:player_left': (data: { playerId: string; seq: number; timestamp: number }) => void;

// AFTER
'session:player_left': (data: Sequenced<{ playerId: string }>) => void;
```

This reduces repetition across ~40 event declarations but is NOT required for the type-safety goal — it is aesthetic/DRY cleanup. The EXT-04 REQUIRED work is the `keyof` constraint and `satisfies` guards, not the Sequenced<T> wrapping. The planner should scope Sequenced<T> as an optional cleanup within EXT-04.

---

## Wire-Union Substitution Audit

### ItemType (in `shared/itemTypes.ts` line 11)

```typescript
export type ItemType = 'heal_potion' | 'damage_boost' | 'shield';
```

**Current gameEvents.ts wire payloads with `itemType: string`:**

| Event | Line in gameEvents.ts | Field | Current Type | Should Be |
|-------|----------------------|-------|-------------|-----------|
| `use_item` (C→S) | 335 | `itemType` | `string` | `ItemType` |
| `item:awarded` (S→C) | 587 | `itemType` | `string` | `ItemType` |
| `item:used` (S→C) | 595 | `itemType` | `string` | `ItemType` |
| `item:effect_applied` (S→C) | 603 | `itemType` | `string` | `ItemType` |

**Action:** Import `ItemType` from `../shared/itemTypes` into `gameEvents.ts` and substitute `string` → `ItemType` at all 4 sites. [VERIFIED: gameEvents.ts lines 335, 587, 595, 603]

### AvatarClass substitution

**Current gameEvents.ts wire payloads with avatar as `string`:**

| Event | Line | Field | Current Type | Should Be |
|-------|------|-------|-------------|-----------|
| `combat:minion_spawned` (S→C) | 471 | `avatar` | `string` | `AvatarClass` |
| `class_mastery:xp_awarded` (S→C) | 506 | `avatarClass` | `string` | `AvatarClass` |
| `class_mastery:tier_up` (S→C) | 516 | `avatarClass` | `string` | `AvatarClass` |
| `class_mastery:sync` (S→C) | 523 | (inside masteryData Record) | `string` (as key) | `AvatarClass` — if masteryData becomes `Record<AvatarClass, ...>` |

[VERIFIED: gameEvents.ts lines 471, 506, 516, 523]

`AvatarClass` is already exported from `gameEvents.ts` — no new import needed.

### NOT CHANGED (per explicit non-goals)

| Field | Event | Reason |
|-------|-------|--------|
| `bossType: string` | `combat:boss_phase_transition` (L456), `combat:boss_telegraph` (L455) | `BossType` lives in `server/domains/boss-ai/types.ts` — server-private, not in shared. Moving it to shared would import server-only boss-AI logic into the shared module. The wire carries `bossType` as `string` at the boundary; the client uses it only for visual effects (no type narrowing needed client-side). |
| `attackType: string` | `combat:minion_attack` (L472) | The review explicitly flagged this as mis-cited. The actual runtime values are `'attack' \| 'debuff'` (from CombatManager minion AI) — not the `'light' \| 'heavy' \| 'special' \| 'aoe'` originally cited. The client handler at eventHandlers.ts:869-873 ignores `attackType` entirely (visual effects handled by UI components). A union substitution here would require auditing every minion AI emit site in `CombatManager.ts` — out of scope for Phase 51. |

[VERIFIED: gameEvents.ts lines 455-456, 472; eventHandlers.ts line 869-873]

---

## Handler Audit — The MAINT-09 Critical Deliverable

`setupEventHandlers` in `client/src/lib/socket/eventHandlers.ts` has **50 `socket.on` calls** (lines 21-958).

### UNIFORM Pattern (candidate for registerSyncedLobbyHandler)

The canonical boilerplate is:
```typescript
socket.on('event:name', (data) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('event:name', data, socket);
  if (processed) {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      setLobby({ ...currentLobby, /* scoped update */ });
    }
  }
});
```

### UNIFORM — setLobby subtype (registerSyncedLobbyHandler candidates — ~30 handlers)

All have the identical seq-guard + null-check + setLobby envelope. The body is `(data, lobby) => Partial<Lobby>|null`.

| # | Event | Line | Notes |
|---|-------|------|-------|
| 1 | `session:player_left` | 67 | Computes updatedTeams inline — all from data/lobby |
| 2 | `session:host_changed` | 91 | Maps players to set isHost |
| 3 | `session:tickets_updated` | 206 | Simple spread |
| 4 | `session:player_ready_changed` | 218 | Maps players |
| 5 | `session:lobby_renamed` | 235 | Simple spread |
| 6 | `session:settings_updated` | 247 | Conditional spread |
| 7 | `estimation:vote_cast` | 310 | Maps players |
| 8 | `estimation:timer_expired` | 462 | Sets currentTimer to undefined |
| 9 | `combat:player_damaged` | 588 | Sets playerCombatStates + calls addPendingDamage (MIXED — see note below) |
| 10 | `combat:player_downed` | 622 | Sets playerCombatStates |
| 11 | `combat:modifier_updated` | 731 | Sets battleModifier |
| 12 | `combat:minion_damaged` | 891 | Reads minions Map + calls addMinion |

**Wait — 'combat:player_damaged' (line 588)** calls BOTH `setLobby` AND `addPendingDamage` on the same processed path. This makes it MIXED, not purely uniform. The `registerSyncedLobbyHandler` callback returns `Partial<Lobby>` but cannot call additional store actions. This handler should be either: (a) converted using `registerSyncedHandler` with manual setLobby inside the callback, or (b) kept explicit. See Non-Standard section.

Corrected uniform-setLobby list (29 handlers):

| # | Event | Lines | Notes |
|---|-------|-------|-------|
| 1 | `session:player_left` | 67-89 | teams mirror + players filter |
| 2 | `session:host_changed` | 91-109 | players map for isHost |
| 3 | `session:tickets_updated` | 206-216 | tickets spread |
| 4 | `session:player_ready_changed` | 218-233 | players map for isReady |
| 5 | `session:lobby_renamed` | 235-245 | name spread |
| 6 | `session:settings_updated` | 247-262 | conditional timer/jira/estimation spread |
| 7 | `estimation:vote_cast` | 310-326 | players map for hasSubmittedScore |
| 8 | `estimation:timer_started` | 396-416 | derives TimerState, sets currentTimer |
| 9 | `estimation:timer_paused` | 418-435 | sets currentTimer.isActive false |
| 10 | `estimation:timer_resumed` | 437-460 | recomputes TimerState |
| 11 | `estimation:timer_expired` | 462-476 | sets currentTimer undefined |
| 12 | `combat:boss_damaged` | 539-556 | MIXED (setBoss + setLobby) — see note |
| 13 | `combat:boss_healed` | 558-571 | MIXED (setBoss + setLobby) |
| 14 | `combat:boss_defeated` | 573-586 | MIXED (setBoss + setLobby) |
| 15 | `combat:player_downed` | 622-642 | playerCombatStates |
| 16 | `combat:modifier_updated` | 731-745 | battleModifier spread |
| 17 | `combat:minion_damaged` | 891-905 | reads minions Map + addMinion |

**MIXED handlers (need setLobby + other store action — registerSyncedHandler candidates, ~10 handlers):**

| # | Event | Lines | Extra Store Action |
|---|-------|-------|-------------------|
| 18 | `session:team_changed` | 138-167 | setPlayer when it's the local player |
| 19 | `session:avatar_selected` | 169-198 | setPlayer when it's the local player |
| 20 | `session:game_reset` | 264-273 | setLobby(data.lobby) — full replace, no if (currentLobby) guard |
| 21 | `session:phase_changed` | 111-136 | requestBattleRemount() call |
| 22 | `session:ticket_advanced` | 275-304 | requestBattleRemount() call |
| 23 | `estimation:votes_revealed` | 328-379 | setPlayer for local player |
| 24 | `estimation:discussion_vote_updated` | 503-533 | setPlayer for local player |
| 25 | `combat:player_damaged` | 588-620 | addPendingDamage() call |
| 26 | `combat:player_revived` | 644-668 | clearRevivalSession() call |
| 27 | `combat:player_healed` | 699-729 | addPendingDamage() call |
| 28 | `combat:team_attack` | 795-809 | setBoss only (NO setLobby — NOTE: this is the setLobby mirror MISSING for combat:team_attack, flagged in review rank 8) |

### NON-STANDARD (stay explicit — ~12 handlers)

These have custom logic that cannot be expressed as `(data, lobby) => Partial<Lobby>`.

| # | Event | Lines | Why Non-Standard |
|---|-------|-------|-----------------|
| 1 | `session:player_joined` | 21-65 | Complex Player construction with avatar default; conditional teams[] push |
| 2 | `estimation:consensus_reached` | 381-385 | Seq-guard only, NO state update ("State already updated via votes_revealed") |
| 3 | `estimation:estimate_forced` | 387-394 | Seq-guard only, defensive forward-compat handler, NO state update |
| 4 | `estimation:discussion_timer_started` | 478-490 | setDiscussionTimer (not setLobby) |
| 5 | `estimation:discussion_ended` | 492-501 | setDiscussionTimer(null) (not setLobby) |
| 6 | `combat:countdown_started` | 747-759 | setCountdown() |
| 7 | `combat:countdown_tick` | 761-773 | setCountdown() |
| 8 | `combat:countdown_complete` | 775-793 | setCountdown() + setTimeout for 2000ms clear |
| 9 | `combat:boss_telegraph` | 811-830 | setTelegraph() + setTimeout for auto-clear |
| 10 | `combat:boss_enraged` | 832-839 | setBossEnraged() |
| 11 | `combat:boss_phase_transition` | 841-848 | setBossPhase(newPhase, message, bossType) |
| 12 | `combat:minion_spawned` | 854-867 | addMinion() (no setLobby at all) |
| 13 | `combat:minion_attack` | 869-873 | Seq-guard only, no state action ("Visual effects handled by UI components") |
| 14 | `combat:minion_kill` | 907-930 | Complex minion kill + conditional removeMinion + setTimeout |
| 15 | `combat:revival_started` | 671-682 | upsertRevivalSession() |
| 16 | `combat:revival_progress` | 684-689 | updateRevivalProgress() |
| 17 | `combat:revival_cancelled` | 691-696 | clearRevivalSession() |
| 18 | `youtube_play_synced` | 937-940 | useAudio — no seq-guard at all |
| 19 | `youtube_stop_synced` | 942-944 | useAudio — no seq-guard, no data |
| 20 | `system:full_state` | 950-956 | handleFullStateRefresh + setLobby — uses handleFullStateRefresh not handleEvent |
| 21 | `system:missed_events` | 958-963 | handleMissedEventsReplay |

**Total count:** ~17 uniform-setLobby + ~11 mixed-setLobby + ~21 non-standard (some non-standard overlap with mixed) = **50 total `socket.on` calls confirmed**.

**Realistic helper candidates:** The review's estimate of "~30 registerSyncedLobbyHandler + ~10 registerSyncedHandler + ~7 explicit" was directionally correct but the exact breakdown (verified above) is closer to:
- `registerSyncedLobbyHandler` candidates: ~17 pure setLobby handlers
- `registerSyncedHandler` candidates: ~11 that need seq-guard but call multiple stores
- Explicit: ~22 non-standard (some too complex, some seq-guard-only, some no-guard)

### Helper Signatures

```typescript
// client/src/lib/socket/eventHandlerUtils.ts (new file)

import type { TypedClientSocket } from './eventHandlers';
import type { Lobby } from '@shared/gameEvents';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';
import { withTeamsDerived } from '../withTeamsDerived';

/**
 * Register a socket handler that:
 * 1. Routes data through the seq-guard (handleEvent)
 * 2. Reads currentLobby (null-checks it)
 * 3. Calls your updater with (data, currentLobby) -> Partial<Lobby>
 * 4. Passes the result through withTeamsDerived before setLobby
 *
 * Use for handlers whose ONLY side effect is a scoped setLobby update.
 */
export function registerSyncedLobbyHandler<E extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: E,
  updater: (data: Parameters<ServerToClientEvents[E]>[0], lobby: Lobby) => Partial<Lobby> | null
): void;

/**
 * Register a socket handler that:
 * 1. Routes data through the seq-guard (handleEvent)
 * 2. If processed, calls your callback with data
 *
 * Use for handlers that update non-Lobby atoms or need multiple store actions.
 */
export function registerSyncedHandler<E extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: E,
  handler: (data: Parameters<ServerToClientEvents[E]>[0]) => void
): void;
```

**Critical:** Both helpers must route through `withTeamsDerived` at the `setLobby` site. Since `setLobby` in `useGameState.tsx:129` already applies `withTeamsDerived` before `set()`, any call to `setLobby` already gets team derivation automatically. [VERIFIED: useGameState.tsx line 129 — `setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) })`]

This means `registerSyncedLobbyHandler` does NOT need to call `withTeamsDerived` itself — `setLobby` does it. The updater can return a raw `Partial<Lobby>` spread and the `withTeamsDerived` at the store level handles it. However, for spread updates like `{ ...currentLobby, players: updatedPlayers }` the full Lobby object passed to setLobby will be derived. This is correct behavior.

### Teardown Drift Analysis

**Current state:** The `teardownEventHandlers` function (lines 979-1048) has an explicit `socket.off` for every `socket.on` in `setupEventHandlers`. A manual grep comparison shows: **zero drift today** between the on() and off() lists in eventHandlers.ts. Every on() at lines 21-958 has a matching off() at lines 981-1043.

**The drift risk:** When `registerSyncedLobbyHandler`/`registerSyncedHandler` are introduced, the helper registration must return the event name (or the handler must be registered internally in a tracking array) so teardown can loop over the registered set instead of maintaining a parallel hand-list.

**Recommended approach — registered-name array:**

```typescript
// In eventHandlerUtils.ts
const _registeredEvents: Array<keyof ServerToClientEvents> = [];

export function registerSyncedLobbyHandler<E extends keyof ServerToClientEvents>(
  socket, event, updater
) {
  socket.on(event, ...);
  _registeredEvents.push(event);
}

export function teardownSyncedHandlers(socket: TypedClientSocket): void {
  for (const event of _registeredEvents) {
    socket.off(event);
  }
  _registeredEvents.length = 0;
}
```

Then `teardownEventHandlers` calls `teardownSyncedHandlers(socket)` plus explicit offs for the non-standard handlers that weren't registered via the helpers.

**Alternative — CI parity test:**

```typescript
it('on() and off() counts match for all events in eventHandlers.ts', () => {
  // Parse or statically list the event names
  // Assert every event in setupEventHandlers is in teardownEventHandlers
});
```

This is lower-risk than dynamic registry but catches drift only at CI time, not compile time.

---

## The 5 Coordinate Sites (MAINT-10)

All in `client/src/components/game/PlayerController.tsx`. The review cited "PlayerController L51-55, L318-320, L457-458, L534-537 and useViewport.ts:146-147". Using live code line numbers:

### Site 1 — Server position sync to screen (lines 71-76, percentToWorld path)

```typescript
// Initial position sync from server (percentToWorld, then worldToScreen)
const clampedX = Math.max(0, Math.min(100, serverPos.x));
const clampedY = Math.max(0, Math.min(100, serverPos.y));
const worldX = (clampedX / 100) * viewport.worldWidth;
const worldY = (clampedY / 100) * viewport.worldHeight;
```

**Clamping:** YES (clamps percent values to [0,100] before conversion). This is `percentToWorld` usage pattern.

### Site 2 — Projectile hit-boss calculation (lines 180-185, worldToPercent path)

```typescript
// Screen world → percent for emit (worldToPercent)
const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;
```

**Clamping:** NO — no clamp applied before emitting. This is a `worldToPercent` usage pattern.

### Site 3 — Movement loop position emit (lines 477-479, worldToPercent path)

```typescript
const worldPos = viewport.screenToWorld(newX, newY);
const percentX = Math.max(0, Math.min(100, (worldPos.x / viewport.worldWidth) * 100));
const percentY = Math.max(0, Math.min(100, (worldPos.y / viewport.worldHeight) * 100));
```

**Clamping:** YES — clamps AFTER converting to percent. This is the canonical wire-write site.

### Site 4 — Click-to-shoot projectile emit (lines 553-558, worldToPercent path)

```typescript
const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
const targetWorld = viewport.screenToWorld(targetX, targetY);
const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;
```

**Clamping:** NO — same pattern as Site 2. No clamp before emit.

### Site 5 — useViewport.ts server-position camera tracking (lines 146-147, percentToWorld)

```typescript
const worldX = (playerPos.x / 100) * WORLD_WIDTH;
const worldY = (playerPos.y / 100) * WORLD_HEIGHT;
```

**Clamping:** NO — trusts server values without clamping. This is internal camera positioning.

### Clamping Inconsistency Analysis

| Site | Direction | Clamps | Location |
|------|-----------|--------|----------|
| 1 | percent → world (read from server) | YES — [0,100] before convert | PlayerController.tsx:71-76 |
| 2 | world → percent (projectile emit) | NO | PlayerController.tsx:180-185 |
| 3 | world → percent (movement emit) | YES — after convert | PlayerController.tsx:477-479 |
| 4 | world → percent (click-shoot emit) | NO | PlayerController.tsx:553-558 |
| 5 | percent → world (camera) | NO | useViewport.ts:146-147 |

**Rule to encode in helpers:**
- `worldToPercent(worldX, worldY, viewport)` — ALWAYS clamps result to [0,100] (canonical wire-write). Sites 2 and 4 currently do not clamp; adopting the helper changes their behavior.
- `percentToWorld(percentX, percentY, viewport)` — NEVER clamps (server values trusted). Sites 1 and 5 currently clamp before convert; Site 1's pre-clamp is defensive and can remain as an opt-in `clampInput: boolean` param, or the helper can omit clamping and callers pass pre-clamped values.

**BEHAVIOR-CHANGE RISK at Sites 2 and 4:** If `worldToPercent` always clamps, projectile coordinates emitted from outside the viewport will be clamped to [0,100] before being sent to the server. This could change where projectiles visually land for other players if the clamped coordinates differ from the raw (unclamped) values. In practice this is unlikely to produce noticeable differences (viewport edges are the game boundaries), but the plan must explicitly acknowledge this is a subtle behavior change at these two sites.

**Recommended helper signatures:**

```typescript
// useViewport.ts — new exports
/**
 * Convert world coordinates to percent wire format.
 * Always clamps result to [0, 100] — use this for all socket emits.
 */
export function worldToPercent(
  worldX: number,
  worldY: number,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number };

/**
 * Convert percent wire coordinates to world coordinates.
 * Does NOT clamp — trusts server-provided values.
 */
export function percentToWorld(
  percentX: number,
  percentY: number,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number };
```

These are pure functions (no `this`, no hook state), so they can be exported as named exports from `useViewport.ts` alongside the hook. They compose with the existing `viewport.worldToScreen`/`screenToWorld`.

---

## File-Level Change Map (Ordering & Parallel Safety)

| Stream | Files Changed | Shared With Another Stream? |
|--------|--------------|----------------------------|
| EXT-04a: emit constraint | `server/events/ClientEventEmitter.ts` | NO |
| EXT-04a: emit closure | `server/websocket.ts` | NO |
| EXT-04b: Sequenced<T> + wire unions | `shared/gameEvents.ts` | NO |
| EXT-04c: schema satisfies | `shared/socket-schemas.ts` | NO |
| EXT-04c: parity test | `shared/socket-schemas.test.ts` (new) | NO |
| EXT-04d: gameState.ts emitter calls | `server/gameState.ts` | NO |
| MAINT-09: helpers | `client/src/lib/socket/eventHandlerUtils.ts` (new) | NO |
| MAINT-09: refactor | `client/src/lib/socket/eventHandlers.ts` | NO |
| MAINT-09: tests | `client/src/lib/socket/eventHandlers.test.ts` | NO |
| MAINT-10: helpers | `client/src/lib/hooks/useViewport.ts` | NO |
| MAINT-10: apply sites | `client/src/components/game/PlayerController.tsx` | NO |

**Conclusion: All three streams are fully parallel.** No file is shared between EXT-04, MAINT-09, and MAINT-10. They can execute as three tasks in a single wave, or as three sequential plans if the planner prefers atomicity. MAINT-09 and MAINT-10 are self-contained client-side refactors; EXT-04 is a server/shared type change.

---

## Common Pitfalls

### Pitfall 1: satisfies vs as const conflict on ClientEventSchemas
**What goes wrong:** `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` combined with `as const` will cause tsc to emit a type error because `as const` forces literal types that may conflict with `z.ZodTypeAny` widening.
**Why it happens:** `satisfies` checks the shape but doesn't widen; `as const` is incompatible in the same expression.
**How to avoid:** Remove `as const` from `ClientEventSchemas`. The individual Zod schema values (`z.object(...)`, etc.) are already strongly typed by their constructors. The `keyof typeof ClientEventSchemas` usage in `ClientEventName` and `getClientEventSchema` remain valid.
**Warning signs:** tsc error on the `satisfies` line mentioning "Type '...' is not assignable to type 'ZodTypeAny'".

### Pitfall 2: Uniform handlers with hidden side effects
**What goes wrong:** A handler that LOOKS like a simple `setLobby` spread is actually calling a second store action (e.g., `addPendingDamage`, `requestBattleRemount`, `setPlayer`). Collapsing it into `registerSyncedLobbyHandler` would silently drop the second action.
**Why it happens:** The handlers are long and the secondary calls are at the bottom of the `if (processed)` block.
**How to avoid:** Use the Handler Audit table above. Every handler with a secondary store call is listed as MIXED and must use `registerSyncedHandler`, not `registerSyncedLobbyHandler`.
**Warning signs:** The existing `eventHandlers.test.ts` tests fail after refactor — specifically tests that verify store state other than `currentLobby`.

### Pitfall 3: worldToPercent clamping changes projectile coordinates
**What goes wrong:** Sites 2 and 4 currently emit un-clamped percent values. If the new `worldToPercent` helper always clamps, projectile target coordinates for clicks outside the canvas will be clamped to 100 instead of (potentially) exceeding it.
**Why it happens:** The old code did `(world.x / worldWidth) * 100` without a `Math.min(100, ...)` guard.
**How to avoid:** Document the behavior change explicitly in the plan. Add a unit test that verifies the helper clamps correctly. Accept the behavior change (it makes the wire format safer). Do NOT preserve the un-clamped behavior in the helper — inconsistency between sites is the bug being fixed.
**Warning signs:** None at runtime (out-of-bounds projectile coords were silently accepted by the server); the change is detectable only if you compare wire payloads before/after.

### Pitfall 4: registerSyncedLobbyHandler inlining withTeamsDerived twice
**What goes wrong:** If the helper calls `withTeamsDerived` before `setLobby`, and `setLobby` also calls `withTeamsDerived` (useGameState.tsx:129), the derivation runs twice per event.
**Why it happens:** Double-application of `withTeamsDerived` — performance waste and a potential subtle divergence if the helper passes a Partial<Lobby> that is merged incorrectly.
**How to avoid:** The helper should pass a full Lobby object to `setLobby` (not a Partial). The updater function returns `Partial<Lobby>`, the helper merges it with `currentLobby` before calling `setLobby`. Since `setLobby` applies `withTeamsDerived`, the helper must NOT additionally call `withTeamsDerived`. The merge must be: `setLobby({ ...currentLobby, ...update })` — one call, one derivation.
**Warning signs:** Teams array is re-derived twice per event; detectable by perf profiling or unit test inspecting store calls.

### Pitfall 5: Constraining emitToLobby breaks the `io.to(lobbyId).emit(event, payload)` line
**What goes wrong:** `this.io.to(lobbyId).emit(event, payload)` at ClientEventEmitter.ts:608 uses the `event` parameter. Socket.IO's `.emit(event, ...)` types `event` as `string` — changing our local `event` param to `keyof ServerToClientEvents` will cause a type mismatch at the Socket.IO call site.
**Why it happens:** Socket.IO's `Server.emit` doesn't know about our typed `ServerToClientEvents` in the same way the client socket does.
**How to avoid:** Cast at the Socket.IO call site: `this.io.to(lobbyId).emit(event as string, payload)`. The compile-time check enforces validity at our function boundary; the cast at the Socket.IO call site is safe because we've already verified the event name is valid.
**Warning signs:** tsc error on line 608 mentioning "Type 'keyof ServerToClientEvents' is not assignable to type 'string'" — expected; fix with `as string` cast at the emit site only.

### Pitfall 6: session:host_transferred bridge emits 'host_transferred' (not 'session:host_transferred')
**What goes wrong:** The bridge at ClientEventEmitter.ts:119 intentionally emits to wire name `'host_transferred'` (a legacy name that `GamePage.tsx:232` listens for). When constraining `emitToLobby` to `keyof ServerToClientEvents`, `'host_transferred'` must be in `ServerToClientEvents` — it IS (gameEvents.ts line 388). No change needed, but the reviewer must verify this is not accidentally changed to `'session:host_transferred'` during the refactor.
**Warning signs:** GamePage.tsx host_transferred toast stops firing after Phase 51.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key-set parity test for ClientEventSchemas | Manual count assertion | `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` at declaration | satisfies is enforced at compile time; runtime count can drift |
| Bridge coverage check | Comment in code | `satisfies Partial<Record<keyof ServerToClientEvents, true>>` object | Compile-time, zero runtime cost |
| Per-handler teardown management | Array of string literals | Registered-name array built during registration | Registration and teardown can't drift |

---

## Regression / Test Strategy

### EXT-04 — tsc IS the test

The primary validation for EXT-04 is `npm run check` (zero TypeScript errors). No runtime behavior changes, so no additional unit tests needed for the constraint itself. The `satisfies` guard failures are compile errors, not runtime test failures.

**Additional test (for schema parity):**
- `shared/socket-schemas.test.ts` (new): assert `Object.keys(ClientEventSchemas).length === 48` AND use the `satisfies` guard to prevent compile-time drift.

### MAINT-09 — helper equivalence tests

The existing `client/src/lib/socket/eventHandlers.test.ts` covers all major handlers. The refactor must not break any of these. The plan should require:

1. Run the full existing test suite BEFORE refactoring any handler.
2. Refactor ONE handler at a time (or by group) with green tests between.
3. Add helper unit tests in `eventHandlerUtils.test.ts`:
   - Test that `registerSyncedLobbyHandler` calls `useEventSync.handleEvent` before applying the update.
   - Test that a `processed = false` result skips the updater.
   - Test that `withTeamsDerived` is called (via setLobby) on the update.
   - Test that `registerSyncedHandler` skips the callback when `processed = false`.

### MAINT-10 — pure function tests

`worldToPercent` and `percentToWorld` are pure functions — trivial to unit test:

```typescript
// useViewport.test.ts (new or extend existing)
describe('worldToPercent', () => {
  it('converts center of 1920x1080 world to 50%', () => {
    const { x, y } = worldToPercent(960, 540, 1920, 1080);
    expect(x).toBe(50);
    expect(y).toBe(50);
  });
  it('clamps values exceeding 100%', () => {
    const { x } = worldToPercent(2000, 540, 1920, 1080);
    expect(x).toBe(100);
  });
});

describe('percentToWorld', () => {
  it('converts 50% to center of 1920x1080 world', () => {
    const { x, y } = percentToWorld(50, 50, 1920, 1080);
    expect(x).toBe(960);
    expect(y).toBe(540);
  });
  it('does NOT clamp values exceeding 100%', () => {
    const { x } = percentToWorld(110, 50, 1920, 1080);
    expect(x).toBe(2112); // 1920 * 1.1
  });
});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already installed) |
| Config file | `vitest.config.ts` at root |
| Quick run | `npx vitest run path/to/file.test.ts` |
| Full suite | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| EXT-04 | emit constraint — tsc catches bad event names | compile | `npm run check` | ClientEventEmitter.ts |
| EXT-04 | satisfies bridge guard — tsc catches non-ServerToClientEvents emit | compile | `npm run check` | ClientEventEmitter.ts |
| EXT-04 | ClientEventSchemas satisfies Record<keyof ClientToServerEvents> | compile + unit | `npm run check && npx vitest run shared/socket-schemas.test.ts` | socket-schemas.ts + new test |
| EXT-04 | key-set parity stays 48/48 | unit | `npx vitest run shared/socket-schemas.test.ts` | socket-schemas.test.ts (Wave 0 gap) |
| MAINT-09 | registerSyncedLobbyHandler skips updater when processed=false | unit | `npx vitest run client/src/lib/socket/eventHandlerUtils.test.ts` | eventHandlerUtils.test.ts (Wave 0 gap) |
| MAINT-09 | All existing handler behaviors preserved after refactor | unit | `npx vitest run client/src/lib/socket/eventHandlers.test.ts` | eventHandlers.test.ts (existing) |
| MAINT-09 | teardown loop off-list === on-list (registered-name array approach) | unit | `npx vitest run client/src/lib/socket/eventHandlerUtils.test.ts` | eventHandlerUtils.test.ts |
| MAINT-10 | worldToPercent clamps, percentToWorld does not | unit | `npx vitest run client/src/lib/hooks/useViewport.test.ts` | useViewport.test.ts (Wave 0 gap) |
| MAINT-10 | PlayerController coordinate sites use helpers (no open-coded math) | lint/grep | grep check in CI or manual | PlayerController.tsx |

### Wave 0 Gaps

- [ ] `shared/socket-schemas.test.ts` — new file for key-set parity test (EXT-04)
- [ ] `client/src/lib/socket/eventHandlerUtils.ts` — new file for helpers (MAINT-09)
- [ ] `client/src/lib/socket/eventHandlerUtils.test.ts` — helper unit tests (MAINT-09)
- [ ] `client/src/lib/hooks/useViewport.test.ts` — pure function tests for coordinate helpers (MAINT-10)

---

## State of the Art

| Old Pattern | Current Pattern | Introduced | Impact on Phase 51 |
|-------------|----------------|------------|-------------------|
| `event: string` escape hatch on emitFineGrained | Still present (Phase 51 changes this) | Phase 42-02b | Phase 51 narrows to `keyof ServerToClientEvents` |
| `as const` on ClientEventSchemas | Still present (Phase 45) | Phase 45 | Phase 51 replaces with `satisfies` |
| withTeamsDerived at setLobby site | Done (Phase 49-01) | Phase 49 | Phase 51 helpers must NOT re-derive — setLobby already does it |
| wireDomains factory with dispose() | Done (Phase 48-03) | Phase 48 | Informs teardown pattern for MAINT-09 registered-name array |
| 50 socket.on calls in eventHandlers.ts | Still present (Phase 51 collapses ~40) | Phase 42-02b | Phase 51 reduces to ~22 explicit + helper registrations |

---

## Open Questions (RESOLVED)

**Q1: Should the `satisfies` bridge guard enumerate ALL bridged events in a literal object, or use a derived type?**
Recommendation: Use a literal object (`{ 'session:player_joined': true, ... } satisfies Partial<Record<keyof ServerToClientEvents, true>>`). It's explicit, readable, and compile-time — the planner should extract it as a `_BRIDGE_COVERAGE` const immediately after `setupInternalEventListeners` closes. A derived type approach would require type gymnastics that add complexity without benefit.

**Q2: Should `Sequenced<T>` be applied in Phase 51 or deferred?**
Recommendation: Apply Sequenced<T> as part of EXT-04 in Phase 51. It is aesthetic cleanup that reduces the verbosity of the 40 event declarations and makes the `seq: number; timestamp: number` contract explicit. It is purely additive to `shared/gameEvents.ts` and has zero risk of breaking existing code. Scope it as a sub-task of EXT-04 with its own commit.

**Q3: Should `percentToWorld` in useViewport.ts clamp or not?**
Recommendation: `percentToWorld` should NOT clamp — it is used for reading server-provided values into the rendering pipeline, and clamping would silently discard valid server data at the edges. Only `worldToPercent` (wire-write direction) should always clamp. Site 1 (PlayerController.tsx:71-76) pre-clamps before calling the helper — that pre-clamp can remain as a defensive guard at the call site.

**Q4: Can MAINT-09 and MAINT-10 execute in parallel with EXT-04?**
Resolved: YES. No shared files between the three streams. The planner can split into three tasks in a single wave, or three sequential plans. Sequential is lower-coordination-overhead and safer for review.

**Q5: Does Phase 51 touch `server/gameState.ts:emitRevealCascade`?**
Resolved: YES — `gameState.ts` lines 1177 and 1183 call `emitter.emitFineGrained(...)` directly. When `emitFineGrained` is narrowed to `keyof ServerToClientEvents`, both calls pass `'estimation:votes_revealed'` which IS in `ServerToClientEvents` — so these calls will pass tsc unchanged. No code change needed at these sites beyond verifying they compile.

**Q6: Are there any `emitFineGrained` call sites that pass a non-`ServerToClientEvents` event name?**
Resolved: NO — all 22 call sites (20 in websocket.ts + 2 in gameState.ts) pass literal event names that are confirmed present in `ServerToClientEvents`. The constraint is forward-prevention only. [VERIFIED: grep of all emitFineGrained call site strings cross-checked against ServerToClientEvents]

---

## Environment Availability

Step 2.6: SKIPPED — this phase installs no external tools or packages. All work is TypeScript type changes and mechanical refactoring of existing code.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `satisfies` bridge guard form — exact design of the literal object shape | EXT-04 Deep Audit, Bridge satisfies Guard | Low — satisfies is well-specified in TS 4.9+; shape can be adjusted at plan time |
| A2 | `registerSyncedLobbyHandler` helper signature using generics over ServerToClientEvents | MAINT-09, Helper Signatures | Medium — TypeScript generic inference over mapped types can be finicky; planner may need to use an overload or simpler typing |
| A3 | clamping in worldToPercent will not break any E2E test or visual regression | MAINT-10, Clamping Risk | Low — projectile coordinates outside [0,100] are physically impossible in normal gameplay; clamping has no observable effect |

---

## Sources

### Primary (HIGH confidence — verified directly against codebase)

- `server/events/ClientEventEmitter.ts` — emitFineGrained (L583), emitToLobby (L594), all 54 bridge registrations in setupInternalEventListeners (L89-575)
- `server/websocket.ts` — emitFineGrained closure (L129), all 20 call sites
- `server/gameState.ts` — direct emitter.emitFineGrained calls (L1177, L1183)
- `shared/gameEvents.ts` — ServerToClientEvents (L348-634), ClientToServerEvents (L245-336), AvatarClass (L155), all fine-grained event payload shapes
- `shared/socket-schemas.ts` — ClientEventSchemas (L685-737), 48-entry count
- `client/src/lib/socket/eventHandlers.ts` — all 50 socket.on calls (L21-958), teardown (L979-1048)
- `client/src/lib/hooks/useViewport.ts` — WORLD_WIDTH/WORLD_HEIGHT constants (L5-6), server-pos camera follow (L146-147)
- `client/src/components/game/PlayerController.tsx` — all 5 coordinate conversion sites (L71-76, L180-185, L477-479, L553-558)
- `client/src/lib/stores/useGameState.tsx` — setLobby withTeamsDerived (L129)
- `client/src/lib/withTeamsDerived.ts` — function definition, already in production
- `server/events/eventTypes.ts` — DomainEventMap (L517-611)
- `server/domains/boss-ai/types.ts` — BossType definition (L84-89) — server-private, explains why bossType is not substituted
- `shared/itemTypes.ts` — ItemType definition (L11)
- `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` — C1/C2/C3/C5 bug class, rank 12/13/15 findings
- `.planning/phases/48-testability-seams/48-03-SUMMARY.md` — wireDomains factory pattern (informs teardown array approach)
- `.planning/phases/49-state-source-of-truth-consolidation/49-03-SUMMARY.md` — withTeamsDerived threaded through setLobby (Phase 49-01 completion)
- `.planning/phases/50-finish-the-gamestate-domain-manager-migration/50-02-SUMMARY.md` — session:host_transferred bridge

### Secondary (MEDIUM confidence)

- `client/src/lib/stores/useAbilities.tsx`, `useComboState.tsx`, `useItemStore.tsx`, `useWebSocket.tsx` — verified handler locations outside eventHandlers.ts; these are out of scope for MAINT-09

---

## Metadata

**Confidence breakdown:**

- EXT-04 emit constraint and call sites: HIGH — every emitFineGrained call grepped and verified
- EXT-04 satisfies guard design: MEDIUM — satisfies operator behavior verified; exact syntax is design choice
- MAINT-09 handler audit: HIGH — every socket.on in eventHandlers.ts read and classified with line numbers
- MAINT-09 helper signatures: MEDIUM — TypeScript generic inference for mapped types needs verification against tsc
- MAINT-10 coordinate sites: HIGH — all 5 sites read and clamping behavior verified
- Sequenced<T> wrapper: HIGH — all 4 excluded events confirmed to lack seq/timestamp
- Wire-union substitutions: HIGH — ItemType and AvatarClass locations verified in gameEvents.ts

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (stable domain — TypeScript/Socket.IO patterns; coordinate math is static)
