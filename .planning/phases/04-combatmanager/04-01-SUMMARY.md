---
phase: 04-combatmanager
plan: 01
subsystem: combat-domain-foundation
tags:
  - error-handling
  - domain-events
  - state-types
  - typescript
requires:
  - 01-03-eventbus-scoping
  - 02-01-sessionmanager-foundation
  - 03-01-estimationmanager-foundation
provides:
  - CombatErrors typed exception hierarchy
  - Combat domain event types
  - CombatManager class shell with state interfaces
affects:
  - 04-02-combat-initialization
  - 04-03-boss-mechanics
  - 04-04-player-health
  - 04-05-revival-system
  - 04-06-combat-integration
tech-stack:
  added:
    - server/errors/CombatErrors.ts
    - server/domains/CombatManager.ts
  patterns:
    - "Typed exception hierarchy (CombatError base with code property)"
    - "Map-based state tracking for dynamic combat entities"
    - "Event-driven domain coordination via typed EventBus"
    - "Dependency injection for cross-domain queries"
key-files:
  created:
    - server/errors/CombatErrors.ts
    - server/domains/CombatManager.ts
  modified:
    - server/events/eventTypes.ts
    - server/events/index.ts
    - server/events/EventBus.test.ts
decisions:
  - id: combat-error-hierarchy
    what: Combat domain errors extend CombatError base with unique codes
    why: Consistent error handling pattern across domains (Session/Estimation/Combat)
    when: 2026-02-02
    alternatives: Generic Error class with string codes (less type-safe)

  - id: combat-event-types
    what: Added 9 new combat domain events (battle_initialized, player_entered_battle, boss_enraged, boss_telegraph, revival_started, revival_cancelled, player_permanently_downed, cleanup_complete, player_healed)
    why: Fine-grained events enable reactive coordination and clear state transitions
    when: 2026-02-02
    alternatives: Coarse-grained events (less granular control)

  - id: player-combat-state-enum
    what: PlayerCombatState type with 3 states (fighting, downed, ghost)
    why: Clear state machine for player lifecycle during combat
    when: 2026-02-02
    alternatives: Boolean flags (less explicit, harder to reason about)

  - id: healer-classes-constant
    what: HEALER_CLASSES array containing cleric, paladin, bard
    why: Centralized healer definition per CONTEXT.md requirements
    when: 2026-02-02
    alternatives: Runtime checks scattered across methods (harder to maintain)

  - id: combat-constants-from-context
    what: HP/damage/timing constants based on CONTEXT.md and RESEARCH.md values
    why: Design requirements specify 10s down timer, 2.5s revival, light/heavy/special damage, 5s/3s boss attacks
    when: 2026-02-02
    alternatives: Magic numbers inline (harder to tune)

  - id: ticket-index-scaling
    what: LobbyCombatState includes ticketIndex for difficulty scaling
    why: CONTEXT.md requires "dungeon crawl progression" with increasing difficulty per ticket
    when: 2026-02-02
    alternatives: Static difficulty (ignores progression requirement)
metrics:
  duration: 3.2 min
  completed: 2026-02-02
---

# Phase 04 Plan 01: CombatManager Foundation Summary

**One-liner:** Typed error hierarchy, 9 domain event types, and CombatManager class shell with Map-based state interfaces for boss/player tracking

## What Was Built

Created the foundational infrastructure for the CombatManager domain following the established pattern from SessionManager (Phase 2) and EstimationManager (Phase 3).

### 1. CombatErrors Typed Exception Hierarchy (Task 1)

**File:** `server/errors/CombatErrors.ts`

**Error classes:**
- `CombatError` - Base class with code property
- `CombatNotActiveError` - No active combat for lobby
- `PlayerNotInCombatError` - Player not in fighting state (downed or ghost)
- `RevivalNotAllowedError` - Invalid revival attempt (non-healer, already revived, wrong state)
- `InvalidAttackError` - Attack attempt while downed or ghost
- `NotHealerClassError` - Non-healer class attempting revival

**Pattern:** Follows SessionError and EstimationError structure with unique codes, typed properties, and proper prototype chain via `Object.setPrototypeOf`.

### 2. Combat Domain Event Types (Task 2)

**Files:** `server/events/eventTypes.ts`, `server/events/index.ts`

**New event payload interfaces:**
1. `CombatBattleInitializedPayload` - Combat initialization with boss details
2. `CombatPlayerEnteredBattlePayload` - Player battle entry with 1.5s transition
3. `CombatBossEnragedPayload` - Boss enrage at 50% HP
4. `CombatBossTelegraphPayload` - Telegraphed attacks with delay
5. `CombatRevivalStartedPayload` - Revival channel start with duration
6. `CombatRevivalCancelledPayload` - Interrupted revival with reason
7. `CombatPlayerPermanentlyDownedPayload` - Ghost mode entry
8. `CombatCleanupCompletePayload` - Combat cleanup finished
9. `CombatPlayerHealedPayload` - Healer healing action

**Updated:**
- `CombatPlayerDownedPayload` - Added `countdownSeconds` field for 10s timer

**Integration:**
- All 9 events added to `DomainEventMap` for type safety
- Re-exported in `server/events/index.ts`
- Updated `EventBus.test.ts` for new payload signature

### 3. CombatManager Class Shell (Task 3)

**File:** `server/domains/CombatManager.ts`

**State interfaces:**
- `PlayerCombatState` - Enum type: fighting | downed | ghost
- `ThreatEntry` - Threat table for boss targeting (playerId, threat value)
- `PlayerCombat` - HP tracking, down state, revival flag, position
- `BossCombat` - Boss HP, enrage, attack timer, threat table (Map)
- `RevivalSession` - Channel tracking with intervals
- `LobbyCombatState` - Lobby-wide combat state with boss, players (Map), modifier, ticketIndex

**Constants (from CONTEXT.md/RESEARCH.md):**
- HP tuning: 1000 HP/player base, 100 player max HP
- Damage: Light 25 (4 hits to down), Heavy 40 (2.5 hits), Special 50 (2 hits)
- Timing: 1.5s battle entry, 10s down timer, 2.5s revival channel
- Boss attacks: 5s base interval, 3s enraged, ±30% variance, 3s initial delay
- Healer classes: cleric, paladin, bard

**Dependencies:**
- `CombatManagerDeps` interface with eventBus, getPlayerTeam, getPlayerClass callbacks
- Dependency injection pattern for cross-domain queries (maintains domain isolation)

**Methods (stubs for future plans):**
- `initializeCombat` - TODO Plan 04-02
- `playerAttackBoss` - TODO Plan 04-02
- `playerHealTeammate` - TODO Plan 04-04
- `startRevival` - TODO Plan 04-05
- `cancelRevival` - TODO Plan 04-05
- `getCombatState` - Implemented (returns LobbyCombatState or null)
- `cleanupLobby` - Stub (timer cleanup in Plan 04-04/05)

## Decisions Made

### 1. Combat Error Hierarchy
**Decision:** Created CombatError base class with 5 specific error types
**Rationale:** Matches SessionError/EstimationError pattern for consistent domain error handling
**Impact:** Type-safe error catching and unique error codes for client handling

### 2. Fine-Grained Combat Events
**Decision:** 9 new combat domain events for specific actions
**Rationale:** Real-time game best practice - emit only what changed, enable reactive coordination
**Impact:** Clean event-driven architecture, easier debugging, future flexibility

### 3. Player Combat State Enum
**Decision:** Explicit 3-state enum (fighting/downed/ghost) instead of boolean flags
**Rationale:** Clear state machine, prevents invalid combinations (e.g., fighting AND downed)
**Impact:** Easier to reason about, safer state transitions

### 4. Healer Classes Constant
**Decision:** `HEALER_CLASSES: AvatarClass[] = ['cleric', 'paladin', 'bard']`
**Rationale:** Centralized healer definition per CONTEXT.md requirements
**Impact:** Single source of truth for healer checks, easy to extend

### 5. Ticket Index for Difficulty Scaling
**Decision:** LobbyCombatState includes ticketIndex field
**Rationale:** CONTEXT.md requires "dungeon crawl progression" - later tickets harder
**Impact:** Boss HP and difficulty can scale based on session progress

## Deviations from Plan

None - plan executed exactly as written. All tasks completed per specification.

## Tests

**Status:** All existing tests passing (144 tests)

**Modified:**
- `server/events/EventBus.test.ts` - Updated CombatPlayerDownedPayload test to include `countdownSeconds` field

**Notes:**
- No new tests added in this plan (foundation only)
- Tests will be added in future plans when implementing combat logic

## Next Phase Readiness

**Ready for Plan 04-02 (Combat Initialization):**
- ✅ CombatErrors available for validation
- ✅ Combat event types defined and typed
- ✅ CombatManager class shell with state interfaces
- ✅ Constants tuned per CONTEXT.md requirements
- ✅ Dependency injection pattern established

**Blockers:** None

**Open Questions:** None - all foundation decisions documented

## Commit Summary

**3 atomic commits:**
1. `8183651` - feat(04-01): create combat error hierarchy
2. `68a4347` - feat(04-01): add combat event types to eventTypes
3. `aa9d7b9` - feat(04-01): create CombatManager class shell with state types

**Files created:**
- `server/errors/CombatErrors.ts` (94 lines)
- `server/domains/CombatManager.ts` (219 lines)

**Files modified:**
- `server/events/eventTypes.ts` (+87 lines)
- `server/events/index.ts` (+9 exports)
- `server/events/EventBus.test.ts` (+1 field)

**Verification:** `npm run check` passes (pre-existing errors only in unrelated client files and socketHandlers)
