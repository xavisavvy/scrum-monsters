---
phase: 04-combatmanager
plan: 05
type: tdd
subsystem: combat-revival
tags: [revival, channel, healer, tdd, vitest]
wave: 5
status: complete

requires:
  - 04-04 # Player health and healing system

provides:
  - Channel-based revival mechanics
  - 2.5-second revival channel with tick system
  - Damage interruption handling
  - One-revive-per-fight enforcement
  - Revival session cleanup

affects:
  - 04-06 # Will integrate revival system with websocket handlers

tech-stack:
  added: []
  patterns:
    - "Interval-based channel ticking"
    - "Session key pattern (reviverId:targetId)"
    - "Interruption via damage checking"

key-files:
  created: []
  modified:
    - server/domains/CombatManager.ts # Added revival system methods
    - server/domains/CombatManager.test.ts # Added 22 new tests for revival

decisions:
  - decision: "Use setInterval for revival ticking"
    rationale: "Enables continuous checking for interruption (reviver downed, target state changed)"
    alternatives: ["setTimeout recursive", "Promise-based delay"]
    pattern: "Set 100ms interval on session creation, clear on completion or cancellation"

  - decision: "Session key format reviverId:targetId"
    rationale: "Enables O(1) lookup and prevents duplicate revivals on same target"
    alternatives: ["UUID", "sequential ID"]
    pattern: "String key allows easy Map operations and iteration"

  - decision: "50% HP restoration on revival"
    rationale: "Balanced between useful (can survive one hit) and not OP (still vulnerable)"
    alternatives: ["Full HP", "30% HP", "1 HP"]
    impact: "From CONTEXT.md requirements"

  - decision: "Clear down timer on revival completion"
    rationale: "Prevent ghost transition after successful revival"
    alternatives: ["Keep timer running"]
    pattern: "Clear downTimerHandle before transitioning to fighting state"

metrics:
  tests-added: 22
  tests-passing: 92
  duration: "4 minutes"
  completed: "2026-02-02"
---

# Phase 04 Plan 05: Channel-Based Revival System Summary

**One-liner:** Healers can channel 2.5s revivals on downed teammates, interrupted by damage, restoring 50% HP with one-revive-per-fight limit.

## What Was Built

### Revival Session Management
- **startRevival**: Creates RevivalSession with lobbyId, reviverId, targetId, startedAt, channelDurationMs, intervalHandle
- **Session key pattern**: `${reviverId}:${targetId}` for Map-based tracking
- **Healer class validation**: Only cleric, paladin, bard can initiate revival
- **State validation**: Reviver must be fighting, target must be downed, target not already revived
- **Duplicate prevention**: Check if target already being revived by another healer

### Channel Tick System
- **tickRevival**: Runs every 100ms via setInterval
- **Interruption checks**:
  - Combat ended (lobby deleted)
  - Reviver no longer fighting (downed or left)
  - Target no longer downed (died, revived by someone else, or left)
- **Completion check**: `Date.now() - startedAt >= channelDurationMs`
- **Auto-cancellation**: Calls cancelRevivalSession with appropriate reason

### Completion & Restoration
- **completeRevival**:
  - Clear down timer to prevent ghost transition
  - Set HP to 50% of maxHp
  - Set combatState='fighting', isDowned=false
  - Set hasBeenRevived=true (one-revive-per-fight limit)
  - Clear interval handle
  - Remove from revivalSessions Map
  - Emit combat:player_revived event

### Damage Interruption
- **applyDamageToPlayer integration**:
  - After applying damage, iterate revivalSessions
  - If damaged player is channeling revival, cancel with reason='took_damage'
  - Emit combat:revival_cancelled event

### Target Death Cancellation
- **permanentlyDownPlayer integration**:
  - Iterate revivalSessions for sessions targeting this player
  - Cancel with reason='permanent_down'
  - Prevents revival attempt on ghost players

### Cleanup & Memory Safety
- **cleanupLobby integration**:
  - Iterate revivalSessions for this lobby
  - Clear all interval handles
  - Remove sessions from Map
  - Prevents memory leaks on lobby destruction

## Test Coverage

Added 22 new tests (92 total):

**Revival Initiation (9 tests)**
- Creates session for valid healer/target
- Emits combat:revival_started event
- Allows cleric, paladin to revive
- Throws RevivalNotAllowedError for non-healers
- Returns false for invalid reviver/target states
- Enforces one-revive-per-fight via hasBeenRevived
- Prevents revival on ghost players

**Completion (5 tests)**
- Completes after 2.5 seconds
- Sets HP to 50% of maxHp
- Sets combatState to fighting, isDowned=false
- Sets hasBeenRevived=true
- Clears down timer handle

**Interruption (4 tests)**
- Damage to reviver cancels with 'took_damage'
- Revival not completed after cancellation
- Target permanent down cancels with 'permanent_down'
- Reviver getting downed cancels revival

**Cleanup (2 tests)**
- cleanupLobby clears all revival sessions
- Interval handles cleared to prevent memory leaks

**Edge Cases (2 tests)**
- Prevents multiple revivals on same target
- Handles reviver leaving during channel

## Technical Implementation

### Data Structures
```typescript
interface RevivalSession {
  reviverId: string;
  targetId: string;
  lobbyId: string;
  startedAt: number;
  channelDurationMs: number;
  intervalHandle: NodeJS.Timeout;
}

private revivalSessions = new Map<string, RevivalSession>();
```

### Key Methods
- `startRevival(lobbyId, reviverId, targetId): boolean` - Public API for starting revival
- `tickRevival(sessionKey): void` - Private tick handler called every 100ms
- `completeRevival(sessionKey): void` - Private completion handler
- `cancelRevivalSession(sessionKey, reason): void` - Private cancellation with event
- `cancelRevival(reviverId, reason): void` - Public API for external cancellation

### Event Flow
1. **Start**: `combat:revival_started` → `{ lobbyId, reviverId, targetId, durationMs }`
2. **Complete**: `combat:player_revived` → `{ lobbyId, playerId, reviverId }`
3. **Cancel**: `combat:revival_cancelled` → `{ lobbyId, reviverId, targetId, reason }`

### Cancellation Reasons
- `'took_damage'` - Reviver damaged during channel
- `'permanent_down'` - Target became ghost
- `'reviver_downed'` - Reviver transitioned to downed
- `'target_state_changed'` - Target no longer downed
- `'combat_ended'` - Lobby destroyed

## Deviations from Plan

None - plan executed exactly as written.

## Commits

1. **91b94a4** - test(04-05): add failing tests for revival system (RED phase)
2. **85cb36f** - feat(04-05): implement channel-based revival system (GREEN phase)

## Integration Points

### Current
- Integrated with applyDamageToPlayer for damage interruption
- Integrated with permanentlyDownPlayer for target death cancellation
- Integrated with cleanupLobby for memory leak prevention

### Future (Plan 04-06)
- Websocket handler for `start_revival` client event
- Emit revival events to clients via Socket.IO
- Visual channel progress UI in client

## Performance Notes

- **Tick frequency**: 100ms provides responsive interruption checking without excessive overhead
- **O(1) lookups**: Map-based session storage with string key
- **O(n) cleanup**: Iterate all sessions for lobby cleanup (acceptable for small n)
- **Memory safety**: All intervals cleared on cancellation or completion

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Dependencies satisfied:**
- ✅ Player health system (04-04)
- ✅ Down state and timers (04-04)
- ✅ Healer class constants (04-01)
- ✅ Combat state enum (04-01)

**Ready for:**
- 04-06: Websocket integration for revival system
- Client-side revival UI and visual feedback
