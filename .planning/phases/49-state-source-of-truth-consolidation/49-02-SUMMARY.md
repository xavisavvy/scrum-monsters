---
phase: 49-state-source-of-truth-consolidation
plan: 02
subsystem: server/combat
tags: [combat, boss, server, event-bus, maint-05]
dependency_graph:
  requires: []
  provides: [applyBasicDamageToBoss, single-boss-hp-truth, no-double-emit]
  affects:
    - server/domains/CombatManager.ts
    - server/gameState.ts
    - server/websocket.ts
    - server/domains/CombatManager.test.ts
tech_stack:
  added: []
  patterns:
    - delegation-to-domain-manager
    - projection-pattern
    - single-emit-canonical
key_files:
  created: []
  modified:
    - server/domains/CombatManager.ts
    - server/domains/CombatManager.test.ts
    - server/gameState.ts
    - server/websocket.ts
decisions:
  - Option A: rename playerAttackBoss to applyBasicDamageToBoss per RESEARCH recommendation
  - Spectator-heal delegation deferred per RESEARCH Pitfall 6 (marked TODO MAINT-05+)
  - Spectator defeat guard retained as defensive check (unreachable in normal flow)
metrics:
  duration_minutes: 15
  completed_date: 2026-06-22
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 49 Plan 02: MAINT-05 Single Boss-HP Truth Summary

**One-liner:** CombatManager.applyBasicDamageToBoss is the single authoritative boss-HP drain
for basic attacks; gameState.attackBoss delegates to it; websocket.ts double-emit removed.

## What Was Built

### Task 1: Rename playerAttackBoss to applyBasicDamageToBoss + sweep test call sites

**Commit:** 245de45

- Renamed CombatManager.playerAttackBoss to applyBasicDamageToBoss
- Return type changed from number to { damage: number; newHp: number }
- Added JSDoc marking it as single authoritative basic-attack drain (MAINT-05)
- Swept all 37 playerAttackBoss call sites in CombatManager.test.ts
- Fixed 6 tests reading bare number return: destructured const { damage } = ...
- Renamed describe block label to applyBasicDamageToBoss
- MAINT-05a regression: combat:boss_damaged fires exactly once per call
- MAINT-05b regression: basic attack triggers checkPhaseTransition at 67% HP threshold
- 133 CombatManager tests green

### Task 2: Delegate gameState.attackBoss + remove websocket.ts double-emit

**Commit:** d7536a3

- Added combatManager to server/gameState.ts import from ./domains/index.js
- Replaced direct boss HP drain in attackBoss dev/qa branch with delegation to
  combatManager.applyBasicDamageToBoss(lobby.id, playerId)
- lobby.boss.currentHealth = newHp is now a read-only projection
- Spectator-heal path marked with TODO MAINT-05+ deferral comment
- Removed manual eventBus.emit('combat:boss_damaged') from websocket.ts attack_boss handler
- tsc clean, 911 tests pass, lint clean

## Verification

- grep -c playerAttackBoss server/domains/CombatManager.ts returns 1 (JSDoc comment only)
- grep -c playerAttackBoss server/domains/CombatManager.test.ts returns 0
- grep -n combat:boss_damaged server/websocket.ts returns comment only, no emit
- npm run check exits 0
- npm test exits 0 with 911 passed
- npm run lint exits 0

## Deviations from Plan

None - plan executed exactly as written. Spectator-heal path intentionally deferred per plan.

## MAINT-05 Success Criteria

- [x] applyBasicDamageToBoss is the single authoritative basic-attack boss-HP drain
- [x] Returns { damage, newHp }
- [x] gameState.attackBoss dev/qa branch delegates HP drain to CombatManager
- [x] lobby.boss.currentHealth treated as read-only projection
- [x] Basic attack triggers checkPhaseTransition (phase-2 at 67%, enrage at 34%)
- [x] combat:boss_damaged fires EXACTLY once per basic attack
- [x] The 4 downstream listeners (ClientEventEmitter, onBossDamagedBuff, ClassMasteryManager,
      ProgressionManager) still fire exactly once per basic attack

## Known Stubs

None.

## Threat Flags

None. The client-supplied damage parameter on attack_boss was already unused (T-49-01, accepted).

## Self-Check: PASSED

- [x] server/domains/CombatManager.ts modified - applyBasicDamageToBoss present
- [x] server/domains/CombatManager.test.ts modified - 37 call sites renamed, 2 regression tests added
- [x] server/gameState.ts modified - delegation call present
- [x] server/websocket.ts modified - double-emit removed
- [x] Commit 245de45 exists (Task 1)
- [x] Commit d7536a3 exists (Task 2)
- [x] 911 tests pass (2 new regression tests vs 909 baseline)
