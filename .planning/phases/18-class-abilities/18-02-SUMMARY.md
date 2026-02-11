---
phase: 18-class-abilities
plan: 02
subsystem: ability-system
tags: [socket-handlers, event-pipeline, combat-integration]
dependency_graph:
  requires:
    - AbilityManager domain (Plan 01)
    - CombatManager (boss damage, threat tracking)
    - ClientEventEmitter (event forwarding)
    - BossAI (recordThreat for taunt abilities)
  provides:
    - use_ability client event handler
    - ability:* server event forwarding via ClientEventEmitter
    - CombatManager.getBossAI() and applyAbilityDamageToBoss() methods
    - Complete ability activation pipeline from client to game state
  affects:
    - shared/gameEvents.ts (use_ability + ability:* events)
    - server/domains/index.ts (abilityManager wiring + effect handlers)
    - server/websocket.ts (use_ability handler)
    - server/domains/CombatManager.ts (ability damage methods)
    - server/events/ClientEventEmitter.ts (ability event forwarding)
tech_stack:
  added:
    - Socket.IO event pipeline for abilities
  patterns:
    - Event-driven effect application (eventBus listeners)
    - CombatManager public API for ability damage
    - ClientEventEmitter forwarding with seq/timestamp
key_files:
  created: []
  modified:
    - shared/gameEvents.ts
    - server/domains/index.ts
    - server/websocket.ts
    - server/domains/CombatManager.ts
    - server/events/ClientEventEmitter.ts
decisions:
  - use_ability handler validates battle phase before calling AbilityManager
  - Damage effects applied via CombatManager.applyAbilityDamageToBoss for threat tracking
  - Heal effects modify combat state directly and emit combat:player_healed
  - Taunt effects use recordThreat with 'damage' type (500 threat value)
  - ClientEventEmitter adds seq/timestamp to all ability:* events
  - AbilityManager event listeners in domains/index.ts (not websocket.ts)
metrics:
  tasks_completed: 2
  tests_added: 0
  test_pass_rate: 100%
  duration_seconds: 297
  commits:
    - da2a093 (Task 1: Socket.IO events and AbilityManager wiring)
    - e21883a (Task 2: use_ability handler and effect application)
  completed_at: 2026-02-11T19:20:28Z
---

# Phase 18 Plan 02: AbilityManager Server Integration Summary

Wire AbilityManager into Socket.IO event pipeline with use_ability handler, effect application via CombatManager, and ClientEventEmitter forwarding.

## One-Liner

Complete server-side ability activation pipeline: client sends use_ability → AbilityManager validates → effects applied to boss/players → events broadcast to all clients with sequencing.

## What Was Built

### Task 1: Socket.IO Events and AbilityManager Wiring (da2a093)

**Files Modified:** shared/gameEvents.ts, server/domains/index.ts

**1. shared/gameEvents.ts — Added Socket.IO events:**

Added to `ClientToServerEvents`:
```typescript
use_ability: (data: { abilityId: string }) => void;
```

Added to `ServerToClientEvents`:
```typescript
'ability:used': (data: {
  playerId: string;
  abilityId: string;
  abilityName: string;
  effectType: string;
  targetType: string;
  seq: number;
  timestamp: number;
}) => void;

'ability:cooldown_started': (data: {
  playerId: string;
  abilityId: string;
  durationMs: number;
  expiresAt: number;
  seq: number;
  timestamp: number;
}) => void;

'ability:effect_applied': (data: {
  playerId: string;
  abilityId: string;
  effectType: string;
  targetIds: string[];
  value: number;
  seq: number;
  timestamp: number;
}) => void;
```

**2. server/domains/index.ts — Instantiated AbilityManager:**

Created abilityManager instance after progressionManager:
```typescript
const abilityManager = new AbilityManager({
  eventBus,
  combatManager: {
    getCombatState: (lobbyId: string) => combatManager.getCombatState(lobbyId),
    canUseClassAbility: (lobbyId: string, playerId: string, abilityId: string) =>
      combatManager.canUseClassAbility(lobbyId, playerId, abilityId),
  },
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  },
});
```

**3. Wired event listeners for cooldown lifecycle:**

Reset cooldowns on new battle:
```typescript
eventBus.on('combat:battle_initialized', (payload) => {
  abilityManager.resetCooldowns(payload.lobbyId);
});
```

Cleanup on lobby destruction:
```typescript
eventBus.on('session:lobby_destroyed', (payload) => {
  abilityManager.cleanupLobby(payload.lobbyId);
});
```

**4. Exported abilityManager and types:**
- Added abilityManager to exports
- Added `export type { AbilityManager, AbilityManagerDeps }`

### Task 2: Socket Handler and Effect Application (e21883a)

**Files Modified:** server/websocket.ts, server/domains/index.ts, server/domains/CombatManager.ts, server/events/ClientEventEmitter.ts

**1. server/websocket.ts — Added use_ability socket handler:**

Imported abilityManager from domains/index.ts.

Added handler after heal_teammate:
```typescript
socket.on('use_ability', ({ abilityId }: { abilityId: string }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  // Get lobby for phase validation
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

  // Attempt ability use (AbilityManager validates cooldown, mastery, combat state)
  const result = abilityManager.useAbility(lobby.id, playerId, abilityId);

  if (!result.success) {
    socket.emit('game_error', { message: result.error || 'Ability use failed' });
    return;
  }

  console.log(`Player ${playerId} used ability ${abilityId}`);
});
```

**Validation Flow:**
1. Check player is in lobby
2. Check phase is 'battle'
3. Call AbilityManager.useAbility (validates cooldown, mastery, combat state)
4. Emit game_error on failure
5. Success logged (events handled by domains/index.ts)

**2. server/domains/index.ts — Added ability:effect_applied handler:**

Added event listener after lobby cleanup:
```typescript
eventBus.on('ability:effect_applied', (payload) => {
  if (payload.effectType === 'damage') {
    // Apply damage to boss via CombatManager
    combatManager.applyAbilityDamageToBoss(payload.lobbyId, payload.playerId, payload.value);
  }

  if (payload.effectType === 'heal') {
    // Apply healing through CombatManager for each target
    for (const targetId of payload.targetIds) {
      const combatState = combatManager.getCombatState(payload.lobbyId);
      if (!combatState) break;
      const targetState = combatState.players.get(targetId);
      if (targetState && targetState.combatState === 'fighting') {
        const oldHp = targetState.hp;
        targetState.hp = Math.min(targetState.maxHp, targetState.hp + payload.value);
        const actualHeal = targetState.hp - oldHp;
        if (actualHeal > 0) {
          eventBus.emit('combat:player_healed', {
            lobbyId: payload.lobbyId,
            playerId: targetId,
            healerId: payload.playerId,
            healAmount: actualHeal,
            newHealth: targetState.hp,
          });
        }
      }
    }
  }

  if (payload.effectType === 'taunt') {
    // Massive threat boost (use 'damage' type for threat calculation)
    const bossAI = combatManager.getBossAI(payload.lobbyId);
    const combatState = combatManager.getCombatState(payload.lobbyId);
    if (bossAI && combatState?.boss?.threatTable) {
      bossAI.recordThreat(combatState.boss.threatTable, payload.playerId, 'damage', 500);
    }
  }
});
```

**Effect Types Handled:**
- **damage**: Applied to boss via `applyAbilityDamageToBoss` (includes threat, phase checks)
- **heal**: Applied to player HP directly, emits `combat:player_healed`
- **taunt**: Adds 500 threat via BossAI.recordThreat

**3. server/domains/CombatManager.ts — Added public methods:**

**getBossAI() method:**
```typescript
public getBossAI(lobbyId: string): BossAI | undefined {
  return this.bossAIs.get(lobbyId);
}
```

**applyAbilityDamageToBoss() method:**
```typescript
public applyAbilityDamageToBoss(lobbyId: string, playerId: string, damage: number): void {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState?.boss) return;

  combatState.boss.hp = Math.max(0, combatState.boss.hp - damage);

  this.eventBus.emit('combat:boss_damaged', {
    lobbyId,
    playerId,
    damage,
    bossHealth: combatState.boss.hp,
  });

  const bossAI = this.bossAIs.get(lobbyId);
  if (bossAI) {
    bossAI.recordThreat(combatState.boss.threatTable, playerId, 'damage', damage);
    // Check phase transition
    const phaseResult = bossAI.checkPhaseTransition(combatState.boss.hp, combatState.boss.maxHp);
    if (phaseResult.transitioned) {
      combatState.boss.currentPhase = phaseResult.newPhase;
      if (phaseResult.newPhase >= 2) combatState.boss.isEnraged = true;
      this.eventBus.emit('combat:boss_phase_transition', {
        lobbyId,
        newPhase: phaseResult.newPhase,
        previousPhase: phaseResult.newPhase - 1,
        message: phaseResult.message ?? 'The boss grows more powerful!',
        bossType: combatState.boss.bossType,
      });
    }
  }
}
```

This method:
- Reduces boss HP
- Emits combat:boss_damaged
- Records threat
- Checks for phase transitions
- Emits combat:boss_phase_transition if needed

**4. server/events/ClientEventEmitter.ts — Added ability event forwarding:**

Added after class_mastery events:
```typescript
// Ability Events
this.eventBus.on('ability:used', (payload) => {
  this.emitToLobby(payload.lobbyId, 'ability:used', {
    playerId: payload.playerId,
    abilityId: payload.abilityId,
    abilityName: payload.abilityName,
    effectType: payload.effectType,
    targetType: payload.targetType,
  });
});

this.eventBus.on('ability:cooldown_started', (payload) => {
  this.emitToLobby(payload.lobbyId, 'ability:cooldown_started', {
    playerId: payload.playerId,
    abilityId: payload.abilityId,
    durationMs: payload.durationMs,
    expiresAt: payload.expiresAt,
  });
});

this.eventBus.on('ability:effect_applied', (payload) => {
  this.emitToLobby(payload.lobbyId, 'ability:effect_applied', {
    playerId: payload.playerId,
    abilityId: payload.abilityId,
    effectType: payload.effectType,
    targetIds: payload.targetIds,
    value: payload.value,
  });
});
```

All events automatically get `seq` and `timestamp` added by `emitToLobby()`.

## Pipeline Flow

**Complete ability activation sequence:**

1. **Client** emits `use_ability({ abilityId })`
2. **websocket.ts** validates lobby and battle phase
3. **AbilityManager.useAbility()** validates cooldown, mastery, combat state
4. **AbilityManager** emits:
   - `ability:used` (internal event)
   - `ability:cooldown_started` (internal event)
   - `ability:effect_applied` (internal event)
5. **domains/index.ts** listener applies effects:
   - Damage → `CombatManager.applyAbilityDamageToBoss()`
   - Heal → direct HP modification + `combat:player_healed` event
   - Taunt → `BossAI.recordThreat()`
6. **ClientEventEmitter** forwards internal events to Socket.IO with seq/timestamp:
   - `ability:used` → all clients in lobby
   - `ability:cooldown_started` → all clients in lobby
   - `ability:effect_applied` → all clients in lobby
7. **Client** receives events and updates UI

## Deviations from Plan

**Minor adjustments (Rules 1-3 fixes):**

1. **Plan specified taunt as separate recordThreat type:** BossAI.recordThreat only accepts 'damage' | 'healing' | 'revival'. Changed to use 'damage' type with 500 threat value for taunt abilities. This is correct because taunt is fundamentally threat manipulation, and the large value achieves the same goal.

No architectural changes required.

## Verification Results

All verification criteria met:

- [x] `npm run check` — no new TypeScript errors (17 pre-existing in other files)
- [x] `npm test` — all 522 tests pass (no regressions)
- [x] shared/gameEvents.ts has use_ability in ClientToServerEvents
- [x] shared/gameEvents.ts has ability:used, ability:cooldown_started, ability:effect_applied in ServerToClientEvents
- [x] server/domains/index.ts exports abilityManager
- [x] server/websocket.ts has socket.on('use_ability', ...) handler
- [x] server/events/ClientEventEmitter.ts forwards ability:* events

## Key Decisions

1. **use_ability Phase Validation in Socket Handler**: Phase validation (must be 'battle') happens in websocket.ts before calling AbilityManager. This catches invalid states early and provides clear error messages to clients.

2. **Effect Application in domains/index.ts**: The ability:effect_applied event listener lives in domains/index.ts (not websocket.ts). This keeps all domain coordination logic centralized and follows the pattern established for other cross-domain events.

3. **Damage via CombatManager Public API**: Created `applyAbilityDamageToBoss()` public method instead of directly manipulating combat state. This ensures threat tracking, phase transitions, and event emission are consistent across all damage sources.

4. **Taunt Uses 'damage' Threat Type**: BossAI.recordThreat only accepts 'damage', 'healing', or 'revival'. Taunt abilities record threat using 'damage' type with 500 value (much higher than normal damage for strong taunt effect).

5. **Heal Effects Modify State Directly**: Heal effects modify player HP in the combat state directly (similar to existing heal_party pattern). They emit combat:player_healed events for client synchronization.

6. **ClientEventEmitter Adds Sequencing Automatically**: All ability:* events get seq and timestamp via the standard `emitToLobby()` method. No special handling needed for abilities — they follow the same pattern as combat/progression events.

## Integration Points for Next Plans

**Plan 03 (Client Ability UI)** will:
- Create AbilityBar component with 2 buttons per class
- Listen for ability:cooldown_started to update cooldown state
- Emit use_ability on button click
- Show cooldown progress with CSS conic-gradient
- Display ability names and icons from CLASS_ABILITY_CONFIGS

**Future enhancements:**
- Buff/debuff tracking (currently effects are instant)
- Ability visual effects (particles, animations)
- Resurrection ability special handling (instant revive without channeling)
- Shield abilities (damage reduction calculation)

## Self-Check

Verifying all claims in this summary:

**Files modified:**
```bash
[ -f "shared/gameEvents.ts" ] && echo "FOUND: shared/gameEvents.ts" || echo "MISSING"
[ -f "server/domains/index.ts" ] && echo "FOUND: server/domains/index.ts" || echo "MISSING"
[ -f "server/websocket.ts" ] && echo "FOUND: server/websocket.ts" || echo "MISSING"
[ -f "server/domains/CombatManager.ts" ] && echo "FOUND: CombatManager.ts" || echo "MISSING"
[ -f "server/events/ClientEventEmitter.ts" ] && echo "FOUND: ClientEventEmitter.ts" || echo "MISSING"
```

**FOUND: shared/gameEvents.ts**
**FOUND: server/domains/index.ts**
**FOUND: server/websocket.ts**
**FOUND: server/domains/CombatManager.ts**
**FOUND: server/events/ClientEventEmitter.ts**

**Commits exist:**
```bash
git log --oneline --all | grep -q "da2a093" && echo "FOUND: da2a093" || echo "MISSING"
git log --oneline --all | grep -q "e21883a" && echo "FOUND: e21883a" || echo "MISSING"
```

**FOUND: da2a093**
**FOUND: e21883a**

**Tests passing:**
```bash
npm test 2>&1 | grep "Tests:"
```

**Tests: 522 passed (522)**

**use_ability handler exists:**
```bash
grep -q "socket.on('use_ability'" server/websocket.ts && echo "FOUND" || echo "MISSING"
```

**FOUND**

## Self-Check: PASSED

All files modified, commits exist, 522 tests pass, use_ability handler exists, ability events forwarded.
