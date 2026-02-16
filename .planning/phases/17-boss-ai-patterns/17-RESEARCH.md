# Phase 17: Boss AI Patterns - Research

**Researched:** 2026-02-11
**Domain:** Boss behavior AI systems, attack pattern design, telegraphing mechanics
**Confidence:** HIGH

## Summary

This research explores how to implement distinct boss AI behaviors with unique attack patterns, phase transitions, telegraphing, and dynamic difficulty for ScrumQuest's five existing bosses. The current codebase has a basic boss combat system with simple enrage mechanics (one HP threshold at 50%) and random attack selection. This phase extends that foundation with pattern-based AI using composition (Strategy pattern), explicit state machines, and data-driven boss definitions.

The recommended approach uses a hybrid state machine + behavior pattern system (not full behavior trees). Each boss type gets a unique `BossBehavior` strategy that returns attack patterns based on battle context (HP phase, threat table, player count). The existing threat table and attack timing infrastructure can be reused and enhanced. Visual telegraphing leverages the existing `combat:boss_telegraph` event, extending it with type-specific visual cues for the React Three Fiber client.

**Primary recommendation:** Extend `CombatManager` with a `BossAI` subsystem using composition (not inheritance). Define boss-specific behavior strategies as data-driven patterns with weighted action selection. Implement an explicit FSM for boss state transitions (idle -> telegraphing -> attacking -> recovering) to prevent boolean state explosion.

## Standard Stack

### Core (Existing)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Type safety, discriminated unions | Already used throughout codebase |
| Node.js | 20.x | Server runtime | Existing server infrastructure |
| Socket.IO | 4.x | Real-time event sync | Existing combat event system |

### Supporting (Existing)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Three Fiber | 8.x | 3D visual effects | Telegraph animations, boss visuals |
| Zustand | 4.x | Client state management | Boss state sync to UI |
| Vitest | 1.x | Unit testing | Boss behavior testing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled FSM | XState library | XState is overkill for boss state complexity; simple enum-based FSM sufficient |
| Strategy composition | Inheritance hierarchy | Inheritance creates tight coupling, strategy allows runtime swapping |
| Data-driven patterns | Hardcoded boss logic | Hardcoded logic requires code changes per boss; data-driven allows tuning without recompiles |

**Installation:**
```bash
# No new dependencies required
# Existing stack handles all requirements
```

## Architecture Patterns

### Recommended Project Structure
```
server/domains/
├── CombatManager.ts          # Existing, extended with BossAI
├── CombatManager.test.ts     # Enhanced with boss pattern tests
├── boss-ai/
│   ├── BossAI.ts             # BossAI coordinator, owns PatternSequencer
│   ├── BossBehavior.ts       # BossBehavior interface + implementations
│   ├── PatternSequencer.ts   # Pattern selection and execution
│   ├── ThreatEvaluator.ts    # Enhanced threat/targeting logic
│   ├── boss-definitions/
│   │   ├── bugHydra.ts       # Bug Hydra patterns
│   │   ├── sprintDemon.ts    # Sprint Demon patterns
│   │   ├── deadlineDragon.ts # Deadline Dragon patterns
│   │   ├── techDebtGolem.ts  # Tech Debt Golem patterns
│   │   └── scopeCreepBeast.ts # Scope Creep Beast patterns
│   └── types.ts              # Shared AI types
```

### Pattern 1: Boss State Machine (Explicit FSM)

**What:** Replace the current boolean `isEnraged` flag with an explicit state machine that defines boss states and valid transitions.

**When to use:** For any boss that has distinct behavioral phases (all 5 bosses need this).

**Current problem:** The existing codebase uses a single boolean flag `isEnraged` (CombatManager.ts line 85). Adding more states as booleans leads to boolean soup and untestable combinatorial states.

**Example:**
```typescript
// Source: Research analysis + TypeScript FSM patterns
// https://kbravh.dev/state-machine-in-typescript

type BossState =
  | 'idle'           // Waiting between attacks
  | 'telegraphing'   // Warning before attack
  | 'attacking'      // Executing attack
  | 'recovering'     // Cooldown after attack
  | 'phase_transition'; // Transitioning to new HP phase

interface BossStateMachine {
  currentState: BossState;
  previousState: BossState;
  stateEnteredAt: number;

  // Valid state transitions
  validTransitions: Record<BossState, BossState[]>;

  // Attempt to transition to new state
  transitionTo(newState: BossState): boolean;

  // Time spent in current state
  getStateElapsedMs(): number;
}

// Implementation
class BossStateMachineImpl implements BossStateMachine {
  validTransitions: Record<BossState, BossState[]> = {
    'idle': ['telegraphing', 'phase_transition'],
    'telegraphing': ['attacking'],
    'attacking': ['recovering'],
    'recovering': ['idle'],
    'phase_transition': ['idle'],
  };

  transitionTo(newState: BossState): boolean {
    const allowed = this.validTransitions[this.currentState];
    if (!allowed.includes(newState)) {
      return false; // Invalid transition
    }
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateEnteredAt = Date.now();
    return true;
  }
}
```

### Pattern 2: Boss Behavior Strategy (Composition over Inheritance)

**What:** Each boss type implements a `BossBehavior` interface that returns attack patterns based on battle context. Uses Strategy pattern with composition.

**When to use:** For defining unique boss personalities without inheritance hierarchies.

**Why composition:** Allows runtime flexibility and prevents the fragile base class problem. Based on Strategy pattern best practices.

**Example:**
```typescript
// Source: Strategy pattern + game AI research
// https://refactoring.guru/design-patterns/strategy/typescript/example
// https://www.gamedeveloper.com/programming/using-behavior-trees-to-create-retro-boss-ai

interface BattleContext {
  boss: BossCombat;
  players: Map<string, PlayerCombat>;
  threatTable: Map<string, ThreatEntry>;
  currentPhase: number;        // Derived from HP percentage
  timeSinceBattleStart: number;
  fightingPlayerCount: number;
}

interface BossBehavior {
  // Select next action based on context
  selectAction(context: BattleContext): BossAction;

  // Handle phase transition (HP threshold crossed)
  onPhaseTransition(context: BattleContext, newPhase: number): void;

  // Get available attack patterns for current phase
  getAvailablePatterns(phase: number): AttackPattern[];
}

// Example: Bug Hydra behavior (spawns minions, multi-target attacks)
class BugHydraBehavior implements BossBehavior {
  selectAction(context: BattleContext): BossAction {
    const { boss, currentPhase, fightingPlayerCount } = context;

    // Phase 1 (100-66% HP): Light attacks, occasional summon
    if (currentPhase === 1) {
      const roll = Math.random();
      if (roll < 0.6) {
        return { type: 'attack', attackType: 'light', targetMode: 'random' };
      } else if (roll < 0.8) {
        return { type: 'attack', attackType: 'light', targetMode: 'multi', count: 2 };
      } else {
        return { type: 'special', specialType: 'spawn_minion' };
      }
    }

    // Phase 2 (66-33% HP): More aggressive, heavier hits
    if (currentPhase === 2) {
      const roll = Math.random();
      if (roll < 0.4) {
        return { type: 'attack', attackType: 'heavy', targetMode: 'highest_threat' };
      } else if (roll < 0.7) {
        return { type: 'attack', attackType: 'light', targetMode: 'multi', count: 3 };
      } else {
        return { type: 'special', specialType: 'spawn_minion' };
      }
    }

    // Phase 3 (33-0% HP): Enrage, frequent summons, AoE
    const roll = Math.random();
    if (roll < 0.3) {
      return { type: 'attack', attackType: 'aoe' };
    } else if (roll < 0.5) {
      return { type: 'special', specialType: 'spawn_minion' };
    } else {
      return { type: 'attack', attackType: 'special', targetMode: 'lowest_hp' };
    }
  }

  onPhaseTransition(context: BattleContext, newPhase: number): void {
    // Spawn minions on phase transitions
    if (newPhase === 2 || newPhase === 3) {
      // Trigger minion spawn event
    }
  }

  getAvailablePatterns(phase: number): AttackPattern[] {
    // Return phase-specific patterns
    return BUG_HYDRA_PATTERNS.filter(p => p.phases.includes(phase));
  }
}
```

### Pattern 3: Attack Pattern Data Structure

**What:** Data-driven attack patterns with triggers, sequences, and targeting modes. Separates "what" (data) from "how" (execution).

**When to use:** For all boss attack definitions. Allows designers to tune without code changes.

**Example:**
```typescript
// Source: Boss design patterns + codebase analysis
// https://medium.com/@scott.sourile/designing-a-multi-phase-boss-encounter-in-unity-pt-1-b06ed37aa3f0

interface AttackPattern {
  id: string;
  name: string;
  phases: number[];           // Which HP phases this pattern is valid in
  weight: number;             // Relative probability (higher = more likely)

  sequence: PatternAction[];  // Ordered sequence of actions

  triggers?: PatternTrigger[]; // Optional conditional triggers
}

interface PatternAction {
  type: 'telegraph' | 'wait' | 'attack' | 'special';

  // For 'attack' type
  attackType?: 'light' | 'heavy' | 'special' | 'aoe';
  targetMode?: 'highest_threat' | 'lowest_hp' | 'random' | 'all' | 'multi';
  targetCount?: number;       // For 'multi' mode

  // For 'telegraph' type
  telegraphMessage?: string;
  telegraphDurationMs?: number;
  visualEffect?: 'charge' | 'glow' | 'shake' | 'particles';

  // For 'wait' type
  delayMs?: number;

  // For 'special' type
  specialType?: 'spawn_minion' | 'heal' | 'buff' | 'debuff';
}

interface PatternTrigger {
  condition: 'hp_below' | 'player_count_above' | 'threat_leader_exists';
  value: number | boolean;
}

// Example pattern: Deadline Dragon's "Time Crunch" attack
const DEADLINE_DRAGON_TIME_CRUNCH: AttackPattern = {
  id: 'time_crunch',
  name: 'Time Crunch',
  phases: [2, 3],
  weight: 15,
  sequence: [
    {
      type: 'telegraph',
      telegraphMessage: 'The Deadline Dragon winds up a temporal strike!',
      telegraphDurationMs: 1500,
      visualEffect: 'glow'
    },
    { type: 'wait', delayMs: 500 },
    {
      type: 'attack',
      attackType: 'special',
      targetMode: 'highest_threat'
    },
  ],
  triggers: [
    { condition: 'hp_below', value: 0.66 } // Only in phase 2+
  ]
};
```

### Pattern 4: Threat-Based Targeting (Enhanced)

**What:** Extend the existing threat table with action-specific threat weights (damage, healing, buffs).

**When to use:** For BOSS-06 requirement (targets based on threat).

**Current state:** CombatManager has basic threat tracking in `selectThreatTarget()` (line 994). This enhances it with action-specific threat values.

**Example:**
```typescript
// Source: MMO aggro mechanics research
// https://en.wikipedia.org/wiki/Hate_(video_games)

interface ThreatEntry {
  playerId: string;
  threat: number;
  lastActionAt: number;
}

class ThreatEvaluator {
  private readonly THREAT_WEIGHTS = {
    damage: 1.0,           // 1 damage = 1 threat
    healing: 0.8,          // 1 healing = 0.8 threat
    revival: 150,          // Reviving a player = 150 threat
    buff_applied: 50,      // Applying buff = 50 threat
    time_decay_per_sec: -2 // Threat decays over time
  };

  addThreat(
    threatTable: Map<string, ThreatEntry>,
    playerId: string,
    actionType: 'damage' | 'healing' | 'revival' | 'buff',
    amount: number
  ): void {
    const existing = threatTable.get(playerId);
    const threatGain = this.calculateThreat(actionType, amount);

    if (existing) {
      existing.threat += threatGain;
      existing.lastActionAt = Date.now();
    } else {
      threatTable.set(playerId, {
        playerId,
        threat: threatGain,
        lastActionAt: Date.now()
      });
    }
  }

  private calculateThreat(actionType: string, amount: number): number {
    switch (actionType) {
      case 'damage':
        return amount * this.THREAT_WEIGHTS.damage;
      case 'healing':
        return amount * this.THREAT_WEIGHTS.healing;
      case 'revival':
        return this.THREAT_WEIGHTS.revival;
      case 'buff':
        return this.THREAT_WEIGHTS.buff_applied;
      default:
        return 0;
    }
  }

  // Select target with weighted randomness (70% top threat, 20% second, 10% random)
  selectTarget(
    threatTable: Map<string, ThreatEntry>,
    players: Map<string, PlayerCombat>
  ): string | null {
    const alivePlayers = Array.from(players.values())
      .filter(p => p.combatState === 'fighting');

    if (alivePlayers.length === 0) return null;

    // Get threat entries for alive players, sorted descending
    const aliveThreats = Array.from(threatTable.values())
      .filter(entry => {
        const player = players.get(entry.playerId);
        return player && player.combatState === 'fighting';
      })
      .sort((a, b) => b.threat - a.threat);

    if (aliveThreats.length === 0) {
      // No threat history, random target
      return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].playerId;
    }

    const roll = Math.random();
    if (roll < 0.7) {
      return aliveThreats[0].playerId; // Highest threat
    } else if (roll < 0.9 && aliveThreats.length > 1) {
      return aliveThreats[1].playerId; // Second highest
    } else {
      return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].playerId;
    }
  }
}
```

### Pattern 5: Difficulty Scaling with Team Level

**What:** Scale boss HP and damage based on team average level from Phase 15 (XP/leveling).

**When to use:** For BOSS-04 requirement (difficulty scales with team level).

**Integration point:** The existing `initializeCombat()` method already scales boss HP with `ticketIndex`. Extend with player level scaling.

**Example:**
```typescript
// Source: Difficulty scaling research + codebase
// https://sinisterdesign.net/designing-rpg-mechanics-for-scalability/

interface DifficultyScaling {
  baseBossHpPerPlayer: number;
  levelScalingMultiplier: number; // HP increase per average level
  damageScalingMultiplier: number; // Damage increase per average level
}

class BossDifficultyScaler {
  private readonly SCALING: DifficultyScaling = {
    baseBossHpPerPlayer: 1000,
    levelScalingMultiplier: 0.08, // +8% HP per level
    damageScalingMultiplier: 0.05 // +5% damage per level
  };

  calculateBossMaxHp(
    playerCount: number,
    averageLevel: number,
    ticketIndex: number
  ): number {
    const ticketMultiplier = 1 + (ticketIndex * 0.2); // Existing logic
    const levelMultiplier = 1 + (averageLevel * this.SCALING.levelScalingMultiplier);

    return Math.floor(
      this.SCALING.baseBossHpPerPlayer *
      playerCount *
      ticketMultiplier *
      levelMultiplier
    );
  }

  calculateBossDamage(
    baseAttackDamage: number,
    averageLevel: number
  ): number {
    const levelMultiplier = 1 + (averageLevel * this.SCALING.damageScalingMultiplier);
    return Math.floor(baseAttackDamage * levelMultiplier);
  }

  // Get average level from players
  private getAverageLevel(players: Array<{id: string; level: number}>): number {
    if (players.length === 0) return 1;
    const totalLevel = players.reduce((sum, p) => sum + p.level, 0);
    return Math.floor(totalLevel / players.length);
  }
}
```

### Anti-Patterns to Avoid

- **Boolean state soup:** Don't add `isCharging`, `isCasting`, `isVulnerable` booleans. Use explicit FSM states instead.
- **Hardcoded boss logic:** Don't create separate classes with hardcoded attack sequences. Use data-driven patterns.
- **Inheritance hierarchies:** Don't create `BaseBoss` -> `AggressiveBoss` -> `BugHydra` chains. Use composition with strategies.
- **Client-side boss logic:** Don't implement boss AI on client. Server is authoritative, client only renders telegraphs.
- **Synchronous pattern execution:** Don't block the event loop with long attack sequences. Use async timers (existing pattern in CombatManager).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State machine library | Full XState integration | Simple enum-based FSM | XState is overkill for boss state complexity; adds 50kb+ bundle size |
| Behavior tree runtime | Unity-style behavior tree evaluator | Pattern-based action selection | Behavior trees are over-engineered for turn-based attack patterns |
| Animation timeline system | Custom animation sequencer | React Three Fiber + useFrame | R3F already provides animation primitives; don't duplicate |
| Threat decay timers | Manual setInterval per player | Single interval with batch decay | Prevents timer leak and scales better |

**Key insight:** The existing CombatManager already has good patterns for timed combat (attack loops, revival channels, down timers). Reuse those patterns for boss AI timing rather than building new systems.

## Common Pitfalls

### Pitfall 1: Boss State Machine Explosion

**What goes wrong:** Adding attack patterns as boolean flags (`isEnraged`, `isCharging`, `isCasting`) creates untestable combinatorial states. Boss can be "enraged AND charging AND vulnerable" simultaneously.

**Why it happens:** The current codebase uses `isEnraged` boolean (CombatManager.ts line 85). Adding more states as booleans is the path of least resistance.

**How to avoid:**
1. Implement explicit FSM from the start (Pattern 1)
2. Define valid state transitions explicitly
3. Store `currentState` and `previousState` only
4. Never add boolean state flags

**Warning signs:**
- Tests require setting 3+ booleans to verify one behavior
- Attack logic has nested if statements checking multiple booleans
- Boss exhibits "glitchy" behavior (attacks cancel mid-animation)

### Pitfall 2: Boss Pattern Predictability

**What goes wrong:** Boss attack patterns become too predictable. Players memorize the sequence and combat becomes rote execution.

**Why it happens:** Deterministic FSM transitions (e.g., "after 3 light attacks, always do heavy") are easy to implement but boring.

**How to avoid:**
1. Use weighted random selection from available patterns (Pattern 3)
2. Include multiple patterns per phase with different weights
3. Add conditional triggers that change pattern availability
4. Avoid strict sequences except for signature moves

**Warning signs:**
- Players report "boss always does X after Y"
- Combat logs show identical attack sequences across multiple battles
- Boss feels less threatening after first encounter

### Pitfall 3: Telegraphing Too Subtle or Too Obvious

**What goes wrong:** Visual warnings are either invisible (players can't react) or too long (trivializes combat).

**Why it happens:** No playtesting feedback loop on telegraph timing and clarity.

**How to avoid:**
1. Use consistent timing: Light attacks = 0ms, Heavy = 1000ms, Special = 1500ms
2. Include both visual (particles, glow) AND text warnings
3. Make telegraph duration proportional to attack lethality
4. Test with players who haven't seen the boss before

**Warning signs:**
- Players report "unfair" damage (couldn't see it coming)
- Combat logs show zero deaths to telegraphed attacks (too easy to dodge)
- Players stand still during heavy attack telegraphs (not reacting)

**Industry standard:** Heavy attacks should have 1-1.5 second telegraphs with clear visual indicators. Source: [Enemy Attacks and Telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing)

### Pitfall 4: HP Phase Threshold Oscillation

**What goes wrong:** Boss HP hovers around phase threshold (e.g., 66%). Phase transitions trigger repeatedly, causing janky behavior.

**Why it happens:** Boss can be healed by minions or players, crossing threshold back and forth.

**How to avoid:**
1. Use hysteresis: Track `lastPhase` and only transition when HP crosses threshold by 5%
2. Make phase transitions one-way (can't go back to previous phase)
3. Emit `phase_transition` event once per phase

**Warning signs:**
- Boss rapidly switches between attack patterns
- Phase transition effects trigger multiple times
- Combat logs show phase 2 -> phase 1 -> phase 2 transitions

### Pitfall 5: Threat Table Memory Leaks

**What goes wrong:** Threat table grows unbounded as players join/leave. Old player IDs remain in threat table, consuming memory.

**Why it happens:** No cleanup when players disconnect or become ghosts.

**How to avoid:**
1. Clear threat entry when player leaves lobby
2. Clear threat entry when player becomes ghost (permanently downed)
3. Implement threat decay over time (Pattern 4)
4. Cap threat table size (max 20 entries)

**Warning signs:**
- Threat table size grows linearly with session time
- Memory usage increases in long-running lobbies
- Boss targets disconnected players

## Code Examples

Verified patterns from official sources:

### Telegraphing Visual Effects (React Three Fiber)

```typescript
// Source: React Three Fiber animation patterns
// https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations

import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';

interface TelegraphEffectProps {
  isActive: boolean;
  duration: number; // milliseconds
  effectType: 'charge' | 'glow' | 'shake';
}

function BossTelegraphEffect({ isActive, duration, effectType }: TelegraphEffectProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [startTime, setStartTime] = useState<number>(0);

  useFrame((state) => {
    if (!meshRef.current || !isActive) return;

    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    if (effectType === 'glow') {
      // Pulsing glow intensity
      const intensity = 0.5 + Math.sin(progress * Math.PI * 4) * 0.5;
      meshRef.current.material.emissive.setRGB(intensity, 0, 0);
    } else if (effectType === 'shake') {
      // Random position offset
      const amplitude = 0.1 * (1 - progress); // Decreases over time
      meshRef.current.position.x += (Math.random() - 0.5) * amplitude;
      meshRef.current.position.y += (Math.random() - 0.5) * amplitude;
    } else if (effectType === 'charge') {
      // Scale up over time
      const scale = 1 + progress * 0.5;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  // Reset when telegraph starts
  if (isActive && startTime === 0) {
    setStartTime(Date.now());
  }

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color="red" emissive="red" emissiveIntensity={0} />
    </mesh>
  );
}
```

### State Machine Implementation (TypeScript)

```typescript
// Source: TypeScript state machine patterns
// https://kbravh.dev/state-machine-in-typescript
// https://refactoring.guru/design-patterns/state/typescript/example

type BossState = 'idle' | 'telegraphing' | 'attacking' | 'recovering' | 'phase_transition';

interface StateTransition {
  from: BossState;
  to: BossState;
  condition?: (context: BattleContext) => boolean;
}

class BossStateMachine {
  private currentState: BossState = 'idle';
  private previousState: BossState = 'idle';
  private stateEnteredAt: number = Date.now();

  private readonly transitions: StateTransition[] = [
    { from: 'idle', to: 'telegraphing' },
    { from: 'idle', to: 'phase_transition' },
    { from: 'telegraphing', to: 'attacking' },
    { from: 'attacking', to: 'recovering' },
    { from: 'recovering', to: 'idle' },
    { from: 'phase_transition', to: 'idle' },
  ];

  canTransition(to: BossState, context?: BattleContext): boolean {
    return this.transitions.some(t =>
      t.from === this.currentState &&
      t.to === to &&
      (!t.condition || t.condition(context!))
    );
  }

  transitionTo(newState: BossState, context?: BattleContext): boolean {
    if (!this.canTransition(newState, context)) {
      console.warn(`Invalid transition from ${this.currentState} to ${newState}`);
      return false;
    }

    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateEnteredAt = Date.now();
    return true;
  }

  getCurrentState(): BossState {
    return this.currentState;
  }

  getStateElapsedMs(): number {
    return Date.now() - this.stateEnteredAt;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Random attack selection | Pattern-based with weights | Industry shift 2020-2024 | More engaging, less predictable boss fights |
| Boolean state flags | Explicit FSM with enums | TypeScript best practice | Type-safe, testable state management |
| Hardcoded boss behaviors | Data-driven strategies | Game design trend 2022+ | Easier tuning, designer-friendly |
| Telegraph = animation only | Multi-modal (visual + audio + text) | Accessibility trend 2023+ | More players can react to warnings |
| Fixed difficulty | Dynamic scaling | Live service games 2024+ | Better retention across skill levels |

**Deprecated/outdated:**
- **Inheritance-based boss hierarchies:** Replaced by composition + strategy pattern for flexibility
- **Client-predicted boss attacks:** Server authority prevents exploits, especially important for multiplayer
- **Fixed attack sequences:** Modern games use weighted probability for replayability

## Open Questions

1. **How many unique patterns per boss?**
   - What we know: Industry standard is 3-5 patterns per boss phase (9-15 total for 3 phases)
   - What's unclear: How many is too many for ScrumQuest's session length (30-60 min)?
   - Recommendation: Start with 3 patterns per phase (9 total). Add more if playtesting shows predictability issues.

2. **Should phase transitions be deterministic or have variance?**
   - What we know: Most games use fixed HP thresholds (66%, 33%)
   - What's unclear: Would random thresholds (60-70%, 25-35%) improve replayability?
   - Recommendation: Use fixed thresholds for v1.3. Consider variance in future if players report predictability.

3. **How should minion-spawning bosses (Bug Hydra) interact with existing spectator minion system?**
   - What we know: Spectators already spawn as minions in current combat system
   - What's unclear: Should boss-spawned minions use the same system or be separate?
   - Recommendation: Separate system. Boss minions are AI-controlled and temporary, spectator minions are player-controlled.

4. **Should boss difficulty scaling use team average level or highest player level?**
   - What we know: Average prevents power-leveling exploits, highest prevents one weak player from under-scaling
   - What's unclear: Which creates better experience for mixed-level teams?
   - Recommendation: Use average level with floor (minimum difficulty = level 3 equivalent). Prevents trivializing content.

## Sources

### Primary (HIGH confidence)
- [ScrumQuest codebase](file:///C:/Users/Preston/git/ScrumMonsters) - CombatManager.ts, gameEvents.ts, existing combat patterns
- [React Three Fiber Basic Animations](https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations) - Animation fundamentals
- [TypeScript State Machine Implementation](https://kbravh.dev/state-machine-in-typescript) - FSM patterns
- [Refactoring Guru: State Pattern](https://refactoring.guru/design-patterns/state/typescript/example) - State pattern examples
- [Refactoring Guru: Strategy Pattern](https://refactoring.guru/design-patterns/strategy/typescript/example) - Strategy pattern examples

### Secondary (MEDIUM confidence)
- [Using Behavior Trees to Create Retro Boss AI](https://www.gamedeveloper.com/programming/using-behavior-trees-to-create-retro-boss-ai) - Boss behavior patterns (verified with multiple game dev sources)
- [Enemy Attacks and Telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing) - Telegraph design patterns
- [Boss Battle Design and Structure](https://www.gamedeveloper.com/design/boss-battle-design-and-structure) - Multi-phase boss encounters
- [Designing a Multi-Phase Boss Encounter in Unity](https://medium.com/@scott.sourile/designing-a-multi-phase-boss-encounter-in-unity-pt-1-b06ed37aa3f0) - Phase transition patterns
- [Hate (video games) - Wikipedia](https://en.wikipedia.org/wiki/Hate_(video_games)) - Threat/aggro mechanics definition
- [Designing RPG Mechanics for Scalability](https://sinisterdesign.net/designing-rpg-mechanics-for-scalability/) - Difficulty scaling patterns
- [Dynamic game difficulty balancing - Wikipedia](https://en.wikipedia.org/wiki/Dynamic_game_difficulty_balancing) - DDA concepts

### Tertiary (LOW confidence)
- [Finite State Machine and Behavior Tree Fusion](https://medium.com/@abdullahahmetaskin/finite-state-machine-and-behavior-tree-fusion-3fcce33566) - Hybrid approaches (concept validation only)
- [FSM vs Behavior Trees](https://queenofsquiggles.github.io/guides/fsm-vs-bt/) - Pattern comparison (blog post)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing stack handles all requirements, no new dependencies
- Architecture: HIGH - Patterns verified against codebase + industry sources
- Pitfalls: HIGH - Based on codebase analysis + documented game dev anti-patterns

**Research date:** 2026-02-11
**Valid until:** 60 days (stable patterns, unlikely to change rapidly)

**Five existing boss types (verified from codebase):**
1. Bug Hydra (bug-hydra.png)
2. Sprint Demon (sprint-demon.png)
3. Deadline Dragon (deadline-dragon.png)
4. Technical Debt Golem (technical-debt-golem.png)
5. Scope Creep Beast (scope-creep-beast.png)

**Current combat capabilities to leverage:**
- Threat table tracking (selectThreatTarget, line 994)
- Attack timing with variance (scheduleNextAttack, line 1132)
- Telegraphing events (combat:boss_telegraph, line 1055)
- Enrage mechanics at 50% HP (line 517)
- AoE vs single target attacks (isAoEAttack, line 986)
- Difficulty scaling with ticketIndex (initializeCombat, line 392)
