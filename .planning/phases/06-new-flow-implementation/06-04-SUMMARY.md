# Phase 06 Plan 04: Discussion Phase Flow Summary

---
phase: 06
plan: 04
subsystem: estimation
tags:
  - discussion
  - timer
  - consensus
  - finalization
dependency-graph:
  requires:
    - 06-01 (countdown-attack pattern)
    - 06-02 (team attack completion)
  provides:
    - Discussion timer with 2 minute default
    - Consensus detection during discussion
    - Host finalize estimate capability
    - Four discussion ending mechanisms
  affects:
    - 06-05 (victory/next level transitions)
tech-stack:
  added: []
  patterns:
    - Timer-based phase management
    - Cross-team consensus checking
    - Host-only finalization controls
key-files:
  created: []
  modified:
    - server/events/eventTypes.ts
    - shared/gameEvents.ts
    - server/domains/EstimationManager.ts
    - server/events/ClientEventEmitter.ts
    - server/websocket.ts
    - client/src/lib/stores/useGameState.tsx
    - client/src/lib/socket/eventHandlers.ts
    - client/src/components/game/Discussion.tsx
decisions:
  - key: discussion-duration-default
    choice: 2 minutes
    reason: Sufficient time for meaningful discussion without dragging
  - key: timer-ui-location
    choice: Centered in Discussion Status card
    reason: High visibility for time pressure awareness
  - key: finalize-validation
    choice: Must be voted value only
    reason: Prevents host from picking arbitrary estimates
  - key: consensus-auto-end
    choice: Immediate end on full consensus
    reason: No reason to wait when everyone agrees
metrics:
  duration: 8 min
  completed: 2026-02-02
---

## One-liner

Discussion phase with 2-minute timer, consensus auto-end, and host finalization from voted values only.

## What Was Built

### Server-side Discussion Timer Logic

**EstimationManager enhancements:**
- `startDiscussionPhase(lobbyId, durationMs?)` - Initiates timer (default 2 minutes)
- `checkDiscussionConsensus(lobbyId)` - Auto-ends when both teams agree
- `hostFinalizeEstimate(lobbyId, hostId, estimate)` - Host picks from voted values
- `handleDiscussionTimeout(lobbyId)` - Picks majority on timer expiry
- `endDiscussion(lobbyId, reason, finalEstimate)` - Cleanup and emit result

**Domain Events Added:**
- `estimation:discussion_timer_started` - Timer begins with duration and endsAt
- `estimation:discussion_ended` - Result with reason (consensus/host_finalized/timer_expired)

**Socket Handler:**
- `finalize_estimate` - Host-only command to end discussion with chosen value

### Client-side Discussion UI

**State Management:**
- `discussionTimer` state in useGameState (active, endsAt, durationMs)
- Socket event handlers for timer start/end
- Countdown calculation using useEffect interval

**Discussion Component Updates:**
- Timer countdown display (MM:SS format)
- Host finalize buttons showing all voted values
- Buttons hidden when consensus already reached
- Clean integration with existing vote display

## Key Implementation Details

### Four Discussion Ending Mechanisms

Priority order:
1. **Consensus auto-ends** - When all voters agree, discussion ends immediately
2. **Host finalization** - Host can click any voted value to finalize
3. **Timer expiration** - Picks majority vote when time runs out
4. **Tie at timeout** - Majority value selected (first in tally order)

### Consensus Check Flow

```
Vote change during discussion
    |
    v
checkConsensus(team) - Updates team consensus state
    |
    v
checkDiscussionConsensus(lobby) - Checks if BOTH teams agree
    |
    v
endDiscussion('consensus', value) - If full consensus reached
```

### Finalize Validation

Host can only pick from values that were actually voted:
- Collects all numeric votes from both teams
- Validates requested estimate exists in that set
- Throws error if invalid value requested

## Files Modified

| File | Changes |
|------|---------|
| server/events/eventTypes.ts | +16 lines - Discussion timer event payloads |
| shared/gameEvents.ts | +4 lines - Client event signatures |
| server/domains/EstimationManager.ts | +166 lines - Timer and consensus logic |
| server/events/ClientEventEmitter.ts | +14 lines - Event forwarding |
| server/websocket.ts | +30 lines - finalize_estimate handler |
| client/src/lib/stores/useGameState.tsx | +14 lines - Discussion timer state |
| client/src/lib/socket/eventHandlers.ts | +27 lines - Event handlers |
| client/src/components/game/Discussion.tsx | +60 lines - Timer UI and finalize buttons |

## Commits

| Hash | Message |
|------|---------|
| 50b7b04 | feat(06-04): add discussion timer event types |
| df761a4 | feat(06-04): add discussion client events |
| 535e578 | feat(06-04): add discussion state to EstimationManager |
| 404e58a | feat(06-04): implement startDiscussionPhase method |
| 5286050 | feat(06-04): implement consensus check on vote change |
| 8176954 | feat(06-04): implement host finalize estimate |
| 636b603 | feat(06-04): implement discussion timeout and end methods |
| a715d04 | feat(06-04): wire discussion events in ClientEventEmitter |
| 6c5477d | feat(06-04): add finalize_estimate socket handler |
| 0f662a1 | feat(06-04): add discussion state to client store |
| abbbdee | feat(06-04): update Discussion component UI |
| fd173a8 | feat(06-04): cleanup discussion timer in EstimationManager |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Discussion duration default | 2 minutes | Per plan spec, reasonable for meaningful discussion |
| Timer display format | MM:SS centered | High visibility countdown format |
| Finalize validation | Voted values only | Prevents arbitrary host selections |
| Consensus auto-end | Immediate | No delay needed when full agreement reached |

## Next Phase Readiness

**Ready for Plan 06-05 (Victory/Next Level Flow):**
- Discussion ends with finalEstimate value
- `estimation:discussion_ended` event emitted with reason
- Phase transition logic can subscribe to this event
- Timer cleanup prevents memory leaks on lobby destruction

**Integration Points:**
- CombatManager can subscribe to `estimation:discussion_ended` for phase transitions
- Victory screen can display final estimate value and ending reason
- Next level flow triggered after discussion complete
