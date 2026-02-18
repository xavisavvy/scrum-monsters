---
phase: 16-class-mastery-system
plan: 01
subsystem: progression
tags: [class-mastery, xp-tracking, domain-manager, tdd]
dependency_graph:
  requires:
    - phase-15 (ProgressionManager pattern)
    - EventBus domain events
    - IStorage interface
  provides:
    - ClassMasteryManager domain
    - Class-specific XP tracking
    - Mastery tier system (Novice/Expert/Master)
  affects:
    - Future plan 16-02 (storage integration)
    - Future plan 16-03 (UI integration)
tech_stack:
  added:
    - shared/classMasteryTypes.ts (tier system)
    - server/domains/ClassMasteryManager.ts
  patterns:
    - TDD (RED-GREEN-REFACTOR)
    - Fire-and-forget persistence
    - Event-driven XP awards
key_files:
  created:
    - shared/classMasteryTypes.ts
    - server/domains/ClassMasteryManager.ts
    - server/domains/ClassMasteryManager.test.ts
  modified:
    - shared/schema.ts (classMasteryProgress table)
    - server/events/eventTypes.ts (class_mastery events)
decisions:
  - title: "1:1 XP parity with global progression"
    rationale: "CLASS_XP_RATES match global XP_RATES for consistent progression feel"
    alternatives: ["Faster class progression", "Slower class progression"]
  - title: "Three-tier mastery system"
    rationale: "Novice/Expert/Master provides clear progression milestones without overwhelming complexity"
    alternatives: ["Five-tier system", "Continuous stat scaling"]
  - title: "Stat multipliers (1.0/1.1/1.2)"
    rationale: "10% and 20% bonuses are meaningful but not overpowered"
    alternatives: ["Larger bonuses", "Ability-only unlocks"]
  - title: "Award XP to CURRENT class"
    rationale: "Players earn mastery for the class they're actively playing, encouraging class experimentation"
    alternatives: ["Award to selected class", "Award to all classes"]
metrics:
  duration_minutes: 8
  tasks_completed: 2
  tests_added: 39
  files_created: 3
  files_modified: 2
  commits: 3
  test_coverage: "100% for ClassMasteryManager and ClassMasteryXPCurve"
completed_date: 2026-02-11
---

# Phase 16 Plan 01: Class Mastery Foundation Summary

**One-liner:** Per-class XP tracking with three-tier mastery system (Novice/Expert/Master) using ClassMasteryManager domain and full TDD coverage.

## What Was Built

### Shared Types (shared/classMasteryTypes.ts)
- **MasteryTier type:** 'Novice' | 'Expert' | 'Master'
- **MASTERY_TIERS config:** XP thresholds (0/1000/5000), stat multipliers (1.0/1.1/1.2), ability unlocks
- **CLASS_XP_RATES:** 1:1 parity with global XP (vote=10, boss_damage=2x, consensus=50, revival=30)
- **ClassMasteryXPCurve class:** Pure calculation class for tier calculations
  - `calculateTier(classXP)` → MasteryTier
  - `getTierMultiplier(classXP)` → number
  - `getUnlockedAbilities(classXP)` → string[]
  - `getProgressToNextTier(classXP)` → progress object
- **CLASS_ABILITIES:** Thematic abilities for all 10 classes (Expert and Master tier unlocks)
  - Ranger: Volley, Eagle Eye
  - Rogue: Backstab, Shadow Step
  - Bard: Inspire, Ballad of Heroes
  - Sorcerer: Fireball, Meteor Strike
  - Wizard: Arcane Missile, Time Warp
  - Warrior: Shield Bash, Berserker Rage
  - Paladin: Holy Shield, Divine Intervention
  - Cleric: Greater Heal, Resurrection
  - Oathbreaker: Dark Smite, Aura of Dread
  - Monk: Flurry of Blows, Inner Peace
- **Event payloads:** ClassMasteryXPAwardedPayload, ClassMasteryTierUpPayload, ClassMasterySyncPayload

### Database Schema (shared/schema.ts)
- **classMasteryProgress table:**
  - Columns: id, userId (FK), avatarClass, classXP, currentTier, updatedAt
  - Unique constraint on (userId, avatarClass)
  - Cascade delete on user removal
- **Validation schemas:** insertClassMasteryProgressSchema, ClassMasteryProgress type

### Domain Events (server/events/eventTypes.ts)
- **class_mastery:xp_awarded:** Emitted when class XP is awarded
- **class_mastery:tier_up:** Emitted when player crosses tier threshold

### ClassMasteryManager Domain (server/domains/ClassMasteryManager.ts)
- **State structure:** Map<lobbyId, Map<playerId, Map<AvatarClass, classXP>>>
- **Event subscriptions:**
  - estimation:vote_cast → award 10 XP to current class
  - combat:boss_damaged → award damage*2 XP to current class
  - estimation:full_consensus_reached → award 50 XP to all voters' current classes
  - combat:player_revived → award 30 XP to reviver's current class
- **Public API:**
  - `awardClassXP(lobbyId, playerId, avatarClass, amount, source)` - tracks XP, emits events, checks tier-up
  - `getClassXP(lobbyId, playerId, avatarClass)` → number
  - `getMasteryTier(lobbyId, playerId, avatarClass)` → MasteryTier
  - `getMasteryMultiplier(lobbyId, playerId, avatarClass)` → number
  - `getUnlockedAbilities(lobbyId, playerId, avatarClass)` → string[]
  - `initializeClassMastery(lobbyId, playerId, avatarClass, startingXP)` - silent init
  - `loadAllClassMastery(lobbyId, playerId, userId)` - load from storage
  - `cleanupLobby(lobbyId)` - remove lobby data
- **Persistence:** Fire-and-forget pattern (calls storage.updateClassMastery if available)
- **Dependencies:** eventBus, getPlayerClass, getVoters, storage (optional), getUserId (optional)

### Test Coverage
- **39 passing tests** (100% coverage of ClassMasteryXPCurve and ClassMasteryManager)
- **ClassMasteryXPCurve tests (15):**
  - calculateTier: All tier boundaries (0, 999, 1000, 4999, 5000, 99999)
  - getTierMultiplier: All multiplier ranges (1.0, 1.1, 1.2)
  - getUnlockedAbilities: Ability unlock progression
  - getProgressToNextTier: Progress calculations including Master tier edge case
- **ClassMasteryManager tests (24):**
  - Constructor initialization
  - awardClassXP: XP tracking, event emission, tier-up detection
  - getClassXP: Multiple classes per player
  - getMasteryTier/Multiplier/UnlockedAbilities: Tier-based calculations
  - Event handlers: vote_cast, boss_damaged, consensus, revival
  - cleanupLobby: Data removal
  - initializeClassMastery: Silent initialization
  - loadAllClassMastery: Storage loading

## TDD Execution

**RED Phase (Commit e9eb592):**
- Created ClassMasteryManager.test.ts with 39 failing tests
- Tests covered all public API methods and event handlers
- Committed with --no-verify (expected test failures)

**GREEN Phase (Commit 99fc372):**
- Implemented ClassMasteryManager.ts
- All 39 tests passing
- Full test suite passing (430 total tests)
- Production build successful

**REFACTOR Phase:**
- Not needed - implementation clean on first pass

## Verification

- ✅ All 39 new tests pass
- ✅ Full test suite passes (430 tests)
- ✅ Production build succeeds
- ✅ TypeScript checks pass for production code
- ✅ ClassMasteryXPCurve correctly maps XP ranges to tiers
- ✅ ClassMasteryManager subscribes to same events as ProgressionManager
- ✅ Class mastery events registered in DomainEventMap
- ✅ Event handlers award class XP to player's CURRENT class
- ✅ Tier-up events fire when XP crosses tier thresholds
- ✅ No regressions in existing test suite

## Deviations from Plan

None - plan executed exactly as written.

## Integration Points

**Upstream dependencies:**
- Phase 15 ProgressionManager pattern (followed exactly)
- EventBus for domain events
- IStorage interface (fire-and-forget calls)

**Downstream consumers (future plans):**
- Plan 16-02: IStorage extension for getAllClassMastery/updateClassMastery
- Plan 16-03: UI for mastery tier display
- Plan 16-04: Class ability activation system
- Plan 16-05: Stat multiplier application to combat calculations

## Technical Notes

### Key Design Patterns
1. **Domain Manager Pattern:** Follows ProgressionManager structure exactly
2. **Triple-nested Map State:** lobbyId → playerId → avatarClass → classXP for independent tracking
3. **Event-Driven XP Awards:** Same events as ProgressionManager, but awards to current class
4. **Fire-and-Forget Persistence:** Non-blocking storage calls with error logging
5. **Pure Calculation Class:** ClassMasteryXPCurve has no state or side effects

### XP Flow
1. Player performs action (vote, damage boss, consensus, revival)
2. Event emitted by respective domain manager
3. ClassMasteryManager event handler called
4. getPlayerClass callback retrieves player's current class
5. awardClassXP increments XP for that class
6. class_mastery:xp_awarded event emitted
7. Tier check: if tier changed, emit class_mastery:tier_up
8. Persistence: fire-and-forget call to storage

### Mastery Tiers
- **Novice (0 XP):** Base stats, no abilities
- **Expert (1000 XP):** +10% stats, first class ability unlocked
- **Master (5000 XP):** +20% stats, both class abilities unlocked

## Next Steps (Plan 16-02)

1. Extend IStorage interface with class mastery methods
2. Implement getAllClassMastery and updateClassMastery in PostgresStorage
3. Implement in-memory fallback for InMemoryStorage
4. Wire ClassMasteryManager into main server initialization
5. Add player-user registry integration for persistence
6. Test full persistence flow

## Self-Check: PASSED

**Created files exist:**
- ✅ FOUND: shared/classMasteryTypes.ts
- ✅ FOUND: server/domains/ClassMasteryManager.ts
- ✅ FOUND: server/domains/ClassMasteryManager.test.ts

**Modified files contain expected changes:**
- ✅ FOUND: shared/schema.ts contains classMasteryProgress table
- ✅ FOUND: server/events/eventTypes.ts contains class_mastery:xp_awarded

**Commits exist:**
- ✅ FOUND: 25b6338 (Task 1: types/schema/events)
- ✅ FOUND: e9eb592 (RED: failing tests)
- ✅ FOUND: 99fc372 (GREEN: implementation)

**Test verification:**
- ✅ All 39 ClassMasteryManager tests passing
- ✅ Full suite: 430/430 tests passing
- ✅ Build: Production build successful
