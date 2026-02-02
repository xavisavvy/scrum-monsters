# Phase 06 Plan 05: End-to-End Flow Integration Summary

---
phase: 06
plan: 05
subsystem: game-flow
tags: [integration, phase-transitions, events, testing]
dependency_graph:
  requires:
    - 06-01 (countdown system)
    - 06-02 (team attack)
    - 06-03 (minion system)
    - 06-03b (minion player interaction)
    - 06-04 (discussion phase)
  provides:
    - Complete battle->discussion->next_level/victory flow
    - combat:battle_complete event
    - proceed_next_level socket handler with domain managers
    - Spectator team switch combat integration
    - Integration tests for game flow
  affects:
    - Client phase transitions
    - Full game loop functionality
tech_stack:
  added: []
  patterns:
    - Event-driven phase transitions
    - Domain manager coordination
    - Integration testing with fake timers
file_tracking:
  key_files:
    created:
      - server/integration/gameFlow.test.ts
    modified:
      - server/events/eventTypes.ts
      - server/events/index.ts
      - server/domains/CombatManager.ts
      - server/domains/EstimationManager.ts
      - server/websocket.ts
decisions:
  - title: "Both teams needed for full consensus"
    context: "Integration tests revealed single-team voting doesn't trigger full_consensus_reached"
    choice: "Tests use both developer and QA voters"
    rationale: "Matches actual game behavior where both teams vote"
  - title: "ScopedEventBus for integration tests"
    context: "EventBus vs ScopedEventBus caused test failures"
    choice: "Use ScopedEventBus to match production code"
    rationale: "CombatManager expects ScopedEventBus interface"
metrics:
  duration: "8 min"
  completed: "2026-02-02"
---

## One-Liner

Complete game flow wiring: battle_complete -> discussion phase -> next_level/victory transitions with integration tests.

## What Was Built

### 1. Battle Complete Event System
- Added `CombatBattleCompletePayload` to eventTypes.ts
- CombatManager emits `combat:battle_complete` after team attack
- EstimationManager subscribes and starts discussion phase automatically
- Clears all combat timers (boss attack, modifier, minion) on battle complete

### 2. Phase Transitions After Discussion
- Added event listener for `estimation:discussion_ended` in websocket.ts
- Applies final estimate to current ticket
- Adds completed ticket to `completedTickets` array
- Transitions to `next_level` if more tickets remain
- Transitions to `victory` if all tickets complete
- Emits `session:phase_changed` events for client sync

### 3. Proceed Next Level Handler
- Updated to use domain managers (SessionManager, EstimationManager, CombatManager)
- Host-only permission check
- Only works from `next_level` phase
- Resets estimation state (cleanupLobby + startEstimation + addEligibleVoter)
- Resets combat state (cleanupLobby + initializeCombat)
- Uses ticket index for boss difficulty scaling

### 4. Spectator Team Switch Integration
- When spectator switches to voting team during battle:
  - Calls `CombatManager.handleSpectatorSwitchToVoter()` to kill minion (no respawn)
  - Adds player to `EstimationManager.addEligibleVoter()`
- When voter switches to spectator:
  - Removes from `EstimationManager.removeEligibleVoter()`

### 5. Integration Tests
Created `server/integration/gameFlow.test.ts` with 9 tests:
- Full estimation -> battle -> discussion cycle
- battle_complete event triggers discussion phase
- Minion spawning for spectators
- Minion kill on spectator team switch
- Player attack minion
- Countdown start on full consensus
- Countdown tick events with decreasing multiplier
- getCombatState undefined for non-existent lobby
- cleanupLobby removes state and timers

## Decisions Made

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Test event bus type | EventBus vs ScopedEventBus | ScopedEventBus | CombatManager expects ScopedEventBus interface |
| Full consensus testing | Single team vs both teams | Both teams | Matches production: full_consensus_reached requires both teams |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing ScopedEventBus in test imports**
- **Found during:** Task 8 (integration tests)
- **Issue:** Tests used EventBus but CombatManager expects ScopedEventBus
- **Fix:** Changed import to use ScopedEventBus
- **Files modified:** server/integration/gameFlow.test.ts

**2. [Rule 1 - Bug] Single-team consensus tests failing**
- **Found during:** Task 8 (integration tests)
- **Issue:** Tests expected full_consensus_reached with only developer team
- **Fix:** Added QA voter to tests since full consensus requires both teams
- **Files modified:** server/integration/gameFlow.test.ts

## Test Results

```
Test Files  9 passed (9)
Tests       328 passed (328)
Duration    1.61s
```

All existing tests pass. New integration tests (9) verify complete game flow.

## Key Links

| Source | Target | Connection |
|--------|--------|------------|
| CombatManager.applyTeamAttack | handleBattleComplete | Direct call after team attack |
| combat:battle_complete | EstimationManager.handleBattleComplete | Event subscription |
| estimation:discussion_ended | websocket.ts handler | Event subscription |
| sessionManager.changeOwnTeam | combatManager.handleSpectatorSwitchToVoter | Conditional call |

## What's Ready

1. **Complete Game Loop**: estimation -> battle -> discussion -> next_level/victory
2. **Team Attack Flow**: Countdown -> team attack -> boss damage -> battle complete -> discussion
3. **Spectator Integration**: Minions spawn, attack, die, can switch to voter mid-battle
4. **Phase Transitions**: Properly emit session:phase_changed events

## Commits

| Hash | Description |
|------|-------------|
| 01c601b | feat(06-05): add battle_complete event and phase transition |
| a7345f6 | feat(06-05): implement phase transitions and proceed_next_level |
| 14c9ade | feat(06-05): enhance change_own_team for combat integration |
| bb56644 | test(06-05): add end-to-end game flow integration tests |
| 1339e90 | refactor(06-05): document lobby_updated emission decisions |
