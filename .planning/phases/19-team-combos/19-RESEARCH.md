# Phase 19: Team Combos - Research

**Researched:** 2026-02-11
**Domain:** Team coordination mechanics with class-based combo attacks and consensus-powered ultimates
**Confidence:** MEDIUM

## Summary

Phase 19 adds team synergy mechanics to reward player coordination. Two distinct systems activate team combos: (1) class-pair combos trigger when specific class combinations use abilities near-simultaneously, and (2) consensus ultimates activate when all players have voted, dealing bonus damage scaled to voting speed. This phase builds on Phase 18's ability system infrastructure and Phase 4's consensus detection, extending existing patterns rather than introducing new architecture.

**Existing foundation:** ScrumQuest has AbilityManager with cooldown tracking (Phase 18), EstimationManager with consensus detection and `estimation:full_consensus_reached` events (Phase 4), CombatManager with damage application and threat tracking (Phase 17), and Socket.IO real-time event broadcasting. The game already tracks team voting state, player classes, and ability usage timing. EventBus provides domain coordination, and React Three Fiber handles combat visuals.

**Primary recommendation:** Create ComboManager domain to detect class-pair ability sequences and emit combo events. Wire `estimation:full_consensus_reached` event to trigger consensus ultimate via CombatManager. Define combo configurations in `shared/comboTypes.ts` with class pair mappings, timing windows (2-3 seconds), and damage multipliers. Add visual feedback using existing R3F particle effects pattern. Store combo cooldowns in memory-only (no persistence needed for session-scoped state).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| EventBus | (existing) | Cross-domain combo coordination | CombatManager/EstimationManager already use EventBus pattern |
| Socket.IO | (existing) | Real-time combo notifications | All combat events use Socket.IO for client sync |
| React Three Fiber | (existing) | Combo visual effects | Consistent with Phase 18 ability effects |
| TypeScript | (existing) | Type-safe combo definitions | CLASS_ABILITY_CONFIGS pattern from Phase 18 |
| AbilityManager | (existing) | Ability usage tracking | Phase 18 already tracks ability timing per player |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CombatManager | (existing) | Damage application with combo multipliers | Apply bonus damage to boss when combos trigger |
| EstimationManager | (existing) | Consensus detection | Already emits `estimation:full_consensus_reached` for ultimate trigger |
| @react-three/drei | (existing) | Combo effect particles | Trail, Stars, Billboard for combo visuals |
| Zustand | (existing) | Client combo state | Track active combos and cooldowns in useGameStore |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Event-driven combo detection | Polling ability state | Events cleaner, existing pattern from ability:used events |
| Fixed combo damage | Voting speed scaling | Fixed simpler, but scaling rewards faster consensus (more engaging) |
| ComboManager domain | Extend AbilityManager | Separate domain cleaner separation of concerns, testable in isolation |
| Per-combo cooldowns | Global combo cooldown | Per-combo allows diverse tactical choices, not locked after one combo |

**Installation:**
```bash
# No new dependencies required - uses existing stack
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/
│   ├── ComboManager.ts              # NEW: Combo detection, cooldown tracking
│   ├── AbilityManager.ts            # EXISTING: Emit ability:used events with timing
│   ├── EstimationManager.ts         # EXISTING: Emit full_consensus_reached
│   └── CombatManager.ts             # MODIFY: Apply combo damage multipliers
shared/
├── comboTypes.ts                    # NEW: Combo definitions, timing windows
├── abilityTypes.ts                  # EXISTING: Ability definitions
└── gameEvents.ts                    # EXTEND: combo_triggered, consensus_ultimate events
client/
└── src/
    ├── lib/stores/
    │   └── useComboState.tsx        # NEW: Client combo tracking
    └── components/game/
        ├── ComboNotification.tsx    # NEW: Floating combo name display
        ├── ComboEffects.tsx         # NEW: Visual effect particles
        └── ConsensusUltimate.tsx    # NEW: Ultimate ability animation
```

### Pattern 1: Class-Pair Combo Detection

**What:** Detect when two specific classes use abilities within timing window, trigger combo effect
**When to use:** All class-pair combos (tank+healer, healer+DPS, etc.)
**Example:**
```typescript
// server/domains/ComboManager.ts
// Source: Adapted from fighting game combo detection patterns

import { ScopedEventBus } from '../events';
import type { AbilityUsedPayload } from '../events';
import { AvatarClass } from '../../shared/gameEvents';
import { CLASS_COMBOS, ComboDefinition, ComboTrigger } from '../../shared/comboTypes';

export interface ComboManagerDeps {
  eventBus: ScopedEventBus;
  combatManager: {
    applyComboMultiplier: (lobbyId: string, comboId: string, multiplier: number) => void;
  };
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
}

interface AbilityTimestamp {
  playerId: string;
  abilityId: string;
  timestamp: number;
  playerClass: AvatarClass;
}

interface ComboCooldown {
  comboId: string;
  startedAt: number;
  expiresAt: number;
}

export class ComboManager {
  // Track recent ability uses: Map<lobbyId, AbilityTimestamp[]>
  private recentAbilities = new Map<string, AbilityTimestamp[]>();

  // Track combo cooldowns: Map<lobbyId, Map<comboId, ComboCooldown>>
  private comboCooldowns = new Map<string, Map<string, ComboCooldown>>();

  private readonly ABILITY_WINDOW_MS = 3000; // 3 second window for combos
  private readonly CLEANUP_INTERVAL_MS = 5000; // Clean old timestamps every 5s

  private readonly eventBus: ScopedEventBus;
  private readonly deps: ComboManagerDeps;

  constructor(deps: ComboManagerDeps) {
    this.deps = deps;
    this.eventBus = deps.eventBus;

    // Subscribe to ability usage events
    this.eventBus.on('ability:used', this.handleAbilityUsed.bind(this));
  }

  /**
   * Handle ability usage - check for combo triggers
   */
  private handleAbilityUsed(payload: AbilityUsedPayload): void {
    const { lobbyId, playerId, abilityId } = payload;

    const playerClass = this.deps.getPlayerClass(lobbyId, playerId);
    if (!playerClass) return;

    // Add to recent abilities
    const timestamp: AbilityTimestamp = {
      playerId,
      abilityId,
      timestamp: Date.now(),
      playerClass,
    };

    if (!this.recentAbilities.has(lobbyId)) {
      this.recentAbilities.set(lobbyId, []);
    }
    const recentList = this.recentAbilities.get(lobbyId)!;
    recentList.push(timestamp);

    // Clean old timestamps (outside window)
    this.cleanOldTimestamps(lobbyId);

    // Check for combo triggers
    this.checkComboTriggers(lobbyId, timestamp);
  }

  /**
   * Check if recent ability usage triggers any combos
   */
  private checkComboTriggers(lobbyId: string, newAbility: AbilityTimestamp): void {
    const recentList = this.recentAbilities.get(lobbyId) || [];

    // Check each combo definition
    for (const combo of CLASS_COMBOS) {
      // Skip if combo on cooldown
      if (this.isComboOnCooldown(lobbyId, combo.id)) continue;

      // Check if combo conditions met
      if (this.isComboTriggered(combo, newAbility, recentList)) {
        this.triggerCombo(lobbyId, combo, newAbility.playerId);
      }
    }
  }

  /**
   * Check if combo conditions are met
   */
  private isComboTriggered(
    combo: ComboDefinition,
    newAbility: AbilityTimestamp,
    recentList: AbilityTimestamp[]
  ): boolean {
    const now = Date.now();

    // Filter abilities within window
    const validAbilities = recentList.filter(
      (a) => now - a.timestamp <= this.ABILITY_WINDOW_MS
    );

    // Check trigger conditions
    for (const trigger of combo.triggers) {
      if (this.checkTrigger(trigger, newAbility, validAbilities)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a single trigger condition is met
   */
  private checkTrigger(
    trigger: ComboTrigger,
    newAbility: AbilityTimestamp,
    validAbilities: AbilityTimestamp[]
  ): boolean {
    const { classA, classB, requireBothClasses } = trigger;

    // Count abilities from each class
    const classAAbilities = validAbilities.filter(
      (a) => a.playerClass === classA
    );
    const classBAbilities = validAbilities.filter(
      (a) => a.playerClass === classB
    );

    if (requireBothClasses) {
      // Both classes must have used abilities within window
      return classAAbilities.length > 0 && classBAbilities.length > 0;
    } else {
      // Either class can trigger (used for single-class ultimates)
      return classAAbilities.length > 0 || classBAbilities.length > 0;
    }
  }

  /**
   * Trigger combo effect
   */
  private triggerCombo(
    lobbyId: string,
    combo: ComboDefinition,
    triggeringPlayerId: string
  ): void {
    // Start cooldown
    this.startComboCooldown(lobbyId, combo.id, combo.cooldownMs);

    // Apply damage multiplier via CombatManager
    this.deps.combatManager.applyComboMultiplier(
      lobbyId,
      combo.id,
      combo.damageMultiplier
    );

    // Emit combo event
    this.eventBus.emit('combo:triggered', {
      lobbyId,
      comboId: combo.id,
      comboName: combo.name,
      triggeringPlayerId,
      damageMultiplier: combo.damageMultiplier,
    });
  }

  /**
   * Check if combo is on cooldown
   */
  private isComboOnCooldown(lobbyId: string, comboId: string): boolean {
    const lobbyCooldowns = this.comboCooldowns.get(lobbyId);
    if (!lobbyCooldowns) return false;

    const cooldown = lobbyCooldowns.get(comboId);
    if (!cooldown) return false;

    return Date.now() < cooldown.expiresAt;
  }

  /**
   * Start combo cooldown
   */
  private startComboCooldown(
    lobbyId: string,
    comboId: string,
    durationMs: number
  ): void {
    if (!this.comboCooldowns.has(lobbyId)) {
      this.comboCooldowns.set(lobbyId, new Map());
    }
    const lobbyCooldowns = this.comboCooldowns.get(lobbyId)!;

    lobbyCooldowns.set(comboId, {
      comboId,
      startedAt: Date.now(),
      expiresAt: Date.now() + durationMs,
    });
  }

  /**
   * Clean old timestamps outside combo window
   */
  private cleanOldTimestamps(lobbyId: string): void {
    const recentList = this.recentAbilities.get(lobbyId);
    if (!recentList) return;

    const now = Date.now();
    const filtered = recentList.filter(
      (a) => now - a.timestamp <= this.ABILITY_WINDOW_MS
    );

    this.recentAbilities.set(lobbyId, filtered);
  }

  /**
   * Reset combo state for lobby
   */
  public resetCombos(lobbyId: string): void {
    this.recentAbilities.delete(lobbyId);
    this.comboCooldowns.delete(lobbyId);
  }

  /**
   * Cleanup lobby state
   */
  public cleanupLobby(lobbyId: string): void {
    this.resetCombos(lobbyId);
  }
}
```

### Pattern 2: Consensus-Powered Ultimate

**What:** When all players vote, trigger team ultimate attack with damage scaled to voting speed
**When to use:** Full consensus reached during estimation phase
**Example:**
```typescript
// server/domains/ComboManager.ts (continued)
// Source: Adapted from existing consensus detection in EstimationManager

/**
 * Subscribe to consensus events during construction
 */
constructor(deps: ComboManagerDeps) {
  // ... existing code ...

  // Subscribe to consensus events
  this.eventBus.on(
    'estimation:full_consensus_reached',
    this.handleFullConsensus.bind(this)
  );
}

/**
 * Handle full consensus - trigger ultimate attack
 */
private handleFullConsensus(
  payload: { lobbyId: string; ticketId: string }
): void {
  const { lobbyId } = payload;

  // Check if consensus ultimate on cooldown
  const consensusComboId = 'consensus_ultimate';
  if (this.isComboOnCooldown(lobbyId, consensusComboId)) {
    // Already used consensus ultimate this ticket - skip
    return;
  }

  // Calculate damage multiplier based on voting speed
  const votingDuration = this.getVotingDuration(lobbyId);
  const multiplier = this.calculateConsensusMultiplier(votingDuration);

  // Start cooldown (one per ticket)
  this.startComboCooldown(lobbyId, consensusComboId, 999999); // Effectively permanent per ticket

  // Apply ultimate damage via CombatManager
  this.deps.combatManager.applyComboMultiplier(
    lobbyId,
    consensusComboId,
    multiplier
  );

  // Emit consensus ultimate event
  this.eventBus.emit('combo:consensus_ultimate', {
    lobbyId,
    damageMultiplier: multiplier,
    votingDurationMs: votingDuration,
  });
}

/**
 * Calculate consensus multiplier based on voting speed
 * Faster voting = higher multiplier (max 3.0x, min 1.5x)
 */
private calculateConsensusMultiplier(votingDurationMs: number): number {
  const MIN_MULTIPLIER = 1.5;
  const MAX_MULTIPLIER = 3.0;
  const FAST_VOTE_MS = 10000; // 10 seconds = max multiplier
  const SLOW_VOTE_MS = 60000; // 60 seconds = min multiplier

  // Clamp duration to range
  const clampedDuration = Math.max(
    FAST_VOTE_MS,
    Math.min(SLOW_VOTE_MS, votingDurationMs)
  );

  // Linear interpolation: faster = higher multiplier
  const ratio = (SLOW_VOTE_MS - clampedDuration) / (SLOW_VOTE_MS - FAST_VOTE_MS);
  const multiplier = MIN_MULTIPLIER + ratio * (MAX_MULTIPLIER - MIN_MULTIPLIER);

  return Math.round(multiplier * 100) / 100; // Round to 2 decimals
}

/**
 * Get voting duration for current estimation session
 */
private getVotingDuration(lobbyId: string): number {
  // This would need to be provided by EstimationManager
  // For now, assume tracked via EventBus timestamps
  // Could emit estimation:voting_duration event from EstimationManager
  return 30000; // Default 30 seconds for example
}
```

### Pattern 3: Combo Configuration

**What:** Define class combinations, timing windows, and damage multipliers in shared types
**When to use:** All combo definitions (class-pair and consensus)
**Example:**
```typescript
// shared/comboTypes.ts
// Source: Inspired by combo systems in fighting games and MOBAs

import { AvatarClass } from './gameEvents';

/**
 * Combo trigger condition
 */
export interface ComboTrigger {
  classA: AvatarClass;
  classB: AvatarClass;
  requireBothClasses: boolean; // True: both must cast, False: either can cast
  windowMs?: number; // Optional override for combo window (default 3000ms)
}

/**
 * Combo definition
 */
export interface ComboDefinition {
  id: string;
  name: string;
  description: string;
  triggers: ComboTrigger[];
  damageMultiplier: number; // e.g., 1.5x = 50% bonus damage
  cooldownMs: number;
  visualEffect: string; // Effect identifier for client rendering
}

/**
 * Class-pair combos triggered by coordinated ability usage
 */
export const CLASS_COMBOS: ComboDefinition[] = [
  // ========== TANK + HEALER COMBOS ==========
  {
    id: 'shield_wall',
    name: 'Shield Wall',
    description: 'Tank and healer combine defenses for massive party protection',
    triggers: [
      { classA: 'warrior', classB: 'cleric', requireBothClasses: true },
      { classA: 'paladin', classB: 'bard', requireBothClasses: true },
    ],
    damageMultiplier: 1.3, // +30% damage for coordination
    cooldownMs: 30000, // 30 seconds
    visualEffect: 'shield_barrier',
  },

  // ========== HEALER + DPS COMBOS ==========
  {
    id: 'blessed_strike',
    name: 'Blessed Strike',
    description: 'Healer buffs empower DPS abilities with holy damage',
    triggers: [
      { classA: 'cleric', classB: 'sorcerer', requireBothClasses: true },
      { classA: 'bard', classB: 'ranger', requireBothClasses: true },
    ],
    damageMultiplier: 1.5, // +50% damage
    cooldownMs: 25000, // 25 seconds
    visualEffect: 'holy_flames',
  },

  // ========== TANK + DPS COMBOS ==========
  {
    id: 'crushing_assault',
    name: 'Crushing Assault',
    description: 'Tank opens enemy defenses, DPS delivers devastating blow',
    triggers: [
      { classA: 'warrior', classB: 'rogue', requireBothClasses: true },
      { classA: 'oathbreaker', classB: 'monk', requireBothClasses: true },
    ],
    damageMultiplier: 1.6, // +60% damage
    cooldownMs: 20000, // 20 seconds
    visualEffect: 'shatter_impact',
  },

  // ========== DPS + DPS COMBOS ==========
  {
    id: 'elemental_fury',
    name: 'Elemental Fury',
    description: 'Combined spellcasting creates explosive magical reaction',
    triggers: [
      { classA: 'sorcerer', classB: 'wizard', requireBothClasses: true },
    ],
    damageMultiplier: 1.7, // +70% damage (high risk, high reward)
    cooldownMs: 35000, // 35 seconds (powerful, longer cooldown)
    visualEffect: 'arcane_explosion',
  },

  // ========== MULTI-CLASS COMBOS ==========
  {
    id: 'perfect_synergy',
    name: 'Perfect Synergy',
    description: 'Three different roles combine for ultimate coordination',
    triggers: [
      // Tank + Healer + DPS (any combination)
      { classA: 'warrior', classB: 'cleric', requireBothClasses: true },
      { classA: 'warrior', classB: 'sorcerer', requireBothClasses: true },
    ],
    damageMultiplier: 2.0, // +100% damage (requires 3+ players coordinating)
    cooldownMs: 45000, // 45 seconds (very powerful)
    visualEffect: 'divine_storm',
  },
];

/**
 * Event payload for combo triggered
 */
export interface ComboTriggeredPayload {
  lobbyId: string;
  comboId: string;
  comboName: string;
  triggeringPlayerId: string;
  damageMultiplier: number;
}

/**
 * Event payload for consensus ultimate
 */
export interface ConsensusUltimatePayload {
  lobbyId: string;
  damageMultiplier: number;
  votingDurationMs: number;
}
```

### Pattern 4: Combo Visual Effects

**What:** Show combo name, damage multiplier, and visual particle effects when combo triggers
**When to use:** All combo activations (both class-pair and consensus)
**Example:**
```tsx
// client/src/components/game/ComboNotification.tsx
// Source: Adapted from Phase 15 floating XP numbers pattern

import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';

interface ComboNotificationProps {
  comboName: string;
  multiplier: number;
  onComplete: () => void;
}

export function ComboNotification({
  comboName,
  multiplier,
  onComplete,
}: ComboNotificationProps) {
  const [visible, setVisible] = useState(true);

  // Animate upward with fade
  const { position, opacity } = useSpring({
    from: { position: [0, 0, 0] as [number, number, number], opacity: 1 },
    to: { position: [0, 2, 0] as [number, number, number], opacity: 0 },
    config: { duration: 2000 },
    onRest: () => {
      setVisible(false);
      onComplete();
    },
  });

  if (!visible) return null;

  return (
    <animated.group position={position}>
      <Html center>
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: '3px solid gold',
            borderRadius: '12px',
            padding: '16px 24px',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '24px',
            textAlign: 'center',
            textShadow: '0 0 10px rgba(0, 0, 0, 0.8)',
            boxShadow: '0 0 20px rgba(102, 126, 234, 0.6)',
            opacity,
            minWidth: '200px',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>
            {comboName}!
          </div>
          <div style={{ fontSize: '20px', color: '#ffd700' }}>
            {multiplier.toFixed(1)}x Damage
          </div>
        </div>
      </Html>
    </animated.group>
  );
}
```

### Anti-Patterns to Avoid

- **Client-only combo detection:** Always validate combos on server to prevent cheating via manipulated ability timestamps
- **Combo damage stacking:** Only one combo active at a time; subsequent combos override, don't multiply (prevents exponential scaling)
- **Consensus ultimate spam:** One consensus ultimate per ticket; don't allow re-triggering on discussion vote changes
- **Overly complex class requirements:** Keep combos to 2-3 classes max; 5+ class combos impossible to coordinate in practice
- **Fixed combo windows:** Allow tuning combo timing window (3s default) per combo for balance
- **Combo tracking without cleanup:** Clean old ability timestamps regularly to prevent memory leaks in long battles

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combo timing detection | Custom time-window tracker | Filter + timestamp comparison | Simpler, existing Date.now() pattern from cooldowns |
| Consensus voting speed | Custom timer calculation | EstimationManager votingStartedAt timestamp | Already tracked, reuse existing data |
| Combo visual effects | Custom particle system | @react-three/drei Trail/Stars + Html | Battle-tested, optimized, consistent with ability effects |
| Damage multiplier application | Direct boss HP manipulation | CombatManager.applyComboMultiplier() | Centralized damage logic, threat tracking intact |

**Key insight:** Combo systems are fundamentally event correlation problems. The hard part isn't detecting timing windows (filter arrays by timestamp), it's tuning combo conditions and damage multipliers to feel impactful without being mandatory. Use data-driven configuration (CLASS_COMBOS array) to enable rapid iteration without code changes.

## Common Pitfalls

### Pitfall 1: Combo Timing Window Too Strict
**What goes wrong:** Players coordinate abilities perfectly but combo doesn't trigger due to 1-2 second timing mismatch
**Why it happens:** Network latency + player reaction time makes sub-2s windows feel impossible
**How to avoid:**
  - Default 3-second window gives room for lag and coordination
  - Show ability usage indicators to teammates (floating icons above heads)
  - Allow tuning combo windows per combo (some can be tighter than others)
  - Test with 200ms+ latency to ensure combos still triggerable
**Warning signs:** Players report "combo never triggers", forum complaints about "broken combos"

### Pitfall 2: Consensus Ultimate Feels Unrewarding
**What goes wrong:** Consensus ultimate triggers but damage boost so small players don't notice
**Why it happens:** Multiplier tuned too conservatively (1.1x vs 3.0x range)
**How to avoid:**
  - Minimum 1.5x multiplier even for slow voting (50% bonus noticeable)
  - Maximum 3.0x for fast voting (triple damage feels epic)
  - Show big visual effect (screen shake, boss stagger animation)
  - Display damage multiplier prominently in UI (floating text, announcement)
**Warning signs:** Players ask "did consensus ultimate work?", no chat excitement about ultimates

### Pitfall 3: Combo Cooldowns Too Long
**What goes wrong:** Combo triggers once at battle start, never again in 3-minute fight
**Why it happens:** Cooldown tuned for PvP balance, but PvE fights longer
**How to avoid:**
  - Base cooldowns on average battle duration (30-45s for 3min fights)
  - Allow 2-3 combo triggers per encounter minimum
  - Consensus ultimate one-per-ticket (special case, not cooldown-based)
  - Test with realistic battle timings, not theoretical DPS
**Warning signs:** Combo mechanic feels "one and done", players forget combos exist mid-fight

### Pitfall 4: Class Combinations Don't Match Team Composition
**What goes wrong:** Lobby has 3 tanks, 1 healer, 1 DPS; all combos require 2+ DPS
**Why it happens:** Combo definitions assume balanced party (2-2-2 role split)
**How to avoid:**
  - Define combos for ALL class pair combinations (tank+tank, healer+healer, etc.)
  - Ensure every class can participate in at least 2-3 different combos
  - Test with imbalanced compositions (all DPS, no healers, etc.)
  - Fallback: Consensus ultimate always available regardless of classes
**Warning signs:** Certain lobbies never see combos trigger, class segregation complaints

### Pitfall 5: Combo Visuals Obscure Combat UI
**What goes wrong:** Huge combo explosion effect covers boss health bar, player can't see HP
**Why it happens:** Visual feedback over-designed for "epic" feel
**How to avoid:**
  - Combo effects positioned above boss, not center-screen
  - 2-second duration max (not 5+ seconds)
  - Semi-transparent particles (don't block UI)
  - Critical info (boss HP, ability cooldowns) always visible during effects
  - Test with multiple combos triggering rapidly (edge case but possible)
**Warning signs:** Players disable effects, complaints about "can't see anything"

## Code Examples

### Common Operation 1: Wire ComboManager to Ability Events
```typescript
// server/websocket.ts
// Source: Adapted from existing AbilityManager wiring

// During initialization
const comboManager = new ComboManager({
  eventBus,
  combatManager,
  getPlayerClass: (lobbyId, playerId) => {
    const lobby = gameState.lobbies.get(lobbyId);
    const player = lobby?.players.find((p) => p.id === playerId);
    return player?.avatarClass ?? null;
  },
});

// ComboManager automatically subscribes to ability:used events
// No additional socket handlers needed - fully event-driven
```

### Common Operation 2: Client Combo Notification Display
```tsx
// client/src/components/game/phases/BattlePhase.tsx
// Source: Pattern from existing XP floating numbers

import { ComboNotification } from '../ComboNotification';

export function BattlePhase() {
  const [activeCombo, setActiveCombo] = useState<{
    name: string;
    multiplier: number;
  } | null>(null);

  useEffect(() => {
    const handleComboTriggered = (data: {
      comboName: string;
      damageMultiplier: number;
    }) => {
      setActiveCombo({
        name: data.comboName,
        multiplier: data.damageMultiplier,
      });
    };

    socket.on('combo:triggered', handleComboTriggered);
    socket.on('combo:consensus_ultimate', (data) => {
      setActiveCombo({
        name: 'Consensus Ultimate',
        multiplier: data.damageMultiplier,
      });
    });

    return () => {
      socket.off('combo:triggered', handleComboTriggered);
      socket.off('combo:consensus_ultimate');
    };
  }, [socket]);

  return (
    <Canvas>
      {/* Battle scene */}
      {activeCombo && (
        <ComboNotification
          comboName={activeCombo.name}
          multiplier={activeCombo.multiplier}
          onComplete={() => setActiveCombo(null)}
        />
      )}
    </Canvas>
  );
}
```

### Common Operation 3: Apply Combo Damage Multiplier
```typescript
// server/domains/CombatManager.ts
// Source: New method for ComboManager integration

/**
 * Apply combo damage multiplier to boss
 * Called by ComboManager when combo triggers
 */
public applyComboMultiplier(
  lobbyId: string,
  comboId: string,
  multiplier: number
): void {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState || !combatState.boss) return;

  const boss = combatState.boss;
  const bossAI = this.bossAIs.get(lobbyId);

  // Calculate bonus damage based on multiplier
  // Base: 50 damage * 1.5x = 75 damage (25 bonus)
  const baseDamage = 100; // Fixed base damage for combos
  const totalDamage = Math.floor(baseDamage * multiplier);

  // Apply damage to boss
  boss.hp = Math.max(0, boss.hp - totalDamage);

  // Update boss AI phase if HP threshold crossed
  if (bossAI) {
    const currentPhase = this.determineBossPhase(boss.hp, boss.maxHp);
    if (currentPhase !== boss.currentPhase) {
      boss.currentPhase = currentPhase;
      bossAI.transitionToPhase(currentPhase);

      this.eventBus.emit('combat:boss_phase_changed', {
        lobbyId,
        oldPhase: boss.currentPhase,
        newPhase: currentPhase,
        currentHp: boss.hp,
        maxHp: boss.maxHp,
      });
    }
  }

  // Emit damage event
  this.eventBus.emit('combat:combo_damage_dealt', {
    lobbyId,
    comboId,
    damage: totalDamage,
    multiplier,
    bossHp: boss.hp,
    bossMaxHp: boss.maxHp,
  });

  // Check if boss defeated
  if (boss.hp <= 0) {
    this.handleBossDefeated(lobbyId);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual combo input sequences (SF2) | Timing-based ability coordination | MOBAs (2010+) | More team-focused, less mechanical execution |
| Fixed combo damage | Dynamic scaling (voting speed, player count) | Modern RPGs (2020+) | Rewards coordination quality, not just triggering |
| Hidden combo discovery | Explicit combo UI with requirements | Fighting games (2015+) | Accessibility, less frustration |
| Global combo cooldown | Per-combo independent cooldowns | MOBAs Season 5+ (2015) | More tactical variety, skill expression |
| Combos mandatory for success | Combos optional but powerful | Modern design (2020+) | New player accessibility without removing depth |

**Deprecated/outdated:**
- **Combo memorization:** Modern games show requirements in UI, no hidden tech
- **Client-authoritative timing:** Always server-authoritative in 2026 to prevent cheating
- **Unlimited combo chains:** Cooldowns prevent infinite loops, balance power spikes

## Open Questions

1. **Should combo damage count toward player XP?**
   - What we know: Phase 15 awards XP for boss damage (2 XP per damage point)
   - What's unclear: Do combo bonus damage points count for XP, or just base damage?
   - Recommendation: Count combo damage for XP. Rewards coordination with progression.

2. **Should combos persist across phase transitions?**
   - What we know: Boss has HP phases (>66%, 34-66%, <=33%)
   - What's unclear: Does combo cooldown reset on phase change, or persist?
   - Recommendation: Cooldowns persist. Phase change already rewards new attacks, don't double-reward.

3. **Should spectators see combo notifications?**
   - What we know: Spectators observe but don't participate
   - What's unclear: Show combo notifications to spectators for educational value?
   - Recommendation: Yes, show combos. Helps spectators learn coordination patterns.

4. **Should consensus ultimate scale with abstain votes?**
   - What we know: Players can vote "?" to abstain
   - What's unclear: If 2/5 players abstain, does ultimate still trigger? At full power?
   - Recommendation: Require all non-spectators to vote. Abstains don't block, but reduce multiplier slightly.

5. **Should combo cooldowns reset between tickets?**
   - What we know: Each ticket is a separate boss encounter
   - What's unclear: Do combo cooldowns carry over to next ticket?
   - Recommendation: Reset combos on new ticket. Fresh start per encounter feels fairer.

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis:**
  - `server/domains/AbilityManager.ts` - Ability usage tracking, cooldown patterns, ability:used events
  - `server/domains/EstimationManager.ts` - Consensus detection, estimation:full_consensus_reached event
  - `server/domains/CombatManager.ts` - Damage application, boss HP tracking
  - `server/events/eventTypes.ts` - Domain event definitions, EstimationVoteCastPayload
  - `client/src/components/game/phases/BattlePhase.tsx` - Combat UI structure
  - `.planning/phases/18-class-abilities/18-RESEARCH.md` - Ability system architecture

### Secondary (MEDIUM confidence)
- [The Design of Combos and Chains - Game Developer](https://www.gamedeveloper.com/design/the-design-of-combos-and-chains) - Combo system design principles
- [Game Design Patterns for Collaborative Player Interactions - DiGRA](http://www.digra.org/digital-library/publications/game-design-patterns-for-collaborative-player-interactions/) - Team coordination patterns
- [TypeScript Mixins: Examples and use cases - LogRocket](https://blog.logrocket.com/typescript-mixins-examples-and-use-cases/) - Class combination patterns in TypeScript
- [VFX Voice: VFX/Animation Industry 2026](https://vfxvoice.com/entering-2026-vfx-animation-industry-balances-uncertainty-and-opportunity/) - Real-time rendering and visual feedback trends
- [Visual Effects in Games - Pixune](https://pixune.com/blog/visual-effects-in-games/) - VFX for gameplay feedback and event signaling

### Tertiary (LOW confidence)
- [How Incentives Shape Modern Game Design 2025 - Armería Chema y Mirabueno](https://chema.armeriamirabueno.com/how-incentives-shape-modern-game-design-2025/) - Reward system design
- [Best Action Combat MMORPGs in 2025 - MMORPG.GG](https://mmorpg.gg/best-action-combat-mmorpgs/) - Combat combo mechanics in modern MMOs
- WebSearch results for multiplayer game team combo systems (general patterns, no 2026-specific findings)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All required libraries exist in project (EventBus, Socket.IO, R3F)
- Architecture: HIGH - ComboManager pattern mirrors AbilityManager structure from Phase 18
- Event integration: HIGH - estimation:full_consensus_reached already exists, ability:used already emitted
- Combo detection: MEDIUM - Timing window logic straightforward, but requires testing for edge cases
- Visual feedback: MEDIUM - R3F particle patterns exist, but combo-specific designs need iteration
- Balance tuning: LOW - Combo damage multipliers, cooldowns, and timing windows require extensive playtesting

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable domain with proven event patterns)
