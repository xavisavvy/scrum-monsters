---
phase: 19-team-combos
plan: 02
subsystem: combat
tags: [combos, socket-io, event-forwarding, infrastructure]

# Dependency graph
requires:
  - phase: 19-team-combos-01
    provides: ComboManager domain, combo event definitions
  - phase: 18-class-abilities-02
    provides: ClientEventEmitter pattern for ability events
provides:
  - Combo events broadcast to all clients via Socket.IO
  - Complete server-to-client combo pipeline
  - CombatManager.applyComboMultiplier for combo damage application
affects: [19-team-combos, socket-handlers, client-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ClientEventEmitter forwarding with seq/timestamp enrichment"
    - "Domain event subscription in constructor for automatic wiring"
    - "CombatManager adapter pattern for combo damage application"
    - "Lifecycle event wiring for combo state reset and cleanup"

key-files:
  created: []
  modified:
    - shared/gameEvents.ts
    - server/domains/index.ts
    - server/domains/CombatManager.ts
    - server/events/ClientEventEmitter.ts
    - shared/comboTypes.ts
    - server/domains/ComboManager.ts

key-decisions:
  - "visualEffect added to ComboTriggeredPayload for client rendering flexibility"
  - "combo:triggered uses 'combo:comboId' playerId prefix for XP tracking distinction"
  - "applyComboMultiplier checks boss defeat after damage application"
  - "Combo state lifecycle: reset on battle_initialized, cleanup on lobby_destroyed"

patterns-established:
  - "Domain manager instantiation pattern: deps passed with adapter objects"
  - "Event lifecycle wiring: reset on new ticket, cleanup on lobby destroy"
  - "ClientEventEmitter forwarding: map internal payload to client payload with enrichment"

# Metrics
duration: 4min
completed: 2026-02-11
---

# Phase 19 Plan 02: Combo Infrastructure Wiring Summary

**Wire ComboManager into server infrastructure with Socket.IO events, CombatManager integration, and ClientEventEmitter forwarding for complete server-to-client combo pipeline**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-02-11T20:33:33Z
- **Completed:** 2026-02-11T20:37:41Z
- **Tasks:** 2
- **Files modified:** 6 files (all modifications, no new files)

## Accomplishments

- Added combo:triggered and combo:consensus_ultimate to ServerToClientEvents interface
- Instantiated ComboManager in domains/index.ts with correct dependency wiring
- Added CombatManager.applyComboMultiplier method for combo damage with boss phase transition checks
- Wired combo lifecycle events: reset on combat:battle_initialized, cleanup on session:lobby_destroyed
- Added visualEffect field to ComboTriggeredPayload for client rendering
- Forwarded combo:triggered and combo:consensus_ultimate events via ClientEventEmitter with seq/timestamp

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Socket.IO events and instantiate ComboManager** - `98087d0` (feat)
   - combo:triggered and combo:consensus_ultimate in ServerToClientEvents
   - ComboManager instantiation with combatManager, getPlayerClass, getVotingStartTime deps
   - CombatManager.applyComboMultiplier applies damage, emits boss_damaged, checks phases
   - Lifecycle wiring: reset combos on battle_initialized, cleanup on lobby_destroyed

2. **Task 2: Forward combo events via ClientEventEmitter** - `b6c6dca` (feat)
   - visualEffect added to ComboTriggeredPayload and emitted from ComboManager
   - combo:triggered forwarding with all fields (comboId, name, participants, damage, multiplier, visualEffect)
   - combo:consensus_ultimate forwarding with damage, multiplier, votingDurationMs
   - Both events enriched with seq/timestamp via emitToLobby pattern

**Plan metadata:** *(will be committed in final metadata commit)*

## Files Created/Modified

**Created:** None

**Modified:**
- `shared/gameEvents.ts` - Added combo:triggered and combo:consensus_ultimate to ServerToClientEvents
- `server/domains/index.ts` - Instantiated comboManager with deps, wired lifecycle events, exported
- `server/domains/CombatManager.ts` - Added applyComboMultiplier method with phase transition checks
- `server/events/ClientEventEmitter.ts` - Added combo event forwarding section
- `shared/comboTypes.ts` - Added visualEffect to ComboTriggeredPayload
- `server/domains/ComboManager.ts` - Emit visualEffect in combo:triggered event

## Decisions Made

1. **visualEffect in ComboTriggeredPayload:** Added to shared payload type instead of looking up ComboDefinition in ClientEventEmitter. Cleaner separation of concerns - ComboManager owns combo data, ClientEventEmitter is pure forwarder.

2. **combo:comboId playerId prefix:** Uses `playerId: 'combo:' + comboId` for boss_damaged events from combos. Allows ProgressionManager to distinguish combo damage from player damage for XP allocation decisions.

3. **applyComboMultiplier checks boss defeat:** Unlike applyAbilityDamageToBoss which relies on external defeat detection, applyComboMultiplier explicitly checks `hp <= 0` and emits boss_defeated. Ensures combo killing blow triggers victory correctly.

4. **Lifecycle event wiring in domains/index.ts:** Follows established pattern from abilityManager. Combo state reset on new ticket (battle_initialized) ensures fresh cooldowns per ticket. Cleanup on lobby_destroyed prevents memory leaks.

## Deviations from Plan

None - plan executed exactly as written. All infrastructure wiring completed successfully with no blocking issues or architectural changes needed.

## Issues Encountered

None - smooth execution. TypeScript compilation clean, all 542 tests passing, no regressions.

## Next Phase Readiness

ComboManager fully wired into server infrastructure. Events flow: ability:used → ComboManager detects → combo:triggered emitted → ClientEventEmitter forwards → clients receive with seq/timestamp.

**Dependencies satisfied:**
- Plan 19-01 ComboManager domain ✓
- Plan 18-02 ClientEventEmitter pattern ✓

**Provides for next plans:**
- combo:triggered events with all payload fields for client UI
- combo:consensus_ultimate events for ultimate attack display
- CombatManager.applyComboMultiplier for damage application
- Combo state management integrated with lobby lifecycle

Ready for Plan 19-03 (Client UI components for combo visual feedback).

---
*Phase: 19-team-combos*
*Completed: 2026-02-11*


## Self-Check: PASSED

All modified files verified to exist:
- ✓ shared/gameEvents.ts (combo:triggered and combo:consensus_ultimate defined)
- ✓ server/domains/index.ts (comboManager exported)
- ✓ server/domains/CombatManager.ts (applyComboMultiplier method exists)
- ✓ server/events/ClientEventEmitter.ts (combo event forwarding exists)
- ✓ shared/comboTypes.ts (visualEffect in ComboTriggeredPayload)
- ✓ server/domains/ComboManager.ts (visualEffect emitted)

All commits verified in git history:
- ✓ 98087d0 (Task 1: feat - wire ComboManager into infrastructure)
- ✓ b6c6dca (Task 2: feat - forward combo events to clients)

Key integration verified:
- ✓ combo:triggered in ServerToClientEvents
- ✓ comboManager instance in domains/index.ts
- ✓ applyComboMultiplier in CombatManager.ts
- ✓ combo:triggered forwarding in ClientEventEmitter.ts
