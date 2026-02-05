# Phase 06 Plan 01: All-Voted Countdown Timer Summary

---
phase: 06
plan: 01
subsystem: combat
tags: [countdown, timer, multiplier, events, domain-events]

dependency-graph:
  requires: [05-fine-grained-events]
  provides: [countdown-infrastructure, countdown-events, multiplier-scaling]
  affects: [06-02-team-attack]

tech-stack:
  added: []
  patterns: [setInterval-based-countdown, linear-interpolation-multiplier]

key-files:
  created: []
  modified:
    - server/events/eventTypes.ts
    - server/domains/CombatManager.ts
    - server/events/ClientEventEmitter.ts
    - shared/gameEvents.ts

decisions:
  - name: "Linear multiplier interpolation"
    rationale: "Simple, predictable, JRPG-style dramatic countdown"
    value: "3.0x at 10s to 1.5x at 0s"

metrics:
  duration: "4 min"
  completed: "2026-02-02"
---

## One-liner

10-second countdown timer with linear 3x-1.5x multiplier triggered by full_consensus_reached

## What Was Built

Server-side countdown infrastructure that triggers when all eligible voters reach consensus. The countdown runs for 10 seconds, emitting tick events every second with remaining time and a damage multiplier that decreases linearly from 3.0x (at 10 seconds) to 1.5x (at 0 seconds). This creates the dramatic JRPG-style "LIMIT BREAK" charging sequence.

### Key Components

1. **Domain Event Types** (`server/events/eventTypes.ts`)
   - `CombatCountdownStartedPayload` - countdown begins
   - `CombatCountdownTickPayload` - each second with remaining time + multiplier
   - `CombatCountdownCompletePayload` - countdown ends with final multiplier

2. **Client Event Signatures** (`shared/gameEvents.ts`)
   - `combat:countdown_started` - includes durationSeconds, startedAt
   - `combat:countdown_tick` - includes remainingSeconds, multiplier
   - `combat:countdown_complete` - includes finalMultiplier

3. **CombatManager Countdown Methods** (`server/domains/CombatManager.ts`)
   - `startCountdown()` - begins countdown, emits started event
   - `tickCountdown()` - private method, emits tick or calls complete
   - `completeCountdown()` - clears interval, emits complete event
   - `calculateCountdownMultiplier()` - linear interpolation
   - `handleFullConsensus()` - bridges estimation to countdown

4. **Socket.IO Event Bridge** (`server/events/ClientEventEmitter.ts`)
   - Listeners for all three countdown domain events
   - Emits to lobby with seq/timestamp for ordering

### Event Flow

```
EstimationManager emits full_consensus_reached
    |
    v
CombatManager.handleFullConsensus()
    |
    v
CombatManager.startCountdown()
    |-- emits combat:countdown_started
    |-- starts setInterval (1000ms)
    v
CombatManager.tickCountdown() [every second]
    |-- calculates remaining time
    |-- calculates multiplier (3.0 -> 1.5)
    |-- emits combat:countdown_tick (or calls completeCountdown at 0)
    v
CombatManager.completeCountdown()
    |-- clears interval
    |-- emits combat:countdown_complete
    v
[PLAN-06-02 will apply team attack with finalMultiplier]
```

## Commits

| Hash | Description |
|------|-------------|
| f7a4ce5 | Define countdown domain event types |
| d8f8c59 | Add client countdown event signatures |
| 5491c0a | Add countdown state and constants to CombatManager |
| 7f2cc6a | Implement startCountdown and tickCountdown methods |
| cb1f4e7 | Implement completeCountdown method |
| f9824f2 | Subscribe to full_consensus_reached event |
| 0fdca64 | Add countdown cleanup in cleanupLobby |
| 50dae37 | Wire countdown events to Socket.IO |

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

- All 319 existing tests pass
- Pre-existing TypeScript errors in client components are unrelated to countdown work
- Countdown infrastructure verified through:
  - Type checking passes for new event types
  - CombatManager correctly subscribes to full_consensus_reached
  - ClientEventEmitter forwards all three countdown events

## Next Phase Readiness

Ready for PLAN-06-02: Team Attack Damage. The countdown infrastructure emits all necessary events, and the `completeCountdown` method has a placeholder comment indicating where team attack logic will be integrated.

### Integration Points for 06-02

- `combat:countdown_complete` event contains `finalMultiplier`
- CombatManager has access to all player states for damage calculation
- Boss damage methods already exist (`playerAttackBoss`)
