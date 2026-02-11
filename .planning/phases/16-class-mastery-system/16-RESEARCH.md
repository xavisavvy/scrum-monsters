# Phase 16: Class Mastery System - Research

**Researched:** 2026-02-11
**Domain:** Class-specific progression, tier-based mastery, stat bonuses, ability unlocks
**Confidence:** HIGH

## Summary

Phase 16 adds class-specific mastery progression where players earn XP for their currently-played avatar class, advance through mastery tiers (Novice → Expert → Master), gain stat bonuses, and unlock class-specific abilities. This builds directly on Phase 15's XP infrastructure, adding a parallel per-class progression system alongside global player level.

**Existing foundation:** ScrumQuest has XP infrastructure (ProgressionManager domain), 10 avatar classes with CharacterStats (str/dex/con/wis/int/cha), combat stat usage (base damage by class), database schema with Drizzle ORM, and event-driven architecture. Phase 15 established global XP/leveling; Phase 16 adds class-specific mastery tracking as a complementary system.

**Primary recommendation:** Create ClassMasteryManager as a new domain manager that tracks per-class XP in parallel with ProgressionManager. Extend database schema with class mastery table. Apply stat bonuses as percentage multipliers to combat calculations. Gate abilities behind mastery tier checks. Use same event subscriptions as ProgressionManager but track XP separately per class played.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | (existing) | Class mastery table schema | Already used for user progression data |
| PostgreSQL | (existing) | Per-class XP persistence | Existing user profiles with totalXP pattern |
| EventBus | (existing) | Class mastery XP awards | ProgressionManager already listens to combat/estimation events |
| Socket.IO | (existing) | Real-time mastery sync | Fine-grained progression events established in Phase 15 |
| Zustand | (existing) | Client-side mastery state | useGameStore pattern for progression display |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/drei | (existing) | UI for mastery display | Text components for tier badges |
| existing CharacterStats | (Phase 15) | Stat bonus calculations | Leverage existing str/dex/con/wis/int/cha system |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate class XP table | JSON column in userProfiles | Separate table is more queryable, supports leaderboards |
| Percentage multipliers | Flat bonuses | Multipliers scale better with level progression |
| Three tiers | Five+ tiers | Three tiers easier to balance, clear progression milestones |

**Installation:**
```bash
# No new dependencies required - uses existing stack
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/
│   ├── ClassMasteryManager.ts     # New: Per-class XP tracking, tier calc
│   ├── ProgressionManager.ts      # Existing: Global XP (Phase 15)
│   └── CombatManager.ts           # Modify: Apply mastery stat bonuses
├── events/
│   └── eventTypes.ts              # Add: class_mastery:* events
shared/
├── schema.ts                       # Extend: classMasteryProgress table
├── classMasteryTypes.ts           # New: Tier definitions, XP curves
└── gameEvents.ts                  # Extend: Player interface with mastery data
client/
└── src/
    ├── lib/stores/
    │   └── useClassMastery.tsx    # New: Mastery state management
    └── components/game/
        ├── MasteryBadge.tsx       # New: Tier indicator on avatar
        └── MasteryProgressBar.tsx # New: Class-specific XP bar
```

### Pattern 1: Parallel XP Tracking (Global + Per-Class)

**What:** ProgressionManager tracks global XP, ClassMasteryManager tracks per-class XP independently
**When to use:** Every gameplay action awards both global XP and class-specific XP simultaneously
**Example:**
```typescript
// server/domains/ClassMasteryManager.ts
// Source: Adapted from ProgressionManager pattern (Phase 15)

export interface ClassMasteryManagerDeps {
  eventBus: ScopedEventBus;
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
  storage?: IStorage;
  getUserId?: (lobbyId: string, playerId: string) => number | undefined;
}

export class ClassMasteryManager {
  // State: Map<lobbyId, Map<playerId, Map<class, classXP>>>
  private lobbyClassXP = new Map<string, Map<string, Map<AvatarClass, number>>>();
  private readonly curve: ClassMasteryXPCurve;

  constructor(deps: ClassMasteryManagerDeps) {
    this.eventBus = deps.eventBus;
    this.curve = new ClassMasteryXPCurve();

    // Subscribe to SAME events as ProgressionManager
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('combat:boss_damaged', this.handleBossDamaged.bind(this));
    this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));
    this.eventBus.on('combat:player_revived', this.handleRevival.bind(this));
  }

  private handleVoteCast(payload: EstimationVoteCastPayload): void {
    const playerClass = this.getPlayerClass(payload.lobbyId, payload.playerId);
    if (!playerClass) return;

    this.awardClassXP(
      payload.lobbyId,
      payload.playerId,
      playerClass,
      CLASS_XP_RATES.vote,
      'vote'
    );
  }

  public awardClassXP(
    lobbyId: string,
    playerId: string,
    avatarClass: AvatarClass,
    amount: number,
    source: XPSource
  ): void {
    const currentXP = this.getClassXP(lobbyId, playerId, avatarClass);
    const oldTier = this.curve.calculateTier(currentXP);

    const newXP = currentXP + amount;
    this.setClassXP(lobbyId, playerId, avatarClass, newXP);

    // Emit class mastery XP event
    this.eventBus.emit('class_mastery:xp_awarded', {
      lobbyId,
      playerId,
      avatarClass,
      amount,
      source,
      newTotal: newXP,
    });

    // Check for tier up
    const newTier = this.curve.calculateTier(newXP);
    if (newTier > oldTier) {
      this.eventBus.emit('class_mastery:tier_up', {
        lobbyId,
        playerId,
        avatarClass,
        oldTier,
        newTier,
      });
    }

    // Persist (fire-and-forget like ProgressionManager)
    if (this.storage && this.getUserId) {
      this.persistClassXP(lobbyId, playerId, avatarClass, newXP).catch(() => {});
    }
  }
}
```

### Pattern 2: Three-Tier Mastery System

**What:** Novice (default), Expert (mid-tier), Master (max-tier) with exponential XP requirements
**When to use:** All class mastery calculations
**Example:**
```typescript
// shared/classMasteryTypes.ts
// Source: Inspired by Final Fantasy job mastery and modern MMO systems

export type MasteryTier = 'Novice' | 'Expert' | 'Master';

export interface MasteryTierConfig {
  tier: MasteryTier;
  xpRequired: number;  // Total XP to reach this tier
  statMultiplier: number; // Percentage bonus (1.0 = no bonus, 1.15 = +15%)
  abilitiesUnlocked: string[]; // Class-specific ability IDs
}

export const MASTERY_TIERS: Record<MasteryTier, MasteryTierConfig> = {
  Novice: {
    tier: 'Novice',
    xpRequired: 0,
    statMultiplier: 1.0,  // No bonuses
    abilitiesUnlocked: [],
  },
  Expert: {
    tier: 'Expert',
    xpRequired: 1000,  // ~10-15 games worth of XP
    statMultiplier: 1.1,  // +10% to class stats
    abilitiesUnlocked: ['class_ability_1'],
  },
  Master: {
    tier: 'Master',
    xpRequired: 5000,  // ~50+ games worth of XP
    statMultiplier: 1.2,  // +20% to class stats
    abilitiesUnlocked: ['class_ability_1', 'class_ability_2'],
  },
};

export class ClassMasteryXPCurve {
  calculateTier(classXP: number): MasteryTier {
    if (classXP >= MASTERY_TIERS.Master.xpRequired) return 'Master';
    if (classXP >= MASTERY_TIERS.Expert.xpRequired) return 'Expert';
    return 'Novice';
  }

  getTierMultiplier(classXP: number): number {
    const tier = this.calculateTier(classXP);
    return MASTERY_TIERS[tier].statMultiplier;
  }

  getUnlockedAbilities(classXP: number): string[] {
    const tier = this.calculateTier(classXP);
    return MASTERY_TIERS[tier].abilitiesUnlocked;
  }
}
```

### Pattern 3: Stat Bonus Application (Percentage Multipliers)

**What:** Apply mastery tier multiplier to class base stats (damage, HP, cooldowns)
**When to use:** Combat calculations, ability cooldown timers
**Example:**
```typescript
// server/domains/CombatManager.ts (modify existing method)
// Source: Pattern from modern MMO stat systems and RPG design guides

private getClassBaseDamage(
  avatarClass: AvatarClass | null | undefined,
  masteryMultiplier: number = 1.0 // NEW: from ClassMasteryManager
): number {
  let baseDamage: number;

  switch (avatarClass) {
    case 'warrior':
    case 'paladin':
      baseDamage = 15;
      break;
    case 'ranger':
    case 'rogue':
      baseDamage = 20;
      break;
    case 'sorcerer':
    case 'wizard':
      baseDamage = 25;
      break;
    case 'cleric':
    case 'bard':
      baseDamage = 10;
      break;
    default:
      baseDamage = 20;
  }

  // Apply mastery multiplier (Expert = 1.1x, Master = 1.2x)
  return Math.floor(baseDamage * masteryMultiplier);
}

// Modified usage in attackBoss():
public attackBoss(lobbyId: string, playerId: string): number {
  const playerClass = this.getPlayerClass?.(lobbyId, playerId);

  // NEW: Get mastery multiplier from ClassMasteryManager
  const masteryMultiplier = this.classMasteryManager?.getMasteryMultiplier(
    lobbyId,
    playerId,
    playerClass
  ) || 1.0;

  const baseDamage = this.getClassBaseDamage(playerClass, masteryMultiplier);
  const damage = Math.floor(baseDamage * combatState.battleModifier);

  // ... rest of damage application
}
```

### Pattern 4: Database Schema for Class Mastery

**What:** Separate table tracking per-user per-class XP totals
**When to use:** All persistence operations
**Example:**
```typescript
// shared/schema.ts
// Source: Drizzle ORM documentation + existing userProfiles pattern

import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const classMasteryProgress = pgTable("class_mastery_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  avatarClass: text("avatar_class").notNull(), // 'ranger' | 'rogue' | etc.
  classXP: integer("class_xp").default(0).notNull(),
  currentTier: text("current_tier").default('Novice').notNull(), // 'Novice' | 'Expert' | 'Master'
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: one row per user per class
  uniqueUserClass: unique().on(table.userId, table.avatarClass),
}));

// IStorage interface extension:
export interface IStorage {
  // ... existing methods

  // Class mastery methods
  getClassMastery(userId: number, avatarClass: AvatarClass): Promise<ClassMasteryProgress | undefined>;
  updateClassMastery(userId: number, avatarClass: AvatarClass, classXP: number): Promise<ClassMasteryProgress>;
  getAllClassMastery(userId: number): Promise<ClassMasteryProgress[]>;
}
```

### Anti-Patterns to Avoid

- **Global mastery across all classes:** Each class MUST track mastery independently. Playing Ranger shouldn't improve Wizard mastery.
- **Flat stat bonuses instead of multipliers:** Use percentage multipliers (1.1x, 1.2x) not flat (+5 damage) for scalability across level ranges.
- **Too many tiers:** Three tiers (Novice/Expert/Master) are sufficient. More tiers dilute the sense of progression and complicate balancing.
- **Mastery XP slower than global XP:** Class XP should award at similar or slightly faster rate than global XP to encourage class specialization without feeling grindy.
- **Visible mastery during combat:** Keep mastery badges in lobby/avatar selection. Combat HUD should remain clean.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XP curve calculations | Custom exponential formula | Adapt ProgressionManager's XPCurve pattern | Already tested, well-balanced for game pacing |
| Database migrations | Manual ALTER TABLE scripts | Drizzle ORM schema + db:push | Type-safe, prevents migration errors |
| Stat multiplier calculations | Per-ability custom formulas | Single getMasteryMultiplier() method | Centralized, easier to tune, consistent across abilities |
| Class-ability mappings | Hard-coded switch statements | Configuration object (MASTERY_TIERS) | Data-driven, easy to balance without code changes |

**Key insight:** Class mastery is essentially parallel XP tracking with tier-based unlocks. The hard part isn't the tracking (ProgressionManager already does this), it's designing balanced XP requirements and stat bonuses that feel meaningful without becoming overpowered. Use configuration-driven design to enable tuning without code changes.

## Common Pitfalls

### Pitfall 1: Mastery Grind Discourages Class Experimentation
**What goes wrong:** Players feel locked into one class because switching means losing mastery progress
**Why it happens:** Class XP requirements too high, or global XP doesn't compensate for lost mastery bonuses
**How to avoid:**
  - Class XP rates slightly HIGHER than global XP (faster mastery progression)
  - Global player level provides baseline power, mastery is bonus specialization
  - Encourage "main + alt" playstyle: 50% of XP comes from global level (any class), 50% from mastery (current class)
**Warning signs:** Players never switch classes after reaching Expert tier, lobby diversity drops

### Pitfall 2: Master Tier Too Dominant (Pay-to-Win Feel)
**What goes wrong:** Master tier bonuses so strong that Novice/Expert players can't compete
**Why it happens:** Stat multipliers too high (1.5x+), or unlocked abilities mandatory for success
**How to avoid:**
  - Cap stat multipliers at 1.2x (20% bonus) for Master tier
  - Abilities provide utility/flavor, not raw power (e.g., "Paladin Master: Heal 50% faster" not "Heal 300% more")
  - Combat designed so Novice players with good estimation can beat Master players with poor estimation
**Warning signs:** New players complain about balance, lobbies segregate by mastery tier

### Pitfall 3: Database N+1 Queries for Mastery Data
**What goes wrong:** Loading mastery for each player in lobby causes 10+ separate DB queries
**Why it happens:** Fetching class mastery per-player instead of batch loading
**How to avoid:**
  - Batch load all class mastery for lobby players on join: `getAllClassMasteryForUsers(userIds)`
  - Cache mastery data in ClassMasteryManager's lobby map (like ProgressionManager caches XP)
  - Only persist on XP changes (fire-and-forget), not on every read
**Warning signs:** Slow lobby joins, database connection pool exhaustion, high DB query latency

### Pitfall 4: Mastery XP Awards Don't Fire During Class Switches
**What goes wrong:** Player switches class mid-session, old class still getting XP
**Why it happens:** ClassMasteryManager caches class at lobby join, doesn't listen for avatar selection changes
**How to avoid:**
  - Listen for `session:avatar_selected` event
  - Update cached player class mapping on avatar selection
  - Award XP to CURRENT class at time of action, not class at lobby join
**Warning signs:** Players report "playing Ranger but Warrior got the XP", class mastery progress inconsistencies

### Pitfall 5: Tier-Up Celebrations Overlap with Level-Up
**What goes wrong:** Player levels up AND tiers up simultaneously, visual effects conflict
**Why it happens:** Global level-up and class tier-up both trigger full-screen celebrations
**How to avoid:**
  - Level-up celebration takes priority (more impactful)
  - Tier-up shows as toast notification if level-up active
  - Queue celebrations: level-up first (3s), then tier-up (2s) if both occur
  - OR: Combine celebrations when both happen ("Level 10! Ranger Expert!")
**Warning signs:** Overlapping animations, missed tier-up notifications, player confusion

## Code Examples

### Common Operation 1: Award Class XP for Combat Action
```typescript
// server/domains/ClassMasteryManager.ts
// Source: Adapted from ProgressionManager.handleBossDamaged()

private handleBossDamaged(payload: CombatBossDamagedPayload): void {
  // Get player's current class (critical: use CURRENT class, not join class)
  const playerClass = this.getPlayerClass(payload.lobbyId, payload.playerId);
  if (!playerClass) return; // Spectator or class not set

  // Calculate class XP (same rate as global XP for balance)
  const classXP = payload.damage * CLASS_XP_RATES.boss_damage;

  // Award to current class only
  this.awardClassXP(
    payload.lobbyId,
    payload.playerId,
    playerClass,
    classXP,
    'boss_damage'
  );
}
```

### Common Operation 2: Check Mastery Tier for Ability Unlock
```typescript
// server/domains/CombatManager.ts
// Source: Pattern from Pantheon: Rise of the Fallen mastery system

public canUseClassAbility(
  lobbyId: string,
  playerId: string,
  abilityId: string
): boolean {
  const playerClass = this.getPlayerClass?.(lobbyId, playerId);
  if (!playerClass) return false;

  // Get player's class mastery tier
  const classXP = this.classMasteryManager?.getClassXP(lobbyId, playerId, playerClass) || 0;
  const unlockedAbilities = this.classMasteryManager?.curve.getUnlockedAbilities(classXP) || [];

  // Check if ability is unlocked
  return unlockedAbilities.includes(abilityId);
}

// Usage in hypothetical heal ability:
public healParty(lobbyId: string, playerId: string): void {
  // Check if player has unlocked enhanced healing (Master tier ability)
  const hasEnhancedHealing = this.canUseClassAbility(
    lobbyId,
    playerId,
    'enhanced_healing'
  );

  const healAmount = hasEnhancedHealing
    ? this.HEAL_AMOUNT * 1.5  // Master tier: +50% healing
    : this.HEAL_AMOUNT;        // Novice/Expert: base healing

  // ... apply healing
}
```

### Common Operation 3: Load Class Mastery on Player Join
```typescript
// server/websocket.ts (in join_lobby handler)
// Source: Pattern from ProgressionManager.loadPlayerXP()

socket.on('join_lobby', async (data: { lobbyId: string; playerName: string }) => {
  // ... existing join logic

  // Load global XP (Phase 15)
  if (userId) {
    await progressionManager.loadPlayerXP(lobbyId, newPlayer.id, userId);
  }

  // NEW: Load class mastery for all classes (Phase 16)
  if (userId) {
    await classMasteryManager.loadAllClassMastery(lobbyId, newPlayer.id, userId);
  }

  // ... emit lobby_joined
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single class per character | Multi-class with independent mastery | FF14 (2013), GW2 (2012) | Players experiment with classes without creating alts |
| Flat stat bonuses | Percentage multipliers | Path of Exile (2013), Diablo 3 (2014) | Scales across all level ranges, easier to balance |
| Many small tiers (10+) | Few meaningful tiers (3-5) | Modern MMOs (2020+) | Clearer progression, more impactful tier-ups |
| Mastery locked per session | Switch class mid-session | Modern multiplayer games (2018+) | Lobby flexibility, respond to team composition |

**Deprecated/outdated:**
- **Class-locked accounts:** Modern games let one account master all classes (FF14 model)
- **Prestige systems for mastery:** Resetting progress for cosmetic rewards feels punishing; keep mastery permanent
- **Hidden mastery bonuses:** Players should clearly see stat bonuses and ability unlocks (transparency)

## Open Questions

1. **Should mastery XP awards be identical to global XP rates?**
   - What we know: ProgressionManager awards vote=10, boss_damage=2x, consensus=50, revival=30
   - What's unclear: Should class mastery use same rates, or slightly higher to encourage specialization?
   - Recommendation: Start with same rates (1:1 parity), tune based on playtesting. Higher rates risk making mastery grind trivial.

2. **How should stat bonuses affect HP vs damage vs cooldowns?**
   - What we know: CharacterStats defines str/dex/con/wis/int/cha, but only damage currently used in combat
   - What's unclear: Should 1.2x multiplier apply to HP pool, damage output, both, or cooldown reduction?
   - Recommendation: Apply to damage only initially (simplest), expand to HP/cooldowns if needed for balance.

3. **Should spectators earn class mastery XP?**
   - What we know: Spectators don't vote or deal damage, but can observe
   - What's unclear: Does observing award mastery XP, or only active participation?
   - Recommendation: No mastery XP for spectators (encourages active play). Clear "spectate mode = no progression" messaging.

4. **What abilities should unlock at Expert/Master tiers?**
   - What we know: Phase 16 requires "class-specific abilities at higher mastery tiers"
   - What's unclear: Specific ability definitions per class (heal faster? more damage? utility?)
   - Recommendation: Defer to implementation. Start with utility abilities (cooldown reduction, faster channeling) that feel meaningful without breaking balance.

5. **Should class mastery affect boss mechanics?**
   - What we know: Boss attacks, enrage, targeting based on threat
   - What's unclear: Should Master tier players generate more threat, or take less damage?
   - Recommendation: No direct boss mechanic changes. Mastery affects player output (damage, healing), boss mechanics stay fair for all tiers.

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis:**
  - `server/domains/ProgressionManager.ts` - XP tracking pattern, event subscriptions
  - `shared/gameEvents.ts` - CharacterStats interface, AVATAR_CLASSES definitions
  - `server/domains/CombatManager.ts` - Damage calculations, class-based stats
  - `shared/schema.ts` - Database schema patterns (userProfiles, totalXP, currentLevel)
- **Official documentation:**
  - Drizzle ORM schema definitions - https://orm.drizzle.team/docs/overview

### Secondary (MEDIUM confidence)
- [Pathways to Mastery: A Taxonomy of Player Progression Systems](https://www.intechopen.com/online-first/1221745)
- [Final Fantasy Job System Documentation](https://finalfantasy.fandom.com/wiki/Job_system)
- [Pantheon: Rise of the Fallen - Spring 2026 Combat and Progression Update](https://www.pantheonmmo.com/news/spring-2026-combat-and-progression-update-overview/)
- [Game Design: Progression Systems](https://gamedesignskills.com/game-design/game-progression/)
- [RPG Stats: Implementing Character Stats](https://howtomakeanrpg.com/r/a/how-to-make-an-rpg-stats.html)
- [Cooldown Manipulation - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/CooldownManipulation)

### Tertiary (LOW confidence)
- General PostgreSQL schema management guides (no specific class mastery examples found)
- WebSearch results for "TypeScript multiplayer class-based progression" (general patterns, not game-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All required libraries already in project (Phase 15)
- Architecture: HIGH - ProgressionManager pattern directly applicable, well-tested in Phase 15
- Database schema: HIGH - Drizzle ORM + userProfiles pattern proven, straightforward extension
- Stat bonus application: MEDIUM - Damage multipliers clear, HP/cooldown effects need design decisions
- Ability unlock system: MEDIUM - Framework clear, specific abilities need design during implementation
- Pitfalls: HIGH - Based on codebase analysis and established game design patterns

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable domain with existing infrastructure)
