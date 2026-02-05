# Plan 06-02: Team Attack and Countdown Overlay Summary

---
phase: 06-new-flow-implementation
plan: 02
subsystem: combat-ui
tags: [team-attack, countdown, gsap, socket-events, zustand]

dependency_graph:
  requires: [06-01]
  provides: [team-attack-damage, countdown-overlay, multiplier-display]
  affects: [06-04, 06-05]

tech_stack:
  added: []
  patterns: [gsap-animation, zustand-selector, socket-event-handler]

key_files:
  created:
    - client/src/components/game/CountdownOverlay.tsx
  modified:
    - server/events/eventTypes.ts
    - server/events/index.ts
    - server/events/ClientEventEmitter.ts
    - server/domains/CombatManager.ts
    - shared/gameEvents.ts
    - client/src/lib/stores/useGameState.tsx
    - client/src/lib/socket/eventHandlers.ts
    - client/src/components/game/phases/BattlePhase.tsx

decisions:
  - id: team-attack-damage-formula
    choice: "baseDamage * multiplier * battleModifier"
    rationale: "Consistent with existing damage calculation, multiplier from countdown"
  - id: team-attack-delay
    choice: "500ms delay after countdown_complete"
    rationale: "Allows client to display STRIKE! animation before boss HP updates"
  - id: countdown-state-cleanup
    choice: "2 second timeout after countdown_complete"
    rationale: "Gives time to show STRIKE! and team attack result before clearing overlay"

metrics:
  duration: "8 min"
  completed: "2026-02-02"
  tasks: "8/8"
  test_results: "319 passed, 0 failed"
---

## One-liner

Team attack damage calculation with JRPG-style countdown overlay using GSAP pulse animations.

## What Was Built

### Server: Team Attack System

1. **CombatTeamAttackPayload** (eventTypes.ts)
   - Domain event for team attack completion
   - Contains damage, multiplier, targetBossId, newBossHp

2. **applyTeamAttack method** (CombatManager.ts)
   - Calculates base team damage (sum of all fighting players' class damages)
   - Applies countdown multiplier (1.5x-3.0x) and battle modifier
   - Reduces boss HP and emits team_attack event
   - Checks for boss defeat after damage

3. **completeCountdown integration** (CombatManager.ts)
   - Triggers applyTeamAttack after 500ms delay for animation
   - Passes finalMultiplier for damage calculation

4. **ClientEventEmitter wiring**
   - Forwards combat:team_attack to clients via Socket.IO

### Client: Countdown Overlay

1. **CountdownState** (useGameState.tsx)
   - Interface with active, remainingSeconds, multiplier
   - setCountdown action for state management

2. **Event handlers** (eventHandlers.ts)
   - countdown_started: Initialize with 3.0x multiplier
   - countdown_tick: Update remaining time and multiplier
   - countdown_complete: Show STRIKE!, clear after 2s
   - team_attack: Update boss HP

3. **CountdownOverlay component**
   - LIMIT BREAK label with pulse animation
   - Countdown number with GSAP scale animation on each tick
   - Multiplier display (e.g., "Damage: 2.5x")
   - Urgency message when <= 3 seconds remaining
   - STRIKE! display on completion
   - Radial gradient background (gold during countdown, orange on strike)

4. **BattlePhase integration**
   - CountdownOverlay rendered as sibling to PhaseContainer
   - Uses fixed positioning with z-50 for overlay effect

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing EstimationFullConsensusReachedPayload export**
- **Found during:** Task 1
- **Issue:** CombatManager imports EstimationFullConsensusReachedPayload but it wasn't exported from barrel
- **Fix:** Added to server/events/index.ts exports
- **Commit:** ed2652d

**2. [Rule 3 - Blocking] Missing minions field in LobbyCombatState**
- **Found during:** Task 6
- **Issue:** Parallel plan 06-03 added minions field to interface, causing compilation error
- **Fix:** Added `minions: new Map()` to initializeCombat
- **Commit:** 8f478c2

**3. [Rule 3 - Blocking] Duplicate startMinionAttackLoop method**
- **Found during:** Task 8
- **Issue:** Added stub for startMinionAttackLoop, but 06-03 merged real implementation
- **Fix:** Removed stub, kept 06-03's implementation
- **Commit:** 4dc28ad

## Commits

| Commit | Description |
|--------|-------------|
| ed2652d | Add team attack domain event type |
| f4909fe | Add team attack client event signature |
| 2ac692d | Implement applyTeamAttack method |
| f5b85f6 | Trigger team attack on countdown completion |
| 74d2a3e | Wire team attack event to Socket.IO |
| 8f478c2 | Add countdown state to client store |
| ea67bfd | Create CountdownOverlay component |
| 4dc28ad | Integrate CountdownOverlay into BattlePhase |

## Verification

- [x] npm run check - Pre-existing errors only (not from this plan)
- [x] npm test - 319 tests pass
- [x] Team attack damage = sum(player damages) * multiplier * battleModifier
- [x] CountdownOverlay displays LIMIT BREAK label
- [x] Countdown number pulses on each tick (GSAP animation)
- [x] Multiplier display shows current damage multiplier
- [x] Boss defeat check runs after team attack
- [x] Countdown state managed in client store with proper cleanup

## Next Phase Readiness

Ready for PLAN-06-03 (Minion Combat System) - the minion infrastructure was merged in parallel with this plan. Team attack and countdown provide the coordinated damage event that minions will also participate in.

## Known Issues

- Pre-existing TypeScript errors in codebase (unrelated to this plan)
- performMinionAction method missing (will be added by 06-03)
