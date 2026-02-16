---
phase: 19-team-combos
plan: 01
subsystem: combat
tags: [combos, team-coordination, tdd, event-driven]

# Dependency graph
requires:
  - phase: 18-class-abilities
    provides: ability:used events, AbilityManager cooldown tracking
  - phase: 04-estimation
    provides: estimation:full_consensus_reached events
provides:
  - ComboManager domain for class-pair combo detection
  - combo:triggered and combo:consensus_ultimate domain events
  - Combo cooldown tracking per-lobby
  - Consensus ultimate with voting-speed damage scaling
affects: [19-team-combos, combat-ui, socket-handlers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD with RED-GREEN-REFACTOR cycle (20 comprehensive tests)"
    - "Event-driven combo detection via ability:used subscriptions"
    - "Time-window detection for coordinated ability usage (3s)"
    - "Per-combo independent cooldowns with Map-based tracking"
    - "Linear interpolation for consensus damage multipliers"

key-files:
  created:
    - shared/comboTypes.ts
    - server/domains/ComboManager.ts
    - server/domains/ComboManager.test.ts
  modified:
    - server/events/eventTypes.ts
    - server/events/index.ts

key-decisions:
  - "3-second ability window for combo detection (balances coordination vs network latency)"
  - "Per-combo independent cooldowns (allows tactical variety, not locked after one combo)"
  - "First-match wins for overlapping combos (prevents conflicts, deterministic behavior)"
  - "Consensus ultimate one-per-ticket with guard set (prevents re-trigger on discussion phase)"
  - "Voting speed scales damage 1.5x to 3.0x (10s fast to 60s slow, rewards quick agreement)"
  - "CLASS_COMBOS defined with non-overlapping class pairs (prevents cooldown conflicts)"

patterns-established:
  - "TDD execution: test(RED) → feat(GREEN) → optional refactor commits"
  - "Domain event subscription in constructor for automatic wiring"
  - "Cooldown expiresAt with <= check for inclusive duration semantics"
  - "Guard sets for one-time-per-context event handling (consensus per ticket)"

# Metrics
duration: 9min
completed: 2026-02-11
---

# Phase 19 Plan 01: Team Combo System Summary

**TDD implementation of ComboManager domain with class-pair detection (3s window), per-combo cooldowns, and consensus ultimates scaling damage by voting speed (1.5x-3.0x)**

## Performance

- **Duration:** 9 minutes
- **Started:** 2026-02-11T20:21:28Z
- **Completed:** 2026-02-11T20:30:33Z
- **Tasks:** 2
- **Files modified:** 5 files (3 created, 2 modified)

## Accomplishments

- ComboManager domain detects class-pair combos when abilities used within 3s window
- 5 combo definitions (shield_wall, blessed_strike, crushing_assault, elemental_fury, perfect_synergy)
- Per-combo independent cooldowns prevent spam without locking all combos
- Consensus ultimate triggers on full team agreement with voting-speed damage scaling
- Comprehensive TDD test suite (20 tests) covering detection, cooldowns, damage, cleanup

## Task Commits

Each task was committed atomically following TDD RED-GREEN cycle:

1. **Task 1: Create shared combo type definitions** - `a36fb23` (feat)
   - ComboTrigger, ComboDefinition, event payload interfaces
   - CLASS_COMBOS with 5 combo configurations
   - Consensus ultimate constants

2. **Task 2: TDD ComboManager domain** - `8775805` (test), `792c7f9` (feat)
   - **RED phase** (`8775805`): 20 failing tests for combo detection, cooldowns, consensus
   - **GREEN phase** (`792c7f9`): ComboManager implementation passing all tests
   - Domain event registration in eventTypes.ts

**Plan metadata:** *(will be committed in final metadata commit)*

## Files Created/Modified

**Created:**
- `shared/comboTypes.ts` - Combo type definitions, CLASS_COMBOS configuration array
- `server/domains/ComboManager.ts` - Combo detection engine with cooldown tracking
- `server/domains/ComboManager.test.ts` - Comprehensive TDD test suite (20 tests)

**Modified:**
- `server/events/eventTypes.ts` - Added combo:triggered and combo:consensus_ultimate to DomainEventMap
- `server/events/index.ts` - Re-exported combo payload types

## Decisions Made

1. **3-second ability window:** Balances coordination difficulty with network latency tolerance. Too short makes combos impossible with lag, too long makes them trivial.

2. **Per-combo independent cooldowns:** Allows diverse tactical choices. Shield_wall on cooldown doesn't prevent elemental_fury. More engaging than global cooldown.

3. **First-match wins for overlapping combos:** CLASS_COMBOS array order determines priority. Prevents ambiguity when multiple combos could match same class-pair.

4. **Consensus ultimate one-per-ticket:** Guard set (`lobbyId:ticketId` keys) prevents re-trigger during discussion phase vote changes. Fresh ultimate per new ticket.

5. **Voting speed damage scaling:** Linear interpolation from 1.5x (60s slow) to 3.0x (10s fast). Rewards team efficiency with higher burst damage.

6. **Non-overlapping class pairs in CLASS_COMBOS:** perfect_synergy uses unique pairs (paladin+wizard, oathbreaker+ranger) to avoid conflicts with tank+healer combos like shield_wall.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test helper recreation causing double event handlers**
- **Found during:** Task 2 GREEN phase (tests failing with unexpected triggers)
- **Issue:** Tests recreating ComboManager instances subscribed multiple handlers to same eventBus, causing combos to trigger twice
- **Fix:** Updated tests to only modify mocks instead of recreating ComboManager, avoiding duplicate subscriptions
- **Files modified:** server/domains/ComboManager.test.ts
- **Verification:** All 20 tests passing with single trigger per combo
- **Committed in:** `792c7f9` (GREEN phase commit)

**2. [Rule 1 - Bug] Fixed perfect_synergy overlapping with shield_wall triggers**
- **Found during:** Task 2 GREEN phase (cooldown test failing)
- **Issue:** perfect_synergy included warrior+cleric trigger, overlapping with shield_wall. When shield_wall on cooldown, perfect_synergy triggered instead, breaking test expectations.
- **Fix:** Redefined perfect_synergy with unique class pairs (paladin+wizard, oathbreaker+ranger) to prevent overlap
- **Files modified:** shared/comboTypes.ts
- **Verification:** Cooldown tests passing, no combo triggers when primary combo on cooldown
- **Committed in:** `792c7f9` (GREEN phase commit)

**3. [Rule 3 - Blocking] Fixed TypeScript iteration error for Set<string>**
- **Found during:** Task 2 verification (TypeScript compilation check)
- **Issue:** Iterating Set directly requires --downlevelIteration flag. Error in cleanupLobby() method.
- **Fix:** Wrapped this.consensusUsed with Array.from() before iteration
- **Files modified:** server/domains/ComboManager.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** `792c7f9` (GREEN phase commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking issues)
**Impact on plan:** All deviations were necessary fixes for correctness and compilation. No scope creep. TDD cycle revealed issues early, enabling clean fixes before integration.

## Issues Encountered

None - TDD RED-GREEN-REFACTOR cycle worked smoothly. Fake timers (vi.useFakeTimers) handled timing tests correctly. Event bus subscription pattern integrated cleanly with existing domain architecture.

## Next Phase Readiness

ComboManager domain complete with comprehensive test coverage. Ready for integration with socket handlers (plan 02) to broadcast combo events to clients. Client UI components (plan 03) can consume combo:triggered events for visual feedback.

**Dependencies satisfied:**
- ability:used events from AbilityManager (Phase 18-01) ✓
- estimation:full_consensus_reached from EstimationManager (Phase 04) ✓

**Provides for next plans:**
- combo:triggered domain event with participant IDs, damage, multiplier
- combo:consensus_ultimate domain event with voting duration
- ComboManager.resetCombos() for new ticket lifecycle
- ComboManager.cleanupLobby() for lobby destruction

---
*Phase: 19-team-combos*
*Completed: 2026-02-11*


## Self-Check: PASSED

All files verified to exist:
- ✓ shared/comboTypes.ts
- ✓ server/domains/ComboManager.ts  
- ✓ server/domains/ComboManager.test.ts

All commits verified in git history:
- ✓ a36fb23 (Task 1: feat - shared combo type definitions)
- ✓ 8775805 (Task 2 RED: test - failing tests)
- ✓ 792c7f9 (Task 2 GREEN: feat - ComboManager implementation)
