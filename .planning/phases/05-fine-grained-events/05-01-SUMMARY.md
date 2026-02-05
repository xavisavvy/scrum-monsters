---
phase: 05-fine-grained-events
plan: 01
subsystem: events
tags: [websocket, event-sourcing, sequence-numbers, event-buffering, typescript]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: EventBus and domain event infrastructure
provides:
  - ClientEventMap with 25 fine-grained event type definitions
  - LobbyEventSequencer for per-lobby sequence generation and event buffering
  - 100-event circular buffer for missed event recovery
  - Gap detection logic for client sync
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client event naming: domain:action format (session:player_joined)"
    - "BaseClientEvent with seq and timestamp for all events"
    - "Per-lobby sequence numbers with independent counters"
    - "Circular buffer with gap detection (lastSeq+1 < oldestSeq)"

key-files:
  created:
    - shared/clientEvents.ts
    - server/events/LobbyEventSequencer.ts
    - server/events/LobbyEventSequencer.test.ts
  modified:
    - server/events/index.ts

key-decisions:
  - "Domain prefix naming convention for clarity and categorization"
  - "100-event buffer size covers ~30s at 3 events/sec"
  - "Gap detection: lastSeq+1 < oldestSeq prevents false positives"
  - "Check sequences map for lobby existence before checking buffer"

patterns-established:
  - "ClientEventMap interface maps event names to typed payloads"
  - "BufferedEvent stores seq, event, data, timestamp for recovery"
  - "getMissedEvents returns null on gap/not found, empty array when caught up"

# Metrics
duration: 5.5min
completed: 2026-02-02
---

# Phase 05 Plan 01: Event Foundation Summary

**ClientEventMap with 25 typed fine-grained events and LobbyEventSequencer with 100-event circular buffer for reliable client sync**

## Performance

- **Duration:** 5.5 min (332 seconds)
- **Started:** 2026-02-02T08:25:21Z
- **Completed:** 2026-02-02T08:30:53Z
- **Tasks:** 3
- **Files modified:** 4
- **Tests added:** 23 (LobbyEventSequencer)

## Accomplishments
- Type-safe client event definitions across three domains (Session/Estimation/Combat)
- Per-lobby sequence number generation starting at 1
- Circular event buffer maintaining last 100 events per lobby
- Gap detection and missed event recovery with null on gap too large
- Comprehensive test coverage for sequencer (23 tests covering all edge cases)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create client event type definitions** - `05e09be` (feat)
2. **Task 2: Implement LobbyEventSequencer** - `464c076` (feat)
3. **Task 3: Add LobbyEventSequencer tests** - `67ede32` (test)

## Files Created/Modified

### Created
- `shared/clientEvents.ts` - ClientEventMap with 25 typed fine-grained event definitions
  - Session events: player_joined, player_left, player_reconnected, host_changed, phase_changed, team_changed, avatar_selected
  - Estimation events: vote_cast (masked), votes_revealed, consensus_reached, timer_started, timer_paused, timer_resumed, timer_expired, estimate_forced
  - Combat events: boss_damaged, boss_healed, boss_enraged, boss_telegraph, boss_defeated, player_damaged, player_downed, player_revived, revival_started, revival_cancelled, player_entered_battle, modifier_updated
  - System events: full_state (for late joiners/buffer exhausted), missed_events (recovery response)
  - BaseClientEvent interface with seq and timestamp fields

- `server/events/LobbyEventSequencer.ts` - Sequence number generation and event buffering
  - nextSeq(lobbyId): Generate monotonic sequence starting at 1
  - bufferEvent(): Store event in circular buffer (max 100)
  - getMissedEvents(lobbyId, lastSeq): Retrieve events after lastSeq, null on gap/not found
  - getCurrentSeq(lobbyId): Query current sequence number
  - cleanup(lobbyId): Remove all lobby data on destruction
  - BufferedEvent interface: { seq, event, data, timestamp }

- `server/events/LobbyEventSequencer.test.ts` - Comprehensive test coverage (23 tests)
  - Sequence generation: first seq is 1, increments correctly, independent per lobby, getCurrentSeq
  - Event buffering: correct structure, respects 100-event limit, includes timestamp
  - Missed event recovery: returns events after lastSeq, empty array when caught up, null on gap/not found
  - Cleanup: removes from both maps, idempotent, allows fresh sequences after cleanup
  - Edge cases: empty buffer, multiple lobbies independently, very large lastSeq values

### Modified
- `server/events/index.ts` - Export LobbyEventSequencer and BufferedEvent

## Decisions Made

**1. Domain prefix naming convention**
- Event names follow `domain:action` format (e.g., `session:player_joined`, `estimation:vote_cast`)
- Provides clear categorization and prevents naming collisions
- Aligns with internal domain event naming from Phase 01

**2. 100-event buffer size**
- Covers approximately 30 seconds at 3 events/second typical rate
- Sufficient for brief network hiccups without excessive memory usage
- Per-lobby isolation prevents buffer bloat in multi-lobby scenarios

**3. Gap detection logic: `lastSeq+1 < oldestSeq`**
- Prevents false positives when client requests from seq 0 (new connection)
- Example: lastSeq=10, oldestSeq=15 → gap (events 11-14 missing)
- Example: lastSeq=10, oldestSeq=11 → no gap (normal progression)

**4. Lobby existence check via sequences map**
- getMissedEvents checks sequences map first before checking buffer
- Distinguishes "lobby doesn't exist" (never called nextSeq) from "no events buffered yet"
- Returns null for unknown lobby, empty array for known lobby with no buffered events

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Gap detection logic refinement** (resolved during Task 3 tests)
- Initial implementation used `lastSeq < oldestSeq` which triggered false positives
- Requesting from seq 0 with oldest event at seq 1 incorrectly detected as gap
- Corrected to `lastSeq+1 < oldestSeq` which properly detects missing events
- All 23 tests pass with corrected logic

## Next Phase Readiness

**Ready for 05-02 (Client event sync):**
- ClientEventMap provides type-safe event definitions for client handlers
- LobbyEventSequencer ready for integration into server event emission path
- Buffer and recovery logic tested and working correctly

**Ready for 05-03 (Server event emission):**
- Event type definitions in shared/ accessible to both client and server
- Sequencer can be integrated into domain managers for event emission
- Gap detection enables reliable client recovery from brief disconnects

**No blockers.**

---
*Phase: 05-fine-grained-events*
*Completed: 2026-02-02*
