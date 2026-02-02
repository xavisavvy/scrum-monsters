---
phase: 04-combatmanager
plan: 02
type: tdd
subsystem: combat
status: complete
tags: [combat, boss, damage, initialization, tdd, typescript]

requires:
  - phase: 04-01
    artifact: CombatManager class shell
    reason: Built upon error hierarchy and event types

provides:
  - Combat initialization with scaled boss HP
  - Player attack boss mechanics with threat tracking
  - Class-based damage system
  - Boss enrage and defeat detection

affects:
  - phase: 04-03
    artifact: Boss attack patterns
    reason: Uses threat table for targeting
  - phase: 04-04
    artifact: Boss damage to players
    reason: Uses player combat states
  - phase: 04-05
    artifact: Revival system
    reason: Uses player combat states (downed/ghost)

tech-stack:
  added: []
  patterns:
    - TDD with vitest
    - Class-based damage calculation
    - Threat-based targeting foundation

key-files:
  created:
    - server/domains/CombatManager.test.ts
  modified:
    - server/domains/CombatManager.ts

decisions:
  - id: class-damage-values
    title: Class damage tuning
    decision: Tank classes (15), DPS (20), glass cannon (25), healers (12)
    rationale: Balance between class fantasy and TTK - tanks lower DPS, healers focus on healing
    alternatives: Equal damage, role-based multipliers
    date: 2026-02-02
  - id: spectator-filtering
    title: Spectators excluded from combat HP scaling
    decision: Filter spectators from boss HP calculation and player combat states
    rationale: Spectators don't participate in combat, shouldn't inflate boss HP
    alternatives: Include spectators but mark as non-combatant
    date: 2026-02-02
  - id: threat-table-cumulative
    title: Cumulative threat tracking
    decision: Threat table tracks total damage dealt by each player
    rationale: Simplest threat model - boss targets highest damage dealer
    alternatives: Decay over time, weighted by recent damage
    date: 2026-02-02
  - id: boss-enrage-once
    title: Boss enrages once at 50% HP
    decision: Enrage event fires once, flag prevents re-triggering
    rationale: Clean state transition - avoid event spam
    alternatives: Multiple enrage thresholds (75%, 50%, 25%)
    date: 2026-02-02

metrics:
  duration: 4 min
  completed: 2026-02-02
  test-count: 26
  lines-added: 522
  commits: 2
---

# Phase 04 Plan 02: Combat Initialization & Boss Damage Summary

**One-liner:** TDD implementation of combat initialization with boss HP scaling (1000 HP/player * difficulty) and class-based damage system (12-25 damage)

## What Was Built

### Combat Initialization (initializeCombat)
- Boss HP calculation: `BASE_HP_PER_PLAYER (1000) * activePlayerCount * (1 + ticketIndex * 0.2)`
- Ticket index scaling for dungeon crawl difficulty progression
- Spectator filtering - only non-spectator players count toward boss HP
- Player combat state initialization:
  - `hp: 100, maxHp: 100`
  - `combatState: 'fighting'`
  - `hasBeenRevived: false`
- Emits `combat:battle_initialized` with bossId and bossMaxHp

### Player Attack Boss (playerAttackBoss)
- Class-based damage calculation:
  - **Tank classes** (warrior, paladin, oathbreaker): 15 damage
  - **DPS classes** (ranger, rogue, monk): 20 damage
  - **Glass cannon** (sorcerer, wizard): 25 damage
  - **Healer classes** (cleric, bard): 12 damage
- Damage multiplied by `battleModifier` (starts at 1.0, will increase in Plan 04-04)
- Threat table updates with cumulative damage per player
- Boss HP reduced, clamped to 0 minimum
- Emits `combat:boss_damaged` with damage and current boss health
- Boss enrage detection at 50% HP threshold
  - Emits `combat:boss_enraged` once
  - Sets `isEnraged: true` flag
- Boss defeat detection at HP <= 0
  - Emits `combat:boss_defeated`
  - Clears attack timer (placeholder for Plan 04-03)
- Error handling:
  - `CombatNotActiveError` when no combat state exists
  - `PlayerNotInCombatError` when player is downed or ghost

### Test Coverage (26 tests)
- Combat initialization with various player counts
- Ticket index difficulty scaling
- Spectator filtering in HP calculation and combat states
- Class-based damage for all 4 damage tiers
- Battle modifier multiplication
- Threat table cumulative damage tracking
- Event emissions (battle_initialized, boss_damaged, boss_enraged, boss_defeated)
- Boss enrage at 50% HP (once only)
- Boss defeat and HP clamping to 0
- Error cases (no combat, player downed/ghost)

## TDD Cycle
1. **RED:** Wrote 26 failing tests for combat initialization and boss damage
2. **GREEN:** Implemented `initializeCombat` and `playerAttackBoss` methods to pass tests
3. **REFACTOR:** Added private `getClassBaseDamage` helper for clean damage calculation

## Key Functionality

### Boss HP Scaling Formula
```typescript
const activePlayerCount = players.filter(p => p.team !== 'spectators').length;
const difficultyMultiplier = 1 + (ticketIndex * 0.2);
const bossMaxHp = BASE_HP_PER_PLAYER * activePlayerCount * difficultyMultiplier;
```

**Examples:**
- 3 players, ticketIndex 0: `1000 * 3 * 1.0 = 3000 HP`
- 2 players, ticketIndex 4: `1000 * 2 * 1.8 = 3600 HP`
- 5 players, ticketIndex 10: `1000 * 5 * 3.0 = 15000 HP`

### Damage Calculation
```typescript
const baseDamage = getClassBaseDamage(playerClass);
const damage = Math.floor(baseDamage * battleModifier);
boss.hp = Math.max(0, boss.hp - damage);
```

### Threat Table Management
```typescript
const existingThreat = boss.threatTable.get(playerId);
if (existingThreat) {
  existingThreat.threat += damage;
} else {
  boss.threatTable.set(playerId, { playerId, threat: damage });
}
```

## Decisions Made

### Class Damage Values
**Decision:** Tank classes deal 15 damage, DPS classes 20, glass cannon 25, healers 12

**Rationale:**
- Reflects class fantasy: tanks tank, DPS deals damage, healers heal
- Creates meaningful class choice in combat
- ~80 HP boss requires 4-7 attacks depending on class
- Encourages team composition (need DPS for faster kills)

**Impact:**
- Boss time-to-kill varies by class composition
- Healer players will rely more on healing (Plan 04-04) than damage

### Spectator Exclusion
**Decision:** Spectators filtered from boss HP calculation and combat state

**Rationale:**
- Spectators don't participate in combat
- Including them would inflate boss HP unfairly
- Keeps spectator role as observer, not participant

**Impact:**
- Boss difficulty scales only with active combatants
- Spectators don't appear in threat table or receive boss attacks

### Cumulative Threat Model
**Decision:** Threat is total damage dealt, no decay or weighting

**Rationale:**
- Simplest implementation for MVP
- Easy to understand: "boss attacks whoever hurt it most"
- Foundation for more sophisticated targeting in future

**Impact:**
- Boss will target highest total damage dealer
- No threat management mechanics (yet)
- Players can't "pull aggro" off high-damage dealers

### Single Enrage Threshold
**Decision:** Boss enrages once at 50% HP

**Rationale:**
- Clear phase transition for players
- Avoids event spam on repeated attacks
- Simple boolean flag prevents re-triggering

**Impact:**
- Boss behavior changes at 50% mark (Plan 04-03 will implement faster attacks)
- Single warning for players to prepare for harder phase

## Integration Points

### Events Emitted
- `combat:battle_initialized`: Lobby enters combat, boss created
- `combat:boss_damaged`: Player attacks, boss HP changes
- `combat:boss_enraged`: Boss crosses 50% HP threshold
- `combat:boss_defeated`: Boss HP reaches 0

### Dependencies Required
- `getPlayerClass` callback: Used to determine player's avatar class for damage calculation
- Existing combat state from `initializeCombat`

### Future Integration
- **Plan 04-03:** Boss attack timer will use threat table for targeting
- **Plan 04-04:** Player HP tracking when boss attacks players
- **Plan 04-05:** Revival system needs player `combatState` (downed/ghost)
- **Plan 04-06:** Websocket handlers will call these methods on player actions

## Verification

All verification criteria met:
- ✅ `npm test -- CombatManager` passes all 26 tests
- ✅ `npm run check` passes TypeScript check (no CombatManager errors)
- ✅ initializeCombat creates properly scaled boss HP
- ✅ playerAttackBoss updates HP, threat, emits events
- ✅ Boss enrage and defeat mechanics work
- ✅ Error handling for invalid states

## Deviations from Plan

None - plan executed exactly as written.

## Risks & Considerations

### Boss HP Scaling
**Risk:** Very high boss HP with many players or high ticket index
**Mitigation:** Boss HP formula can be tuned later if TTK too long

### Threat Table Memory
**Risk:** Threat table grows unbounded during long battles
**Mitigation:** Acceptable for MVP - table cleared on boss defeat

### Class Damage Balance
**Risk:** Some classes may feel too weak/strong
**Mitigation:** Damage values are constants, easy to tune based on playtesting

## Next Steps

**Immediate (Plan 04-03):** Boss attack patterns
- Use threat table to select attack targets
- Implement attack timer with enraged interval
- Apply damage to players based on attack type

**Follow-up (Plan 04-04):** Player HP and modifier tracking
- Boss damage reduces player HP
- Down timer for incapacitated players
- Battle modifier increases over time

**Then (Plan 04-05):** Revival system
- Healer-only revival channeling
- Revival interruption on movement/damage
- Permanent ghost mode after revival used

## Test Results

```
✓ server/domains/CombatManager.test.ts (26 tests) 13ms
  ✓ instantiation (2 tests)
  ✓ initializeCombat (8 tests)
  ✓ playerAttackBoss (14 tests)
  ✓ cleanupLobby (2 tests)

Test Files  1 passed (1)
Tests       26 passed (26)
Duration    1.02s
```

## Files Changed

### Created
- `server/domains/CombatManager.test.ts` (375 lines)
  - 26 TDD tests for combat initialization and boss damage
  - Mock getPlayerClass callback for damage calculation
  - Event emission verification

### Modified
- `server/domains/CombatManager.ts` (+147 lines, -6 lines)
  - Implemented `initializeCombat` method
  - Implemented `playerAttackBoss` method
  - Added private `getClassBaseDamage` helper
  - Boss HP scaling with ticket difficulty
  - Threat table management
  - Boss enrage and defeat detection

## Commits

1. `test(04-02): add failing test for combat initialization and boss damage` (028a2f0)
   - 26 test cases covering all requirements
   - RED phase of TDD cycle

2. `feat(04-02): implement combat initialization and boss damage` (032d87e)
   - Full implementation passing all tests
   - GREEN phase of TDD cycle

## Performance

- **Duration:** 4 minutes (245 seconds)
- **Tests:** 26 tests, all passing
- **Lines:** +522 total (375 test, 147 implementation)
- **Commits:** 2 (RED + GREEN phases)

## Related Documentation

- Phase 04 Context: `.planning/phases/04-combatmanager/04-CONTEXT.md`
- Phase 04 Research: `.planning/phases/04-combatmanager/04-RESEARCH.md`
- Plan 04-01 Summary: `.planning/phases/04-combatmanager/04-01-SUMMARY.md`
- Combat Errors: `server/errors/CombatErrors.ts`
- Event Types: `server/events/eventTypes.ts`
