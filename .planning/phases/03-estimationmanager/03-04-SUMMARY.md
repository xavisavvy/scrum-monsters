# Phase 03 Plan 04: Vote Visibility & Host Controls Summary

**One-liner:** Implemented vote visibility state machine, discussion phase vote changes, and host force estimate with majority/tie handling

---

## Frontmatter

```yaml
phase: 03-estimationmanager
plan: 04
completed: 2026-02-02
duration: 7 min
subsystem: estimation
status: complete

requires:
  - 03-02  # Voting and consensus foundation
  - 03-03  # Timer management

provides:
  - Vote visibility (phase-based hiding/revealing)
  - Discussion phase vote modification
  - Host force estimate controls
  - Cross-team transparency

affects:
  - WebSocket integration (will use visibility and force methods)
  - UI components (will consume VoteVisibility interface)

tech_stack:
  added: []
  patterns:
    - Phase-based state machine for vote visibility
    - Type guards for team validation (VotingTeam)
    - Majority detection with tie handling

key_files:
  created: []
  modified:
    - server/domains/EstimationManager.ts (vote visibility, discussion, force)
    - server/domains/EstimationManager.test.ts (53 tests total)
    - server/errors/EstimationErrors.ts (new error types)
    - server/events/eventTypes.ts (new event types)

decisions:
  - decision: "Vote values hidden during voting phase"
    rationale: "Prevents anchoring bias per classic planning poker principles"
    alternatives: ["Always show votes", "Show after timer"]
    file: "server/domains/EstimationManager.ts:getVoteVisibility"

  - decision: "Global phase uses most advanced team phase"
    rationale: "Once any team reveals, full cross-team transparency for discussion"
    alternatives: ["Per-team visibility", "Both teams must reveal"]
    file: "server/domains/EstimationManager.ts:getAllVoteVisibility"

  - decision: "Force estimate requires host to choose during ties"
    rationale: "Prevents arbitrary selection, host makes explicit choice"
    alternatives: ["Random selection", "Always use first value", "Reject force during ties"]
    file: "server/domains/EstimationManager.ts:forceEstimate"

  - decision: "VotingTeam type excludes spectators"
    rationale: "Type safety prevents spectators from voting operations"
    alternatives: ["Runtime checks only", "TeamType with guards"]
    file: "server/domains/EstimationManager.ts:VotingTeam"

tags:
  - estimation
  - vote-visibility
  - discussion-phase
  - host-controls
  - planning-poker
  - typescript
```

---

## What Was Built

### Task 1: Vote Visibility State Machine
**Status:** ✅ Complete
**Commit:** `82b38a4`

Implemented phase-based vote visibility following planning poker best practices:

- **VoteVisibility interface** for UI consumption (playerId, hasVoted, vote?)
- **getVoteVisibility(lobbyId, team)** - Returns visibility per team, hides values during voting
- **getAllVoteVisibility(lobbyId)** - Cross-team visibility with global phase (voting/revealed/discussion)
- **enterDiscussionPhase(lobbyId, team)** - Transitions team to discussion, emits event

**Key behavior:**
- Voting phase: `hasVoted` true/false, `vote` undefined (prevents anchoring)
- Revealed/discussion phase: `vote` value included
- Global phase: Most advanced team phase (discussion > revealed > voting)
- Full cross-team transparency after any team reveals

**Tests added:**
- Vote values hidden during voting
- Vote values shown during revealed/discussion
- Global phase uses most advanced team
- Discussion phase transition emits event
- Error handling for non-existent estimation

### Task 2: Discussion Phase Vote Changes
**Status:** ✅ Complete
**Commit:** `9bfebae`

Implemented vote modification during discussion phase:

- **changeVoteDuringDiscussion(lobbyId, playerId, team, newVote)** - Updates vote during discussion
- **NotInDiscussionPhaseError** - Thrown when changing vote outside discussion phase
- **Consensus reset and re-check** - Detects new consensus after vote change

**Key behavior:**
- Must be in 'discussion' phase (not 'voting' or 'revealed')
- Validates player eligibility and vote value
- Stores old vote for event emission
- Resets team consensus (hasConsensus = false, consensusValue = undefined)
- Emits `estimation:vote_changed` with old and new values
- Re-runs consensus check (might create new consensus)

**Tests added:**
- Vote change updates Map during discussion
- Vote change emits event with old/new values
- Vote change resets consensus
- Vote change creating new consensus triggers event
- Phase validation throws NotInDiscussionPhaseError
- Error handling for invalid states

### Task 3: Host Force Estimate Controls
**Status:** ✅ Complete
**Commit:** `ab6cab5`

Implemented host-driven estimate forcing with tie handling:

- **getVoteTally(lobbyId, team)** - Returns Map of vote counts
- **forceEstimate(lobbyId, team, hostId, forcedValue?)** - Forces consensus using majority or host choice
- **ForceEstimateTieError** - Thrown when tie exists and no forcedValue provided
- **InvalidForcedValueError** - Thrown when forcedValue not in tied values

**Key behavior:**
- Uses majority vote value by default (highest count)
- Ignores abstentions ('?') when determining majority
- Tie detection: Multiple values with same highest count
- Tie requires forcedValue parameter from host
- Validates forcedValue is one of the tied values
- Sets consensus and emits `estimation:estimate_forced` event
- Triggers full consensus check

**Tests added:**
- Force uses majority when clear majority exists
- Tie throws ForceEstimateTieError without forcedValue
- Tie accepts forcedValue from tied values
- Invalid forcedValue throws error
- Event emission with wasTied flag
- Abstentions ignored in majority calculation
- Full consensus check triggered after force

### Type Safety Fix
**Status:** ✅ Complete
**Commit:** `a17cc8d`

Added type safety for voting teams and event types:

- **VotingTeam type** - `Exclude<TeamType, 'spectators'>` prevents spectator operations
- **isVotingTeam type guard** - Runtime validation for team parameter
- **Event type additions** - Added `estimation:discussion_started` and `estimation:estimate_forced`
- **Updated EstimationVoteChangedPayload** - Added `team` field

**Guards added to methods:**
- castVote, checkConsensus, enterDiscussionPhase
- changeVoteDuringDiscussion, getVoteTally, forceEstimate
- pauseTimer, resumeTimer, extendTimer

---

## Verification Results

**Test suite:** ✅ All 133 tests pass
**TypeScript check:** ✅ No errors in EstimationManager domain
**Coverage:** 53 tests in EstimationManager.test.ts

**Test breakdown:**
- Instantiation: 2 tests
- startEstimation: 1 test
- cleanupLobby: 2 tests
- addEligibleVoter: 2 tests
- removeEligibleVoter: 4 tests
- castVote: 12 tests
- checkConsensus: 10 tests
- vote visibility: 6 tests
- changeVoteDuringDiscussion: 8 tests
- getVoteTally: 3 tests
- forceEstimate: 10 tests

---

## Deviations from Plan

None - plan executed exactly as written.

All features implemented per CONTEXT.md requirements:
- Classic poker vote hiding during voting phase
- Full cross-team transparency after reveal
- Vote changes during discussion with consensus reset
- Host force estimate using majority with tie handling

---

## Technical Notes

### Vote Visibility Pattern
The phase-based state machine ensures anchoring bias prevention:
```typescript
// During voting: show who voted, not values
{ playerId: 'p1', hasVoted: true, vote: undefined }

// After reveal: show values
{ playerId: 'p1', hasVoted: true, vote: 5 }
```

Global phase uses most advanced team phase to enable cross-team discussion once any team reveals.

### Discussion Phase Consensus
Vote changes during discussion reset consensus and re-check:
1. Player changes vote
2. Team consensus cleared
3. checkConsensus runs
4. If new consensus reached, event emitted
5. Full consensus check (both teams)

This allows teams to converge during discussion without re-voting.

### Force Estimate Tie Handling
Majority detection prevents arbitrary choices:
```typescript
// Votes: [5, 5, 8] → Clear majority 5
forceEstimate(lobbyId, team, hostId) // Uses 5

// Votes: [5, 5, 8, 8] → Tie
forceEstimate(lobbyId, team, hostId) // Throws ForceEstimateTieError
forceEstimate(lobbyId, team, hostId, 8) // Host chooses 8
forceEstimate(lobbyId, team, hostId, 13) // Throws InvalidForcedValueError
```

### Type Safety
VotingTeam type and isVotingTeam guard prevent spectator operations at compile and runtime:
```typescript
type VotingTeam = Exclude<TeamType, 'spectators'>;

if (!this.isVotingTeam(team)) {
  throw new VoteNotEligibleError('spectators', 'Spectators cannot vote');
}
```

---

## Next Phase Readiness

**Ready for:** WebSocket integration (plan 03-05)

**Provides:**
- Vote visibility API (`getAllVoteVisibility`)
- Discussion phase API (`enterDiscussionPhase`, `changeVoteDuringDiscussion`)
- Host control API (`forceEstimate`)
- VoteVisibility interface for UI
- All events defined in eventTypes.ts

**Integration points:**
- Socket handlers can call `getAllVoteVisibility` to send UI state
- Timer expiry can call `enterDiscussionPhase`
- Host commands can call `changeVoteDuringDiscussion` and `forceEstimate`
- UI components can consume VoteVisibility structure

**Dependencies met:**
- ✅ Plan 03-02 (voting and consensus foundation)
- ✅ Plan 03-03 (timer management)

---

## Decisions Made

| Decision | Context | Impact |
|----------|---------|--------|
| Vote values hidden during voting | Prevents anchoring bias per planning poker standards | UI must handle undefined vote values |
| Global phase from most advanced team | Enables cross-team discussion transparency | Both teams see all votes once any team reveals |
| Host must choose during ties | Explicit decision vs. arbitrary selection | Force estimate requires optional forcedValue parameter |
| VotingTeam type excludes spectators | Compile-time safety for voting operations | Methods validate team before indexing |

---

## Metadata

**Execution time:** 7 minutes
**Commits:** 4 (3 feature + 1 fix)
**Files modified:** 4
**Tests added:** 20
**Lines added:** ~680

**Feature commits:**
- `82b38a4` - Vote visibility state machine (187 lines)
- `9bfebae` - Discussion phase vote changes (183 lines)
- `ab6cab5` - Host force estimate controls (311 lines)

**Fix commit:**
- `a17cc8d` - Type safety for voting teams (70 lines)
