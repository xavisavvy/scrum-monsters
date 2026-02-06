# Phase 16: Class Mastery System - Research

**Researched:** 2026-02-05
**Domain:** Class-specific progression with tier-based mastery, stat bonuses, and celebration mechanics
**Confidence:** HIGH

## Summary

Phase 16 introduces a class mastery system where players earn expertise in specific avatar classes through 5 tiers (Novice, Apprentice, Adept, Expert, Master). Each tier requires escalating XP thresholds, grants combat and meta-progression stat bonuses (5-15% total at Master), and triggers broadcast celebrations. The system builds on Phase 15's XP infrastructure (ProgressionManager, XPCurve, Socket.IO events) and extends the existing database schema with per-class mastery tracking.

**Existing foundation:** Phase 15 established ProgressionManager domain for XP tracking, exponential XP curve (base=100, exponent=1.5), Zustand progression store, level-up celebration components with class-specific particles, and JRPG-styled UI (gold gradient). The codebase has 10 avatar classes defined in `shared/socket-schemas.ts`, database schema with `userProfiles` table (already tracks `totalXP`, `currentLevel`), and Socket.IO event infrastructure for real-time sync.

**Primary recommendation:** Extend `userProfiles` schema with JSON column for class mastery data (per-class XP + tier). Create ClassMasteryManager domain following ProgressionManager pattern. Reuse Phase 15 XPCurve with steeper multipliers for mastery tiers. Build lobby UI with badge + colored border + title text using existing retro styling. Scale up LevelUpCelebration component for tier-ups with broadcast to all lobby players.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mastery tiers & thresholds:**
- 5 tiers: Novice, Apprentice, Adept, Expert, Master
- Steep XP escalation between tiers — early tiers quick, Master requires serious dedication
- Mastery progress is permanent once earned — no decay
- Classes start as "unranked" until the player plays at least one game as that class
- One mastery track per existing avatar class (not grouped by archetype)
- Mastery is visible to all players in the lobby (social flex)

**Mastery UI & visibility:**
- Two display locations: quick summary in lobby + detailed view in profile/stats panel
- Lobby display uses a layered approach combining all three: tier badge/icon, border/frame color (escalating with tier), and title text under name (e.g., "Expert Warrior")
- Profile view shows ALL classes, with unplayed ones grayed out/locked to encourage exploration
- Mastery progress bars use the same JRPG gold styling as the Phase 15 XP bar for visual consistency

**Stat improvements per tier:**
- Both combat bonuses (lower tiers) and meta-progression bonuses (higher tiers)
- Subtle edge: 5-15% total bonus at max tier — rewards dedication without dominating newer players
- Bonuses apply only when playing the active mastered class — no cross-class passive bonuses

**Tier-up celebration:**
- Bigger than the Phase 15 level-up celebration — mastery tiers are rarer and harder-earned
- Triggers immediately when XP pushes over the threshold — instant gratification
- Visible to ALL players in the lobby — broadcast moment (e.g., "PlayerX reached Expert Warrior!")
- Escalating celebrations: Apprentice gets small fanfare, Master gets a massive JRPG-style ceremony

### Claude's Discretion

- Exact XP thresholds for each tier (steep curve, but specific numbers TBD based on existing XP rates)
- XP tracking approach: same pool dual-tracked vs. separate class XP (decide based on Phase 15 infrastructure)
- Whether higher tiers require account level gates (decide based on progression curve)
- Role-specific vs. generic stat bonuses (decide based on existing class differentiation in combat system)
- Specific badge icons, border colors per tier, and celebration visual effects
- Loading skeleton and error state designs
- Exact stat values per tier within the 5-15% total budget

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | (existing) | Class mastery persistence | Already stores user profiles with XP/level |
| Drizzle ORM | (existing) | Schema management | Type-safe, already used for userProfiles table |
| Socket.IO | (existing) | Real-time tier-up broadcasts | Existing event infrastructure for lobby sync |
| Zustand | (existing) | Client-side mastery state | useProgression pattern proven in Phase 15 |
| EventBus | (existing) | Cross-domain coordination | ProgressionManager → ClassMasteryManager events |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/fiber | (existing) | 3D tier-up effects | Particle bursts, class-specific celebrations |
| @react-three/drei | (existing) | Html overlay component | Full-screen broadcast celebrations |
| Tailwind CSS | (existing) | Badge/border styling | Tier-specific color schemes |
| react-icons | (consider) | Tier badge icons | Consistent iconography across tiers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON column in userProfiles | Separate classMastery table | JSON simpler for 10 classes, normalized table overkill |
| Separate class XP pool | Dual-track account XP | User decided on "Claude's discretion" — recommend shared pool dual-tracked for simplicity |
| Custom tier celebration | Reuse LevelUpCelebration | Tier-ups are bigger — scale up existing component with props |

**Installation:**
```bash
# No new packages required — using existing stack
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/
│   ├── ProgressionManager.ts       # Existing: Account XP/level
│   ├── ClassMasteryManager.ts      # New: Class mastery tracking
│   └── index.ts                    # Register ClassMasteryManager
├── events/
│   └── eventTypes.ts               # Add mastery event types
shared/
├── schema.ts                       # Extend userProfiles with classMasteryData
├── progressionTypes.ts             # Add MasteryTier, ClassMasteryData types
└── gameEvents.ts                   # Add mastery sync payloads
client/
└── src/
    ├── lib/stores/
    │   └── useClassMastery.tsx     # New: Class mastery state
    ├── components/game/
    │   ├── MasteryBadge.tsx        # New: Lobby tier badge display
    │   ├── MasteryProgressBar.tsx  # New: Profile tier progress
    │   ├── MasteryTierCelebration.tsx # New: Scaled-up tier celebration
    │   └── MasteryPanel.tsx        # New: Profile detailed view
```

### Pattern 1: Dual-Tracked XP (Recommended Approach)

**What:** Share the Phase 15 account XP pool but track per-class XP separately for mastery tiers
**When to use:** When you want players to feel progression on both account and class levels without managing two separate XP sources
**Why recommended:** Simpler for players to understand (one XP source), prevents farming exploits (can't double-dip), reuses existing Phase 15 XP award events

**Example:**
```typescript
// server/domains/ClassMasteryManager.ts
// Source: Based on ProgressionManager pattern from Phase 15

export interface ClassMasteryData {
  [avatarClass: string]: {
    totalXP: number;      // XP earned while playing this class
    currentTier: number;  // 0=unranked, 1=Novice, 2=Apprentice, 3=Adept, 4=Expert, 5=Master
    gamesPlayed: number;  // Metadata for "unranked" check
  };
}

export class ClassMasteryManager {
  private eventBus: ScopedEventBus;
  private storage: IStorage;

  // Map<userId, ClassMasteryData>
  private userMasteryData = new Map<string, ClassMasteryData>();

  constructor(deps: { eventBus: ScopedEventBus; storage: IStorage }) {
    this.eventBus = deps.eventBus;
    this.storage = deps.storage;

    // Subscribe to ProgressionManager XP events
    this.eventBus.on('progression:xp_awarded', this.handleXPAwarded.bind(this));
  }

  private handleXPAwarded(payload: ProgressionXPAwardedPayload): void {
    const { playerId, amount, lobbyId } = payload;

    // Get player's current class from lobby state
    const playerClass = this.getPlayerClass(lobbyId, playerId);
    if (!playerClass) return;

    // Award class XP
    const currentData = this.getUserMasteryData(playerId);
    const classData = currentData[playerClass] || { totalXP: 0, currentTier: 0, gamesPlayed: 0 };

    const oldTier = classData.currentTier;
    classData.totalXP += amount;

    // Calculate new tier
    const newTier = this.calculateMasteryTier(classData.totalXP);
    classData.currentTier = newTier;

    currentData[playerClass] = classData;
    this.userMasteryData.set(playerId, currentData);

    // Emit mastery:xp_awarded event
    this.eventBus.emit('mastery:xp_awarded', {
      playerId,
      avatarClass: playerClass,
      amount,
      newTotal: classData.totalXP,
      lobbyId,
    });

    // Check for tier-up
    if (newTier > oldTier) {
      this.eventBus.emit('mastery:tier_up', {
        playerId,
        avatarClass: playerClass,
        oldTier,
        newTier,
        lobbyId,
      });
    }

    // Persist to database (async, non-blocking)
    this.persistMasteryData(playerId, currentData);
  }

  private calculateMasteryTier(totalXP: number): number {
    // Exponential curve steeper than account levels
    // Tier 0: 0 XP (unranked, shown after first game)
    // Tier 1 (Novice): 500 XP
    // Tier 2 (Apprentice): 2000 XP
    // Tier 3 (Adept): 5000 XP
    // Tier 4 (Expert): 12000 XP
    // Tier 5 (Master): 25000 XP
    const thresholds = [0, 500, 2000, 5000, 12000, 25000];

    for (let tier = thresholds.length - 1; tier >= 0; tier--) {
      if (totalXP >= thresholds[tier]) return tier;
    }
    return 0;
  }
}
```

**Design rationale:** Players earn XP from game actions (same as Phase 15), but XP is counted toward BOTH account level AND the active class's mastery tier. No double-dipping — one action = one XP award split two ways conceptually. This prevents players from feeling they need to choose between account progression and class mastery.

### Pattern 2: Mastery Tier Thresholds

**What:** Exponential XP curve significantly steeper than account levels to create long-term goals
**When to use:** All mastery tier calculations
**Why steep:** User requested "early tiers quick, Master requires serious dedication" — matches industry best practices for mastery systems

**Recommended thresholds:**
```typescript
// shared/progressionTypes.ts
export const MASTERY_TIERS = {
  UNRANKED: 0,     // 0 XP (class never played)
  NOVICE: 1,       // 500 XP (~50 votes or 25 boss kills)
  APPRENTICE: 2,   // 2000 XP (~200 votes, 4x Novice)
  ADEPT: 3,        // 5000 XP (~500 votes, 2.5x Apprentice)
  EXPERT: 4,       // 12000 XP (~1200 votes, 2.4x Adept)
  MASTER: 5,       // 25000 XP (~2500 votes, 2.1x Expert)
} as const;

export const MASTERY_THRESHOLDS = [0, 500, 2000, 5000, 12000, 25000];

export const MASTERY_TIER_NAMES = [
  'Unranked',
  'Novice',
  'Apprentice',
  'Adept',
  'Expert',
  'Master',
] as const;
```

**Source:** Based on [Quantitative design - How to define XP thresholds?](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-) and [Level Curve Design](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/example-level-curve-formulas-game-progression) best practices. Multiplier of 4x → 2.5x → 2.4x → 2.1x creates satisfying early progress with meaningful long-term goals.

**Playtime estimate:** At 10 XP per vote (Phase 15 rate), Novice = ~50 votes (5-10 games), Master = ~2500 votes (250-500 games). Matches user intent: "early tiers quick, Master requires serious dedication."

### Pattern 3: Stat Bonuses Per Tier

**What:** Small percentage-based stat increases per tier, capped at 5-15% total at Master
**When to use:** Apply bonuses when calculating combat stats for a player's active class
**Why percentage:** Scales with base stats, avoids balance issues at different character levels

**Recommended structure:**
```typescript
// shared/progressionTypes.ts
export interface MasteryStatBonuses {
  combatBonuses: {
    hpPercent: number;           // HP increase (e.g., 3% at Master = +3 HP on 100 base)
    damagePercent: number;       // Damage increase
    cooldownReduction: number;   // Cooldown reduction (e.g., 5% at Master)
  };
  metaBonuses: {
    xpGainPercent: number;       // XP bonus (e.g., 5% at Master = +0.5 XP on 10 XP vote)
    reviveSpeedPercent: number;  // Revival speed increase
  };
}

export const MASTERY_STAT_BONUSES: Record<number, MasteryStatBonuses> = {
  0: { // Unranked
    combatBonuses: { hpPercent: 0, damagePercent: 0, cooldownReduction: 0 },
    metaBonuses: { xpGainPercent: 0, reviveSpeedPercent: 0 },
  },
  1: { // Novice (+2% total)
    combatBonuses: { hpPercent: 1, damagePercent: 1, cooldownReduction: 0 },
    metaBonuses: { xpGainPercent: 0, reviveSpeedPercent: 0 },
  },
  2: { // Apprentice (+5% total)
    combatBonuses: { hpPercent: 2, damagePercent: 2, cooldownReduction: 1 },
    metaBonuses: { xpGainPercent: 1, reviveSpeedPercent: 1 },
  },
  3: { // Adept (+8% total)
    combatBonuses: { hpPercent: 3, damagePercent: 3, cooldownReduction: 2 },
    metaBonuses: { xpGainPercent: 2, reviveSpeedPercent: 2 },
  },
  4: { // Expert (+12% total)
    combatBonuses: { hpPercent: 4, damagePercent: 4, cooldownReduction: 3 },
    metaBonuses: { xpGainPercent: 3, reviveSpeedPercent: 3 },
  },
  5: { // Master (+15% total)
    combatBonuses: { hpPercent: 5, damagePercent: 5, cooldownReduction: 5 },
    metaBonuses: { xpGainPercent: 5, reviveSpeedPercent: 5 },
  },
};
```

**Source:** Based on [WoW Mastery stat design](https://wow.gamepedia.com/Mastery) and [Destiny 2 armor tier scaling](https://blog.lfcarry.com/destiny-2-armor-guide/) — percentage-based bonuses prevent power creep and maintain 5-15% cap requested by user.

**Design notes:**
- Lower tiers (Novice/Apprentice) focus on combat bonuses for immediate feedback
- Higher tiers (Adept/Expert/Master) add meta-progression bonuses for long-term value
- Total bonus at Master = 15% (5% HP + 5% damage + 5% XP gain), within user's 5-15% budget
- Bonuses only apply when playing the mastered class (no cross-class passives)

### Pattern 4: Lobby Display with Badge + Border + Title

**What:** Three-layer visual hierarchy showing tier at a glance in the lobby
**When to use:** All player avatars in lobby phase
**Why layered:** User requested "strong visual identity" — combining badge, border, and title creates immediate tier recognition

**Example:**
```tsx
// client/src/components/game/MasteryBadge.tsx
import { AvatarClass } from '@shared/gameEvents';
import { MASTERY_TIER_NAMES } from '@shared/progressionTypes';

interface MasteryBadgeProps {
  avatarClass: AvatarClass;
  tier: number; // 0-5
  playerName: string;
}

export function MasteryBadge({ avatarClass, tier, playerName }: MasteryBadgeProps) {
  const tierColors = [
    '#666666', // Unranked (gray)
    '#CD7F32', // Novice (bronze)
    '#C0C0C0', // Apprentice (silver)
    '#FFD700', // Adept (gold)
    '#E5E4E2', // Expert (platinum)
    '#B9F2FF', // Master (diamond/cyan)
  ];

  const tierIcons = ['❓', '🥉', '🥈', '🥇', '💎', '👑'];

  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        borderColor: tierColors[tier],
        borderWidth: tier > 0 ? '3px' : '1px',
        borderStyle: 'solid',
        borderRadius: '8px',
        padding: '8px',
        background: `linear-gradient(135deg, ${tierColors[tier]}15, transparent)`,
      }}
    >
      {/* Badge icon (top-left corner) */}
      <div
        className="absolute -top-2 -left-2 w-8 h-8 flex items-center justify-center rounded-full"
        style={{
          backgroundColor: tierColors[tier],
          border: '2px solid #1a1a1a',
          fontSize: '16px',
        }}
      >
        {tierIcons[tier]}
      </div>

      {/* Player avatar rendering here */}
      <div className="w-16 h-16 mb-2">
        {/* Sprite/avatar component */}
      </div>

      {/* Tier title text */}
      <div className="text-xs font-bold text-center retro-text">
        {playerName}
      </div>
      {tier > 0 && (
        <div
          className="text-[10px] font-bold text-center retro-text"
          style={{ color: tierColors[tier] }}
        >
          {MASTERY_TIER_NAMES[tier]} {avatarClass}
        </div>
      )}
    </div>
  );
}
```

**Source:** Based on [Badge UI Design Best Practices](https://mobbin.com/glossary/badge) and [gamification tier progression UX](https://cieden.com/book/atoms/badge/badge-ui-design). Combines icon-based badges for quick recognition with color hierarchy for visual distinction.

**UX rationale:**
- Badge icon provides instant tier recognition (🥉 = Novice, 👑 = Master)
- Border color escalates in prestige (bronze → silver → gold → platinum → diamond)
- Title text shows exact tier + class for clarity ("Expert Warrior")
- Layered approach creates "social flex" requested by user

### Pattern 5: Tier-Up Broadcast Celebration

**What:** Full-screen celebration visible to ALL players in the lobby when someone tiers up
**When to use:** Immediately when mastery:tier_up event fires
**Why broadcast:** User requested "visible to ALL players" — creates social moment and aspirational motivation

**Example:**
```tsx
// client/src/components/game/MasteryTierCelebration.tsx
import { Html } from '@react-three/drei';
import { AvatarClass } from '@shared/gameEvents';
import { MASTERY_TIER_NAMES } from '@shared/progressionTypes';
import { useAudio } from '@/lib/stores/useAudio';

interface MasteryTierCelebrationProps {
  playerName: string;
  avatarClass: AvatarClass;
  tier: number; // 1-5 (not 0, only for actual tier-ups)
  onComplete?: () => void;
}

export function MasteryTierCelebration({
  playerName,
  avatarClass,
  tier,
  onComplete
}: MasteryTierCelebrationProps) {
  const { playTierUp } = useAudio();

  // Escalating durations: Novice=2s, Apprentice=3s, Adept=4s, Expert=5s, Master=8s
  const duration = tier === 5 ? 8000 : 2000 + (tier * 1000);

  // Escalating particle counts
  const particleCount = tier === 5 ? 100 : 30 + (tier * 10);

  useEffect(() => {
    playTierUp?.(tier); // Different sound per tier
    const timer = setTimeout(() => onComplete?.(), duration);
    return () => clearTimeout(timer);
  }, [tier, duration, onComplete, playTierUp]);

  const tierColors = ['#CD7F32', '#C0C0C0', '#FFD700', '#E5E4E2', '#B9F2FF'];
  const tierIcons = ['🥉', '🥈', '🥇', '💎', '👑'];

  return (
    <Html fullscreen>
      <div className="mastery-tier-overlay">
        {/* Massive flash for Master tier */}
        {tier === 5 && <div className="tier-master-flash" />}

        {/* Escalating burst effect */}
        <div
          className={tier === 5 ? 'tier-burst-massive' : 'tier-burst'}
          style={{
            background: `radial-gradient(circle, ${tierColors[tier - 1]}60 0%, transparent 70%)`,
          }}
        />

        {/* Broadcast announcement */}
        <div className="tier-announcement" style={{ color: tierColors[tier - 1] }}>
          <div className="tier-icon animate-bounce">{tierIcons[tier - 1]}</div>
          <div className="tier-label">
            {playerName} reached
          </div>
          <div className="tier-name">
            {MASTERY_TIER_NAMES[tier]} {avatarClass}!
          </div>
        </div>

        {/* Class-specific particles (more than level-up) */}
        <div className="tier-particles">
          {Array.from({ length: particleCount }).map((_, i) => (
            <div
              key={i}
              className="tier-particle"
              style={{
                backgroundColor: tierColors[tier - 1],
                '--angle': `${(i / particleCount) * 360}deg`,
                '--delay': `${Math.random() * 0.5}s`,
                '--distance': tier === 5 ? '300px' : '200px', // Master goes farther
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </Html>
  );
}
```

**Source:** Based on existing `LevelUpCelebration.tsx` from Phase 15, scaled up for mastery tiers. Inspiration from [multiplayer game celebration UI patterns](https://www.gameuidatabase.com/index.php?scrn=175&plat=1) and [JRPG achievement ceremonies](https://www.behance.net/gallery/68387221/ANIMATION_Level-complete-Celebration-UI-Design).

**Escalation strategy:**
- **Apprentice (Tier 1):** Quick flash, 30 particles, 2s duration
- **Adept (Tier 3):** Moderate burst, 50 particles, 4s duration
- **Master (Tier 5):** MASSIVE ceremony, 100 particles, 8s duration, screen shake, special audio

### Pattern 6: Database Schema Extension

**What:** Add JSON column to existing `userProfiles` table for class mastery data
**When to use:** All mastery data persistence
**Why JSON:** 10 avatar classes × 3 fields = 30 data points. JSON simpler than 30 columns or new table with 10 rows per user.

**Schema:**
```typescript
// shared/schema.ts
export const userProfiles = pgTable("user_profiles", {
  // ... existing columns
  totalXP: integer("total_xp").default(0).notNull(),
  currentLevel: integer("current_level").default(1).notNull(),

  // NEW: Class mastery tracking
  classMasteryData: json("class_mastery_data").$type<ClassMasteryData>().default({}),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Types
export interface ClassMasteryData {
  [avatarClass: string]: {
    totalXP: number;
    currentTier: number;
    gamesPlayed: number;
    lastPlayedAt?: string; // ISO timestamp
  };
}
```

**Migration:**
```sql
-- Add class_mastery_data column to user_profiles
ALTER TABLE user_profiles
ADD COLUMN class_mastery_data JSONB DEFAULT '{}'::jsonb;

-- Create index for faster queries (optional but recommended)
CREATE INDEX idx_user_profiles_class_mastery
ON user_profiles USING GIN (class_mastery_data);
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tier badge icons | Custom SVG rendering | react-icons library or Unicode emoji | Consistent, accessible, no asset management |
| XP threshold formula | New curve algorithm | Reuse Phase 15 XPCurve with multiplier | Proven, tested, consistent with account levels |
| Celebration animations | Custom CSS from scratch | Extend LevelUpCelebration.tsx | Reuse class-specific particles, JRPG styling |
| Broadcast to lobby players | Custom Socket.IO logic | Extend existing lobby_updated event | Proven sync mechanism for lobby state |

**Key insight:** Phase 15 established the XP foundation. Don't rebuild — extend and scale. The hard problems (XP curve math, real-time sync, celebration animations) are already solved. Focus on mastery-specific logic (per-class tracking, tier thresholds, stat bonuses).

## Common Pitfalls

### Pitfall 1: Cross-Class Bonus Confusion

**What goes wrong:** Players expect mastery bonuses to apply across all classes (e.g., "Master Warrior" giving bonus HP to Ranger)
**Why it happens:** Many games have passive account-wide bonuses — players assume mastery works the same way
**How to avoid:**
- Clear UI labeling: "Warrior Mastery bonuses (active only as Warrior)"
- Visual indicator in lobby: Dim/hide mastery badge when player switches class
- First-time tooltip explaining active-only bonuses
**Warning signs:** Players complaining about "lost stats" after switching classes

### Pitfall 2: Double-Dipping XP Exploits

**What goes wrong:** Players find ways to earn XP twice (once for account, once for class) by switching classes mid-game
**Why it happens:** If XP tracking isn't atomic, class switches can duplicate XP awards
**How to avoid:**
- Lock avatar class at lobby start — no mid-game switches (game already prevents this)
- Award XP to the class active when the action occurred (capture class at event time)
- Use single ProgressionManager event stream — ClassMasteryManager subscribes, no separate XP source
**Warning signs:** Players leveling classes they never played, XP totals not matching game history

### Pitfall 3: Mastery Tier UI Clutter

**What goes wrong:** Lobby becomes visually overwhelming with badges, borders, titles stacking on player avatars
**Why it happens:** Combining three visual layers (badge + border + title) without hierarchy creates noise
**How to avoid:**
- Tier badge should be smallest element (8x8px icon, corner position)
- Border should be subtle (2-3px, desaturated tier color)
- Title text only shows on hover/expansion (progressive disclosure pattern from Phase 15)
- Use existing retro styling — don't introduce new visual language
**Warning signs:** Playtesters complaining lobby is "too busy" or "hard to read"

**Source:** Based on [Badge UI Design Best Practices](https://cieden.com/book/atoms/badge/badge-ui-design) — limit content, ensure visual distinction, avoid clutter.

### Pitfall 4: Stat Bonus Calculation at Wrong Time

**What goes wrong:** Mastery stat bonuses don't apply correctly (either double-counted or ignored)
**Why it happens:** Applying bonuses during XP calculation instead of combat stat calculation
**How to avoid:**
- Apply mastery bonuses in CombatManager when initializing player combat state
- Check player's current class mastery tier at combat start
- Store base stats separately from modified stats (base + mastery % = final)
- Don't modify XP gain inside ProgressionManager — keep separation of concerns
**Warning signs:** HP values changing mid-combat, damage inconsistent across games

### Pitfall 5: Celebration Spam in Multiplayer

**What goes wrong:** Multiple players tier up simultaneously, causing celebration overlays to stack/conflict
**Why it happens:** No queue or cooldown for tier-up celebrations
**How to avoid:**
- Queue tier-up celebrations (play one at a time with 1s gap)
- Max celebration duration = 8s (Master tier) prevents indefinite blocks
- Allow ESC/click to skip (user agency)
- Don't show celebrations during active combat (queue for post-battle)
**Warning signs:** Players reporting "stuck" celebration screens, missed game actions

**Source:** Based on [multiplayer UI animation patterns](https://forums.unrealengine.com/t/ui-animations-in-multiplayer-games/1571108) — celebrations should enhance, not block gameplay.

## Code Examples

Verified patterns from existing codebase and established practices:

### Example 1: Extending UserProfile Schema
```typescript
// shared/schema.ts
// Source: Existing userProfiles table pattern

import { pgTable, json, integer, timestamp } from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  // ... existing columns
  totalXP: integer("total_xp").default(0).notNull(),
  currentLevel: integer("current_level").default(1).notNull(),

  // NEW: Class mastery data (JSON for flexibility)
  classMasteryData: json("class_mastery_data").$type<ClassMasteryData>().default({}).notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Type definition
export interface ClassMasteryData {
  ranger?: { totalXP: number; currentTier: number; gamesPlayed: number };
  rogue?: { totalXP: number; currentTier: number; gamesPlayed: number };
  bard?: { totalXP: number; currentTier: number; gamesPlayed: number };
  sorcerer?: { totalXP: number; currentTier: number; gamesPlayed: number };
  wizard?: { totalXP: number; currentTier: number; gamesPlayed: number };
  warrior?: { totalXP: number; currentTier: number; gamesPlayed: number };
  paladin?: { totalXP: number; currentTier: number; gamesPlayed: number };
  cleric?: { totalXP: number; currentTier: number; gamesPlayed: number };
  oathbreaker?: { totalXP: number; currentTier: number; gamesPlayed: number };
  monk?: { totalXP: number; currentTier: number; gamesPlayed: number };
}
```

### Example 2: ClassMasteryManager Event Subscription
```typescript
// server/domains/ClassMasteryManager.ts
// Source: Following ProgressionManager pattern from Phase 15

import { ScopedEventBus } from '../events';
import type { IStorage } from '../storage';
import type { ProgressionXPAwardedPayload } from '../../shared/progressionTypes';

export class ClassMasteryManager {
  private eventBus: ScopedEventBus;
  private storage: IStorage;
  private lobbyPlayerClasses = new Map<string, Map<string, string>>(); // lobbyId → playerId → class

  constructor(deps: { eventBus: ScopedEventBus; storage: IStorage }) {
    this.eventBus = deps.eventBus;
    this.storage = deps.storage;

    // Subscribe to ProgressionManager XP awards
    this.eventBus.on('progression:xp_awarded', this.handleXPAwarded.bind(this));

    // Track player class changes
    this.eventBus.on('session:player_joined', this.trackPlayerClass.bind(this));
    this.eventBus.on('session:avatar_selected', this.updatePlayerClass.bind(this));
  }

  private async handleXPAwarded(payload: ProgressionXPAwardedPayload): Promise<void> {
    const { playerId, amount, lobbyId } = payload;

    // Get player's current class
    const playerClass = this.lobbyPlayerClasses.get(lobbyId)?.get(playerId);
    if (!playerClass) return; // No class yet

    // Load user profile
    const profile = await this.storage.getUserProfile(parseInt(playerId));
    if (!profile) return;

    // Update class mastery data
    const masteryData = (profile.classMasteryData as ClassMasteryData) || {};
    const classData = masteryData[playerClass] || { totalXP: 0, currentTier: 0, gamesPlayed: 0 };

    const oldTier = classData.currentTier;
    classData.totalXP += amount;

    // Calculate new tier
    const newTier = this.calculateTier(classData.totalXP);
    classData.currentTier = newTier;

    masteryData[playerClass] = classData;

    // Persist to database
    await this.storage.updateUserProfile(profile.userId, {
      classMasteryData: masteryData as any
    });

    // Emit mastery XP event
    this.eventBus.emit('mastery:xp_awarded', {
      playerId,
      avatarClass: playerClass,
      amount,
      newTotal: classData.totalXP,
      lobbyId,
    });

    // Check for tier-up
    if (newTier > oldTier) {
      this.eventBus.emit('mastery:tier_up', {
        playerId,
        avatarClass: playerClass,
        oldTier,
        newTier,
        lobbyId,
      });
    }
  }

  private calculateTier(totalXP: number): number {
    const thresholds = [0, 500, 2000, 5000, 12000, 25000];
    for (let tier = thresholds.length - 1; tier >= 0; tier--) {
      if (totalXP >= thresholds[tier]) return tier;
    }
    return 0;
  }
}
```

### Example 3: Zustand Mastery Store
```typescript
// client/src/lib/stores/useClassMastery.tsx
// Source: Following useProgression pattern from Phase 15

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AvatarClass } from '@shared/gameEvents';

interface ClassMasteryEntry {
  totalXP: number;
  currentTier: number;
  gamesPlayed: number;
}

interface ClassMasteryState {
  // State
  masteryData: Record<AvatarClass, ClassMasteryEntry>;
  isLoaded: boolean;

  // Actions
  handleMasterySync: (data: Record<AvatarClass, ClassMasteryEntry>) => void;
  handleMasteryXPAwarded: (data: {
    avatarClass: AvatarClass;
    amount: number;
    newTotal: number;
  }) => void;
  handleTierUp: (data: {
    avatarClass: AvatarClass;
    oldTier: number;
    newTier: number;
  }) => void;
  reset: () => void;
}

export const useClassMastery = create<ClassMasteryState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    masteryData: {} as Record<AvatarClass, ClassMasteryEntry>,
    isLoaded: false,

    // Actions
    handleMasterySync: (data) => {
      set({ masteryData: data, isLoaded: true });
    },

    handleMasteryXPAwarded: (data) => {
      const { masteryData } = get();
      set({
        masteryData: {
          ...masteryData,
          [data.avatarClass]: {
            ...masteryData[data.avatarClass],
            totalXP: data.newTotal,
          },
        },
      });
    },

    handleTierUp: (data) => {
      const { masteryData } = get();
      set({
        masteryData: {
          ...masteryData,
          [data.avatarClass]: {
            ...masteryData[data.avatarClass],
            currentTier: data.newTier,
          },
        },
      });
    },

    reset: () => {
      set({
        masteryData: {} as Record<AvatarClass, ClassMasteryEntry>,
        isLoaded: false,
      });
    },
  }))
);
```

### Example 4: JRPG-Styled Mastery Progress Bar
```css
/* client/src/components/game/MasteryProgressBar.css */
/* Source: Reusing XPBar.css JRPG styling from Phase 15 */

.mastery-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  border: 2px solid #4a3f2f;
  transition: all 0.3s ease;
}

.mastery-bar-track {
  flex: 1;
  height: 12px;
  background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%);
  border-radius: 6px;
  border: 1px solid #4a4a4a;
  overflow: hidden;
  position: relative;
}

.mastery-bar-fill {
  height: 100%;
  /* Tier-specific gradient (passed via style prop) */
  background: linear-gradient(90deg, var(--tier-color-start) 0%, var(--tier-color-mid) 50%, var(--tier-color-end) 100%);
  border-radius: 5px;
  transition: width 0.5s ease-out;
  position: relative;
}

/* JRPG beveled edge effect (same as XP bar) */
.mastery-bar-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
  border-radius: 5px 5px 0 0;
}

.mastery-tier-icon {
  font-size: 16px;
  filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.8));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat XP thresholds (100, 200, 300...) | Exponential curves with multipliers | Mid-2010s (post-WoW Cataclysm) | Creates satisfying progression feel, prevents linear grind |
| Absolute stat bonuses (+5 HP) | Percentage-based scaling (5% HP) | 2010s MMO era | Prevents power creep, scales with character level |
| Single global mastery rank | Per-class/skill mastery tracks | 2020s (Destiny 2, Lost Ark) | Encourages experimentation, extends endgame content |
| Manual celebration triggers | Event-driven broadcast systems | Post-2015 (real-time multiplayer) | Reduces latency, ensures all players see events simultaneously |

**Deprecated/outdated:**
- **Absolute stat bonuses:** Modern games use percentage scaling to avoid balance nightmares at high levels
- **Linear XP curves:** Replaced by exponential/logarithmic for better pacing
- **Client-side only mastery:** Needs server authority + database persistence for security and cross-session continuity

## Open Questions

Things that couldn't be fully resolved:

1. **Account Level Gates for Higher Tiers**
   - What we know: User marked as "Claude's discretion" — could require min account level for Expert/Master tiers
   - What's unclear: Does adding gates create friction or enhance progression sense?
   - Recommendation: Start WITHOUT gates — let players master any class at any account level. If playtesting reveals Master tier too quick, add Level 10 gate for Expert, Level 20 for Master in v1.4.

2. **Role-Specific vs. Generic Stat Bonuses**
   - What we know: Current CharacterDetailsPanel shows per-class stats (STR, DEX, CON, WIS, INT, CHA) but combat doesn't deeply use these yet
   - What's unclear: Should Warrior mastery boost STR specifically, or generic "damage"?
   - Recommendation: Start with GENERIC bonuses (HP%, damage%, cooldown%) — easier to balance. If combat system later differentiates STR vs DEX damage, can add role-specific bonuses in v1.4.

3. **Exact Tier-Up Sound Design**
   - What we know: Phase 15 has playLevelUp() sound, need escalating tier sounds
   - What's unclear: Should each tier have unique fanfare, or just louder/longer versions?
   - Recommendation: Tier 1-4 reuse playLevelUp() with volume scaling. Tier 5 (Master) gets unique "epic achievement" sound. Defer full sound design until audio budget defined.

## Sources

### Primary (HIGH confidence)
- [Pathways to Mastery: A Taxonomy of Player Progression Systems](https://www.intechopen.com/online-first/1221745) - Tiered progression design
- [Quantitative Design - XP Thresholds](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-) - Level curve formulas
- [Level Curve Design Examples](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/example-level-curve-formulas-game-progression) - Exponential vs linear curves
- [Badge UI Design Best Practices](https://mobbin.com/glossary/badge) - Visual tier indicators
- Phase 15 RESEARCH.md and implementation — XP foundation, celebration patterns

### Secondary (MEDIUM confidence)
- [WoW Mastery System](https://wow.gamepedia.com/Mastery) - Percentage-based stat bonuses
- [Destiny 2 Armor Tiers](https://blog.lfcarry.com/destiny-2-armor-guide/) - Tier scaling patterns
- [Game UI Database](https://www.gameuidatabase.com/) - Celebration UI examples
- [Multiplayer UI Animation Patterns](https://forums.unrealengine.com/t/ui-animations-in-multiplayer-games/1571108) - Broadcast celebrations

### Tertiary (LOW confidence)
- [Pantheon Mastery System](https://massivelyop.com/2025/12/18/pantheon-explains-its-incoming-mastery-system-and-how-it-will-differentiate-players-of-the-same-class/) - 2025 mastery design trends (verify with official source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Reusing existing Phase 15 infrastructure (ProgressionManager, Zustand, Socket.IO)
- Architecture: HIGH - Patterns verified against existing codebase (domains/, schema.ts, celebration components)
- Pitfalls: MEDIUM - Based on common game dev issues, but ScrumQuest-specific pitfalls need playtesting

**Research date:** 2026-02-05
**Valid until:** 60 days (stable domain, mastery systems are well-established patterns)
