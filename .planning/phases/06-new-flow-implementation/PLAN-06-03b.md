# Plan 06-03b: Minion Player Interaction and UI

---
phase: 06-new-flow-implementation
plan: 03b
type: execute
wave: 2
depends_on:
  - PLAN-06-03
files_modified:
  - server/events/eventTypes.ts
  - server/domains/CombatManager.ts
  - server/events/ClientEventEmitter.ts
  - server/socketHandlers.ts
  - shared/gameEvents.ts
  - client/src/lib/stores/useGameStore.tsx
  - client/src/components/game/MinionDisplay.tsx
  - client/src/components/game/phases/BattlePhase.tsx
autonomous: true

must_haves:
  truths:
    - "Players can target and attack minions"
    - "Killed minions respawn after 15-30 seconds"
    - "Spectator switching to voter team kills their minion immediately"
    - "MinionDisplay component shows minions with HP bars and targeting"
  artifacts:
    - path: "server/domains/CombatManager.ts"
      provides: "Player attack minion and respawn logic"
      contains: "playerAttackMinion"
    - path: "client/src/components/game/MinionDisplay.tsx"
      provides: "Minion visual display with targeting"
      min_lines: 40
    - path: "server/socketHandlers.ts"
      provides: "attack_minion socket handler"
      contains: "attack_minion"
  key_links:
    - from: "MinionDisplay click"
      to: "socket.emit attack_minion"
      via: "onClick handler"
      pattern: "emit.*attack_minion"
    - from: "socketHandlers"
      to: "CombatManager.playerAttackMinion"
      via: "attack_minion handler"
      pattern: "playerAttackMinion"
    - from: "BattlePhase"
      to: "MinionDisplay"
      via: "component render"
      pattern: "<MinionDisplay"
---

<objective>
Implement player-minion interaction: attacking minions, respawn mechanics, team switch handling, and minion UI.

Purpose: Players can target and kill spectator minions to reduce boss-side pressure. When killed, minions respawn after 15-30 seconds. If a spectator switches to the voting team during battle, their minion dies immediately. This plan creates the complete player-minion interaction loop.

Output: Server player attack/respawn logic, socket handler, team switch handling, and MinionDisplay component.
</objective>

<execution_context>
@C:\Users\Preston\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\Preston\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-new-flow-implementation/06-RESEARCH.md
@.planning/phases/06-new-flow-implementation/06-03-SUMMARY.md
@server/domains/CombatManager.ts
@server/socketHandlers.ts
@client/src/components/game/phases/BattlePhase.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add minion damage and kill event types</name>
  <files>server/events/eventTypes.ts</files>
  <action>
Add event payload types for minion damage and kill:

```typescript
/** Emitted when minion takes damage */
export interface CombatMinionDamagedPayload {
  lobbyId: string;
  playerId: string;
  damage: number;
  newHp: number;
  attackerId: string;
}

/** Emitted when minion is killed */
export interface CombatMinionKilledPayload {
  lobbyId: string;
  playerId: string;
  killerId: string;
  respawnInSeconds: number;
}
```

Add to DomainEventMap:
- `'combat:minion_damaged': CombatMinionDamagedPayload`
- `'combat:minion_killed': CombatMinionKilledPayload`
  </action>
  <verify>npm run check passes with no type errors</verify>
  <done>Minion damaged and killed event types defined</done>
</task>

<task type="auto">
  <name>Task 2: Add minion damage/kill client events</name>
  <files>shared/gameEvents.ts</files>
  <action>
Add to ServerToClientEvents interface:

```typescript
'combat:minion_damaged': (data: { playerId: string; damage: number; newHp: number; attackerId: string; seq: number; timestamp: number }) => void;
'combat:minion_killed': (data: { playerId: string; killerId: string; respawnInSeconds: number; seq: number; timestamp: number }) => void;
```

Add to ClientToServerEvents interface:

```typescript
'attack_minion': (data: { minionPlayerId: string }) => void;
```
  </action>
  <verify>npm run check passes with no type errors</verify>
  <done>Minion damage/kill client events and attack_minion client event defined</done>
</task>

<task type="auto">
  <name>Task 3: Add respawn constants to CombatManager</name>
  <files>server/domains/CombatManager.ts</files>
  <action>
Add respawn timing constants to CombatManager class:

```typescript
private readonly MINION_RESPAWN_MIN_MS = 15000;
private readonly MINION_RESPAWN_MAX_MS = 30000;
```
  </action>
  <verify>npm run check passes; CombatManager has respawn constants</verify>
  <done>Minion respawn timing constants defined</done>
</task>

<task type="auto">
  <name>Task 4: Implement playerAttackMinion method</name>
  <files>server/domains/CombatManager.ts</files>
  <action>
Add public playerAttackMinion method:

```typescript
public playerAttackMinion(lobbyId: string, playerId: string, minionPlayerId: string): number {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState || !combatState.boss) {
    throw new CombatNotActiveError(lobbyId);
  }

  // Check player is fighting
  const playerState = combatState.players.get(playerId);
  if (!playerState || playerState.combatState !== 'fighting') {
    throw new PlayerNotInCombatError(playerId);
  }

  // Check minion exists and is alive
  const minion = combatState.minions.get(minionPlayerId);
  if (!minion || !minion.isAlive) {
    return 0;
  }

  // Calculate damage (use player's base damage)
  const playerClass = this.getPlayerClass?.(lobbyId, playerId);
  const baseDamage = this.getClassBaseDamage(playerClass);
  const damage = Math.floor(baseDamage * combatState.battleModifier);

  // Apply damage
  minion.hp = Math.max(0, minion.hp - damage);

  this.eventBus.emit('combat:minion_damaged', {
    lobbyId,
    playerId: minionPlayerId,
    damage,
    newHp: minion.hp,
    attackerId: playerId,
  });

  // Check if minion killed
  if (minion.hp <= 0) {
    this.killMinion(lobbyId, minionPlayerId, playerId);
  }

  return damage;
}
```

Note: If CombatNotActiveError or PlayerNotInCombatError don't exist, create simple error classes or throw generic errors with descriptive messages.
  </action>
  <verify>npm run check passes; playerAttackMinion calculates and applies damage</verify>
  <done>Players can attack minions and deal damage</done>
</task>

<task type="auto">
  <name>Task 5: Implement killMinion and respawnMinion methods</name>
  <files>server/domains/CombatManager.ts</files>
  <action>
Add killMinion method:

```typescript
private killMinion(lobbyId: string, minionPlayerId: string, killerId: string): void {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState) return;

  const minion = combatState.minions.get(minionPlayerId);
  if (!minion) return;

  const respawnDelay = this.MINION_RESPAWN_MIN_MS +
    Math.random() * (this.MINION_RESPAWN_MAX_MS - this.MINION_RESPAWN_MIN_MS);

  minion.isAlive = false;
  minion.hp = 0;
  minion.respawnAt = Date.now() + respawnDelay;

  this.eventBus.emit('combat:minion_killed', {
    lobbyId,
    playerId: minionPlayerId,
    killerId,
    respawnInSeconds: Math.floor(respawnDelay / 1000),
  });

  // Schedule respawn
  setTimeout(() => {
    this.respawnMinion(lobbyId, minionPlayerId);
  }, respawnDelay);
}
```

Add respawnMinion method:

```typescript
private respawnMinion(lobbyId: string, minionPlayerId: string): void {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState || !combatState.boss || combatState.boss.hp <= 0) return;

  const minion = combatState.minions.get(minionPlayerId);
  if (!minion) return;

  // Check if player is still a spectator (they may have switched teams)
  const team = this.getPlayerTeam?.(lobbyId, minionPlayerId);
  if (team !== 'spectators') {
    // Player switched teams, don't respawn
    combatState.minions.delete(minionPlayerId);
    return;
  }

  // Respawn with full HP
  minion.hp = minion.maxHp;
  minion.isAlive = true;
  minion.respawnAt = undefined;

  this.eventBus.emit('combat:minion_spawned', {
    lobbyId,
    playerId: minionPlayerId,
    avatar: 'warrior', // Would get from session in full implementation
    hp: minion.hp,
    maxHp: minion.maxHp,
  });
}
```
  </action>
  <verify>npm run check passes; minion kill triggers respawn after random delay</verify>
  <done>Killed minions respawn after 15-30 seconds</done>
</task>

<task type="auto">
  <name>Task 6: Implement spectator team switch handling</name>
  <files>server/domains/CombatManager.ts</files>
  <action>
Add method to handle when spectator switches to voting team:

```typescript
public handleSpectatorSwitchToVoter(lobbyId: string, playerId: string): void {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState) return;

  const minion = combatState.minions.get(playerId);
  if (minion && minion.isAlive) {
    // Kill the minion immediately (dramatic team switch)
    minion.isAlive = false;
    minion.hp = 0;

    this.eventBus.emit('combat:minion_killed', {
      lobbyId,
      playerId,
      killerId: playerId, // Self-kill on team switch
      respawnInSeconds: 0, // No respawn
    });

    // Remove from minions map entirely (no respawn)
    combatState.minions.delete(playerId);
  }
}
```

Also add public getCombatState getter for use by socketHandlers:

```typescript
public getCombatState(lobbyId: string): LobbyCombatState | undefined {
  return this.combatStates.get(lobbyId);
}
```
  </action>
  <verify>npm run check passes; team switch kills minion without respawn</verify>
  <done>Spectator team switch kills their minion immediately</done>
</task>

<task type="auto">
  <name>Task 7: Wire minion damage/kill events in ClientEventEmitter</name>
  <files>server/events/ClientEventEmitter.ts</files>
  <action>
In setupInternalEventListeners(), add listeners for minion damage and kill:

```typescript
this.eventBus.on('combat:minion_damaged', (payload) => {
  this.emitToLobby(payload.lobbyId, 'combat:minion_damaged', {
    playerId: payload.playerId,
    damage: payload.damage,
    newHp: payload.newHp,
    attackerId: payload.attackerId,
  });
});

this.eventBus.on('combat:minion_killed', (payload) => {
  this.emitToLobby(payload.lobbyId, 'combat:minion_killed', {
    playerId: payload.playerId,
    killerId: payload.killerId,
    respawnInSeconds: payload.respawnInSeconds,
  });
});
```
  </action>
  <verify>npm run check passes; ClientEventEmitter forwards damage/kill events</verify>
  <done>Minion damage and kill events forwarded to clients</done>
</task>

<task type="auto">
  <name>Task 8: Add attack_minion socket handler</name>
  <files>server/socketHandlers.ts</files>
  <action>
Add socket handler for attack_minion event:

```typescript
socket.on('attack_minion', (data: { minionPlayerId: string }) => {
  try {
    const lobbyId = playerToLobby.get(socket.data.playerId);
    if (!lobbyId) return;

    const damage = combatManager.playerAttackMinion(
      lobbyId,
      socket.data.playerId,
      data.minionPlayerId
    );

    // Combat events are emitted by CombatManager, no additional emit needed
  } catch (error) {
    socket.emit('game_error', { message: (error as Error).message });
  }
});
```
  </action>
  <verify>npm run check passes; attack_minion handler exists in socketHandlers</verify>
  <done>Socket handler routes attack_minion to CombatManager</done>
</task>

<task type="auto">
  <name>Task 9: Add minion damage/kill handlers to client store</name>
  <files>client/src/lib/stores/useGameStore.tsx</files>
  <action>
Add socket event handlers for minion damage and kill:

```typescript
socket.on('combat:minion_damaged', (data) => {
  const { minions } = get();
  const minion = minions.get(data.playerId);
  if (minion) {
    const newMinions = new Map(minions);
    newMinions.set(data.playerId, {
      ...minion,
      hp: data.newHp,
    });
    set({ minions: newMinions });
  }
});

socket.on('combat:minion_killed', (data) => {
  const { minions } = get();
  const minion = minions.get(data.playerId);
  if (minion) {
    const newMinions = new Map(minions);
    newMinions.set(data.playerId, {
      ...minion,
      hp: 0,
      isAlive: false,
    });
    set({ minions: newMinions });

    // If respawn scheduled (respawnInSeconds > 0), minion will re-appear via minion_spawned
    // If no respawn (team switched), remove from map after animation
    if (data.respawnInSeconds === 0) {
      setTimeout(() => {
        const { minions: currentMinions } = get();
        const updated = new Map(currentMinions);
        updated.delete(data.playerId);
        set({ minions: updated });
      }, 1000);
    }
  }
});
```
  </action>
  <verify>npm run check passes; client store handles minion damage and kill</verify>
  <done>Client store updates minion state on damage and kill events</done>
</task>

<task type="auto">
  <name>Task 10: Create MinionDisplay component</name>
  <files>client/src/components/game/MinionDisplay.tsx</files>
  <action>
Create new file with minion display component:

```typescript
import { useGameStore } from '@/lib/stores/useGameStore';
import { useSocket } from '@/lib/socket';

interface MinionDisplayProps {
  className?: string;
}

export function MinionDisplay({ className }: MinionDisplayProps) {
  const minions = useGameStore((state) => state.minions);
  const { socket } = useSocket();

  const handleAttackMinion = (minionPlayerId: string) => {
    socket?.emit('attack_minion', { minionPlayerId });
  };

  const minionArray = Array.from(minions.values());

  if (minionArray.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="text-sm font-bold text-purple-400 mb-1">Enemy Minions</div>
      {minionArray.map((minion) => (
        <div
          key={minion.playerId}
          className={`
            relative p-3 rounded-lg border-2 cursor-pointer transition-all
            ${minion.isAlive
              ? 'border-purple-600 bg-purple-900/50 hover:border-purple-400 hover:bg-purple-800/50'
              : 'border-gray-600 bg-gray-900/50 opacity-50 cursor-not-allowed'
            }
          `}
          onClick={() => minion.isAlive && handleAttackMinion(minion.playerId)}
        >
          {/* Dark aura effect for alive minions */}
          {minion.isAlive && (
            <div className="absolute inset-0 rounded-lg bg-purple-500/20 animate-pulse pointer-events-none" />
          )}

          {/* Minion content */}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">
                {minion.isAlive ? 'Corrupted Minion' : 'Defeated'}
              </span>
              <span className="text-purple-300 text-sm">
                {minion.hp}/{minion.maxHp}
              </span>
            </div>

            {/* HP Bar */}
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${(minion.hp / minion.maxHp) * 100}%` }}
              />
            </div>

            {/* Attack hint */}
            {minion.isAlive && (
              <div className="text-xs text-purple-300 mt-1 text-center">
                Click to attack
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```
  </action>
  <verify>npm run check passes; MinionDisplay.tsx exists and exports component</verify>
  <done>MinionDisplay component shows minions with HP bars and click-to-attack</done>
</task>

<task type="auto">
  <name>Task 11: Integrate MinionDisplay into BattlePhase</name>
  <files>client/src/components/game/phases/BattlePhase.tsx</files>
  <action>
1. Add import at top of file:
```typescript
import { MinionDisplay } from '@/components/game/MinionDisplay';
```

2. Add MinionDisplay to the component's JSX. Position it in the right sidebar or below the boss display area, wherever enemy information is shown:

```typescript
{/* Add in the enemy/boss section of the battle UI */}
<MinionDisplay className="mt-4" />
```

Position: Place as sibling to boss health display or in a sidebar showing enemy information. The component handles its own visibility (returns null if no minions).
  </action>
  <verify>npm run check passes; BattlePhase imports and renders MinionDisplay</verify>
  <done>MinionDisplay integrated into BattlePhase component tree</done>
</task>

</tasks>

<verification>
```bash
npm run check
npm test
```

Specific minion interaction tests:
1. Verify player can attack alive minion via attack_minion socket event
2. Verify minion HP decreases when attacked
3. Verify minion_killed event fires when HP reaches 0
4. Verify minion respawns after 15-30 seconds (random)
5. Verify spectator switching to voter kills their minion with respawnInSeconds=0
6. Verify MinionDisplay shows minion HP bars
7. Verify clicking alive minion emits attack_minion event
</verification>

<success_criteria>
- [ ] npm run check passes with no type errors
- [ ] npm test passes with no regressions
- [ ] Minion damage and kill events defined
- [ ] playerAttackMinion calculates and applies damage
- [ ] Killed minions respawn after 15-30 seconds
- [ ] Team switch kills minion without respawn
- [ ] attack_minion socket handler works
- [ ] Client store updates minion state correctly
- [ ] MinionDisplay shows minions with targeting
- [ ] getCombatState getter available for integration
</success_criteria>

<output>
After completion, create `.planning/phases/06-new-flow-implementation/06-03b-SUMMARY.md`
</output>
