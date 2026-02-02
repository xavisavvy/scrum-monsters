# Phase 06 Plan 03b: Minion Player Interaction and UI Summary

---
phase: 06-new-flow-implementation
plan: 03b
subsystem: combat
tags: [minion, player-interaction, ui, websocket, state-management]
depends_on:
  requires:
    - "06-03: Spectator Minion Foundation"
  provides:
    - "Player attack minion functionality"
    - "Minion respawn mechanics"
    - "Team switch handling"
    - "MinionDisplay UI component"
  affects:
    - "06-04: Discussion Phase (may add minion interactions)"
tech_stack:
  added: []
  patterns:
    - "Click-to-attack minion targeting"
    - "Scheduled respawn with setTimeout"
    - "Team switch kills minion immediately"
key_files:
  created:
    - "client/src/components/game/MinionDisplay.tsx"
  modified:
    - "server/events/eventTypes.ts"
    - "server/domains/CombatManager.ts"
    - "server/events/ClientEventEmitter.ts"
    - "server/websocket.ts"
    - "shared/gameEvents.ts"
    - "client/src/lib/stores/useGameState.tsx"
    - "client/src/lib/socket/eventHandlers.ts"
    - "client/src/components/game/phases/BattlePhase.tsx"
    - "server/domains/CombatManager.test.ts"
decisions:
  - key: "Minion respawn random delay"
    value: "15-30 seconds random for variety"
  - key: "Team switch kills minion immediately"
    value: "No respawn on team switch (respawnInSeconds=0)"
  - key: "getCombatState returns undefined"
    value: "Consistency with Map.get() behavior"
metrics:
  duration: "8 min 18 sec"
  completed: "2026-02-02"
---

## One-Liner

Player-minion click-to-attack with 15-30s respawn, immediate kill on team switch, and purple-themed MinionDisplay UI.

## What Was Built

### Server Event Types (eventTypes.ts)
- `CombatMinionDamagedPayload`: minion damage with attacker tracking
- `CombatMinionKilledPayload`: minion death with respawn timer

### CombatManager Methods
- `playerAttackMinion()`: Calculate damage, emit events, trigger kill
- `killMinion()`: Mark dead, emit event, schedule respawn
- `respawnMinion()`: Check team, restore HP, emit spawn event
- `handleSpectatorSwitchToVoter()`: Immediate kill, no respawn

### Socket Handler (websocket.ts)
- `attack_minion` handler: Validate player, delegate to CombatManager

### Client Event Handlers (eventHandlers.ts)
- `combat:minion_damaged`: Update minion HP in store
- `combat:minion_killed`: Mark dead, schedule removal for team switch

### Client Store (useGameState.tsx)
- Added `removeMinion()` action for cleanup

### MinionDisplay Component
- 72-line React component with HP bars
- Click-to-attack with `attack_minion` emit
- Purple theme with pulse animation for alive minions
- Greyed "Defeated" state for dead minions

### BattlePhase Integration
- MinionDisplay added to sidebar content
- Self-hiding when no minions present

## Technical Decisions

1. **Minion respawn timing (15-30s)**: Random delay adds unpredictability without being frustrating
2. **Team switch immediate kill**: When spectator becomes voter, their minion dies instantly with `respawnInSeconds=0` signaling no respawn
3. **getCombatState returns undefined**: Changed from `null` to `undefined` for consistency with `Map.get()` - updated tests accordingly

## Event Flow

```
Player clicks minion in MinionDisplay
  -> emit('attack_minion', { minionPlayerId })
  -> websocket.ts handler
  -> combatManager.playerAttackMinion()
  -> eventBus.emit('combat:minion_damaged')
  -> ClientEventEmitter forwards to clients
  -> eventHandlers.ts updates useGameState
  -> MinionDisplay re-renders with new HP

If HP <= 0:
  -> killMinion() called
  -> eventBus.emit('combat:minion_killed')
  -> setTimeout schedules respawnMinion()
  -> (15-30s later) respawnMinion checks team
  -> If still spectator: emit combat:minion_spawned
  -> If switched teams: remove from minions map
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getCombatState test failures**
- **Found during:** Task 6
- **Issue:** Changed return type from `null` to `undefined` for consistency
- **Fix:** Updated all test assertions from `toBeNull()` to `toBeUndefined()`
- **Files modified:** server/domains/CombatManager.test.ts
- **Commit:** a29fd2b

## Files Changed

| File | Changes |
|------|---------|
| server/events/eventTypes.ts | Added CombatMinionDamagedPayload, CombatMinionKilledPayload |
| shared/gameEvents.ts | Added combat:minion_damaged, combat:minion_killed, attack_minion events |
| server/domains/CombatManager.ts | Added playerAttackMinion, killMinion, respawnMinion, handleSpectatorSwitchToVoter |
| server/events/ClientEventEmitter.ts | Added minion damage/kill event listeners |
| server/websocket.ts | Added attack_minion socket handler |
| client/src/lib/stores/useGameState.tsx | Added removeMinion action |
| client/src/lib/socket/eventHandlers.ts | Added minion damage/kill handlers |
| client/src/components/game/MinionDisplay.tsx | New 72-line component |
| client/src/components/game/phases/BattlePhase.tsx | Integrated MinionDisplay |
| server/domains/CombatManager.test.ts | Updated assertions for undefined return |

## Commits

| Hash | Message |
|------|---------|
| 87d5585 | feat(06-03b): add minion damage and kill event types |
| d84f80a | feat(06-03b): add minion damage/kill client events |
| 140060c | feat(06-03b): add minion respawn timing constants |
| bec58ff | feat(06-03b): implement playerAttackMinion method |
| 6ad4ce2 | feat(06-03b): implement killMinion and respawnMinion methods |
| a29fd2b | feat(06-03b): implement spectator team switch handling |
| 7ce529d | feat(06-03b): wire minion damage/kill events in ClientEventEmitter |
| 7f2b92a | feat(06-03b): add attack_minion socket handler |
| 59484d8 | feat(06-03b): add minion damage/kill handlers to client store |
| 5ef4c65 | feat(06-03b): create MinionDisplay component |
| 22022ce | feat(06-03b): integrate MinionDisplay into BattlePhase |

## Verification

- [x] npm run check passes (pre-existing errors unrelated to changes)
- [x] npm test passes (319/319 tests)
- [x] playerAttackMinion in CombatManager
- [x] attack_minion socket handler in websocket.ts
- [x] MinionDisplay component (72 lines > 40 minimum)
- [x] emit('attack_minion') in MinionDisplay
- [x] <MinionDisplay in BattlePhase

## Next Steps

Ready for Plan 06-04: Discussion Phase Implementation
- Discussion timer mechanics
- Host finalize estimate
- Consensus checking during discussion
