# Phase 48: Testability Seams - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 7 (4 modified, 3 new)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/gameState.ts` | service/singleton | CRUD + event-driven | `server/domains/CombatManager.ts` (constructor deps pattern) | role-match |
| `server/domains/CombatManager.ts` | service | CRUD + event-driven | `server/domains/SessionManager.ts` (DI constructor) | exact |
| `server/domains/index.ts` | wiring/factory | event-driven | `server/domains/index.ts` itself (9 existing listeners) | self-analog |
| `server/gameState.test.ts` | test | CRUD | `server/domains/SessionManager.test.ts` | exact |
| `server/test/makeMockSocket.ts` | test utility | request-response | `client/src/lib/socket/eventHandlers.test.ts` (makeMockSocket) | exact |
| `server/domains/index.test.ts` | test | event-driven | `server/domains/AbilityEffectHandler.test.ts` | role-match |
| `server/websocket.handlers.test.ts` | test | request-response | `client/src/lib/socket/eventHandlers.test.ts` | role-match |

---

## Pattern Assignments

### `server/gameState.ts` (MAINT-01 — export class + constructor opts)

**Analog:** `server/domains/CombatManager.ts` (constructor-injectable domain manager pattern)

**Current state** (`server/gameState.ts` lines 39–70):
```typescript
// BEFORE — class is NOT exported; constructor starts timers unconditionally
class GameStateManager {
  private lobbies: Map<string, Lobby> = new Map();
  private revivalWatchdog: NodeJS.Timeout;
  private disconnectWatchdog: NodeJS.Timeout;

  constructor(io?: SocketIOServer) {
    this.io = io;
    this.revivalWatchdog = setInterval(() => {
      this.processRevivalSessions();
    }, 100);
    this.disconnectWatchdog = setInterval(() => {
      this.processDisconnectedPlayers();
    }, 30000);
  }

  private handleVotingTimeout(lobbyId: string): void { ... }   // line 1435
}
export const gameState = new GameStateManager();    // line 2111
```

**Target pattern** — copy constructor-opts guard from `CombatManager.ts` lines 196–211 (DI constructor shape):
```typescript
// AFTER — export class; add opts; promote handleVotingTimeout to public
export class GameStateManager {
  constructor(io?: SocketIOServer, opts?: { startWatchdogs?: boolean }) {
    this.io = io;
    const startWatchdogs = opts?.startWatchdogs ?? true;
    if (startWatchdogs) {
      this.revivalWatchdog = setInterval(() => { this.processRevivalSessions(); }, 100);
      this.disconnectWatchdog = setInterval(() => { this.processDisconnectedPlayers(); }, 30000);
    }
  }
  public handleVotingTimeout(lobbyId: string): void { ... }   // keyword change only
}
export const gameState = new GameStateManager();    // unchanged — line 2111
export function setGameStateIO(io: SocketIOServer) { ... }    // unchanged — line 2114
```

**Keyword changes only (3 total):**
- `class` → `export class` (line 39)
- `private handleVotingTimeout` → `public handleVotingTimeout` (line 1435)
- Constructor signature adds `opts?: { startWatchdogs?: boolean }` and wraps the two `setInterval` calls in `if (startWatchdogs)`

**Import sites that need NO change:** `server/websocket.ts` line 11 imports `{ gameState, setGameStateIO }` — singleton export is unchanged.

---

### `server/domains/CombatManager.ts` (MAINT-02 — add damageInterceptor dep)

**Analog:** `server/domains/SessionManager.ts` and `server/domains/CombatManager.ts` itself (existing `CombatManagerDeps` interface pattern at lines 37–48)

**Existing `CombatManagerDeps` interface** (`server/domains/CombatManager.ts` lines 37–48):
```typescript
export interface CombatManagerDeps {
  eventBus: ScopedEventBus;
  getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;
  getPlayerClass?: (lobbyId: string, playerId: string) => AvatarClass | null;
  classMasteryManager?: {
    getMasteryMultiplier: (lobbyId: string, playerId: string, avatarClass: AvatarClass | null) => number;
    getUnlockedAbilities: (lobbyId: string, playerId: string, avatarClass: AvatarClass | null) => string[];
  };
  progressionManager?: {
    getPlayerLevel: (lobbyId: string, playerId: string) => number;
  };
}
```

**Existing constructor storing deps** (`server/domains/CombatManager.ts` lines 196–211):
```typescript
// Dependencies (private readonly fields — lines 190–194)
private readonly eventBus: ScopedEventBus;
private readonly getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;
private readonly getPlayerClass?: (lobbyId: string, playerId: string) => AvatarClass | null;
private readonly classMasteryManager: CombatManagerDeps['classMasteryManager'];
private readonly progressionManager: CombatManagerDeps['progressionManager'];

constructor(deps: CombatManagerDeps) {
  this.eventBus = deps.eventBus;
  this.getPlayerTeam = deps.getPlayerTeam;
  this.getPlayerClass = deps.getPlayerClass;
  this.classMasteryManager = deps.classMasteryManager;
  this.progressionManager = deps.progressionManager;

  this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
  this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
  this.eventBus.on('session:lobby_destroyed', this.handleLobbyDestroyed.bind(this));
  this.eventBus.on('estimation:full_consensus_reached', this.handleFullConsensus.bind(this));
}
```

**Existing `applyDamageToPlayer` method** (lines 1257–1294 — the body to rename `applyDamageToPlayerRaw`):
```typescript
applyDamageToPlayer(lobbyId: string, playerId: string, damage: number): void {
  const combatState = this.combatStates.get(lobbyId);
  if (!combatState) { throw new CombatNotActiveError(lobbyId); }
  const playerState = combatState.players.get(playerId);
  if (!playerState) { throw new PlayerNotInCombatError(playerId); }

  const oldHp = playerState.hp;
  playerState.hp = Math.max(0, playerState.hp - damage);
  this.eventBus.emit('combat:player_damaged', { lobbyId, playerId, damage, playerHealth: playerState.hp });
  // ... revival interruption and downed check ...
}
```

**7 internal call sites to route through interceptor** (all are `this.applyDamageToPlayer(...)`):
| Line | Attack context |
|------|---------------|
| 805 | Minion attacks random fighting player |
| 1029 | Pattern AoE attack (telegraphed, after delay) |
| 1035 | Pattern AoE attack (instant) |
| 1148 | Legacy AoE all fighting players (telegraphed, after delay) |
| 1156 | Legacy AoE all fighting players (instant) |
| 1186 | Legacy single-target attack (telegraphed, after delay) |
| 1190 | Legacy single-target attack (instant) |

**Target additions to interface, fields, and constructor:**
```typescript
// Add to CombatManagerDeps (after progressionManager):
damageInterceptor?: (
  lobbyId: string,
  playerId: string,
  damage: number,
  applyFn: (lobbyId: string, playerId: string, damage: number) => void
) => void;

// Add private field:
private readonly damageInterceptor: NonNullable<CombatManagerDeps['damageInterceptor']>;

// Add to constructor body (after existing dep assignments):
this.damageInterceptor = deps.damageInterceptor ??
  ((lobbyId, playerId, damage, applyFn) => { applyFn(lobbyId, playerId, damage); });

// Rename existing applyDamageToPlayer → applyDamageToPlayerRaw (private):
private applyDamageToPlayerRaw(lobbyId: string, playerId: string, damage: number): void {
  // ... existing body unchanged ...
}

// New public applyDamageToPlayer routes through interceptor:
applyDamageToPlayer(lobbyId: string, playerId: string, damage: number): void {
  this.damageInterceptor(lobbyId, playerId, damage,
    (l, p, d) => this.applyDamageToPlayerRaw(l, p, d));
}
```

**Critical constraint:** All 7 call sites at lines 805, 1029, 1035, 1148, 1156, 1186, 1190 remain as `this.applyDamageToPlayer(...)` — they automatically route through the interceptor because the public method now delegates to it. Do NOT rewrite any call site to `this.applyDamageToPlayerRaw(...)`.

---

### `server/domains/index.ts` (MAINT-02 partial + MAINT-03)

**Analog:** The file itself — the 9 existing `eventBus.on(...)` registrations at lines 385–550 are the exact code to extract into `wireDomains`.

**Monkey-patch to DELETE** (lines 462–486 — verbatim):
```typescript
// Wrap CombatManager.applyDamageToPlayer to apply shield absorption
const originalApplyDamage = combatManager.applyDamageToPlayer.bind(combatManager);
combatManager.applyDamageToPlayer = (lobbyId: string, playerId: string, damage: number) => {
  const remainingDamage = reduceShield(lobbyId, playerId, damage);
  if (remainingDamage <= 0) {
    eventBus.emit('combat:shield_absorbed', {
      lobbyId, playerId, absorbed: damage,
      shieldRemaining: getShieldAbsorption(lobbyId, playerId),
    });
    return;
  }
  if (remainingDamage < damage) {
    eventBus.emit('combat:shield_absorbed', {
      lobbyId, playerId, absorbed: damage - remainingDamage,
      shieldRemaining: getShieldAbsorption(lobbyId, playerId),
    });
  }
  originalApplyDamage(lobbyId, playerId, remainingDamage);
};
```

**CombatManager construction site** (lines 97–130) — must add `damageInterceptor` dep here (shield logic that was in the monkey-patch moves here as a constructor dep):
```typescript
const combatManager = new CombatManager({
  eventBus,
  getPlayerTeam: ...,
  getPlayerClass: ...,
  classMasteryManager: { ... },
  progressionManager: { ... },
  // NEW — shield absorption replaces monkey-patch:
  damageInterceptor: (lobbyId, playerId, damage, applyFn) => {
    const remainingDamage = reduceShield(lobbyId, playerId, damage);
    if (remainingDamage <= 0) {
      eventBus.emit('combat:shield_absorbed', {
        lobbyId, playerId, absorbed: damage,
        shieldRemaining: getShieldAbsorption(lobbyId, playerId),
      });
      return;
    }
    if (remainingDamage < damage) {
      eventBus.emit('combat:shield_absorbed', {
        lobbyId, playerId, absorbed: damage - remainingDamage,
        shieldRemaining: getShieldAbsorption(lobbyId, playerId),
      });
    }
    applyFn(lobbyId, playerId, remainingDamage);
  },
});
```

**The 9 listeners to extract into `wireDomains`** (lines 385–550):

| Line | Event | Handler body |
|------|-------|-------------|
| 385 | `combat:battle_initialized` | `abilityManager.resetCooldowns(payload.lobbyId)` |
| 390 | `session:lobby_destroyed` | `abilityManager.cleanupLobby(payload.lobbyId)` |
| 395 | `combat:battle_initialized` | `comboManager.resetCombos(payload.lobbyId)` |
| 400 | `session:lobby_destroyed` | `comboManager.cleanupLobby(payload.lobbyId)` |
| 405 | `session:lobby_destroyed` | `itemManager.cleanupLobby + cleanupBuffs + cleanupDebuffs + statsTracker.cleanupLobby` |
| 413 | `estimation:discussion_ended` | award items to all non-spectator players |
| 424 | `item:effect_applied` | heal / buff / shield branches |
| 450 | `combat:boss_damaged` | damage_boost bonus damage |
| 489 | `ability:effect_applied` | damage / heal / buff / shield / debuff / taunt branches |

**wireDomains factory target shape:**
```typescript
export interface WireDomainsContext {
  eventBus: ScopedEventBus;
  abilityManager: AbilityManager;
  comboManager: ComboManager;
  itemManager: ItemManager;
  combatManager: CombatManager;
  statsTracker: StatsTracker;
  sessionManager: SessionManager;
}

export function wireDomains(ctx: WireDomainsContext): { dispose(): void } {
  const { eventBus } = ctx;

  // Store each listener in a named const — required so eventBus.off() can
  // remove them individually (Pitfall 5: arrow functions produce new refs).
  const onBattleInitAbility = (payload: { lobbyId: string }) => {
    ctx.abilityManager.resetCooldowns(payload.lobbyId);
  };
  eventBus.on('combat:battle_initialized', onBattleInitAbility);

  // ... all 9 registrations (each listener in a named const) ...

  return {
    dispose() {
      eventBus.off('combat:battle_initialized', onBattleInitAbility);
      // ... matching off() for each named const ...
    }
  };
}

// Module bottom — production call, result discarded (unchanged runtime behavior):
wireDomains({ eventBus, abilityManager, comboManager, itemManager,
              combatManager, statsTracker, sessionManager });
```

**Key constraint — closure over module-private helpers:** `wireDomains` is defined inside `domains/index.ts` so it can close over `activeBuffs`, `activeDebuffs`, `reduceShield`, `addBuff`, `addDebuff`, `cleanupBuffs`, `cleanupDebuffs`, `getDamageMultiplier`, `getShieldAbsorption`, and `applyHealEffect` without exposing them.

---

### `server/gameState.test.ts` (MAINT-01 — new describe block)

**Analog:** `server/domains/SessionManager.test.ts` lines 1–19 (constructor-injectable fixture setup)

**SessionManager.test.ts fixture pattern** (lines 1–19):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from './SessionManager';
import { ScopedEventBus } from '../events';
import { LobbyNotFoundError, PlayerNotFoundError, PlayerNotHostError } from '../errors/SessionErrors';

describe('SessionManager - Lobby Lifecycle', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
  });
  // ...
```

**Existing `as any` pattern in gameState.test.ts** (line 16) — acceptable in existing tests, must NOT appear in new MAINT-01 tests:
```typescript
const gs = gameState as any; // private members access — existing characterization tests only
```

**New describe block target pattern** (add to end of `server/gameState.test.ts`):
```typescript
import { GameStateManager } from './gameState';   // named import — class now exported

describe('GameStateManager — MAINT-01 testability seam', () => {
  it('constructs without starting timers when startWatchdogs: false', () => {
    // No leaked setInterval — safe for test environments
    const gs = new GameStateManager(undefined, { startWatchdogs: false });
    expect(gs).toBeInstanceOf(GameStateManager);
  });

  it('handleVotingTimeout is callable without as any', () => {
    const gs = new GameStateManager(undefined, { startWatchdogs: false });
    const lobby = gs.createLobby('Host', 'Test Lobby');
    // Advance to battle phase
    // ... setup via gs.createLobby(...) and public API only ...
    // gs.handleVotingTimeout(lobbyId) — callable directly; no as any needed
  });
});
```

**Key constraint:** New tests use `gs.createLobby(...)` for fixture setup (public API). The `gs.lobbies.set(...)` via `as any` pattern from existing tests is acceptable to leave in existing describes but must not appear in new MAINT-01 describes.

---

### `server/test/makeMockSocket.ts` (NEW — MAINT-03)

**Analog:** `client/src/lib/socket/eventHandlers.test.ts` lines 18–31 (direct model to mirror and extend)

**Client `makeMockSocket` pattern** (lines 18–31 — verbatim):
```typescript
function makeMockSocket(): { socket: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const socket = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    // Mirrors socket.io-client Emitter.listeners — used by the H1 recovery
    // re-dispatch bridge to re-apply buffered/missed events.
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
  };
  return { socket, handlers };
}
```

**Server-side extension needed** — server socket handlers also access:
- `socket.data.playerId` / `socket.data.lobbyId` / `socket.data.userId` (written during handler execution)
- `socket.join(lobbyId)` — called in `create_lobby` (line 427) and `reconnect_with_token` (line 1744)
- `socket.emit(eventName, payload)` — `lobby_created`, `lobby_sync`, `game_error`, `reconnect_response`, `progression:sync`

**New file target** (`server/test/makeMockSocket.ts`):
```typescript
import { vi } from 'vitest';

export function makeMockSocket() {
  const handlers = new Map<string, (data: unknown) => void>();
  const emitted: Array<{ event: string; data: unknown }> = [];
  const joinedRooms: string[] = [];
  const socket = {
    data: {} as Record<string, unknown>,
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event, data });
    }),
    join: vi.fn((room: string) => { joinedRooms.push(room); }),
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
    id: 'mock-socket-id',
  };
  return { socket, handlers, emitted, joinedRooms };
}
```

---

### `server/domains/index.test.ts` (NEW — MAINT-03a)

**Analog:** `server/domains/AbilityEffectHandler.test.ts` (integration test importing from `./index`, using `eventBus` directly, `afterEach` cleanup via `session:lobby_destroyed`)

**AbilityEffectHandler.test.ts setup/teardown pattern** (lines 18–62):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus, combatManager } from './index';
import { TeamType } from '../../shared/gameEvents';

const LOBBY = 'test-ability-handler-lobby';

describe('AbilityEffectHandler — heal dedup (applyHealEffect)', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emitSpy = vi.spyOn(eventBus, 'emit');
    setupFightingPlayer('healer-player', 50, 100);
  });

  afterEach(() => {
    emitSpy.mockRestore();
    eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
  });
  // ...
```

**index.test.ts target pattern for wireDomains dispose:**
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { wireDomains } from './index';
import { ScopedEventBus } from '../events';

describe('wireDomains — dispose removes all 9 listeners', () => {
  let testBus: ScopedEventBus;
  let dispose: () => void;

  afterEach(() => {
    dispose?.();
  });

  it('dispose() removes all registered listeners (listener count returns to 0)', () => {
    testBus = new ScopedEventBus();
    // Construct minimal mocks for WireDomainsContext deps
    const mockDeps = { /* ... */ };
    ({ dispose } = wireDomains({ eventBus: testBus, ...mockDeps }));

    const countBefore = testBus.listenerCount('combat:battle_initialized');
    dispose();
    const countAfter = testBus.listenerCount('combat:battle_initialized');
    expect(countAfter).toBeLessThan(countBefore);
  });
});
```

**Critical:** Pass a fresh `new ScopedEventBus()` (not the module-level `eventBus`) to avoid accumulating listeners on the shared singleton and triggering `MaxListenersExceededWarning`.

---

### `server/websocket.handlers.test.ts` (NEW — MAINT-03b/c/d)

**Analog:** `client/src/lib/socket/eventHandlers.test.ts` (full handler test pattern — install mock socket, call `setupEventHandlers`, extract registered handler, invoke with payload, assert emitted events)

**Client eventHandlers.test.ts handler invocation pattern** (lines 57–120):
```typescript
describe('Phase 45-01 handler regression coverage', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    // ...
  });

  it('session:phase_changed updates game phase', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket as any);   // registers all handlers via socket.on(...)

    const handler = handlers.get('session:phase_changed');
    expect(handler).toBeDefined();
    handler!({ gamePhase: 'battle', seq: 1, timestamp: Date.now() });

    expect(useGameState.getState().gamePhase).toBe('battle');
  });
});
```

**Server-side analog target pattern for `create_lobby` handler test:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeMockSocket } from './test/makeMockSocket';
// Handler extraction approach: extract create_lobby body to
// server/websocket.handlers.ts as handleCreateLobby(socket, deps)
import { handleCreateLobby } from './websocket.handlers';

describe('create_lobby handler', () => {
  it('emits lobby_created and joins the lobby room', () => {
    const { socket, emitted, joinedRooms } = makeMockSocket();
    // Call the extracted handler directly with mock deps
    handleCreateLobby(socket as any, {
      lobbyName: 'Sprint 42',
      hostName: 'Alice',
      initialSettings: undefined,
    }, mockDeps);

    expect(joinedRooms).toContain(/* lobbyId */);
    const created = emitted.find(e => e.event === 'lobby_created');
    expect(created).toBeDefined();
  });
});
```

**Key structural decision (planner must choose):**
- Option A: Extract `create_lobby`, `disconnect`, `reconnect_with_token` handler bodies to `server/websocket.handlers.ts` as `handleCreateLobby(socket, data, deps)` etc. Tests import and call directly.
- Option B: Inject mock domain singletons into `setupWebSocket` via optional 4th param. Tests call `setupWebSocket` on a fake httpServer.
- Research recommendation: Option A — minimal surface, 3 extracted functions only, no `HandlerCtx` overhaul.

---

## Shared Patterns

### Constructor-Injectable Domain Manager (DI Template)
**Source:** `server/domains/CombatManager.ts` lines 37–48 (interface) + 190–211 (constructor)
**Apply to:** `server/gameState.ts` (MAINT-01), `server/domains/CombatManager.ts` (MAINT-02)

The pattern: define a `Deps` interface with optional fields (`?:`), store each as `private readonly`, assign in constructor, provide defaults via `??` for optional deps.

```typescript
// Interface pattern (CombatManager.ts lines 37-48):
export interface CombatManagerDeps {
  eventBus: ScopedEventBus;          // required
  getPlayerTeam?: (...) => T | null; // optional callback
  classMasteryManager?: { ... };     // optional sub-interface
}

// Constructor pattern (CombatManager.ts lines 196-211):
private readonly eventBus: ScopedEventBus;
private readonly getPlayerTeam?: (...) => T | null;

constructor(deps: CombatManagerDeps) {
  this.eventBus = deps.eventBus;
  this.getPlayerTeam = deps.getPlayerTeam;
  // optional with default:
  this.damageInterceptor = deps.damageInterceptor ??
    ((lobbyId, playerId, damage, applyFn) => applyFn(lobbyId, playerId, damage));
}
```

### Fresh ScopedEventBus Per Test
**Source:** `server/domains/SessionManager.test.ts` lines 16–18, `server/domains/CombatManager.test.ts` lines 18–39
**Apply to:** `server/gameState.test.ts` (new describe), `server/domains/index.test.ts`

```typescript
// CombatManager.test.ts lines 18-39:
beforeEach(() => {
  eventBus = new ScopedEventBus();
  combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });
});
```

Never reuse the module-level `eventBus` singleton in tests for `wireDomains` — always create `new ScopedEventBus()` to avoid `MaxListenersExceededWarning`.

### afterEach Cleanup via Domain Event
**Source:** `server/domains/AbilityEffectHandler.test.ts` lines 58–62
**Apply to:** All server domain tests that create combat/lobby state

```typescript
afterEach(() => {
  emitSpy.mockRestore();
  eventBus.emit('session:lobby_destroyed', { lobbyId: LOBBY });
});
```

### afterEach dispose() for wireDomains
**Source:** No existing analog — this is a new pattern for Phase 48
**Apply to:** `server/domains/index.test.ts` (MAINT-03a)

```typescript
afterEach(() => {
  dispose?.();  // removes all 9 listeners; prevents MaxListenersExceededWarning
});
```

### vi.spyOn for eventBus assertions
**Source:** `server/domains/AbilityEffectHandler.test.ts` lines 51–54, 259
**Apply to:** `server/domains/index.test.ts`, `server/websocket.handlers.test.ts`

```typescript
let emitSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  emitSpy = vi.spyOn(eventBus, 'emit');
});
// Assert by filtering emitSpy.mock.calls for specific event name:
const shieldEmits = emitSpy.mock.calls.filter(c => c[0] === 'combat:shield_absorbed');
expect(shieldEmits.length).toBeGreaterThan(0);
```

---

## No Analog Found

All files in this phase have strong analogs. No file requires falling back to RESEARCH.md patterns alone.

---

## Pitfalls for Planner to Encode in Tasks

1. **All 7 call sites must stay as `this.applyDamageToPlayer`** — none may be accidentally changed to `this.applyDamageToPlayerRaw`. The public method now delegates to the interceptor, so existing call sites get shield routing for free.

2. **Three distinct `session:lobby_destroyed` listeners** (lines 390, 400, 405) — each must be stored in a named `const` before passing to `eventBus.on()`. `eventBus.off()` requires the same function reference that was passed to `on()`.

3. **Production `combatManager` construction must include `damageInterceptor`** — without it, the optional dep defaults to a pass-through, silently breaking shield absorption. The existing `AbilityEffectHandler.test.ts` shield tests (lines 258–306) will catch this regression immediately.

4. **`handleVotingTimeout` calls `this.io` via `emitRevealCascade`** — in tests without `io` injected, `emitRevealCascade` no-ops (`if (!this.io) return`). The phase mutation still fires. This is expected behavior; document in test comments.

5. **`wireDomains` tests must pass fresh `ScopedEventBus`** — not the module singleton — to avoid accumulating listeners beyond `EventEmitter.defaultMaxListeners` (10).

---

## Metadata

**Analog search scope:** `server/`, `server/domains/`, `client/src/lib/socket/`
**Files read:** 10 source files + 1 config
**Pattern extraction date:** 2026-06-22
