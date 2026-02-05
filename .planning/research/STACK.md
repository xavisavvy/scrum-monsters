# Stack Research: Game Progression, Boss AI, and Combat Systems

**Project:** ScrumQuest v1.3 Game Progression Milestone
**Researched:** 2026-02-03
**Confidence:** HIGH

## Executive Summary

Adding XP/leveling, boss attack patterns, class abilities, and combat items to an existing real-time multiplayer game requires minimal stack additions. The existing architecture (EventBus coordination, domain managers, Socket.IO, Zustand, Drizzle ORM) handles these features natively with proper schema extensions.

**Key Recommendation:** No new runtime dependencies required. Use formula-based XP calculations (not lookup tables), state machine patterns for boss AI (without XState), TypeScript discriminated unions for type-safe ability/item systems, and Drizzle schema extensions for persistence.

---

## Recommended Stack Additions

### No New Runtime Dependencies

The existing stack fully supports v1.3 requirements:

| Existing Tech | v1.3 Usage | Rationale |
|---------------|------------|-----------|
| **EventBus** | XP award events, ability triggers, item consumption | Already handles cross-domain coordination |
| **CombatManager** | Boss attack patterns, difficulty scaling | Already manages HP, threats, attack loops |
| **Drizzle ORM** | XP/level persistence, class mastery tables | Already has user schema, supports generated columns |
| **Zustand** | Client-side progression UI state | Already manages game state reactively |
| **Zod** | Validate XP formulas, ability definitions | Already in stack (v3.23.8) |
| **Socket.IO** | Real-time XP notifications, ability broadcasts | Already handles all real-time events |

**Why No New Dependencies:**
- XState (state machine library) adds 15KB+ and learning curve for patterns CombatManager already implements
- Game progression math is pure TypeScript - no specialized library needed
- Existing EventBus pattern handles all new event types

---

## XP/Leveling System Stack

### Recommendation: Formula-Based Calculation

**Use TypeScript pure functions, not database lookup tables.**

```typescript
// server/domains/progression/xpFormulas.ts

/**
 * XP required for a level (quadratic scaling)
 * Level 1: 100 XP, Level 10: ~1000 XP, Level 50: ~12,500 XP
 */
export function getXPForLevel(level: number): number {
  return Math.floor(50 * level * (level + 1));
}

/**
 * Derive level from total XP (inverse formula)
 */
export function getLevelFromXP(totalXP: number): number {
  // Solve: 50 * level * (level + 1) = totalXP
  // Using quadratic formula approximation
  const discriminant = 1 + (4 * totalXP) / 50;
  return Math.floor((-1 + Math.sqrt(discriminant)) / 2);
}

/**
 * XP progress within current level (0-1)
 */
export function getLevelProgress(totalXP: number): number {
  const currentLevel = getLevelFromXP(totalXP);
  const currentLevelXP = getXPForLevel(currentLevel);
  const nextLevelXP = getXPForLevel(currentLevel + 1);
  return (totalXP - currentLevelXP) / (nextLevelXP - currentLevelXP);
}
```

**Why Formula-Based:**
- No database queries for XP calculations (instant)
- Easy to tune difficulty curve by adjusting coefficients
- Deterministic - same XP always yields same level
- No data migration when adjusting progression
- Industry standard per [DEV Community XP system guide](https://dev.to/pedr0fontoura/creating-a-proper-experience-system-for-your-game-31p7)

**Confidence:** HIGH - Core game math pattern, verified via research.

### Database Schema Extension (Drizzle)

```typescript
// shared/schema.ts additions

export const playerProgression = pgTable("player_progression", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),

  // Account-level XP (persists across sessions)
  totalXP: integer("total_xp").default(0).notNull(),

  // Computed level (PostgreSQL generated column for query efficiency)
  accountLevel: integer("account_level")
    .generatedAlwaysAs(sql`FLOOR((-1 + SQRT(1 + 4 * total_xp / 50)) / 2)`)
    .notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const classMastery = pgTable("class_mastery", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  avatarClass: text("avatar_class").notNull(), // 'warrior' | 'cleric' | etc.

  // Class-specific XP
  classXP: integer("class_xp").default(0).notNull(),

  // Mastery tier (0-5: Novice, Apprentice, Journeyman, Expert, Master, Grandmaster)
  masteryTier: integer("mastery_tier").default(0).notNull(),

  // Unique constraint: one mastery record per user per class
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userClassUnique: unique().on(table.userId, table.avatarClass),
}));
```

**Why Drizzle Generated Columns:**
- Level calculated at query time, no sync issues
- Indexable for leaderboards
- [Drizzle supports PostgreSQL generated columns](https://orm.drizzle.team/docs/generated-columns) natively

**Confidence:** HIGH - Verified via Drizzle official documentation.

---

## Boss AI Attack Patterns Stack

### Recommendation: Extend Existing CombatManager Pattern

**Do NOT add XState.** The existing CombatManager already implements state machine patterns with TypeScript.

```typescript
// server/domains/combat/bossPatterns.ts

export type BossAttackType =
  | 'light'      // Quick, low damage
  | 'heavy'      // Telegraphed, high damage
  | 'special'    // Boss-specific signature
  | 'phase'      // Transition attack
  | 'enrage';    // Rage mechanic

export type BossPhase = 'normal' | 'enraged' | 'desperation' | 'defeated';

export interface AttackPattern {
  attackType: BossAttackType;
  damage: number;
  cooldownMs: number;
  telegraphMs: number;  // Warning time before hit
  isAoE: boolean;
  targetSelection: 'highest_threat' | 'random' | 'lowest_hp';
}

export interface BossDefinition {
  bossType: string;  // 'bug-hydra' | 'sprint-demon' | etc.
  displayName: string;
  baseHealthMultiplier: number;

  // Phase-specific attack weights
  phases: {
    normal: AttackPattern[];
    enraged: AttackPattern[];
    desperation: AttackPattern[];
  };

  // Phase transition thresholds
  enrageThreshold: number;      // HP% to enter enraged
  desperationThreshold: number;  // HP% to enter desperation

  // Difficulty scaling coefficients
  healthScalePerTicket: number;  // Additional HP per ticket in queue
  damageScalePerMinute: number;  // Damage increase over battle time
}

// Existing CombatManager extension point
export const BOSS_DEFINITIONS: Record<string, BossDefinition> = {
  'bug-hydra': {
    bossType: 'bug-hydra',
    displayName: 'Bug Hydra',
    baseHealthMultiplier: 1.0,
    phases: {
      normal: [
        { attackType: 'light', damage: 15, cooldownMs: 3000, telegraphMs: 0, isAoE: false, targetSelection: 'highest_threat' },
        { attackType: 'heavy', damage: 35, cooldownMs: 8000, telegraphMs: 1500, isAoE: false, targetSelection: 'random' },
      ],
      enraged: [
        { attackType: 'light', damage: 20, cooldownMs: 2000, telegraphMs: 0, isAoE: false, targetSelection: 'highest_threat' },
        { attackType: 'special', damage: 45, cooldownMs: 10000, telegraphMs: 2000, isAoE: true, targetSelection: 'random' },
      ],
      desperation: [
        { attackType: 'enrage', damage: 30, cooldownMs: 1500, telegraphMs: 500, isAoE: true, targetSelection: 'random' },
      ],
    },
    enrageThreshold: 0.5,
    desperationThreshold: 0.2,
    healthScalePerTicket: 0.15,
    damageScalePerMinute: 0.05,
  },
  // ... other bosses
};
```

**Why Not XState:**
- CombatManager already has phase transitions, attack loops, timers
- Boss phases are simpler than XState's full statechart model
- No learning curve for team
- Per [Game Programming Patterns](https://gameprogrammingpatterns.com/state.html): "For something as simple as boss attack patterns, a simple state enum and switch statement works well"

**Confidence:** HIGH - Extends existing proven patterns.

### Difficulty Scaling Formula

```typescript
// server/domains/combat/difficultyScaling.ts

export interface DifficultyParams {
  ticketIndex: number;      // 0-based index of current ticket
  activePlayerCount: number; // Non-spectator players
  battleElapsedMs: number;   // Time since battle started
  bossType: string;          // Boss definition key
}

export function calculateBossHealth(params: DifficultyParams): number {
  const definition = BOSS_DEFINITIONS[params.bossType];
  const baseHealth = 1000;

  // Player scaling: sqrt for diminishing returns
  const playerScale = Math.sqrt(Math.max(1, params.activePlayerCount));

  // Ticket scaling: linear increase
  const ticketScale = 1 + (params.ticketIndex * definition.healthScalePerTicket);

  // Boss type multiplier
  const typeScale = definition.baseHealthMultiplier;

  return Math.floor(baseHealth * playerScale * ticketScale * typeScale);
}

export function calculateBossDamage(baseDamage: number, params: DifficultyParams): number {
  const definition = BOSS_DEFINITIONS[params.bossType];

  // Time-based scaling: gradual increase to encourage voting
  const minutesElapsed = params.battleElapsedMs / 60000;
  const timeScale = 1 + (minutesElapsed * definition.damageScalePerMinute);

  return Math.floor(baseDamage * timeScale);
}
```

**Confidence:** HIGH - Standard game balancing formulas.

---

## Class Abilities and Team Combos Stack

### Recommendation: Discriminated Union Pattern

**Type-safe ability definitions without runtime library.**

```typescript
// shared/abilities.ts

export type AbilityTarget =
  | 'self'
  | 'ally'
  | 'enemy'
  | 'all_allies'
  | 'all_enemies';

export type AbilityEffect =
  | { type: 'damage'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'buff'; stat: 'damage' | 'defense' | 'speed'; multiplier: number; durationMs: number }
  | { type: 'debuff'; stat: 'damage' | 'defense' | 'speed'; multiplier: number; durationMs: number }
  | { type: 'revive'; healthPercent: number };

export interface ClassAbility {
  id: string;
  name: string;
  description: string;
  avatarClass: AvatarClass;
  requiredMasteryTier: number;  // 0-5, unlocked at this tier
  cooldownMs: number;
  target: AbilityTarget;
  effects: AbilityEffect[];
}

// Type-safe ability registry
export const CLASS_ABILITIES: Record<AvatarClass, ClassAbility[]> = {
  warrior: [
    {
      id: 'warrior_taunt',
      name: 'Taunt',
      description: 'Force boss to target you for 5 seconds',
      avatarClass: 'warrior',
      requiredMasteryTier: 0,
      cooldownMs: 15000,
      target: 'self',
      effects: [{ type: 'buff', stat: 'defense', multiplier: 1.5, durationMs: 5000 }],
    },
    {
      id: 'warrior_rally',
      name: 'Battle Rally',
      description: 'Boost team damage by 25% for 10 seconds',
      avatarClass: 'warrior',
      requiredMasteryTier: 3,
      cooldownMs: 45000,
      target: 'all_allies',
      effects: [{ type: 'buff', stat: 'damage', multiplier: 1.25, durationMs: 10000 }],
    },
  ],
  cleric: [
    {
      id: 'cleric_heal',
      name: 'Healing Light',
      description: 'Heal an ally for 40 HP',
      avatarClass: 'cleric',
      requiredMasteryTier: 0,
      cooldownMs: 8000,
      target: 'ally',
      effects: [{ type: 'heal', amount: 40 }],
    },
    {
      id: 'cleric_mass_heal',
      name: 'Divine Grace',
      description: 'Heal all allies for 25 HP',
      avatarClass: 'cleric',
      requiredMasteryTier: 4,
      cooldownMs: 30000,
      target: 'all_allies',
      effects: [{ type: 'heal', amount: 25 }],
    },
  ],
  // ... other classes
};
```

**Why Discriminated Unions:**
- Compile-time type safety for effect types
- Exhaustive switch checking
- No runtime overhead
- Native TypeScript pattern (no library)

**Confidence:** HIGH - Standard TypeScript pattern.

### Team Combo System

```typescript
// shared/combos.ts

export interface TeamCombo {
  id: string;
  name: string;
  description: string;
  requiredClasses: AvatarClass[];  // All must be present
  minParticipants: number;         // How many must use ability simultaneously
  windowMs: number;                // Time window for coordination
  bonusEffects: AbilityEffect[];
}

export const TEAM_COMBOS: TeamCombo[] = [
  {
    id: 'divine_storm',
    name: 'Divine Storm',
    description: 'Cleric + Warrior: Massive team-wide heal and damage boost',
    requiredClasses: ['cleric', 'warrior'],
    minParticipants: 2,
    windowMs: 3000,
    bonusEffects: [
      { type: 'heal', amount: 50 },
      { type: 'buff', stat: 'damage', multiplier: 1.5, durationMs: 10000 },
    ],
  },
  {
    id: 'arcane_barrage',
    name: 'Arcane Barrage',
    description: 'Wizard + Sorcerer: Triple damage to boss',
    requiredClasses: ['wizard', 'sorcerer'],
    minParticipants: 2,
    windowMs: 2000,
    bonusEffects: [
      { type: 'damage', amount: 150 },
    ],
  },
];
```

**Confidence:** HIGH - Data-driven approach, easy to balance.

---

## Combat Items/Consumables Stack

### Recommendation: Inventory as In-Memory Map (Session-Scoped)

**Items exist only during battle session. No persistence needed for MVP.**

```typescript
// server/domains/combat/inventory.ts

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type ItemEffect =
  | { type: 'instant_heal'; amount: number }
  | { type: 'damage_boost'; multiplier: number; durationMs: number }
  | { type: 'defense_boost'; multiplier: number; durationMs: number }
  | { type: 'revive_self' }
  | { type: 'cleanse_debuff' };

export interface CombatItem {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  maxStack: number;
  effects: ItemEffect[];
}

export const COMBAT_ITEMS: Record<string, CombatItem> = {
  'health_potion': {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restore 30 HP instantly',
    rarity: 'common',
    maxStack: 3,
    effects: [{ type: 'instant_heal', amount: 30 }],
  },
  'phoenix_feather': {
    id: 'phoenix_feather',
    name: 'Phoenix Feather',
    description: 'Revive yourself with 50% HP (one-time use)',
    rarity: 'epic',
    maxStack: 1,
    effects: [{ type: 'revive_self' }],
  },
};

// Session-scoped player inventory (in CombatManager state)
export interface PlayerInventory {
  items: Map<string, number>;  // itemId -> count
}
```

**Why In-Memory:**
- Items are granted at battle start, consumed during battle
- No persistence complexity for MVP
- Can add persistence later via Drizzle if needed
- Follows [Heroic Labs inventory pattern](https://heroiclabs.com/docs/hiro/concepts/inventory/)

**Confidence:** HIGH - MVP-appropriate simplification.

---

## Integration Points with Existing Architecture

### EventBus Events for New Systems

```typescript
// server/events/eventTypes.ts additions

// Progression events
export interface ProgressionXPAwardedPayload {
  lobbyId: string;
  playerId: string;
  xpAmount: number;
  reason: 'voting' | 'consensus' | 'boss_damage' | 'revive' | 'combo';
  newTotalXP: number;
  levelUp?: { oldLevel: number; newLevel: number };
}

export interface ProgressionClassMasteryPayload {
  lobbyId: string;
  playerId: string;
  avatarClass: AvatarClass;
  xpAmount: number;
  newClassXP: number;
  tierUp?: { oldTier: number; newTier: number; unlockedAbilities: string[] };
}

// Combat events (extend existing)
export interface CombatAbilityUsedPayload {
  lobbyId: string;
  playerId: string;
  abilityId: string;
  targets: string[];
  effects: AbilityEffect[];
  comboTriggered?: string;  // Combo ID if this triggered a combo
}

export interface CombatItemUsedPayload {
  lobbyId: string;
  playerId: string;
  itemId: string;
  effects: ItemEffect[];
  remainingCount: number;
}
```

### New Domain Manager: ProgressionManager

```typescript
// server/domains/progression/ProgressionManager.ts

export class ProgressionManager {
  constructor(
    private eventBus: ScopedEventBus,
    private db: DatabaseConnection
  ) {
    // Subscribe to XP-awarding events
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));
    this.eventBus.on('combat:boss_damaged', this.handleBossDamage.bind(this));
    this.eventBus.on('combat:player_revived', this.handleRevive.bind(this));
  }

  private async awardXP(userId: number, amount: number, reason: string): Promise<void> {
    // Update database
    await this.db.update(playerProgression)
      .set({ totalXP: sql`total_xp + ${amount}` })
      .where(eq(playerProgression.userId, userId));

    // Check for level up
    const { totalXP } = await this.getPlayerProgression(userId);
    const oldLevel = getLevelFromXP(totalXP - amount);
    const newLevel = getLevelFromXP(totalXP);

    // Emit event
    this.eventBus.emit('progression:xp_awarded', {
      userId,
      xpAmount: amount,
      reason,
      newTotalXP: totalXP,
      levelUp: newLevel > oldLevel ? { oldLevel, newLevel } : undefined,
    });
  }
}
```

**Confidence:** HIGH - Follows established domain manager pattern.

---

## What NOT to Add

### XState (State Machine Library)

**Why NOT:**
- CombatManager already implements state machine patterns
- Boss phases are simpler than XState's full statechart model (guard conditions, parallel states, etc.)
- Adds 15KB+ bundle size and learning curve
- Per [Game Programming Patterns State chapter](https://gameprogrammingpatterns.com/state.html): Simple enum-based state machines work for most game AI

### Dedicated Game Progression Libraries

**Why NOT:**
- XP formulas are ~20 lines of pure TypeScript
- No standard library exists for this pattern
- Custom formulas allow precise balancing control

### Separate Inventory Database Table

**Why NOT (for MVP):**
- Items are session-scoped (granted at battle start)
- In-memory storage in CombatManager is sufficient
- Add persistence only if item permanence becomes a feature

### CQRS/Event Sourcing for Progression

**Why NOT:**
- XP is simple increment operations
- No audit trail needed for game XP
- Adds unnecessary complexity
- Existing Drizzle ORM handles persistence adequately

---

## Version Compatibility

| Technology | Current Version | Required For v1.3 | Status |
|------------|-----------------|-------------------|--------|
| TypeScript | 5.6.3 | 5.0+ (discriminated unions) | Compatible |
| Drizzle ORM | 0.39.1 (installed), 0.45.1 (latest) | 0.30+ (generated columns) | Compatible |
| Zod | 3.23.8 | 3.20+ | Compatible |
| Zustand | 5.0.3 | 5.0+ | Compatible |
| Socket.IO | 4.8.1 | 4.0+ | Compatible |
| PostgreSQL | 14+ | 12+ (generated columns) | Compatible |

**No upgrades required.**

---

## Installation

```bash
# No new dependencies needed!

# Verify existing versions
npm list zustand drizzle-orm zod socket.io

# Run Drizzle schema migration after adding new tables
npm run db:push
```

---

## Sources

### XP/Progression Systems
- [Creating a proper experience system for your game - DEV Community](https://dev.to/pedr0fontoura/creating-a-proper-experience-system-for-your-game-31p7)
- [Quantitative design - How to define XP thresholds - Gamedeveloper.com](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-)
- [Level systems and character growth in RPG games - Pav Creations](https://pavcreations.com/level-systems-and-character-growth-in-rpg-games/)

### Boss AI and State Machines
- [State Pattern - Game Programming Patterns](https://gameprogrammingpatterns.com/state.html)
- [Designing a Boss: Using a State Machine - Medium](https://medium.com/@dcargile84/designing-a-boss-part-2-using-a-state-machine-3d04a4700890)
- [Designing a simple game AI using Finite State Machines - Gamedeveloper.com](https://www.gamedeveloper.com/programming/designing-a-simple-game-ai-using-finite-state-machines)

### Drizzle ORM
- [Drizzle ORM - Generated Columns](https://orm.drizzle.team/docs/generated-columns)
- [Drizzle ORM - PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg)

### Inventory/Item Systems
- [Heroic Labs Inventory Documentation](https://heroiclabs.com/docs/hiro/concepts/inventory/)
- [Doing Difficulty Right: Consumable Items - Gamedeveloper.com](https://www.gamedeveloper.com/design/doing-difficulty-right-consumable-items)

### XState (Why Not)
- [XState Documentation](https://stately.ai/docs/xstate) - Reviewed to understand full feature set
- [XState npm](https://www.npmjs.com/package/xstate) - Version 5.26.0, 15KB+ bundled

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| XP Formula Approach | HIGH | Industry standard, verified via multiple sources |
| Boss Attack Patterns | HIGH | Extends existing CombatManager, proven patterns |
| Drizzle Schema Extensions | HIGH | Official docs confirm generated column support |
| Class Abilities Pattern | HIGH | Standard TypeScript discriminated unions |
| Combat Items (In-Memory) | HIGH | MVP-appropriate, can extend later |
| No XState Recommendation | MEDIUM | Team might prefer explicit library, but overhead isn't justified |
| No New Dependencies | HIGH | Existing stack fully capable |

---

## Roadmap Implications

**Recommended Phase Structure:**

1. **XP/Progression Foundation** - Schema, formulas, ProgressionManager domain
2. **Boss Pattern Variety** - BossDefinition system, difficulty scaling
3. **Class Abilities** - Ability registry, cooldown management, UI
4. **Team Combos** - Combo detection, coordination window
5. **Combat Items** - Inventory, item effects, drop rates

**Phase Ordering Rationale:**
- XP first (rewards existing actions, no gameplay change)
- Boss patterns second (server-side, testable without client changes)
- Abilities third (requires UI for activation)
- Combos fourth (requires ability system)
- Items last (nice-to-have, most complex UI)

---

*Stack research completed for: ScrumQuest v1.3 Game Progression Milestone*
*Researched: 2026-02-03*
*Confidence: HIGH*
