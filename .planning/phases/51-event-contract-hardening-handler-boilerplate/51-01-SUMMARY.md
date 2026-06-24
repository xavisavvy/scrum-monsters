---
phase: 51-event-contract-hardening-handler-boilerplate
plan: "01"
subsystem: shared-types/server-emit
tags: [type-safety, compile-time, event-contract, EXT-04]
dependency_graph:
  requires: []
  provides:
    - keyof ServerToClientEvents constraint on emitFineGrained/emitToLobby
    - _BRIDGE_COVERAGE satisfies guard
    - Sequenced<T> exported type
    - ItemType substitution in 4 wire payloads
    - AvatarClass substitution in 3 wire payloads
    - ClientEventSchemas satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>
    - socket-schemas parity test (48 entries)
  affects:
    - server/events/ClientEventEmitter.ts
    - server/websocket.ts
    - shared/gameEvents.ts
    - shared/socket-schemas.ts
tech_stack:
  added: []
  patterns:
    - TypeScript satisfies operator for compile-time shape guards
    - keyof constraint on emitter event params
    - Sequenced<T> intersection type for DRY seq/timestamp envelope
key_files:
  created:
    - shared/socket-schemas.test.ts
  modified:
    - server/events/ClientEventEmitter.ts
    - server/websocket.ts
    - shared/gameEvents.ts
    - shared/socket-schemas.ts
decisions:
  - EXT-04: emit constraint is forward-prevention only — all 22 existing call sites were valid
  - Sequenced<T> excludes 4 control messages (system:missed_events, server_shutdown, connection_lost, reconnect_attempt)
  - class_mastery:sync masteryData Record key left as string (out-of-scope, plan warning 2)
  - bossType and minion attackType left as string (explicit non-goals per research)
  - _BRIDGE_COVERAGE placed as module-level const outside class, after class closing brace
  - void _BRIDGE_COVERAGE added to suppress unused variable lint warning
metrics:
  duration_minutes: 17
  completed_date: "2026-06-24"
  tasks_completed: 2
  files_modified: 4
  files_created: 1
---

# Phase 51 Plan 01: EXT-04 Event-Contract Hardening Summary

Compile-time event contract enforced end-to-end. emitFineGrained and emitToLobby constrained to keyof ServerToClientEvents, _BRIDGE_COVERAGE + ClientEventSchemas satisfies guards added, Sequenced<T> wraps the ~40 sequenced events, ItemType/AvatarClass substituted at 7 sites. No wire or runtime behavior change.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Constrain emitter signatures + add _BRIDGE_COVERAGE satisfies guard | b09e4ca | server/events/ClientEventEmitter.ts, server/websocket.ts |
| 2 | Sequenced<T> + ItemType/AvatarClass substitutions + ClientEventSchemas satisfies + parity test | a2f0b34 | shared/gameEvents.ts, shared/socket-schemas.ts, shared/socket-schemas.test.ts |

## Drift-Injection Proof (Required)

The contract was proven to CATCH drift, not just compile green. Before committing Task 1, a deliberate injection was performed:

**Injection (not committed):**
1. Changed one `emitFineGrained` call site in `server/websocket.ts` from `'session:tickets_updated'` to `'combat:NONEXISTENT'`
2. Added `'combat:NONEXISTENT': true` key to `_BRIDGE_COVERAGE` in `ClientEventEmitter.ts`

**Result:**
```
server/events/ClientEventEmitter.ts(721,3): error TS2353: Object literal may only specify
known properties, and ''combat:NONEXISTENT'' does not exist in type
'Partial<Record<keyof ServerToClientEvents, true>>'.

server/websocket.ts(621,33): error TS2345: Argument of type '"combat:NONEXISTENT"' is not
assignable to parameter of type 'keyof ServerToClientEvents'.
```

**Revert:** Both injections were reverted and `npm run check` confirmed clean again. The contract catches drift at both the call site and the bridge coverage guard.

## What Was Built

### Task 1: Emitter Constraint + Bridge Coverage Guard

**server/events/ClientEventEmitter.ts:**
- Added `ServerToClientEvents` to existing import
- `emitFineGrained` public method: `event: string` -> `event: keyof ServerToClientEvents`
- `emitToLobby` private method: `event: string` -> `event: keyof ServerToClientEvents`
- `this.io.to(lobbyId).emit(event as string, payload)` cast added at the Socket.IO call site (Pitfall 5)
- `_BRIDGE_COVERAGE` const added after class closing brace as module-level const, with `satisfies Partial<Record<keyof ServerToClientEvents, true>>`
  - Enumerates all 62 bridged wire names from setupInternalEventListeners
  - Notable remaps correctly captured: `'host_transferred'` (not `'session:host_transferred'`), `'estimation:consensus_reached'`, `'stats:session_summary'`
- `void _BRIDGE_COVERAGE` added to suppress unused-variable lint error

**server/websocket.ts:**
- `emitFineGrained` closure at L129: `event: string` -> `event: keyof ServerToClientEvents`
- `ServerToClientEvents` already imported (no new import needed)
- All 20 call sites compile unchanged (all were valid literals)
- `server/gameState.ts` NOT modified (2 call sites pass `'estimation:votes_revealed'` which is valid)

### Task 2: Sequenced<T> + Wire-Union Substitutions + satisfies Guard + Parity Test

**shared/gameEvents.ts:**
- Added `import type { ItemType } from './itemTypes'` at top
- Added `export type Sequenced<T> = T & { seq: number; timestamp: number }` with JSDoc
- Applied `Sequenced<T>` to all fine-grained events in `ServerToClientEvents`:
  - session:* (10 events)
  - estimation:* (11 events including estimation:discussion_vote_updated)
  - combat:* (25 events including minion events)
  - progression:* (3 events: xp_awarded, level_up, sync)
  - class_mastery:* (3 events: xp_awarded, tier_up, sync)
  - ability:* (3 events: used, cooldown_started, effect_applied)
  - combo:* (2 events: triggered, consensus_ultimate)
  - item:* (3 events: awarded, used, effect_applied)
  - stats:session_summary (1 event)
  - system:full_state (1 event)
- 4 control messages explicitly NOT wrapped: `system:missed_events`, `server_shutdown`, `connection_lost`, `reconnect_attempt`
- ItemType substitutions (string -> ItemType):
  - L346: `use_item` (ClientToServerEvents): `itemType: ItemType`
  - L576: `item:awarded`: `itemType: ItemType`
  - L582: `item:used`: `itemType: ItemType`
  - L588: `item:effect_applied`: `itemType: ItemType`
- AvatarClass substitutions (string -> AvatarClass):
  - L482: `combat:minion_spawned`: `avatar: AvatarClass`
  - L511: `class_mastery:xp_awarded`: `avatarClass: AvatarClass`
  - L519: `class_mastery:tier_up`: `avatarClass: AvatarClass`
- Unchanged (explicit non-goals):
  - `bossType: string` (combat:boss_phase_transition, combat:boss_telegraph)
  - `attackType: string` (combat:minion_attack)
  - `masteryData: Record<string, ...>` key in class_mastery:sync (out-of-scope per plan warning 2)

**shared/socket-schemas.ts:**
- Added `import type { ClientToServerEvents } from './gameEvents'`
- Replaced `} as const;` with `} satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>;`
- `as const` fully removed (mutually exclusive with `satisfies`, per Pitfall 1)
- `ClientEventName = keyof typeof ClientEventSchemas` and `getClientEventSchema` still resolve correctly

**shared/socket-schemas.test.ts (new):**
- Vitest test asserting `Object.keys(ClientEventSchemas).length === 48`
- Confirms compile-time (satisfies) and runtime (count) parity

## Deviations from Plan

None — plan executed exactly as written.

Notable non-deviations (explicitly confirmed as correct):
- `void _BRIDGE_COVERAGE` was added to suppress ESLint unused-variable warning (not a deviation — this is the correct pattern for compile-time-only guards)
- `combat:boss_defeated` wrapped as `Sequenced<Record<never, never>>` since the original payload was `{ seq: number; timestamp: number }` with no other fields — this is the correct Sequenced<T> form for empty payloads

## Verification Results

| Check | Result |
|-------|--------|
| `npm run check` | PASSED (0 errors) |
| `npx vitest run shared/socket-schemas.test.ts` | PASSED (1 test, 48 entries) |
| `npm test` | PASSED (939 tests, 61 files) |
| `npm run lint` | PASSED (0 problems) |
| Drift injection proof | CONFIRMED (2 tsc errors on injection, clean on revert) |
| server/gameState.ts unchanged | CONFIRMED (not in any commit diff) |

## Known Stubs

None. All changes are pure type additions with no data sourcing.

## Threat Flags

None. This plan is compile-time only — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced.

## Self-Check: PASSED

- [x] shared/socket-schemas.test.ts created and committed (a2f0b34)
- [x] server/events/ClientEventEmitter.ts modified and committed (b09e4ca)
- [x] server/websocket.ts modified and committed (b09e4ca)
- [x] shared/gameEvents.ts modified and committed (a2f0b34)
- [x] shared/socket-schemas.ts modified and committed (a2f0b34)
- [x] b09e4ca exists in git log: FOUND
- [x] a2f0b34 exists in git log: FOUND
