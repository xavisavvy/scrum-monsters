---
phase: 47-ability-effects-data-driven-registries
plan: 02
subsystem: api
tags: [ability-system, typescript, tdd, buff-system, game-mechanics]

# Dependency graph
requires:
  - "47-01 (AbilityEffectAppliedPayload with buffType/debuffType/durationMs fields)"
provides:
  - "applyHealEffect shared helper — single HP-clamp heal loop used by both handlers"
  - "ActiveBuff.buffType widened to BuffType | 'shield' for stored-only buff kinds"
  - "ability:effect_applied buff branch — calls addBuff with payload.buffType (not hardcoded)"
  - "ability:effect_applied shield branch — calls addBuff with buffType 'shield'"
  - "ability:effect_applied debuff branch — stores into activeDebuffs map"
  - "activeDebuffs map + addDebuff/cleanupDebuffs infrastructure (timer-safe, lobby-scoped)"
  - "AbilityEffectHandler.test.ts — regression suite for all 8 affected abilities"
affects: [47-03, combat-buff-system, ability-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-private helper extraction: applyHealEffect deduplicates the HP-clamp loop"
    - "Separate debuff map: boss-targeted debuffs use activeDebuffs (not activeBuffs) to avoid type pollution"
    - "Payload-driven buffType: ability handler reads buffType from payload; item handler hardcodes damage_boost (correct for current items)"
    - "Integration test via shared eventBus: AbilityEffectHandler.test.ts imports eventBus/combatManager from index.ts and drives events directly"

key-files:
  created:
    - server/domains/AbilityEffectHandler.test.ts
  modified:
    - server/domains/index.ts

key-decisions:
  - "ActiveBuff.buffType widened to BuffType | 'shield' — getDamageMultiplier/getShieldAbsorption still narrow-match their literal types unchanged"
  - "activeDebuffs keyed by lobbyId (boss debuffs are lobby-scoped, not player-scoped) — separate from activeBuffs keyed by lobbyId:playerId"
  - "Buff branch uses payload.buffType ?? 'damage_boost' fallback — defensive default for callers that omit buffType"
  - "Shield monkey-patch (combatManager.applyDamageToPlayer) NOT refactored — Phase 48 concern per plan"
  - "Item handler damage_boost hardcode audited and confirmed correct for current item set (comment added)"
  - "crit_boost/dodge/cooldown_reduction/attack_slow stored but marked TODO — no consumer per CONTEXT deferred-ideas decision"

patterns-established:
  - "Shared heal helper pattern: extract HP-clamp loop to avoid duplication across event handlers"
  - "Separate debuff map pattern: boss-targeted state isolated from player-buff state"

requirements-completed: [EXT-01]

# Metrics
duration: 9min
completed: 2026-06-22
---

# Phase 47 Plan 02: Ability Effect Handler Branches Summary

**buff/shield/debuff branches added to ability:effect_applied handler; applyHealEffect helper extracts duplicated HP-clamp loop; activeDebuffs map stores boss debuffs; all 8 silently-dropped abilities now apply their effect**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-22T06:17:41Z
- **Completed:** 2026-06-22T06:27:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Extracted `applyHealEffect(lobbyId, targetIds, value, healerId)` as module-private helper, eliminating the byte-identical HP-clamp loop that was duplicated in both the `item:effect_applied` and `ability:effect_applied` heal branches
- Widened `ActiveBuff.buffType` from `'damage_boost' | 'shield'` to `BuffType | 'shield'` so `crit_boost`/`dodge`/`cooldown_reduction` buffs can be stored without a type error
- Added `ActiveDebuff` interface + `activeDebuffs` map keyed by `lobbyId` (boss debuffs are lobby-scoped, not player-scoped), with `addDebuff`/`cleanupDebuffs` helpers mirroring the `addBuff`/`cleanupBuffs` pattern (setTimeout-based expiry, no timer leaks)
- Added `cleanupDebuffs(payload.lobbyId)` to the `session:lobby_destroyed` handler alongside `cleanupBuffs`
- Added three new branches to the `ability:effect_applied` handler:
  - **buff**: calls `addBuff` with `buffType: payload.buffType` (NOT hardcoded) — `warrior_berserker_rage`/`bard_inspire` now functionally complete; `ranger_eagle_eye`/`rogue_shadow_step`/`wizard_time_warp` stored with TODO comments
  - **shield**: calls `addBuff` with `buffType: 'shield'` (15000ms default) — `paladin_holy_shield`/`paladin_divine_intervention` now functionally complete
  - **debuff**: calls `addDebuff` with `payload.debuffType` — `oathbreaker_aura_of_dread` stored with TODO comment
- Added `AbilityEffectHandler.test.ts` with 10 integration tests covering all 8 affected abilities + heal dedup + HP-clamp assertions

## Task Commits

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| Task 1+2+3 | feat | buff/shield/debuff branches, applyHealEffect, activeDebuffs, test suite | `17b7c3e` |

Note: Due to the pre-commit hook enforcing `npm test` on every commit, the TDD RED (test file with failing tests) and GREEN (implementation) had to be combined into a single passing commit. The failing tests were verified locally before implementation:
- 4 tests failed before implementation (buff × 2, shield × 2)
- All 10 tests pass after implementation

## Files Created/Modified

- `server/domains/index.ts` — applyHealEffect helper, ActiveBuff widening, activeDebuffs map, addDebuff/cleanupDebuffs, buff/shield/debuff branches in ability:effect_applied handler, item handler audit comment
- `server/domains/AbilityEffectHandler.test.ts` — 10 integration tests via shared eventBus

## Decisions Made

- `ActiveBuff.buffType` widened to `BuffType | 'shield'` — `getDamageMultiplier` and `getShieldAbsorption` still use literal string comparisons and continue to compile correctly
- `activeDebuffs` keyed by `lobbyId` (not `lobbyId:playerId`) because debuffs target the boss (one per lobby), not individual players
- Buff branch uses `payload.buffType ?? 'damage_boost'` as a defensive fallback
- `item:effect_applied` buff branch hardcode of `'damage_boost'` confirmed correct for current item set (comment added at the line)

## Deviations from Plan

### Process Deviation

**Pre-commit hook prevented separate RED commit.** The project's husky pre-commit hook runs `npm test` and rejects commits with failing tests. The plan's TDD RED/GREEN structure (separate test commit before implementation) was not achievable without `--no-verify`. Resolution: verified RED state locally (4 failing tests confirmed), then committed implementation + tests together when GREEN. All behavioral requirements still met.

No other deviations — plan executed as written.

## Known Stubs

The following buff/debuff types are stored without consumers (per CONTEXT deferred-ideas decision):

| Buff/Debuff | Ability | File | Note |
|-------------|---------|------|------|
| `crit_boost` | `ranger_eagle_eye` | server/domains/index.ts | TODO: consumer in future phase |
| `dodge` | `rogue_shadow_step` | server/domains/index.ts | TODO: consumer in future phase |
| `cooldown_reduction` | `wizard_time_warp` | server/domains/index.ts | TODO: consumer in future phase |
| `attack_slow` | `oathbreaker_aura_of_dread` | server/domains/index.ts | TODO: consumer in future phase |

These are intentional per the plan and CONTEXT. They are stored and will have no functional impact until a future phase adds consumers.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. All changes are server-internal event handler mutations. T-47-03 (payload.buffType elevation) and T-47-04 (timer leaks) from the plan's threat model were both addressed:
- T-47-03: `buffType` comes from the server-side `AbilityManager` which reads from `CLASS_ABILITY_CONFIGS` (not from client input)
- T-47-04: `addDebuff` uses `setTimeout` with cleanup in `cleanupDebuffs`; called in `session:lobby_destroyed`

## Self-Check: PASSED

- server/domains/index.ts: FOUND
- server/domains/AbilityEffectHandler.test.ts: FOUND
- 17b7c3e (feat task 1+2+3): FOUND
- function applyHealEffect: FOUND in index.ts
- activeDebuffs map: FOUND in index.ts
- cleanupDebuffs in session:lobby_destroyed: FOUND in index.ts
- npm test: 861 tests passed
- npm run check: clean
- npm run lint: clean

---
*Phase: 47-ability-effects-data-driven-registries*
*Completed: 2026-06-22*
