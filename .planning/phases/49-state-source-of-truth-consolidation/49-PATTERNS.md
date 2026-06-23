# Phase 49: State Source-of-Truth Consolidation - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 9 new/modified files across 3 independent requirements
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `client/src/lib/withTeamsDerived.ts` | utility | transform | `client/src/lib/utils.ts` | role-match (pure function utility) |
| `client/src/lib/withTeamsDerived.test.ts` | test | transform | `client/src/lib/utils.test.ts` | exact (pure function unit test) |
| `client/src/lib/stores/useGameState.tsx` | store | request-response | itself (modify `setLobby` line 128) | self-modify |
| `client/src/lib/socket/eventHandlers.ts` | event-handler | event-driven | itself (existing handler describe blocks) | self-modify (regression test only) |
| `server/gameState.ts` | service | CRUD | itself (`attackBoss` L1801) | self-modify |
| `server/domains/CombatManager.ts` | service | event-driven | itself (`playerAttackBoss` L531) | self-modify (rename + extend return) |
| `server/websocket.ts` | middleware | request-response | itself (`attack_boss` handler L1083) | self-modify (line deletion) |
| `client/src/components/game/PlayerCharacter.tsx` | component | request-response | itself (L59 whole-store sub) | self-modify |
| `client/src/components/game/PlayerController.tsx` | component | request-response | itself (L20 whole-store sub) | self-modify |

---

## Pattern Assignments

### `client/src/lib/withTeamsDerived.ts` (utility, transform) — NEW FILE

**Analog:** `client/src/lib/utils.ts`

The project's utility pattern is a single exported pure function per concern. `utils.ts` is the precedent for a utility that is framework-free, fully testable, and co-located in `client/src/lib/`.

**Imports pattern** (`utils.ts` lines 1-2):
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
```
For `withTeamsDerived`, the imports will be types only (no runtime dep):
```typescript
import { Lobby, TeamType } from '@shared/gameEvents';
```

**Pure function export pattern** (`utils.ts` lines 4-6):
```typescript
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
`withTeamsDerived` follows the same shape — one exported function, one responsibility, no side effects.

**Target implementation** (from RESEARCH.md — fully specified):
```typescript
// client/src/lib/withTeamsDerived.ts  (NEW FILE)
import { Lobby, TeamType } from '@shared/gameEvents';

const TEAM_TYPES: TeamType[] = ['developers', 'qa', 'spectators'];

/**
 * Returns a new Lobby with `teams` recomputed from `players`.
 * Thread through setLobby in useGameState to close the team-staleness
 * bugs (MAINT-04). Idempotent — safe to call on server-provided lobbies.
 */
export function withTeamsDerived(lobby: Lobby): Lobby {
  const teams = {} as Record<TeamType, typeof lobby.players>;
  for (const t of TEAM_TYPES) {
    teams[t] = lobby.players.filter(p => p.team === t);
  }
  return { ...lobby, teams };
}
```

**Note on threading:** The recommended approach from RESEARCH.md (Pitfall 1 section) is to wrap `setLobby` in the store itself rather than threading into each handler. The only file that needs to import `withTeamsDerived` is `useGameState.tsx`. The existing derivation in `estimation:votes_revealed` (eventHandlers.ts:357-364) is the codebase's existing manual pattern — `withTeamsDerived` replaces it across all call sites automatically.

---

### `client/src/lib/withTeamsDerived.test.ts` (test, transform) — NEW FILE

**Analog:** `client/src/lib/utils.test.ts`

**Test file structure** (`utils.test.ts` lines 1-5):
```typescript
import { cn } from "./utils";

describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
```
No mocks, no setup. Pure function → pure unit test.

**Import path** (`utils.test.ts` line 1): relative import from same `client/src/lib/` directory. `withTeamsDerived.test.ts` imports from `./withTeamsDerived` in the same way.

**Test shape** (`utils.test.ts` lines 18-23):
```typescript
  it("handles undefined and null values", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });
```
Short focused cases. Each `it` covers one input-to-output invariant.

---

### `client/src/lib/stores/useGameState.tsx` (store, request-response) — MODIFY L128

**Analog:** itself. The single-line change is at line 128.

**Current `setLobby`** (`useGameState.tsx` line 128):
```typescript
setLobby: (lobby) => set({ currentLobby: lobby }),
```

**Target `setLobby`** (one-line change):
```typescript
setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) }),
```

**Import to add** (alongside existing imports at lines 1-3):
```typescript
import { withTeamsDerived } from '../withTeamsDerived';
```

**Store creation pattern** (`useGameState.tsx` lines 107-108) — do not alter:
```typescript
export const useGameState = create<GameState>()(
  subscribeWithSelector((set, get) => ({
```

**Other actions as pattern reference** (`useGameState.tsx` lines 130-136):
```typescript
setPlayer: (player) => set({ currentPlayer: player }),
setBoss: (boss) => set({ currentBoss: boss }),
setInviteLink: (link) => set({ inviteLink: link }),
setError: (error) => set({ error }),
```
All actions are inline arrow functions — preserve this convention.

---

### `client/src/lib/socket/eventHandlers.ts` (event-handler, event-driven) — REGRESSION TESTS ONLY

**Analog:** `client/src/lib/socket/eventHandlers.test.ts` — the existing `makeMockSocket` / `seedLobby` test infrastructure.

No changes to `eventHandlers.ts` source when using the store-wrapping approach for MAINT-04. The three new regression tests go in `eventHandlers.test.ts`.

**Test infrastructure pattern** (`eventHandlers.test.ts` lines 18-55):
```typescript
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

function seedLobby(boss: Boss): Lobby {
  return {
    id: 'lobby-1',
    hostId: 'host',
    players: [],
    teams: { developers: [], qa: [], spectators: [] },
    gamePhase: 'battle',
    boss,
    tickets: [],
    completedTickets: [],
  } as unknown as Lobby;
}
```

**Handler invocation pattern** (`eventHandlers.test.ts` lines 65-79):
```typescript
describe('C1: combat:boss_healed reads data.newHp', () => {
  it('sets currentBoss.currentHealth to the wire newHp value', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);

    const boss = seedBoss();
    const lobby = seedLobby(boss);
    useGameState.setState({ currentBoss: boss, currentLobby: lobby });

    const handler = handlers.get('combat:boss_healed');
    expect(handler).toBeDefined();
    handler!({ healAmount: 25, newHp: 175, seq: 1, timestamp: Date.now() });

    const state = useGameState.getState();
    expect(state.currentBoss!.currentHealth).toBe(175);
  });
```

**New MAINT-04 regression describe block shape** (add to existing `eventHandlers.test.ts`):
```typescript
describe('MAINT-04: withTeamsDerived integration — teams never stale after setLobby', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    useGameState.setState({ currentLobby: null });
  });

  it('session:team_changed: teams[newTeam] player has newTeam, not oldTeam', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);

    // Build a lobby with p1 on developers
    useGameState.setState({
      currentLobby: {
        id: 'lobby-1',
        hostId: 'host',
        players: [{ id: 'p1', name: 'Alice', team: 'developers', isHost: false, avatar: 'warrior', avatarClass: 'warrior', level: 1 }],
        teams: { developers: [{ id: 'p1', team: 'developers' }], qa: [], spectators: [] },
        gamePhase: 'lobby',
        tickets: [],
        completedTickets: [],
      } as any,
    });

    handlers.get('session:team_changed')!({ playerId: 'p1', oldTeam: 'developers', newTeam: 'qa', seq: 1, timestamp: Date.now() });

    const lobby = useGameState.getState().currentLobby!;
    const p1InQa = lobby.teams.qa.find(p => p.id === 'p1');
    expect(p1InQa).toBeDefined();
    expect(p1InQa!.team).toBe('qa');   // was 'developers' in the push-before-map bug
  });

  it('session:avatar_selected: teams reflect updated avatar', () => { ... });
  it('session:host_changed: teams reflect updated isHost', () => { ... });
});
```

---

### `server/domains/CombatManager.ts` (service, event-driven) — MODIFY L531

**Analog:** itself. The `playerAttackBoss` method body at lines 531-611 is unchanged; only the name and return type change.

**Current method signature** (`CombatManager.ts` line 531):
```typescript
playerAttackBoss(lobbyId: string, playerId: string): number {
```

**Return value** (`CombatManager.ts` line 610):
```typescript
return damage;
```

**Target signature** (Option A — rename + richer return):
```typescript
/**
 * Basic attack on boss (from attack_boss socket event via gameState.attackBoss delegate).
 * Single authoritative HP drain for basic attacks — replaces gameState.attackBoss HP write.
 * Emits combat:boss_damaged and calls checkPhaseTransition.
 * Previously named playerAttackBoss (MAINT-05).
 */
applyBasicDamageToBoss(lobbyId: string, playerId: string): { damage: number; newHp: number } {
  // ... body unchanged from playerAttackBoss (lines 533-609) ...
  return { damage, newHp: boss.hp };  // extend: was `return damage;`
}
```

**The `combat:boss_damaged` emit** (CombatManager.ts lines 554-560) — this is the CANONICAL emit that MUST NOT be duplicated:
```typescript
// Emit boss damaged event
this.eventBus.emit('combat:boss_damaged', {
  lobbyId,
  playerId,
  damage,
  bossHealth: boss.hp,
});
```

**The `checkPhaseTransition` call** (CombatManager.ts lines 562-593) — already calls it; no changes needed:
```typescript
const phaseResult = bossAI.checkPhaseTransition(boss.hp, boss.maxHp);
if (phaseResult.transitioned) {
  boss.currentPhase = phaseResult.newPhase;
  // ...emits combat:boss_phase_transition and combat:boss_enraged...
}
```

**Existing test describe block for `playerAttackBoss`** (`CombatManager.test.ts` lines 171+) — new tests for `applyBasicDamageToBoss` should follow the same `beforeEach` setup in a new `describe('applyBasicDamageToBoss', ...)` block alongside the existing one, verifying:
1. Emits `combat:boss_damaged` exactly once per call
2. Calls `checkPhaseTransition` (emits `combat:boss_phase_transition` when HP crosses 67%)

---

### `server/gameState.ts` (service, CRUD) — MODIFY L1825-1834

**Analog:** itself. The `attackBoss` method at lines 1801-1857.

**Current dev/qa HP drain block** (`gameState.ts` lines 1825-1835):
```typescript
} else if (player.team === 'developers' || player.team === 'qa') {
  // Developers and QA deal 15 - modifier damage (minimum 1)
  actualDamage = Math.max(1, 15 - modifier);
  lobby.boss.currentHealth = Math.max(0, lobby.boss.currentHealth - actualDamage);
  gameLogger.debug({ team: player.team, playerName: player.name, damage: actualDamage, modifier }, 'Player dealt damage to boss');
}

// Check if boss is defeated when health reaches 0
if (lobby.boss.currentHealth <= 0) {
  lobby.boss.defeated = true;
}
```

**Target delegation block** (replace lines 1825-1835):
```typescript
} else if (player.team === 'developers' || player.team === 'qa') {
  // Delegate to CombatManager — single boss-HP truth (MAINT-05)
  const { damage: actualDamage, newHp } = combatManager.applyBasicDamageToBoss(lobby.id, playerId);
  lobby.boss.currentHealth = newHp;  // projection only — CombatManager owns HP
  if (newHp <= 0) {
    lobby.boss.defeated = true;
  }
  gameLogger.debug({ team: player.team, playerName: player.name, damage: actualDamage, modifier }, 'Player dealt damage to boss');
}
// NOTE: boss defeat emit is now handled by CombatManager.applyBasicDamageToBoss
// NOTE: spectator-heal path remains unmodified — known deferral (TODO MAINT-05+)
```

**Return struct** (`gameState.ts` lines 1850-1856) — remains unchanged; `bossHealth` is now read from the projection:
```typescript
return {
  lobby,
  bossHealth: lobby.boss.currentHealth,
  ringAttack,
  healedBoss,
  modifier
};
```

---

### `server/websocket.ts` (middleware, request-response) — DELETE lines 1103-1109

**Analog:** itself. The `attack_boss` handler at lines 1083-1121.

**The manual emit to DELETE** (`websocket.ts` lines 1100-1110):
```typescript
        } else {
          // Phase 45-05B L4: legacy `boss_attacked` emit removed; the
          // combat:boss_damaged event below is the canonical signal
          // (handler now mirrors to both currentBoss and currentLobby.boss).
          eventBus.emit('combat:boss_damaged', {
            lobbyId: lobby.id,
            playerId,
            damage,
            bossHealth,
          });
        }
```
After delegation to `applyBasicDamageToBoss`, this entire `else` branch must be removed. `applyBasicDamageToBoss` already emits `combat:boss_damaged` at CombatManager.ts L555 — leaving this block causes double-emit.

**What remains in the `attack_boss` handler** after the deletion:
```typescript
on('attack_boss', ({ damage }) => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  const result = gameState.attackBoss(playerId, damage);
  if (result) {
    const { lobby, bossHealth: _bossHealth, ringAttack, healedBoss, modifier } = result;
    
    if (healedBoss) {
      eventBus.emit('combat:boss_healed', {
        lobbyId: lobby.id,
        healAmount: (modifier || 0) + 1,
        bossHealth: _bossHealth,  // spectator path — unchanged
      });
    }
    // combat:boss_damaged no longer emitted here — CombatManager.applyBasicDamageToBoss does it

    if (ringAttack) {
      io.to(lobby.id).emit('boss_ring_attack', ringAttack);
    }
  }
});
```

---

### `client/src/components/game/PlayerCharacter.tsx` (component, request-response) — MODIFY L59

**Analog:** itself. The current whole-store subscription at line 59 is the thing being replaced.

**Current whole-store subscription** (`PlayerCharacter.tsx` line 59):
```typescript
const { currentLobby, attackAnimations } = useGameState();
```

**Current derived values** (`PlayerCharacter.tsx` lines 65-68):
```typescript
const combatState = currentLobby && playerId ? currentLobby.playerCombatStates?.[playerId] : null;
const currentHp = combatState?.hp || 100;
const maxHp = combatState?.maxHp || 100;
const healthPercentage = (currentHp / maxHp) * 100;
```

**Target scoped selectors** (replaces L59 + L65-67):
```typescript
import { useShallow } from 'zustand/react/shallow';

// Scalar selectors — re-render ONLY when this player's HP/maxHp changes
const currentHp = useGameState(
  s => s.currentLobby?.playerCombatStates?.[playerId ?? '']?.hp ?? 100
);
const maxHp = useGameState(
  s => s.currentLobby?.playerCombatStates?.[playerId ?? '']?.maxHp ?? 100
);
// useShallow for array identity — prevents re-render when unrelated lobby fields change
const { attackAnimations } = useGameState(
  useShallow(s => ({ attackAnimations: s.attackAnimations }))
);
const healthPercentage = (currentHp / maxHp) * 100;
// REMOVE: const combatState = ...; const currentHp = ...; const maxHp = ...;
```

**Do NOT select the object slice** (Pitfall 5 in RESEARCH.md — the `playerCombatStates` object is spread-replaced on every `setLobby`, so object identity always fails):
```typescript
// BAD — creates a fresh object every render call, defeating strict-equality
const combatState = useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]);
```

**`React.memo` wrapper** (`PlayerCharacter.tsx` line 40) — already present; no change needed:
```typescript
export const PlayerCharacter = memo(function PlayerCharacter({
```

**`useShallow` import path** (verified from `node_modules/zustand/react/shallow.js`):
```typescript
import { useShallow } from 'zustand/react/shallow';
```

---

### `client/src/components/game/PlayerController.tsx` (component, request-response) — MODIFY L19-20

**Analog:** itself. The current export and whole-store subscription at lines 19-20.

**Current export** (`PlayerController.tsx` line 19):
```typescript
export function PlayerController({ onPlayerPositionsUpdate }: PlayerControllerProps) {
```

**Current whole-store subscription** (`PlayerController.tsx` line 20):
```typescript
const { currentPlayer, currentLobby, addAttackAnimation } = useGameState();
```

**Target export + scoped selectors** (replaces L19-20):
```typescript
import { useShallow } from 'zustand/react/shallow';

export const PlayerController = React.memo(function PlayerController({ onPlayerPositionsUpdate }: PlayerControllerProps) {
  // Scalar selectors — each subscribes to exactly one field
  const currentPlayerId    = useGameState(s => s.currentPlayer?.id);
  const currentPlayerTeam  = useGameState(s => s.currentPlayer?.team);
  const currentPlayerAvatar = useGameState(s => s.currentPlayer?.avatar);
  const currentLobbyId     = useGameState(s => s.currentLobby?.id);
  const currentLobbyPhase  = useGameState(s => s.currentLobby?.gamePhase);
  // Multi-field actions — Zustand action refs are stable; useShallow is defensive
  const { addAttackAnimation } = useGameState(
    useShallow(s => ({ addAttackAnimation: s.addAttackAnimation }))
  );
  // Used only for initial position sync — safe to select
  const playerPositionFromServer = useGameState(
    useShallow(s => s.currentLobby?.playerPositions?.[currentPlayerId ?? ''])
  );
```

**Downstream references** — inside the component body, `currentPlayer.id`, `currentPlayer.team`, `currentPlayer.avatar`, `currentLobby.id`, `currentLobby.gamePhase` must be replaced with `currentPlayerId`, `currentPlayerTeam`, `currentPlayerAvatar`, `currentLobbyId`, `currentLobbyPhase`. The `isActive` guard at line 896 becomes:
```typescript
const isActive = currentPlayerId && currentLobbyId && currentLobbyPhase === 'battle';
```

**`React.memo` prop stability note** (Pitfall 5 in RESEARCH.md): The `onPlayerPositionsUpdate` prop should be wrapped in `useCallback` by the parent component (`BattleScreen` or wherever `PlayerController` is mounted). Add a JSDoc comment to `PlayerControllerProps.onPlayerPositionsUpdate` noting this requirement.

---

### `client/src/components/game/PlayerCharacter.test.tsx` (test, request-response) — ADD render-count block

**Analog:** itself. The existing damage-flash describe block at lines 11-78 is the pattern base.

**Existing test infrastructure** (`PlayerCharacter.test.tsx` lines 1-8, 25-32):
```typescript
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameState } from '@/lib/stores/useGameState';
import { PlayerCharacter } from './PlayerCharacter';

vi.mock('./SpriteRenderer', () => ({
  SpriteRenderer: () => <div data-testid="sprite-renderer" />,
}));

beforeEach(() => {
  useGameState.setState({
    currentLobby: {
      gamePhase: 'battle',
      playerCombatStates: { p1: { hp: 100, maxHp: 100 } },
    } as any,
  });
});
```

**`useGameState.setState` mutation pattern** (`PlayerCharacter.test.tsx` lines 43-50):
```typescript
act(() => {
  useGameState.setState((s: any) => ({
    currentLobby: {
      ...s.currentLobby,
      playerCombatStates: { p1: { hp: 70, maxHp: 100 } },
    },
  }));
});
```

**New render-count describe block** (add after existing describe):
```typescript
describe('MAINT-06 perf guardrail: scoped selectors prevent spurious re-renders', () => {
  it('does NOT re-render when boss HP changes (unrelated setLobby field)', () => {
    let renderCount = 0;

    function TrackingWrapper(props: Parameters<typeof PlayerCharacter>[0]) {
      renderCount++;
      return <PlayerCharacter {...props} />;
    }

    render(<TrackingWrapper {...baseProps} playerId="p1" />);
    const renderCountAfterMount = renderCount;

    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          boss: { currentHealth: 900 },  // boss HP changed — unrelated to p1
        },
      }));
    });

    expect(renderCount).toBe(renderCountAfterMount);   // must NOT re-render

    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          playerCombatStates: { p1: { hp: 70, maxHp: 100 } },  // p1's HP changed
        },
      }));
    });

    expect(renderCount).toBe(renderCountAfterMount + 1);  // MUST re-render
  });
});
```

**StrictMode note** (Pitfall 7 in RESEARCH.md): Verify `client/src/test/setup.ts` to determine if StrictMode is enabled. If render counts double (2 instead of 1), disable StrictMode for this test via a custom `render` wrapper or `vitest.config.ts` environment setting.

---

## Shared Patterns

### Scoped Zustand Selector
**Source:** `client/src/lib/stores/useGameState.tsx` (current store shape)
**Apply to:** `PlayerCharacter.tsx`, `PlayerController.tsx`
**Rule:** Use `useGameState(s => s.someScalar)` for scalars; use `useGameState(useShallow(s => ({ field: s.field })))` only for arrays or objects where identity matters.
**Import:** `import { useShallow } from 'zustand/react/shallow'` — always use `react/shallow`, not `zustand/shallow`.

### Zustand `setState` Test Mutation
**Source:** `client/src/components/game/PlayerCharacter.test.tsx` lines 43-50
**Apply to:** All client store-integrated tests
**Pattern:**
```typescript
act(() => {
  useGameState.setState((s: any) => ({
    currentLobby: { ...s.currentLobby, fieldToChange: newValue },
  }));
});
```

### CombatManager Unit Test Setup
**Source:** `server/domains/CombatManager.test.ts` lines 1-40
**Apply to:** New `applyBasicDamageToBoss` describe block
**Pattern:**
```typescript
let eventBus: ScopedEventBus;
let combatManager: CombatManager;

beforeEach(() => {
  eventBus = new ScopedEventBus();
  getPlayerTeam = vi.fn(...);
  getPlayerClass = vi.fn(...);
  combatManager = new CombatManager({ eventBus, getPlayerTeam, getPlayerClass });
});
```

### eventBus Listener Spy
**Source:** `server/domains/CombatManager.test.ts` lines 252-256
**Apply to:** MAINT-05 double-emit regression test
**Pattern:**
```typescript
const bossDamagedListener = vi.fn();
eventBus.on('combat:boss_damaged', bossDamagedListener);

combatManager.applyBasicDamageToBoss('lobby1', 'ranger1');

expect(bossDamagedListener).toHaveBeenCalledTimes(1);  // exactly once — not 2
```

### `makeMockSocket` Handler Registration
**Source:** `client/src/lib/socket/eventHandlers.test.ts` lines 18-31
**Apply to:** MAINT-04 regression tests in `eventHandlers.test.ts`
**Pattern:**
```typescript
const { socket, handlers } = makeMockSocket();
setupEventHandlers(socket);
// ... seed state ...
handlers.get('session:team_changed')!({ ...payload, seq: 1, timestamp: Date.now() });
// ... assert useGameState.getState() ...
```

---

## No Analog Found

All files in Phase 49 have strong codebase analogs. No new patterns need to be sourced from RESEARCH.md exclusively.

| File | Note |
|------|------|
| `useShallow` usage | Zero existing uses in project (`useGameState(s => ...)` with selector also has zero hits). Pattern sourced from RESEARCH.md + verified `node_modules/zustand/react/shallow.js`. |

---

## Metadata

**Analog search scope:** `client/src/lib/`, `client/src/components/game/`, `server/domains/`, `server/`, `client/src/lib/socket/`
**Files read:** 12 source files + 3 test files
**Pattern extraction date:** 2026-06-22

**Key observations for planner:**

1. **MAINT-04 single-site change:** Wrapping `setLobby` in `useGameState.tsx` line 128 is the entire source change. All handlers benefit automatically. The only files changed are `useGameState.tsx` (1 line) and the new `withTeamsDerived.ts` helper (15 lines). `eventHandlers.ts` itself is NOT modified.

2. **MAINT-05 ripple:** `CombatManager.ts` rename of `playerAttackBoss` → `applyBasicDamageToBoss` affects `CombatManager.test.ts` (every `playerAttackBoss` call in tests must be renamed — there are ~30 call sites). The planner must include this rename sweep in the task.

3. **MAINT-06 downstream variable names:** `PlayerController.tsx` has ~15 internal references to `currentPlayer.id`, `currentPlayer.team`, `currentPlayer.avatar`, `currentLobby.id`, `currentLobby.gamePhase` that must be updated to use the new scalar variable names. The component body is ~1100 lines; the planner should enumerate the exact replacement sites.

4. **Test file StrictMode check:** Before writing the render-count test, the planner should verify `client/src/test/setup.ts` does NOT wrap in `React.StrictMode`. If it does, the render-count assertions will need adjustment (double counts) or the test needs a non-strict render wrapper.
