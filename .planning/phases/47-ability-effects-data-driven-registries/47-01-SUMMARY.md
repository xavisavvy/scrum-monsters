---
phase: 47-ability-effects-data-driven-registries
plan: 01
subsystem: api
tags: [ability-system, typescript, tdd, websocket, game-events]

# Dependency graph
requires: []
provides:
  - "BuffType / DebuffType literal union types in shared/abilityTypes.ts"
  - "AbilityDefinition.durationMs optional field (buff active duration)"
  - "AbilityEffectAppliedPayload with optional buffType / debuffType / durationMs"
  - "Wire event ServerToClientEvents['ability:effect_applied'] carrying the three new optional fields"
  - "AbilityManager.applyAbilityEffect forwards all three fields from abilityDef"
  - "ClientEventEmitter bridge forwards all three fields to wire"
affects: [47-02, 47-03, ability-effects-handler, client-ability-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN: test file written before implementation, failing tests committed first"
    - "Additive optional payload fields: extend internal bus type and wire type together to keep them in sync"
    - "Explicit bridge destructuring: ClientEventEmitter lists every forwarded field explicitly (no spread) to prevent silent drops"

key-files:
  created:
    - shared/abilityTypes.test.ts
  modified:
    - shared/abilityTypes.ts
    - shared/gameEvents.ts
    - server/domains/AbilityManager.ts
    - server/events/ClientEventEmitter.ts
    - server/domains/AbilityManager.test.ts

key-decisions:
  - "BuffType union = 'damage_boost' | 'crit_boost' | 'dodge' | 'cooldown_reduction' — derived from actual CLASS_ABILITY_CONFIGS values, no extras"
  - "DebuffType union = 'attack_slow' — single current value; union extensible without breaking changes"
  - "durationMs populated at 10000ms for buff abilities and 8000ms for oathbreaker_aura_of_dread; paladin shield abilities deliberately omitted (handler supplies default)"
  - "gameEvents.ts wire type uses inline import('./abilityTypes').BuffType to avoid circular imports"

patterns-established:
  - "Literal unions for buffType/debuffType: string narrowing pattern for game ability metadata"

requirements-completed: [EXT-01]

# Metrics
duration: 10min
completed: 2026-06-22
---

# Phase 47 Plan 01: Ability Effects Payload Extension Summary

**BuffType/DebuffType literal unions added; AbilityDefinition, AbilityEffectAppliedPayload, and the ability:effect_applied wire event extended with buffType/debuffType/durationMs; AbilityManager and ClientEventEmitter bridge forward all three fields**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-22T05:55:00Z
- **Completed:** 2026-06-22T06:05:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Exported `BuffType` and `DebuffType` as literal unions narrowing the formerly-bare `string` fields on `AbilityDefinition`
- Added `durationMs?` to `AbilityDefinition` and populated it on the 6 buff/debuff abilities (10000ms buffs, 8000ms debuff); shield abilities intentionally omitted
- Extended `AbilityEffectAppliedPayload` and the `ability:effect_applied` wire event with all three optional fields
- Updated `AbilityManager.applyAbilityEffect` to include `buffType`/`debuffType`/`durationMs` in the emitted event
- Updated `ClientEventEmitter` bridge to explicitly forward all three fields (preventing silent drops from destructuring)

## Task Commits

Each task was committed atomically using TDD RED → GREEN:

1. **Task 1 RED: Failing tests for BuffType/DebuffType unions** - `c9c5161` (test)
2. **Task 1 GREEN: Add BuffType/DebuffType unions and extend payload types** - `816852f` (feat)
3. **Task 2 RED: Failing tests for buffType forwarding in AbilityManager** - `c122ec8` (test)
4. **Task 2 GREEN: Forward buffType/debuffType/durationMs through emit site and bridge** - `5336776` (feat)

_Note: TDD tasks have separate test and feat commits_

## Files Created/Modified
- `shared/abilityTypes.ts` - Added BuffType/DebuffType unions; narrowed AbilityDefinition fields; added durationMs; extended AbilityEffectAppliedPayload
- `shared/gameEvents.ts` - Extended ServerToClientEvents['ability:effect_applied'] wire type with three optional fields
- `server/domains/AbilityManager.ts` - applyAbilityEffect now forwards buffType/debuffType/durationMs from abilityDef
- `server/events/ClientEventEmitter.ts` - ability:effect_applied bridge now explicitly forwards buffType/debuffType/durationMs
- `shared/abilityTypes.test.ts` - New test file: 13 tests covering union values, durationMs population, and payload type shape
- `server/domains/AbilityManager.test.ts` - Extended with 2 new tests: buffType forwarded for warrior_berserker_rage; undefined for paladin_holy_shield

## Decisions Made
- `BuffType` derived from actual `CLASS_ABILITY_CONFIGS` values only; no invented extras as the plan specified
- `gameEvents.ts` uses inline `import('./abilityTypes').BuffType` syntax to keep the wire type narrowed without introducing a circular import
- `durationMs` on oathbreaker_aura_of_dread set to 8000ms (slightly shorter than 10000ms buffs, consistent with a debuff flavor)
- No changes to `server/domains/index.ts` (handler branches are plan 47-02, per sequencing requirement)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Minor lint warning: `AbilityDefinition` was imported in the test file but only used as a type annotation — fixed by removing the unused import.

## TDD Gate Compliance

- RED gate: `c9c5161` (test(47-01): add failing tests for BuffType/DebuffType unions) — PRESENT
- GREEN gate: `816852f` (feat(47-01): add BuffType/DebuffType unions...) — PRESENT
- RED gate: `c122ec8` (test(47-01): add failing tests for buffType/debuffType forwarding) — PRESENT
- GREEN gate: `5336776` (feat(47-01): forward buffType/debuffType/durationMs...) — PRESENT

## Known Stubs

None - this plan is purely additive type/forwarding. The new payload fields flow through but handler branches that consume them are intentionally deferred to plan 47-02.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 47-02 (ability:effect_applied handler branches) can now read `buffType`/`debuffType`/`durationMs` from the payload — the forwarding chain is complete
- `damage_boost` and `shield` buffTypes have existing consumers in the buff system (`getDamageMultiplier`, `reduceShield`) and will work end-to-end after plan 47-02 adds the handler branches
- `crit_boost`, `dodge`, and `attack_slow` are stored and forwarded but have no runtime consumers yet — future work per CONTEXT deferred section

## Self-Check: PASSED

- shared/abilityTypes.test.ts: FOUND
- shared/abilityTypes.ts: FOUND
- server/domains/AbilityManager.ts: FOUND
- server/events/ClientEventEmitter.ts: FOUND
- 47-01-SUMMARY.md: FOUND
- c9c5161 (test RED task 1): FOUND
- 816852f (feat GREEN task 1): FOUND
- c122ec8 (test RED task 2): FOUND
- 5336776 (feat GREEN task 2): FOUND

---
*Phase: 47-ability-effects-data-driven-registries*
*Completed: 2026-06-22*
