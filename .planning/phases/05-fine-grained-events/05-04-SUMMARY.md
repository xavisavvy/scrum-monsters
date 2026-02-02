---
phase: 05-fine-grained-events
plan: 04
subsystem: real-time-events
tags: [socket.io, event-sequencing, type-safety, websocket]

# Dependency graph
requires:
  - phase: 05-01
    provides: Event sequencing and buffering infrastructure
  - phase: 05-02
    provides: Domain event definitions
  - phase: 05-03
    provides: ClientEventEmitter bridge implementation
provides:
  - Fine-grained event type declarations in shared/gameEvents.ts
  - ClientEventEmitter initialization in server architecture
  - Missed events recovery endpoint
  - Full state synchronization on join/reconnect
affects: [05-05, 05-06, client-event-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Deferred initialization pattern for Socket.IO-dependent services
    - Full state sync on late join and reconnect
    - Gap recovery via request_missed_events endpoint

key-files:
  created: []
  modified:
    - shared/gameEvents.ts
    - server/domains/index.ts
    - server/websocket.ts

key-decisions:
  - "Full state sync pattern - Late joiners and reconnecting clients receive system:full_state with current sequence"
  - "Deferred initialization - ClientEventEmitter initialized after Socket.IO server creation via factory function"
  - "Gap recovery endpoint - request_missed_events handler checks buffer and sends missed events or full state"

patterns-established:
  - "initializeClientEventEmitter(io) called from websocket.ts after server creation"
  - "getClientEventEmitter() throws if not initialized, prevents usage before Socket.IO ready"
  - "sendFullState() called on join_lobby and reconnect_with_token for sequence initialization"

# Metrics
duration: 4min
completed: 2026-02-02
---

# Phase 05 Plan 04: ClientEventEmitter Integration Summary

**Fine-grained event types declared in shared contract, ClientEventEmitter wired into Socket.IO server with gap recovery and full state sync**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-02T08:41:00Z
- **Completed:** 2026-02-02T08:45:51Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added 32 fine-grained event signatures to ServerToClientEvents interface
- Integrated ClientEventEmitter into server initialization flow
- Implemented missed events recovery for network gap handling
- Connected full state sync to join/reconnect flows

## Task Commits

Each task was committed atomically:

1. **Task 1: Add client event types to gameEvents.ts** - `1eaaeea` (feat)
2. **Task 2: Instantiate ClientEventEmitter in domain barrel** - `14c6693` (feat)
3. **Task 3: Wire ClientEventEmitter in websocket.ts** - `3bdd3cc` (feat)

## Files Created/Modified
- `shared/gameEvents.ts` - Added 32 fine-grained event signatures with seq/timestamp, request_missed_events client event
- `server/domains/index.ts` - Created LobbyEventSequencer, added initializeClientEventEmitter() factory and getClientEventEmitter() getter
- `server/websocket.ts` - Initialize ClientEventEmitter after io creation, handle request_missed_events, send full state on join/reconnect

## Decisions Made

**Full state sync pattern:**
- Late joiners receive system:full_state after lobby_sync to initialize event sequence
- Reconnecting players receive system:full_state to reset their sequence after grace period
- Provides current lobby snapshot with seq/timestamp for client synchronization

**Deferred initialization pattern:**
- ClientEventEmitter requires Socket.IO server instance
- Created factory function initializeClientEventEmitter(io) called from websocket.ts
- Getter getClientEventEmitter() throws if called before initialization
- Prevents usage errors and makes dependency explicit

**Gap recovery endpoint:**
- request_missed_events handler checks getMissedEvents(lobbyId, lastSeq)
- Returns null if gap too large → send full state refresh
- Returns events array if gap fillable → send missed events
- Returns empty array if client caught up → no action needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without issues.

## Next Phase Readiness

**Ready for Plan 05-05 (legacy event migration):**
- Fine-grained events fully typed in shared contract
- ClientEventEmitter active and emitting events via eventBus subscriptions
- Gap recovery and full state sync operational
- Legacy events can be incrementally replaced with fine-grained alternatives

**Current state:**
- Both legacy (lobby_updated) and fine-grained events emitting simultaneously
- Clients not yet consuming fine-grained events (Phase 6 work)
- Domain managers emitting domain events → ClientEventEmitter bridging to Socket.IO
- Event buffer active, sequence tracking operational

---
*Phase: 05-fine-grained-events*
*Completed: 2026-02-02*
