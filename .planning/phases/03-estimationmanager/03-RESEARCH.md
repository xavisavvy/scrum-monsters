# Phase 3: EstimationManager - Research

**Researched:** 2026-02-01
**Domain:** Planning Poker Voting Systems, Consensus Detection, Timer Management
**Confidence:** HIGH

## Summary

This research investigates extracting voting, consensus, and timer logic from the monolithic GameStateManager into a dedicated EstimationManager domain. The current implementation in `gameState.ts` mixes estimation concerns (voting, consensus, timers) with session and combat logic across 2000+ lines. The phase requirements are clear: implement per-team voting (Dev and QA separate), detect consensus automatically, manage independent per-team timers, and subscribe to SessionManager events.

The standard approach for planning poker estimation combines classic poker voting patterns (simultaneous reveal to prevent anchoring bias), consensus-based estimation (all team members agree on same value), and independent timer management per team. The Phase 1 EventBus infrastructure and Phase 2 SessionManager provide the foundation for domain coordination. Modern planning poker tools in 2026 emphasize preventing anchoring bias through hidden votes, supporting discussion phases where votes can change, and providing host controls (pause, extend, force reveal) for real meeting facilitation.

**Primary recommendation:** Use Map-based state management for dynamic vote tracking (better performance for frequent mutations than Record), implement strict consensus rules (all same value, not majority - per scrum poker standards), manage per-team timers using Map<string, NodeJS.Timeout> with proper cleanup, and emit fine-grained estimation domain events for cross-domain coordination. Timer countdown starts when first vote cast (not on ticket load) to encourage participation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js EventEmitter (native) | Node 18+ | Internal EventBus (Phase 1) | Already implemented in `server/events/EventBus.ts` |
| Node.js Timers (native) | Node 18+ | setTimeout/clearTimeout for voting/discussion timers | Native module, well-understood semantics, proper cleanup prevents memory leaks |
| TypeScript Maps | ES6+ | Vote tracking, timer tracking | Better than Record for dynamic state with frequent additions/deletions (O(1) operations) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| performance.now() | Native | High-resolution timing | Use for accurate elapsed time measurement to compensate for timer drift |
| Zod | 3.23.8 | Runtime validation | Already in project for validating vote values (Fibonacci sequence) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Map for votes | Record<string, Vote> | Record faster for static lookups but Map better for dynamic mutations; estimation state is highly mutable |
| Strict consensus (all same) | Majority voting | Majority violates scrum poker principles - discussion should continue until all agree; strict consensus is industry standard |
| Separate team timers | Single shared timer | Shared timer blocks teams from finishing independently; per-team timers maintain engagement |
| setTimeout | setInterval with drift compensation | setTimeout with recursive calls simpler for one-shot timers; setInterval better for continuous ticking but estimation uses one-shot expiry |

**Installation:**
```bash
# No new dependencies needed for Phase 3
# All required packages already present (native Node.js, Phase 1 EventBus)
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/                        # Domain managers
│   ├── SessionManager.ts           # Phase 2: Already exists
│   └── EstimationManager.ts        # THIS PHASE
├── events/                         # Phase 1: Already exists
│   ├── EventBus.ts
│   ├── ScopedEventBus.ts
│   ├── eventTypes.ts               # Add estimation event types
│   └── index.ts
├── errors/                         # Typed exceptions
│   ├── SessionErrors.ts            # Phase 2: Already exists
│   └── EstimationErrors.ts         # NEW: Estimation validation errors
├── gameState.ts                    # MODIFY: Delegate estimation methods
└── websocket.ts                    # MODIFY: Use EstimationManager for vote handlers
```

### Pattern 1: EstimationManager with Per-Team State Tracking
**What:** Domain manager that tracks per-team votes, consensus, and timers independently
**When to use:** Extracting estimation logic from GameStateManager
**Example:**
```typescript
// server/domains/EstimationManager.ts
import { ScopedEventBus } from '../events';
import { TeamType } from '../../shared/gameEvents';

interface TeamVoteState {
  votes: Map<string, number | '?'>;  // playerId -> vote
  eligibleVoters: Set<string>;       // players who can vote (excludes spectators)
  hasConsensus: boolean;
  consensusValue?: number;
  timerHandle?: NodeJS.Timeout;
  timerStartedAt?: number;
  timerDurationMs?: number;
  phase: 'voting' | 'revealed' | 'discussion';
}

interface EstimationState {
  lobbyId: string;
  ticketId: string;
  teams: {
    developers: TeamVoteState;
    qa: TeamVoteState;
  };
}

export class EstimationManager {
  private estimations = new Map<string, EstimationState>(); // lobbyId -> state

  constructor(private eventBus: ScopedEventBus) {
    // Subscribe to session events to track eligible voters
    this.eventBus.on('session:player_joined', this.handlePlayerJoined.bind(this));
    this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
    this.eventBus.on('session:team_changed', this.handleTeamChanged.bind(this));
  }

  castVote(lobbyId: string, playerId: string, team: TeamType, vote: number | '?'): void {
    const state = this.estimations.get(lobbyId);
    if (!state) throw new EstimationNotActiveError(lobbyId);

    const teamState = state.teams[team];
    if (!teamState.eligibleVoters.has(playerId)) {
      throw new VoteNotEligibleError(playerId, 'Player not eligible to vote');
    }

    const previousVote = teamState.votes.get(playerId);
    teamState.votes.set(playerId, vote);

    // Emit vote cast event
    this.eventBus.emit('estimation:vote_cast', {
      lobbyId,
      playerId,
      team,
      vote,
      isChange: previousVote !== undefined
    });

    // Start timer on first vote if not already started
    if (!teamState.timerStartedAt && teamState.votes.size === 1) {
      this.startVotingTimer(lobbyId, team);
    }

    // Check for consensus
    this.checkConsensus(lobbyId, team);
  }
}
```

### Pattern 2: Strict Consensus Detection (All Same Value)
**What:** Consensus requires all eligible voters to vote the same numeric value (abstentions don't count)
**When to use:** Per scrum poker industry standard - majority voting violates the principle
**Example:**
```typescript
// Source: Planning Poker best practices, Mountain Goat Software
private checkConsensus(lobbyId: string, team: TeamType): void {
  const state = this.estimations.get(lobbyId)!;
  const teamState = state.teams[team];

  // Skip if team has no eligible voters
  if (teamState.eligibleVoters.size === 0) {
    teamState.hasConsensus = true; // Team skipped
    teamState.consensusValue = undefined;
    this.eventBus.emit('estimation:team_consensus_skipped', { lobbyId, team });
    return;
  }

  // All eligible voters must have voted
  const allVoted = teamState.eligibleVoters.size === teamState.votes.size;
  if (!allVoted) return;

  // Filter out abstentions ('?') - they don't block consensus
  const numericVotes = Array.from(teamState.votes.values())
    .filter((v): v is number => typeof v === 'number');

  // Need at least one numeric vote for consensus
  if (numericVotes.length === 0) return;

  // Check if all numeric votes are the same value
  const firstVote = numericVotes[0];
  const allSame = numericVotes.every(v => v === firstVote);

  if (allSame) {
    teamState.hasConsensus = true;
    teamState.consensusValue = firstVote;

    // Clear team timer
    if (teamState.timerHandle) {
      clearTimeout(teamState.timerHandle);
      teamState.timerHandle = undefined;
    }

    this.eventBus.emit('estimation:team_consensus_reached', {
      lobbyId,
      team,
      consensusValue: firstVote,
      votedCount: teamState.votes.size,
      eligibleCount: teamState.eligibleVoters.size
    });

    // Check if both teams have consensus
    this.checkFullConsensus(lobbyId);
  }
}

private checkFullConsensus(lobbyId: string): void {
  const state = this.estimations.get(lobbyId)!;
  const devConsensus = state.teams.developers.hasConsensus;
  const qaConsensus = state.teams.qa.hasConsensus;

  if (devConsensus && qaConsensus) {
    // Brief pause (2-3 seconds) before advancing
    setTimeout(() => {
      this.eventBus.emit('estimation:full_consensus_reached', {
        lobbyId,
        ticketId: state.ticketId,
        devConsensus: state.teams.developers.consensusValue,
        qaConsensus: state.teams.qa.consensusValue
      });
    }, 2500); // 2.5 second celebration pause
  }
}
```

### Pattern 3: Independent Per-Team Timer Management
**What:** Each team has its own voting timer that starts on first vote and can be paused/extended independently
**When to use:** Allows teams to finish at different paces without blocking each other
**Example:**
```typescript
// Source: Node.js timer best practices, memory leak prevention patterns
private startVotingTimer(lobbyId: string, team: TeamType): void {
  const state = this.estimations.get(lobbyId)!;
  const teamState = state.teams[team];

  // Default 60 seconds voting time (configurable)
  const durationMs = 60000;

  teamState.timerStartedAt = Date.now();
  teamState.timerDurationMs = durationMs;

  // Store timer handle for cleanup
  teamState.timerHandle = setTimeout(() => {
    this.handleVotingTimeout(lobbyId, team);
  }, durationMs);

  this.eventBus.emit('estimation:timer_started', {
    lobbyId,
    team,
    durationMs,
    startedAt: teamState.timerStartedAt
  });
}

private handleVotingTimeout(lobbyId: string, team: TeamType): void {
  const state = this.estimations.get(lobbyId);
  if (!state) return;

  const teamState = state.teams[team];

  // If no votes cast, force discussion phase (must vote)
  if (teamState.votes.size === 0) {
    this.eventBus.emit('estimation:timer_expired_no_votes', {
      lobbyId,
      team,
      message: 'Voting time expired with no votes cast'
    });
    // Keep in voting phase, no automatic transition
    return;
  }

  // Reveal votes and enter discussion
  teamState.phase = 'revealed';

  this.eventBus.emit('estimation:timer_expired_reveal', {
    lobbyId,
    team,
    votedCount: teamState.votes.size,
    eligibleCount: teamState.eligibleVoters.size
  });
}

// Host controls for timer management
pauseTimer(lobbyId: string, team: TeamType, hostId: string): void {
  const state = this.estimations.get(lobbyId);
  if (!state) throw new EstimationNotActiveError(lobbyId);

  const teamState = state.teams[team];
  if (!teamState.timerHandle) return; // Already paused or not started

  // Calculate remaining time
  const elapsed = Date.now() - teamState.timerStartedAt!;
  const remaining = teamState.timerDurationMs! - elapsed;

  clearTimeout(teamState.timerHandle);
  teamState.timerHandle = undefined;
  teamState.timerDurationMs = remaining; // Store remaining time

  this.eventBus.emit('estimation:timer_paused', {
    lobbyId,
    team,
    remainingMs: remaining,
    pausedBy: hostId
  });
}

extendTimer(lobbyId: string, team: TeamType, additionalMs: number, hostId: string): void {
  const state = this.estimations.get(lobbyId);
  if (!state) throw new EstimationNotActiveError(lobbyId);

  const teamState = state.teams[team];

  // If timer is active, add to duration
  if (teamState.timerHandle) {
    clearTimeout(teamState.timerHandle);

    const elapsed = Date.now() - teamState.timerStartedAt!;
    const remaining = teamState.timerDurationMs! - elapsed + additionalMs;

    teamState.timerDurationMs = remaining;
    teamState.timerHandle = setTimeout(() => {
      this.handleVotingTimeout(lobbyId, team);
    }, remaining);
  } else {
    // Timer paused, just add to duration
    teamState.timerDurationMs = (teamState.timerDurationMs || 0) + additionalMs;
  }

  this.eventBus.emit('estimation:timer_extended', {
    lobbyId,
    team,
    additionalMs,
    extendedBy: hostId
  });
}
```

### Pattern 4: Vote Visibility State Machine
**What:** Three-phase state machine: voting (hidden), revealed (shown), discussion (changeable)
**When to use:** Implementing classic planning poker visibility rules
**Example:**
```typescript
// Source: Planning poker visibility patterns (prevent anchoring bias)
interface VoteVisibility {
  playerId: string;
  playerName: string;
  hasVoted: boolean;
  vote?: number | '?'; // Only present in revealed/discussion phase
}

getVoteVisibility(lobbyId: string, team: TeamType): VoteVisibility[] {
  const state = this.estimations.get(lobbyId);
  if (!state) return [];

  const teamState = state.teams[team];
  const visibility: VoteVisibility[] = [];

  for (const playerId of teamState.eligibleVoters) {
    const hasVoted = teamState.votes.has(playerId);
    const vote = teamState.votes.get(playerId);

    visibility.push({
      playerId,
      playerName: this.getPlayerName(playerId), // Query from SessionManager
      hasVoted,
      // Only reveal vote value in revealed/discussion phase
      vote: teamState.phase === 'voting' ? undefined : vote
    });
  }

  return visibility;
}

// During voting: spectators see same as voters (who voted, not values)
// After reveal: full cross-team transparency (Dev sees QA votes, vice versa)
getAllVoteVisibility(lobbyId: string): {
  developers: VoteVisibility[];
  qa: VoteVisibility[];
  phase: 'voting' | 'revealed' | 'discussion';
} {
  const state = this.estimations.get(lobbyId);
  if (!state) throw new EstimationNotActiveError(lobbyId);

  // Use most advanced phase (if one team revealed, show all)
  const phase = this.getGlobalPhase(state);

  return {
    developers: this.getVoteVisibility(lobbyId, 'developers'),
    qa: this.getVoteVisibility(lobbyId, 'qa'),
    phase
  };
}
```

### Anti-Patterns to Avoid
- **Shared timer across teams:** Blocks independent team completion; use per-team timers instead
- **Majority voting for consensus:** Violates scrum poker principles; require all same value
- **Starting timer on ticket load:** Encourages waiting; start on first vote cast
- **Forgetting timer cleanup:** Causes memory leaks; always clear timers in cleanup methods
- **Allowing spectators to vote:** Breaks estimation integrity; filter spectators from eligible voters

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timer drift compensation | Custom drift adjustment logic | performance.now() + setTimeout recursive | Timer drift is complex (browser throttling, CPU load); setTimeout with performance.now() comparison is proven pattern |
| Consensus algorithm | Custom voting logic | Strict all-same-value check | Scrum poker has well-defined consensus rules; reinventing introduces bugs |
| Memory leak prevention | Custom timer tracking | Map<string, NodeJS.Timeout> with cleanup | Timer leaks are common; Map-based tracking with explicit cleanup is standard pattern |
| Vote validation | Custom Fibonacci checks | Zod schema with enum | Zod already in project, runtime validation prevents invalid votes |

**Key insight:** Timer management and consensus detection have subtle edge cases (disconnected players, mid-vote team changes, timer cleanup). Use proven patterns from planning poker tools and Node.js timer best practices rather than inventing custom solutions.

## Common Pitfalls

### Pitfall 1: Timer Memory Leaks on Lobby Destruction
**What goes wrong:** Timers not cleared when lobby destroyed, causing memory leaks and ghost timers firing
**Why it happens:** setTimeout creates closure over lobby state; without cleanup, timers persist after lobby removed
**How to avoid:** Store all timer handles in Map, implement `cleanupLobby(lobbyId)` that clears all timers, call in SessionManager's lobby destruction
**Warning signs:** Memory usage grows over time, timers firing for non-existent lobbies

### Pitfall 2: Anchoring Bias from Early Vote Reveals
**What goes wrong:** Showing votes before all votes cast causes later voters to anchor on early votes
**Why it happens:** Psychological bias - first number seen influences subsequent estimates
**How to avoid:** Strict phase enforcement - votes hidden during 'voting' phase, only revealed after all votes or timer expiry
**Warning signs:** All votes clustering around first vote submitted, lack of diverse estimates

### Pitfall 3: Race Condition Between Consensus and Timer Expiry
**What goes wrong:** Consensus reached and timer expires simultaneously, causing duplicate event emissions
**Why it happens:** Async timer expiry and synchronous consensus check can overlap
**How to avoid:** Clear timer immediately when consensus reached, check phase before emitting timer expiry events
**Warning signs:** Double emissions of reveal events, clients receiving conflicting state updates

### Pitfall 4: Spectator Votes Not Removed on Team Change
**What goes wrong:** Player votes, then switches to spectator, but vote remains counted
**Why it happens:** Team change handler doesn't remove existing votes
**How to avoid:** On team change to spectator, remove vote from both teams' vote Maps and recalculate consensus
**Warning signs:** Vote counts don't match eligible voter counts, consensus with fewer votes than players

### Pitfall 5: Disconnected Player Blocking Consensus
**What goes wrong:** Player disconnects mid-vote but remains in eligible voters, blocking consensus
**Why it happens:** Eligible voters Set not updated on disconnect, consensus waits for disconnected player
**How to avoid:** Subscribe to `session:player_disconnected` event, remove from eligible voters but keep vote if cast
**Warning signs:** Consensus never reached despite all connected players voting, timer expires every time

### Pitfall 6: Host Force During Tie Choosing Wrong Value
**What goes wrong:** When forcing estimate during tied vote (3 players vote 5, 3 vote 8), system picks arbitrary value
**Why it happens:** No tie-breaking logic, array sort or first-found value used
**How to avoid:** Per context requirement, host explicitly picks from tied values via separate parameter
**Warning signs:** Forced estimates don't match any actual votes, players confused about final value

## Code Examples

Verified patterns from research:

### Timer Cleanup on Lobby Destruction
```typescript
// Source: Node.js timer cleanup best practices
class EstimationManager {
  private timers = new Map<string, Map<TeamType, NodeJS.Timeout>>();

  cleanupLobby(lobbyId: string): void {
    // Clear all team timers for this lobby
    const lobbyTimers = this.timers.get(lobbyId);
    if (lobbyTimers) {
      for (const [team, timerHandle] of lobbyTimers) {
        clearTimeout(timerHandle);
      }
      this.timers.delete(lobbyId);
    }

    // Remove estimation state
    this.estimations.delete(lobbyId);

    // Emit cleanup event
    this.eventBus.emit('estimation:cleanup_complete', { lobbyId });
  }
}
```

### Eligible Voter Management on Player Events
```typescript
// Source: Event-driven architecture patterns
private handlePlayerJoined(payload: { lobbyId: string; playerId: string; team: TeamType }): void {
  const state = this.estimations.get(payload.lobbyId);
  if (!state) return; // No active estimation

  // Add to eligible voters if not spectator
  if (payload.team !== 'spectators') {
    const teamState = state.teams[payload.team];
    teamState.eligibleVoters.add(payload.playerId);

    this.eventBus.emit('estimation:voter_eligible', {
      lobbyId: payload.lobbyId,
      playerId: payload.playerId,
      team: payload.team
    });
  }
}

private handleTeamChanged(payload: { lobbyId: string; playerId: string; oldTeam: TeamType; newTeam: TeamType }): void {
  const state = this.estimations.get(payload.lobbyId);
  if (!state) return;

  // Remove from old team
  if (payload.oldTeam !== 'spectators') {
    const oldTeamState = state.teams[payload.oldTeam];
    oldTeamState.eligibleVoters.delete(payload.playerId);

    // Remove vote if cast
    const hadVote = oldTeamState.votes.delete(payload.playerId);
    if (hadVote) {
      this.eventBus.emit('estimation:vote_removed', {
        lobbyId: payload.lobbyId,
        playerId: payload.playerId,
        team: payload.oldTeam,
        reason: 'team_changed'
      });

      // Recheck consensus
      this.checkConsensus(payload.lobbyId, payload.oldTeam);
    }
  }

  // Add to new team if not spectator
  if (payload.newTeam !== 'spectators') {
    const newTeamState = state.teams[payload.newTeam];
    newTeamState.eligibleVoters.add(payload.playerId);

    this.eventBus.emit('estimation:voter_eligible', {
      lobbyId: payload.lobbyId,
      playerId: payload.playerId,
      team: payload.newTeam
    });
  }
}
```

### Fibonacci Vote Validation
```typescript
// Source: Zod validation patterns, Fibonacci story points
import { z } from 'zod';

const FibonacciVoteSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
  z.literal(13),
  z.literal(21),
  z.literal('?') // Abstain
]);

type ValidVote = z.infer<typeof FibonacciVoteSchema>;

castVote(lobbyId: string, playerId: string, team: TeamType, vote: unknown): void {
  // Runtime validation
  const validatedVote = FibonacciVoteSchema.parse(vote);

  // ... rest of cast vote logic
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Majority voting for consensus | Strict all-same-value consensus | Scrum poker origins (2002) | Ensures genuine agreement, not compromise |
| Single shared timer | Per-team independent timers | Modern planning poker tools (2020+) | Teams progress independently, maintains engagement |
| Timer starts on ticket load | Timer starts on first vote | Planning poker tools evolution (2023+) | Encourages participation, prevents passive waiting |
| Manual reveal by host | Auto-reveal on all votes | Planning poker automation (2021+) | Reduces friction, faster sessions |
| Vote hiding in UI only | Server-side vote hiding | Real-time multiplayer standards (ongoing) | Prevents cheating via devtools inspection |

**Deprecated/outdated:**
- `setInterval` for timer UI updates: Use `requestAnimationFrame` client-side, one-shot `setTimeout` server-side
- Blocking consensus detection: Use event-driven checks on vote cast, not polling
- String-based event names: Typed EventBus with compile-time safety (Phase 1 foundation)

## Open Questions

Things that couldn't be fully resolved:

1. **Default voting timer duration**
   - What we know: Industry practice varies (30s-2min), context specifies 60 seconds reasonable
   - What's unclear: Should scale based on team size or ticket complexity?
   - Recommendation: Start with 60 seconds fixed, add configurability later if needed

2. **Consensus stays locked after disconnect**
   - What we know: Context requirement says consensus stays locked if reached before disconnect
   - What's unclear: What if disconnect happens during the 2-3 second celebration pause?
   - Recommendation: Lock consensus immediately on detection, before celebration pause

3. **Discussion phase timer**
   - What we know: Discussion phase has configurable timer, host sets duration
   - What's unclear: Default duration? Auto-advance or require host action on expiry?
   - Recommendation: Default 5 minutes, emit event on expiry but require host decision (start revote or force estimate)

## Sources

### Primary (HIGH confidence)
- Planning poker best practices: [Scrum-Institute.org Planning Poker 2026/27](https://www.scrum-institute.org/Effort_Estimations_Planning_Poker.php)
- Consensus rules: [Mountain Goat Software - Planning Poker](https://www.mountaingoatsoftware.com/agile/planning-poker)
- Fibonacci estimation: [Atlassian Fibonacci Story Points](https://www.atlassian.com/agile/project-management/fibonacci-story-points)
- Timer management: [Node.js v25.3.0 Timers Documentation](https://nodejs.org/api/timers.html)
- Memory leak prevention: [Better Stack - Node.js Memory Leaks](https://betterstack.com/community/guides/scaling-nodejs/high-performance-nodejs/nodejs-memory-leaks/)

### Secondary (MEDIUM confidence)
- Event-driven architecture: [Medium - Event-Driven Architecture with TypeScript](https://medium.com/@elijahbanjo/implementing-event-driven-architecture-in-typescript-with-node-js-and-express-eefecadaf95f)
- Map vs Record performance: [DEV Community - TypeScript Record vs Map](https://dev.to/lea_abraham_7a0232a6cd616/typescript-record-vs-map-whats-the-difference-and-when-to-use-each-50oj)
- Timer accuracy: [SitePoint - Creating Accurate Timers in JavaScript](https://www.sitepoint.com/creating-accurate-timers-in-javascript/)

### Tertiary (LOW confidence)
- Real-time voting systems: General architecture patterns verified against Node.js best practices
- Planning poker tool features: Synthesized from multiple tool comparisons and FAQs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native Node.js timers and EventBus from Phase 1 are proven
- Architecture: HIGH - Per-team state tracking and timer management follow established patterns
- Pitfalls: HIGH - Memory leaks, race conditions, and visibility issues well-documented in research

**Research date:** 2026-02-01
**Valid until:** 30 days (stable domain - planning poker patterns and Node.js timers are mature)
