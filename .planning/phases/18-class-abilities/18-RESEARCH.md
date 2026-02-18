# Phase 18: Class Abilities - Research

**Researched:** 2026-02-11
**Domain:** Class ability system with cooldown timers, role-based effects, server-authoritative validation
**Confidence:** HIGH

## Summary

Phase 18 adds class-specific abilities to combat with cooldown management. Each avatar class gains 1-2 unique abilities that reflect their role (tank: taunt/shield, healer: heal/buff, DPS: damage/debuff). Abilities are gated by mastery tier (Phase 16) and enforce server-side cooldown timers to prevent spam and ensure fair play. Players see ability buttons with visual cooldown indicators during combat.

**Existing foundation:** ScrumQuest has ClassMasteryManager with ability definitions (Phase 16), CombatManager with class-based damage/healing (Phase 4), BossAI with threat tables (Phase 17), Socket.IO real-time events, and React Three Fiber 3D combat UI. Phase 16 defined CLASS_ABILITIES with 20 ability definitions (2 per class), mastery tier gating (Expert/Master), and CombatManager.canUseClassAbility() check. Combat already handles click-to-attack, healing, and revival with server validation.

**Primary recommendation:** Create AbilityManager domain to track cooldowns per player per ability. Extend Socket.IO events with use_ability client event and ability_used/ability_cooldown_started server events. Add ability buttons to BattlePhase UI with visual cooldown overlays using CSS radial gradients. Apply ability effects through existing CombatManager methods (damage, healing, buffs). Store cooldown state in memory-only (no persistence needed for session-scoped cooldowns).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Socket.IO | (existing) | Ability activation events | Real-time combat already uses Socket.IO for attacks/heals |
| EventBus | (existing) | Cross-domain ability coordination | CombatManager/ClassMasteryManager event pattern |
| React Three Fiber | (existing) | 3D ability visual effects | All combat visuals use R3F for consistency |
| CSS radial-gradient | (existing) | Cooldown progress indicators | Browser-native, no dependencies, smooth animations |
| TypeScript | (existing) | Type-safe ability definitions | CLASS_ABILITIES already defined in shared/classMasteryTypes.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useFrame (R3F) | (existing) | Cooldown timer ticks | Smooth 60fps countdown animations without React re-renders |
| Zustand | (existing) | Client ability state | useGameStore pattern for ability cooldowns |
| @react-three/drei | (existing) | Ability effect particles | Html, Billboard for floating ability names |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server cooldown tracking | Client-only timers | Server authority prevents cheating but adds network latency |
| CSS radial-gradient | Canvas arc drawing | CSS simpler, performs better, no manual animation loop |
| Memory-only cooldowns | Database persistence | Cooldowns session-scoped; persistence adds complexity for no benefit |
| AbilityManager domain | Extend CombatManager | Separate manager cleaner separation of concerns, testable in isolation |

**Installation:**
```bash
# No new dependencies required - uses existing stack
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/
│   ├── AbilityManager.ts           # NEW: Cooldown tracking, server validation
│   ├── CombatManager.ts            # MODIFY: Add ability effect methods
│   └── ClassMasteryManager.ts      # EXISTING: Ability unlock checks
shared/
├── classMasteryTypes.ts            # EXISTING: CLASS_ABILITIES definitions
├── abilityTypes.ts                 # NEW: Cooldown config, effect types
└── gameEvents.ts                   # EXTEND: use_ability, ability_used events
client/
└── src/
    ├── lib/stores/
    │   └── useAbilities.tsx        # NEW: Client cooldown state
    └── components/game/
        ├── AbilityBar.tsx          # NEW: Ability buttons with cooldowns
        ├── AbilityButton.tsx       # NEW: Single ability button component
        └── AbilityEffects.tsx      # NEW: Visual effect particles
```

### Pattern 1: Server-Authoritative Cooldown System

**What:** Client requests ability use, server validates cooldown and applies effect, broadcasts to all clients
**When to use:** All ability activations to prevent cheating and ensure consistency
**Example:**
```typescript
// server/domains/AbilityManager.ts
// Source: Adapted from [authoritative server architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html)

export interface AbilityManagerDeps {
  eventBus: ScopedEventBus;
  combatManager: CombatManager;
  classMasteryManager: ClassMasteryManager;
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
}

interface CooldownState {
  abilityId: string;
  startedAt: number;
  durationMs: number;
  expiresAt: number;
}

export class AbilityManager {
  // State: Map<lobbyId, Map<playerId, Map<abilityId, CooldownState>>>
  private cooldowns = new Map<string, Map<string, Map<string, CooldownState>>>();

  constructor(private deps: AbilityManagerDeps) {}

  /**
   * Player attempts to use an ability
   * Server validates: mastery tier, cooldown, combat state
   */
  public useAbility(
    lobbyId: string,
    playerId: string,
    abilityId: string
  ): { success: boolean; error?: string } {
    // 1. Validate player is in combat
    const combatState = this.deps.combatManager.getCombatState(lobbyId);
    if (!combatState) {
      return { success: false, error: 'Combat not active' };
    }

    const playerState = combatState.players.get(playerId);
    if (!playerState || playerState.combatState !== 'fighting') {
      return { success: false, error: 'Player not in combat' };
    }

    // 2. Validate ability unlocked (mastery tier check)
    const playerClass = this.deps.getPlayerClass(lobbyId, playerId);
    if (!playerClass) {
      return { success: false, error: 'No class selected' };
    }

    const canUse = this.deps.combatManager.canUseClassAbility(
      lobbyId,
      playerId,
      abilityId
    );
    if (!canUse) {
      return { success: false, error: 'Ability not unlocked' };
    }

    // 3. Validate cooldown not active
    if (this.isOnCooldown(lobbyId, playerId, abilityId)) {
      const remaining = this.getRemainingCooldown(lobbyId, playerId, abilityId);
      return { success: false, error: `On cooldown (${remaining}s remaining)` };
    }

    // 4. Apply ability effect
    const abilityDef = this.getAbilityDefinition(playerClass, abilityId);
    if (!abilityDef) {
      return { success: false, error: 'Ability not found' };
    }

    this.applyAbilityEffect(lobbyId, playerId, playerClass, abilityDef);

    // 5. Start cooldown
    this.startCooldown(lobbyId, playerId, abilityId, abilityDef.cooldownMs);

    // 6. Emit events
    this.deps.eventBus.emit('ability:used', {
      lobbyId,
      playerId,
      abilityId,
      abilityName: abilityDef.name,
    });

    this.deps.eventBus.emit('ability:cooldown_started', {
      lobbyId,
      playerId,
      abilityId,
      durationMs: abilityDef.cooldownMs,
      expiresAt: Date.now() + abilityDef.cooldownMs,
    });

    return { success: true };
  }

  private isOnCooldown(
    lobbyId: string,
    playerId: string,
    abilityId: string
  ): boolean {
    const playerCooldowns = this.cooldowns.get(lobbyId)?.get(playerId);
    if (!playerCooldowns) return false;

    const cooldown = playerCooldowns.get(abilityId);
    if (!cooldown) return false;

    return Date.now() < cooldown.expiresAt;
  }

  private getRemainingCooldown(
    lobbyId: string,
    playerId: string,
    abilityId: string
  ): number {
    const playerCooldowns = this.cooldowns.get(lobbyId)?.get(playerId);
    const cooldown = playerCooldowns?.get(abilityId);
    if (!cooldown) return 0;

    const remaining = cooldown.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  private startCooldown(
    lobbyId: string,
    playerId: string,
    abilityId: string,
    durationMs: number
  ): void {
    if (!this.cooldowns.has(lobbyId)) {
      this.cooldowns.set(lobbyId, new Map());
    }
    const lobbyCooldowns = this.cooldowns.get(lobbyId)!;

    if (!lobbyCooldowns.has(playerId)) {
      lobbyCooldowns.set(playerId, new Map());
    }
    const playerCooldowns = lobbyCooldowns.get(playerId)!;

    playerCooldowns.set(abilityId, {
      abilityId,
      startedAt: Date.now(),
      durationMs,
      expiresAt: Date.now() + durationMs,
    });
  }
}
```

### Pattern 2: Role-Based Ability Effects

**What:** Tank abilities affect threat/defense, healer abilities heal/buff, DPS abilities damage/debuff
**When to use:** Apply effects in AbilityManager.applyAbilityEffect() based on ability type
**Example:**
```typescript
// server/domains/AbilityManager.ts
// Source: Adapted from existing CombatManager class roles and [MOBA skill archetypes](https://tvtropes.org/pmwiki/pmwiki.php/Analysis/MOBASkillAndItemArchetypes)

private applyAbilityEffect(
  lobbyId: string,
  playerId: string,
  playerClass: AvatarClass,
  abilityDef: AbilityDefinition
): void {
  const combatState = this.deps.combatManager.getCombatState(lobbyId);
  if (!combatState || !combatState.boss) return;

  switch (abilityDef.effectType) {
    case 'damage': {
      // DPS ability: High single-target or AoE damage
      const damage = abilityDef.power; // e.g., 100 for sorcerer fireball
      this.deps.combatManager.applyAbilityDamageToBoss(
        lobbyId,
        playerId,
        damage
      );
      break;
    }

    case 'heal': {
      // Healer ability: Enhanced healing or party-wide heal
      const healAmount = abilityDef.power; // e.g., 50 for cleric greater heal
      const targets = this.getHealTargets(lobbyId, abilityDef.targetType);
      for (const targetId of targets) {
        this.deps.combatManager.applyHealToPlayer(
          lobbyId,
          playerId,
          targetId,
          healAmount
        );
      }
      break;
    }

    case 'buff': {
      // Support ability: Damage buff, speed boost
      const buffDurationMs = 10000; // 10 seconds
      this.applyBuff(lobbyId, playerId, abilityDef.buffType, buffDurationMs);
      break;
    }

    case 'taunt': {
      // Tank ability: Force boss to target this player
      const boss = combatState.boss;
      const bossAI = this.deps.combatManager.getBossAI(lobbyId);
      if (bossAI) {
        // Add massive threat to force targeting
        bossAI.recordThreat(boss.threatTable, playerId, 'taunt', 500);
      }
      break;
    }

    case 'shield': {
      // Tank ability: Damage reduction or invulnerability
      const shieldDurationMs = 5000; // 5 seconds
      this.applyShield(lobbyId, playerId, abilityDef.power, shieldDurationMs);
      break;
    }

    case 'debuff': {
      // DPS ability: Reduce boss damage or defense
      const debuffDurationMs = 8000; // 8 seconds
      this.applyDebuff(lobbyId, 'boss', abilityDef.debuffType, debuffDurationMs);
      break;
    }
  }
}

// Targeting logic for abilities
private getHealTargets(
  lobbyId: string,
  targetType: 'self' | 'single' | 'party'
): string[] {
  const combatState = this.deps.combatManager.getCombatState(lobbyId);
  if (!combatState) return [];

  const fightingPlayers = Array.from(combatState.players.values())
    .filter(p => p.combatState === 'fighting')
    .map(p => p.playerId);

  if (targetType === 'party') {
    return fightingPlayers; // All fighting players
  }

  // For 'self' or 'single', return lowest HP player
  const sortedByHp = fightingPlayers.sort((a, b) => {
    const aHp = combatState.players.get(a)?.hp ?? 100;
    const bHp = combatState.players.get(b)?.hp ?? 100;
    return aHp - bHp;
  });

  return sortedByHp.slice(0, 1); // Single lowest-HP target
}
```

### Pattern 3: Ability Cooldown Configuration

**What:** Define cooldown durations, power levels, and effect types per ability
**When to use:** Extend CLASS_ABILITIES with gameplay tuning knobs
**Example:**
```typescript
// shared/abilityTypes.ts
// Source: Inspired by [cooldown design patterns](https://www.yanfly.moe/wiki/Skill_Cooldowns_(YEP)) and Phase 16 mastery definitions

export type AbilityEffectType =
  | 'damage'    // Deal damage to boss/minions
  | 'heal'      // Restore HP to allies
  | 'buff'      // Increase ally stats temporarily
  | 'debuff'    // Decrease enemy stats temporarily
  | 'taunt'     // Force boss targeting
  | 'shield';   // Damage reduction/invulnerability

export type AbilityTargetType =
  | 'self'      // Only caster
  | 'single'    // One ally/enemy
  | 'party'     // All allies
  | 'boss';     // Boss only

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  tier: MasteryTier;
  cooldownMs: number;       // NEW: Cooldown duration (e.g., 10000 = 10s)
  effectType: AbilityEffectType; // NEW: What the ability does
  targetType: AbilityTargetType; // NEW: Who/what it affects
  power: number;            // NEW: Damage/heal amount or buff strength
  buffType?: string;        // NEW: e.g., 'damage_boost', 'speed'
  debuffType?: string;      // NEW: e.g., 'attack_slow', 'defense_down'
}

// Example cooldown configurations by role
export const ABILITY_COOLDOWNS = {
  // Tank abilities: Short cooldowns (10-15s), moderate effects
  tank_short: 10000,   // Taunt (10s)
  tank_long: 20000,    // Shield (20s)

  // Healer abilities: Medium cooldowns (15-20s), high impact
  healer_short: 15000, // Single heal (15s)
  healer_long: 30000,  // Party heal (30s)

  // DPS abilities: Variable (10-25s), high damage
  dps_short: 10000,    // Quick attack (10s)
  dps_medium: 15000,   // Special attack (15s)
  dps_long: 25000,     // Ultimate (25s)
} as const;

// Extend CLASS_ABILITIES with cooldown data
export const CLASS_ABILITY_CONFIGS: Record<AvatarClass, {
  ability_1: AbilityDefinition;
  ability_2: AbilityDefinition;
}> = {
  warrior: {
    ability_1: {
      id: 'warrior_shield_bash',
      name: 'Shield Bash',
      description: 'Stun and damage combination attack',
      tier: 'Expert',
      cooldownMs: 15000, // 15 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 80, // Moderate damage with stun utility
    },
    ability_2: {
      id: 'warrior_berserker_rage',
      name: 'Berserker Rage',
      description: 'Massive damage boost for limited time',
      tier: 'Master',
      cooldownMs: 30000, // 30 seconds
      effectType: 'buff',
      targetType: 'self',
      power: 50, // +50% damage for 10 seconds
      buffType: 'damage_boost',
    },
  },
  cleric: {
    ability_1: {
      id: 'cleric_greater_heal',
      name: 'Greater Heal',
      description: 'Enhanced healing with increased power',
      tier: 'Expert',
      cooldownMs: 12000, // 12 seconds
      effectType: 'heal',
      targetType: 'single',
      power: 50, // Strong single-target heal
    },
    ability_2: {
      id: 'cleric_resurrection',
      name: 'Resurrection',
      description: 'Instant revive without channeling',
      tier: 'Master',
      cooldownMs: 45000, // 45 seconds (powerful utility)
      effectType: 'heal',
      targetType: 'single',
      power: 50, // Revive at 50% HP instantly
    },
  },
  sorcerer: {
    ability_1: {
      id: 'sorcerer_fireball',
      name: 'Fireball',
      description: 'Area of effect damage spell',
      tier: 'Expert',
      cooldownMs: 10000, // 10 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 100, // High burst damage
    },
    ability_2: {
      id: 'sorcerer_meteor_strike',
      name: 'Meteor Strike',
      description: 'Massive single-target damage',
      tier: 'Master',
      cooldownMs: 25000, // 25 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 200, // Very high damage, long cooldown
    },
  },
  // ... other classes
};
```

### Pattern 4: Client Cooldown Visualization (CSS Radial Gradient)

**What:** Use CSS conic-gradient to show cooldown progress as radial fill without React state updates
**When to use:** AbilityButton component cooldown overlay animation
**Example:**
```tsx
// client/src/components/game/AbilityButton.tsx
// Source: [React Three Fiber animation best practices](https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations) and CSS cooldown patterns

import React, { useEffect, useRef, useState } from 'react';
import { useAbilities } from '@/lib/stores/useAbilities';
import { AbilityDefinition } from '@shared/abilityTypes';

interface AbilityButtonProps {
  ability: AbilityDefinition;
  onActivate: (abilityId: string) => void;
  isUnlocked: boolean;
}

export function AbilityButton({ ability, onActivate, isUnlocked }: AbilityButtonProps) {
  const { getCooldownProgress, isOnCooldown } = useAbilities();
  const [progress, setProgress] = useState(0);
  const animationFrameRef = useRef<number>();

  // Smooth cooldown animation using requestAnimationFrame (not React state)
  useEffect(() => {
    const updateProgress = () => {
      const currentProgress = getCooldownProgress(ability.id);
      setProgress(currentProgress);

      if (currentProgress < 100) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [ability.id, getCooldownProgress]);

  const handleClick = () => {
    if (!isUnlocked || isOnCooldown(ability.id)) return;
    onActivate(ability.id);
  };

  return (
    <button
      className={`ability-button ${!isUnlocked ? 'locked' : ''} ${isOnCooldown(ability.id) ? 'on-cooldown' : ''}`}
      onClick={handleClick}
      disabled={!isUnlocked || isOnCooldown(ability.id)}
      title={`${ability.name}: ${ability.description}`}
    >
      {/* Ability icon/name */}
      <div className="ability-content">
        <span className="ability-name">{ability.name}</span>
      </div>

      {/* Cooldown overlay - CSS radial gradient */}
      {isOnCooldown(ability.id) && (
        <div
          className="cooldown-overlay"
          style={{
            background: `conic-gradient(
              rgba(0, 0, 0, 0.7) ${progress}%,
              transparent ${progress}%
            )`,
          }}
        />
      )}

      {/* Cooldown timer text */}
      {isOnCooldown(ability.id) && (
        <div className="cooldown-timer">
          {Math.ceil((100 - progress) * (ability.cooldownMs / 1000) / 100)}s
        </div>
      )}

      {/* Locked overlay */}
      {!isUnlocked && (
        <div className="locked-overlay">
          🔒
        </div>
      )}
    </button>
  );
}

// CSS (in component or globals)
// .ability-button {
//   position: relative;
//   width: 64px;
//   height: 64px;
//   border-radius: 8px;
//   background: rgba(0, 0, 0, 0.8);
//   border: 2px solid #4a90e2;
//   cursor: pointer;
//   transition: transform 0.1s;
// }
//
// .ability-button:hover:not(:disabled) {
//   transform: scale(1.05);
// }
//
// .cooldown-overlay {
//   position: absolute;
//   top: 0;
//   left: 0;
//   right: 0;
//   bottom: 0;
//   border-radius: 6px;
//   pointer-events: none;
// }
//
// .cooldown-timer {
//   position: absolute;
//   top: 50%;
//   left: 50%;
//   transform: translate(-50%, -50%);
//   font-size: 18px;
//   font-weight: bold;
//   color: white;
//   text-shadow: 0 0 4px black;
// }
```

### Anti-Patterns to Avoid

- **Client-only cooldown validation:** Always validate cooldowns on server to prevent cheating via browser DevTools manipulation
- **React state for every cooldown tick:** Use requestAnimationFrame for smooth 60fps countdown without triggering React re-renders
- **Database persistence for cooldowns:** Cooldowns are session-scoped, reset on lobby end. Persisting adds complexity for no benefit
- **Mixing ability state across domains:** AbilityManager owns cooldowns, CombatManager owns effects. Don't duplicate state
- **Global cooldowns affecting all abilities:** Each ability has independent cooldown timer for tactical variety
- **Abilities usable while downed/ghosted:** Validate player combatState === 'fighting' before allowing ability use

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cooldown timer animation | Custom Canvas/WebGL arc renderer | CSS conic-gradient | Browser-optimized, GPU-accelerated, no animation loop overhead |
| Server-client clock sync | Custom NTP-like time sync | Server-sent expiresAt timestamp | Simpler, existing pattern from countdown timers (Phase 4) |
| Ability effect particle systems | Custom particle engine | @react-three/drei Trail/Stars components | Battle-tested, optimized, consistent with existing effects |
| Threat table manipulation | Direct Map mutations | BossAI.recordThreat() API | Centralized threat logic, already used for damage/healing (Phase 17) |

**Key insight:** Cooldown systems are well-established game patterns. The hard part isn't the timer mechanics (requestAnimationFrame + expiresAt timestamps), it's balancing cooldown durations with ability power to create tactical depth without overwhelming new players. Use data-driven configuration (ABILITY_COOLDOWNS constants) to enable tuning without code changes.

## Common Pitfalls

### Pitfall 1: Client-Server Clock Drift Causes Cooldown Desync
**What goes wrong:** Client displays "ability ready" but server rejects use due to remaining 0.5s cooldown
**Why it happens:** Client system clock ahead of server, using Date.now() on both sides without sync
**How to avoid:**
  - Server sends `expiresAt` timestamp in ability_cooldown_started event
  - Client uses server-sent timestamp, not local Date.now()
  - Add 100ms buffer on client: show ready at `expiresAt - 100` to account for network latency
  - Existing pattern: Phase 4 countdown uses server `startedAt + durationMs` approach
**Warning signs:** Players report "ability says ready but doesn't work", frequent server rejection messages

### Pitfall 2: Ability Spam During Network Lag
**What goes wrong:** Player mashes ability button during lag spike, server receives 5 activate requests, applies effect 5 times
**Why it happens:** Client doesn't disable button until server confirms cooldown started
**How to avoid:**
  - Optimistic UI: Disable button immediately on click, before server response
  - Track "pending" state: button disabled while request in flight
  - Server idempotency: Reject duplicate ability use within same 100ms window
  - Rollback on server rejection: Re-enable button if server says "still on cooldown"
**Warning signs:** Ability effects trigger multiple times, players deal 5x damage from one button press

### Pitfall 3: Ability Buttons Clutter Small Screens
**What goes wrong:** 20 ability buttons (10 classes × 2 abilities) take up entire battle UI
**Why it happens:** Showing all possible abilities instead of current player's unlocked abilities
**How to avoid:**
  - Filter: Only show abilities for player's CURRENT class
  - Lock indicators: Show locked abilities grayed out with 🔒 icon
  - Max 2 buttons per player (ability_1 + ability_2)
  - Position: Bottom-right corner near XP bar, consistent with PlayerController attack controls
**Warning signs:** UI testing shows ability bar overlaps boss health, players can't see combat state

### Pitfall 4: Ability Effects Don't Match Role Expectations
**What goes wrong:** Tank ability "Shield Bash" does high damage but no defensive benefit
**Why it happens:** Ability effect implementation doesn't reflect class role fantasy
**How to avoid:**
  - Tank abilities MUST affect threat or defense (taunt, shield, damage reduction)
  - Healer abilities MUST heal or buff (greater heal, party heal, damage boost)
  - DPS abilities MUST deal damage or debuff (fireball, meteor, defense reduction)
  - Validate role consistency: sorcerer shouldn't have a healing ability
  - Existing pattern: CombatManager.getClassBaseDamage() already differentiates tank/healer/DPS damage
**Warning signs:** Players confused by ability names vs effects, class role balance complaints

### Pitfall 5: Master-Tier Abilities Mandatory for Success
**What goes wrong:** Novice/Expert players can't defeat bosses without Master-tier ultimate abilities
**Why it happens:** Ability power scaled too high, base combat insufficient
**How to avoid:**
  - Abilities are tactical bonuses, not mandatory DPS
  - Novice players with good estimation > Master players with poor estimation
  - Ability damage capped at ~20% of total boss damage (80% from click-to-attack)
  - Healer abilities enhance existing healing, don't replace revival system
  - Existing balance: Phase 16 mastery stat bonuses capped at 1.2x (20%) to avoid dominance
**Warning signs:** New players report "impossible to win", lobbies segregate by mastery tier

## Code Examples

### Common Operation 1: Handle Ability Activation from Client
```typescript
// server/websocket.ts
// Source: Adapted from existing attack_boss/heal_party handlers

socket.on('use_ability', ({ abilityId }: { abilityId: string }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  // Track activity for host transfer
  sessionManager.recordPlayerActivity(playerId);

  const lobby = sessionManager.getPlayerLobby(playerId);
  if (!lobby) {
    socket.emit('game_error', { message: 'Not in a lobby' });
    return;
  }

  // Validate combat phase
  if (lobby.gamePhase !== 'battle') {
    socket.emit('game_error', { message: 'Abilities only usable in battle phase' });
    return;
  }

  // Attempt ability use (server validates cooldown, mastery, combat state)
  const result = abilityManager.useAbility(lobby.id, playerId, abilityId);

  if (!result.success) {
    socket.emit('game_error', { message: result.error });
    return;
  }

  // Success - events already emitted by AbilityManager
  console.log(`Player ${playerId} used ability ${abilityId} in lobby ${lobby.id}`);
});
```

### Common Operation 2: Client Ability Button Click
```tsx
// client/src/components/game/AbilityBar.tsx
// Source: Pattern from existing BattlePhase.tsx combat controls

import React from 'react';
import { AbilityButton } from './AbilityButton';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useClassMastery } from '@/lib/stores/useClassMastery';
import { CLASS_ABILITY_CONFIGS } from '@shared/abilityTypes';

export function AbilityBar() {
  const { currentPlayer } = useGameState();
  const { emit } = useWebSocket();
  const { getMasteryTier } = useClassMastery();

  if (!currentPlayer?.avatar) return null;

  const playerClass = currentPlayer.avatar;
  const abilities = CLASS_ABILITY_CONFIGS[playerClass];
  const masteryTier = getMasteryTier(playerClass);

  const handleAbilityClick = (abilityId: string) => {
    emit('use_ability', { abilityId });
  };

  // Determine which abilities are unlocked based on mastery tier
  const ability1Unlocked = masteryTier === 'Expert' || masteryTier === 'Master';
  const ability2Unlocked = masteryTier === 'Master';

  return (
    <div className="ability-bar">
      <AbilityButton
        ability={abilities.ability_1}
        onActivate={handleAbilityClick}
        isUnlocked={ability1Unlocked}
      />
      <AbilityButton
        ability={abilities.ability_2}
        onActivate={handleAbilityClick}
        isUnlocked={ability2Unlocked}
      />
    </div>
  );
}
```

### Common Operation 3: Track Cooldown State in Client Store
```typescript
// client/src/lib/stores/useAbilities.tsx
// Source: Adapted from useProgression.tsx pattern (Phase 15)

import { create } from 'zustand';
import { useWebSocket } from './useWebSocket';
import { useEffect } from 'react';

interface CooldownState {
  abilityId: string;
  startedAt: number;
  expiresAt: number;
  durationMs: number;
}

interface AbilitiesState {
  cooldowns: Map<string, CooldownState>;
  startCooldown: (abilityId: string, durationMs: number, expiresAt: number) => void;
  isOnCooldown: (abilityId: string) => boolean;
  getCooldownProgress: (abilityId: string) => number; // 0-100%
  clearCooldowns: () => void;
}

export const useAbilities = create<AbilitiesState>((set, get) => ({
  cooldowns: new Map(),

  startCooldown: (abilityId, durationMs, expiresAt) => {
    set((state) => {
      const newCooldowns = new Map(state.cooldowns);
      newCooldowns.set(abilityId, {
        abilityId,
        startedAt: Date.now(),
        expiresAt,
        durationMs,
      });
      return { cooldowns: newCooldowns };
    });
  },

  isOnCooldown: (abilityId) => {
    const cooldown = get().cooldowns.get(abilityId);
    if (!cooldown) return false;
    return Date.now() < cooldown.expiresAt;
  },

  getCooldownProgress: (abilityId) => {
    const cooldown = get().cooldowns.get(abilityId);
    if (!cooldown) return 100; // Not on cooldown = 100% ready

    const elapsed = Date.now() - cooldown.startedAt;
    const progress = Math.min(100, (elapsed / cooldown.durationMs) * 100);
    return progress;
  },

  clearCooldowns: () => {
    set({ cooldowns: new Map() });
  },
}));

// Hook to listen for server cooldown events
export function useAbilitySync() {
  const { socket } = useWebSocket();
  const { startCooldown, clearCooldowns } = useAbilities();

  useEffect(() => {
    if (!socket) return;

    // Server confirms cooldown started
    socket.on('ability:cooldown_started', (data: {
      abilityId: string;
      durationMs: number;
      expiresAt: number;
    }) => {
      startCooldown(data.abilityId, data.durationMs, data.expiresAt);
    });

    // Clear cooldowns when leaving combat
    socket.on('combat:cleanup_complete', () => {
      clearCooldowns();
    });

    return () => {
      socket.off('ability:cooldown_started');
      socket.off('combat:cleanup_complete');
    };
  }, [socket, startCooldown, clearCooldowns]);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global cooldown affects all abilities | Per-ability independent cooldowns | WoW Classic → WoW Legion (2016) | More tactical variety, skill expression |
| Cooldown reset on death | Cooldowns persist through death | League of Legends (2012), Dota 2 (2013) | Death penalty more meaningful |
| Hidden cooldown timers | Always-visible numeric timers | Modern MOBAs (2010+) | Transparency, better decision-making |
| Cooldown reduction as flat seconds | CDR as percentage (10%, 20%, 40% cap) | League Season 3 (2013) | Easier to balance, scales better |
| Abilities unlock with levels | Abilities unlock with mastery/skill trees | Path of Exile (2013), WoW talents | Player agency, build diversity |

**Deprecated/outdated:**
- **Mana costs for abilities:** Modern games prefer cooldowns over resource management (simplicity)
- **Ability macros/automation:** Considered cheating in competitive games, enforce one action per click
- **Client-authoritative ability timing:** Always server-authoritative in 2026 to prevent cheating

## Open Questions

1. **Should cooldowns persist between tickets?**
   - What we know: Combat resets between tickets, new boss spawned
   - What's unclear: Do cooldowns carry over, or reset on new ticket?
   - Recommendation: Reset cooldowns on new ticket. Fresh start per boss encounter feels fairer.

2. **Should ability effects scale with player level or mastery tier?**
   - What we know: Phase 15 player level (1-50+), Phase 16 mastery tier (Novice/Expert/Master)
   - What's unclear: Fixed ability power, or scale with level/tier?
   - Recommendation: Fixed power for simplicity. Stat bonuses already scale with mastery (Phase 16).

3. **Should downed players keep cooldown timers running?**
   - What we know: Downed players can't use abilities (combatState !== 'fighting')
   - What's unclear: Does time spent downed count toward cooldown, or pause?
   - Recommendation: Cooldowns run during downed state. Death penalty shouldn't be too punishing.

4. **Should abilities be usable during revival channeling?**
   - What we know: Reviving takes 2.5s channel, damage interrupts
   - What's unclear: Can reviver use instant abilities without interrupting?
   - Recommendation: No abilities during revival. Revival already risky, keep focus single-task.

5. **Should spectators see ability cooldowns for active players?**
   - What we know: Spectators can't vote or fight, but observe
   - What's unclear: Show other players' cooldown timers in UI?
   - Recommendation: Yes, show cooldowns. Spectator mode educational, helps new players learn.

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis:**
  - `server/domains/CombatManager.ts` - Damage/healing patterns, class roles, HEALER_CLASSES constant
  - `server/domains/ClassMasteryManager.ts` - Ability unlock checks, mastery tier gating
  - `shared/classMasteryTypes.ts` - CLASS_ABILITIES definitions (20 abilities across 10 classes)
  - `client/src/components/game/phases/BattlePhase.tsx` - Combat UI structure, XPBar positioning
  - `client/src/components/game/PlayerController.tsx` - Existing key bindings (Space=jump, E=emote)
  - `server/websocket.ts` - Socket.IO event patterns (attack_boss, heal_party, revive_start)
  - `server/domains/boss-ai/BossAI.ts` - Threat table API, recordThreat() pattern

### Secondary (MEDIUM confidence)
- [Client-Server Game Architecture - Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html) - Authoritative server design
- [React Three Fiber: Basic Animations](https://docs.pmnd.rs/react-three-fiber/tutorials/basic-animations) - useFrame for cooldown ticks
- [100 Three.js Tips That Actually Improve Performance (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips) - Performance optimization
- [MOBA Skill And Item Archetypes - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Analysis/MOBASkillAndItemArchetypes) - Role-based ability design
- [Skill Cooldowns (YEP) - Yanfly.moe Wiki](https://www.yanfly.moe/wiki/Skill_Cooldowns_(YEP)) - Cooldown configuration patterns

### Tertiary (LOW confidence)
- General multiplayer game design patterns (WebSearch results for RPG ability systems)
- MOBA cooldown discussions (no specific 2026 developments found)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All required libraries exist in project (Socket.IO, R3F, Zustand)
- Architecture: HIGH - AbilityManager pattern mirrors ProgressionManager/ClassMasteryManager structure
- Cooldown system: HIGH - Authoritative server pattern well-established in existing codebase
- Role-based effects: MEDIUM - Framework clear, specific effect implementations need design iteration
- UI/UX design: MEDIUM - Button positioning and visual design needs user testing
- Ability balance: LOW - Cooldown durations and power values require extensive playtesting

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable domain with proven patterns)
