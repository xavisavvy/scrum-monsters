# Phase 48: Testability Seams - Research

**Researched:** 2026-06-22
**Domain:** Server-side TypeScript refactoring — dependency injection, constructor design, module-scope side-effects
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAINT-01 | `GameStateManager` exported and constructable with `{ startWatchdogs?: boolean }` (default true); `handleVotingTimeout` promoted to public; tests instantiate with no `as any` and no leaked timers | Fully mapped — class exists at `server/gameState.ts:39`, singleton at L2111, `handleVotingTimeout` is `private` at L1435, watchdog `setInterval` at L62 and L67 |
| MAINT-02 | Module-scope monkey-patch of `combatManager.applyDamageToPlayer` replaced by first-class `damageInterceptor` dependency; all 7 internal `this.applyDamageToPlayer` call sites verified to route through it | Monkey-patch located at `server/domains/index.ts:463-486`, 7 internal call sites confirmed in `CombatManager.ts`: L805, L1029, L1035, L1148, L1156, L1186, L1190 |
| MAINT-03 | Domain wiring becomes `wireDomains(deps): { dispose() }` factory (production call at module bottom unchanged); server-side `makeMockSocket` enables unit tests for `create_lobby`, disconnect/host-transfer, `reconnect_with_token` | Index wiring documented; 9 `eventBus.on` registrations at module scope; client `makeMockSocket` pattern at `client/src/lib/socket/eventHandlers.test.ts:18-31` confirmed as the model |

</phase_requirements>

---

## Summary

Phase 48 is a pure-refactor phase: zero runtime behavior change, full test suite stays green. The goal is to open three "testability seams" in the server — constructor-injectable `GameStateManager`, a first-class `damageInterceptor` dependency in `CombatManager`, and a `wireDomains` factory with a `dispose()` method — plus a server-side `makeMockSocket` helper that lets socket-handler tests run without a live Socket.IO server.

All three seams are independently viable: they have no sequencing dependencies between them within the phase, and none touch shared data structures. The biggest risk is the `damageInterceptor` seam: the shield monkey-patch in `domains/index.ts` replaces `combatManager.applyDamageToPlayer` at module scope, meaning `CombatManager`'s own unit tests currently run against the *unpatched* method and therefore cannot test shield absorption. Replacing that with a constructor-injectable interceptor closes the gap without changing runtime behavior.

The existing test infrastructure is good: Vitest, 890 passing tests, domain managers are already constructor-injectable (see `SessionManager`, `CombatManager`). One `MaxListenersExceededWarning` exists from the `AbilityEffectHandler.test.ts` file importing `domains/index` — this is a pre-existing issue, not caused by Phase 48, but `wireDomains` refactoring may surface more warnings if tests import the wiring factory multiple times without calling `dispose()`.

**Primary recommendation:** Implement the three seams in order of increasing scope: MAINT-01 (3 keyword changes), then MAINT-02 (CombatManager constructor + 7 call sites + remove monkey-patch), then MAINT-03 (wireDomains factory + makeMockSocket + 3 handler tests).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GameState construction / watchdog lifecycle | API / Backend | — | `GameStateManager` is a server-side singleton; `startWatchdogs` flag is a server-side concern only |
| Shield absorption (damageInterceptor) | API / Backend | — | Buff/shield state lives in `domains/index.ts` module scope; damage routing belongs with CombatManager's dep injection |
| Domain event wiring | API / Backend | — | `eventBus.on` registrations in `domains/index.ts` are server-internal only |
| Mock socket / handler tests | API / Backend | — | Socket handler tests run Node.js-side using a plain object; no browser/DOM needed |

---

## Standard Stack

This phase introduces no new dependencies. All tooling is already installed.

### Core (all pre-existing)
| Library | Verified Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| Vitest | 4.1.6 [VERIFIED: npm test output] | Test runner | Project's existing unit test framework |
| happy-dom | (via vitest config) [ASSUMED] | DOM environment | Matches existing `vitest.config.ts` environment |
| TypeScript | (project standard) [ASSUMED] | Type safety | All server code is TypeScript |

### No New Packages
This phase requires zero `npm install` commands. All changes are TypeScript refactors within existing files.

---

## Package Legitimacy Audit

No packages installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
[tests]
   |
   | new GameStateManager({ startWatchdogs: false })    (MAINT-01)
   v
[GameStateManager class] -- exported from server/gameState.ts
   |
   | (no change to production callsite at L2111)
   v
export const gameState = new GameStateManager()  <-- unchanged production singleton

[tests]
   |
   | new CombatManager({ eventBus, damageInterceptor: myFn })  (MAINT-02)
   v
[CombatManager.applyDamageToPlayer]
   |  calls this.damageInterceptor (constructor dep) instead of self
   v
[originalApplyDamageToPlayer]  <-- private, no longer monkey-patched

[index.ts wireDomains factory]  (MAINT-03)
   |  registers 9 eventBus.on listeners
   |  returns { dispose() }  which calls eventBus.off for each
   v
[production: wireDomains(deps) at module bottom, result discarded]

[tests]
   |  const { dispose } = wireDomains(testDeps)
   |  ... run handler ...
   v  dispose()  -- unregisters listeners, no leak
```

### Recommended Project Structure (files touched)

```
server/
├── gameState.ts               # MAINT-01: export class + startWatchdogs + public handleVotingTimeout
├── domains/
│   ├── index.ts               # MAINT-02 + MAINT-03: remove monkey-patch, add wireDomains factory
│   └── CombatManager.ts       # MAINT-02: add damageInterceptor to deps + constructor
server/
└── test/
    ├── makeMockSocket.ts       # MAINT-03: new helper file
    └── (or colocated in websocket handlers test file)
server/
└── gameState.test.ts          # MAINT-01: add new describe block using constructor directly
server/domains/
└── AbilityEffectHandler.test.ts   # MAINT-02: verify shield tests now exercise real interceptor
```

### Pattern 1: Constructor-Injectable Singleton (MAINT-01)

**What:** Export the class in addition to the singleton. Constructor accepts `opts` that gate expensive side effects (timers) for tests.

**When to use:** Any singleton that starts `setInterval`/`setTimeout` at construction time.

**Current code (server/gameState.ts L39-70):**
```typescript
// BEFORE:
class GameStateManager {   // NOT exported
  constructor(io?: SocketIOServer) {
    this.io = io;
    this.revivalWatchdog = setInterval(() => { this.processRevivalSessions(); }, 100);
    this.disconnectWatchdog = setInterval(() => { this.processDisconnectedPlayers(); }, 30000);
  }
  private handleVotingTimeout(lobbyId: string): void { ... }  // private
}
export const gameState = new GameStateManager();  // L2111
```

**Target code:**
```typescript
// AFTER:
export class GameStateManager {   // exported
  constructor(io?: SocketIOServer, opts?: { startWatchdogs?: boolean }) {
    this.io = io;
    const startWatchdogs = opts?.startWatchdogs ?? true;
    if (startWatchdogs) {
      this.revivalWatchdog = setInterval(() => { this.processRevivalSessions(); }, 100);
      this.disconnectWatchdog = setInterval(() => { this.processDisconnectedPlayers(); }, 30000);
    }
  }
  public handleVotingTimeout(lobbyId: string): void { ... }  // promoted to public
}
export const gameState = new GameStateManager();  // unchanged — startWatchdogs defaults to true
```

**Test pattern:**
```typescript
// server/gameState.test.ts (new describe block)
import { GameStateManager } from './gameState';  // no `as any` needed

it('handleVotingTimeout advances to reveal when votes exist', () => {
  const gs = new GameStateManager(undefined, { startWatchdogs: false });
  // ... inject lobby via gs.lobbies.set (private, need accessor) or gs.createLobby(...)
  gs.handleVotingTimeout(lobbyId);
  expect(gs.getLobby(lobbyId)?.gamePhase).toBe('reveal');
});
```

**Import sites that need NO change:** `server/websocket.ts:11` imports `{ gameState, setGameStateIO }` — the singleton export is unchanged.

### Pattern 2: First-Class damageInterceptor (MAINT-02)

**What:** Replace the module-scope monkey-patch with a constructor dependency. `CombatManager` stores it as a private field and uses it wherever `this.applyDamageToPlayer` is called internally.

**The monkey-patch (domains/index.ts:462-486) currently:**
```typescript
// Wrap CombatManager.applyDamageToPlayer to apply shield absorption
const originalApplyDamage = combatManager.applyDamageToPlayer.bind(combatManager);
combatManager.applyDamageToPlayer = (lobbyId, playerId, damage) => {
  const remainingDamage = reduceShield(lobbyId, playerId, damage);
  if (remainingDamage <= 0) {
    eventBus.emit('combat:shield_absorbed', { lobbyId, playerId, absorbed: damage,
      shieldRemaining: getShieldAbsorption(lobbyId, playerId) });
    return;
  }
  if (remainingDamage < damage) {
    eventBus.emit('combat:shield_absorbed', { lobbyId, playerId,
      absorbed: damage - remainingDamage,
      shieldRemaining: getShieldAbsorption(lobbyId, playerId) });
  }
  originalApplyDamage(lobbyId, playerId, remainingDamage);
};
```

**The 7 internal call sites in CombatManager.ts:**
| Line | Context | Trigger |
|------|---------|---------|
| L805 | Minion attacks random fighting player | `MINION_ATTACK_DAMAGE` constant |
| L1029 | Pattern-based AoE attack (telegraphed, after delay) | `scaledDamage` from `getBossAttackDamage` |
| L1035 | Pattern-based AoE attack (instant) | `scaledDamage` |
| L1148 | Legacy AoE attack all fighting players (telegraphed, after delay) | `getAttackDamage()` |
| L1156 | Legacy AoE attack all fighting players (instant) | `getAttackDamage()` |
| L1186 | Legacy single-target attack (telegraphed, after delay) | `getAttackDamage()` |
| L1190 | Legacy single-target attack (instant) | `getAttackDamage()` |

**All 7 are internal `this.applyDamageToPlayer(...)` calls.** The monkey-patch at `index.ts` replaces the instance method on the already-constructed singleton — so existing tests that create `new CombatManager(...)` directly get the *original* unpatched method. Shield absorption is untested.

**Target design:**

```typescript
// CombatManager.ts — add to CombatManagerDeps:
export interface CombatManagerDeps {
  eventBus: ScopedEventBus;
  // ... existing deps ...
  damageInterceptor?: (
    lobbyId: string,
    playerId: string,
    damage: number,
    applyFn: (lobbyId: string, playerId: string, damage: number) => void
  ) => void;
}

// CombatManager.ts — constructor stores it:
private readonly damageInterceptor: NonNullable<CombatManagerDeps['damageInterceptor']>;

constructor(deps: CombatManagerDeps) {
  // ... existing ...
  // Default interceptor: pass-through (no shield logic)
  this.damageInterceptor = deps.damageInterceptor ?? ((lobbyId, playerId, damage, applyFn) => {
    applyFn(lobbyId, playerId, damage);
  });
}

// CombatManager.ts — rename raw method:
private applyDamageToPlayerRaw(lobbyId: string, playerId: string, damage: number): void {
  // ... existing body unchanged ...
}

// CombatManager.ts — public method routes through interceptor:
applyDamageToPlayer(lobbyId: string, playerId: string, damage: number): void {
  this.damageInterceptor(lobbyId, playerId, damage,
    (l, p, d) => this.applyDamageToPlayerRaw(l, p, d));
}
```

**domains/index.ts — construct combatManager with the interceptor wired in:**
```typescript
const combatManager = new CombatManager({
  eventBus,
  // ... existing deps ...
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
// REMOVE the module-scope monkey-patch block (L462-486)
```

**Existing test behavior:** `AbilityEffectHandler.test.ts:271` and `L298` call `combatManager.applyDamageToPlayer(LOBBY, 'paladin-player', 20)` on the singleton imported from `./index`. After this change, those calls will route through the real shield interceptor (as they should). The tests already assert `combat:shield_absorbed` is emitted — they will still pass. [VERIFIED: read the test file]

### Pattern 3: wireDomains Factory + makeMockSocket (MAINT-03)

**What:** Extract the 9 module-scope `eventBus.on(...)` registrations (lines 385–550 in `domains/index.ts`) into a `wireDomains(deps)` factory function. The factory returns `{ dispose() }` which calls `eventBus.off(...)` for each listener. Production call at module bottom is unchanged. A `makeMockSocket` helper in `server/test/makeMockSocket.ts` mirrors the client pattern.

**The 9 listener registrations to extract (domains/index.ts):**
| Line | Event | Handler |
|------|-------|---------|
| 385 | `combat:battle_initialized` | reset ability cooldowns |
| 390 | `session:lobby_destroyed` | cleanup ability state |
| 395 | `combat:battle_initialized` | reset combo state |
| 400 | `session:lobby_destroyed` | cleanup combo state |
| 405 | `session:lobby_destroyed` | cleanup item/buff/debuff/stats |
| 413 | `estimation:discussion_ended` | award items to players |
| 424 | `item:effect_applied` | apply item effects (heal/buff/shield) |
| 450 | `combat:boss_damaged` | apply damage_boost bonus damage |
| 489 | `ability:effect_applied` | apply ability effects (all 6 types) |

**wireDomains factory shape:**
```typescript
export interface WireDomainsContext {
  eventBus: ScopedEventBus;
  abilityManager: AbilityManager;
  comboManager: ComboManager;
  itemManager: ItemManager;
  combatManager: CombatManager;
  statsTracker: StatsTracker;
  sessionManager: SessionManager;
  // Closures over internal helpers (activeBuffs, etc.) — these can be injected or
  // the factory can be defined inside the same module so it closes over them
}

export function wireDomains(ctx: WireDomainsContext): { dispose(): void } {
  const { eventBus } = ctx;

  const onBattleInit1 = (payload: ...) => { ctx.abilityManager.resetCooldowns(payload.lobbyId); };
  eventBus.on('combat:battle_initialized', onBattleInit1);

  // ... all 9 registrations ...

  return {
    dispose() {
      eventBus.off('combat:battle_initialized', onBattleInit1);
      // ... matching off() for each ...
    }
  };
}

// Module bottom (unchanged call):
wireDomains({ eventBus, abilityManager, comboManager, itemManager,
              combatManager, statsTracker, sessionManager });
```

**makeMockSocket (server-side version of client pattern):**

The client pattern at `client/src/lib/socket/eventHandlers.test.ts:18-31`:
```typescript
function makeMockSocket() {
  const handlers = new Map<string, Handler>();
  const socket = {
    on: vi.fn((event, handler) => { handlers.set(event, handler); }),
    off: vi.fn(),
    emit: vi.fn(),
    listeners: vi.fn((event) => handlers.has(event) ? [handlers.get(event)!] : []),
  };
  return { socket, handlers };
}
```

**Server-side `makeMockSocket` needs additional fields** because the socket handler accesses:
- `socket.data.playerId` / `socket.data.lobbyId` / `socket.data.userId` (set during handler execution)
- `socket.join(lobbyId)` (called in `create_lobby`, `reconnect_with_token`)
- `socket.emit(eventName, payload)` (lobby_created, lobby_sync, game_error, etc.)

```typescript
// server/test/makeMockSocket.ts (NEW FILE)
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

**Handler unit test shape for `create_lobby`:**
```typescript
import { wireDomains } from '../domains/index';
import { makeMockSocket } from '../test/makeMockSocket';
// Key insight: handler tests drive the handler directly — they do NOT
// call setupWebSocket. The handler must be extracted or tested via
// partial injection of the socket into the on() wrapper.
```

**Note on handler injection:** `websocket.ts` currently binds handlers inside `setupWebSocket` as closures. To unit-test them, the handlers need to be either:
1. **Exported from a module** (more invasive), or
2. **The handler closure calls injectable domain services** and tests inject mocks for those.

The review council recommends option 2: make domain singletons injectable at the `setupWebSocket` call site via optional params. However, the simplest approach consistent with "Do not do the full `HandlerCtx` overhaul" is to extract the three specific handler bodies (`create_lobby`, disconnect, `reconnect_with_token`) into standalone functions that accept `(socket, deps)` — not a full `HandlerCtx`. Planner should choose the minimal surface.

### Anti-Patterns to Avoid

- **Extracting all handlers at once:** The review council explicitly says "Do not do the full `HandlerCtx` overhaul." Extract only the three named handlers (`create_lobby`, disconnect/host-transfer, `reconnect_with_token`).
- **Not calling `dispose()` in test teardown:** The `wireDomains` factory approach is only safe if tests call `dispose()` in `afterEach`. Forgetting this recreates the `MaxListenersExceededWarning` from the existing suite.
- **Accessing private members via `as any` after MAINT-01:** The whole point of exporting `GameStateManager` is to avoid `as any`. The planner must audit `gameState.test.ts` to remove the `const gs = gameState as any` pattern in any new tests.
- **Changing the 7 call sites to bypass the interceptor:** Every one of the 7 `this.applyDamageToPlayer` calls must route through the interceptor. If any is accidentally rewritten to `this.applyDamageToPlayerRaw`, shield absorption silently breaks for that attack path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fake socket for handler tests | Custom partial Socket.IO mock | `makeMockSocket()` pattern (mirrors existing client pattern) | Client pattern already battle-tested; consistent across codebase |
| Timer cleanup in tests | `afterAll(() => clearAllTimers())` | `{ startWatchdogs: false }` constructor option | Timer-aware teardown is fragile; don't start the timers in the first place |
| Listener cleanup | Manual `eventBus.off(...)` per test | `wireDomains(deps).dispose()` in `afterEach` | Dispose encapsulates all 9 listeners; tests can't accidentally miss one |

**Key insight:** The existing domain manager pattern (constructor-injectable, no side effects) is already the right pattern — `GameStateManager` and the domain wiring are the outliers to bring into alignment.

---

## Common Pitfalls

### Pitfall 1: MaxListeners Warning Amplified by wireDomains Tests
**What goes wrong:** If tests import the `wireDomains` factory and call it multiple times without calling `dispose()`, the shared `eventBus` singleton accumulates listeners beyond the default max (10).
**Why it happens:** The existing `AbilityEffectHandler.test.ts` already triggers this (`estimation:vote_cast` has 11 listeners). `wireDomains` adds 9 more per call.
**How to avoid:** Every test that calls `wireDomains(...)` MUST call `dispose()` in `afterEach`. Alternatively, each test creates a fresh `new ScopedEventBus()` and passes it to `wireDomains` so no global state accumulates. The latter is cleaner.
**Warning signs:** `MaxListenersExceededWarning: Possible EventEmitter memory leak detected` in test output.

### Pitfall 2: Production singleton still holds old monkey-patch path
**What goes wrong:** After removing the monkey-patch, if the `domains/index.ts` `combatManager` is constructed WITHOUT the interceptor dep, shield calls silently fall back to the pass-through default.
**Why it happens:** `damageInterceptor` is optional in `CombatManagerDeps`. If the planner forgets to pass it in the production construction, shield absorption breaks silently.
**How to avoid:** Pass the interceptor function when constructing `combatManager` in `domains/index.ts`. The existing `AbilityEffectHandler.test.ts` shield tests (which import the production singleton) will catch this regression immediately.
**Warning signs:** Shield tests pass in isolation but shield absorption fails at runtime.

### Pitfall 3: gameState.test.ts `as any` surgery still present
**What goes wrong:** New tests for `GameStateManager` still use `const gs = gameState as any` even though the class is now exported.
**Why it happens:** The existing test file uses `as any` to access `gs.lobbies`, `gs.handleVotingTimeout`. After MAINT-01, `lobbies` remains `private` — but `handleVotingTimeout` is now `public`.
**How to avoid:** New tests use `new GameStateManager(undefined, { startWatchdogs: false })` + `gs.createLobby(...)` to set up state. The `gs.lobbies` direct-injection pattern can be retained for the existing characterization tests but must not appear in new tests. The MAINT-01 success criterion says "no `as any`" for *new* tests — existing test patterns for existing tests are out of scope.
**Warning signs:** `tsc --noEmit` errors or `as any` in new test files.

### Pitfall 4: `reconnect_with_token` handler also calls `gameState.syncPlayerToLobby`
**What goes wrong:** The mock-socket test for `reconnect_with_token` (websocket.ts:1727) must also handle `gameState.syncPlayerToLobby(playerId, lobby)` (L1737). If the test uses a real `gameState` singleton, it leaves state behind.
**Why it happens:** The handler is tightly coupled to the `gameState` singleton import at line 11.
**How to avoid:** Either mock `gameState.syncPlayerToLobby` with `vi.spyOn`, or note that `gameState.syncPlayerToLobby` is a lightweight alias-map write that is safe to allow in tests (no timer side effects). Planner should document the chosen approach.
**Warning signs:** Test isolation failures — leftover lobby state from one test bleeding into another.

### Pitfall 5: `wireDomains` dispose must handle the `session:lobby_destroyed` listeners correctly
**What goes wrong:** Three separate `session:lobby_destroyed` listeners exist (L390, L400, L405). Each must be stored as a distinct named function reference so `eventBus.off(...)` can remove them individually.
**Why it happens:** Arrow functions passed directly to `on()` produce a new reference each time — `off()` requires the same reference.
**How to avoid:** Store each listener in a named `const` before passing to `eventBus.on(...)`. This is standard Node.js EventEmitter cleanup.
**Warning signs:** `dispose()` called, but listeners still fire (listener count doesn't decrease).

### Pitfall 6: `handleVotingTimeout` currently reads `this.io` (private) via `emitRevealCascade`
**What goes wrong:** Promoting `handleVotingTimeout` to `public` exposes it to tests, but calling it in tests without `io` injected means `emitRevealCascade` no-ops (it checks `if (!this.io) return`). The tests in `gameState.test.ts` currently call `gs.handleVotingTimeout(id)` directly via `as any` and assert `gamePhase` changes — they will still work because `io` is undefined and the cascade no-ops, but the `gamePhase` mutation still fires.
**Impact:** Low — the existing tests already account for this; new tests should be aware.
**Warning signs:** No warning — this is expected behavior. Document in test comments.

---

## Code Examples

Verified patterns from the live codebase:

### Existing Constructor-Injectable Domain Manager (session of record)
```typescript
// server/domains/SessionManager.test.ts:17-18 [VERIFIED: read file]
beforeEach(() => {
  eventBus = new ScopedEventBus();
  sessionManager = new SessionManager({ eventBus });
});
```

### Existing Client makeMockSocket (model to mirror)
```typescript
// client/src/lib/socket/eventHandlers.test.ts:18-31 [VERIFIED: read file]
function makeMockSocket(): { socket: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const socket = {
    on: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); }),
    off: vi.fn(),
    emit: vi.fn(),
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
  };
  return { socket, handlers };
}
```

### Existing `as any` surgery that MAINT-01 renders unnecessary (in new tests)
```typescript
// server/gameState.test.ts:16 [VERIFIED: read file]
const gs = gameState as any; // private members access for test fixture construction
// This pattern is acceptable in EXISTING tests; new MAINT-01 tests must not use it.
```

### Existing monkey-patch (verbatim, to be deleted by MAINT-02)
```typescript
// server/domains/index.ts:462-486 [VERIFIED: read file]
const originalApplyDamage = combatManager.applyDamageToPlayer.bind(combatManager);
combatManager.applyDamageToPlayer = (lobbyId, playerId, damage) => {
  const remainingDamage = reduceShield(lobbyId, playerId, damage);
  // ... shield absorption ...
  originalApplyDamage(lobbyId, playerId, remainingDamage);
};
```

---

## Runtime State Inventory

Not applicable — this is a pure code/configuration refactor. No stored data, live service config, OS-registered state, secrets, or build artifacts reference any renamed entity.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 48 has no external dependencies. All changes are TypeScript source edits within the existing project, exercised by the pre-installed Vitest test runner.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.6 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run server/gameState.test.ts server/domains/AbilityEffectHandler.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAINT-01a | `GameStateManager` is exported and constructable | unit | `npx vitest run server/gameState.test.ts` | ✅ (new describe block needed) |
| MAINT-01b | `{ startWatchdogs: false }` prevents timer leak | unit | `npx vitest run server/gameState.test.ts` | ❌ Wave 0 |
| MAINT-01c | `handleVotingTimeout` callable without `as any` | unit | `npx vitest run server/gameState.test.ts` | ❌ Wave 0 |
| MAINT-02a | All 7 internal call sites route through `damageInterceptor` | unit | `npx vitest run server/domains/CombatManager.test.ts` | ✅ (existing suite covers call sites; interceptor path needs new test) |
| MAINT-02b | Shield absorption tested via injected interceptor | unit | `npx vitest run server/domains/AbilityEffectHandler.test.ts` | ✅ (existing shield tests, now exercising real path) |
| MAINT-03a | `wireDomains(deps).dispose()` removes all 9 listeners | unit | `npx vitest run server/domains/index.test.ts` | ❌ Wave 0 |
| MAINT-03b | `create_lobby` handler test via `makeMockSocket` | unit | `npx vitest run server/websocket.handlers.test.ts` | ❌ Wave 0 |
| MAINT-03c | disconnect/host-transfer handler test | unit | `npx vitest run server/websocket.handlers.test.ts` | ❌ Wave 0 |
| MAINT-03d | `reconnect_with_token` handler test | unit | `npx vitest run server/websocket.handlers.test.ts` | ❌ Wave 0 |
| MAINT-04 | Full suite still green (byte-identical behavior) | integration | `npm test` | ✅ (890 tests, run after each seam) |

### Sampling Rate
- **Per task commit:** `npm test` (7.85s — fast enough to run on every commit)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (`npm test` — 890+ tests, 0 failures) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New describe block in `server/gameState.test.ts` — covers MAINT-01b, MAINT-01c (constructable with no timers, `handleVotingTimeout` public)
- [ ] `server/domains/index.test.ts` — covers MAINT-03a (wireDomains dispose removes listeners)
- [ ] `server/test/makeMockSocket.ts` — shared helper for MAINT-03b/c/d
- [ ] `server/websocket.handlers.test.ts` — covers MAINT-03b, MAINT-03c, MAINT-03d

*(Existing `server/domains/CombatManager.test.ts` and `server/domains/AbilityEffectHandler.test.ts` cover MAINT-02a/2b without new test files — they will automatically exercise the new interceptor path once MAINT-02 lands.)*

---

## Security Domain

This phase makes no changes to authentication, authorization, input validation, cryptography, or session management. All changes are internal TypeScript refactors with no impact on the attack surface.

ASVS assessment: Not applicable — no security-relevant code is modified.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `happy-dom` version matches what `vitest.config.ts` specifies | Standard Stack | Low — vitest config is definitive; version irrelevant to this phase |
| A2 | The server-side `makeMockSocket` file should live at `server/test/makeMockSocket.ts` | Architecture Patterns | Low — path is a planner decision; can be colocated with test file instead |
| A3 | `wireDomains` can close over `activeBuffs`, `activeDebuffs`, and helper functions defined in `domains/index.ts` without requiring them to be extracted to a separate module | Architecture Patterns | Medium — if the factory is large, extraction to its own module may be cleaner; but closure is simpler and avoids moving module-private state |

---

## Open Questions (RESOLVED)

> Both questions below have a documented recommendation that the Phase 48 plans implement:
> Q1 → Option A (extract three handler bodies to `server/websocket.handlers.ts`) is used by 48-03 Task 2;
> Q2 → new tests use `createLobby()` (existing `as any` left as-is) is used by 48-01 Task 2.

1. **Handler extraction scope for MAINT-03**
   - What we know: `create_lobby`, `disconnect`, and `reconnect_with_token` are closure-bound inside `setupWebSocket`. The review says "Do not do the full `HandlerCtx` overhaul."
   - What's unclear: Should the handler bodies be extracted as standalone functions in a new file, or should tests inject mock domain instances via the `setupWebSocket` optional deps pattern?
   - Recommendation: Extract only the three handler bodies as named functions in `server/websocket.handlers.ts` that accept `(socket, deps)`. Keep `setupWebSocket` as the caller. This is minimal and reversible.

2. **Lobby access in new `GameStateManager` tests**
   - What we know: `lobbies` is `private` on `GameStateManager`. Existing tests use `gs.lobbies.set(...)` via `as any`.
   - What's unclear: Should `lobbies` stay private (tests use `createLobby()` to build fixtures) or get a `getLobbyForTest` accessor?
   - Recommendation: Use `createLobby()` for new tests. The `as any` pattern in *existing* tests is acceptable to leave as-is — MAINT-01 only requires new tests avoid it.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Module-scope singleton with eager `setInterval` | Constructor-injectable with `{ startWatchdogs }` flag | Phase 48 (this phase) | Tests can construct without timer leaks |
| Module-scope monkey-patch of `applyDamageToPlayer` | Constructor-injected `damageInterceptor` dep | Phase 48 (this phase) | Shield absorption testable in isolation |
| Flat `eventBus.on(...)` calls at module scope | `wireDomains(deps): { dispose() }` factory | Phase 48 (this phase) | Tests can wire + unwire without listener leaks |

**Deprecated/outdated after this phase:**
- `const gs = gameState as any` in **new** test code — replaced by `new GameStateManager(undefined, { startWatchdogs: false })`
- Module-scope `combatManager.applyDamageToPlayer = ...` reassignment in `domains/index.ts` — replaced by constructor dep

---

## Sources

### Primary (HIGH confidence)
- `server/gameState.ts` — read directly; all claims about `GameStateManager` class, constructor, singleton, timers, `handleVotingTimeout` visibility are verified line-by-line [VERIFIED: codebase grep + Read]
- `server/domains/index.ts` — read directly; monkey-patch location at L462-486, 9 listener registrations at L385-550, combatManager construction at L97-130 [VERIFIED: codebase grep + Read]
- `server/domains/CombatManager.ts` — read directly; 7 internal `applyDamageToPlayer` call sites confirmed at L805, L1029, L1035, L1148, L1156, L1186, L1190; `CombatManagerDeps` interface at L37 [VERIFIED: codebase grep + Read]
- `server/websocket.ts` — read directly; `setupWebSocket` signature at L67; `create_lobby` handler at L409; `reconnect_with_token` at L1727; `disconnect` at L1989; `gameState.syncPlayerToLobby` calls at L414, L1737 [VERIFIED: codebase grep + Read]
- `client/src/lib/socket/eventHandlers.test.ts` — read directly; `makeMockSocket` pattern at L18-31 [VERIFIED: Read]
- `server/domains/AbilityEffectHandler.test.ts` — read directly; shield test at L270-284 imports singleton from `./index` [VERIFIED: Read]
- `server/domains/SessionManager.test.ts` — read directly; constructor-injectable pattern at L17-18 [VERIFIED: Read]
- `server/gameState.test.ts` — read directly; `as any` pattern at L16 [VERIFIED: Read]
- `vitest.config.ts` — read directly; environment: happy-dom, include patterns confirmed [VERIFIED: Read]
- Test suite output — `npm test` run confirmed 890 tests passing, `MaxListenersExceededWarning` on `estimation:vote_cast` [VERIFIED: Bash]

### Secondary (MEDIUM confidence)
- `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` — Theme 7 at line 155, rank 14 details and prioritized action table [VERIFIED: Read]
- `.planning/ROADMAP.md:290-299` — Phase 48 success criteria [VERIFIED: Read]

### Tertiary (LOW confidence)
- None — all claims in this research are backed by direct file reads.

---

## Metadata

**Confidence breakdown:**
- Current code structure: HIGH — every claim verified by direct file read with line numbers
- refactor target design: HIGH — follows established patterns already in the codebase
- Test infrastructure: HIGH — verified by `npm test` run
- Handler extraction approach for MAINT-03: MEDIUM — two valid approaches exist; planner decides

**Research date:** 2026-06-22
**Valid until:** 2026-08-22 (stable TypeScript codebase; no fast-moving external dependencies)
