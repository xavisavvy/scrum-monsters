# Phase 20: Combat Items & Lifetime Stats - Research

**Researched:** 2026-02-11
**Domain:** Session-scoped consumables, lifetime stats persistence, UI aggregation
**Confidence:** MEDIUM

## Summary

Phase 20 introduces two independent feature streams: session-scoped combat items (consumables that exist only during gameplay) and lifetime player statistics (persistent cross-session metrics). The domain splits cleanly into three subsystems:

1. **ItemManager** - Session-scoped consumable tracking (heal/damage boost/shield items)
2. **StatsTracker** - Lifetime metric aggregation (estimation + combat stats)
3. **Session Summary** - Game-over stats UI and profile page display

This phase reuses the established ability system architecture (Phase 18) for items and extends the existing database schema (userStats table) for lifetime tracking. Session-scoped items follow the same server-authoritative validation pattern as abilities (cooldowns, combat state checks), while stats tracking mirrors the ProgressionManager's event-driven approach with fire-and-forget persistence.

**Primary recommendation:** Structure ItemManager as a domain alongside AbilityManager with shared validation patterns. Extend userStats schema with new columns rather than creating separate tables. Implement session summary as aggregated state emitted at game_over phase transition.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing codebase patterns | N/A | Session state management (Map-based) | Matches AbilityManager, ComboManager architecture |
| Drizzle ORM | Current | Schema extensions for stats | Already used for userStats, userProfiles tables |
| EventBus | Current | Stats event subscription | ProgressionManager, ClassMasteryManager pattern |
| Socket.IO events | Current | Item use client sync | Ability system precedent from Phase 18 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shared/abilityTypes.ts | Current | Item effect type definitions (reuse AbilityEffectType) | Items use same effect types as abilities |
| server/storage.ts | Current | Stats persistence interface | Extend incrementUserStat, updateUserStats methods |
| client/src/components/game/phases/GameOverPhase.tsx | Current | Summary display | Already shows defeat state, extend with stats |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate items table | userStats columns | Column additions avoid JOIN complexity for simple counters |
| Item persistence | Session-only | Requirement explicitly states no persistence between games |
| Separate tracker domain | Extend ProgressionManager | StatsTracker has distinct event subscriptions (damage, deaths, revives) vs XP events |

**Installation:**
```bash
# No new dependencies - uses existing stack
npm run db:push  # After schema modifications
```

## Architecture Patterns

### Recommended Project Structure
```
server/domains/
├── ItemManager.ts              # Session-scoped consumable tracking
├── ItemManager.test.ts         # TDD tests for item validation
├── StatsTracker.ts             # Lifetime stats event listener
└── StatsTracker.test.ts        # Stats aggregation tests

shared/
├── itemTypes.ts                # Item definitions (ItemType, ItemEffect)
└── statsTypes.ts               # Stat event payloads, session summary type

client/src/
├── lib/stores/useItemStore.tsx # Zustand store for player items
└── components/game/
    ├── combat/ItemBar.tsx      # Combat phase item UI
    └── phases/
        ├── GameOverPhase.tsx   # Add session summary display
        └── ProfilePage.tsx     # Lifetime stats display (new or extend existing)
```

### Pattern 1: Session-Scoped Item Management (Reuse AbilityManager Pattern)
**What:** Map-based session state with server-authoritative validation
**When to use:** Items exist only during game session, cleared on lobby cleanup
**Example:**
```typescript
// Source: server/domains/AbilityManager.ts (lines 50-51)
export class ItemManager {
  // State: Map<lobbyId, Map<playerId, ItemInventory>>
  private inventories = new Map<string, Map<string, ItemInventory>>();

  // Award item on ticket completion (ITEM-03)
  awardItem(lobbyId: string, playerId: string, itemType: ItemType): void {
    // Add item to player's session inventory
  }

  // Use item during combat (ITEM-04)
  useItem(lobbyId: string, playerId: string, itemType: ItemType): { success: boolean; error?: string } {
    // Validate combat state, consume item, apply effect via EventBus
  }

  // Cleanup on lobby destroyed
  cleanupLobby(lobbyId: string): void {
    this.inventories.delete(lobbyId);
  }
}
```

### Pattern 2: Fire-and-Forget Stats Persistence (Reuse ProgressionManager Pattern)
**What:** Event-driven stat increments with non-blocking async persistence
**When to use:** Stats updates must not block gameplay, eventual consistency acceptable
**Example:**
```typescript
// Source: server/domains/ProgressionManager.ts (lines 286-291)
export class StatsTracker {
  constructor(deps: StatsTrackerDeps) {
    // Subscribe to stat-relevant events
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('combat:boss_damaged', this.handleBossDamage.bind(this));
    this.eventBus.on('combat:player_revived', this.handleRevive.bind(this));
    this.eventBus.on('combat:player_permanently_downed', this.handleDeath.bind(this));
  }

  private handleVoteCast(payload: EstimationVoteCastPayload): void {
    // Fire-and-forget: don't await
    this.persistStat(payload.playerId, 'totalVotes', 1).catch(() => {});
  }

  private async persistStat(playerId: string, stat: keyof UserStats, increment: number): Promise<void> {
    const userId = this.getUserId(playerId);
    if (!userId || !this.storage) return;
    await this.storage.incrementUserStat(userId, stat, increment);
  }
}
```

### Pattern 3: Session Summary Aggregation (New Pattern)
**What:** Accumulate session metrics in memory, emit at game_over phase transition
**When to use:** Session-local stats displayed in GameOver UI (STAT-04)
**Example:**
```typescript
// Source: Inferred from server/domains/SessionManager.ts phase transition pattern
interface SessionSummary {
  totalVotes: number;
  consensusCount: number;
  damageDealt: number;
  bossesDefeated: number;
  revives: number;
  deaths: number;
  votingSpeed: number; // Average ms per vote
}

export class StatsTracker {
  // State: Map<lobbyId, SessionSummary>
  private sessionStats = new Map<string, SessionSummary>();

  getSessionSummary(lobbyId: string): SessionSummary {
    return this.sessionStats.get(lobbyId) ?? this.createEmptySessionSummary();
  }

  // Emit summary when game_over phase reached
  private handleGameOver(payload: SessionPhaseChangedPayload): void {
    if (payload.newPhase === 'game_over') {
      const summary = this.getSessionSummary(payload.lobbyId);
      this.eventBus.emit('stats:session_complete', { lobbyId: payload.lobbyId, summary });
    }
  }
}
```

### Pattern 4: Item Effect Application (Reuse Ability Effect Pattern)
**What:** Items emit events consumed by CombatManager for effect application
**When to use:** Items affect player HP, boss damage, or buffs (ITEM-02)
**Example:**
```typescript
// Source: server/domains/AbilityManager.ts (lines 232-254) - emit events for effect application
private applyItemEffect(lobbyId: string, playerId: string, itemType: ItemType): void {
  switch (itemType) {
    case 'heal_potion':
      this.eventBus.emit('item:heal_applied', { lobbyId, playerId, healAmount: 30 });
      break;
    case 'damage_boost':
      this.eventBus.emit('item:buff_applied', { lobbyId, playerId, buffType: 'damage', duration: 10000 });
      break;
    case 'shield':
      this.eventBus.emit('item:shield_applied', { lobbyId, playerId, shieldAmount: 50 });
      break;
  }
}
```

### Anti-Patterns to Avoid
- **Persisting items between games:** Requirement ITEM-01 explicitly states session-scoped only. Items cleared on lobby cleanup.
- **Blocking gameplay on stats writes:** Use fire-and-forget persistence like ProgressionManager to avoid latency.
- **Separate table for each stat type:** Extend existing userStats table with new columns rather than creating itemUsage, reviveHistory tables.
- **Client-authoritative item state:** Items must be validated server-side (combat state, inventory presence) before effect application.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Item inventory UI state | Custom state management | Zustand store pattern (useAbilityStore precedent) | Existing pattern from Phase 18 for ability cooldown UI |
| Stats schema migrations | Custom SQL scripts | Drizzle schema + db:push | Already used for userStats, userProfiles, classMasteryProgress |
| Event-driven stat tracking | Polling or manual calls | EventBus subscriptions | ProgressionManager, ClassMasteryManager architecture |
| Session cleanup | Manual cleanup calls | EventBus 'session:lobby_destroyed' | AbilityManager, ComboManager cleanup pattern |

**Key insight:** Phase 18 (abilities) and Phase 15 (progression) established proven patterns for session-scoped features and fire-and-forget persistence. Don't reinvent validation flows, state management, or cleanup logic.

## Common Pitfalls

### Pitfall 1: Item Persistence Confusion
**What goes wrong:** Developer accidentally persists items to database or carries over between sessions
**Why it happens:** Muscle memory from persistent features (XP, class mastery) applied to items
**How to avoid:**
- Items stored in `Map<lobbyId, Map<playerId, ItemInventory>>` cleared by `cleanupLobby()`
- No `itemInventory` table in schema
- Tests verify items don't survive lobby destruction
**Warning signs:**
- Storage interface includes `createItemInventory()` or similar
- ItemManager doesn't implement `cleanupLobby()`

### Pitfall 2: Stat Tracking Memory Leaks
**What goes wrong:** Session summaries not cleaned up after game_over, accumulate in memory
**Why it happens:** EventBus subscriptions don't differentiate session-scoped vs lifetime stats
**How to avoid:**
- SessionSummary stored in `Map<lobbyId, SessionSummary>` with `cleanupLobby()` method
- Lifetime stats go directly to fire-and-forget persistence, not memory
- Subscribe to 'session:lobby_destroyed' for cleanup trigger
**Warning signs:**
- StatsTracker has no cleanup method
- Session stats stored in class-level variables instead of lobby-keyed maps

### Pitfall 3: Missing Combat State Validation
**What goes wrong:** Items used outside combat phase or by downed players
**Why it happens:** Copy-paste from simpler systems without combat state checks
**How to avoid:**
- ItemManager.useItem() checks player combatState === 'fighting' via CombatManager dependency
- Validate lobby phase === 'battle' before allowing item use
- Return `{ success: false, error: 'Player not in combat' }` like AbilityManager pattern
**Warning signs:**
- useItem() doesn't call combatManager.getCombatState()
- No player state validation before item consumption

### Pitfall 4: Stats Double-Counting
**What goes wrong:** Same event tracked in both session summary and lifetime stats, counted twice
**Why it happens:** EventBus subscribers overlap without deduplication
**How to avoid:**
- Session summary tracks via in-memory counters (not persisted)
- Lifetime stats tracked via separate fire-and-forget calls
- Both subscribe to same events but maintain separate state
- No shared counter increments
**Warning signs:**
- Single method increments both sessionStats and calls storage.incrementUserStat()
- Tests show stats doubling on event emission

### Pitfall 5: Voting Speed Calculation Errors
**What goes wrong:** Average voting speed calculated incorrectly (division by zero, wrong timestamp source)
**Why it happens:** Edge cases with single voter, spectators, or late joiners
**How to avoid:**
- Track `votingStartedAt` timestamp from EstimationManager (server/domains/EstimationManager.ts pattern)
- Calculate speed only for players who cast votes (exclude spectators)
- Handle single-voter edge case: speed = 0 or 'instant' label
**Warning signs:**
- Division by zero errors in tests
- Speed calculated using client-side timestamps instead of server

## Code Examples

Verified patterns from official sources:

### Session-Scoped Domain Manager
```typescript
// Source: server/domains/AbilityManager.ts (lines 49-60, 194-196)
export class ItemManager {
  private inventories = new Map<string, Map<string, ItemInventory>>();
  private readonly eventBus: ScopedEventBus;
  private readonly deps: ItemManagerDeps;

  constructor(deps: ItemManagerDeps) {
    this.deps = deps;
    this.eventBus = deps.eventBus;

    // Subscribe to ticket completion for item awards
    this.eventBus.on('estimation:discussion_ended', this.handleTicketComplete.bind(this));
  }

  public cleanupLobby(lobbyId: string): void {
    this.inventories.delete(lobbyId);
  }
}
```

### Fire-and-Forget Stats Persistence
```typescript
// Source: server/domains/ProgressionManager.ts (lines 286-291)
private async persistStat(
  lobbyId: string,
  playerId: string,
  stat: keyof UserStats,
  increment: number
): Promise<void> {
  const userId = this.getUserId?.(lobbyId, playerId);
  if (!userId || !this.storage) return;

  try {
    await this.storage.incrementUserStat(userId, stat, increment);
  } catch (err) {
    // Error logged but not thrown - best-effort persistence
    console.error(`Failed to persist stat ${stat} for user ${userId}:`, err);
  }
}

// Called without await from event handlers
this.persistStat(lobbyId, playerId, 'totalDamageDealt', damage).catch(() => {});
```

### EventBus Subscription Pattern
```typescript
// Source: server/domains/ProgressionManager.ts (lines 180-192)
private setupEventSubscriptions(): void {
  this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
  this.eventBus.on('combat:boss_damaged', this.handleBossDamaged.bind(this));
  this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));
  this.eventBus.on('combat:player_revived', this.handleRevival.bind(this));
}
```

### Schema Extension Pattern
```typescript
// Source: shared/schema.ts (lines 44-56)
export const userStats = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),

  // Existing stats (keep)
  gamesPlayed: integer("games_played").default(0).notNull(),
  ticketsEstimated: integer("tickets_estimated").default(0).notNull(),
  accuracyScore: real("accuracy_score").default(0),
  bossesDefeated: integer("bosses_defeated").default(0).notNull(),
  totalDamageDealt: integer("total_damage_dealt").default(0).notNull(),
  totalHealing: integer("total_healing").default(0).notNull(),
  revivesPerformed: integer("revives_performed").default(0).notNull(),

  // NEW: Phase 20 additions
  totalVotes: integer("total_votes").default(0).notNull(),
  consensusRate: real("consensus_rate").default(0),       // % of votes that reached consensus
  averageVotingSpeedMs: integer("avg_voting_speed_ms"),   // Average ms from voting start to vote cast
  totalDeaths: integer("total_deaths").default(0).notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Item Use Validation
```typescript
// Source: server/domains/AbilityManager.ts (lines 71-113) - validation pattern
public useItem(
  lobbyId: string,
  playerId: string,
  itemType: ItemType
): { success: boolean; error?: string } {
  // 1. Validate player has item in inventory
  const inventory = this.getInventory(lobbyId, playerId);
  if (!inventory.has(itemType) || inventory.get(itemType)! <= 0) {
    return { success: false, error: 'Item not in inventory' };
  }

  // 2. Validate player is in combat
  const combatState = this.deps.combatManager.getCombatState(lobbyId);
  if (!combatState) {
    return { success: false, error: 'Combat not active' };
  }

  const playerState = combatState.players.get(playerId);
  if (!playerState || playerState.combatState !== 'fighting') {
    return { success: false, error: 'Player not in combat' };
  }

  // 3. Consume item and apply effect
  this.consumeItem(lobbyId, playerId, itemType);
  this.applyItemEffect(lobbyId, playerId, itemType);

  return { success: true };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Persistent items between sessions | Session-scoped consumables | Phase 20 design (2026) | Items cleared on game end, simpler state management |
| Multiple stats tables (JOIN queries) | Single userStats table with columns | Established in Phase 15 (schema.ts) | Faster queries, simpler schema |
| Await on stats writes | Fire-and-forget persistence | Phase 15 ProgressionManager | Non-blocking gameplay, eventual consistency |
| Manual cleanup calls | EventBus 'session:lobby_destroyed' | Phase 4 domain separation | Automatic cleanup, no missed cleanups |
| Client-side item state | Server-authoritative validation | Phase 18 ability pattern | Prevents exploits, consistent state |

**Deprecated/outdated:**
- Polling-based stat updates: Use EventBus subscriptions instead
- Synchronous database writes in gameplay handlers: Use fire-and-forget pattern
- Separate domain for each stat type: StatsTracker handles all stat events in one domain

## Open Questions

1. **Item Award Quantity**
   - What we know: Items awarded on ticket completion (ITEM-03)
   - What's unclear: How many items per completion? One random type? All three types? Tiered by ticket difficulty?
   - Recommendation: Start with 1 random item per completion, tune based on playtesting. Implement `selectRandomItemType()` utility.

2. **Item Stack Limits**
   - What we know: Items are consumables usable during combat
   - What's unclear: Can players hold unlimited items? Max 3 per type? Max 10 total?
   - Recommendation: Start with max 5 per item type (heal, damage_boost, shield). Extend ItemInventory type to track counts.

3. **Voting Speed Calculation Edge Cases**
   - What we know: Track voting speed for lifetime stats (STAT-01)
   - What's unclear: How to handle single-voter games, spectators who never vote, players who join mid-ticket?
   - Recommendation: Track only players who cast votes. Speed = (voteTimestamp - votingStartedAt). Average across all votes in lifetime.

4. **Consensus Rate Definition**
   - What we know: Track consensus rate as lifetime stat
   - What's unclear: Rate = (consensus votes / total votes) or (tickets with consensus / total tickets)?
   - Recommendation: Use per-vote granularity: consensusRate = (votes that reached consensus / total votes cast) * 100. More granular than per-ticket.

5. **Profile Page Location**
   - What we know: Player can view lifetime stats on profile page (STAT-03)
   - What's unclear: Does profile page already exist? Is it authenticated route or in-game UI?
   - Recommendation: Extend existing /api/profile route (server/auth/profileRoutes.ts) with stats endpoint. Create ProfilePage.tsx in client if doesn't exist, or extend existing.

## Sources

### Primary (HIGH confidence)
- Codebase files analyzed:
  - `server/domains/AbilityManager.ts` - Session-scoped domain pattern, validation flow
  - `server/domains/ProgressionManager.ts` - Fire-and-forget persistence, EventBus subscriptions
  - `server/domains/CombatManager.ts` - Combat state validation, player state checks
  - `server/domains/ComboManager.ts` - Session-scoped state, cleanup pattern
  - `shared/schema.ts` - userStats table structure, Drizzle patterns
  - `shared/abilityTypes.ts` - Effect type definitions reusable for items
  - `client/src/components/game/phases/GameOverPhase.tsx` - Game over UI structure
  - `server/auth/profileRoutes.ts` - Profile endpoint patterns

### Secondary (MEDIUM confidence)
- [Game UI Database - Results Screen](https://www.gameuidatabase.com/index.php?scrn=53) - Reference for session summary display patterns
- [Game UI Database - Team Summary](https://www.gameuidatabase.com/index.php?scrn=62) - Team stats aggregation UI examples
- Design patterns inferred from Phase 18 (abilities) and Phase 19 (combos) implementation strategies

### Tertiary (LOW confidence)
- Web search results on session-scoped systems and stats tracking were too generic for this specialized domain
- Consumable item systems are domain-specific, relied on codebase patterns instead

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All patterns exist in codebase (AbilityManager, ProgressionManager, schema.ts)
- Architecture: HIGH - Clear precedents from Phases 15-19 for domain structure and EventBus usage
- Pitfalls: MEDIUM - Inferred from code review and common game dev mistakes, not from documented issues
- Item mechanics: MEDIUM - Basic requirements clear, tuning questions remain (stack limits, award quantities)
- Stats calculations: MEDIUM - Schema clear, calculation formulas need validation (consensus rate definition)

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable domain, established patterns)
