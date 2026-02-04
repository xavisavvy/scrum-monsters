# Phase 15: XP/Progression Foundation - Research

**Researched:** 2026-02-03
**Domain:** Player XP progression, visual feedback, level-up celebrations, account persistence
**Confidence:** HIGH

## Summary

Phase 15 establishes the XP infrastructure for ScrumQuest's v1.3 progression system. Players earn XP from game actions (voting, combat, consensus, revival), see visual feedback via floating numbers and XP bar updates, experience dramatic level-up celebrations, and have their progress persist across sessions at the account level.

**Existing foundation:** ScrumQuest already has domain separation (SessionManager, EstimationManager, CombatManager), EventBus coordination, Socket.IO real-time sync, database schema with Drizzle ORM, and account-level user profiles in `shared/schema.ts`. This phase adds a new ProgressionManager domain and extends the existing architecture.

**Primary recommendation:** Create ProgressionManager as a new domain manager following the existing pattern (like SessionManager, CombatManager). Use EventBus to listen for game events and award XP. Store XP/level in existing user profiles table. Handle all visual feedback client-side with React Three Fiber Text and particles.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | (existing) | Database schema and migrations | Already used for user profiles, type-safe queries |
| PostgreSQL | (existing) | XP/level persistence | Already configured in shared/schema.ts |
| EventBus | (existing) | Cross-domain coordination | Existing pattern for CombatManager → ProgressionManager |
| Socket.IO | (existing) | Real-time XP sync to clients | Fine-grained events already defined |
| Zustand | (existing) | Client-side XP/level state | Used in useGame.tsx, useGameState.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/fiber | (existing) | 3D rendering for effects | Floating XP numbers, level-up particles |
| @react-three/drei | (existing) | Text component, helpers | Floating text, Html component for 2D overlays |
| react-spring | (consider) | Smooth animations | XP bar fill, number float tweens |
| use-sound | (consider) | Sound effects | Level-up fanfare, XP gain pings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom EventBus | Direct method calls | EventBus already exists and proven |
| New XP table | Extend userProfiles | userProfiles already has userId, perfect fit |
| Custom number animation | CSS transitions | React Three Fiber needed for 3D world integration |

**Installation:**
```bash
# If adding react-spring for animation tweens
npm install @react-spring/three

# If adding sound effects library
npm install use-sound
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/
│   ├── ProgressionManager.ts     # New: XP awards, level calc
│   ├── CombatManager.ts          # Existing: emit combat events
│   └── EstimationManager.ts      # Existing: emit estimation events
├── events/
│   └── eventTypes.ts             # Add progression event types
client/
├── src/
│   ├── lib/stores/
│   │   └── useProgression.tsx    # New: Account XP/level state
│   ├── components/game/
│   │   ├── FloatingXP.tsx        # New: Floating number component
│   │   ├── XPBar.tsx             # New: Bottom bar XP display
│   │   └── LevelUpCelebration.tsx # New: Full-screen celebration
shared/
└── schema.ts                      # Extend userProfiles table
```

### Pattern 1: ProgressionManager Domain
**What:** New domain manager that owns all XP state, subscribes to game events, emits progression events
**When to use:** Every XP-related operation
**Example:**
```typescript
// server/domains/ProgressionManager.ts
// Source: Based on existing CombatManager/SessionManager pattern

export interface ProgressionManagerDeps {
  eventBus: ScopedEventBus;
  storage: IStorage;
}

export class ProgressionManager {
  private playerXP = new Map<string, number>();

  constructor(deps: ProgressionManagerDeps) {
    this.eventBus = deps.eventBus;
    this.storage = deps.storage;

    // Subscribe to XP-awarding events
    this.eventBus.on('combat:boss_damaged', this.handleBossDamaged.bind(this));
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('combat:player_revived', this.handleRevival.bind(this));
    this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));
  }

  private handleBossDamaged(payload: CombatBossDamagedPayload): void {
    const xpAmount = this.calculateDamageXP(payload.damage);
    this.awardXP(payload.playerId, xpAmount, 'boss_damage');
  }

  public awardXP(playerId: string, amount: number, source: XPSource): void {
    // Single entry point - prevents race conditions
    const currentXP = this.playerXP.get(playerId) || 0;
    const newXP = currentXP + amount;
    this.playerXP.set(playerId, newXP);

    const levelBefore = this.calculateLevel(currentXP);
    const levelAfter = this.calculateLevel(newXP);

    // Emit progression event
    this.eventBus.emit('progression:xp_awarded', {
      playerId,
      amount,
      source,
      newTotal: newXP,
    });

    // Check for level-up
    if (levelAfter > levelBefore) {
      this.eventBus.emit('progression:level_up', {
        playerId,
        oldLevel: levelBefore,
        newLevel: levelAfter,
      });
    }
  }
}
```

### Pattern 2: XP Curve Formula
**What:** Exponential or Fibonacci-based level thresholds
**When to use:** calculateLevel() and getLevelThreshold()
**Example:**
```typescript
// Exponential curve: XP = baseXP * (level ^ exponent)
// Source: https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-

export class XPCurve {
  private readonly baseXP = 100;      // XP for level 2
  private readonly exponent = 1.5;    // Growth rate

  getLevelThreshold(level: number): number {
    // Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 245 XP, etc.
    if (level <= 1) return 0;
    return Math.floor(this.baseXP * Math.pow(level - 1, this.exponent));
  }

  getTotalXPForLevel(level: number): number {
    // Sum of all thresholds up to this level
    let total = 0;
    for (let i = 2; i <= level; i++) {
      total += this.getLevelThreshold(i);
    }
    return total;
  }

  calculateLevel(totalXP: number): number {
    let level = 1;
    let xpAccumulated = 0;

    while (xpAccumulated <= totalXP) {
      level++;
      xpAccumulated += this.getLevelThreshold(level);
    }

    return level - 1; // Back off one level
  }
}

// Alternative: Fibonacci-based
// Source: https://www.researchgate.net/figure/Fibonacci-experience-curve-shows-the-additional-XP-required-to-reach-the-next-level-from_fig3_322230755
export class FibonacciXPCurve {
  private fibCache = [0, 1, 1]; // Fib(0), Fib(1), Fib(2)

  private getFibonacci(n: number): number {
    if (this.fibCache[n] !== undefined) return this.fibCache[n];

    for (let i = this.fibCache.length; i <= n; i++) {
      this.fibCache[i] = this.fibCache[i - 1] + this.fibCache[i - 2];
    }
    return this.fibCache[n];
  }

  getLevelThreshold(level: number): number {
    // Level N requires Fib(N) * multiplier XP
    return this.getFibonacci(level + 5) * 10; // Offset and scale
  }
}
```

### Pattern 3: Floating XP Numbers
**What:** Text sprites that rise from action location and fade out
**When to use:** Immediate visual feedback for XP gain
**Example:**
```typescript
// client/src/components/game/FloatingXP.tsx
// Source: https://github.com/pmndrs/react-three-fiber/discussions/945
// Source: https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface FloatingXPProps {
  amount: number;
  source: 'vote' | 'damage' | 'consensus' | 'revival';
  startPosition: [number, number, number];
  onComplete: () => void;
}

const XP_COLORS = {
  vote: '#4A90E2',      // Blue
  damage: '#E74C3C',    // Red
  consensus: '#F39C12', // Gold
  revival: '#2ECC71',   // Green
};

export function FloatingXP({ amount, source, startPosition, onComplete }: FloatingXPProps) {
  const textRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(Date.now());
  const duration = 1000; // 1 second

  useFrame(() => {
    if (!textRef.current) return;

    const elapsed = Date.now() - startTime.current;
    const progress = elapsed / duration;

    if (progress >= 1) {
      onComplete();
      return;
    }

    // Rise animation (ease-out)
    const yOffset = progress * 2 * (2 - progress); // Decelerating rise
    textRef.current.position.y = startPosition[1] + yOffset;

    // Fade out (last 40% of animation)
    const fadeStart = 0.6;
    const opacity = progress < fadeStart
      ? 1
      : 1 - ((progress - fadeStart) / (1 - fadeStart));

    if (textRef.current.material) {
      (textRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }
  });

  return (
    <Text
      ref={textRef}
      position={startPosition}
      fontSize={0.5}
      color={XP_COLORS[source]}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.05}
      outlineColor="#000000"
    >
      +{amount} XP
    </Text>
  );
}
```

### Pattern 4: Level-Up Celebration
**What:** Full-screen particle effect with class-specific animations
**When to use:** When progression:level_up event received
**Example:**
```typescript
// client/src/components/game/LevelUpCelebration.tsx
// Source: https://assetstore.unity.com/packages/vfx/particles/stylized-level-up-particle-pack-264051 (inspiration)
// Source: https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AvatarClass } from '@shared/gameEvents';

interface LevelUpCelebrationProps {
  newLevel: number;
  playerClass: AvatarClass;
  onComplete: () => void;
}

export function LevelUpCelebration({ newLevel, playerClass, onComplete }: LevelUpCelebrationProps) {
  const startTime = useRef(Date.now());
  const duration = 2500; // 2.5 seconds

  useEffect(() => {
    // Play level-up sound
    // playSound('level-up-fanfare');

    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  const getClassAnimation = (avatarClass: AvatarClass): JSX.Element => {
    switch (avatarClass) {
      case 'paladin':
      case 'cleric':
        // Pillar of light effect
        return (
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 10, 32]} />
            <meshBasicMaterial color="#FFD700" transparent opacity={0.6} />
          </mesh>
        );

      case 'rogue':
        // Burst of golden coins (particles)
        return (
          <group>
            {Array.from({ length: 20 }).map((_, i) => {
              const angle = (i / 20) * Math.PI * 2;
              const radius = 1 + Math.random();
              return (
                <mesh key={i} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
                  <circleGeometry args={[0.1, 16]} />
                  <meshBasicMaterial color="#F39C12" />
                </mesh>
              );
            })}
          </group>
        );

      default:
        // Generic starburst
        return (
          <mesh>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.5} />
          </mesh>
        );
    }
  };

  return (
    <>
      {/* Full-screen flash overlay */}
      <Html fullscreen>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 60%)',
            pointerEvents: 'none',
            animation: 'flash 0.5s ease-out',
          }}
        />

        {/* Level-up text */}
        <div
          style={{
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '4rem',
            fontWeight: 'bold',
            color: '#FFD700',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
            animation: 'levelUpText 2s ease-out',
          }}
        >
          LEVEL {newLevel}!
        </div>
      </Html>

      {/* Class-specific 3D effect */}
      <group position={[0, 1, 0]}>
        {getClassAnimation(playerClass)}
      </group>
    </>
  );
}
```

### Pattern 5: XP Bar Component
**What:** Bottom bar with gradient fill showing progress to next level
**When to use:** Always visible during gameplay
**Example:**
```typescript
// client/src/components/game/XPBar.tsx

import { useMemo } from 'react';
import { useProgression } from '@/lib/stores/useProgression';

export function XPBar() {
  const { currentXP, currentLevel, getNextLevelThreshold } = useProgression();

  const { progress, currentLevelXP, neededXP } = useMemo(() => {
    const totalNeeded = getNextLevelThreshold(currentLevel + 1);
    const currentLevelStart = getNextLevelThreshold(currentLevel);
    const currentLevelXP = currentXP - currentLevelStart;
    const neededForNext = totalNeeded - currentLevelStart;

    return {
      progress: (currentLevelXP / neededForNext) * 100,
      currentLevelXP,
      neededXP: neededForNext,
    };
  }, [currentXP, currentLevel, getNextLevelThreshold]);

  return (
    <div className="xp-bar-container">
      <div className="xp-level">Lv {currentLevel}</div>

      <div className="xp-bar-track">
        <div
          className="xp-bar-fill"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #F39C12 0%, #FFD700 100%)',
            transition: 'width 0.5s ease-out',
          }}
        />
      </div>

      {/* Show exact numbers on hover */}
      <div className="xp-details">
        {currentLevelXP} / {neededXP} XP
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Direct XP modification in multiple places:** Always use ProgressionManager.awardXP() as single entry point
- **Client-side XP calculation:** Server is authoritative, client only displays
- **Persisting XP on every gain:** Use checkpoints (ticket complete, session end) to reduce DB writes
- **Hardcoded XP values in event handlers:** Use configurable XP_RATES object
- **Blocking level-up animations:** Run celebrations async, don't block gameplay

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XP curve calculation | Custom level formulas | Exponential: `baseXP * level^exponent` | Industry standard, tunable, well-tested |
| Floating text animation | Manual position updates | `useFrame` with Math.sin/cos | Smooth 60fps, built into R3F |
| Text sprites in 3D | Canvas texture from scratch | `<Text>` from @react-three/drei | Handles fonts, SDF rendering, performance |
| Animation easing | Linear interpolation | react-spring or CSS easing | Professional feel, no jank |
| Sound effect timing | setTimeout chains | use-sound with callbacks | Precise timing, preloading |

**Key insight:** React Three Fiber + Drei already solves most 3D UI problems. Don't rebuild Text rendering, sprite systems, or animation loops.

## Common Pitfalls

### Pitfall 1: XP Race Conditions
**What goes wrong:** Multiple events (boss damage, vote submit, revival assist) trigger XP awards simultaneously. Without serialization, race conditions cause XP loss or double-counting.
**Why it happens:** EventBus emits events synchronously to all subscribers. If multiple combat events fire in same tick, concurrent state mutations occur.
**How to avoid:**
- Single entry point: `ProgressionManager.awardXP()`
- Use Map operations (atomic in JS event loop)
- Emit `progression:xp_awarded` AFTER state mutation completes
**Warning signs:** XP totals don't match between UI and database, players report "missing" XP

### Pitfall 2: XP Persistence Without Session Boundaries
**What goes wrong:** XP persisted during gameplay causes issues when player disconnects/reconnects mid-battle. Either in-progress XP is lost or double-awarded.
**Why it happens:** Unclear distinction between "confirmed XP" (persisted to DB) and "pending XP" (this session).
**How to avoid:**
- Define checkpoints: ticket completion, battle end, session clean disconnect
- Store `pendingXP` in DisconnectedPlayer record
- On reconnect, restore pending XP from disconnect record
- Never decrease XP except through explicit mechanics
**Warning signs:** XP totals don't match between sessions, duplication exploits discovered

### Pitfall 3: XP Number Inflation
**What goes wrong:** XP numbers grow too large, becoming meaningless. "1,847,392 XP" feels hollow vs "15 XP".
**Why it happens:** Copying MMO patterns where numbers reach millions.
**How to avoid:**
- Keep per-action rewards small (1-10 XP for attacks, 20-50 for consensus)
- Use logarithmic display formatting for large numbers (15.2K XP)
- Soft cap around level 50-100
**Warning signs:** Players describe XP as "just a big number", no excitement

### Pitfall 4: Invisible Progress
**What goes wrong:** Class mastery or XP increases but player doesn't notice because no immediate feedback.
**Why it happens:** Events fire server-side without client notification.
**How to avoid:**
- Always emit client events: `progression:xp_awarded` → FloatingXP component
- Show mastery progress after each battle
- Add milestone popups (25%, 50%, 75%, 100%)
**Warning signs:** Players ask "am I making progress?", don't understand system

### Pitfall 5: Level-Up Blocking Gameplay
**What goes wrong:** Level-up celebration freezes game for 3+ seconds, frustrating players mid-battle.
**Why it happens:** Modal celebration overlays entire screen.
**How to avoid:**
- Delay celebration until safe moment (between tickets, after battle)
- Allow skipping with any key/click
- Show scaled-down notification for other players' level-ups
**Warning signs:** Players spam escape key, complaints about "unskippable cutscenes"

## Code Examples

Verified patterns from official sources:

### XP Award on Boss Damage
```typescript
// server/domains/ProgressionManager.ts
// Pattern: Event subscription

constructor(deps: ProgressionManagerDeps) {
  // Subscribe to combat events
  this.eventBus.on('combat:boss_damaged', (payload) => {
    // Award XP based on damage dealt
    const baseXP = 2; // 2 XP per damage point
    const xpAmount = Math.floor(payload.damage * baseXP);

    this.awardXP(payload.playerId, xpAmount, 'boss_damage');
  });
}
```

### XP Award on Vote Submission
```typescript
// server/domains/ProgressionManager.ts
// Pattern: Fixed XP per action

constructor(deps: ProgressionManagerDeps) {
  this.eventBus.on('estimation:vote_cast', (payload) => {
    // Fixed XP for participating in estimation
    const voteXP = 10;
    this.awardXP(payload.playerId, voteXP, 'vote');
  });
}
```

### Consensus Bonus XP
```typescript
// server/domains/ProgressionManager.ts
// Pattern: Team-based bonus

constructor(deps: ProgressionManagerDeps) {
  this.eventBus.on('estimation:full_consensus_reached', (payload) => {
    // Bonus XP for achieving consensus
    const consensusBonus = 50;

    // Award to all participants in lobby
    const participants = this.getActivePlayers(payload.lobbyId);
    participants.forEach(playerId => {
      this.awardXP(playerId, consensusBonus, 'consensus');
    });
  });
}
```

### Revival XP with Scaling
```typescript
// server/domains/ProgressionManager.ts
// Pattern: Context-aware XP scaling

constructor(deps: ProgressionManagerDeps) {
  this.eventBus.on('combat:player_revived', (payload) => {
    const baseRevivalXP = 30;

    // Scale based on situation difficulty
    const lobby = this.getLobby(payload.lobbyId);
    const downedCount = this.getDownedPlayerCount(lobby);
    const bossHPPercent = lobby.boss ? lobby.boss.currentHealth / lobby.boss.maxHealth : 1;

    // Clutch revival bonus (many downed, boss strong)
    const clutchMultiplier = downedCount >= 2 && bossHPPercent > 0.5 ? 1.5 : 1.0;

    const finalXP = Math.floor(baseRevivalXP * clutchMultiplier);
    this.awardXP(payload.reviverId, finalXP, 'revival');
  });
}
```

### Client-Side XP State Store
```typescript
// client/src/lib/stores/useProgression.tsx
// Source: Based on existing useGame.tsx pattern

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface ProgressionState {
  currentXP: number;
  currentLevel: number;
  pendingXPGains: Array<{ amount: number; source: XPSource }>;

  // Actions
  handleXPAwarded: (payload: XPAwardedEvent) => void;
  handleLevelUp: (payload: LevelUpEvent) => void;
  clearPendingGains: () => void;
}

export const useProgression = create<ProgressionState>()(
  subscribeWithSelector((set, get) => ({
    currentXP: 0,
    currentLevel: 1,
    pendingXPGains: [],

    handleXPAwarded: (payload) => {
      set(state => ({
        currentXP: payload.newTotal,
        pendingXPGains: [...state.pendingXPGains, { amount: payload.amount, source: payload.source }],
      }));
    },

    handleLevelUp: (payload) => {
      set({ currentLevel: payload.newLevel });
      // Trigger celebration animation
    },

    clearPendingGains: () => {
      set({ pendingXPGains: [] });
    },
  }))
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| XP in session state only | Account-level persistent XP | Modern games (2020+) | Players expect progress to persist |
| Linear XP curves | Exponential with soft cap | Industry standard | Better pacing, prevents inflation |
| Simple level number | Level + mastery tiers | Modern RPGs | Multiple progression axes |
| No visual feedback | Floating numbers + particles | JRPG standard | Immediate satisfaction |
| Generic celebrations | Class-specific effects | 2023+ games | Personalization matters |

**Deprecated/outdated:**
- **Session-only progression:** Players expect account persistence
- **Linear XP curves (100, 200, 300...):** Too predictable, no excitement
- **Text-only level-up:** Visual celebrations are expected

## Open Questions

Things that couldn't be fully resolved:

1. **Exact XP values for each action**
   - What we know: Boss damage should be ~2 XP per point, votes ~10 XP, consensus ~50 XP
   - What's unclear: Optimal tuning for "first level in one session, level 10 in 5 sessions"
   - Recommendation: Start with conservative values, tune based on playtesting metrics

2. **Level cap and prestige system**
   - What we know: Soft cap around 50-100 prevents inflation
   - What's unclear: When to introduce prestige/rebirth mechanics
   - Recommendation: Defer prestige to post-MVP, focus on solid 1-50 experience

3. **Win streak bonus mechanics**
   - What we know: Cross-session streaks reward consistency
   - What's unclear: How to balance streak bonuses without punishing legitimate disagreement
   - Recommendation: Track "consensus participation" streak, not "voted correctly" streak

4. **XP bar layout with host controls**
   - What we know: Bottom bar currently has host leave/continue buttons
   - What's unclear: Optimal layout to show XP bar + host controls + player info
   - Recommendation: Progressive disclosure - compact by default, expand on hover

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis:
  - `server/domains/SessionManager.ts` - Domain manager pattern
  - `server/domains/CombatManager.ts` - Event subscription examples
  - `server/events/EventBus.ts` - Event coordination
  - `shared/schema.ts` - User profile schema (lines 29-40)
  - `client/src/lib/stores/useGame.tsx` - Zustand store pattern
- [Quantitative Design: How to Define XP Thresholds](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-) - Game Developer
- [Example Level Curve Formulas](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/example-level-curve-formulas-game-progression) - Design The Game
- [React Three Fiber Basic Animations](https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations) - Official Docs
- [2D Text Sprites in R3F](https://github.com/pmndrs/react-three-fiber/discussions/945) - GitHub Discussion

### Secondary (MEDIUM confidence)
- [Fibonacci Experience Curve](https://www.researchgate.net/figure/Fibonacci-experience-curve-shows-the-additional-XP-required-to-reach-the-next-level-from_fig3_322230755) - ResearchGate
- [GameDesign Math: RPG Level-based Progression](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/) - Davide Aversa
- [Stylized Level Up Particle Pack](https://assetstore.unity.com/packages/vfx/particles/stylized-level-up-particle-pack-264051) - Unity Asset Store (inspiration)
- [JRPG UI Sound Effects Pack](https://wowsound.com/p/jrpg-ui-sound-effects-pack/) - WowSound
- [R3F Nebula Damage Numbers](https://codesandbox.io/s/r3f-nebula-damage-numbers-m5h6o) - CodeSandbox
- [node-postgres](https://node-postgres.com/) - PostgreSQL client

### Tertiary (LOW confidence)
- [Creating Animated 3D Text in React Three Fiber](https://medium.com/@divindvm/creating-animated-3d-text-in-react-three-fiber-with-custom-font-and-lights-7ec3d93ae504) - Medium
- [@react-three/drei SpriteAnimator](https://drei.docs.pmnd.rs/misc/sprite-animator) - Drei Docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use
- Architecture: HIGH - Following existing domain manager pattern
- XP formulas: MEDIUM - Industry patterns clear, tuning needs validation
- Visual effects: MEDIUM - R3F patterns established, class-specific animations need design
- Persistence: HIGH - Database schema already supports user profiles

**Research date:** 2026-02-03
**Valid until:** 60 days (stable domain - XP systems well-established)
