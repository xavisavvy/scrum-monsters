---
phase: 17-boss-ai-patterns
plan: 02
subsystem: boss-ai
tags: [boss-behavior, ai-patterns, coordinator, data-driven]
dependency_graph:
  requires:
    - 17-01 (BossStateMachine, PatternSequencer, ThreatEvaluator primitives)
  provides:
    - Boss behavior definitions for 5 boss types
    - BossAI coordinator with unified API
    - BOSS_BEHAVIORS registry
  affects:
    - CombatManager (will integrate BossAI in Plan 03)
tech_stack:
  added:
    - Data-driven boss behavior definitions
    - BossAI coordinator pattern
  patterns:
    - Composition (BossAI owns state machine + sequencer + evaluator)
    - Strategy pattern (boss behaviors as data)
    - Weighted random selection with anti-repeat
key_files:
  created:
    - server/domains/boss-ai/boss-definitions/bugHydra.ts
    - server/domains/boss-ai/boss-definitions/sprintDemon.ts
    - server/domains/boss-ai/boss-definitions/deadlineDragon.ts
    - server/domains/boss-ai/boss-definitions/techDebtGolem.ts
    - server/domains/boss-ai/boss-definitions/scopeCreepBeast.ts
    - server/domains/boss-ai/boss-definitions/index.ts
    - server/domains/boss-ai/BossAI.ts
    - server/domains/boss-ai/BossAI.test.ts
    - server/domains/boss-ai/index.ts
  modified: []
decisions:
  - Decision: Each boss has 9+ unique patterns across 3 phases
    Rationale: Ensures distinct boss personality and enough variety to prevent repetition
    Alternatives: Could have shared patterns with parameters, but distinct patterns provide clearer identity
  - Decision: BossAI coordinator owns all subsystems
    Rationale: Simple API for CombatManager, encapsulates complexity
    Alternatives: Could expose subsystems directly, but increases coupling
  - Decision: Data-driven behavior definitions
    Rationale: Easy to add new bosses, balance tuning doesn't require code changes
    Alternatives: Class-based inheritance, but data is more flexible
  - Decision: Pattern IDs include boss type prefix
    Rationale: Ensures no collision between boss types, aids debugging
    Alternatives: Global unique IDs, but prefix provides context
metrics:
  duration: 4 minutes
  tasks_completed: 2
  tests_added: 20
  test_coverage: "100% of BossAI coordinator"
  files_created: 9
  completed_at: 2026-02-11T18:18:23Z
---

# Phase 17 Plan 02: Boss Behavior Definitions Summary

**Boss behavior definitions and BossAI coordinator with unified API for 5 distinct boss types**

## Tasks Completed

### Task 1: Define 5 unique boss behavior data definitions
**Commit:** 7071aa3

Created data-driven boss behavior definitions for all 5 boss types:

**Bug Hydra:**
- Theme: Multi-headed swarm attacks
- 9 patterns: Multi-target focus with spawning mechanics
- Notable: Escalates from 2-target to 4-target multi-attacks
- Phase 3: "Pestilence Storm" (AoE 35 damage), "Death Bite" (targets lowest HP)

**Sprint Demon:**
- Theme: Speed and rapid attacks
- 9 patterns: Minimal telegraph windows (0-800ms)
- Notable: Fastest attack patterns, emphasizes light attacks
- Phase 3: "Hypersonic Fury" (AoE), "Final Sprint" (single target 42 damage)

**Deadline Dragon:**
- Theme: Heavy time-themed attacks
- 9 patterns: Longest telegraphs (up to 2000ms), highest single-target damage
- Notable: Threat-focused targeting, punishing single hits
- Phase 3: "Deadline Apocalypse" (AoE 45 damage), "Final Hour" (50 damage to lowest HP)

**Tech Debt Golem:**
- Theme: AoE pressure and accumulation
- 9 patterns: Heavy AoE with debuff theme
- Notable: Most AoE-focused boss, "Spaghetti Slam" and "System Collapse"
- Phase 3: Multi-target attacks hitting up to 4 players

**Scope Creep Beast:**
- Theme: Escalating damage per phase
- 9 patterns: Damage increases dramatically with each phase (15 → 35 → 50)
- Notable: Lowest phase 1 damage, highest phase 3 damage
- Phase 3: "Never-ending Story" (50 damage), "Total Scope Explosion" (AoE 40)

**Infrastructure:**
- `BOSS_BEHAVIORS` registry maps BossType to BossBehavior
- `getBossBehavior(bossType)` helper function
- `getBossTypeFromSprite(sprite)` maps sprite filenames to BossType

**Files created:** 6 files (5 boss definitions + index)

### Task 2: BossAI coordinator class
**Commit:** 843a4d2

Created BossAI coordinator that orchestrates all subsystems:

**API:**
- `selectNextAction(context, threatTable, alivePlayers)` - Unified attack selection
  - Gets current phase from HP ratio
  - Filters patterns by phase
  - Applies weighted selection with anti-repeat
  - Selects targets based on pattern targetMode
  - Returns BossAction with pattern and target IDs
- `checkPhaseTransition(hp, maxHp)` - Phase change detection
  - Returns transition flag, new phase, and phase message
  - Enforces one-way transitions
  - Tracks lastPhase to prevent oscillation
- `recordThreat(threatTable, playerId, actionType, amount)` - Threat delegation
- `cleanupPlayer(threatTable, playerId)` - Threat table cleanup
- `getBossType()` and `getBehavior()` - Accessors

**Targeting logic:**
- `highest_threat`: Uses threat table (sorted descending)
- `lowest_hp`: Random placeholder (TODO: Add HP tracking to BattleContext)
- `random`: Random selection from alive players
- `all`: All alive players
- `multi`: Random N targets (shuffled selection)

**Tests:**
- 20 tests covering all boss types
- Pattern selection across phases
- Phase transition validation
- Threat recording and cleanup
- Anti-repeat pattern logic
- Boss-specific pattern verification

**Files created:** 3 files (BossAI.ts, BossAI.test.ts, index.ts)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Tests:**
- All 53 boss-ai domain tests pass (20 new + 33 from Plan 01)
- Coverage: BossStateMachine, PatternSequencer, ThreatEvaluator, BossAI
- Pattern selection verified for all 5 boss types
- Phase transitions verified with one-way enforcement

**TypeScript:**
- No compilation errors in boss-ai domain
- All types properly exported from index.ts
- Clean API surface for CombatManager integration

**Boss behavior validation:**
- Each boss has 9+ unique patterns (3 per phase minimum)
- No pattern ID collisions between boss types
- Phase transition messages defined for all bosses
- All patterns conform to AttackPattern interface

## Self-Check: PASSED

**Files created:**
- FOUND: server/domains/boss-ai/boss-definitions/bugHydra.ts
- FOUND: server/domains/boss-ai/boss-definitions/sprintDemon.ts
- FOUND: server/domains/boss-ai/boss-definitions/deadlineDragon.ts
- FOUND: server/domains/boss-ai/boss-definitions/techDebtGolem.ts
- FOUND: server/domains/boss-ai/boss-definitions/scopeCreepBeast.ts
- FOUND: server/domains/boss-ai/boss-definitions/index.ts
- FOUND: server/domains/boss-ai/BossAI.ts
- FOUND: server/domains/boss-ai/BossAI.test.ts
- FOUND: server/domains/boss-ai/index.ts

**Commits:**
- FOUND: 7071aa3 (Boss behavior definitions)
- FOUND: 843a4d2 (BossAI coordinator)

## Next Steps

**Plan 03: CombatManager Integration**
- Instantiate BossAI in CombatManager.startCombat()
- Replace simple boss attack logic with BossAI.selectNextAction()
- Wire up threat tracking (recordThreat on player damage/healing/revival)
- Handle phase transitions (checkPhaseTransition on HP change)
- Emit phase transition events to clients

**Dependency note:**
- BattleContext needs player HP tracking for `lowest_hp` targeting mode
- Current implementation uses random fallback
- Will enhance in integration plan or defer to Plan 04
