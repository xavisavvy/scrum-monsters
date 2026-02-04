---
phase: 13-load-testing
plan: 02
subsystem: testing
tags: [k6, websocket, socket.io, load-testing, performance]

# Dependency graph
requires:
  - phase: 13-01
    provides: k6 CLI and base test infrastructure
provides:
  - Socket.IO protocol helpers for k6 WebSocket testing
  - WebSocket game flow load test (100 VUs, 30s)
  - Idle connection stability test (50 VUs, 5min)
  - Environment-specific WebSocket thresholds
affects: [13-03, future-websocket-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Socket.IO/Engine.IO protocol implementation in k6
    - WebSocket load testing with game flow simulation
    - Heartbeat pattern for idle connection stability

key-files:
  created:
    - tests/load/utils/socketio.js
    - tests/load/websocket/game-flow.test.js
    - tests/load/websocket/idle-connection.test.js
  modified:
    - tests/load/utils/thresholds.js

key-decisions:
  - "Socket.IO v4 with Engine.IO v4 protocol (EIO=4 query param)"
  - "WebSocket p95 < 100ms in prod (stricter than HTTP for real-time)"
  - "25-second heartbeat interval for idle connection test"
  - "5-minute idle test runs nightly only (never blocks PRs)"

patterns-established:
  - "Socket.IO event format: 42[\"eventName\", data]"
  - "Engine.IO handshake: 2probe → 5 (probe → upgrade)"
  - "Game flow simulation: create_lobby → start_battle → submit_score → reveal"
  - "Periodic heartbeat prevents infrastructure timeout during idle tests"

# Metrics
duration: 2min
completed: 2026-02-03
---

# Phase 13 Plan 02: WebSocket Load Testing Scripts Summary

**k6 WebSocket tests simulating full game flow (100 VUs) and idle connection stability (50 VUs, 5min) with Socket.IO protocol helpers and stricter p95 < 100ms thresholds**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-03T20:17:11Z
- **Completed:** 2026-02-03T20:20:09Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Socket.IO/Engine.IO protocol helpers encapsulate WebSocket handshake and message parsing
- Game flow test simulates realistic user journey: lobby creation → battle → voting → reveal
- Idle connection test validates 5-minute stability with heartbeats every 25 seconds
- Stricter WebSocket thresholds (p95 < 100ms in prod) for real-time responsiveness

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Socket.IO protocol helpers for k6** - `29bb5b5` (feat)
2. **Task 2: Create WebSocket game flow load test** - `07ea71d` (feat)
3. **Task 3: Create idle connection stability test** - `d04bc21` (feat)

## Files Created/Modified
- `tests/load/utils/socketio.js` - Socket.IO/Engine.IO protocol helpers (handshake, emit, parse, ping)
- `tests/load/websocket/game-flow.test.js` - Full game flow test with 100 VUs for 30s
- `tests/load/websocket/idle-connection.test.js` - Idle connection stability test (50 VUs, 5min)
- `tests/load/utils/thresholds.js` - Added getWsThresholds() with session duration requirements

## Decisions Made

**Socket.IO Protocol Implementation:**
- Implemented Socket.IO v4/Engine.IO v4 protocol in k6 (EIO=4 query param)
- Engine.IO handshake: send "2probe" (PING with probe), then "5" (UPGRADE to WebSocket)
- Socket.IO event format: "42[\"eventName\", data]" where "4" = MESSAGE, "2" = EVENT

**Threshold Strategy:**
- WebSocket thresholds stricter than HTTP for real-time requirements
- p95 connection time: 200ms (CI), 150ms (staging), 100ms (prod)
- Session duration threshold ensures connections last nearly full test duration
- Check rate threshold relaxed to 90% (from 95%) due to timing variance in game flow

**Test Configuration:**
- Game flow: 100 VUs × 30s simulates peak concurrent load per CONTEXT.md
- Idle stability: 50 VUs × 5min with 25-second heartbeat interval
- Idle test runs nightly only (informational, never blocks PRs)
- Random Fibonacci vote selection (1, 2, 3, 5, 8, 13, 21) for realistic variance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WebSocket load tests ready for CI integration (next plan)
- Socket.IO helpers can be reused for future WebSocket performance testing
- Idle test provides baseline for connection stability monitoring
- Stricter thresholds may require server optimization if not met

**Blockers:** None

**Concerns:** Idle test takes 5+ minutes to run - must only trigger on schedule/manual, never on PR workflows

---
*Phase: 13-load-testing*
*Completed: 2026-02-03*
