# Phase 06 Plan 03: Spectator Minion Foundation Summary

---
phase: 06-new-flow-implementation
plan: 03
subsystem: combat
tags: [minion, ai, spectator, combat, state-management]

dependency-graph:
  requires: [06-01]
  provides: [minion-spawn, minion-ai-loop, minion-state]
  affects: [06-04]

tech-stack:
  added: []
  patterns: [ai-action-loop, recursive-setTimeout]

key-files:
  created: []
  modified:
    - server/events/eventTypes.ts
    - server/events/index.ts
    - shared/gameEvents.ts
    - server/domains/CombatManager.ts
    - server/events/ClientEventEmitter.ts
    - client/src/lib/stores/useGameState.tsx
    - client/src/lib/socket/eventHandlers.ts

decisions:
  - id: minion-hp-scaling
    decision: "Base HP 50 + 10 per voter for scaled difficulty"
    rationale: "More voters = stronger minions = balanced challenge"
  - id: minion-action-distribution
    decision: "50% attack, 30% heal boss, 20% debuff"
    rationale: "Attacks are primary threat, heals extend fights, debuffs add variety"
  - id: minion-attack-interval
    decision: "4 second loop for all minions"
    rationale: "Slower than boss attacks to avoid overwhelming players"

metrics:
  duration: 11 min
  completed: 2026-02-02
---

Spectator minion system with AI-driven combat behavior

## What Was Built

Server-side minion foundation enabling spectators to appear as AI-controlled minions on the boss side during combat. Minions spawn when combat initializes and periodically perform actions to pressure players.

**Key features:**
- MinionState interface with HP tracking and alive status
- Three minion event types: spawn, attack, heal_boss
- Minion HP scales with voter count (50 + 10*voters)
- AI action loop runs every 4 seconds per alive minion
- Action distribution: 50% attack players, 30% heal boss, 20% debuff
- Client state management via Zustand store

## Implementation Details

### Server: Domain Event Types
- `MinionState` interface for tracking minion HP and alive status
- `CombatMinionSpawnedPayload` for spawn events with avatar info
- `CombatMinionAttackPayload` for attack/debuff with damage
- `CombatMinionHealBossPayload` for boss healing with amount

### Server: CombatManager Extensions
- Added `minions: Map<string, MinionState>` to LobbyCombatState
- Minion constants: base HP (50), scale (10/voter), damage (15), heal (25)
- `initializeCombat`: Spawns minions for spectators, emits spawn events
- `startMinionAttackLoop`: Recursive setTimeout every 4 seconds
- `performMinionAction`: Weighted random action selection
- `cleanupLobby`: Clears minionAttackIntervalHandle

### Server: ClientEventEmitter
- Listeners for all three minion events
- Standard emitToLobby with seq/timestamp enrichment

### Client: State and Events
- `MinionClientState` interface in useGameState
- `minions: Map<string, MinionClientState>` state
- `addMinion` action for spawn handling
- Event handlers for spawn, attack, heal_boss

## Commits

| Hash | Description |
|------|-------------|
| 49067a3 | Define minion state and event types |
| 2b268b8 | Add minion client events to ServerToClientEvents |
| b95f010 | Add minion state and constants to CombatManager |
| e87e816 | Implement minion spawn and AI attack loop |
| 52d2ca7 | Wire minion events in ClientEventEmitter |
| 054af0a | Add minion state to client store and event handlers |
| 1fabe9b | Cleanup minion attack interval in cleanupLobby |

## Verification

```bash
npm run check  # Pre-existing TS errors only (not minion-related)
npm test       # 319 tests passing
```

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Ready for PLAN-06-04 (if exists) or subsequent minion UI work.

**Provides:**
- Minion state infrastructure for combat
- AI action loop with configurable timing
- Client state synchronization
- Memory-safe cleanup on lobby destruction

**Not included (future work):**
- Minion death/respawn mechanics
- Minion damage UI effects
- Minion avatar retrieval from SessionManager
