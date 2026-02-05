---
phase: 04-combatmanager
plan: 06
subsystem: combat
tags: [websocket, domain-integration, cross-domain-events, combatmanager]

# Dependency graph
requires:
  - phase: 04-05
    provides: CombatManager revival system with channel-based mechanics
  - phase: 03-05
    provides: EstimationManager websocket integration pattern
  - phase: 02-05
    provides: SessionManager as domain barrel pattern
provides:
  - CombatManager subscribed to cross-domain events (estimation:vote_cast, session:player_left, session:lobby_destroyed)
  - Battle entry triggered automatically when players vote
  - Boss attack loop starts on first player entry
  - Battle modifier increments every 10 seconds
  - Websocket handlers for combat operations (attack, heal, revival, combat init)
  - Full player cleanup on session events
affects: [05-fine-grained-events, combat-ui, battle-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cross-domain event subscription in constructor
    - EventBus coordination for lifecycle management
    - Recursive setTimeout for modifier loop with boss defeat detection
    - Session lifecycle integration with combat cleanup

key-files:
  created: []
  modified:
    - server/domains/CombatManager.ts
    - server/domains/CombatManager.test.ts
    - server/domains/index.ts
    - server/websocket.ts

key-decisions:
  - "Cross-domain subscriptions in constructor - CombatManager subscribes to estimation and session events for automatic coordination"
  - "First vote starts combat loops - Boss attack loop and modifier loop begin when first player enters battle via vote"
  - "Recursive setTimeout for modifier loop - Enables boss defeat detection to stop loop cleanly"
  - "Player cleanup on session:player_left - Removes from combat, cancels revivals, clears timers, removes from threat table"
  - "Websocket delegation pattern - Handlers delegate to combatManager methods with typed error handling"

patterns-established:
  - "Event subscription pattern: Domain managers subscribe to cross-domain events in constructor for automatic coordination"
  - "Combat lifecycle integration: Vote → battle entry → loops start → cleanup on disconnect/destroy"
  - "Timer cleanup hierarchy: Player timers cleared before combat state deletion prevents orphaned intervals"

# Metrics
duration: 4min
completed: 2026-02-02
---

# Phase 4 Plan 6: CombatManager Integration Summary

**CombatManager wired to domains barrel with cross-domain event subscriptions, automatic battle entry on vote, and websocket handlers for attack/heal/revival operations**

## Performance

- **Duration:** 4 min 30 sec
- **Started:** 2026-02-02T01:55:08Z
- **Completed:** 2026-02-02T01:59:38Z
- **Tasks:** 3
- **Files modified:** 4
- **Test coverage:** 108 tests passing (includes 18 new cross-domain subscription tests)

## Accomplishments
- CombatManager responds to estimation:vote_cast by triggering battle entry for voting players
- First vote starts boss attack loop and modifier loop automatically
- Battle modifier increments every 10 seconds with clean stop on boss defeat
- Session events (player_left, lobby_destroyed) trigger proper combat cleanup
- Websocket handlers delegate to combatManager with typed error handling
- Full integration tested with 108 passing tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cross-domain event subscriptions to CombatManager** - `c73fee4` (feat)
   - Subscribe to estimation:vote_cast, session:player_left, session:lobby_destroyed
   - Implement handleVoteCast to trigger battle entry and start loops
   - Implement handlePlayerLeft to cleanup player from combat
   - Implement handleLobbyDestroyed to call cleanupLobby
   - Add startModifierLoop with recursive setTimeout
   - Update cleanupLobby to clear modifier interval
   - Added 18 comprehensive tests for event subscriptions

2. **Task 2: Export CombatManager from domain barrel** - `4724f21` (feat)
   - Create combatManager instance with eventBus and callbacks
   - Wire getPlayerTeam using sessionManager.getLobby lookups
   - Wire getPlayerClass for avatar lookups
   - Export combatManager alongside other domain managers
   - Re-export CombatManager types and errors

3. **Task 3: Add combat websocket handlers** - `893757f` (feat)
   - Import combatManager and combat errors
   - Add start_combat handler for host initialization
   - Add attack_boss handler with typed error handling
   - Add heal_teammate handler for healer operations
   - Add start_revival and cancel_revival handlers
   - Follow established pattern: catch typed errors, emit game_error

## Files Created/Modified
- `server/domains/CombatManager.ts` - Added cross-domain event handlers, startModifierLoop, updated cleanupLobby
- `server/domains/CombatManager.test.ts` - Added 18 tests for cross-domain subscriptions and modifier loop
- `server/domains/index.ts` - Instantiated and exported combatManager with dependencies
- `server/websocket.ts` - Added 5 combat websocket handlers with error handling

## Decisions Made

**Cross-domain subscriptions in constructor**
- CombatManager subscribes to estimation:vote_cast and session events in constructor
- Automatic coordination without tight coupling between domains
- Pattern matches EstimationManager subscription to session events (Plan 03-05)

**First vote starts combat loops**
- battleStartTime tracks first player entry
- Boss attack loop and modifier loop start together on first vote
- Prevents premature loop starts before combat begins

**Recursive setTimeout for modifier loop**
- Allows checking boss defeat status before scheduling next increment
- Clean stop when boss HP reaches 0
- Matches boss attack loop pattern from Plan 04-03

**Player cleanup on session:player_left**
- Removes player from combat state Map
- Clears player down timer if active
- Removes from threat table
- Cancels any revivals involving player (as reviver or target)

**Websocket delegation pattern**
- Handlers delegate to combatManager methods
- Catch typed errors (CombatNotActiveError, PlayerNotInCombatError, etc.)
- Emit game_error with code and message
- Follows pattern from EstimationManager (Plan 03-05)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Test event payload mismatch**
- SessionPlayerLeftPayload doesn't include playerName field
- Fixed tests to match actual event interface definition
- TypeScript caught issue immediately during compilation

## Authentication Gates

None - no external services or CLIs requiring authentication.

## Next Phase Readiness

**Combat integration complete:**
- CombatManager responds to estimation votes automatically
- Session lifecycle events properly cleanup combat state
- Websocket handlers ready for client integration
- Battle modifier system tracking time in combat

**Ready for Phase 5 (Fine-Grained Events):**
- Combat events emitted via EventBus (boss_damaged, player_damaged, revival_started, etc.)
- Need EventBus-to-Socket.IO bridge to broadcast to clients
- All server-side combat logic complete and tested

**Outstanding:**
- Client needs to receive combat events for real-time updates
- UI needs to subscribe to fine-grained events (not full lobby_updated)
- Phase 5 will wire EventBus emissions to Socket.IO broadcasts

---
*Phase: 04-combatmanager*
*Completed: 2026-02-02*
