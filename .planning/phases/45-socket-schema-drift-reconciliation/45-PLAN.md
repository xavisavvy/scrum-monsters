# Phase 45 — Socket Schema Drift Reconciliation

**Source of truth:** [`45-RESEARCH.md`](./45-RESEARCH.md) (full inventory of 25 drift items, 6 Critical / 6 High categories / 12 Low).

## Goal

Bring `shared/gameEvents.ts` (the typed `ServerToClientEvents` / `ClientToServerEvents` contracts) into agreement with what the server actually emits and what the client actually reads, so:

1. Three runtime bugs the audit surfaced stop silently corrupting client state (boss-heal HP, timer state after resume, hardcoded revive HP).
2. The client `Socket` can be typed `Socket<ServerToClientEvents, ClientToServerEvents>` — which clears the 43 `any` warnings currently exempted via per-file ESLint override in `eslint.config.mjs`, and surfaces any *future* drift at compile time instead of at runtime.
3. Dead wire traffic (~20 events with no consumer or no producer) is removed.

## Why this is its own phase, not a lint cleanup

The phase 4 commit (`e2a5c33`, "type remaining anys in component code; exempt 4 socket-boundary files") established the per-file ESLint override and documented why: typing the socket through the schema surfaces pre-existing drift that this phase exists to fix. Removing the override is the last step of this phase.

## Scope decomposition (recommended plan order)

The research doc's "Recommended phase scope" section maps cleanly to 4 plans. Each plan should be its own atomic commit so a regression bisects to a single change.

### Plan 45-01 — Critical handler/emit hot-fixes (no schema changes)

**Files:** `client/src/lib/socket/eventHandlers.ts`, `server/events/ClientEventEmitter.ts`

Three real runtime bugs, handler/emit edits only:

| Item | Fix |
|---|---|
| **C1** `combat:boss_healed` | Handler reads `data.newHealth`; change to `data.newHp` (one word, eventHandlers.ts:505,508). |
| **C2** `estimation:timer_started` | Handler reads non-existent `data.startedAt`; derive `startedAt = data.endsAt - data.durationMs` in the handler. |
| **C3** `estimation:timer_resumed` | Handler reads non-existent `data.startedAt`/`data.durationMs`; recompute from `data.endsAt` (resume payload only carries `endsAt`). |
| **C5** `combat:player_revived` | `ClientEventEmitter.ts:254-260` hardcodes `newHp: 50`. Thread `payload.newHp` from `CombatManager` through. |
| **C6** `combat:player_damaged` | `ClientEventEmitter.ts:238-245` hardcodes `source: 'boss'`. Thread `payload.source` through. |

**Must-haves:**
- Vitest covers the boss-heal handler and asserts `currentBoss.currentHealth` is set to a number after the event (currently would assert it's `undefined`).
- Timer-state test covers a pause→resume cycle and asserts `currentTimer.startedAt` is defined and `Date.now() - startedAt` is finite.
- Revive-flow test asserts the client HP after revive matches the value the server computed, not the hardcoded `50`.

**Risk:** Low. Handler-only edits don't touch the wire. The revive/damage source threading needs the eventBus payload typed to include the new fields — make sure no internal `combat:player_revived` emitter on the server omits `newHp` (search for all `eventBus.emit('combat:player_revived'`).

### Plan 45-02 — Rewrite `boss_ring_attack` schema to match emit + handler reality

**Files:** `shared/gameEvents.ts`, `server/gameState.ts` (remove the `eslint-disable` for `createRingAttack` and `attackBoss`), `client/src/components/game/PlayerController.tsx` (remove the inline `eslint-disable @typescript-eslint/no-explicit-any` block around the handlers).

| Item | Fix |
|---|---|
| **C4** `boss_ring_attack` | Schema currently declares `{bossX, bossY, projectiles:[{x,y,targetX,targetY,emoji}]}`. Both server and client speak `{type:'ring', projectiles:[{id, startX, startY, targetX, targetY, progress, emoji}], targetCount}`. Rewrite the schema to match reality. |

**Must-haves:**
- After the rewrite, `createRingAttack` returns the typed shape (delete the `as any` and the explanatory disable comments added in commit `a1a78f3`).
- `PlayerController` handlers compile without the `eslint-disable` block (delete commit `e2a5c33`'s `/* eslint-disable @typescript-eslint/no-explicit-any */` wrapper).
- Existing E2E or visual-regression coverage on ring attack still passes; if no coverage exists, add a basic happy-path Playwright trace.

**Risk:** Low. The change is purely additive to the type system — runtime shape doesn't move.

### Plan 45-03 — Delete dead wire traffic

**Files:** `server/websocket.ts`, `server/gameState.ts`, `server/events/ClientEventEmitter.ts`, `shared/gameEvents.ts`, `shared/clientEvents.ts`

The audit found ~20 events that fall into one of two buckets: emitted-without-listener or declared-without-producer. Each needs a per-event "delete or rewire" decision.

| Item | Resolution |
|---|---|
| **H1** Legacy `as any` family in `websocket.ts` (`estimation_started`, `vote_state_updated`, `timer_paused/resumed/extended`, `estimate_forced`) | Delete the emits. Superseded by fine-grained `estimation:*` events. |
| **H2** `consensus_countdown_update` (gameState.ts:1718) | Delete emit. Lobby type still declares `consensusCountdown` field (`gameEvents.ts:76-80`) — investigate whether the UX it was meant to power is gone too, and clean up the field if so. |
| **H3** `estimation:discussion_started` bridge | Delete emit (no listener) OR add handler if discussion-banner UX is intended. Confirm with product intent. |
| **H5** Dead-listener cluster (17 events: `score_submitted`, `scores_revealed`, `voting_timeout`, `modifier_updated`, `player_attacked`, `party_healed`, `revive_*`, `boss_defeated`, `game_over`, `youtube_play_synced`, `youtube_stop_synced`, etc.) | Per-event: most are post-Phase-42 cleanup (fine-grained equivalents exist). Two need verification before deletion: **`youtube_play_synced`/`youtube_stop_synced`** (likely a silently broken sync feature) and **`revive_complete`/`revive_progress`/`revive_cancelled`** (likely broken multiplayer revive feedback). For each: either confirm fine-grained replacement is wired and delete, or add the missing handler. |
| **H8** `combat:revival_*` vs legacy `revive_*` duplication | Resolves with the H5 revive triage above. |
| **H9** `session:player_reconnected` declared in `clientEvents.ts` only, never emitted | Delete the type. |

**Must-haves:**
- After this plan, grepping for `socket.on(` events that don't appear in `ServerToClientEvents` (or vice versa) returns nothing.
- Manual smoke test confirms youtube sync and multiplayer revive UX work end-to-end (these are the two items most likely to surface a regression).

**Risk:** Medium. Each H5 deletion needs verification that a fine-grained replacement exists and is wired; otherwise we'd be deleting a feature, not dead code.

### Plan 45-04 — Type the socket, remove the ESLint override, sweep low-priority cleanup

**Files:** `client/src/lib/socket/eventHandlers.ts`, `client/src/lib/stores/useEventSync.ts`, `client/src/lib/stores/useWebSocket.tsx`, `server/websocket.ts`, `eslint.config.mjs`, `shared/socket-schemas.ts`, `shared/clientEvents.ts`, `shared/gameEvents.ts`

The payoff plan. With 45-01..03 done, the schema and reality agree and a typed socket should compile.

| Item | Fix |
|---|---|
| Type the client socket | Change `setupEventHandlers(socket: Socket)` to `Socket<ServerToClientEvents, ClientToServerEvents>`. Delete all `(data: any) =>` annotations — TypeScript infers payload types from the event map. |
| Type the server socket | Same treatment on `server/websocket.ts` — `Socket<ClientToServerEvents, ServerToClientEvents>`. |
| **H7 / L1** Dedupe `clientEvents.ts` ⇄ `gameEvents.ts` | Pick `gameEvents.ts` as canonical (it's the one wired into the Socket type). Migrate any unique types from `clientEvents.ts` into it. Delete `clientEvents.ts`. Resolves the `attackType` strict-vs-string disagreement. |
| **L9** `request_missed_events` `as any` cast | Drop the cast. |
| **L7** `lobby_player_charge.chargePower` required on broadcast vs optional on input | Align — make optional on broadcast. |
| Remove ESLint override | Delete the per-file `no-explicit-any: off` override in `eslint.config.mjs` for the 4 socket-boundary files. |
| **L2, L3, L8** Zod registry coverage gaps | Add missing entries to `socket-schemas.ts`. Bring `game_error` schema in sync with `gameEvents.ts`. Add parameterless event entries. |
| **L4, L5, L6** Duplicate emits (`boss_attacked` + `combat:boss_damaged`, `boss_healed` + `combat:boss_healed`, `avatar_selected` + `session:avatar_selected`) | Keep fine-grained, delete legacy emits + their handlers. |
| **L10** Verify each `session:*` handler in `eventHandlers.ts` has a matching emit site | Audit; fix any missing emits surfaced by the typed-socket compile. |
| **L11, L12** | Cosmetic — fold into the same commit. |

**Must-haves:**
- `npm run check` and `npm run lint` are clean with the override deleted.
- 736+ tests pass.
- A typed Socket compile catches the next drift immediately, not in production.

**Risk:** Medium-high — this is the integration step. If 45-01..03 missed anything, it surfaces here as type errors. Budget time for follow-up handler/emit fixes once typed compile runs.

## Success criteria (phase-level)

The phase is done when **all** are true:

1. The three runtime bugs (C1, C2, C3) are fixed and have regression test coverage.
2. The two hardcode bugs (C5, C6) thread real values from the server through the bridge.
3. `boss_ring_attack` schema matches what server emits and client reads — no `as any` workarounds remain in `createRingAttack`, `attackBoss`, or the `PlayerController` ring-attack handler.
4. The `as any` legacy emit family is gone from `server/websocket.ts`.
5. Either `youtube_*_synced` and `revive_*` events have working handlers, or they're deleted as confirmed-dead features (with the user signing off on deletion).
6. The 4-file `no-explicit-any: off` ESLint override is gone, and the client + server sockets are typed via the schema. The 43 `(data: any) =>` annotations in `eventHandlers.ts` are inferred from the schema instead.
7. `clientEvents.ts` is deleted (or absorbed into `gameEvents.ts`); there is one source of truth for socket event types.
8. `npm run lint` reports 0 problems, `npm run check` is clean, all tests pass, manual smoke test of the four phases (lobby, battle, reveal, discussion) passes including timer pause/resume and at least one revive.

## Out of scope

- Adding new events. This phase is reconcile-only.
- Migrating to a different transport (Socket.IO → something else). Out of scope.
- Replacing the `eventBus`/`ClientEventEmitter` bridge architecture. Out of scope — only edits inside it.
- A formal Zod runtime validator for outbound (server→client) events. Inbound (C→S) already has one; outbound is a follow-up.

## Estimated effort

- **45-01**: 2-3 hours (small handler edits + tests)
- **45-02**: 1-2 hours (schema rewrite, cleanup)
- **45-03**: 4-6 hours (per-event triage of H5 cluster is the long pole; youtube/revive verification dominates)
- **45-04**: 4-6 hours (the typed-socket pass will surface fix-up work; budget for it)

Total: ~12-17 hours of focused work. Could compress with parallel work on 45-01 and 45-02 (independent files).
