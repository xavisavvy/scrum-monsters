# Phase 4: CombatManager - Research

**Researched:** 2026-02-02
**Domain:** Real-Time Multiplayer Combat Systems, Boss Mechanics, Revival Systems, Threat-Based Targeting
**Confidence:** HIGH

## Summary

This research investigates extracting combat mechanics (boss health, player health tracking, revival system, threat-based targeting, damage modifiers) from the monolithic GameStateManager into a dedicated CombatManager domain. The current implementation in `gameState.ts` contains revival session tracking, boss attack logic, and player combat state mixed with session and estimation concerns across 2000+ lines.

The phase requirements are clear: implement CombatManager that subscribes to `estimation:vote_cast` events to trigger battle entry, manage mixed player states (some estimating, some fighting), handle threat-based boss attacks with variable timing and AoE mechanics, implement channel-based revival with interruption, and support boss death wait state when voting incomplete. The context decisions specify enrage at 50% HP, 10-second down timer with healer-only revival, click-to-attack damage dealing, and linear HP scaling with player count.

The standard approach for real-time multiplayer combat combines authoritative server state (client sends input, server validates and broadcasts), event-driven coordination via domain events (combat subscribes to estimation events), Map-based state tracking for dynamic player health/position management, and game loop patterns using Node.js timers for boss attack intervals with drift compensation. Modern multiplayer frameworks in 2026 emphasize explicit narrow mandates per layer (CombatManager owns HP tracking, SessionManager owns player membership), efficient state diffing for network synchronization, and independent domain cleanup to prevent memory leaks.

**Primary recommendation:** Use Map-based state for dynamic player health/positions, implement threat table tracking damage dealt per player for targeting decisions, use setTimeout with recursive calls for boss attack intervals (not setInterval), emit fine-grained combat:* domain events for coordination, subscribe to estimation:vote_cast to trigger battle entry, and maintain player state enum (estimating/fighting/downed/ghost) for mixed-state support.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js EventEmitter (native) | Node 18+ | EventBus for cross-domain coordination (Phase 1) | Already implemented in `server/events/EventBus.ts`, proven pattern |
| Node.js Timers (native) | Node 18+ | setTimeout for boss attack intervals, down timers, revival channels | Native module, recursive setTimeout better than setInterval for variable timing |
| TypeScript Maps | ES6+ | Player health tracking, threat table, revival sessions | O(1) operations for frequent mutations, better than Record for dynamic combat state |
| performance.now() | Native | High-resolution timing for modifier calculations | Compensates for timer drift in long battles, accurate elapsed time measurement |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing EventBus from Phase 1 | Current | Typed event coordination between domains | Subscribe to estimation:vote_cast, emit combat:* events |
| Existing SessionManager from Phase 2 | Current | Query player team/existence, listen to disconnection | Validate player actions, handle disconnected players in combat |
| Math.random() | Native | Boss attack target selection, AoE chance, minion spawns | Weighted randomness for threat-based targeting with variety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Map for player health | Record<string, number> | Record faster for static lookups but Map better for frequent add/remove during combat; players enter/leave battle dynamically |
| setTimeout (recursive) | setInterval with drift compensation | setInterval requires manual drift tracking; setTimeout naturally adapts to processing time, simpler for variable boss attack timing |
| Threat table tracking | Pure random targeting | Threat-based feels more game-like (rewards damage dealers), but random is simpler; user context specifies threat-based |
| Domain manager pattern | ECS (Entity Component System) | ECS better for complex game engines with many entity types, overkill for 3-domain system (Session/Estimation/Combat); domain manager matches existing Phases 2-3 pattern |
| Game loop library (node-gameloop) | Native setTimeout | Game loop libraries provide fixed timestep for physics, unnecessary for turn-style combat with discrete events; native timers sufficient |

**Installation:**
```bash
# No new dependencies needed for Phase 4
# All required infrastructure exists (Phase 1 EventBus, Phase 2 SessionManager, native Node.js)
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/                        # Domain managers
│   ├── SessionManager.ts           # Phase 2: Exists
│   ├── EstimationManager.ts        # Phase 3: Exists
│   └── CombatManager.ts            # THIS PHASE: New
├── events/                         # Phase 1: Exists
│   ├── EventBus.ts
│   ├── ScopedEventBus.ts
│   ├── eventTypes.ts               # Update: Add missing combat event types
│   └── index.ts
├── errors/                         # Typed exceptions
│   ├── SessionErrors.ts            # Phase 2: Exists
│   ├── EstimationErrors.ts         # Phase 3: Exists
│   └── CombatErrors.ts             # NEW: Combat validation errors
├── gameState.ts                    # MODIFY: Delegate combat methods to CombatManager
└── websocket.ts                    # MODIFY: Route attack/revival events to CombatManager
```

### Pattern 1: CombatManager with Threat-Based Boss AI
**What:** Domain manager tracking boss HP, player HP/positions, threat table for targeting, and boss attack timer
**When to use:** Extracting combat logic from GameStateManager
**Example:**
```typescript
// server/domains/CombatManager.ts
import { ScopedEventBus } from '../events';
import { TeamType, AvatarClass } from '../../shared/gameEvents';

interface ThreatEntry {
  playerId: string;
  threat: number; // Damage dealt recently
}

interface PlayerCombatState {
  playerId: string;
  hp: number;
  maxHp: number;
  isDowned: boolean;
  downedAt?: number;
  downTimerHandle?: NodeJS.Timeout;
  hasBeenRevived: boolean; // Track one-revive-per-fight limit
  combatState: 'fighting' | 'downed' | 'ghost';
  position?: { x: number; y: number };
}

interface BossCombatState {
  bossId: string;
  bossName: string;
  hp: number;
  maxHp: number;
  isEnraged: boolean; // At 50% HP
  attackTimerHandle?: NodeJS.Timeout;
  lastAttackAt: number;
  threatTable: Map<string, ThreatEntry>;
}

interface LobbyCombatState {
  lobbyId: string;
  boss?: BossCombatState;
  players: Map<string, PlayerCombatState>; // playerId -> state
  battleModifier: number;
  battleStartTime?: number;
  modifierIntervalHandle?: NodeJS.Timeout;
}

export class CombatManager {
  private combatStates = new Map<string, LobbyCombatState>();
  private revivalSessions = new Map<string, RevivalSession>(); // key: `${reviverId}:${targetId}`

  constructor(private eventBus: ScopedEventBus) {
    // Subscribe to estimation events to trigger battle entry
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));

    // Subscribe to session events to handle player lifecycle
    this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
    this.eventBus.on('session:lobby_destroyed', this.handleLobbyDestroyed.bind(this));
  }

  /**
   * Initialize combat state for a lobby (called when ticket starts)
   */
  initializeCombat(lobbyId: string, players: Array<{id: string; team: TeamType}>): void {
    const playerCount = players.filter(p => p.team !== 'spectators').length;

    const state: LobbyCombatState = {
      lobbyId,
      boss: {
        bossId: `boss_${Date.now()}`,
        bossName: 'Dungeon Boss', // Could vary by ticket difficulty
        hp: 1000 * playerCount, // Linear scaling per context
        maxHp: 1000 * playerCount,
        isEnraged: false,
        lastAttackAt: 0,
        threatTable: new Map(),
      },
      players: new Map(),
      battleModifier: 1.0,
    };

    // Initialize player combat states (all start estimating)
    for (const player of players) {
      if (player.team === 'spectators') continue;

      state.players.set(player.id, {
        playerId: player.id,
        hp: 100,
        maxHp: 100,
        isDowned: false,
        hasBeenRevived: false,
        combatState: 'fighting', // Will enter battle on first vote
      });
    }

    this.combatStates.set(lobbyId, state);

    this.eventBus.emit('combat:battle_initialized', {
      lobbyId,
      bossId: state.boss.bossId,
      bossMaxHp: state.boss.maxHp,
    });
  }

  /**
   * Handle vote cast - trigger battle entry for that player
   * Requirement: FLOW-02, FLOW-03 (players enter battle on vote)
   */
  private handleVoteCast(payload: { lobbyId: string; playerId: string; team: TeamType }): void {
    const state = this.combatStates.get(payload.lobbyId);
    if (!state || !state.boss) return;

    const player = state.players.get(payload.playerId);
    if (!player) return;

    // Player enters battle on first vote (transition from estimating to fighting)
    // Context: Short 1-2 second transition, avatar runs onto battlefield

    this.eventBus.emit('combat:player_entered_battle', {
      lobbyId: payload.lobbyId,
      playerId: payload.playerId,
      transitionDurationMs: 1500, // 1.5 second run animation
    });

    // Start boss attack timer on first player entry
    if (!state.battleStartTime) {
      state.battleStartTime = Date.now();
      this.startBossAttackLoop(payload.lobbyId);
      this.startModifierLoop(payload.lobbyId);
    }
  }

  /**
   * Boss attack loop with threat-based targeting
   * Context: Variable timing (random intervals), 2-3 attack types, occasional AoE
   */
  private startBossAttackLoop(lobbyId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state || !state.boss) return;

    const performAttack = () => {
      const state = this.combatStates.get(lobbyId);
      if (!state || !state.boss || state.boss.hp <= 0) return;

      // Check if boss is enraged (50% HP threshold)
      if (!state.boss.isEnraged && state.boss.hp <= state.boss.maxHp * 0.5) {
        state.boss.isEnraged = true;
        this.eventBus.emit('combat:boss_enraged', {
          lobbyId,
          message: 'Boss becomes enraged!',
        });
      }

      // Determine attack type (light/heavy/special)
      const attackType = this.selectAttackType(state.boss.isEnraged);

      // Occasional AoE (random chance, or minion spawn)
      const isAoE = Math.random() < (state.boss.isEnraged ? 0.25 : 0.15);

      if (isAoE) {
        this.performAoEAttack(lobbyId, attackType);
      } else {
        // Threat-based single-target attack
        const targetId = this.selectThreatTarget(state.boss.threatTable, state.players);
        if (targetId) {
          this.attackPlayer(lobbyId, targetId, attackType);
        }
      }

      // Schedule next attack with variable timing
      // Context: Variable timing between attacks (random intervals within a range)
      const baseInterval = state.boss.isEnraged ? 3000 : 5000; // Faster when enraged
      const variance = 0.3; // ±30% variance
      const nextAttackMs = baseInterval * (1 + (Math.random() * variance * 2 - variance));

      state.boss.attackTimerHandle = setTimeout(performAttack, nextAttackMs);
      state.boss.lastAttackAt = Date.now();
    };

    // Initial attack after 3 seconds (give players time to enter)
    state.boss.attackTimerHandle = setTimeout(performAttack, 3000);
  }

  /**
   * Select attack type based on enrage state
   * Context: 2-3 attack types with different damage values, telegraphing for big attacks
   */
  private selectAttackType(isEnraged: boolean): 'light' | 'heavy' | 'special' {
    const rand = Math.random();

    if (isEnraged) {
      // Enraged: more heavy/special attacks
      if (rand < 0.4) return 'light';
      if (rand < 0.75) return 'heavy';
      return 'special';
    } else {
      // Normal: mostly light/heavy
      if (rand < 0.6) return 'light';
      if (rand < 0.9) return 'heavy';
      return 'special';
    }
  }

  /**
   * Threat-based target selection
   * Context: Boss attacks players who dealt most damage recently
   */
  private selectThreatTarget(
    threatTable: Map<string, ThreatEntry>,
    players: Map<string, PlayerCombatState>
  ): string | null {
    // Filter to alive players
    const alivePlayers = Array.from(players.values())
      .filter(p => p.combatState === 'fighting');

    if (alivePlayers.length === 0) return null;

    // Sort by threat descending
    const threatEntries = Array.from(threatTable.entries())
      .filter(([playerId]) => players.get(playerId)?.combatState === 'fighting')
      .sort((a, b) => b[1].threat - a[1].threat);

    if (threatEntries.length === 0) {
      // No threat history, pick random alive player
      return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].playerId;
    }

    // Weighted random selection favoring high threat
    // 70% chance to attack highest threat, 20% second, 10% random
    const rand = Math.random();
    if (rand < 0.7 && threatEntries[0]) {
      return threatEntries[0][0];
    } else if (rand < 0.9 && threatEntries[1]) {
      return threatEntries[1][0];
    } else {
      return threatEntries[Math.floor(Math.random() * threatEntries.length)][0];
    }
  }

  /**
   * Player attacks boss (click-to-attack)
   * Context: No cooldown on clicks, spam allowed
   */
  playerAttackBoss(lobbyId: string, playerId: string, avatarClass: AvatarClass): void {
    const state = this.combatStates.get(lobbyId);
    if (!state || !state.boss) throw new CombatNotActiveError(lobbyId);

    const player = state.players.get(playerId);
    if (!player || player.combatState !== 'fighting') {
      throw new PlayerNotInCombatError(playerId);
    }

    // Calculate damage (base + modifier)
    const baseDamage = this.getClassBaseDamage(avatarClass);
    const damage = Math.floor(baseDamage * state.battleModifier);

    // Apply damage to boss
    state.boss.hp = Math.max(0, state.boss.hp - damage);

    // Update threat table
    const existingThreat = state.boss.threatTable.get(playerId);
    if (existingThreat) {
      existingThreat.threat += damage;
    } else {
      state.boss.threatTable.set(playerId, { playerId, threat: damage });
    }

    this.eventBus.emit('combat:boss_damaged', {
      lobbyId,
      playerId,
      damage,
      bossHealth: state.boss.hp,
    });

    // Check for boss defeat
    if (state.boss.hp <= 0) {
      this.handleBossDefeated(lobbyId);
    }
  }

  /**
   * Handle boss defeat - enter wait state if voting incomplete
   * Requirement: FLOW-04 (boss death wait state)
   */
  private handleBossDefeated(lobbyId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state || !state.boss) return;

    // Clear attack timer
    if (state.boss.attackTimerHandle) {
      clearTimeout(state.boss.attackTimerHandle);
      state.boss.attackTimerHandle = undefined;
    }

    this.eventBus.emit('combat:boss_defeated', {
      lobbyId,
      bossId: state.boss.bossId,
    });

    // EstimationManager will handle checking if all votes are in
    // If not, combat enters wait state until voting complete
  }
}
```

### Pattern 2: Channel-Based Revival with Interruption
**What:** Healer stands still for 2-3 seconds to revive, boss attacks interrupt, requires distance check
**When to use:** Per context requirement - healer-only revival with channeling
**Example:**
```typescript
// server/domains/CombatManager.ts (continued)

interface RevivalSession {
  reviverId: string;
  targetId: string;
  lobbyId: string;
  startedAt: number;
  lastTick: number; // Keep-alive heartbeat
  channelDurationMs: number; // 2-3 seconds per context
  intervalHandle: NodeJS.Timeout;
}

class CombatManager {
  private revivalSessions = new Map<string, RevivalSession>(); // key: `${reviverId}:${targetId}`
  private readonly REVIVAL_CHANNEL_DURATION = 2500; // 2.5 seconds
  private readonly REVIVAL_DISTANCE_THRESHOLD = 10; // 10% of arena size
  private readonly REVIVAL_TICK_INTERVAL = 100; // Check every 100ms

  /**
   * Start revival channel (healer-only)
   * Context: Only healer classes (cleric, paladin, bard) can revive
   */
  startRevival(lobbyId: string, reviverId: string, targetId: string, reviverClass: AvatarClass): boolean {
    const state = this.combatStates.get(lobbyId);
    if (!state) return false;

    const reviver = state.players.get(reviverId);
    const target = state.players.get(targetId);

    if (!reviver || !target) return false;
    if (reviver.combatState !== 'fighting' || target.combatState !== 'downed') return false;

    // Validate healer class
    const healerClasses: AvatarClass[] = ['cleric', 'paladin', 'bard'];
    if (!healerClasses.includes(reviverClass)) {
      throw new RevivalNotAllowedError('Only healers can revive');
    }

    // Check distance (must be close)
    const distance = this.calculateDistance(reviver.position!, target.position!);
    if (distance > this.REVIVAL_DISTANCE_THRESHOLD) {
      return false; // Too far, client should retry when closer
    }

    // Check one-revive limit
    if (target.hasBeenRevived) {
      throw new RevivalNotAllowedError('Player already revived once');
    }

    const sessionKey = `${reviverId}:${targetId}`;

    // Cancel any existing revival by this reviver
    for (const [key, session] of this.revivalSessions) {
      if (session.reviverId === reviverId) {
        this.cancelRevival(key, 'started_new_revival');
      }
    }

    const now = Date.now();
    const session: RevivalSession = {
      reviverId,
      targetId,
      lobbyId,
      startedAt: now,
      lastTick: now,
      channelDurationMs: this.REVIVAL_CHANNEL_DURATION,
      intervalHandle: setInterval(() => this.tickRevival(sessionKey), this.REVIVAL_TICK_INTERVAL),
    };

    this.revivalSessions.set(sessionKey, session);

    this.eventBus.emit('combat:revival_started', {
      lobbyId,
      reviverId,
      targetId,
      durationMs: this.REVIVAL_CHANNEL_DURATION,
    });

    return true;
  }

  /**
   * Tick revival session - check for completion or interruption
   */
  private tickRevival(sessionKey: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) return;

    const state = this.combatStates.get(session.lobbyId);
    if (!state) {
      this.cancelRevival(sessionKey, 'lobby_destroyed');
      return;
    }

    const reviver = state.players.get(session.reviverId);
    const target = state.players.get(session.targetId);

    // Check if still valid
    if (!reviver || !target) {
      this.cancelRevival(sessionKey, 'player_left');
      return;
    }

    if (reviver.combatState !== 'fighting' || target.combatState !== 'downed') {
      this.cancelRevival(sessionKey, 'state_changed');
      return;
    }

    // Check distance (reviver must stay close)
    const distance = this.calculateDistance(reviver.position!, target.position!);
    if (distance > this.REVIVAL_DISTANCE_THRESHOLD) {
      this.cancelRevival(sessionKey, 'moved_too_far');
      return;
    }

    // Check if duration complete
    const elapsed = Date.now() - session.startedAt;
    if (elapsed >= session.channelDurationMs) {
      this.completeRevival(sessionKey);
    }
  }

  /**
   * Complete revival - restore player at 50% HP
   * Context: Revived players return at 50% HP, one revive per player per fight
   */
  private completeRevival(sessionKey: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) return;

    const state = this.combatStates.get(session.lobbyId);
    if (!state) {
      this.cancelRevival(sessionKey, 'lobby_destroyed');
      return;
    }

    const target = state.players.get(session.targetId);
    if (!target) return;

    // Clear down timer if still active
    if (target.downTimerHandle) {
      clearTimeout(target.downTimerHandle);
      target.downTimerHandle = undefined;
    }

    // Revive at 50% HP
    target.hp = Math.floor(target.maxHp * 0.5);
    target.isDowned = false;
    target.combatState = 'fighting';
    target.hasBeenRevived = true; // Mark as revived (only once per fight)

    clearInterval(session.intervalHandle);
    this.revivalSessions.delete(sessionKey);

    this.eventBus.emit('combat:player_revived', {
      lobbyId: session.lobbyId,
      playerId: session.targetId,
      reviverId: session.reviverId,
    });
  }

  /**
   * Cancel revival - boss attack interruption or movement
   * Context: Boss attacks interrupt revive channel
   */
  cancelRevival(sessionKey: string, reason: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) return;

    clearInterval(session.intervalHandle);
    this.revivalSessions.delete(sessionKey);

    this.eventBus.emit('combat:revival_cancelled', {
      lobbyId: session.lobbyId,
      reviverId: session.reviverId,
      targetId: session.targetId,
      reason,
    });
  }

  /**
   * Handle player taking damage - interrupts revival if channeling
   */
  private attackPlayer(lobbyId: string, targetId: string, attackType: 'light' | 'heavy' | 'special'): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    const player = state.players.get(targetId);
    if (!player || player.combatState !== 'fighting') return;

    const damage = this.getAttackDamage(attackType, state.boss!.isEnraged);

    // Telegraphing for big attacks
    if (attackType === 'special' || attackType === 'heavy') {
      this.eventBus.emit('combat:boss_telegraph', {
        lobbyId,
        targetId,
        attackType,
        message: attackType === 'special' ? 'Boss is charging...' : 'Boss winds up a heavy blow...',
        delayMs: 1000, // 1 second warning
      });

      // Delay actual damage
      setTimeout(() => this.applyDamageToPlayer(lobbyId, targetId, damage), 1000);
    } else {
      // Light attacks are instant
      this.applyDamageToPlayer(lobbyId, targetId, damage);
    }

    // Interrupt revival if player is channeling
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.reviverId === targetId) {
        this.cancelRevival(sessionKey, 'took_damage');
      }
    }
  }

  /**
   * Apply damage and check for down state
   * Context: Players can take 3-4 boss hits before going down
   */
  private applyDamageToPlayer(lobbyId: string, playerId: string, damage: number): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    const player = state.players.get(playerId);
    if (!player || player.combatState !== 'fighting') return;

    player.hp = Math.max(0, player.hp - damage);

    this.eventBus.emit('combat:player_damaged', {
      lobbyId,
      playerId,
      damage,
      playerHealth: player.hp,
    });

    // Check for down state
    if (player.hp <= 0) {
      this.downPlayer(lobbyId, playerId);
    }
  }

  /**
   * Down player - start 10-second countdown to ghost mode
   * Context: 10-second down timer before permanent out
   */
  private downPlayer(lobbyId: string, playerId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    const player = state.players.get(playerId);
    if (!player) return;

    player.isDowned = true;
    player.combatState = 'downed';
    player.downedAt = Date.now();

    this.eventBus.emit('combat:player_downed', {
      lobbyId,
      playerId,
      countdownSeconds: 10,
    });

    // Start 10-second countdown to permanent out
    // Context: Second down is permanent (if already revived once)
    player.downTimerHandle = setTimeout(() => {
      this.permanentlyDownPlayer(lobbyId, playerId);
    }, 10000);
  }

  /**
   * Permanently down player - enter ghost mode
   * Context: Permanently downed players enter ghost mode with emotes/reactions only
   */
  private permanentlyDownPlayer(lobbyId: string, playerId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    const player = state.players.get(playerId);
    if (!player) return;

    player.combatState = 'ghost';

    this.eventBus.emit('combat:player_permanently_downed', {
      lobbyId,
      playerId,
      message: 'Player entered ghost mode',
    });

    // Cancel any revival attempts on this player
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.targetId === playerId) {
        this.cancelRevival(sessionKey, 'permanent_down');
      }
    }
  }
}
```

### Pattern 3: Battle Modifier Progression
**What:** Damage modifier increases over time during battle to encourage faster completion
**When to use:** Per context - existing `battleModifier` field in current implementation
**Example:**
```typescript
// server/domains/CombatManager.ts (continued)

class CombatManager {
  private readonly MODIFIER_INTERVAL = 10000; // 10 seconds per existing implementation
  private readonly MODIFIER_INCREMENT = 0.1; // +10% every interval

  /**
   * Start modifier progression loop
   * Context: Damage modifier increases every 10s during battle
   */
  private startModifierLoop(lobbyId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    const incrementModifier = () => {
      const state = this.combatStates.get(lobbyId);
      if (!state || !state.boss || state.boss.hp <= 0) return;

      state.battleModifier += this.MODIFIER_INCREMENT;

      this.eventBus.emit('combat:modifier_updated', {
        lobbyId,
        modifier: state.battleModifier,
      });

      // Schedule next increment
      state.modifierIntervalHandle = setTimeout(incrementModifier, this.MODIFIER_INTERVAL);
    };

    // Start after first interval
    state.modifierIntervalHandle = setTimeout(incrementModifier, this.MODIFIER_INTERVAL);
  }

  /**
   * Cleanup method - clear all timers for lobby
   */
  cleanupLobby(lobbyId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    // Clear boss attack timer
    if (state.boss?.attackTimerHandle) {
      clearTimeout(state.boss.attackTimerHandle);
    }

    // Clear modifier timer
    if (state.modifierIntervalHandle) {
      clearTimeout(state.modifierIntervalHandle);
    }

    // Clear all down timers
    for (const player of state.players.values()) {
      if (player.downTimerHandle) {
        clearTimeout(player.downTimerHandle);
      }
    }

    // Clear all revival sessions
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.lobbyId === lobbyId) {
        clearInterval(session.intervalHandle);
        this.revivalSessions.delete(sessionKey);
      }
    }

    this.combatStates.delete(lobbyId);

    this.eventBus.emit('combat:cleanup_complete', { lobbyId });
  }
}
```

### Pattern 4: Mixed Player States (Estimating vs Fighting)
**What:** Support players in different states simultaneously - some voting, some battling
**When to use:** Requirement FLOW-03, context specifies players enter combat after voting
**Example:**
```typescript
// Conceptual state tracking - actual implementation in CombatManager

type PlayerGameState =
  | 'estimating'    // Player has not voted yet, not in combat
  | 'fighting'      // Player voted, entered battle, actively fighting
  | 'downed'        // Player HP reached 0, 10-second revival window
  | 'ghost';        // Player permanently out, emotes/reactions only

// EstimationManager tracks who has voted
// CombatManager tracks who has entered battle
// Players transition: estimating → (vote cast) → fighting → (hp = 0) → downed → (revival | timeout) → fighting | ghost

// Boss attacks only target players in 'fighting' state
// Revival only works on players in 'downed' state
// Ghost players can emit reactions but don't participate
```

### Anti-Patterns to Avoid
- **setInterval for boss attacks:** Doesn't adapt to processing delays; use recursive setTimeout instead
- **Synchronous boss defeat check:** Can cause race conditions; use event emission and let other domains react
- **Forgetting timer cleanup:** Boss attack timers, down timers, revival intervals ALL need cleanup on lobby destroy
- **Allowing non-healers to revive:** Context specifies only cleric/paladin/bard can revive, validate avatar class
- **Linear boss HP without player count check:** Boss HP must scale with active player count, not just initial count
- **Revival without distance check:** Context requires proximity, must calculate distance between reviver and target
- **Multiple revivals per player:** Context specifies one revive per player per fight, track `hasBeenRevived` flag

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Game loop for fixed timestep | Custom setInterval with drift compensation | Recursive setTimeout with variable intervals | Boss attacks use variable timing per context, not fixed 60fps; setTimeout simpler and sufficient |
| Threat table decay algorithm | Custom time-based threat decay | Simple Map with damage tracking | Threat-based targeting just needs recent damage totals; decay adds complexity without gameplay benefit per context |
| Distance calculation | Custom formula | Standard Euclidean distance (`Math.sqrt(dx² + dy²)`) | Well-known formula, no need to reinvent; normalize to arena size for threshold checks |
| Boss AI state machine | Complex FSM library | Simple boolean flags (isEnraged, isDowned) + threat table | Only 2 boss states (normal/enraged) per context; FSM overkill for binary flags |
| Timer accuracy compensation | Manual drift tracking with performance.now() | Node.js setTimeout recursive pattern | setTimeout naturally compensates for processing time; manual tracking unnecessary unless fixed timestep required |

**Key insight:** Real-time combat systems have subtle edge cases (boss attacks during revival, player disconnects mid-battle, timer cleanup on lobby destroy). Use proven patterns from existing SessionManager/EstimationManager (Map-based state, event-driven cleanup, EventBus coordination) rather than inventing custom solutions.

## Common Pitfalls

### Pitfall 1: Timer Memory Leaks on Combat End
**What goes wrong:** Boss attack timers, down timers, revival intervals not cleared when combat ends, causing ghost timers and memory leaks
**Why it happens:** Multiple timer types (setTimeout for boss attacks, setInterval for revival ticking, setTimeout for down timers), easy to miss one in cleanup
**How to avoid:** Store ALL timer handles in combat state (attackTimerHandle, downTimerHandle, modifierIntervalHandle, revival session intervals), implement comprehensive `cleanupLobby()` that clears every timer type, call in SessionManager's lobby destruction handler
**Warning signs:** Memory usage grows over repeated battles, boss attacks firing for destroyed lobbies, revival ticks for non-existent sessions

### Pitfall 2: Race Condition Between Boss Defeat and Vote Completion
**What goes wrong:** Boss defeated and voting completes simultaneously, causing duplicate phase transitions or skipped wait state
**Why it happens:** Boss HP check is synchronous (instant defeat), voting completion is event-driven (async), can overlap
**How to avoid:** Emit `combat:boss_defeated` event immediately on HP=0 but don't transition phase directly; let orchestrator (Phase 5 or gameState.ts coordinator) handle checking if voting complete and deciding next phase; use event-driven coordination not direct phase changes
**Warning signs:** Double phase transitions (battle→discussion and battle→victory simultaneously), skipped wait state when some players still voting

### Pitfall 3: Revival Interrupted Without Notification
**What goes wrong:** Revival channel cancelled (reviver moved too far or took damage) but client not notified, shows stuck progress bar
**Why it happens:** Cancellation logic clears interval but doesn't emit cancellation event
**How to avoid:** ALWAYS emit `combat:revival_cancelled` event when cancelling (movement, damage, target died, timeout), include reason field for debugging, client listens for cancellation and resets UI
**Warning signs:** Client-side revival UI stuck at partial progress, players report "revive didn't work" when actually cancelled mid-channel

### Pitfall 4: Threat Table Not Cleared Between Tickets
**What goes wrong:** Boss targets players based on threat from previous fight, new fight starts with stale threat data
**Why it happens:** Threat table stored in boss state but not cleared when new boss spawned
**How to avoid:** Clear threat table in `initializeCombat()` when creating new boss, or create entirely new boss state object (don't reuse); ensure boss state is fresh per ticket
**Warning signs:** Boss immediately attacks specific player in new fight before anyone deals damage, targeting seems biased toward previous fight's DPS

### Pitfall 5: Ghost Players Counted in Boss Scaling
**What goes wrong:** Boss HP scaled by total players including ghosts, making boss too hard when multiple players permanently downed
**Why it happens:** Boss HP calculated once at combat start using total player count, doesn't adjust as players become ghosts
**How to avoid:** Per context requirement, boss HP is linear with player count at START ("HP = base × players"); don't dynamically rescale mid-fight as that feels unfair; document this as expected behavior, not a bug
**Warning signs:** Boss feels impossible when multiple players down (this is intentional difficulty per context), players complain about scaling

### Pitfall 6: Down Timer Not Cancelled on Revival Start
**What goes wrong:** Player revived but 10-second down timer still fires, immediately putting them back in ghost mode
**Why it happens:** Revival completion clears timer, but if revival cancelled mid-channel, original down timer still active
**How to avoid:** Clear down timer BOTH in `completeRevival()` AND when starting revival attempt (`startRevival()`), so cancelled revivals don't leave orphaned timers; defensive cleanup prevents race conditions
**Warning signs:** Player revived successfully but immediately enters ghost mode, timer fires after revival completed

### Pitfall 7: AoE Attack Hitting Ghost Players
**What goes wrong:** AoE attack damages ghost players (permanently downed), causing confusion and invalid state
**Why it happens:** AoE logic iterates all players in combat state without filtering by combatState
**How to avoid:** Filter to `combatState === 'fighting'` before applying AoE damage; ghost players are spectating, not targetable; same filter used for threat-based single-target attacks
**Warning signs:** Ghost players showing damage numbers, ghost HP going negative, clients confused about ghost player state

## Code Examples

Verified patterns from existing codebase and research:

### Manager Cleanup Contract Pattern
```typescript
// Source: Phase 2 SessionManager pattern, timer cleanup best practices
// ALL domain managers implement cleanup contract

class CombatManager {
  /**
   * Required cleanup method - called by SessionManager on lobby destroy
   * Clears ALL timers and state for lobby to prevent memory leaks
   */
  cleanupLobby(lobbyId: string): void {
    const state = this.combatStates.get(lobbyId);
    if (!state) return;

    // Clear boss attack timer
    if (state.boss?.attackTimerHandle) {
      clearTimeout(state.boss.attackTimerHandle);
      state.boss.attackTimerHandle = undefined;
    }

    // Clear modifier timer
    if (state.modifierIntervalHandle) {
      clearTimeout(state.modifierIntervalHandle);
      state.modifierIntervalHandle = undefined;
    }

    // Clear all player down timers
    for (const player of state.players.values()) {
      if (player.downTimerHandle) {
        clearTimeout(player.downTimerHandle);
        player.downTimerHandle = undefined;
      }
    }

    // Clear all revival sessions for this lobby
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.lobbyId === lobbyId) {
        clearInterval(session.intervalHandle);
        this.revivalSessions.delete(sessionKey);
      }
    }

    // Remove combat state
    this.combatStates.delete(lobbyId);

    this.eventBus.emit('combat:cleanup_complete', { lobbyId });
  }
}
```

### Cross-Domain Event Subscription Pattern
```typescript
// Source: Phase 3 EstimationManager pattern, EventBus coordination
// CombatManager subscribes to estimation events to coordinate battle entry

class CombatManager {
  constructor(private eventBus: ScopedEventBus) {
    // Subscribe to estimation events
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));

    // Subscribe to session events
    this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
    this.eventBus.on('session:lobby_destroyed', this.handleLobbyDestroyed.bind(this));
  }

  /**
   * Handle vote cast - trigger battle entry
   * Requirement: FLOW-02, FLOW-03
   */
  private handleVoteCast(payload: { lobbyId: string; playerId: string; team: TeamType }): void {
    const state = this.combatStates.get(payload.lobbyId);
    if (!state || !state.boss) return;

    const player = state.players.get(payload.playerId);
    if (!player) return;

    // Emit battle entry event (client shows transition animation)
    this.eventBus.emit('combat:player_entered_battle', {
      lobbyId: payload.lobbyId,
      playerId: payload.playerId,
      transitionDurationMs: 1500, // 1.5 second run-onto-battlefield animation
    });

    // Start combat on first player entry
    if (!state.battleStartTime) {
      state.battleStartTime = Date.now();
      this.startBossAttackLoop(payload.lobbyId);
      this.startModifierLoop(payload.lobbyId);

      this.eventBus.emit('combat:battle_started', {
        lobbyId: payload.lobbyId,
        bossId: state.boss.bossId,
      });
    }
  }

  /**
   * Handle player left - remove from combat
   */
  private handlePlayerLeft(payload: { lobbyId: string; playerId: string }): void {
    const state = this.combatStates.get(payload.lobbyId);
    if (!state) return;

    // Cancel any revival sessions involving this player
    for (const [sessionKey, session] of this.revivalSessions) {
      if (session.reviverId === payload.playerId || session.targetId === payload.playerId) {
        this.cancelRevival(sessionKey, 'player_left');
      }
    }

    // Remove from threat table
    state.boss?.threatTable.delete(payload.playerId);

    // Clear down timer if active
    const player = state.players.get(payload.playerId);
    if (player?.downTimerHandle) {
      clearTimeout(player.downTimerHandle);
    }

    // Remove from combat state
    state.players.delete(payload.playerId);
  }

  /**
   * Handle lobby destroyed - full cleanup
   */
  private handleLobbyDestroyed(payload: { lobbyId: string }): void {
    this.cleanupLobby(payload.lobbyId);
  }
}
```

### Boss HP Scaling Pattern
```typescript
// Source: Context requirement - linear scaling with player count
// Calculate boss HP at combat start based on active player count

initializeCombat(lobbyId: string, players: Array<{id: string; team: TeamType}>): void {
  // Count active players (exclude spectators)
  const activePlayers = players.filter(p => p.team !== 'spectators');
  const playerCount = activePlayers.length;

  // Linear scaling: 1000 HP per player
  // Context: "Boss HP scales linearly with player count (HP = base × players)"
  const BASE_HP_PER_PLAYER = 1000;
  const bossMaxHp = BASE_HP_PER_PLAYER * Math.max(1, playerCount); // Min 1 player

  const state: LobbyCombatState = {
    lobbyId,
    boss: {
      bossId: `boss_${Date.now()}`,
      bossName: 'Dungeon Boss',
      hp: bossMaxHp,
      maxHp: bossMaxHp,
      isEnraged: false,
      lastAttackAt: 0,
      threatTable: new Map(),
    },
    players: new Map(),
    battleModifier: 1.0,
  };

  // Initialize player states
  for (const player of activePlayers) {
    state.players.set(player.id, {
      playerId: player.id,
      hp: 100,
      maxHp: 100,
      isDowned: false,
      hasBeenRevived: false,
      combatState: 'fighting',
    });
  }

  this.combatStates.set(lobbyId, state);
}
```

### Recursive setTimeout for Variable Boss Attacks
```typescript
// Source: Node.js game loop patterns, variable timing requirement
// Use recursive setTimeout (not setInterval) for boss attacks with variable timing

private startBossAttackLoop(lobbyId: string): void {
  const state = this.combatStates.get(lobbyId);
  if (!state || !state.boss) return;

  const performAttack = () => {
    const state = this.combatStates.get(lobbyId);
    if (!state || !state.boss || state.boss.hp <= 0) {
      // Combat ended, don't reschedule
      return;
    }

    // Perform attack logic
    this.executeBossAttack(lobbyId);

    // Calculate next attack timing with variance
    // Context: "Variable timing between attacks (random intervals within a range)"
    const baseInterval = state.boss.isEnraged ? 3000 : 5000; // ms
    const variance = 0.3; // ±30%
    const randomVariance = (Math.random() * variance * 2) - variance; // -0.3 to +0.3
    const nextAttackDelay = baseInterval * (1 + randomVariance);

    // Recursive setTimeout - naturally adapts to processing time
    state.boss.attackTimerHandle = setTimeout(performAttack, nextAttackDelay);
    state.boss.lastAttackAt = Date.now();
  };

  // Initial attack after 3 seconds (grace period for players to enter)
  state.boss.attackTimerHandle = setTimeout(performAttack, 3000);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed interval boss attacks (setInterval) | Variable timing with recursive setTimeout | Modern game design (2020+) | More dynamic combat, prevents predictable patterns, better for async processing |
| Pure random targeting | Threat-based aggro tables | MMO design origins (EverQuest 1999) | Rewards damage dealers, creates tank/healer/DPS roles, more strategic gameplay |
| Instant revival (button press) | Channel-based revival with interruption | Modern co-op games (2015+) | Adds tension and risk/reward, prevents trivial death, requires team coordination |
| Global combat state (all or nothing) | Mixed player states (estimating/fighting) | Asynchronous multiplayer (2018+) | Supports different progression speeds, prevents idle waiting, maintains engagement |
| Client-authoritative combat | Server-authoritative with client prediction | Real-time multiplayer standards (2010+) | Prevents cheating, ensures fair damage calculations, but requires good netcode |
| Flat boss difficulty | Enrage mechanics at HP thresholds | Raid boss design (WoW 2004) | Increases tension, rewards fast completion, prevents indefinite kiting |

**Deprecated/outdated:**
- `setInterval` for game loops: Use recursive `setTimeout` for variable timing or dedicated game loop library for fixed timestep
- Polling for state checks: Use event-driven architecture (EventBus) for cross-domain coordination
- Monolithic game state classes: Separate domains (Session/Estimation/Combat) for maintainability and testing
- Synchronous phase transitions: Emit events and let coordinator handle phase logic to prevent race conditions

## Open Questions

Things that couldn't be fully resolved:

1. **Boss attack damage values**
   - What we know: Context specifies "players can take 3-4 boss hits before going down" with 100 HP max
   - What's unclear: Exact damage per attack type (light/heavy/special), whether enrage increases damage or just frequency
   - Recommendation: Light = 25 dmg (4 hits to down), Heavy = 40 dmg (2.5 hits), Special = 50 dmg (2 hits); enrage increases frequency (3s vs 5s) per context, damage same; Claude's discretion per context

2. **Dungeon crawl difficulty scaling**
   - What we know: Context specifies "Boss difficulty scales with ticket progression — dungeon crawl feel (early tickets quick, later tickets harder)"
   - What's unclear: How to scale difficulty (boss HP multiplier? More attack types? Faster enrage?)
   - Recommendation: Track ticket index in session, multiply boss BASE_HP_PER_PLAYER by (1 + ticketIndex * 0.2), so ticket 1 = 1000hp/player, ticket 5 = 1800hp/player; keeps combat longer but not exponential; Claude's discretion per context

3. **Between-ticket healing implementation**
   - What we know: Context specifies "Between-ticket healing: full HP if party has healer class, no healing if not"
   - What's unclear: When exactly does healing happen (combat end? Ticket completion? Next ticket start?), who owns this logic (CombatManager or orchestrator?)
   - Recommendation: CombatManager emits `combat:battle_ended` event with player HP, orchestrator checks for healer in team composition, calls `CombatManager.healAllPlayers(lobbyId)` before next ticket starts; keeps healing logic in CombatManager but triggered by orchestrator

4. **Active healing during combat**
   - What we know: Context specifies "Healer classes can actively heal teammates during combat"
   - What's unclear: Healing mechanics (click-to-heal? Auto-heal? Cooldown? HP restored?), separate from revival
   - Recommendation: Similar to attack - player clicks teammate to heal, 20-30 HP restored, no cooldown (spam allowed like attacks), only cleric/paladin/bard can heal; separate from revival (heal prevents down, revival restores from down); Claude's discretion per context

5. **AoE minion spawn details**
   - What we know: Context specifies "Minion spawns as one AoE type — minions deal damage once and disappear"
   - What's unclear: How many minions? Damage value? Do they have HP? Can players kill them?
   - Recommendation: 2-3 minions spawn spread across arena, each deals 15 dmg to nearby players (<10% distance) immediately then despawns, no HP (can't be killed), purely damage source; keeps combat focused on boss not minion management; Claude's discretion per context

## Sources

### Primary (HIGH confidence)
- [Colyseus Node.js TypeScript Multiplayer Framework](https://gitnation.com/contents/making-multiplayer-games-with-colyseus-nodejs-and-typescript) - Architecture patterns
- [Node.js Event Loop Documentation](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick) - Timer behavior and best practices
- [Game Programming Patterns - Game Loop](https://gameprogrammingpatterns.com/game-loop.html) - Game loop fundamentals
- [Node.js Accurate Game Loop](https://github.com/timetocode/node-game-loop) - Timer accuracy patterns for Node.js
- [MMO Hate/Threat Systems](https://en.wikipedia.org/wiki/Hate_(video_games)) - Threat-based targeting mechanics
- Phase 2 SessionManager implementation - Domain manager pattern, cleanup contracts
- Phase 3 EstimationManager implementation - Event subscription pattern, timer management
- Current `gameState.ts` revival system - Existing revival session tracking implementation

### Secondary (MEDIUM confidence)
- [State Machines in Game Development](https://gameprogrammingpatterns.com/state.html) - Combat state patterns and common pitfalls
- [Multiplayer Game Architecture in TypeScript](https://arnauld-alex.com/guiding-the-flock-building-a-realtime-multiplayer-game-architecture-in-typescript) - Real-time multiplayer patterns
- [Boss Scaling Patterns](https://forums.kleientertainment.com/forums/topic/147554-world-setting-boss-health-scaling-with-number-of-players/) - Player count scaling discussions
- [Revival System Patterns](https://steamcommunity.com/sharedfiles/filedetails/?id=3338664412) - Revival mechanics in multiplayer games

### Tertiary (LOW confidence)
- Boss fight design patterns - Synthesized from multiple game design discussions, not authoritative
- Enrage mechanics timing - Community patterns, exact values are Claude's discretion per context
- AoE attack frequency percentages - Estimated based on game balance principles, needs playtesting

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native Node.js timers, Phase 1 EventBus, Map-based state are proven
- Architecture: HIGH - Domain manager pattern established in Phases 2-3, event-driven coordination well-documented
- Pitfalls: HIGH - Timer leaks, race conditions, state cleanup issues well-documented in Node.js and game dev resources
- Combat specifics (damage values, timing): MEDIUM - Context provides guidance but exact values are Claude's discretion, requires playtesting

**Research date:** 2026-02-02
**Valid until:** 30 days (stable domain - multiplayer combat patterns and Node.js timers are mature, context decisions are locked)
