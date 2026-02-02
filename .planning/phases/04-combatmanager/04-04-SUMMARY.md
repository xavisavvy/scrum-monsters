---
phase: 04-combatmanager
plan: 04
subsystem: combat
tags: [tdd, health-system, down-mechanics, healing, timers]
type: implementation
completed: 2026-02-02
duration: 3.2 min

requires:
  - phase: 04
    plan: 03
    because: "Boss attack AI needed to trigger damage"

provides:
  capabilities:
    - player_damage_system
    - down_state_with_timer
    - ghost_mode_permanent
    - healer_active_healing

affects:
  - phase: 04
    plan: 05
    what: "Revival system can now restore downed players before ghost"

decisions:
  damage_flow:
    decision: "Boss attacks call applyDamageToPlayer which handles HP reduction and down transition"
    rationale: "Centralizes damage logic, ensures consistent event emission and state transitions"
    alternatives: "Boss methods could directly manipulate HP"

  timer_lifecycle:
    decision: "Store timer handles in player state, clear in cleanupLobby"
    rationale: "Prevents memory leaks, follows pattern from boss attack timer"
    alternatives: "External timer registry"

  healer_validation:
    decision: "NotHealerClassError for non-healer classes attempting to heal"
    rationale: "Type-safe exception pattern established in Plan 04-01"
    alternatives: "Silent failure or generic error"

tech-stack:
  added: []
  patterns:
    - "TDD RED-GREEN cycle with fake timers"
    - "Centralized damage application method"
    - "Timer handle storage in state objects"

key-files:
  created: []
  modified:
    - path: "server/domains/CombatManager.ts"
      changes: "Added applyDamageToPlayer, downPlayer, permanentlyDownPlayer, playerHealTeammate; updated boss attack methods; enhanced cleanupLobby"
    - path: "server/domains/CombatManager.test.ts"
      changes: "Added 26 new test cases for player health system"
---

# Phase 04 Plan 04: Player Health & Down System Summary

**One-liner:** Player damage with 10-second down timer, ghost mode, and healer healing (25 HP) with class validation

## What Was Built

Implemented complete player health lifecycle using TDD:

1. **Damage Application** - `applyDamageToPlayer(lobbyId, playerId, damage)`:
   - Reduces player HP by damage amount, capped at 0
   - Emits `combat:player_damaged` with damage and new HP
   - Triggers `downPlayer()` when HP reaches 0

2. **Down State** - `downPlayer(lobbyId, playerId)`:
   - Transitions player to `downed` state
   - Sets `isDowned=true`, `downedAt=Date.now()`
   - Emits `combat:player_downed` with 10-second countdown
   - Starts 10-second timer to permanent down

3. **Ghost Mode** - `permanentlyDownPlayer(lobbyId, playerId)`:
   - Transitions player to `ghost` state (permanent)
   - Clears down timer handle
   - Emits `combat:player_permanently_downed`
   - Cannot attack, heal, or be revived

4. **Active Healing** - `playerHealTeammate(lobbyId, healerId, targetId)`:
   - Heals 25 HP (HEAL_AMOUNT constant)
   - Only healer classes can heal (cleric, paladin, bard)
   - Throws `NotHealerClassError` for non-healers
   - Only heals `fighting` state players (not downed/ghost)
   - Healing capped at maxHp
   - Emits `combat:player_healed` event

5. **Boss Integration**:
   - Updated `performAoEAttack()` to call `applyDamageToPlayer` for each target
   - Updated `attackSingleTarget()` to call `applyDamageToPlayer`
   - Boss attacks now trigger full damage flow

6. **Timer Cleanup**:
   - Enhanced `cleanupLobby()` to clear all player down timers
   - Prevents memory leaks when lobby destroyed

## Test Coverage

**70 total tests** (44 from Plan 04-03, 26 new):

- applyDamageToPlayer: HP reduction, capping, events, down trigger, error cases (6 tests)
- downPlayer: State transitions, events, timer start, handle storage (4 tests)
- permanentlyDownPlayer: Ghost transition, events, timer cleanup (3 tests)
- playerHealTeammate: Healing amounts, capping, class validation, state checks (12 tests)
- Timer cleanup: Verify timers cleared on lobby cleanup (1 test)

All tests use Vitest fake timers for deterministic timer testing.

## Technical Decisions

**1. Centralized Damage Application**

Boss attack methods now call `applyDamageToPlayer()` instead of directly emitting events. This ensures:
- Consistent HP reduction and capping
- Automatic down state transitions
- Single source of truth for damage logic

**2. Timer Handle Storage**

Down timers stored as `player.downTimerHandle` following the pattern from boss attack timer:
```typescript
playerState.downTimerHandle = setTimeout(() => {
  this.permanentlyDownPlayer(lobbyId, playerId);
}, this.DOWN_TIMER_MS);
```

Cleared in both `permanentlyDownPlayer()` and `cleanupLobby()` to prevent memory leaks.

**3. Healer Class Validation**

Uses existing `NotHealerClassError` with proper signature:
```typescript
throw new NotHealerClassError(healerId, healerClass ?? 'unknown');
```

Error has `code='NOT_HEALER_CLASS'` for client handling.

**4. State Machine Enforcement**

Healing only allowed for `fighting` state players:
- Healer must be `fighting`
- Target must be `fighting`
- Downed/ghost players throw `PlayerNotInCombatError`

This prevents edge cases like healing ghosts or downed players healing others.

## Integration Points

**Events Emitted:**
- `combat:player_damaged` - HP reduction with playerHealth
- `combat:player_downed` - Down state with countdown
- `combat:player_permanently_downed` - Ghost transition
- `combat:player_healed` - Healing with amounts

**Cross-Domain:**
- Uses `getPlayerClass` callback for healer validation (SessionManager)
- Boss attacks trigger player damage (Plan 04-03 integration)
- Ready for revival system (Plan 04-05)

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for Plan 04-05 (Revival System):**
- Downed state fully implemented with timer
- Ghost state clearly separated
- Timer handles accessible for revival interruption
- Events emitted for UI coordination

**Blocking Issues:** None

**Technical Debt:** None - pre-existing TypeScript errors unrelated to this plan

## Learnings

1. **TDD with Timers**: Vitest fake timers (`vi.useFakeTimers()`, `vi.advanceTimersByTime()`) work perfectly for testing async timer behavior deterministically

2. **Error Type Testing**: Better to check `toThrow(NotHealerClassError)` than `toThrow('NOT_HEALER_CLASS')` for proper type checking

3. **Centralized State Transitions**: Having single methods for state changes (down, ghost) makes testing and maintenance easier than inline transitions

4. **Timer Cleanup Patterns**: Storing timer handles in state objects and clearing in cleanup methods is established pattern worth following consistently

## Performance Metrics

- **Duration:** 3.2 minutes
- **Tests Added:** 26
- **Tests Passing:** 70
- **Files Modified:** 2
- **Commits:** 2 (RED + GREEN, no refactor needed)
