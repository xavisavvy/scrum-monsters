---
phase: 20-combat-items-lifetime-stats
plan: 04
subsystem: stats
tags: [stats, session-summary, ui, socket-io, event-forwarding]

# Dependency graph
requires:
  - phase: 20-02
    provides: StatsTracker domain with event-driven tracking
provides:
  - StatsTracker integrated into server event pipeline
  - Session summary forwarded to clients via Socket.IO
  - Session stats display in GameOver and Victory phases
  - Profile API serving extended lifetime stats

affects: []

# Tech tracking
tech-stack:
  added: [client/src/components/game/SessionStatsCard.tsx]
  patterns:
    - Socket.IO event listener pattern with useEffect
    - Shared component pattern for DRY session stats
    - JRPG-styled stat card with grid layout
    - Progressive disclosure (only show if summary exists)

key-files:
  created:
    - client/src/components/game/SessionStatsCard.tsx
  modified:
    - server/domains/index.ts
    - server/events/ClientEventEmitter.ts
    - shared/gameEvents.ts
    - client/src/components/game/phases/GameOverPhase.tsx
    - client/src/components/game/phases/VictoryPhase.tsx

key-decisions:
  - "Use shared SessionStatsCard component for both GameOver and Victory phases"
  - "Display stats in 2-column grid (estimation left, combat right)"
  - "Listen for stats:session_summary on socket in both phases"
  - "Profile API automatically serves new columns (no changes needed)"
  - "Title differs by context: 'Session Stats' vs 'Battle Report'"

patterns-established:
  - "Pattern 1: SessionStatsCard reused by multiple phases"
  - "Pattern 2: Socket event listener with cleanup in useEffect"
  - "Pattern 3: Stats only shown when available (progressive disclosure)"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 20 Plan 04: Stats Production Wiring and Client UI Summary

**StatsTracker integrated into server event pipeline with session summary
forwarding, plus session stats display in GameOver and Victory phases**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T21:36:38Z
- **Completed:** 2026-02-11T21:41:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- StatsTracker instantiated in domains/index.ts with eventBus, storage, and
  getUserId dependencies
- stats:session_summary Socket.IO event added to shared/gameEvents.ts
- stats:session_complete internal event forwarded to clients in
  ClientEventEmitter.ts
- SessionStatsCard component created with JRPG-styled 2-column grid layout
- Session stats displayed in both GameOver and Victory phases
- Profile API already returns extended stats (totalVotes, consensusRate,
  averageVotingSpeedMs, totalDeaths)

## Task Commits

Each task was committed atomically:

1. **Task 1: Server wiring** - `fe2c46c` (feat)
2. **Task 2: Client session summary display** - `6a6e405` (feat)

## Files Created/Modified

**Created:**
- `client/src/components/game/SessionStatsCard.tsx` - Shared session stats card
  component with JRPG styling

**Modified:**
- `server/domains/index.ts` - StatsTracker instantiation and lobby cleanup
- `server/events/ClientEventEmitter.ts` - stats:session_complete forwarding
- `shared/gameEvents.ts` - stats:session_summary Socket.IO event definition
- `client/src/components/game/phases/GameOverPhase.tsx` - Session stats display
- `client/src/components/game/phases/VictoryPhase.tsx` - Session stats display
  with 'Battle Report' title

## Decisions Made

1. **Shared SessionStatsCard component:** Both GameOver and Victory phases use
   the same component to avoid duplication and ensure consistency
2. **2-column layout:** Estimation stats (left) and combat stats (right) for
   clear categorization
3. **Socket event listener pattern:** Use useEffect with cleanup for socket
   event subscriptions
4. **Progressive disclosure:** Stats card only renders if sessionSummary exists
5. **Context-specific titles:** 'Session Stats' for GameOver, 'Battle Report'
   for Victory

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all components integrated smoothly with existing Socket.IO infrastructure.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- StatsTracker fully integrated into server event pipeline
- Session summaries emitted at game_over/victory phase transitions
- Session stats displayed in both end-game phases
- Profile API serving extended lifetime stats
- Phase 20 complete (all 4 plans executed)

---

## Implementation Details

### StatsTracker Integration

**Instantiation in domains/index.ts:**
```typescript
const statsTracker = new StatsTracker({
  eventBus,
  storage,
  getUserId: (lobbyId: string, playerId: string) => {
    return playerUserIdMap.get(playerId);
  },
});
```

**Cleanup on lobby destruction:**
```typescript
eventBus.on('session:lobby_destroyed', (payload) => {
  itemManager.cleanupLobby(payload.lobbyId);
  cleanupBuffs(payload.lobbyId);
  statsTracker.cleanupLobby(payload.lobbyId);
});
```

### Socket.IO Event Flow

1. StatsTracker emits `stats:session_complete` internal event at game_over/
   victory
2. ClientEventEmitter forwards to `stats:session_summary` Socket.IO event
3. GameOverPhase and VictoryPhase listen for `stats:session_summary`
4. SessionStatsCard renders session stats for current player

### SessionStatsCard Component

**Features:**
- JRPG-styled RetroCard with 2-column grid
- Estimation stats: Votes Cast, Consensus Hits, Avg Vote Speed
- Combat stats: Damage Dealt, Bosses Slain, Revives, Deaths, Items Used
- Color-coded values (green for positive, red for negative, amber for key
  metrics)
- Progressive disclosure (only renders if summary provided)

**Usage:**
```tsx
{sessionSummary && (
  <SessionStatsCard summary={sessionSummary} title="Session Stats" />
)}
```

### Profile API

GET /api/profile/stats endpoint already returns all UserStats fields including
new columns:
- totalVotes
- consensusRate
- averageVotingSpeedMs
- totalDeaths

No changes needed - schema extension in plan 20-02 automatically included in API
response.

---

*Phase: 20-combat-items-lifetime-stats*
*Completed: 2026-02-11*
