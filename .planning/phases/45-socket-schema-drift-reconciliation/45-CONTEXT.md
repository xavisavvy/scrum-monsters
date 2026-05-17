# Phase 45 — Socket Schema Drift Reconciliation (Context)

**Inputs:**
- [`45-RESEARCH.md`](./45-RESEARCH.md) — full drift inventory (~25 items, 6 Critical / 6 High categories / 12 Low)
- [`45-H5-TRIAGE.md`](./45-H5-TRIAGE.md) — per-event verdict for the H5 dead-listener cluster (11 safe-to-delete, 2 broken-feature clusters, 1 product decision)

## Goal

Bring `shared/gameEvents.ts` (the typed `ServerToClientEvents` / `ClientToServerEvents` contracts) into agreement with what the server actually emits and what the client actually reads, so:

1. The three runtime bugs the audit surfaced (boss-heal HP corruption, timer state lost on resume, hardcoded revive HP that drifts for non-100-maxHp classes) stop silently corrupting client state.
2. Two confirmed-broken features (multiplayer revive UX, YouTube music sync) get their handlers wired.
3. One missing-feedback feature (cleric heal-party) gets a `combat:player_healed` event + floating-heal popup.
4. ~17 events of confirmed-dead wire traffic are removed.
5. The client `Socket` can be typed `Socket<ServerToClientEvents, ClientToServerEvents>` — clearing the 43 `any` warnings exempted via per-file ESLint override in `eslint.config.mjs` (added in commit `e2a5c33`) and surfacing future drift at compile time instead of runtime.

## Why this is its own phase, not lint cleanup

Commit `e2a5c33` established the per-file ESLint override with a comment pointing to this phase as the resolution. Removing the override is the last step of this phase.

## Decisions captured (2026-05-17 user input)

After the H5 triage surfaced two broken-feature clusters and one product question, the user picked:

- **Revival UX** — Add handlers for `combat:revival_started` / `combat:revival_cancelled`, and define+emit a new `combat:revival_progress` event with a progress bar. Restores the multiplayer revive feedback that was lost.
- **YouTube sync** — Wire up listeners. Host music plays for everyone, not just the host.
- **Heal-party** — Add a new `combat:player_healed` event + floating-heal popup, mirroring the damage popup pattern.

## Adjustments from initial draft

- **C6 (`combat:player_damaged` hardcoded `source: 'boss'`)** demoted from Critical to Low. Validation showed the only emit site is the boss-damage path (`CombatManager.ts:1299`); there is no PvP damage flow today. The hardcode is currently correct. The schema field is forward-looking for a future PvP feature; address when that feature lands or in 45-05's low-priority sweep.
- **C5 (`combat:player_revived` hardcoded `newHp: 50`)** is worse than the inventory said. Server uses `targetState.maxHp * 0.5` (`CombatManager.ts:1599`), so the `50` only happens to match classes with `maxHp = 100`. Any class with different maxHp drifts on every revive. Stays Critical.

## Plan decomposition (5 sub-plans)

| Plan | Scope | Depends on |
|---|---|---|
| **45-01** | Critical handler/emit hot-fixes: C1 boss_healed, C2/C3 timer state, C5 revive HP. No schema changes. | — |
| **45-02** | Rewrite `boss_ring_attack` schema to match emit+handler reality (C4); remove the inline `as any` workarounds. | — |
| **45-03** | Delete confirmed-dead wire traffic: H1 as-any family, H2 consensus_countdown_update, H3 estimation:discussion_started bridge, H5's 11 SAFE_TO_DELETE events, H9 dead `clientEvents.ts` type. | — |
| **45-04** | Restore broken features (per 2026-05-17 user decisions): wire revival UX with new `combat:revival_progress` event, wire YouTube sync handlers, add `combat:player_healed` event + floating-heal popup. | 45-03 (file overlap in `websocket.ts`/`ClientEventEmitter.ts`/`eventHandlers.ts`; cleaner to delete first then add) |
| **45-05** | Type the socket, remove ESLint override, dedupe `clientEvents.ts` → `gameEvents.ts`, sweep all Low items, address C6 source field. | 45-01, 45-02, 45-03, 45-04 |

**Parallelism:** 45-01, 45-02, and 45-03 are file-independent and can run concurrently. 45-04 must follow 45-03. 45-05 must run last (integration step that removes the override).

## Phase-level success criteria

The phase is done when **all** are true:

1. C1, C2, C3, C5 are fixed with regression test coverage. C6 is documented and resolved (either real fix or explicit "fine until PvP" note in code).
2. `boss_ring_attack` schema matches reality; no `as any` workarounds remain for ring attack.
3. The H1 `as any` legacy emit family is gone from `server/websocket.ts`.
4. The 11 H5 SAFE_TO_DELETE emits are removed; H2, H3, H9 cleaned up.
5. Revival UX: peers see who is reviving whom, the per-tick progress bar works, and cancel shows feedback.
6. YouTube sync: host music plays on all peer clients.
7. Heal-party: cleric heals show a floating-heal popup on each healed player.
8. The 4-file `no-explicit-any: off` ESLint override is gone, both client and server sockets are typed via the schema, and the 43 `(data: any) =>` annotations in `eventHandlers.ts` are inferred.
9. `clientEvents.ts` is deleted (absorbed into `gameEvents.ts`); single source of truth for socket types.
10. `npm run lint` reports 0 problems, `npm run check` is clean, all tests pass, smoke test of lobby/battle/reveal/discussion + revive + heal-party + youtube-host-music passes.

## Out of scope

- Adding new socket events beyond the three explicitly chosen above (`combat:revival_progress`, `combat:player_healed`, plus the existing `combat:revival_started`/`combat:revival_cancelled` getting handlers).
- Migrating Socket.IO transport.
- Replacing the `eventBus`/`ClientEventEmitter` bridge architecture (only edits inside it).
- Adding a Zod runtime validator for outbound (server→client) events; inbound already has one. Outbound is a follow-up.
- Real PvP damage source threading (deferred to whenever PvP feature lands).

## Estimated effort

| Plan | Estimate |
|---|---|
| 45-01 | 2–3 h (handler edits + tests) |
| 45-02 | 1–2 h (schema rewrite + cleanup) |
| 45-03 | 3–4 h (deletion + grep verification, no behavior change) |
| 45-04 | 5–7 h (3 new feature wirings, each needs handler + emit + test) |
| 45-05 | 4–6 h (typed-socket integration surfaces fix-up work; budget for it) |
| **Total** | **15–22 h** focused work |

Could compress by running 45-01, 45-02, 45-03 in parallel — saves ~2 h.
