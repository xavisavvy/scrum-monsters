# Phase 3: EstimationManager - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract voting, consensus, and timer logic into a dedicated EstimationManager domain. Players submit story point votes, consensus is detected per team (Dev and QA separately), and timers control voting and discussion phases. EstimationManager subscribes to player_joined events from SessionManager.

</domain>

<decisions>
## Implementation Decisions

### Vote Eligibility
- Spectators cannot vote — they are non-participants in estimation
- Reconnected players can still vote if voting is active for their team
- Late-joining players can vote immediately on the current ticket
- If a player who already voted switches to spectator, their vote is removed

### Consensus Rules
- Two separate consensus tracks: Dev team and QA team
- Ticket is fully estimated only when both teams have consensus (or team skipped if no voters)
- If a team has no eligible voters, skip that team's consensus requirement
- When a team reaches consensus, their estimate is locked — they wait for the other team
- Players can explicitly abstain; abstentions don't block consensus
- If no votes cast when timer expires, force discussion phase (must vote then)
- Once both teams have consensus, brief pause (2-3 seconds) before advancing to next ticket
- Consensus stays locked even if a member disconnects after consensus reached
- Host can force an estimate to move things along
- Host force uses majority vote value
- If host forces during a tie, host picks from the tied values

### Timer Behavior
- Voting timer starts when first vote is cast (not on ticket load)
- Per-team timers — Dev and QA timers run independently
- If Dev finishes (consensus) while QA still voting, QA's timer continues
- Host can pause and extend the voting timer
- When voting timer expires, reveal all votes cast and enter discussion
- Discussion phase has configurable timer (host sets duration)
- When discussion timer expires, host decides: start revote or force estimate

### Vote Visibility
- During voting: players see who has voted, but not their values (classic poker style)
- Spectators have same visibility as voters during voting
- After reveal: all votes visible with player names
- Full cross-team transparency — Dev sees QA votes and vice versa after reveal

### Claude's Discretion
- Default voting timer duration (reasonable default like 60 seconds)
- Consensus definition (all same vote vs majority — Claude decides based on scrum conventions)
- Internal state structure for tracking per-team votes and timers
- Event naming for estimation domain events

</decisions>

<specifics>
## Specific Ideas

- Two consensus tracks (Dev + QA) is a key differentiator — keeps both disciplines engaged
- "Classic poker" vote hiding prevents anchoring bias
- Host controls (pause, extend, force) support real meeting facilitation needs
- Brief celebration pause on consensus gives sense of accomplishment

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-estimationmanager*
*Context gathered: 2026-02-01*
