---
phase: 20-combat-items-lifetime-stats
plan: 02
subsystem: progression
tags: [stats, tdd, event-driven, session-summary, persistence]

# Dependency graph
requires:
  - phase: 15-xp-progression
    provides: ProgressionManager fire-and-forget persistence pattern
  - phase: 20-01
    provides: ItemManager domain pattern for session-scoped data
provides:
  - StatsTracker domain with event-driven stats aggregation
  - Session summary accumulation and emission
  - Extended userStats schema with voting and death metrics
  - Fire-and-forget persistence for lifetime stats

affects: [20-03, 20-04]

# Tech tracking
tech-stack:
  added: [shared/statsTypes.ts]
  patterns:
    - Event-driven stats tracking with EventBus subscriptions
    - Running average calculation with accumulator pattern
    - Fire-and-forget persistence (follows ProgressionManager pattern)
    - Session-scoped ephemeral state with lobby cleanup

key-files:
  created:
    - shared/statsTypes.ts
    - server/domains/StatsTracker.ts
    - server/domains/StatsTracker.test.ts
  modified:
    - shared/schema.ts
    - server/events/eventTypes.ts
    - server/events/index.ts
    - server/storage.ts

key-decisions:
  - "Track voters per lobby to support consensus events without external dependencies"
  - "Use voting start time tracking for accurate voting speed calculation"
  - "Compute consensusRate and averageVotingSpeedMs at session end (not incrementally)"
  - "Fire-and-forget persistence for individual stats, batch update for computed stats"
  - "Session summaries are ephemeral (cleared on lobby destruction)"

patterns-established:
  - "Pattern 1: Voting speed calculation via accumulator (totalMs / count)"
  - "Pattern 2: Consensus tracking requires voter registry per lobby"
  - "Pattern 3: Stats event emitted at game_over/victory phase transitions"

# Metrics
duration: 6min
completed: 2026-02-11
---

# Phase 20 Plan 02: Stats Tracker Domain Summary

**Event-driven lifetime statistics tracking with TDD, session summary aggregation, fire-and-forget persistence, and schema extensions for voting metrics**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-11T21:26:37Z
- **Completed:** 2026-02-11T21:33:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extended userStats schema with 4 new columns: totalVotes, consensusRate, averageVotingSpeedMs, totalDeaths
- Created shared/statsTypes.ts with SessionSummary interface and event payloads
- Implemented StatsTracker domain with TDD (RED-GREEN cycle)
- Event subscriptions for estimation (vote_cast, full_consensus_reached, voting_started) and combat (boss_damaged, boss_defeated, player_revived, player_permanently_downed)
- Fire-and-forget persistence for individual stats following ProgressionManager pattern
- Session summary emission at game_over/victory phase transitions
- Cleanup on lobby destruction

## Task Commits

Each task was committed atomically (TDD used separate RED/GREEN commits):

1. **Task 1: Shared stats types, schema extension, and event payloads** - `32cafad` (feat)
2. **Task 2 RED: Add failing tests for StatsTracker** - `a0d19bb` (test)
3. **Task 2 GREEN: Implement StatsTracker domain** - `982cbca` (feat)

**TDD Cycle:** RED (failing tests) → GREEN (passing implementation) → 17/17 tests passing

## Files Created/Modified

**Created:**
- `shared/statsTypes.ts` - SessionSummary interface, event payloads, helper functions
- `server/domains/StatsTracker.ts` - Event-driven stats tracking domain
- `server/domains/StatsTracker.test.ts` - Comprehensive test suite (17 tests)

**Modified:**
- `shared/schema.ts` - Extended userStats with totalVotes, consensusRate, averageVotingSpeedMs, totalDeaths
- `server/events/eventTypes.ts` - Registered stats:session_complete event in DomainEventMap
- `server/events/index.ts` - Re-exported StatsSessionCompletePayload
- `server/storage.ts` - Updated MemStorage and PgStorage to include 4 new fields in createUserStats

## Decisions Made

1. **Voter tracking:** Maintain per-lobby voter registry to support consensus events without requiring external getVoters dependency
2. **Voting speed calculation:** Track voting start times per lobby, accumulate per-player (totalMs, count), compute running average
3. **Computed stats at session end:** consensusRate and averageVotingSpeedMs calculated during phase transition to game_over/victory (not incrementally)
4. **Persistence strategy:** Fire-and-forget incrementUserStat for individual stats, batch updateUserStats for computed stats
5. **Session summary lifecycle:** Ephemeral per-lobby state, cleared on lobby destruction, emitted once at session end

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TDD approach ensured implementation matched specifications, all tests passed on first GREEN phase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- StatsTracker domain ready for server integration in plan 20-03
- Session summary emission ready for client display in plan 20-04
- Schema extended and ready for database migration
- Fire-and-forget persistence pattern validated and working

---

## Test Coverage

**StatsTracker.test.ts - 17 tests:**

1. **Vote Tracking (4 tests):**
   - handleVoteCast increments totalVotes in session summary
   - handleVoteCast tracks voting speed when votingStartedAt provided
   - handleVoteCast calls persistStat for totalVotes
   - Multiple votes accumulate correctly

2. **Consensus Tracking (2 tests):**
   - handleConsensus increments consensusCount for each voter
   - consensusRate computed correctly at session end

3. **Combat Tracking (5 tests):**
   - handleBossDamage increments totalDamageDealt by damage amount
   - handleBossDefeated increments bossesDefeated for all session players
   - handleRevival increments revives for the reviver player
   - handleDeath increments deaths for downed player
   - Fire-and-forget persistence called for each combat stat

4. **Session Summary (3 tests):**
   - handlePhaseChange emits stats:session_complete at game_over
   - handlePhaseChange emits stats:session_complete at victory
   - Session summary contains correct aggregated values

5. **Cleanup (2 tests):**
   - cleanupLobby removes all session data
   - cleanupLobby doesn't affect other lobbies

6. **Additional (1 test):**
   - Tracks voters correctly for consensus event

All tests passing with TDD discipline (RED → GREEN).

---

*Phase: 20-combat-items-lifetime-stats*
*Completed: 2026-02-11*
