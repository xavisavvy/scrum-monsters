# Phase 52: Client God-Component Decomposition — Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 12 (6 modified, 6 new)
**Analogs found:** 11 / 12 (1 no analog: buffReducer — no existing useReducer in repo)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `client/src/components/game/Lobby.tsx` (MAINT-11 refs) | component | event-driven | `Lobby.tsx` L258-267 (flyingPlayersRef) — self-analog | exact |
| `client/src/components/game/Lobby.tsx` (MAINT-12 reducer) | component | event-driven | `usePhaseInterstitial.ts` (useState state machine) | role-match |
| `client/src/components/game/TavernScene.tsx` | component | event-driven | `PlayerController.tsx` L25 (React.memo named function) | exact (memo pattern) |
| `client/src/components/game/TavernLighting.tsx` | component | event-driven | `Lobby.tsx` L119-171 (self — move to co-locate in TavernScene) | exact (extract-in-place) |
| `client/src/components/game/LobbySettingsDialog.tsx` | component | request-response | `MagicEffect.tsx` (explicit props interface, no Zustand inside) | role-match |
| `client/src/components/game/LobbyAvatar.tsx` | component | event-driven | `PlayerCharacter.tsx` L41-55 (memo + explicit props, no isLocal flag) | exact |
| `client/src/lib/utils/applySpellEffects.ts` | utility | transform | `FloatingDamageManager.tsx` (pure dispatch caller, ref-reads) | role-match |
| `client/src/lib/reducers/buffReducer.ts` | utility | transform | no analog — first useReducer in repo | none |
| `client/src/lib/reducers/buffReducer.test.ts` | test | — | `PlayerCharacter.test.tsx` (Vitest + fake-timers pattern) | exact |
| `client/src/lib/hooks/useLobbyMovement.ts` | hook | event-driven | `useViewport.ts` (custom hook: state + effects + refs, returns object) | exact |
| `client/src/components/game/PlayerController.tsx` (MAINT-11 + MAINT-14) | component | event-driven | `Lobby.tsx` L258-267 (ref-mirror pattern) | exact |
| `client/src/components/game/TavernScene.test.tsx` | test | — | `PlayerCharacter.test.tsx` L104-151 (TrackingWrapper render-count) | exact |

---

## Pattern Assignments

### `Lobby.tsx` — MAINT-11: Ref-Mirror Pattern (the primary analog)

**Analog:** `Lobby.tsx` L258-267 (existing `flyingPlayersRef` pattern — self-referential)

This is the canonical ref-mirror pattern already established in the file. Every new ref in MAINT-11 copies it exactly.

**Existing ref-mirror pattern** (L258-267, verbatim):
```typescript
const flyingPlayersRef = React.useRef(flyingPlayers);
const playerPositionsRef = React.useRef(playerPositions);
const myPositionRef = React.useRef(myPosition);
const invisiblePlayersRef = React.useRef(invisiblePlayers);

// Keep refs in sync with state
React.useEffect(() => { flyingPlayersRef.current = flyingPlayers; }, [flyingPlayers]);
React.useEffect(() => { playerPositionsRef.current = playerPositions; }, [playerPositions]);
React.useEffect(() => { myPositionRef.current = myPosition; }, [myPosition]);
React.useEffect(() => { invisiblePlayersRef.current = invisiblePlayers; }, [invisiblePlayers]);
```

**Six new refs to add (MAINT-11), copying this exact pattern:**
```typescript
// Add immediately after L267 (after existing invisiblePlayersRef sync effect)
const jumpHeightRef = useRef(0);
useEffect(() => { jumpHeightRef.current = jumpState.jumpHeight; }, [jumpState.jumpHeight]);

const frozenPlayersRef = useRef(frozenPlayers);
useEffect(() => { frozenPlayersRef.current = frozenPlayers; }, [frozenPlayers]);

const petrifiedPlayersRef = useRef(petrifiedPlayers);
useEffect(() => { petrifiedPlayersRef.current = petrifiedPlayers; }, [petrifiedPlayers]);

const speedBuffsRef = useRef(speedBuffs);
useEffect(() => { speedBuffsRef.current = speedBuffs; }, [speedBuffs]);

const sizeBuffsRef = useRef(sizeBuffs);
useEffect(() => { sizeBuffsRef.current = sizeBuffs; }, [sizeBuffs]);

const deadPlayersRef = useRef(deadPlayers);
useEffect(() => { deadPlayersRef.current = deadPlayers; }, [deadPlayers]);
```

**Current movement dep array** (L593, verbatim — to be collapsed):
```typescript
}, [keys, currentLobby?.gamePhase, emit, deadPlayers, speedBuffs, sizeBuffs, currentPlayer?.id, jumpState.jumpHeight, flyingPlayers, frozenPlayers, petrifiedPlayers]);
```

**Collapsed dep array after MAINT-11:**
```typescript
}, [keys, currentLobby?.gamePhase, emit, currentPlayer?.id]);
```

Keep `keys` (movement guard + movement logic), `currentLobby?.gamePhase` (early-return guard), `emit` (stable from useWebSocket), `currentPlayer?.id` (freeze check). Everything else promoted to refs.

**Inside `movePlayer`, replace state reads with ref reads** (representative examples at L491, L511, L544, L564, L579):
- `frozenPlayers.has(playerId)` → `frozenPlayersRef.current.has(playerId)`
- `speedBuffs[playerId]` → `speedBuffsRef.current[playerId]`
- `flyingPlayers.has(playerId)` → `flyingPlayersRef.current.has(playerId)` (already a ref — confirm usage)
- `jumpState.jumpHeight` (L564) → `jumpHeightRef.current`
- `sizeBuffs[playerId]` (L579) → `sizeBuffsRef.current[playerId]`
- `deadPlayers.has(playerId)` (L510) → `deadPlayersRef.current.has(playerId)`

**Note on afterimage:** L564 becomes `const currentJumpHeight = jumpHeightRef.current;`. The jump-arc afterimage at L621 uses the rAF-local `height` variable — leave it unchanged (debunked seam).

---

### `Lobby.tsx` — MAINT-12: useReducer (no existing useReducer analog)

**There is no existing `useReducer` call anywhere in the codebase.** The closest pattern is the `usePhaseInterstitial` hook, which manages a small state machine with `useState` + `useCallback`. The `buffReducer` is the first reducer in this project.

**Analog for state-machine shape:** `usePhaseInterstitial.ts` L31-80

```typescript
// Pattern: useState + explicit state shape + callback handlers
// usePhaseInterstitial manages ActiveInterstitial | null state machine
export function usePhaseInterstitial() {
  const [activeInterstitial, setActiveInterstitial] = useState<ActiveInterstitial | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ... clearTimer, dismiss, triggerInterstitial callbacks
  return { activeInterstitial, triggerInterstitial, dismiss };
}
```

**MAINT-12 replaces `useState` with `useReducer` — target shape for `Lobby.tsx`:**
```typescript
// In Lobby.tsx, replace the 10 useState declarations (L226-254, L271-277)
// with a single useReducer:
const [buffState, dispatch] = useReducer(buffReducer, initialBuffState);
const {
  deadPlayers, flyingPlayers, frozenPlayers, petrifiedPlayers,
  tavernDarkMode, chaosMode, invisiblePlayers,
  dragonAttack, speedBuffs, sizeBuffs
} = buffState;
```

Destructuring preserves all existing JSX references — the JSX reads `deadPlayers` whether it comes from `useState` or destructured from `buffState`. Minimizes diff surface.

**Three useState slots that remain separate (do NOT go in reducer):**

| Variable | Line | Reason |
|----------|------|--------|
| `flyHeight` | L230 | Updated every 16ms by movement loop — routing through dispatch defeats perf |
| `invisibleFlicker` | L247 | Driven by a 2s `setInterval` at L352-371, not by spell dispatch |
| `screenShake` | L279 | Set on every movement tick at L580-583, cleared with setTimeout |

**Representative useState slots being replaced** (L226-254, L271-277):
```typescript
// BEFORE (13 useState declarations):
const [deadPlayers, setDeadPlayers] = useState<Set<string>>(new Set());
const [flyingPlayers, setFlyingPlayers] = useState<Set<string>>(new Set());
const [flyHeight, setFlyHeight] = useState(0); // STAYS as useState
const [frozenPlayers, setFrozenPlayers] = useState<Set<string>>(new Set());
const [petrifiedPlayers, setPetrifiedPlayers] = useState<Set<string>>(new Set());
const [tavernDarkMode, setTavernDarkMode] = useState(false);
const [chaosMode, setChaosMode] = useState(false);
const [invisiblePlayers, setInvisiblePlayers] = useState<Set<string>>(new Set());
const [invisibleFlicker, setInvisibleFlicker] = useState<...>({}); // STAYS
const [dragonAttack, setDragonAttack] = useState<...>({ active: false, ... });
const [speedBuffs, setSpeedBuffs] = useState<...>({});
const [sizeBuffs, setSizeBuffs] = useState<...>({});
const [screenShake, setScreenShake] = useState(0); // STAYS
```

**The if-cascade pattern** (L839-845, representative of ~280 lines):
```typescript
// BEFORE — handleLobbyEmote cascade (L840-1096):
if (detectedEffects.includes('die')) {
  const targets = resolveTargets('die');
  targets.forEach(targetId => {
    setDeadPlayers(prev => new Set([...prev, targetId]));
  });
}
if (detectedEffects.includes('revive')) { ... }
// ...18 more branches

// AFTER — collapse to:
detectedEffects.forEach(effect => {
  dispatch(buildAction(effect, resolveTargets(effect), casterPlayerId, isLocalCast));
});
```

**`isLocalCast` divergence (must NOT be elided):**
- Remote path (`handleLobbyEmote`, socket handler): `isLocalCast = false` → `setFlyHeight(0)` NOT called on earthbind/dispel
- Local path (`handleEmoteSubmit`, user action): `isLocalCast = true` → `setFlyHeight(0)` IS called when `targetId === currentPlayer.id`
- Thread `isLocalCast: boolean` into `buildAction` or pass to `applySpellEffects` — do not merge the two paths

**`DISPEL_ALL` closes the 7-setter race:** Current dispel (L957-995 remote / L1467-1509 local) calls 7 `setState` functions in an async socket handler. React 18 does NOT batch inside socket handlers. `DISPEL_ALL` collapses to one dispatch → one synchronous reducer call → one re-render.

---

### `client/src/lib/reducers/buffReducer.ts` (new file)

**No analog — first pure reducer in this codebase.** Implement as a pure function (no React imports, no hooks). Pure functions are testable without React.

**Location:** `client/src/lib/reducers/buffReducer.ts`

**Target shape** (from RESEARCH.md):
```typescript
export type BuffState = {
  deadPlayers: Set<string>;
  flyingPlayers: Set<string>;
  frozenPlayers: Set<string>;
  petrifiedPlayers: Set<string>;
  tavernDarkMode: boolean;
  chaosMode: boolean;
  invisiblePlayers: Set<string>;
  dragonAttack: { active: boolean; targetX: number; targetPlayerId: string | null };
  speedBuffs: Record<string, { type: 'haste' | 'slow'; stacks: number }>;
  sizeBuffs: Record<string, { type: 'enlarge' | 'reduce'; stacks: number }>;
};

export type BuffAction =
  | { type: 'DIE'; targets: string[] }
  | { type: 'REVIVE'; targets: string[] }
  | { type: 'HASTE'; targets: string[] }
  | { type: 'SLOW'; targets: string[] }
  | { type: 'ENLARGE'; targets: string[] }
  | { type: 'REDUCE'; targets: string[] }
  | { type: 'FLY'; targets: string[] }
  | { type: 'HOLD'; targets: string[] }
  | { type: 'UNHOLD'; targets: string[] }
  | { type: 'PETRIFY'; targets: string[] }
  | { type: 'INVISIBILITY'; targets: string[] }
  | { type: 'EARTHBIND'; targets: string[] }
  | { type: 'MASSACRE'; caster: string; victims: string[] }
  | { type: 'MASSREVIVE' }
  | { type: 'DRAGON'; victim: string; victimPos: number }
  | { type: 'DRAGON_END' }
  | { type: 'CHAOS' }
  | { type: 'CHAOS_END' }
  | { type: 'TAVERN_DARK_END' }
  | { type: 'DISPEL'; targets: string[] }
  | { type: 'DISPEL_ALL' }
  | { type: 'BREAK_INVISIBILITY'; playerId: string }
  | { type: 'PHASE_RESET' };

export const initialBuffState: BuffState = {
  deadPlayers: new Set(),
  flyingPlayers: new Set(),
  frozenPlayers: new Set(),
  petrifiedPlayers: new Set(),
  tavernDarkMode: false,
  chaosMode: false,
  invisiblePlayers: new Set(),
  dragonAttack: { active: false, targetX: 0, targetPlayerId: null },
  speedBuffs: {},
  sizeBuffs: {},
};

export function buffReducer(state: BuffState, action: BuffAction): BuffState {
  switch (action.type) {
    case 'DIE': {
      const next = new Set(state.deadPlayers);
      action.targets.forEach(id => next.add(id));
      return { ...state, deadPlayers: next };
    }
    case 'REVIVE': {
      const next = new Set(state.deadPlayers);
      action.targets.forEach(id => next.delete(id));
      return { ...state, deadPlayers: next };
    }
    // ... all actions
    case 'DISPEL_ALL':
    case 'PHASE_RESET':
      return { ...initialBuffState };
    default:
      return state;
  }
}
```

**Key reducer pitfall:** Multi-effect sequences (`['die', 'revive']` on same player) must compose correctly. `REVIVE` after `DIE` in the same `forEach` loop should leave the player alive. Test with: `buffReducer(buffReducer(initial, {type:'DIE', targets:['p1']}), {type:'REVIVE', targets:['p1']})`.

---

### `client/src/lib/reducers/buffReducer.test.ts` (new file)

**Analog:** `PlayerCharacter.test.tsx` L1-78 (Vitest structure, fake-timers, `vi.useFakeTimers()`)

**Imports pattern** (copy from PlayerCharacter.test.tsx L1-6):
```typescript
import { describe, it, expect } from 'vitest';
import { buffReducer, initialBuffState } from './buffReducer';
```

Note: No React import needed — reducer is a pure function. No render, no `@testing-library/react`.

**Test shape** (from RESEARCH.md):
```typescript
describe('buffReducer — DISPEL_ALL', () => {
  it('clears all buff state in one dispatch', () => {
    const initialState = {
      ...initialBuffState,
      deadPlayers: new Set(['p1']),
      flyingPlayers: new Set(['p2']),
      speedBuffs: { p3: { type: 'haste', stacks: 2 } },
    };
    const nextState = buffReducer(initialState, { type: 'DISPEL_ALL' });
    expect(nextState.deadPlayers.size).toBe(0);
    expect(nextState.flyingPlayers.size).toBe(0);
    expect(Object.keys(nextState.speedBuffs).length).toBe(0);
  });
});

describe('buffReducer — multi-effect composition', () => {
  it('die then revive on same player leaves player alive', () => {
    const afterDie = buffReducer(initialBuffState, { type: 'DIE', targets: ['p1'] });
    const afterRevive = buffReducer(afterDie, { type: 'REVIVE', targets: ['p1'] });
    expect(afterRevive.deadPlayers.has('p1')).toBe(false);
  });
});
```

---

### `client/src/lib/utils/applySpellEffects.ts` (new file)

**Analog:** `FloatingDamageManager.tsx` L1-54 (pure dispatch caller that reads refs, calls `dispatch` / `clearPendingDamage`)

**Pattern from FloatingDamageManager** (L18-38):
```typescript
// Pattern: reads ref-guarded set, dispatches without managing state directly
useEffect(() => {
  pendingDamageEvents.forEach((evt) => {
    if (!processedRef.current.has(evt.id)) {
      processedRef.current.add(evt.id);
      setActive((prev) => [...prev, { ... }]);
    }
  });
}, [pendingDamageEvents]);
```

**Target shape for applySpellEffects.ts:**
```typescript
// Pure function — no React imports, no hooks
import type { MagicEffectType } from '@/lib/utils/magicWords';
import type { Player } from '@/lib/gameTypes';
import type { BuffAction } from '@/lib/reducers/buffReducer';

export function resolveTargets(
  effectType: MagicEffectType,
  message: string,
  casterPlayerId: string,
  lobbyPlayers: Player[]
): string[] {
  // Mirrors the resolveTargets pattern at Lobby.tsx:817-837
  const spellWords = getSpellWords(effectType);
  const targetNames = extractSpellTargets(message, spellWords);
  if (!targetNames) return [casterPlayerId];
  const targetIds = targetNames
    .map(name => lobbyPlayers.find(p => p.name.toLowerCase() === name.toLowerCase())?.id)
    .filter(Boolean) as string[];
  return targetIds.length > 0 ? targetIds : [casterPlayerId];
}

export function applySpellEffects(
  detectedEffects: MagicEffectType[],
  message: string,
  casterPlayerId: string,
  lobbyPlayers: Player[],
  isLocalCast: boolean,
  dispatch: React.Dispatch<BuffAction>,
  setFlyHeight: (v: number) => void,  // only called when isLocalCast
  setMagicEffects: ...,
  setEmotes: ...,
): void {
  detectedEffects.forEach(effect => {
    const targets = resolveTargets(effect, message, casterPlayerId, lobbyPlayers);
    dispatch(buildAction(effect, targets, casterPlayerId, isLocalCast));
    // isLocalCast earthbind/dispel: setFlyHeight(0) when self in targets
    if (isLocalCast && (effect === 'earthbind' || effect === 'dispel')) {
      if (targets.includes(casterPlayerId)) setFlyHeight(0);
    }
  });
}
```

**Critical:** `resolveTargets` is now a pure exported function — testable without socket mocks. The `isLocalCast` distinction replaces the two near-identical cascade copies. See RESEARCH.md §"Key difference between the two cascade copies."

---

### `client/src/components/game/TavernScene.tsx` (new file)

**Analog:** `PlayerController.tsx` L25 — `export const PlayerController = React.memo(function PlayerController...`

**React.memo named function pattern** (PlayerController.tsx L25):
```typescript
export const PlayerController = React.memo(function PlayerController({ onPlayerPositionsUpdate }: PlayerControllerProps) {
```

**Imports pattern** (copy from Lobby.tsx L28-31):
```typescript
import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { attachWebglResilience } from '@/lib/utils/webglResilience';
```

**Core pattern — dpr owned inside scene** (replaces Lobby.tsx L2307-2324):
```typescript
// client/src/components/game/TavernScene.tsx
// TavernLighting co-located here (zero props, zero external deps — no separate file needed)
function TavernLighting() {
  // ... verbatim Lobby.tsx L119-171
}

const TavernScene = React.memo(function TavernScene({ isMobile }: { isMobile: boolean }) {
  const [dpr, setDpr] = useState<number>(Math.min(window.devicePixelRatio, 2));
  return (
    <Canvas
      camera={{ position: [0, 2, 8], fov: 120 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      dpr={dpr}
      gl={{ antialias: !isMobile, alpha: true }}
      onCreated={attachWebglResilience}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(d - 0.5, 1))}
        onIncline={() => setDpr((d) => Math.min(d + 0.5, 2))}
      >
        <Suspense fallback={null}>
          <TavernLighting />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  );
});

export { TavernScene };
```

**After extraction, remove from Lobby.tsx:**
- `const [dpr, setDpr] = useState(...)` at L175
- The entire Canvas block at L2307-2324
- `THREE` import at L31 (moves to TavernScene.tsx)
- `attachWebglResilience` import (moves to TavernScene.tsx)
- `PerformanceMonitor` import (moves to TavernScene.tsx)

**Replace with:**
```typescript
<TavernScene isMobile={isMobile} />
```

**Perf guardrail:** After extraction, `grep 'const \[dpr' client/src/components/game/Lobby.tsx` must return 0 matches. `TavernScene` is `React.memo` with stable `isMobile: boolean` prop — it will NOT re-render when Lobby's player/buff state changes.

---

### `client/src/components/game/TavernScene.test.tsx` (new file)

**Analog:** `PlayerCharacter.test.tsx` L104-151 — TrackingWrapper render-count pattern

**Full TrackingWrapper pattern** (PlayerCharacter.test.tsx L109-151):
```typescript
// TrackingWrapper subscribes to same selectors as component under test.
// When component re-renders, wrapper re-renders too (same Zustand subscription).
// renderCount increments track real re-renders, not parent-caused ones.
let renderCount = 0;

function TrackingWrapper(props: Parameters<typeof PlayerCharacter>[0]) {
  // Mirror PlayerCharacter's selector subscriptions — re-renders on same state changes
  useGameState((s) => s.currentLobby?.playerCombatStates?.[props.playerId ?? '']?.hp ?? 100);
  useGameState((s) => s.currentLobby?.playerCombatStates?.[props.playerId ?? '']?.maxHp ?? 100);
  renderCount++;
  return <PlayerCharacter {...props} />;
}

const { container } = render(<TrackingWrapper {...baseProps} playerId="p1" />);
const renderCountAfterMount = renderCount;

act(() => {
  useGameState.setState((s: any) => ({
    currentLobby: { ...s.currentLobby, boss: { currentHealth: 900 } },
  }));
});

expect(renderCount).toBe(renderCountAfterMount); // NOT re-rendered
```

**For TavernScene test — adapted:**
```typescript
// TavernScene only takes isMobile: boolean (stable after mount).
// Assert it does NOT re-render when Lobby state changes (player positions, buff application).
let renderCount = 0;

function TrackingWrapper({ isMobile }: { isMobile: boolean }) {
  // Subscribe to the same state changes Lobby would trigger
  useGameState((s) => s.currentLobby?.playerPositions);
  renderCount++;
  return <TavernScene isMobile={isMobile} />;
}

render(<TrackingWrapper isMobile={false} />);
const afterMount = renderCount;

act(() => {
  useGameState.setState((s: any) => ({
    currentLobby: { ...s.currentLobby, playerPositions: { p1: { x: 50, y: 85 } } },
  }));
});

expect(renderCount).toBe(afterMount); // TavernScene memo bails out
```

**Imports pattern** (copy from PlayerCharacter.test.tsx L1-6):
```typescript
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameState } from '@/lib/stores/useGameState';
import { TavernScene } from './TavernScene';
```

**Mock R3F** (Canvas/WebGL not available in happy-dom):
```typescript
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: any) => <div>{children}</div> }));
vi.mock('@react-three/drei', () => ({ PerformanceMonitor: ({ children }: any) => <>{children}</> }));
```

---

### `client/src/components/game/LobbySettingsDialog.tsx` (new file)

**Analog:** `MagicEffect.tsx` L451-548 — explicit named props interface, no Zustand inside, `onComplete` callback pattern

**Props interface pattern** (from MagicEffect.tsx L4-10):
```typescript
interface MagicEffectProps {
  type: MagicEffectType;
  x: number;
  y: number;
  onComplete?: () => void;
  duration?: number;
}
export function MagicEffect({ type, x, y, onComplete, duration = 2000 }: MagicEffectProps) {
```

**Target props interface for LobbySettingsDialog:**
```typescript
import type { LobbyState, Player, TimerSettings, JiraSettings, EstimationSettings } from '@/lib/gameTypes';

interface LobbySettingsDialogProps {
  currentLobby: LobbyState;
  currentPlayer: Player;
  isHost: boolean;
  onTimerUpdate: (settings: TimerSettings) => void;
  onJiraUpdate: (settings: JiraSettings) => void;
  onEstimationUpdate: (settings: EstimationSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LobbySettingsDialog({
  currentLobby, currentPlayer, isHost,
  onTimerUpdate, onJiraUpdate, onEstimationUpdate,
  open, onOpenChange
}: LobbySettingsDialogProps) {
  // JSX: verbatim Lobby.tsx L1817-1981
}
```

**Host+phase guard — must travel with `onEstimationUpdate`** (Lobby.tsx L1670-1680, verbatim):
```typescript
// This guard stays in Lobby.tsx as the implementation passed to onEstimationUpdate:
const updateEstimationSettings = (estimationSettings: EstimationSettings) => {
  if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;
  emit('update_estimation_settings', { estimationSettings });
  LobbySettingsStorage.updateEstimationSettings(estimationSettings);
  toast.success('Settings Saved', { description: 'Estimation settings have been updated', duration: 2000, id: 'settings-saved' });
};
```

The guard `if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;` is on `updateEstimationSettings` ONLY — NOT on `updateTimerSettings` or `updateJiraSettings`. This asymmetry is intentional (scale changes disrupt active voting). Guard must be present in the callback implementation — it is a runtime behavior guard, not caught by tsc.

**Dialog trigger guard** (Lobby.tsx ~L1817): `{isHost && <Dialog...>}` — the trigger is host-gated. Pass `isHost` as explicit prop; render the Dialog trigger conditionally: `{isHost && <DialogTrigger ...>}`.

**Imports to bring into LobbySettingsDialog.tsx:**
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import type { TimerSettings, JiraSettings, EstimationSettings, LobbyState, Player } from '@/lib/gameTypes';
```

---

### `client/src/components/game/LobbyAvatar.tsx` (new file)

**Analog:** `PlayerCharacter.tsx` L41-55 — `memo(function Name...` pattern with fully explicit props (no state flags that combine two behaviors)

**React.memo named function pattern** (PlayerCharacter.tsx L41-55):
```typescript
export const PlayerCharacter = memo(function PlayerCharacter({
  avatarClass,
  playerName,
  position,
  onPositionChange: _onPositionChange,
  onShoot: _onShoot,
  isJumping,
  jumpHeight = 0,
  isDead,
  containerWidth,
  containerHeight,
  playerId,
  isMoving = false,
  direction = 'down'
}: PlayerCharacterProps) {
```

**Explicit props for LobbyAvatar** (DO NOT use `isLocal: boolean`):
```typescript
import type { SpriteDirection } from '@/hooks/useSpriteAnimation';
import type { Player, MagicEffectType } from '@/lib/gameTypes';

interface LobbyAvatarProps {
  player: Player;
  position: { x: number; direction: SpriteDirection };
  jumpHeight: number;
  isMoving: boolean;
  isDead: boolean;
  isFrozen: boolean;
  isPetrified: boolean;
  isFlying: boolean;
  isInvisible: boolean;
  showInvisibleBadge: boolean;    // true only for local player (L2446)
  showReadyBadge: boolean;        // true only for other players (L2589)
  sizeBuff?: { type: 'enlarge' | 'reduce'; stacks: number };
  speedBuff?: { type: 'haste' | 'slow'; stacks: number };
  emote?: { message: string };
  magicEffects?: MagicEffectType[];
  characterSize: number;
  interactive: boolean;           // true for local player (onClick, onTouchStart)
  onTap?: () => void;             // local player tap-to-jump
  onEmoteComplete?: () => void;
  onMagicEffectComplete?: () => void;
}

export const LobbyAvatar = React.memo(function LobbyAvatar({
  player, position, jumpHeight, isMoving, isDead, isFrozen, isPetrified, isFlying,
  isInvisible, showInvisibleBadge, showReadyBadge, sizeBuff, speedBuff,
  emote, magicEffects, characterSize, interactive, onTap,
  onEmoteComplete, onMagicEffectComplete
}: LobbyAvatarProps) {
  // computeSizeScale extracted as pure helper first:
  // const sizeScale = computeSizeScale(sizeBuff);
  // ...
});
```

**Three structural divergences that make `isLocal` insufficient:**

| Prop | Local player | Other players | Source line |
|------|-------------|---------------|-------------|
| `showInvisibleBadge` | `true` | `false` | Lobby.tsx L2446: `{isInvisible && ' 👻'}` |
| `showReadyBadge` | `false` | `true` | Lobby.tsx L2589: `{player.isReady && <span>✓</span>}` |
| movement data source | `myPosition.x` / `keys.size > 0` / `jumpState.jumpHeight` | `playerPositions[id].x` / `position.isMoving` / `position.jumpHeight` | L2424, L2576 |

**`computeSizeScale` pure helper** (extracted from L2411-2416 and L2563-2569):
```typescript
export function computeSizeScale(sizeBuff?: { type: 'enlarge' | 'reduce'; stacks: number }): number {
  if (!sizeBuff) return 1;
  if (sizeBuff.type === 'enlarge') return 1 + (sizeBuff.stacks * 0.5); // 1.5x, 2x, 2.5x
  const reduceScales = [0.7, 0.5, 0.35];
  return reduceScales[sizeBuff.stacks - 1] || 0.35;
}
```

---

### `client/src/lib/hooks/useLobbyMovement.ts` (new file — LAST)

**Analog:** `useViewport.ts` L43-165 — canonical custom hook structure for this codebase

**Custom hook structure pattern** (useViewport.ts L43-64):
```typescript
export function useViewport(): ViewportState {
  // 1. State declarations
  const [viewportDimensions, setViewportDimensions] = useState<ViewportDimensions>({ ... });
  const [cameraPosition, setCameraPosition] = useState<ViewportPosition>({ ... });

  // 2. Refs
  const animationFrameRef = useRef<number>();
  const targetCameraPosition = useRef<ViewportPosition>({ ... });

  // 3. Effects (each with explicit dep array)
  useEffect(() => {
    const handleResize = () => { ... };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 4. useCallback for stable function references
  const worldToScreen = useCallback((worldX: number, worldY: number) => { ... }, [cameraPosition, scale, viewportDimensions]);

  // 5. Return object (not array)
  return { worldWidth, worldHeight, viewportWidth, viewportHeight, ... };
}
```

**Target shape for useLobbyMovement.ts:**
```typescript
import { useEffect, useRef, useCallback } from 'react';
import type { SpriteDirection } from '@/hooks/useSpriteAnimation';

interface UseLobbyMovementProps {
  keys: Set<string>;
  gamePhase: string | undefined;
  emit: ReturnType<typeof useWebSocket>['emit'];
  currentPlayerId: string | undefined;
  characterSize: number;
  moveSpeed: number;
  jumpHeightRef: React.MutableRefObject<number>;
  frozenPlayersRef: React.MutableRefObject<Set<string>>;
  petrifiedPlayersRef: React.MutableRefObject<Set<string>>;
  flyingPlayersRef: React.MutableRefObject<Set<string>>;
  speedBuffsRef: React.MutableRefObject<Record<string, { type: 'haste' | 'slow'; stacks: number }>>;
  sizeBuffsRef: React.MutableRefObject<Record<string, { type: 'enlarge' | 'reduce'; stacks: number }>>;
  deadPlayersRef: React.MutableRefObject<Set<string>>;
  movementAreaRef: React.MutableRefObject<HTMLDivElement | null>;
  setMyPosition: React.Dispatch<React.SetStateAction<{ x: number; direction: SpriteDirection }>>;
  setFlyHeight: React.Dispatch<React.SetStateAction<number>>;
  setAfterimages: React.Dispatch<React.SetStateAction<any[]>>;
  setScreenShake: React.Dispatch<React.SetStateAction<number>>;
  jumpState: { isJumping: boolean; jumpHeight: number };
}

export function useLobbyMovement({ keys, gamePhase, emit, currentPlayerId, ... }: UseLobbyMovementProps) {
  // Wraps Lobby.tsx L483-648:
  // - The 16ms movement useEffect (L483-593)
  // - The jump animation useEffect (L596-648)
  // No return value needed (pure side-effect hook)
}
```

**CRITICAL PREREQUISITE:** This hook MUST be extracted LAST (Wave B6). It wraps the 16ms interval and reads the promoted refs. If extracted before MAINT-11 promotes `frozenPlayersRef`/`speedBuffsRef` etc., the hook would capture stale `setState` closures and the dep-array collapse would be meaningless.

**Dep array in extracted hook:**
```typescript
// The collapsed dep array from MAINT-11 travels into the hook:
}, [keys, gamePhase, emit, currentPlayerId]);
// The refs are passed as props — they are stable MutableRefObjects, not deps
```

---

### `client/src/components/game/PlayerController.tsx` — MAINT-11 + MAINT-14

**Analog for ref-mirror:** Same `flyingPlayersRef` pattern from Lobby.tsx L258-267.

**MAINT-11 in PlayerController — currentDirection ref:**

**Current dep array** (PlayerController.tsx L490, verbatim):
```typescript
}, [keys, viewport, characterSize, moveSpeed, emit, currentDirection]);
```

`currentDirection` is read inside the `movePlayer` closure at L419 but also appears in the dep array, causing the interval to recreate when the player turns.

**Fix — promote `currentDirection` to ref:**
```typescript
// Add after currentDirection useState declaration
const currentDirectionRef = useRef<SpriteDirection>('down');
useEffect(() => { currentDirectionRef.current = currentDirection; }, [currentDirection]);
```

**Inside movePlayer at L419**, replace:
```typescript
let direction: SpriteDirection = currentDirection;
// → becomes:
let direction: SpriteDirection = currentDirectionRef.current;
```

**Collapsed dep array:**
```typescript
}, [keys, viewport, characterSize, moveSpeed, emit]);
```

**MAINT-14 — handleShootAtTarget signature:**

The three Ctrl-shoot sites (L129-193, L730-780, L941-993) all use the post-51 `worldToPercent` helper. Do NOT re-implement the math — call `worldToPercent` from the import already at L12.

**Existing Ctrl-shoot block** (Site 1, L129-193, representative verbatim):
```typescript
// handleKeyDown (L129-193): keyboard ControlLeft/ControlRight
if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && currentPlayer && !ctrlPressed) {
  setCtrlPressed(true);
  event.preventDefault();
  let targetX, targetY, targetPlayerId = null;
  if (currentPlayer.team === 'spectators') {
    const nearestPlayer = findNearestTargetPlayer();
    if (nearestPlayer) { targetX = nearestPlayer.x; targetY = nearestPlayer.y; targetPlayerId = nearestPlayer.id; }
    else { const centerWorld = viewport.worldToScreen(...); targetX = centerWorld.x; targetY = centerWorld.y; }
  } else {
    const bossWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
    targetX = bossWorld.x; targetY = bossWorld.y;
  }
  const characterCenterX = playerPosition.x + characterSize / 2;
  const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;
  const newProjectile = { ...projectileData, id: Math.random().toString(36).substring(2, 15), progress: 0 };
  setProjectiles(prev => [...prev, newProjectile]);
  // Site 2: worldToPercent now clamps to [0,100] (MAINT-10)
  const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
  const targetWorld = viewport.screenToWorld(targetX, targetY);
  const { x: percentStartX, y: percentStartY } = worldToPercent(startWorld.x, startWorld.y, viewport.worldWidth, viewport.worldHeight);
  const { x: percentTargetX, y: percentTargetY } = worldToPercent(targetWorld.x, targetWorld.y, viewport.worldWidth, viewport.worldHeight);
  emit('player_projectile', { startX: percentStartX, startY: percentStartY, targetX: percentTargetX, targetY: percentTargetY, emoji: getProjectileEmoji(currentPlayer.avatar), targetPlayerId: targetPlayerId || undefined });
}
```

**Important Site 3 distinction:** L941-993 (inline `onKeyDown` prop) emits `attack_player`/`attack_boss` (battle-phase variant), NOT `player_projectile`. `handleShootAtTarget` must accept a `mode: 'projectile' | 'direct'` parameter to handle this branching. Do not unify into a single emit.

**`handleShootAtTarget` proposed signature:**
```typescript
const handleShootAtTarget = useCallback((
  targetX: number,
  targetY: number,
  targetPlayerId: string | null,
  mode: 'projectile' | 'direct'
) => {
  const characterCenterX = playerPosition.x + characterSize / 2;
  const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;
  const newProjectile: Projectile = {
    id: Math.random().toString(36).substring(2, 15),
    startX: characterCenterX,
    startY: characterCenterY,
    targetX,
    targetY,
    emoji: getProjectileEmoji(currentPlayer!.avatar),
    progress: 0
  };
  setProjectiles(prev => [...prev, newProjectile]);
  if (mode === 'projectile') {
    const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
    const targetWorld = viewport.screenToWorld(targetX, targetY);
    const { x: psx, y: psy } = worldToPercent(startWorld.x, startWorld.y, viewport.worldWidth, viewport.worldHeight);
    const { x: ptx, y: pty } = worldToPercent(targetWorld.x, targetWorld.y, viewport.worldWidth, viewport.worldHeight);
    emit('player_projectile', { startX: psx, startY: psy, targetX: ptx, targetY: pty, emoji: getProjectileEmoji(currentPlayer!.avatar), targetPlayerId: targetPlayerId || undefined });
  } else {
    if (currentPlayer!.team === 'spectators' && targetPlayerId) {
      emit('attack_player', { targetId: targetPlayerId, damage: 0 });
    } else {
      emit('attack_boss', { damage: Math.floor(Math.random() * 3) + 1 });
    }
  }
}, [playerPosition, characterSize, viewport, currentPlayer, emit]);
```

**Two cooldown ticker blocks** (Sites at L205-215 and L716-724, verbatim — both identical):
```typescript
// Current pattern (copy of both):
setSpecialAttackCooldown(5000);
const cooldownInterval = setInterval(() => {
  setSpecialAttackCooldown(prev => {
    if (prev <= 100) { clearInterval(cooldownInterval); return 0; }
    return prev - 100;
  });
}, 100);
```

**`startCooldown` signature:**
```typescript
const startCooldown = useCallback(() => {
  setSpecialAttackCooldown(5000);
  const cooldownInterval = setInterval(() => {
    setSpecialAttackCooldown(prev => {
      if (prev <= 100) { clearInterval(cooldownInterval); return 0; }
      return prev - 100;
    });
  }, 100);
}, []); // setSpecialAttackCooldown is stable (React guarantees setState identity)
```

---

## Shared Patterns

### Ref-Mirror Pattern
**Source:** `Lobby.tsx` L258-267
**Apply to:** All new refs in MAINT-11 (Lobby.tsx and PlayerController.tsx)
```typescript
const fooRef = React.useRef(foo);
React.useEffect(() => { fooRef.current = foo; }, [foo]);
```
One `useRef` + one `useEffect` per promoted value. Declared immediately after the corresponding `useState`. No batching, no consolidation.

### React.memo Named Function Export
**Source:** `PlayerController.tsx` L25 / `PlayerCharacter.tsx` L41
**Apply to:** `TavernScene`, `LobbyAvatar`
```typescript
export const ComponentName = React.memo(function ComponentName(props: Props) { ... });
```
Always use the named function form (not arrow function inside memo) — named functions appear in React DevTools and stack traces.

### Explicit Props Interface (No Boolean Flags That Combine Behaviors)
**Source:** `PlayerCharacter.tsx` L24-38 / `MagicEffect.tsx` L4-10
**Apply to:** `LobbySettingsDialog`, `LobbyAvatar`
Define each distinguishing behavior as a separate named prop. See LobbyAvatar section: `showInvisibleBadge` + `showReadyBadge` instead of `isLocal: boolean`.

### Custom Hook Returns Object
**Source:** `useViewport.ts` L153-164 / `usePhaseInterstitial.ts` L80
**Apply to:** `useLobbyMovement` (no return needed — pure side-effect hook)
```typescript
// useViewport returns named object:
return { worldWidth, worldHeight, viewportWidth, viewportHeight, ... };
// usePhaseInterstitial returns named object:
return { activeInterstitial, triggerInterstitial, dismiss };
// useLobbyMovement: pure side-effect — no return
```

### Fake-Timers Test Pattern
**Source:** `PlayerCharacter.test.tsx` L56-77
**Apply to:** `useLobbyMovement.test.ts`, `PlayerController.test.ts` (fake-timers for setInterval spy)
```typescript
vi.useFakeTimers();
try {
  // ... act + assertions
  act(() => { vi.advanceTimersByTime(450); });
  expect(container.querySelector('[data-damaged="false"]')).toBeTruthy();
} finally {
  vi.useRealTimers();
}
```

### Vitest Mock Pattern for Image/WebGL Dependencies
**Source:** `PlayerCharacter.test.tsx` L7-9
**Apply to:** `TavernScene.test.tsx` (must mock `@react-three/fiber` Canvas)
```typescript
vi.mock('./SpriteRenderer', () => ({
  SpriteRenderer: () => <div data-testid="sprite-renderer" />,
}));
```

---

## Execution Order (Non-Negotiable)

This phase is NOT fully parallel. The wave structure is a hard constraint:

**Wave A (can run in parallel — different files):**
- A1: MAINT-11 in `Lobby.tsx` (promote 6 refs, collapse dep array)
- A2: MAINT-11 in `PlayerController.tsx` (`currentDirectionRef`) + MAINT-14 (`handleShootAtTarget`, `startCooldown`)

**Wave B (strictly sequential — all touch Lobby.tsx):**
- B1: MAINT-12 — create `buffReducer.ts` + `applySpellEffects.ts`, replace 13 useState + if-cascade in `Lobby.tsx`
- B2: MAINT-13 Step 1 — create `TavernScene.tsx` (TavernLighting co-located), remove `dpr` from Lobby
- B3: MAINT-13 Step 2 — create `LobbySettingsDialog.tsx`, remove dialog from Lobby
- B4: MAINT-13 Step 3 — create `LobbyAvatar.tsx` + `computeSizeScale`, remove avatar blocks from Lobby
- B5: MAINT-13 Step 4 — dedup `applySpellEffects` + `resolveTargets` (reuse utils from B1, `dispatch` from B1 reducer)
- B6: MAINT-13 Step 5 — create `useLobbyMovement.ts` (LAST — requires A1 refs to be in place)

**Why useLobbyMovement is LAST:** The hook wraps the 16ms interval and needs the promoted refs. Without A1 in place, the dep-array collapse is meaningless — the hook would capture stale setState closures instead of ref reads.

---

## Debunked Seams (Leave Alone)

| Seam | Why | Risk if Extracted |
|------|-----|-------------------|
| Unified emote hook (`handleLobbyEmote` + `handleEmoteSubmit`) | Deliberate dual-path: local path calls `setFlyHeight(0)`, reads `myPosition.x`; remote path reads refs. Unifying gains nothing. | Silent: local earthbind stops resetting flyHeight |
| Descriptor-driven settings form | T-shirt grid fights descriptor schema; no line reduction | Churn with no benefit |
| Afterimage "duplication" (L565 vs L621) | Two distinct triggers: movement-tick (reads `jumpHeightRef.current`) vs jump-arc rAF (reads rAF-local `height`) | Wrong y-positions on jump-arc afterimages |

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `client/src/lib/reducers/buffReducer.ts` | utility (reducer) | transform | No existing `useReducer` anywhere in the codebase. This is the first. Design the pure function per RESEARCH.md §2 BuffState/BuffAction. |

---

## Perf Acceptance Criteria

| Check | Command | Pass Condition |
|-------|---------|----------------|
| dpr removed from Lobby | `grep 'const \[dpr' client/src/components/game/Lobby.tsx \| wc -l` | 0 |
| TavernScene render isolation | `npx vitest run client/src/components/game/TavernScene.test.tsx` | TrackingWrapper renderCount unchanged after Lobby state mutations |
| Interval count (movement) | `npx vitest run client/src/lib/hooks/useLobbyMovement.test.ts` | `setInterval` spy called exactly 1 time per movement session |
| Interval count (PlayerController) | `npx vitest run client/src/components/game/PlayerController.test.ts` | Same 1-interval assertion |
| Full suite | `npm test` | 963+ tests green |

---

## Metadata

**Analog search scope:** `client/src/components/game/`, `client/src/lib/hooks/`, `client/src/lib/utils/`
**Files scanned:** 14 source files + 4 test files
**Pattern extraction date:** 2026-06-24
