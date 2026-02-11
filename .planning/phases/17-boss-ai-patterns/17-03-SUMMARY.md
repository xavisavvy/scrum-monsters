---
phase: 17-boss-ai-patterns
plan: 03
subsystem: combat
tags: [boss-ai-integration, combat-manager, phase-transitions, difficulty-scaling]
dependency_graph:
  requires:
    - 17-02 (BossAI coordinator and boss behavior definitions)
  provides:
    - CombatManager integrated with BossAI subsystem
    - Pattern-based boss attack system
    - HP phase transitions at 66% and 33% thresholds
    - Team-level difficulty scaling
  affects:
    - All boss combat encounters (attack selection now pattern-driven)
    - Client combat UI (new boss_phase_transition events)
tech_stack:
  added:
    - Boss-ai integration in CombatManager
    - Level-based difficulty scaling (HP/damage multipliers)
  patterns:
    - Pattern-based attack selection via BossAI.selectNextAction
    - Phase-driven attack intervals (5s/3s/2s)
    - Threat recording delegation to BossAI subsystem
key_files:
  created: []
  modified:
    - server/domains/CombatManager.ts
    - server/domains/CombatManager.test.ts
    - server/events/eventTypes.ts
decisions:
  - Decision: Replace manual threat table updates with BossAI.recordThreat API
    Rationale: Single source of truth for threat calculations, consistent with ThreatEvaluator weights
    Alternatives: Keep manual updates, but would duplicate logic and risk inconsistency
  - Decision: Emit both boss_phase_transition AND boss_enraged events
    Rationale: Backward compatibility - existing client code expects boss_enraged at phase 2
    Alternatives: Breaking change to remove boss_enraged, but risks client regressions
  - Decision: Use 66% and 33% HP thresholds for phase transitions
    Rationale: BossStateMachine defines these thresholds, aligns with 3-phase boss design
    Alternatives: Keep 50% enrage threshold, but wouldn't leverage full 3-phase patterns
  - Decision: Apply level scaling to both HP and damage
    Rationale: HP scaling (+8%) makes bosses tougher, damage scaling (+5%) keeps challenge fair
    Alternatives: Scale only HP, but bosses would become damage sponges without threat
metrics:
  duration: 8 minutes
  tasks_completed: 2
  tests_updated: 8
  tests_passing: 108/108
  files_modified: 3
  completed_at: 2026-02-11T18:29:41Z
---

# Phase 17 Plan 03: CombatManager BossAI Integration Summary

**Boss attack system rewired from random selection to pattern-based AI with phase transitions and level scaling**

## Tasks Completed

### Task 1: Add new event types and extend CombatManager deps
**Commit:** 8f728ad

**Event types added:**
- `CombatBossPhaseTransitionPayload` - Emitted at 66% and 33% HP thresholds
  - `newPhase` (1, 2, or 3)
  - `previousPhase`
  - `message` (boss-specific transition message)
  - `bossType` (e.g., 'bug-hydra')

**CombatBossTelegraphPayload extended:**
- Added `visualEffect` field ('charge' | 'glow' | 'shake' | 'particles' | 'none')
- Added `bossType` field for boss-specific visual theming

**CombatManager dependencies extended:**
- Added `progressionManager` with `getPlayerLevel` for difficulty scaling
- Added `bossAIs` map to track BossAI instances per lobby
- Added difficulty scaling constants:
  - `LEVEL_HP_SCALING = 0.08` (+8% HP per average level)
  - `LEVEL_DAMAGE_SCALING = 0.05` (+5% damage per average level)
  - `PHASE_3_ATTACK_INTERVAL_MS = 2000` (faster attacks in phase 3)

**BossCombat interface updated:**
- Added `bossType: BossType` field
- Added `currentPhase: BossPhaseNumber` field (1, 2, or 3)
- Kept `isEnraged` for backward compatibility

**ThreatEntry type unified:**
- Replaced CombatManager's local ThreatEntry with boss-ai ThreatEntry type
- Ensures consistency with BossAI subsystem (includes `lastActionAt` field)

### Task 2: Rewire CombatManager to use BossAI for attacks and targeting
**Commit:** 5f241fa

**initializeCombat updated:**
- Added `bossSprite` optional parameter
- Determines `BossType` via `getBossTypeFromSprite()` or defaults to 'bug-hydra'
- Creates `BossAI` instance and stores in `bossAIs` map
- **Level scaling logic:**
  - Calculates average team level from `progressionManager.getPlayerLevel()`
  - Applies `levelMultiplier = 1 + ((avgLevel - 1) * 0.08)` to boss HP
  - Example: Level 5 team → 1.32x boss HP (32% tankier)
- Sets `boss.bossType` and `boss.currentPhase = 1`

**performBossAttack replaced with BossAI-driven logic:**
- Builds `BattleContext` with boss HP, phase, player counts, battle time
- Calls `bossAI.selectNextAction(context, threatTable, alivePlayers)`
- Extracts `pattern` and `targetPlayerIds` from action
- **Level-scaled damage:**
  - `levelDamageMultiplier = 1 + ((avgLevel - 1) * 0.05)`
  - `scaledDamage = pattern.baseDamage * levelDamageMultiplier`
  - Example: Level 5 team → 1.20x damage (20% harder hits)
- Honors `pattern.telegraphDurationMs` for delayed attacks
- Emits `combat:boss_telegraph` with `visualEffect` and `bossType`
- Applies instant or delayed damage based on pattern

**scheduleNextAttack updated for phase-based timing:**
- Phase 1: 5000ms base interval
- Phase 2: 3000ms enraged interval
- Phase 3: 2000ms frantic interval
- Applies ±30% variance to all intervals
- Example: Phase 3 attacks every 1.4-2.6 seconds

**playerAttackBoss phase transition logic:**
- Calls `bossAI.checkPhaseTransition(hp, maxHp)` after damage
- Updates `boss.currentPhase` when transition occurs
- Sets `boss.isEnraged = true` at phase 2+ (backward compat)
- Emits `combat:boss_phase_transition` with boss-specific message
- Also emits `combat:boss_enraged` at phase 2 for backward compat
- **Threat recording:**
  - Replaced manual threat table updates with `bossAI.recordThreat()`
  - Ensures consistent threat weights (damage 1.0x, healing 0.8x, revival 150)

**Threat recording for healing and revival:**
- `playerHealTeammate` calls `bossAI.recordThreat(..., 'healing', actualHealAmount)`
- `completeRevival` calls `bossAI.recordThreat(..., 'revival', 1)`
- Healing threat = 0.8x heal amount (from ThreatEvaluator)
- Revival threat = 150 fixed (high priority)

**BossAI cleanup:**
- `handlePlayerLeft` calls `bossAI.cleanupPlayer(threatTable, playerId)`
- `cleanupLobby` deletes `bossAIs.get(lobbyId)`

**Test updates (8 tests refactored):**
- Replaced Math.random mocking with pattern-based behavior tests
- AoE test now verifies multi-target attacks work with BossAI patterns
- Telegraph tests move boss to phase 2 (more telegraphed patterns available)
- Threat targeting test verifies pattern-based modes (highest_threat, random, multi)
- Enrage test updated to check phase transition at 66% HP threshold
- All 108 CombatManager tests passing

## Deviations from Plan

**Rule 3 (Auto-fix blocking issues):**

**Deviation 1: Updated CombatManager tests to work with BossAI patterns**
- **Found during:** Task 2 commit attempt
- **Issue:** 8 tests failing because they mock Math.random to force specific attack types, but BossAI uses pattern-based selection
- **Fix:** Refactored tests to verify pattern-based behavior instead of random selection
  - AoE test: Verify multi-target attacks (not forcing AoE via Math.random)
  - Telegraph tests: Run boss in phase 2 where more patterns have telegraphs
  - Threat tests: Verify targeting modes work (not forcing specific targets)
  - Enrage test: Check phase transitions at 66% (not 50%)
- **Files modified:** `server/domains/CombatManager.test.ts`
- **Commit:** 5f241fa (combined with Task 2)
- **Rationale:** Tests were blocking commit (pre-commit hook failure). Updating tests to match new system was necessary to proceed.

## Verification Results

**Tests:**
- All 108 CombatManager tests pass
- All 53 boss-ai domain tests pass (from Plan 01-02)
- All tests run successfully in pre-commit hook

**TypeScript:**
- No compilation errors
- ThreatEntry types unified between CombatManager and boss-ai

**Boss AI integration verified:**
- `initializeCombat` creates BossAI instance for specified boss type
- `performBossAttack` uses `BossAI.selectNextAction()` for pattern selection
- Phase transitions emit events at 66% and 33% HP
- Attack intervals scale with phase (5s → 3s → 2s)
- Threat recording delegated to BossAI API
- Level scaling applies to HP and damage

## Self-Check: PASSED

**Modified files exist:**
- FOUND: server/domains/CombatManager.ts (BossAI integration)
- FOUND: server/domains/CombatManager.test.ts (updated for patterns)
- FOUND: server/events/eventTypes.ts (new phase transition event)

**Commits exist:**
- FOUND: 8f728ad (Task 1: event types and deps)
- FOUND: 5f241fa (Task 2: BossAI integration and tests)

**Tests passing:**
- VERIFIED: 108/108 CombatManager tests pass (Test Files 1 passed)
- VERIFIED: All boss-ai tests pass
- VERIFIED: No test regressions

## Next Steps

**Plan 04: Boss behavior tuning and testing**
- Test all 5 boss types in actual combat scenarios
- Verify pattern selection distribution
- Tune damage values and telegraph timings
- Test phase transitions with real player progression levels

**Plan 05: Client-side boss phase UI**
- Display boss phase indicators (visual cues for phase 1/2/3)
- Show phase transition animations
- Display attack telegraph with boss-specific visual effects
- Update boss HP bar with phase markers

**Integration notes:**
- CombatManager now requires `bossSprite` parameter in `initializeCombat`
- Socket handlers must pass boss sprite from `lobby.boss.sprite`
- Phase transitions provide boss-specific messages for dramatic flair
- Level scaling ensures bosses scale with player progression
