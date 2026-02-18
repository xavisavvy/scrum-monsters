---
phase: 18-class-abilities
plan: 01
subsystem: ability-system
tags: [tdd, domain, cooldowns, server-authoritative]
dependency_graph:
  requires:
    - classMasteryTypes.ts (CLASS_ABILITIES definitions, MasteryTier)
    - CombatManager (canUseClassAbility, getCombatState)
    - EventBus (domain event coordination)
  provides:
    - AbilityDefinition type with cooldown and effect mechanics
    - CLASS_ABILITY_CONFIGS (20 abilities for 10 classes)
    - AbilityManager domain for cooldown tracking
    - ability:* domain events
  affects:
    - shared/abilityTypes.ts (NEW)
    - server/domains/AbilityManager.ts (NEW)
    - server/events/eventTypes.ts (ability event registration)
tech_stack:
  added:
    - AbilityManager domain pattern
  patterns:
    - Server-authoritative cooldown tracking
    - TDD with 24 tests (RED-GREEN)
    - Event-driven effect application
    - Role-based ability design (tank/healer/DPS)
key_files:
  created:
    - shared/abilityTypes.ts (352 lines)
    - server/domains/AbilityManager.ts (287 lines)
    - server/domains/AbilityManager.test.ts (533 lines)
  modified:
    - server/events/eventTypes.ts (ability event types)
    - server/events/index.ts (re-export ability payloads)
decisions:
  - Ability IDs match CLASS_ABILITIES from classMasteryTypes.ts exactly
  - Cooldowns tracked server-side only (no client authority)
  - Effect application via event emission (not direct CombatManager calls)
  - Independent cooldowns per ability (no global cooldown)
  - Target selection for heal abilities: lowest HP fighting player
  - Role-based ability distribution: 3 tank, 2 healer, 5 DPS classes
metrics:
  tasks_completed: 2
  tests_added: 24
  test_pass_rate: 100%
  duration_seconds: 377
  commits:
    - 783c676 (Task 1: shared ability types)
    - 26697ef (Task 2: AbilityManager TDD)
  completed_at: 2026-02-11T19:12:45Z
---

# Phase 18 Plan 01: Ability Type Definitions and AbilityManager Domain Summary

TDD implementation of shared ability types and server-side AbilityManager for cooldown tracking and effect validation.

## One-Liner

Server-authoritative ability system with 20 class-specific abilities (2 per class), cooldown tracking, mastery gating, and event-driven effect application.

## What Was Built

### Task 1: Shared Ability Types (783c676)

**File:** `shared/abilityTypes.ts`

Created complete ability type definitions extending ClassAbilityDef from classMasteryTypes:

- **AbilityEffectType**: damage, heal, buff, debuff, taunt, shield
- **AbilityTargetType**: self, single, party, boss
- **AbilityDefinition**: extends ClassAbilityDef with cooldownMs, effectType, targetType, power, buffType?, debuffType?

**CLASS_ABILITY_CONFIGS** for all 10 classes (20 abilities total):

**Tank Abilities (warrior, paladin, oathbreaker):**
- warrior_shield_bash: 80 damage, 15s cooldown
- warrior_berserker_rage: 50% damage buff, 30s cooldown
- paladin_holy_shield: 40% self shield, 20s cooldown
- paladin_divine_intervention: 30% party shield, 45s cooldown
- oathbreaker_dark_smite: 70 damage + self-heal, 12s cooldown
- oathbreaker_aura_of_dread: attack slow debuff, 25s cooldown

**Healer Abilities (cleric, bard):**
- cleric_greater_heal: 50 HP single target, 12s cooldown
- cleric_resurrection: instant revive at 50% HP, 45s cooldown
- bard_inspire: 30% party damage buff, 20s cooldown
- bard_ballad_of_heroes: 25 HP party heal, 30s cooldown

**DPS Abilities (ranger, rogue, sorcerer, wizard, monk):**
- ranger_volley: 90 damage, 10s cooldown
- ranger_eagle_eye: 40% crit boost, 20s cooldown
- rogue_backstab: 120 burst damage, 8s cooldown
- rogue_shadow_step: dodge buff, 25s cooldown
- sorcerer_fireball: 100 AoE damage, 10s cooldown
- sorcerer_meteor_strike: 200 massive damage, 25s cooldown
- wizard_arcane_missile: 85 reliable damage, 8s cooldown
- wizard_time_warp: cooldown reduction party buff, 35s cooldown
- monk_flurry_of_blows: 110 sustained damage, 10s cooldown
- monk_inner_peace: 40 HP self-heal, 20s cooldown

**Helper Functions:**
- `getAbilityConfig(avatarClass, abilityId)`: lookup ability definition by class and ID

**Event Payloads:**
- AbilityUsedPayload
- AbilityCooldownStartedPayload
- AbilityEffectAppliedPayload

### Task 2: AbilityManager Domain with TDD (26697ef)

**Files:** `server/domains/AbilityManager.ts`, `server/domains/AbilityManager.test.ts`

**TDD Process:**
1. **RED Phase**: Created 24 failing tests covering all validation paths
2. **GREEN Phase**: Implemented AbilityManager to pass all tests
3. **Result**: 24/24 tests passing, no new TypeScript errors

**AbilityManager API:**

```typescript
export class AbilityManager {
  useAbility(lobbyId, playerId, abilityId): { success: boolean; error?: string }
  isOnCooldown(lobbyId, playerId, abilityId): boolean
  getRemainingCooldown(lobbyId, playerId, abilityId): number
  getActiveCooldowns(lobbyId, playerId): CooldownState[]
  resetCooldowns(lobbyId): void
  cleanupLobby(lobbyId): void
}
```

**Validation Chain:**
1. Player has class
2. Ability exists for class
3. Combat is active
4. Player combatState === 'fighting' (not downed/ghost)
5. Ability unlocked via CombatManager.canUseClassAbility (mastery tier check)
6. Ability not on cooldown

**Effect Application:**
- Emits `ability:effect_applied` events with targetIds and power
- Target selection for heal: lowest HP fighting player
- Boss targeting: always ['boss']
- Party targeting: all fighting players
- Self targeting: [playerId]

**Event Infrastructure:**
- Registered `ability:used`, `ability:cooldown_started`, `ability:effect_applied` in DomainEventMap
- Re-exported payload types from shared/abilityTypes.ts in server/events/eventTypes.ts

## Test Coverage

**24 tests organized into 5 suites:**

1. **Cooldown Validation (5 tests):**
   - Allow ability use when no cooldown active
   - Reject when on cooldown
   - Allow after cooldown expires (using vi.useFakeTimers)
   - Independent cooldowns for multiple abilities
   - Correct remaining time calculation

2. **Mastery Tier Gating (3 tests):**
   - Reject when ability not unlocked
   - Allow when canUseClassAbility returns true
   - Correct parameters passed to canUseClassAbility

3. **Combat State Validation (5 tests):**
   - Reject when combat not active
   - Reject when player not in combat
   - Reject when player is downed
   - Reject when player is ghost
   - Allow when player is fighting

4. **Effect Application (6 tests):**
   - Emit ability:used event
   - Emit ability:cooldown_started with correct duration
   - Emit ability:effect_applied for damage abilities
   - Emit ability:effect_applied for heal abilities (lowest HP target)
   - Emit ability:effect_applied for buff abilities
   - Emit ability:effect_applied for shield/debuff abilities

5. **Cooldown Reset (5 tests):**
   - Reset all cooldowns for lobby
   - Reset only specified lobby (multi-lobby isolation)
   - Cleanup all state for lobby
   - Return active cooldowns for player

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification criteria met:

- [x] `npx vitest run server/domains/AbilityManager.test.ts` — all 24 tests pass
- [x] `npm run check` — no new TypeScript errors (17 pre-existing in other files)
- [x] shared/abilityTypes.ts has 10 classes with 2 abilities each (20 total)
- [x] All ability IDs in CLASS_ABILITY_CONFIGS match CLASS_ABILITIES in classMasteryTypes.ts
- [x] AbilityManager.useAbility returns success:false for: cooldown active, ability not unlocked, player not fighting, no combat

## Key Decisions

1. **Ability IDs Match Mastery System**: All 20 ability IDs in CLASS_ABILITY_CONFIGS exactly match those defined in CLASS_ABILITIES (classMasteryTypes.ts) for consistency between mastery unlocking and ability configuration.

2. **Server-Authoritative Cooldowns**: Cooldown state tracked only on server with Map<lobbyId, Map<playerId, Map<abilityId, CooldownState>>>. Client receives cooldown events but doesn't validate (prevents cheating).

3. **Event-Driven Effect Application**: AbilityManager emits `ability:effect_applied` events rather than calling CombatManager methods directly. This keeps AbilityManager focused on cooldown validation and effect declaration. Plan 02 will wire socket handlers to translate events into game state changes.

4. **Independent Cooldowns**: Each ability has its own cooldown timer (no global cooldown). Allows tactical variety - players can use multiple abilities strategically.

5. **Heal Targeting: Lowest HP**: For 'single' target heal abilities, AbilityManager selects the fighting player with lowest HP. Cleric Greater Heal automatically targets who needs it most.

6. **Role Distribution**: 3 tank classes (warrior/paladin/oathbreaker), 2 healer classes (cleric/bard), 5 DPS classes (ranger/rogue/sorcerer/wizard/monk). Matches JRPG party composition expectations.

## Integration Points for Next Plans

**Plan 02 (Socket Handlers)** will:
- Add `use_ability` client event handler
- Wire `ability:effect_applied` events to CombatManager methods
- Sync cooldown state to clients via `ability:cooldown_started` events
- Handle resurrection ability (instant revive without channeling)

**Plan 03 (Client UI)** will:
- Create AbilityBar component with 2 ability buttons per class
- Add cooldown visualization (CSS conic-gradient progress overlay)
- Hook up `use_ability` emit on button click
- Listen for `ability:cooldown_started` to update client state

## Self-Check

Verifying all claims in this summary:

**Files created:**
```bash
[ -f "shared/abilityTypes.ts" ] && echo "FOUND: shared/abilityTypes.ts" || echo "MISSING"
[ -f "server/domains/AbilityManager.ts" ] && echo "FOUND: server/domains/AbilityManager.ts" || echo "MISSING"
[ -f "server/domains/AbilityManager.test.ts" ] && echo "FOUND: server/domains/AbilityManager.test.ts" || echo "MISSING"
```

**FOUND: shared/abilityTypes.ts**
**FOUND: server/domains/AbilityManager.ts**
**FOUND: server/domains/AbilityManager.test.ts**

**Commits exist:**
```bash
git log --oneline --all | grep -q "783c676" && echo "FOUND: 783c676" || echo "MISSING"
git log --oneline --all | grep -q "26697ef" && echo "FOUND: 26697ef" || echo "MISSING"
```

**FOUND: 783c676**
**FOUND: 26697ef**

**Test count:**
```bash
npx vitest run server/domains/AbilityManager.test.ts 2>&1 | grep "Tests"
```

**Tests: 24 passed (24)**

**Ability count:**
```bash
grep -E "id: '[a-z_]+'" shared/abilityTypes.ts | wc -l
```

**20 abilities**

## Self-Check: PASSED

All files created, commits exist, 24 tests pass, 20 abilities defined.
