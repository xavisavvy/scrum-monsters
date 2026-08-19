# Phase 51: Event-Contract Hardening & Handler Boilerplate — Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 11 (8 modified, 3 new)
**Analogs found:** 10 / 11 (1 new file has no analog — eventHandlerUtils.ts)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/events/ClientEventEmitter.ts` | service/emitter | event-driven | `server/websocket.ts` emitFineGrained closure | role-match |
| `server/websocket.ts` | middleware/router | event-driven | `server/events/ClientEventEmitter.ts` | role-match |
| `shared/gameEvents.ts` | shared-types | — | `shared/socket-schemas.ts` (parallel type file) | role-match |
| `shared/socket-schemas.ts` | shared-schema | — | `tailwind.config.ts` (only existing `satisfies` usage) | partial |
| `shared/socket-schemas.test.ts` (new) | test | — | `client/src/lib/utils/lastLobbyStorage.test.ts` | role-match |
| `client/src/lib/socket/eventHandlers.ts` | socket-handler | event-driven | self (existing — refactored) | exact |
| `client/src/lib/socket/eventHandlerUtils.ts` (new) | utility/helper | event-driven | `client/src/lib/withTeamsDerived.ts` (pure util pattern) | partial |
| `client/src/lib/socket/eventHandlers.test.ts` | test | — | `client/src/lib/socket/eventHandlers.test.ts` (existing) | exact |
| `client/src/lib/socket/eventHandlerUtils.test.ts` (new) | test | — | `client/src/lib/socket/eventHandlers.test.ts` | role-match |
| `client/src/lib/hooks/useViewport.ts` | hook/utility | transform | `client/src/lib/hooks/useViewport.ts` (existing — extended) | exact |
| `client/src/components/game/PlayerController.tsx` | component | event-driven | self (existing — refactored) | exact |

---

## Pattern Assignments

### Stream EXT-04: Emit Type Constraint

---

#### `server/events/ClientEventEmitter.ts` (service, event-driven)

**Change type:** Narrow two method signatures from `event: string` to `event: keyof ServerToClientEvents`, and add cast at the Socket.IO call site.

**Current signatures** (lines 583, 594):
```typescript
// line 583 — public entrypoint
public emitFineGrained(lobbyId: string, event: string, data: Record<string, unknown>): void {
  this.emitToLobby(lobbyId, event, data);
}

// line 594 — private implementation
private emitToLobby(lobbyId: string, event: string, data: Record<string, unknown>): void {
  const seq = this.sequencer.nextSeq(lobbyId);
  const timestamp = Date.now();

  const payload = {
    ...data,
    seq,
    timestamp,
  };

  // Buffer for recovery
  this.sequencer.bufferEvent(lobbyId, seq, event, payload);

  // Emit to Socket.IO room — line 608: cast required after signature narrowing
  this.io.to(lobbyId).emit(event, payload);
}
```

**Target signatures after EXT-04:**
```typescript
// Import to add at top of file:
import { ServerToClientEvents } from '../../shared/gameEvents';

public emitFineGrained(lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void

private emitToLobby(lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void
// Line 608 cast — Socket.IO's .emit() types event as string; cast is safe here:
this.io.to(lobbyId).emit(event as string, payload);
```

**Bridge satisfies guard** — place immediately after `setupInternalEventListeners()` closes (after line 575). Pattern mirrors `tailwind.config.ts:129` (`} satisfies Config`). The guard enumerates every wire name the bridge emits:
```typescript
// Compile-time guard: every wire name the bridge emits must be in ServerToClientEvents.
// Add a new entry here whenever a new this.emitToLobby(...) call is added to
// setupInternalEventListeners(). Failing to add it = tsc error at this object.
const _BRIDGE_COVERAGE = {
  'session:player_joined': true,
  'session:player_left': true,
  'session:host_changed': true,
  'host_transferred': true,          // legacy wire name — IS in ServerToClientEvents (line 388)
  'session:phase_changed': true,
  // ... all other emitted wire names from setupInternalEventListeners
} satisfies Partial<Record<keyof ServerToClientEvents, true>>;
```

**Notable bridge remaps to capture in `_BRIDGE_COVERAGE`** (from reading `ClientEventEmitter.ts` lines 89–575):
- `'session:host_transferred'` domain event → `'host_transferred'` wire name (line 119). The key in `_BRIDGE_COVERAGE` must be `'host_transferred'`, NOT `'session:host_transferred'`.
- `'estimation:team_consensus_reached'` domain → `'estimation:consensus_reached'` wire.
- `'stats:session_complete'` domain → `'stats:session_summary'` wire.

---

#### `server/websocket.ts` (middleware, event-driven)

**Change type:** Narrow the `emitFineGrained` closure signature. No call-site changes needed (all 20 call sites pass valid `keyof ServerToClientEvents` literals).

**Current closure** (line 129):
```typescript
const emitFineGrained = (lobbyId: string, event: string, data: Record<string, unknown>): void => {
  getClientEventEmitter()?.emitFineGrained(lobbyId, event, data);
};
```

**Target after EXT-04:**
```typescript
// Add to imports at top of file:
import type { ServerToClientEvents } from '@shared/gameEvents'; // or relative path

const emitFineGrained = (lobbyId: string, event: keyof ServerToClientEvents, data: Record<string, unknown>): void => {
  getClientEventEmitter()?.emitFineGrained(lobbyId, event, data);
};
```

All 20 call sites in `websocket.ts` pass literal strings already confirmed present in `ServerToClientEvents` — no call-site edits are needed. The two call sites in `gameState.ts` (lines 1177, 1183) pass `'estimation:votes_revealed'` which is also valid — no edit needed there either.

---

#### `shared/gameEvents.ts` (shared-types, —)

**Change type A: Sequenced<T> wrapper** — new export, add near the top of the file after existing type exports.

**Pattern:** Simple intersection type, export as named export alongside other type utilities.
```typescript
/**
 * Envelope added by ClientEventEmitter.emitToLobby to every fine-grained event.
 * All session:*, estimation:*, combat:*, progression:*, class_mastery:*,
 * ability:*, combo:*, item:*, stats:*, and system:full_state events carry this.
 * Excluded: system:missed_events, server_shutdown, connection_lost,
 * reconnect_attempt (these 4 have no seq/timestamp in their payload).
 */
export type Sequenced<T> = T & { seq: number; timestamp: number };
```

**Usage — BEFORE (line 421 example):**
```typescript
'session:player_left': (data: { playerId: string; seq: number; timestamp: number }) => void;
```

**Usage — AFTER:**
```typescript
'session:player_left': (data: Sequenced<{ playerId: string }>) => void;
```

Apply this pattern to all ~40 fine-grained events in `ServerToClientEvents` that currently spell out `seq: number; timestamp: number` inline.

**Change type B: ItemType substitution** — 4 sites.

Import to add:
```typescript
import type { ItemType } from './itemTypes';  // shared/itemTypes.ts line 11
```

Sites to substitute `string` → `ItemType`:
- Line 335 (`ClientToServerEvents.use_item`): `itemType: string` → `itemType: ItemType`
- Line 587 (`item:awarded`): `itemType: string` → `itemType: ItemType`
- Line 595 (`item:used`): `itemType: string` → `itemType: ItemType`
- Line 603 (`item:effect_applied`): `itemType: string` → `itemType: ItemType`

**Change type C: AvatarClass substitution** — 3 sites (AvatarClass is already exported from this file, no new import).
- Line 471 (`combat:minion_spawned`): `avatar: string` → `avatar: AvatarClass`
- Line 506 (`class_mastery:xp_awarded`): `avatarClass: string` → `avatarClass: AvatarClass`
- Line 516 (`class_mastery:tier_up`): `avatarClass: string` → `avatarClass: AvatarClass`

**NOT CHANGED** (explicit non-goals):
- `bossType: string` (lines 455, 456) — `BossType` is server-private in `server/domains/boss-ai/types.ts`
- `attackType: string` (line 472) — runtime values differ from documented union; out of scope

---

#### `shared/socket-schemas.ts` (shared-schema, —)

**Change type:** Replace `as const` with `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` on `ClientEventSchemas`.

**Only existing `satisfies` usage in the codebase** — `tailwind.config.ts` line 129:
```typescript
// tailwind.config.ts:129 — the sole existing satisfies pattern in this repo
} satisfies Config;
```

**Current declaration** (lines 685–737):
```typescript
export const ClientEventSchemas = {
  create_lobby: CreateLobbyPayloadSchema,
  join_lobby: JoinLobbyPayloadSchema,
  // ... 46 more entries ...
  client_heartbeat: EmptyPayloadSchema,
} as const;
```

**Target after EXT-04:**
```typescript
// Add to imports at top of file (already has z from 'zod'):
import type { ClientToServerEvents } from './gameEvents';

export const ClientEventSchemas = {
  create_lobby: CreateLobbyPayloadSchema,
  join_lobby: JoinLobbyPayloadSchema,
  // ... 46 more entries ...
  client_heartbeat: EmptyPayloadSchema,
} satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>;
// ^^ replaces `as const` — mutually exclusive; remove `as const` entirely.
// Individual z.* constructors provide strong types; as const is not needed.
```

**Critical:** `as const` and `satisfies` cannot coexist in one statement. Removing `as const` is safe because:
- `keyof typeof ClientEventSchemas` (used by `ClientEventName` at line 742) still resolves correctly without `as const`
- `getClientEventSchema` (line 744+) using `ClientEventSchemas[event]` still works

**Pitfall to avoid:** Do NOT write `} as const satisfies ...` — TypeScript does not support this combined form for this type of value.

---

#### `shared/socket-schemas.test.ts` (new test file)

**Analog:** `client/src/lib/utils/lastLobbyStorage.test.ts` — same structure: `describe`, `it`, `expect`, Vitest imports only, no DOM.

**Test module pattern** (from `lastLobbyStorage.test.ts` lines 1–7):
```typescript
import { describe, it, expect } from 'vitest';
import { ClientEventSchemas } from './socket-schemas';

describe('ClientEventSchemas', () => {
  it('has exactly 48 entries (parity with ClientToServerEvents)', () => {
    expect(Object.keys(ClientEventSchemas).length).toBe(48);
  });
});
```

Location: `shared/socket-schemas.test.ts` (sibling to `shared/socket-schemas.ts`).

---

### Stream MAINT-09: Handler Boilerplate Collapse

---

#### `client/src/lib/socket/eventHandlers.ts` (socket-handler, event-driven)

**Change type:** Replace ~28 inlined seq-guard + null-check + setLobby envelopes with `registerSyncedLobbyHandler`/`registerSyncedHandler` calls from new `eventHandlerUtils.ts`.

**Current imports** (lines 1–9) — copy this import block; add `eventHandlerUtils` import:
```typescript
import { Socket } from 'socket.io-client';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';
import { useAudio } from '../stores/useAudio';
import { Lobby, Player, Boss, TeamType, AvatarClass, GamePhase, TimerState, JiraTicket,
         TimerSettings, JiraSettings, EstimationSettings, ServerToClientEvents,
         ClientToServerEvents } from '@shared/gameEvents';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
```

**The inlined envelope being collapsed** — repeated ~28x. Canonical form (lines 67–89, `session:player_left`):
```typescript
socket.on('session:player_left', (data) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('session:player_left', data, socket);

  if (processed) {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      const updatedTeams = {
        developers: currentLobby.teams.developers.filter(p => p.id !== data.playerId),
        qa: currentLobby.teams.qa.filter(p => p.id !== data.playerId),
        spectators: currentLobby.teams.spectators.filter(p => p.id !== data.playerId),
      };
      const updatedLobby = {
        ...currentLobby,
        players: currentLobby.players.filter(p => p.id !== data.playerId),
        teams: updatedTeams,
      };
      setLobby(updatedLobby);
    }
  }
});
```

**Target after refactor** — same handler using `registerSyncedLobbyHandler`:
```typescript
registerSyncedLobbyHandler(socket, 'session:player_left', (data, lobby) => ({
  ...lobby,
  players: lobby.players.filter(p => p.id !== data.playerId),
  teams: {
    developers: lobby.teams.developers.filter(p => p.id !== data.playerId),
    qa: lobby.teams.qa.filter(p => p.id !== data.playerId),
    spectators: lobby.teams.spectators.filter(p => p.id !== data.playerId),
  },
}));
```

**A MIXED handler — registerSyncedHandler target** — `combat:player_damaged` (lines 588–620):
```typescript
socket.on('combat:player_damaged', (data) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('combat:player_damaged', data, socket);

  if (processed) {
    const { currentLobby, setLobby, addPendingDamage } = useGameState.getState();
    if (currentLobby) {
      const updatedLobby = {
        ...currentLobby,
        playerCombatStates: {
          ...currentLobby.playerCombatStates,
          [data.playerId]: { ...currentLobby.playerCombatStates[data.playerId], hp: data.newHp }
        }
      };
      setLobby(updatedLobby);
    }
    // SECOND store action — cannot express in registerSyncedLobbyHandler:
    addPendingDamage({
      id: `${data.playerId}-${data.seq ?? Date.now()}`,
      playerId: data.playerId,
      amount: data.damage,
      position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  }
});
```

**Target after refactor** using `registerSyncedHandler`:
```typescript
registerSyncedHandler(socket, 'combat:player_damaged', (data) => {
  const { currentLobby, setLobby, addPendingDamage } = useGameState.getState();
  if (currentLobby) {
    setLobby({
      ...currentLobby,
      playerCombatStates: {
        ...currentLobby.playerCombatStates,
        [data.playerId]: { ...currentLobby.playerCombatStates[data.playerId], hp: data.newHp }
      }
    });
  }
  addPendingDamage({
    id: `${data.playerId}-${data.seq ?? Date.now()}`,
    playerId: data.playerId,
    amount: data.damage,
    position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  });
});
```

**A NON-STANDARD handler that stays explicit** — `session:player_joined` (lines 21–65) — complex Player construction; cannot be expressed as `(data, lobby) => Partial<Lobby>`:
```typescript
// Stays as explicit socket.on — complex Player object construction + conditional teams[] push
socket.on('session:player_joined', (data) => {
  // ... complex Player build, avatar defaulting, idempotent team push ...
});
```

**withTeamsDerived is NOT called in handlers.** It lives in `useGameState.tsx:129`:
```typescript
setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) }),
```
Every `setLobby(...)` call already triggers `withTeamsDerived`. The `registerSyncedLobbyHandler` helper must NOT call `withTeamsDerived` itself — doing so would derive teams twice per event.

**Teardown pattern — current** (lines 979–1048): explicit `socket.off(...)` for every event, one per line. No drift today, but new helper registrations risk future drift.

**Current teardown structure** (lines 979–1048):
```typescript
export function teardownEventHandlers(socket: Socket): void {
  // Session events
  socket.off('session:player_joined');
  socket.off('session:player_left');
  // ... 40+ more explicit off() calls ...
  socket.off('system:missed_events');

  useEventSync.getState().setReplayDispatch(null);
}
```

**Target teardown pattern** using registered-name array from `eventHandlerUtils.ts`:
```typescript
export function teardownEventHandlers(socket: Socket): void {
  // Tear down all handlers registered via registerSyncedLobbyHandler/registerSyncedHandler:
  teardownSyncedHandlers(socket as TypedClientSocket);

  // Explicit offs for non-standard handlers not registered via helpers:
  socket.off('session:player_joined');   // non-standard — stays explicit
  socket.off('youtube_play_synced');
  socket.off('youtube_stop_synced');
  socket.off('system:full_state');
  socket.off('system:missed_events');
  // ... other non-standard handlers ...

  useEventSync.getState().setReplayDispatch(null);
}
```

---

#### `client/src/lib/socket/eventHandlerUtils.ts` (new utility, event-driven)

**No direct analog** — closest match is `client/src/lib/withTeamsDerived.ts` (pure named exports, no default export, TypeScript-only, JSDoc on each function). Mirror that pattern.

**withTeamsDerived.ts pattern** (lines 1–24):
```typescript
import type { Lobby, TeamType } from '@shared/gameEvents';

const TEAM_TYPES: TeamType[] = ['developers', 'qa', 'spectators'];

/**
 * JSDoc comment explaining purpose and rationale.
 */
export function withTeamsDerived(lobby: Lobby): Lobby {
  // pure function body
}
```

**Target structure for eventHandlerUtils.ts:**
```typescript
import type { ServerToClientEvents } from '@shared/gameEvents';
import type { TypedClientSocket } from './eventHandlers';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';
import type { Lobby } from '@shared/gameEvents';

// Module-level tracking array — cleared on teardown
const _registeredEvents: Array<keyof ServerToClientEvents> = [];

/**
 * Register a socket handler that:
 * 1. Routes data through the seq-guard (handleEvent)
 * 2. Reads currentLobby (null-checks)
 * 3. Calls updater(data, currentLobby) -> Partial<Lobby> | null
 * 4. Merges result into currentLobby and calls setLobby (which applies withTeamsDerived)
 *
 * Use for handlers whose ONLY side effect is a scoped setLobby update.
 * withTeamsDerived is NOT called here — setLobby in useGameState already applies it.
 */
export function registerSyncedLobbyHandler<E extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: E,
  updater: (data: Parameters<ServerToClientEvents[E]>[0], lobby: Lobby) => Partial<Lobby> | null
): void {
  socket.on(event, (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent(event, data as Record<string, unknown>, socket);
    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const update = updater(data as Parameters<ServerToClientEvents[E]>[0], currentLobby);
        if (update !== null) {
          setLobby({ ...currentLobby, ...update });
        }
      }
    }
  });
  _registeredEvents.push(event);
}

/**
 * Register a socket handler that:
 * 1. Routes data through the seq-guard (handleEvent)
 * 2. If processed, calls handler(data) — handler is responsible for all store actions
 *
 * Use for handlers that update non-Lobby stores or need multiple store actions.
 */
export function registerSyncedHandler<E extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: E,
  handler: (data: Parameters<ServerToClientEvents[E]>[0]) => void
): void {
  socket.on(event, (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent(event, data as Record<string, unknown>, socket);
    if (processed) {
      handler(data as Parameters<ServerToClientEvents[E]>[0]);
    }
  });
  _registeredEvents.push(event);
}

/**
 * Tear down all handlers registered via registerSyncedLobbyHandler/registerSyncedHandler.
 * Call from teardownEventHandlers before explicit offs for non-standard handlers.
 */
export function teardownSyncedHandlers(socket: TypedClientSocket): void {
  for (const event of _registeredEvents) {
    socket.off(event);
  }
  _registeredEvents.length = 0;
}
```

**TypeScript generic inference note (Assumption A2):** The `Parameters<ServerToClientEvents[E]>[0]` pattern may require `as` casts at internal call sites because TypeScript's control flow doesn't narrow the generic `E` inside the callback body. If tsc complains, use `handler(data as Parameters<ServerToClientEvents[E]>[0])` — already shown above.

---

#### `client/src/lib/socket/eventHandlerUtils.test.ts` (new test)

**Analog:** `client/src/lib/socket/eventHandlers.test.ts` — same mock socket factory pattern:
```typescript
// eventHandlers.test.ts lines 18–31 — copy this mock socket factory verbatim
function makeMockSocket(): { socket: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const socket = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
  };
  return { socket, handlers };
}
```

**Test coverage required:**
```typescript
describe('registerSyncedLobbyHandler', () => {
  it('calls updater only when handleEvent returns processed=true');
  it('skips updater when processed=false');
  it('calls setLobby with merged lobby when updater returns Partial<Lobby>');
  it('skips setLobby when updater returns null');
  it('registers event name in _registeredEvents array');
});

describe('registerSyncedHandler', () => {
  it('calls handler only when processed=true');
  it('skips handler when processed=false');
});

describe('teardownSyncedHandlers', () => {
  it('calls socket.off for each registered event');
  it('clears the _registeredEvents array after teardown');
});
```

---

### Stream MAINT-10: Coordinate Helpers

---

#### `client/src/lib/hooks/useViewport.ts` (hook/utility, transform)

**Change type:** Add two pure named exports (`worldToPercent`, `percentToWorld`) alongside the existing `useViewport` hook export.

**Existing export pattern** (lines 1–7, 43):
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useGameState } from '@/lib/stores/useGameState';

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;
export const WORLD_ASPECT_RATIO = WORLD_WIDTH / WORLD_HEIGHT;

// ... interfaces ...

export function useViewport(): ViewportState { ... }
```

**New pure functions to add at the bottom of the file** (after the hook, same file):
```typescript
/**
 * Convert world coordinates to percent wire format.
 * Always clamps result to [0, 100] — use this for ALL socket emits.
 *
 * BEHAVIOR CHANGE: Sites 2 (PlayerController:180-185) and 4 (PlayerController:553-558)
 * currently do NOT clamp. Adopting this helper changes their behavior — projectile
 * coordinates outside the viewport will be clamped to [0,100] before emission.
 * This is intentional: out-of-bounds coordinates are physically impossible in
 * normal gameplay and the old unclamped behavior was inconsistent with Site 3.
 */
export function worldToPercent(
  worldX: number,
  worldY: number,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(100, (worldX / worldWidth) * 100)),
    y: Math.max(0, Math.min(100, (worldY / worldHeight) * 100)),
  };
}

/**
 * Convert percent wire coordinates to world coordinates.
 * Does NOT clamp — trusts server-provided values.
 *
 * Site 1 (PlayerController:71-76) currently pre-clamps inputs to [0,100]
 * before calling the equivalent math. That pre-clamp may be retained at
 * the call site as a defensive guard; it does not need to be in the helper.
 */
export function percentToWorld(
  percentX: number,
  percentY: number,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  return {
    x: (percentX / 100) * worldWidth,
    y: (percentY / 100) * worldHeight,
  };
}
```

**Existing internal camera-follow pattern** (lines 146–147) — this is Site 5, also a percentToWorld usage. After extraction it becomes:
```typescript
// useViewport.ts lines 146-147 — current:
const worldX = (playerPos.x / 100) * WORLD_WIDTH;
const worldY = (playerPos.y / 100) * WORLD_HEIGHT;

// After extraction (uses the new helper with module-level constants):
const { x: worldX, y: worldY } = percentToWorld(playerPos.x, playerPos.y, WORLD_WIDTH, WORLD_HEIGHT);
```

---

#### `client/src/components/game/PlayerController.tsx` (component, event-driven)

**Change type:** Replace 5 open-coded coordinate conversion math blocks with `worldToPercent`/`percentToWorld` calls.

**All 5 sites — current code and target:**

**Site 1 — percentToWorld, line 71–76 (server sync, CLAMPS input):**
```typescript
// CURRENT (lines 71-76):
const clampedX = Math.max(0, Math.min(100, serverPos.x));
const clampedY = Math.max(0, Math.min(100, serverPos.y));
const worldX = (clampedX / 100) * viewport.worldWidth;
const worldY = (clampedY / 100) * viewport.worldHeight;

// AFTER (pre-clamp retained at call site per Pitfall Q3 recommendation):
const clampedX = Math.max(0, Math.min(100, serverPos.x));
const clampedY = Math.max(0, Math.min(100, serverPos.y));
const { x: worldX, y: worldY } = percentToWorld(clampedX, clampedY, viewport.worldWidth, viewport.worldHeight);
```

**Site 2 — worldToPercent, lines 180–185 (keyboard projectile emit, currently NO clamp):**
```typescript
// CURRENT (lines 180-185):
const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
const targetWorld = viewport.screenToWorld(targetX, targetY);
const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;

// AFTER (BEHAVIOR CHANGE: now clamps to [0,100]):
const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
const targetWorld = viewport.screenToWorld(targetX, targetY);
const { x: percentStartX, y: percentStartY } = worldToPercent(startWorld.x, startWorld.y, viewport.worldWidth, viewport.worldHeight);
const { x: percentTargetX, y: percentTargetY } = worldToPercent(targetWorld.x, targetWorld.y, viewport.worldWidth, viewport.worldHeight);
```

**Site 3 — worldToPercent, lines 477–479 (movement loop, CLAMPS — canonical):**
```typescript
// CURRENT (lines 477-479):
const worldPos = viewport.screenToWorld(newX, newY);
const percentX = Math.max(0, Math.min(100, (worldPos.x / viewport.worldWidth) * 100));
const percentY = Math.max(0, Math.min(100, (worldPos.y / viewport.worldHeight) * 100));

// AFTER (no behavior change — worldToPercent always clamps):
const worldPos = viewport.screenToWorld(newX, newY);
const { x: percentX, y: percentY } = worldToPercent(worldPos.x, worldPos.y, viewport.worldWidth, viewport.worldHeight);
```

**Site 4 — worldToPercent, lines 553–558 (click-to-shoot emit, currently NO clamp):**
```typescript
// CURRENT (lines 553-558):
const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
const targetWorld = viewport.screenToWorld(targetX, targetY);
const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;

// AFTER (BEHAVIOR CHANGE: now clamps to [0,100]):
const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
const targetWorld = viewport.screenToWorld(targetX, targetY);
const { x: percentStartX, y: percentStartY } = worldToPercent(startWorld.x, startWorld.y, viewport.worldWidth, viewport.worldHeight);
const { x: percentTargetX, y: percentTargetY } = worldToPercent(targetWorld.x, targetWorld.y, viewport.worldWidth, viewport.worldHeight);
```

**Site 5 — percentToWorld, useViewport.ts lines 146–147 (camera follow, no clamp):**
See useViewport.ts section above — this site lives in `useViewport.ts` itself and should use the new helper inline.

**Import to add to PlayerController.tsx:**
```typescript
import { worldToPercent, percentToWorld } from '@/lib/hooks/useViewport';
// or the existing relative path style used in this file
```

**Clamping behavior-change summary for planner decision:**
| Site | Direction | Old | New | Behavior Change? |
|------|-----------|-----|-----|-----------------|
| 1 | percent→world | clamps input, then converts | clamps input (at call site), then percentToWorld | NO |
| 2 | world→percent | NO clamp | worldToPercent always clamps | YES — projectile coords clamped to [0,100] |
| 3 | world→percent | clamps after convert | worldToPercent always clamps | NO (equivalent) |
| 4 | world→percent | NO clamp | worldToPercent always clamps | YES — projectile coords clamped to [0,100] |
| 5 | percent→world | no clamp | percentToWorld (no clamp) | NO |

**Planner must document in plan:** Sites 2 and 4 are intentional behavior changes. The old un-clamped values were a latent bug (inconsistency with Site 3). The change is accepted — projectile coordinates outside [0,100] are physically impossible in normal gameplay.

---

#### `client/src/lib/hooks/useViewport.test.ts` (new test)

**Analog:** `client/src/lib/utils/lastLobbyStorage.test.ts` — pure function tests, no DOM, no mocking needed.

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { worldToPercent, percentToWorld } from './useViewport';

describe('worldToPercent', () => {
  it('converts center of 1920x1080 world to 50%', () => {
    const result = worldToPercent(960, 540, 1920, 1080);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });
  it('clamps values exceeding 100%', () => {
    const result = worldToPercent(2000, 540, 1920, 1080);
    expect(result.x).toBe(100);
  });
  it('clamps values below 0%', () => {
    const result = worldToPercent(-100, 540, 1920, 1080);
    expect(result.x).toBe(0);
  });
});

describe('percentToWorld', () => {
  it('converts 50% to center of 1920x1080 world', () => {
    const result = percentToWorld(50, 50, 1920, 1080);
    expect(result.x).toBe(960);
    expect(result.y).toBe(540);
  });
  it('does NOT clamp values exceeding 100%', () => {
    const result = percentToWorld(110, 50, 1920, 1080);
    expect(result.x).toBeCloseTo(2112); // 1920 * 1.1
  });
});
```

---

## Shared Patterns

### satisfies operator usage

**Only existing repo usage:** `tailwind.config.ts:129` — `} satisfies Config;`

**New usage locations in Phase 51:**
1. `shared/socket-schemas.ts` — `} satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>;`
2. `server/events/ClientEventEmitter.ts` — `_BRIDGE_COVERAGE = { ... } satisfies Partial<Record<keyof ServerToClientEvents, true>>;`

**Rule:** `satisfies` and `as const` are mutually exclusive in a single statement. Remove `as const` when adding `satisfies`.

### setLobby / withTeamsDerived

**Source:** `client/src/lib/stores/useGameState.tsx:129`

```typescript
setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) }),
```

**Apply to:** All handler helpers in `eventHandlerUtils.ts`.
**Rule:** Call `setLobby(...)` directly — do NOT call `withTeamsDerived` in the handler or helper. `setLobby` applies it automatically. Applying it twice is a bug (Pitfall 4).

### handleEvent seq-guard

**Source:** `client/src/lib/socket/eventHandlers.ts` — every handler (lines 22, 68, 92, etc.)

```typescript
const { handleEvent } = useEventSync.getState();
const processed = handleEvent('event:name', data, socket);
if (processed) { /* state update */ }
```

**Apply to:** Both `registerSyncedLobbyHandler` and `registerSyncedHandler` internals. The helpers encapsulate this pattern so call sites never need to spell it out.

### Vitest pure-function test pattern

**Source:** `client/src/lib/utils/lastLobbyStorage.test.ts` (no DOM, no mocking, Vitest imports only)

**Apply to:** `shared/socket-schemas.test.ts`, `client/src/lib/hooks/useViewport.test.ts`, and helper unit tests in `eventHandlerUtils.test.ts` where testing pure functions.

### Mock socket factory pattern

**Source:** `client/src/lib/socket/eventHandlers.test.ts` lines 18–31

```typescript
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

**Apply to:** `eventHandlerUtils.test.ts` — copy this factory verbatim for testing helper registration.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `client/src/lib/socket/eventHandlerUtils.ts` | utility | event-driven | No existing helper module pattern for socket handler registration. Pattern reconstructed from `withTeamsDerived.ts` (pure exports style) + registered-name array approach from Phase 48-03 wireDomains factory. |

---

## Metadata

**Analog search scope:** `server/`, `shared/`, `client/src/lib/`, `client/src/components/game/`
**Files scanned:** 14
**Pattern extraction date:** 2026-06-23

**Key constraint reminders:**
- `shared/socket-schemas.ts`: Remove `as const`, add `satisfies`
- `server/events/ClientEventEmitter.ts` line 608: `emit(event as string, payload)` cast required
- `client/src/lib/withTeamsDerived.ts:` `setLobby` already applies it — helper must NOT re-call
- Sites 2 and 4 in `PlayerController.tsx`: Intentional clamping behavior change — document explicitly in plan
- `host_transferred` (not `session:host_transferred`) is the correct wire name in `_BRIDGE_COVERAGE`
