# Architecture Research: Game Progression Systems Integration

**Domain:** XP/leveling, boss AI patterns, and combat abilities for existing domain-separated architecture
**Researched:** 2026-02-03
**Confidence:** HIGH (based on existing codebase analysis + industry patterns)

## Executive Summary

This research analyzes how to integrate XP/leveling systems, boss AI variety, and class abilities into ScrumQuest's existing domain-separated architecture. The existing architecture (SessionManager, EstimationManager, CombatManager, ScopedEventBus) provides an excellent foundation. The recommended approach adds two new domain managers (ProgressionManager, AbilityManager) and extends CombatManager with AI behavior patterns, all coordinated through the existing event bus.

**Key Recommendation:** Extend, don't replace. The existing architecture handles the new features well with minimal structural changes.

---

## Part 1: Integration Points with Existing Architecture

### 1.1 Current Architecture Overview

From codebase analysis, the existing system uses:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Existing Architecture                        │
├─────────────────────────────────────────────────────────────────┤
│  SessionManager          EstimationManager      CombatManager   │
│  ├── lobbies Map         ├── estimations Map    ├── combatStates│
│  ├── players             ├── votes per team     ├── boss state  │
│  ├── reconnection        ├── timers             ├── player HP   │
│  └── host transfer       └── consensus          └── revival     │
├─────────────────────────────────────────────────────────────────┤
│                    ScopedEventBus                               │
│  ├── session:player_joined    estimation:vote_cast              │
│  ├── session:player_left      estimation:full_consensus_reached │
│  ├── combat:boss_damaged      combat:player_downed              │
│  └── combat:battle_complete   (75+ event types defined)         │
├─────────────────────────────────────────────────────────────────┤
│                    Shared Types (gameEvents.ts)                 │
│  ├── Player { avatarClass, team, ... }                          │
│  ├── Lobby { playerCombatStates, battleModifier, ... }          │
│  ├── Boss { maxHealth, currentHealth, phase, defeated }         │
│  └── AvatarClass (10 classes with stats defined)                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Integration Points by Feature

| New Feature | Primary Integration | Secondary Integration | Event Flow |
|-------------|--------------------|-----------------------|------------|
| **XP/Leveling** | New ProgressionManager | SessionManager (player lookup) | combat:boss_defeated -> progression:xp_awarded |
| **Account XP** | ProgressionManager | Database (storage.ts) | session:player_joined -> load profile |
| **Class Mastery** | ProgressionManager | Player.avatarClass | combat:player_action -> class_xp_gained |
| **Boss AI Patterns** | CombatManager (extended) | None | Internal state machine |
| **Boss Scaling** | CombatManager.initializeCombat | ticketIndex (existing) | Uses existing scaling logic |
| **Class Abilities** | New AbilityManager | CombatManager | combat:ability_activated -> effect applied |
| **Team Combos** | AbilityManager | EstimationManager | estimation:full_consensus_reached -> combo check |
| **Items/Buffs** | AbilityManager | CombatManager | combat:item_used -> buff applied |

### 1.3 Existing Event Bus Contracts

The `eventTypes.ts` already defines 75+ domain events. New features should follow the same pattern:

```typescript
// Existing pattern from eventTypes.ts
export interface CombatBossDamagedPayload {
  lobbyId: string;
  playerId: string;
  damage: number;
  bossHealth: number;
}

// New events follow same structure
export interface ProgressionXpAwardedPayload {
  lobbyId: string;
  playerId: string;
  xpAmount: number;
  source: 'boss_defeat' | 'consensus' | 'ability_use';
  newTotalXp: number;
}
```

---

## Part 2: New Components Required

### 2.1 ProgressionManager (New Domain)

**Responsibility:** Player progression outside individual game sessions

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProgressionManager                           │
├─────────────────────────────────────────────────────────────────┤
│  State:                                                         │
│  ├── playerProfiles: Map<playerId, PlayerProfile>               │
│  │   └── accountXp, accountLevel, classXp, unlocks              │
│  ├── xpRates: XpRateConfig (tunable)                            │
│  └── levelThresholds: number[] (Fibonacci-style)                │
├─────────────────────────────────────────────────────────────────┤
│  Methods:                                                       │
│  ├── awardXp(playerId, amount, source)                          │
│  ├── awardClassXp(playerId, avatarClass, amount)                │
│  ├── getPlayerLevel(playerId): number                           │
│  ├── getClassMastery(playerId, avatarClass): MasteryTier        │
│  ├── calculateLevelBonus(playerId): StatModifiers               │
│  └── checkUnlocks(playerId): Unlock[]                           │
├─────────────────────────────────────────────────────────────────┤
│  Events Subscribed:                                             │
│  ├── combat:boss_defeated -> awardXp to all participants        │
│  ├── estimation:full_consensus_reached -> bonus XP              │
│  ├── session:player_joined -> load profile from storage         │
│  └── session:player_left -> persist profile to storage          │
├─────────────────────────────────────────────────────────────────┤
│  Events Emitted:                                                │
│  ├── progression:xp_awarded                                     │
│  ├── progression:level_up                                       │
│  ├── progression:class_mastery_gained                           │
│  └── progression:unlock_achieved                                │
└─────────────────────────────────────────────────────────────────┘
```

**Integration Pattern:**
```typescript
// ProgressionManager.ts (following existing manager patterns)
export interface ProgressionManagerDeps {
  eventBus: ScopedEventBus;
  storage: IStorage;  // Database abstraction
}

export class ProgressionManager {
  private playerProfiles = new Map<string, PlayerProfile>();

  constructor(deps: ProgressionManagerDeps) {
    this.eventBus = deps.eventBus;
    this.storage = deps.storage;

    // Subscribe to cross-domain events (same pattern as EstimationManager)
    this.eventBus.on('combat:boss_defeated', this.handleBossDefeated.bind(this));
    this.eventBus.on('session:player_joined', this.handlePlayerJoined.bind(this));
  }

  private handleBossDefeated(payload: CombatBossDefeatedPayload): void {
    // Award XP to all participants in the lobby
    const participants = this.getParticipants(payload.lobbyId);
    participants.forEach(playerId => {
      this.awardXp(playerId, XP_RATES.BOSS_DEFEAT, 'boss_defeat');
    });
  }
}
```

### 2.2 AbilityManager (New Domain)

**Responsibility:** Ability execution, cooldowns, effects, and combos

```
┌─────────────────────────────────────────────────────────────────┐
│                      AbilityManager                             │
├─────────────────────────────────────────────────────────────────┤
│  State:                                                         │
│  ├── abilityCooldowns: Map<playerId, Map<abilityId, CooldownState>>│
│  ├── activeEffects: Map<playerId, Effect[]>                     │
│  ├── comboWindows: Map<lobbyId, ComboState>                     │
│  └── abilityDefinitions: Map<abilityId, AbilityDef>             │
├─────────────────────────────────────────────────────────────────┤
│  Methods:                                                       │
│  ├── activateAbility(playerId, abilityId, target?): AbilityResult│
│  ├── canActivate(playerId, abilityId): boolean                  │
│  ├── getCooldownRemaining(playerId, abilityId): number          │
│  ├── applyEffect(targetId, effect): void                        │
│  ├── checkComboTrigger(lobbyId): ComboResult | null             │
│  └── tickEffects(lobbyId): void                                 │
├─────────────────────────────────────────────────────────────────┤
│  Events Subscribed:                                             │
│  ├── estimation:full_consensus_reached -> check team combos     │
│  ├── combat:countdown_complete -> ability cooldown resets?      │
│  └── session:player_left -> clear player effects                │
├─────────────────────────────────────────────────────────────────┤
│  Events Emitted:                                                │
│  ├── ability:activated                                          │
│  ├── ability:cooldown_started                                   │
│  ├── ability:effect_applied                                     │
│  ├── ability:effect_expired                                     │
│  └── ability:combo_triggered                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Cooldown Architecture (following Unreal GAS patterns):**
```typescript
interface CooldownState {
  abilityId: string;
  startedAt: number;
  durationMs: number;
  charges?: number;  // For charge-based abilities
  maxCharges?: number;
}

// Tag-based cooldown checking (inspired by Unreal GAS)
interface AbilityDef {
  id: string;
  name: string;
  cooldownMs: number;
  cooldownTags: string[];  // Shared cooldowns: ['global_cooldown', 'heal_cooldown']
  cost?: { type: 'mana' | 'health'; amount: number };
  effects: EffectDef[];
  comboContribution?: string;  // e.g., 'damage', 'heal', 'buff'
}
```

### 2.3 CombatManager Extensions (Boss AI)

**Current State:** Boss attacks are simple random selection with weighted probabilities:
```typescript
// Existing in CombatManager.ts (line ~948-962)
private selectAttackType(isEnraged: boolean): 'light' | 'heavy' | 'special' {
  const roll = Math.random();
  if (isEnraged) {
    if (roll < 0.4) return 'light';
    if (roll < 0.75) return 'heavy';
    return 'special';
  } else {
    if (roll < 0.6) return 'light';
    if (roll < 0.9) return 'heavy';
    return 'special';
  }
}
```

**Extended Architecture:** Replace random selection with behavior-tree-inspired pattern system:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Boss AI Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│  BossAI (composition, not inheritance)                          │
│  ├── BossBehavior interface                                     │
│  │   ├── selectAction(context: BattleContext): BossAction       │
│  │   ├── onPhaseTransition(oldPhase, newPhase): void            │
│  │   └── getAttackPattern(): AttackPattern                      │
│  ├── PatternSequencer                                           │
│  │   ├── currentPattern: AttackPattern                          │
│  │   ├── patternIndex: number                                   │
│  │   └── advancePattern(): BossAction                           │
│  └── ThreatEvaluator (existing threat table, enhanced)          │
│      ├── calculateThreat(playerId, action): number              │
│      └── selectTarget(): string                                 │
├─────────────────────────────────────────────────────────────────┤
│  Boss Types (strategy pattern):                                 │
│  ├── AggressiveBoss: high damage, predictable patterns          │
│  ├── TacticalBoss: threat-based targeting, counters             │
│  ├── SummonerBoss: spawns minions, supports them                │
│  └── BerserkerBoss: escalating damage, enrage phases            │
└─────────────────────────────────────────────────────────────────┘
```

**Attack Pattern Data Structure:**
```typescript
interface AttackPattern {
  id: string;
  name: string;
  sequence: PatternAction[];  // Ordered sequence of actions
  triggers: PatternTrigger[]; // Conditions to activate this pattern
  priority: number;           // Higher = checked first
}

interface PatternAction {
  type: 'attack' | 'telegraph' | 'wait' | 'summon' | 'buff' | 'phase_transition';
  attackType?: 'light' | 'heavy' | 'special' | 'aoe';
  targetMode?: 'highest_threat' | 'lowest_hp' | 'random' | 'all';
  delayMs?: number;
  telegraphMessage?: string;
}

interface PatternTrigger {
  condition: 'hp_below' | 'player_count_below' | 'time_elapsed' | 'phase_enter';
  value: number | string;
}

// Example pattern
const BERSERKER_ENRAGE_PATTERN: AttackPattern = {
  id: 'berserker_enrage',
  name: 'Berserker Fury',
  sequence: [
    { type: 'telegraph', telegraphMessage: 'The boss enters a berserker rage!' },
    { type: 'wait', delayMs: 1500 },
    { type: 'attack', attackType: 'heavy', targetMode: 'highest_threat' },
    { type: 'attack', attackType: 'heavy', targetMode: 'random' },
    { type: 'attack', attackType: 'aoe', targetMode: 'all' },
  ],
  triggers: [{ condition: 'hp_below', value: 0.3 }],  // 30% HP
  priority: 100,
};
```

---

## Part 3: Data Flow Changes

### 3.1 XP Flow (New)

```
Player completes action
         │
         ▼
┌─────────────────┐     combat:boss_defeated     ┌──────────────────┐
│  CombatManager  │ ─────────────────────────────▶│ProgressionManager│
└─────────────────┘                              │  awardXp()       │
                                                 │  checkLevelUp()  │
                                                 └────────┬─────────┘
                                                          │
                                          progression:level_up (if triggered)
                                                          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │ Client (via      │
                                                 │ ClientEventEmitter)│
                                                 └──────────────────┘
```

### 3.2 Ability Activation Flow (New)

```
Player clicks ability button
         │
         ▼ (Socket.IO: ability:activate)
┌─────────────────┐
│  socketHandlers │
│  abilityHandler │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ability:activated      ┌──────────────────┐
│  AbilityManager │ ───────────────────────────▶│  CombatManager   │
│  activateAbility│                            │  (effect applied)│
│  startCooldown  │                            └──────────────────┘
└────────┬────────┘
         │ ability:effect_applied
         ▼
┌─────────────────┐
│  Client Update  │
│  (cooldown UI,  │
│   effect VFX)   │
└─────────────────┘
```

### 3.3 Boss AI Decision Flow (Extended)

```
Timer triggers boss action
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    performBossAttack (CombatManager)            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Check pattern triggers (HP thresholds, phase, etc.)   │  │
│  │ 2. If pattern active: execute next sequence action       │  │
│  │ 3. Else: select action via BossBehavior.selectAction()   │  │
│  │ 4. Select target via ThreatEvaluator                     │  │
│  │ 5. Execute action (telegraph -> delay -> damage)         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Suggested Build Order

Based on dependencies and risk analysis:

### Phase 1: XP Foundation (Low Risk, High Value)
**Order:** ProgressionManager -> Database schema -> Event wiring

1. **Create PlayerProfile schema** (storage.ts extension)
   - Depends on: Nothing
   - Enables: All progression features

2. **Create ProgressionManager skeleton**
   - Depends on: PlayerProfile schema
   - Pattern: Copy SessionManager structure

3. **Wire combat:boss_defeated -> XP award**
   - Depends on: ProgressionManager
   - Test: Verify XP increments after boss defeat

4. **Add level-up detection and client events**
   - Depends on: XP award working
   - Test: Level-up notification appears

### Phase 2: Class Mastery (Low Risk, Medium Value)
**Order:** Class XP tracking -> Mastery tiers -> UI display

1. **Extend PlayerProfile with classXp map**
   - Depends on: Phase 1 complete

2. **Track class XP on ability use / combat participation**
   - Depends on: classXp schema

3. **Define mastery tiers and bonuses**
   - Depends on: Class XP tracking
   - Design decision: What bonuses per tier?

### Phase 3: Boss AI Patterns (Medium Risk, High Value)
**Order:** Pattern data structure -> PatternSequencer -> Boss types

1. **Define AttackPattern interfaces**
   - Depends on: Nothing
   - Pure TypeScript types

2. **Create PatternSequencer class**
   - Depends on: AttackPattern types
   - Test: Unit test pattern execution

3. **Refactor CombatManager.performBossAttack**
   - Depends on: PatternSequencer
   - Risk: Core combat logic changes
   - Mitigation: Feature flag for new AI

4. **Create boss type variations**
   - Depends on: Refactored performBossAttack
   - Test: Each boss type behaves distinctly

### Phase 4: Ability System (Medium Risk, High Value)
**Order:** AbilityManager -> Ability definitions -> Effects -> Combos

1. **Create AbilityManager skeleton**
   - Depends on: Nothing
   - Pattern: Copy EstimationManager structure

2. **Define ability data structures**
   - Depends on: AbilityManager
   - Includes: Cooldowns, costs, effects

3. **Implement cooldown tracking**
   - Depends on: Ability definitions
   - Test: Cooldowns prevent re-activation

4. **Wire abilities to combat effects**
   - Depends on: Cooldowns working
   - Coordinate with CombatManager

5. **Add team combo detection**
   - Depends on: Abilities working
   - Subscribe to estimation:full_consensus_reached

### Phase 5: Items and Buffs (Low Risk, Medium Value)
**Order:** Item definitions -> Inventory -> Buff application

1. **Define item and buff data structures**
   - Depends on: AbilityManager effects working

2. **Add inventory to PlayerProfile**
   - Depends on: Item definitions

3. **Wire item use to buff application**
   - Depends on: Inventory
   - Reuse AbilityManager.applyEffect

---

## Part 5: Anti-Patterns to Avoid

### Anti-Pattern 1: God Manager
**What goes wrong:** Putting all new features into CombatManager
**Why it happens:** CombatManager already handles boss and damage
**Consequence:** 2000+ line file, untestable, hard to modify
**Prevention:** Create new ProgressionManager and AbilityManager

### Anti-Pattern 2: Tight Coupling via Method Calls
**What goes wrong:** ProgressionManager directly calls CombatManager.getDamageDealt()
**Why it happens:** Easier than setting up events
**Consequence:** Circular dependencies, hard to test in isolation
**Prevention:** All cross-domain communication via EventBus

### Anti-Pattern 3: Persisting Runtime State
**What goes wrong:** Saving cooldown timers to database
**Why it happens:** Confusion between session state and profile state
**Consequence:** Race conditions, stale data, performance issues
**Prevention:**
- Runtime state: In-memory Maps (cooldowns, active effects)
- Persistent state: Database (XP, levels, unlocks)

### Anti-Pattern 4: Complex Inheritance Hierarchies
**What goes wrong:** Boss extends Entity extends Combatant with complex virtual methods
**Why it happens:** OOP instinct from game dev tutorials
**Consequence:** Fragile base class problem, hard to add new boss types
**Prevention:** Use composition with strategy pattern (BossBehavior interface)

### Anti-Pattern 5: Synchronous Effect Chains
**What goes wrong:** Ability activation triggers effect which triggers another effect synchronously
**Why it happens:** Simpler than async handling
**Consequence:** Stack overflow, hard to debug, timing issues
**Prevention:** Queue effects and process in tick loop

---

## Part 6: Client State Considerations

### 6.1 Zustand Store Extensions

Current stores: useGame.tsx, useGameState.tsx, useWebSocket.tsx

**New stores needed:**

```typescript
// useProgression.tsx - Account-level persistent state
interface ProgressionState {
  accountXp: number;
  accountLevel: number;
  classXp: Record<AvatarClass, number>;
  classMastery: Record<AvatarClass, MasteryTier>;
  unlocks: string[];

  // Actions
  handleXpAwarded: (payload: XpAwardedEvent) => void;
  handleLevelUp: (payload: LevelUpEvent) => void;
}

// useAbilities.tsx - Combat session state
interface AbilityState {
  cooldowns: Record<string, CooldownState>;
  activeEffects: Effect[];
  availableAbilities: AbilityDef[];

  // Actions
  activateAbility: (abilityId: string, target?: string) => void;
  handleCooldownUpdate: (payload: CooldownUpdateEvent) => void;
  handleEffectApplied: (payload: EffectAppliedEvent) => void;
}
```

### 6.2 Event Sync Pattern

Existing pattern in useEventSync.ts should be extended:

```typescript
// Add new event handlers to existing fine-grained event system
'progression:xp_awarded': (data) => useProgressionStore.handleXpAwarded(data),
'progression:level_up': (data) => useProgressionStore.handleLevelUp(data),
'ability:cooldown_started': (data) => useAbilityStore.handleCooldownUpdate(data),
'ability:effect_applied': (data) => useAbilityStore.handleEffectApplied(data),
```

---

## Part 7: Database Schema Extensions

### 7.1 Player Profile Table (New)

```typescript
// Using Drizzle ORM (existing in shared/schema.ts)
export const playerProfiles = pgTable('player_profiles', {
  id: text('id').primaryKey(),  // Same as socket session or auth ID
  displayName: text('display_name').notNull(),
  accountXp: integer('account_xp').default(0),
  accountLevel: integer('account_level').default(1),
  classXpJson: jsonb('class_xp').default('{}'),  // { warrior: 100, cleric: 50, ... }
  unlocksJson: jsonb('unlocks').default('[]'),   // ['ability_dash', 'skin_gold', ...]
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 7.2 Boss Definitions Table (New, Optional)

If boss patterns should be data-driven:

```typescript
export const bossDefinitions = pgTable('boss_definitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  behaviorType: text('behavior_type').notNull(),  // 'aggressive', 'tactical', etc.
  baseHp: integer('base_hp').notNull(),
  patternsJson: jsonb('patterns').notNull(),  // AttackPattern[]
  sprite: text('sprite').notNull(),
  ticketIndexMin: integer('ticket_index_min').default(0),
  ticketIndexMax: integer('ticket_index_max'),
});
```

---

## Part 8: Testing Strategy

### 8.1 Unit Testing (Manager Level)

```typescript
// ProgressionManager.test.ts
describe('ProgressionManager', () => {
  it('awards XP on boss_defeated event', async () => {
    const { manager, eventBus } = createTestProgressionManager();

    eventBus.emit('combat:boss_defeated', { lobbyId: 'test', bossId: 'boss1' });

    const profile = manager.getProfile('player1');
    expect(profile.accountXp).toBeGreaterThan(0);
  });

  it('triggers level_up when threshold crossed', () => {
    const { manager, eventBus, emittedEvents } = createTestProgressionManager();

    // Award enough XP to level up
    manager.awardXp('player1', 1000, 'test');

    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ event: 'progression:level_up' })
    );
  });
});
```

### 8.2 Integration Testing (Cross-Domain)

```typescript
// BossDefeat flow test
describe('Boss Defeat -> XP Award Flow', () => {
  it('full flow: defeat boss -> award XP -> level up notification', async () => {
    const { combatManager, progressionManager, eventBus } = createIntegrationEnv();

    // Setup: player in combat
    combatManager.initializeCombat('lobby1', [{ id: 'p1', team: 'developers' }], 0);

    // Action: defeat boss
    while (combatManager.getCombatState('lobby1')?.boss?.hp > 0) {
      combatManager.playerAttackBoss('lobby1', 'p1');
    }

    // Verify: XP awarded
    const profile = progressionManager.getProfile('p1');
    expect(profile.accountXp).toBeGreaterThan(0);
  });
});
```

---

## Sources

### Codebase Analysis (HIGH Confidence)
- `server/domains/SessionManager.ts` - Existing manager pattern
- `server/domains/EstimationManager.ts` - Event subscription patterns
- `server/domains/CombatManager.ts` - Boss attack implementation
- `server/events/eventTypes.ts` - Domain event definitions
- `server/events/ScopedEventBus.ts` - Event bus implementation

### Industry Patterns (MEDIUM Confidence)
- [Unreal Engine Gameplay Ability System](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-ability-system-for-unreal-engine) - Cooldown and effect architecture
- [GASDocumentation](https://github.com/tranek/GASDocumentation) - Tag-based cooldown patterns
- [Using Behavior Trees to Create Retro Boss AI](https://www.gamedeveloper.com/programming/using-behavior-trees-to-create-retro-boss-ai) - Boss behavior patterns
- [FSM and Behavior Tree Fusion](https://medium.com/@abdullahahmetaskin/finite-state-machine-and-behavior-tree-fusion-3fcce33566) - Combining state machines with behavior trees

### Progression System Design (MEDIUM Confidence)
- [University XP: Progression Systems](https://www.universityxp.com/blog/2024/1/16/what-are-progression-systems-in-games) - Horizontal vs vertical progression
- [7 Progression Systems to Study](https://www.gamedeveloper.com/design/7-progression-and-event-systems-that-every-developer-should-study) - Industry examples
- [Pathways to Mastery Taxonomy](https://www.intechopen.com/online-first/1221745) - Academic framework

### Multiplayer Architecture (MEDIUM Confidence)
- [Building Real-Time Multiplayer Game Server](https://dev.to/dowerdev/building-a-real-time-multiplayer-game-server-with-socketio-and-redis-architecture-and-583m) - Socket.IO patterns
- [Architecture of Node.js Multiplayer Game](https://medium.com/@MichalMecinski/architecture-of-a-node-js-multiplayer-game-a9365356cb9) - Manager pattern
- [Domain Events Design and Implementation](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation) - Event-driven DDD

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Integration Points | HIGH | Based on existing codebase analysis |
| New Manager Structure | HIGH | Follows established patterns in codebase |
| Boss AI Patterns | MEDIUM | Industry patterns, needs prototyping |
| Ability System | MEDIUM | Based on Unreal GAS, adapted for TypeScript |
| Build Order | HIGH | Based on dependency analysis |
| Database Schema | MEDIUM | Standard patterns, needs validation |

---

## Open Questions for Phase-Specific Research

1. **XP Curve Design:** What formula for level thresholds? Fibonacci? Exponential?
2. **Class Mastery Bonuses:** What specific stat bonuses per tier?
3. **Boss Pattern Complexity:** How many patterns per boss? How telegraphed?
4. **Combo System Scope:** Team-wide combos only, or individual ability combos?
5. **Item Rarity/Economy:** How do players obtain items? Session-only or persistent?
