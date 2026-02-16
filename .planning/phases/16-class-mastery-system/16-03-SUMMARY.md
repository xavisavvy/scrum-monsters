---
phase: 16-class-mastery-system
plan: 03
subsystem: combat
tags: [class-mastery, damage-calculation, ability-gating, combat-mechanics]
dependency_graph:
  requires: [16-01]
  provides: [mastery-damage-scaling, ability-unlock-api]
  affects: [combat, class-mastery]
tech_stack:
  added: []
  patterns: [dependency-injection, adapter-pattern]
key_files:
  created: []
  modified: [server/domains/CombatManager.ts, server/domains/index.ts]
decisions:
  - decision: Apply mastery multiplier at base damage calculation level
    rationale: Single point of modification ensures consistency across all damage sources
    alternatives: Apply multiplier at each attack method (would duplicate logic)
  - decision: Use optional dependency with null-safe operators (??)
    rationale: Maintains backward compatibility when ClassMasteryManager not available
    alternatives: Require dependency always (would break existing tests)
  - decision: Adapter pattern for ClassMasteryManager wiring
    rationale: Decouples CombatManager from full ClassMasteryManager interface
    alternatives: Direct dependency (tight coupling)
metrics:
  duration_minutes: 3.7
  tasks_completed: 2
  files_modified: 2
  commits: 2
  tests_added: 0
  tests_passing: 430
completed_date: 2026-02-11
---

# Phase 16 Plan 03: Combat Mastery Integration Summary

**One-liner:** Mastery-aware damage calculations with 10%-20% stat bonuses and ability unlock checking for Phase 18 integration.

## Objective Achieved

Integrated mastery stat bonuses into CombatManager damage calculations and added ability unlock checking for class-specific abilities. Mastery tiers now mechanically impact gameplay through damage multipliers (1.0x Novice, 1.1x Expert, 1.2x Master) applied to all combat actions, and a public API for ability gating is ready for Phase 18.

## Implementation Summary

### Task 1: Apply Mastery Damage Multiplier to CombatManager

**What was done:**
- Added `classMasteryManager` optional dependency to `CombatManagerDeps` interface
- Modified `getClassBaseDamage()` to accept and apply mastery multiplier parameter
- Updated `playerAttackBoss()` to fetch mastery multiplier before damage calculation
- Updated `applyTeamAttack()` to apply per-player mastery multipliers (sum of boosted damages)
- Updated `playerAttackMinion()` to fetch mastery multiplier before damage calculation
- Added `canUseClassAbility()` public method for ability unlock checking

**Files modified:**
- `server/domains/CombatManager.ts`

**Backward compatibility:**
All changes use optional chaining (`?.`) and nullish coalescing (`??`) operators to default to 1.0 multiplier when ClassMasteryManager is not provided. All 108 existing CombatManager tests pass without modification.

**Commit:** `b091776`

### Task 2: Wire ClassMasteryManager into CombatManager Deps

**What was done:**
- Reordered domain manager instantiation in `server/domains/index.ts`:
  - sessionManager → estimationManager → **classMasteryManager** → combatManager → progressionManager
- Wired `classMasteryManager` into CombatManager deps with adapter functions:
  - `getMasteryMultiplier`: Returns 1.0 for null class, otherwise delegates to ClassMasteryManager
  - `getUnlockedAbilities`: Returns empty array for null class, otherwise delegates to ClassMasteryManager

**Files modified:**
- `server/domains/index.ts`

**Pattern used:**
Adapter pattern decouples CombatManager from full ClassMasteryManager interface. Only exposes two methods needed for combat calculations.

**Commit:** `c24711a`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

✅ **All verification criteria met:**

1. **Mastery multiplier applied in all damage calculations:**
   - `playerAttackBoss`: `const masteryMultiplier = this.classMasteryManager?.getMasteryMultiplier(lobbyId, playerId, playerClass) ?? 1.0;`
   - `applyTeamAttack`: Per-player mastery multipliers applied before summing team damage
   - `playerAttackMinion`: Same pattern as playerAttackBoss

2. **Ability unlock checking method available:**
   - `canUseClassAbility()` checks if player's mastery tier unlocks specific ability
   - Ready for Phase 18 (Class Abilities) integration

3. **Backward compatibility confirmed:**
   - All 430 tests pass (including 108 CombatManager tests)
   - No test modifications required
   - Defaults to 1.0 multiplier when dependency not provided

4. **Production build succeeds:**
   - `npm run build` completes successfully
   - No TypeScript errors

5. **ClassMasteryManager wired correctly:**
   - Created before CombatManager (dependency ordering)
   - Passed to CombatManager constructor via adapter functions

## Impact

### Damage Scaling by Mastery Tier

**Novice (0-999 class XP):**
- Warrior: 15 base damage
- Ranger: 20 base damage
- Sorcerer: 25 base damage

**Expert (1000-4999 class XP):**
- Warrior: 16 base damage (15 × 1.1)
- Ranger: 22 base damage (20 × 1.1)
- Sorcerer: 27 base damage (25 × 1.1)

**Master (5000+ class XP):**
- Warrior: 18 base damage (15 × 1.2)
- Ranger: 24 base damage (20 × 1.2)
- Sorcerer: 30 base damage (25 × 1.2)

**Example scenario:**
A Master sorcerer (30 base damage) with 2x battle modifier deals 60 damage per click-to-attack, compared to 50 damage for a Novice sorcerer.

### Ability Gating API

`canUseClassAbility(lobbyId, playerId, abilityId)` returns true/false based on:
- Player's current class
- Mastery tier for that class
- Ability unlock requirements (Expert unlocks `class_ability_1`, Master unlocks both)

**Example:**
- Novice ranger: Cannot use "Volley" or "Eagle Eye"
- Expert ranger: Can use "Volley", cannot use "Eagle Eye"
- Master ranger: Can use both "Volley" and "Eagle Eye"

Phase 18 will use this API to gate ability button availability and usage.

## Key Decisions

1. **Apply multiplier at base damage calculation level**
   - Single point of modification ensures consistency
   - All combat damage sources (boss attacks, minion attacks, team attacks) automatically benefit
   - Alternative: Apply at each attack method (duplicate logic, error-prone)

2. **Optional dependency with null-safe operators**
   - Maintains backward compatibility during gradual rollout
   - Tests work without full ClassMasteryManager setup
   - Alternative: Require dependency (would break existing tests)

3. **Adapter pattern for wiring**
   - Decouples CombatManager from full ClassMasteryManager interface
   - Only exposes needed methods (getMasteryMultiplier, getUnlockedAbilities)
   - Alternative: Direct dependency (tight coupling)

## Integration Points

**Upstream dependencies (requires):**
- Plan 16-01: ClassMasteryManager foundation with XP tracking and tier calculation
- Plan 16-02: Storage integration and ClassMasteryManager wiring (implicit)

**Downstream consumers (provides):**
- Phase 18 (Class Abilities): `canUseClassAbility()` API for ability unlock checking
- Combat flow: All damage calculations now scale with mastery tier

**Affected systems:**
- Combat damage calculations (boss, minions, team attacks)
- Future ability unlock UI (Phase 18)

## Technical Notes

### Dependency Injection Pattern

CombatManager receives ClassMasteryManager via constructor deps, not direct import. This:
- Enables testing with mock mastery managers
- Maintains domain separation (Combat doesn't know ClassMasteryManager internals)
- Allows gradual rollout (optional dependency)

### Null Safety

All mastery lookups use `?.` and `??`:
```typescript
const masteryMultiplier = this.classMasteryManager?.getMasteryMultiplier(lobbyId, playerId, playerClass) ?? 1.0;
```

If `classMasteryManager` is undefined OR `getMasteryMultiplier` returns null/undefined, default to 1.0 (no bonus).

### Per-Player Team Attack Calculation

Team attack damage is sum of individual player damages (each with their own mastery multiplier):
```typescript
for (const player of combatState.players.values()) {
  if (player.combatState === 'fighting') {
    const playerClass = this.getPlayerClass?.(lobbyId, player.playerId);
    const masteryMultiplier = this.classMasteryManager?.getMasteryMultiplier(lobbyId, player.playerId, playerClass) ?? 1.0;
    baseDamage += this.getClassBaseDamage(playerClass, masteryMultiplier);
  }
}
```

This means a team with mixed mastery tiers gets proportional benefit.

## Next Steps

**Immediate (Phase 16 continuation):**
- Plan 16-04: Client-side mastery tier display in UI
- Plan 16-05: Mastery tier-up notifications and visual feedback

**Future (Phase 18):**
- Use `canUseClassAbility()` to gate ability button UI
- Implement ability usage handlers that check mastery before execution

## Self-Check: PASSED

✅ All modified files exist:
- `server/domains/CombatManager.ts`: EXISTS
- `server/domains/index.ts`: EXISTS

✅ All commits exist:
- `b091776`: feat(16-03): apply mastery damage multiplier to CombatManager
- `c24711a`: feat(16-03): wire ClassMasteryManager into CombatManager deps

✅ All tests pass: 430/430
✅ Production build succeeds
✅ Mastery multiplier applied in all damage calculations
✅ Ability unlock method available
✅ ClassMasteryManager wired into CombatManager
