# Phase 52: Client God-Component Decomposition — Research

**Researched:** 2026-06-24
**Domain:** React component decomposition, useReducer, useEffect dep-array management, R3F/Canvas perf guardrails
**Confidence:** HIGH

---

## Summary

Phase 52 decomposes two client god-components — `Lobby.tsx` (2862 lines) and `PlayerController.tsx` (1191 lines, post-51) — along a precisely audited set of seams identified by the 76-agent adversarial council in `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md`. Every seam has been verified against the live codebase with exact line ranges below.

The four requirements address distinct sub-problems: MAINT-11 stops the 16ms movement interval from recreating on every frame-tick by promoting buff Sets and `jumpState.jumpHeight` to refs; MAINT-12 collapses 13 magic-effect `useState` slots into one `useReducer` whose `DISPEL_ALL` action closes the 7-setter dispel race; MAINT-13 extracts five VERIFIED seams in a strict order (TavernLighting → LobbySettingsDialog → LobbyAvatar → applySpellEffects+resolveTargets → useLobbyMovement LAST); MAINT-14 deduplicates three verbatim Ctrl-shoot blocks and two cooldown ticker copies in `PlayerController`. Phase 51 already delivered `React.memo`, `useShallow` selectors, and `worldToPercent`/`percentToWorld` helpers in PlayerController — MAINT-14 builds on that foundation, not over it.

The perf guardrail is structural: `dpr` + `PerformanceMonitor` must stay INSIDE the extracted TavernScene component (Canvas never a controlled prop-receiver), and render-count assertions using the TrackingWrapper pattern from `PlayerCharacter.test.tsx` (Phase 49) are the automated gate.

**Primary recommendation:** Execute MAINT-11 and MAINT-12 in Lobby.tsx first (they are prereqs for useLobbyMovement and reduce the risk surface before extraction). Execute MAINT-14 in PlayerController in parallel with MAINT-11/12 (different file). MAINT-13 seam extractions are strictly sequential within Lobby.tsx, with useLobbyMovement LAST.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAINT-11 | The 16ms movement `useEffect` must no longer recreate on buff/jump changes — buff Sets and `jumpState.jumpHeight` become refs, dep array collapsed. Fake-timers test asserts one interval per movement session. Same fix in PlayerController. | Movement useEffect found at Lobby.tsx:483–593 (dep array L593) and PlayerController.tsx:412–490 (dep array L490). jumpHeight promotion to ref is the critical fix. |
| MAINT-12 | The 13 magic-effect `useState` slots become ONE `useReducer` (`BuffState`/`BuffAction`); the ~300-line if-cascade becomes `detectedEffects.forEach(e => dispatch(buildAction(e, resolveTargets(e))))`. Reducer unit-tested. `DISPEL_ALL` is one action. | All 13 useState slots verified at Lobby.tsx:226–289. The if-cascade spans L810–1120 (handleLobbyEmote) and L1305–1645 (handleEmoteSubmit). |
| MAINT-13 | Extract VERIFIED seams: `applySpellEffects`+`resolveTargets` dedup, `TavernLighting`, `LobbySettingsDialog` (host+phase guard preserved EXACTLY), `LobbyAvatar` (explicit props, NOT an `isLocal` flag), `useLobbyMovement` LAST. DEBUNKED seams LEFT ALONE. | Seams verified in live code with exact line ranges — see Seam Audit section. |
| MAINT-14 | `PlayerController` Ctrl-shoot logic (3× verbatim) → `handleShootAtTarget`; the two cooldown tickers → `startCooldown`. Phase 51 already did worldToPercent/percentToWorld and React.memo. | Three Ctrl-shoot sites at L129–193, L730–780, L941–993. Two cooldown tickers at L205–215, L716–724. Phase 51 Delta section has the full inventory. |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- TypeScript throughout; `npm run check` must exit 0 before any commit
- Tests: Vitest with happy-dom; `npm test` must pass (currently 963 tests baseline)
- Linting: `npm run lint` must exit 0
- Conventional Commits enforced by commitlint/husky
- Path aliases: `@` = `client/src`, `@shared` = `shared`
- Canvas/R3F: any Canvas prop that changes at runtime re-mounts the WebGL context — `dpr` must be owned by the scene component, never lifted above it
- No `eslint-disable` except on pre-existing necessary suppressions

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Movement loop (16ms interval) | Browser/Client | — | Pure client-side animation; no server involvement |
| Buff state machine (13 useState) | Browser/Client | — | All buff effects are client-visual; server emits emote but effect dispatch is local |
| Spell effects dispatcher | Browser/Client | — | `detectMagicWords` + state dispatch, no server roundtrip |
| 3D scene / Canvas / dpr | Browser/Client (scene-owned) | — | Must stay inside Canvas boundary — never a controlled prop-receiver |
| LobbySettings form | Browser/Client | API/Backend | Form renders locally; submits via `emit()` to server on change |
| Player avatar presentation | Browser/Client | — | Presentational; reads lobby state, no server writes |
| Movement hook (useLobbyMovement) | Browser/Client | — | Wraps interval + input; extracts LAST after refs are promoted |

---

## Phase 51 Delta — What Phase 51 Already Changed in PlayerController

**Critical reading:** MAINT-14 must target the POST-51 PlayerController (1191 lines), not the pre-51 version (~1175 lines).

### Phase 51 Plan 02 (MAINT-09) — no PlayerController changes
Handler boilerplate helpers were added to `client/src/lib/socket/eventHandlerUtils.ts` and `eventHandlers.ts`. PlayerController was not touched.

### Phase 51 Plan 03 (MAINT-10) — PlayerController coordinate helpers
[VERIFIED: 51-03-SUMMARY.md]

Five open-coded coordinate conversion sites were replaced with `worldToPercent`/`percentToWorld` imported from `useViewport.ts`:

| Site | Line (post-51) | Direction | Change |
|------|---------------|-----------|--------|
| Site 1 | L74–75 | percent→world (server sync) | percentToWorld, no behavior change |
| Site 2 | L182–185 | world→percent (keyboard Ctrl shoot) | worldToPercent, now clamps to [0,100] |
| Site 2b | L769–772 | world→percent (D-pad ControlLeft shoot) | worldToPercent (discovered 6th site), now clamps |
| Site 3 | L478–479 | world→percent (movement loop emit) | worldToPercent, equivalent (already clamped) |
| Site 4 | L555–558 | world→percent (click-to-shoot) | worldToPercent, now clamps to [0,100] |

### Phase 49 Plan 03 (MAINT-06) — PlayerController selectors + React.memo
[VERIFIED: 49-03-SUMMARY.md]

- `export const PlayerController = React.memo(function PlayerController...)` — component is now wrapped
- `currentPlayer` via `useShallow` over `{id, team, avatar, name}`
- `currentLobby` via `useShallow` over `{id, gamePhase, players, playerPositions, playerCombatStates}` — `boss` intentionally excluded
- `currentLobby?.boss` guard replaced with `currentLobby?.gamePhase === 'battle'` in `handleProjectileComplete`
- `import { useShallow } from 'zustand/react/shallow'` added

### What MAINT-14 MUST NOT redo
- Do NOT re-add `worldToPercent`/`percentToWorld` imports — already present at line 12
- Do NOT re-add `React.memo` — already wrapping the export
- Do NOT change the `useShallow` selector shape — those are Phase 49 decisions

### What MAINT-14 MUST still do (confirmed by live code grep)
Three verbatim Ctrl-shoot blocks remain post-51:

1. **Keyboard `handleKeyDown` (L129–193):** Inside `useEffect` at L88, handles `ControlLeft`/`ControlRight` keydown
2. **Mobile `handleMobileKeyDown` (L730–780):** Handles `code === 'ControlLeft'` in the mobile callback
3. **`onKeyDown` inline handler (L941–993):** On the container `<div>`'s `onKeyDown` prop

All three contain the same logic: target resolution (spectator → `findNearestTargetPlayer`, dev/qa → boss coords), character center calculation, `new Projectile` creation, `setProjectiles`, and `emit('player_projectile', ...)`.

Two cooldown ticker blocks remain:

1. **In `handleKeyDown` useEffect (L205–215):** `setSpecialAttackCooldown(5000)` + `setInterval(...prev - 100...)` + `clearInterval`
2. **In `handleMobileKeyDown` callback (L716–724):** Identical pattern

---

## Seam Audit (MAINT-13 Critical Gate)

### VERIFIED Seams — Extract These

| Seam | Line Range in Lobby.tsx | Depends On | Extraction Target | Order |
|------|------------------------|------------|-------------------|-------|
| `TavernLighting` | L119–171 (function body) | THREE, R3F `points`/`bufferGeometry`/`pointsMaterial` | `client/src/components/game/TavernLighting.tsx` (zero props) | 1st |
| `LobbySettingsDialog` | L1817–1981 (Dialog open through closing brace), handlers at L1648–1680 | `currentLobby`, `currentPlayer`, `emit`, `updateTimerSettings`, `updateJiraSettings`, `updateEstimationSettings` | `client/src/components/game/LobbySettingsDialog.tsx` — props: `{currentLobby, currentPlayer, isHost, onTimerUpdate, onJiraUpdate, onEstimationUpdate}` | 2nd |
| `LobbyAvatar` | L2392–2544 (my player block) + L2571–2695 (other players block) | See explicit props table below | `client/src/components/game/LobbyAvatar.tsx` | 3rd |
| `applySpellEffects` + `resolveTargets` dedup | `resolveTargets` at L817–837 (remote path) and L1310–1329 (local path); full spell dispatch L810–1120 (handleLobbyEmote) + L1305–1645 (handleEmoteSubmit) | buff state setter functions, `flyingPlayersRef`, `invisiblePlayersRef`, `playerPositionsRef`, `myPosition` | `client/src/lib/utils/applySpellEffects.ts` (pure function) | 4th |
| `useLobbyMovement` | L483–648 (movement useEffect + jump animation) + keyboard handlers L386–459 | ALL buff refs (must be in place after MAINT-11) | `client/src/lib/hooks/useLobbyMovement.ts` | LAST (5th) |

### LobbySettingsDialog — Host+Phase Guard (MUST preserve verbatim)

[VERIFIED: Lobby.tsx:1670–1680]

```typescript
// In updateEstimationSettings (L1670–1680):
const updateEstimationSettings = (estimationSettings: EstimationSettings) => {
  if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;
  emit('update_estimation_settings', { estimationSettings });
  LobbySettingsStorage.updateEstimationSettings(estimationSettings);
  toast.success('Settings Saved', { ... });
};
```

The guard `if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;` is ONLY on `updateEstimationSettings`, not on `updateTimerSettings` or `updateJiraSettings`. This asymmetry is intentional — timer/jira settings can be changed by any host anytime, but estimation scale changes are lobby-phase-only (active voting is disrupted by scale changes). When extracting `LobbySettingsDialog`, the guard must travel with `onEstimationUpdate` — it must be inside the extracted component's callback, not dropped. The Dialog trigger button is also host-gated (`{isHost && <Dialog...>}`).

### LobbyAvatar — Explicit Props (NOT isLocal flag)

[VERIFIED: Lobby.tsx:2391–2695]

The "my player" block (L2392–2544) and "other players" block (L2571–2695) have THREE structural divergences that a single `isLocal` flag cannot represent cleanly:

1. **Invisible badge (👻):** shown in name label for local player only (`{isInvisible && ' 👻'}` at L2445)
2. **Ready badge (✓):** shown in name label for OTHER players only (`{player.isReady && ...}` at L2589) — local player does not show their own ready badge in this view
3. **Movement data source:** local player reads `myPosition.x` / `keys.size > 0` / `jumpState.jumpHeight`; other players read `playerPositions[player.id].x` / `position.isMoving` / `position.jumpHeight`

The extracted `LobbyAvatar` must take explicit props:

```typescript
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
  showInvisibleBadge: boolean;    // true only for local player
  showReadyBadge: boolean;        // true only for other players
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
```

Also extract `computeSizeScale` as a pure helper first (used in both branches at L2411–2416 and L2563–2569).

### DEBUNKED Seams — Leave These Alone

| Seam | Why Debunked | Risk if Extracted |
|------|-------------|-------------------|
| **Unified emote spell hook** (`handleLobbyEmote` + `handleEmoteSubmit` into one hook) | The two LOBBY-WIDE SPELLS blocks (L998, L1512) are a **deliberate self/peer dual-path**: the local path adds `setFlyHeight(0)` on earthbind, uses `currentPlayer.id` as caster, reads `myPosition.x` directly; the remote path uses `flyingPlayersRef.current` and `playerPositionsRef.current`. Unifying would require threading the local-vs-remote distinction back in, gaining nothing. | Silent behavior change: local earthbind would stop resetting flyHeight; local dispel would stop resetting flyHeight for self |
| **Descriptor-driven settings form** | The settings form has structurally distinct sub-forms: conditional Jira URL input, timer duration select (conditional on enabled), T-shirt grid (conditional on scaleType). Descriptor abstraction (render-from-config) would add indirection without reducing JSX volume, and the T-shirt grid fights any descriptor schema. | Code churn with no line reduction |
| **Afterimage "duplication"** (L565 vs L621) | The afterimage at L565 fires on movement tick (inside the interval, reads `jumpState.jumpHeight` as `currentJumpHeight`); the afterimage at L621 fires on jump-arc progression (inside the jump rAF, `y: height` is the arc-local variable). Two distinct triggers, different data sources. | Merging would cause afterimages to appear at wrong y-positions; jump-arc afterimages would use stale jump height |

---

## 1. The 16ms Movement useEffect (MAINT-11)

### In Lobby.tsx

**Location:** `useEffect` at L483–593, `setInterval(movePlayer, 16)` at L591.

**Current dep array (L593):**
```typescript
}, [keys, currentLobby?.gamePhase, emit, deadPlayers, speedBuffs, sizeBuffs, currentPlayer?.id, jumpState.jumpHeight, flyingPlayers, frozenPlayers, petrifiedPlayers]);
```

**Deps that cause recreation on every frame:**
- `jumpState.jumpHeight` — updated every rAF tick during a 600ms jump → interval recreated ~60 times during a single jump
- `flyingPlayers` — a `Set<string>` created via `new Set(...)` on every spell cast → recreation per spell
- `frozenPlayers`, `petrifiedPlayers` — same pattern

**Failure mode:** During a jump, `jumpState.jumpHeight` changes on every requestAnimationFrame call. React re-renders, dep array is re-evaluated, the interval is cleared and recreated. The old interval teardown + new interval setup runs ~60 times per second during airborne movement. The `setInterval` / `clearInterval` churn also creates GC pressure. Worse: during the 16ms window between old-interval-teardown and new-interval-setup, movement position updates are missed, causing jerky animation under load.

**The fix — promote to refs (mirrors the existing `flyingPlayersRef` pattern at L258–267):**
```typescript
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

Inside `movePlayer`, replace all direct state reads (`frozenPlayers.has(...)`, `speedBuffs[playerId]`, etc.) with ref reads (`frozenPlayersRef.current.has(...)`, `speedBuffsRef.current[playerId]`, etc.). Replace `jumpState.jumpHeight` with `jumpHeightRef.current`.

**Collapsed dep array:**
```typescript
}, [keys, currentLobby?.gamePhase, emit, currentPlayer?.id]);
```

`keys` stays because `keys.size === 0` is the early-return guard and `keys.has(...)` is the movement logic. `currentLobby?.gamePhase` stays because the early-return is `if (gamePhase !== 'lobby') return`. `emit` stays (stable from useWebSocket). `currentPlayer?.id` stays for the freeze check.

**Note on afterimage generation:** The afterimage-generation code inside the movement callback currently reads `jumpState.jumpHeight` (L565: `const currentJumpHeight = jumpState.jumpHeight`). After the fix, this becomes `const currentJumpHeight = jumpHeightRef.current`.

### In PlayerController.tsx

**Location:** `useEffect` at L412–490, `setInterval(movePlayer, 16)` at L488.

**Current dep array (L490):**
```typescript
}, [keys, viewport, characterSize, moveSpeed, emit, currentDirection]);
```

PlayerController's movement loop is already leaner — `currentDirection` is a `SpriteDirection` string (stable between renders unless direction actually changes), and the phase-49 `useShallow` selector ensures `currentLobby` is not in the dep array. The `jumpHeight` issue in PlayerController is different: `jumpHeight` is a `number` state used in rendering but NOT in the movement dep array (the movement effect uses rAF for jump physics, separate from the interval). So MAINT-11 in PlayerController is narrower:

**What needs fixing in PlayerController:** `currentDirection` is read INSIDE the movePlayer closure (L419) but also appears in the dep array, causing the interval to recreate when the player turns. Promote `currentDirection` to a ref:
```typescript
const currentDirectionRef = useRef<SpriteDirection>('down');
useEffect(() => { currentDirectionRef.current = currentDirection; }, [currentDirection]);
```
Dep array becomes:
```typescript
}, [keys, viewport, characterSize, moveSpeed, emit]);
```

### Fake-Timers Test Pattern

[VERIFIED: existing pattern in PlayerCharacter.test.tsx using `vi.useFakeTimers()`]

```typescript
// Proposed test for useLobbyMovement / movement useEffect:
it('creates exactly ONE interval per movement session', () => {
  vi.useFakeTimers();
  const setIntervalSpy = vi.spyOn(global, 'setInterval');
  
  // Render component / invoke hook with active movement
  // Trigger buff change (should NOT recreate interval)
  act(() => { /* simulate jumpHeight change */ });
  act(() => { /* simulate flyingPlayers change */ });
  
  expect(setIntervalSpy).toHaveBeenCalledTimes(1); // NOT 3
  
  vi.useRealTimers();
});
```

---

## 2. The 13 Magic-Effect useState Slots (MAINT-12)

### All 13 useState Declarations

[VERIFIED: Lobby.tsx:226–289, grep confirmed]

| # | Variable | Line | Type | Buff/Non-buff |
|---|----------|------|------|----------------|
| 1 | `deadPlayers` | L226 | `Set<string>` | buff-adjacent (die/revive magic) |
| 2 | `flyingPlayers` | L229 | `Set<string>` | buff |
| 3 | `flyHeight` | L230 | `number` | **local-player-only** — NOT a per-player buff set |
| 4 | `frozenPlayers` | L233 | `Set<string>` | buff |
| 5 | `petrifiedPlayers` | L236 | `Set<string>` | buff |
| 6 | `tavernDarkMode` | L239 | `boolean` | lobby-wide spell side-effect |
| 7 | `chaosMode` | L242 | `boolean` | lobby-wide spell side-effect |
| 8 | `invisiblePlayers` | L245 | `Set<string>` | buff |
| 9 | `invisibleFlicker` | L247 | `Record<string, boolean>` | derived from invisiblePlayers — flicker timer |
| 10 | `dragonAttack` | L250 | `{active, targetX, targetPlayerId}` | lobby-wide spell animation state |
| 11 | `speedBuffs` | L271 | `Record<string, {type, stacks}>` | buff |
| 12 | `sizeBuffs` | L276 | `Record<string, {type, stacks}>` | buff |
| 13 | `screenShake` | L279 | `number` | derived from sizeBuffs (enlarge movement) |

**Slots that do NOT belong in the reducer (special-case exclusions):**
- `flyHeight` (L230): This is the local player's current flight altitude pixel value, updated every 16ms by the movement loop. It is NOT a per-player buff toggle — it is continuous animation state. Including it in the reducer would route every movement frame through a dispatch, defeating the perf purpose. Recommend keeping as a separate `useState` or `useRef`.
- `invisibleFlicker` (L247): Driven by a 2-second setInterval (L352–371) that randomly flickers, not by a spell dispatch. Keep as separate `useState`.
- `screenShake` (L279): Set to 0 or `sizeBuff.stacks` on every movement tick (L580–583), then cleared with `setTimeout`. Keep as separate `useState`.

**The 10 slots that do belong in the reducer:**

```typescript
type BuffState = {
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

type BuffAction =
  | { type: 'DIE'; targets: string[] }
  | { type: 'REVIVE'; targets: string[] }
  | { type: 'HASTE'; targets: string[] }
  | { type: 'SLOW'; targets: string[] }
  | { type: 'ENLARGE'; targets: string[] }
  | { type: 'REDUCE'; targets: string[] }
  | { type: 'FLY'; targets: string[] }
  | { type: 'HOLD'; targets: string[] }  // frozen
  | { type: 'UNHOLD'; targets: string[] }  // auto-unfreeze after 5s
  | { type: 'PETRIFY'; targets: string[] }
  | { type: 'INVISIBILITY'; targets: string[] }
  | { type: 'EARTHBIND'; targets: string[] }  // lobby-wide: kills flyers
  | { type: 'MASSACRE'; caster: string; victims: string[] }  // lobby-wide
  | { type: 'MASSREVIVE' }
  | { type: 'DRAGON'; victim: string; victimPos: number }  // lobby-wide
  | { type: 'DRAGON_END' }
  | { type: 'CHAOS' }
  | { type: 'CHAOS_END' }
  | { type: 'TAVERN_DARK_END' }
  | { type: 'DISPEL'; targets: string[] }
  | { type: 'DISPEL_ALL' }  // PHASE RESET — clears all effect state
  | { type: 'BREAK_INVISIBILITY'; playerId: string }  // when invisible player casts
  | { type: 'PHASE_RESET' }  // triggered by gamePhase !== 'lobby'
```

### The if-cascade → forEach dispatch

**Current structure (two near-identical blocks):**
- `handleLobbyEmote` handler (L810–1120): `resolveTargets` at L817, if-cascade L840–1096
- `handleEmoteSubmit` callback (L1275–1646): `resolveTargets` at L1310, if-cascade L1332–1620

**After extraction:**
```typescript
// Pure function in lib/utils/applySpellEffects.ts
export function applySpellEffects(
  detectedEffects: MagicEffectType[],
  message: string,
  casterPlayerId: string,
  lobbyPlayers: Player[],
  flyingPlayersRef: React.MutableRefObject<Set<string>>,
  invisiblePlayersRef: React.MutableRefObject<Set<string>>,
  dispatch: React.Dispatch<BuffAction>,
  setMagicEffects: ...,
  setEmotes: ...,
): void {
  const resolvedTargets = (effectType: MagicEffectType) => resolveTargets(
    effectType, message, casterPlayerId, lobbyPlayers
  );
  detectedEffects.forEach(effect => {
    dispatch(buildAction(effect, resolvedTargets(effect), casterPlayerId, lobbyPlayers));
  });
}

// Pure helper (can be unit tested in isolation):
export function resolveTargets(
  effectType: MagicEffectType,
  message: string,
  casterPlayerId: string,
  lobbyPlayers: Player[]
): string[] {
  const spellWords = getSpellWords(effectType);
  const targetNames = extractSpellTargets(message, spellWords);
  if (!targetNames) return [casterPlayerId];
  const targetIds = targetNames
    .map(name => lobbyPlayers.find(p => p.name.toLowerCase() === name.toLowerCase())?.id)
    .filter(Boolean) as string[];
  return targetIds.length > 0 ? targetIds : [casterPlayerId];
}
```

**Key difference between the two cascade copies (must be preserved):**
- Remote path (`handleLobbyEmote`): `setFlyHeight(0)` is NOT called on dispel/earthbind (because fly height is the local player's state; a remote cast doesn't affect local fly height). Position reads use `playerPositionsRef.current[targetId]?.x`.
- Local path (`handleEmoteSubmit`): `setFlyHeight(0)` IS called when dispelling/earthbinding self (`targetId === currentPlayer.id`). Position reads use `myPosition.x` for self, `playerPositions[targetId]?.x` for others.
- This means `isLocalCast` boolean must be threaded into `buildAction` or `applySpellEffects`, not elided.

**`DISPEL_ALL` closes the 7-setter race:**
The current dispel handler calls 7 separate `setState` functions (L957–995 remote, L1467–1509 local). React 18 batches these within event handlers but NOT within socket event handlers (async context). `DISPEL_ALL` collapses them into one dispatch → one synchronous reducer call → one re-render.

### Reducer Unit Test Shape

```typescript
describe('buffReducer — DISPEL_ALL', () => {
  it('clears all buff state in one dispatch', () => {
    const initialState = { deadPlayers: new Set(['p1']), flyingPlayers: new Set(['p2']), ... };
    const nextState = buffReducer(initialState, { type: 'DISPEL_ALL' });
    expect(nextState.deadPlayers.size).toBe(0);
    expect(nextState.flyingPlayers.size).toBe(0);
    // ... all cleared
  });
});
```

---

## 3. MAINT-14 — PlayerController Dedup

### The Three Ctrl-Shoot Verbatim Blocks

[VERIFIED: grep output above]

**Site 1 — keyboard handleKeyDown useEffect (L129–193):**
Inside `useEffect(() => { ... }, [isJumping, jumpDuration, currentPlayer, viewport, playerPosition, characterSize])`. Handles `ControlLeft`/`ControlRight` `event.code`.

**Site 2 — mobile handleMobileKeyDown callback (L730–780):**
Handles `code === 'ControlLeft'`. Same target-resolution logic, same `worldToPercent` calls (already using helpers from Phase 51), same `emit('player_projectile', ...)`.

**Site 3 — inline onKeyDown prop handler (L941–993):**
On the container `<div>`'s `onKeyDown` prop. Handles `event.code === 'ControlLeft' || 'ControlRight'`. Same pattern but slightly compressed (no emoji in the emit call — emits `attack_player`/`attack_boss` instead of `player_projectile`).

**Important distinction:** Sites 1 and 2 emit `player_projectile` (client-side projectile + server broadcast). Site 3 emits `attack_player`/`attack_boss` directly (battle phase keyboard shortcut, different path). These are NOT identical — Site 3 is the battle-phase variant. `handleShootAtTarget` must handle this branching.

**Proposed `handleShootAtTarget` signature:**
```typescript
const handleShootAtTarget = useCallback((
  targetX: number,
  targetY: number,
  targetPlayerId: string | null,
  mode: 'projectile' | 'direct' // projectile = Sites 1/2, direct = Site 3
) => {
  const characterCenterX = playerPosition.x + characterSize / 2;
  const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;
  const newProjectile: Projectile = {
    id: Math.random().toString(36).substring(2, 15),
    startX: characterCenterX, startY: characterCenterY,
    targetX, targetY,
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

### The Two Cooldown Ticker Blocks

**Site 1 — in handleKeyDown useEffect (L205–215):**
```typescript
setSpecialAttackCooldown(5000);
const cooldownInterval = setInterval(() => {
  setSpecialAttackCooldown(prev => {
    if (prev <= 100) { clearInterval(cooldownInterval); return 0; }
    return prev - 100;
  });
}, 100);
```

**Site 2 — in handleMobileKeyDown callback (L716–724):**
Identical 8-line block.

**Proposed `startCooldown` signature:**
```typescript
const startCooldown = useCallback(() => {
  setSpecialAttackCooldown(5000);
  const cooldownInterval = setInterval(() => {
    setSpecialAttackCooldown(prev => {
      if (prev <= 100) { clearInterval(cooldownInterval); return 0; }
      return prev - 100;
    });
  }, 100);
}, []); // setSpecialAttackCooldown is stable
```

---

## 4. Perf Guardrail Measurement

### Canvas/dpr Current Location

[VERIFIED: Lobby.tsx:2306–2323]

```typescript
// Layer 2: Particle Lighting Effects (L2307–2324)
<div className="absolute inset-0" style={{ zIndex: 8, pointerEvents: 'none' }}>
  <Canvas
    camera={{ position: [0, 2, 8], fov: 120 }}
    style={{ width: '100%', height: '100%', touchAction: 'none' }}
    dpr={dpr}                     // ← dpr is a controlled prop from useState at L175
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
</div>
```

**The problem:** `dpr` is a `useState` in `Lobby`, passed as a prop to `<Canvas dpr={dpr}>`. When `PerformanceMonitor` adjusts `dpr`, it calls `setDpr(...)` in `Lobby`, causing Lobby to re-render, which passes the new `dpr` prop down to Canvas. This is the "controlled prop-receiver" anti-pattern — React Three Fiber re-creates the WebGL context when `dpr` changes as a prop from outside.

**The fix — extract `TavernScene` as a self-contained component:**

```typescript
// client/src/components/game/TavernScene.tsx
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
```

`dpr` is now owned by `TavernScene`, not `Lobby`. When `PerformanceMonitor` calls `setDpr`, only `TavernScene` re-renders — not `Lobby`. The WebGL context is NOT re-created because `dpr` is internal state, not a prop that changed from outside.

The extracted `TavernLighting` function (MAINT-13 seam 1) moves into `TavernScene.tsx` as a local component — it has zero props and zero closure dependencies.

**Remove `dpr` useState from Lobby (L175)** after extraction.

### Render-Count Measurement Strategy

[VERIFIED: PlayerCharacter.test.tsx:81–152 — TrackingWrapper pattern from Phase 49]

The **TrackingWrapper mirror-subscription pattern** is the established approach in this codebase:

```typescript
// Pattern: wrapper subscribes to same selectors as component under test
// When component re-renders, wrapper re-renders too (same Zustand subscription)
// renderCount increments track real re-renders, not parent-caused ones

let renderCount = 0;
function TrackingWrapper(props) {
  // Subscribe to same state as component
  useGameState(s => s.currentLobby?.someField);
  renderCount++;
  return <ComponentUnderTest {...props} />;
}
```

**For the extracted TavernScene:** Since `TavernScene` is `React.memo`'d and only takes `isMobile: boolean` (stable unless resize triggers mobile breakpoint change), the test simply confirms `TavernScene` does NOT re-render when Lobby's state changes (e.g., player position update, buff application).

**Manual verification (profiler):**
React DevTools Profiler → record → perform 5 seconds of keyboard movement → stop. Check that `Lobby` component re-render count matches pre-refactor, and that `TavernScene` shows 0 or 1 re-renders (only the initial mount).

The review states: "do not lift any new state above the Canvas boundary" — specifically, `dpr` must NOT be in `Lobby`'s state after this phase. This is a verifiable acceptance criterion: `grep 'const \[dpr' client/src/components/game/Lobby.tsx` must return 0 matches after MAINT-13.

---

## 5. Wave/Plan Structure and Ordering

### File-Conflict Map

| Requirement | Files Touched |
|-------------|---------------|
| MAINT-11 (movement refs) | `Lobby.tsx`, `PlayerController.tsx` |
| MAINT-12 (reducer) | `Lobby.tsx`, new `buffReducer.ts`, new `applySpellEffects.ts` |
| MAINT-13 (seam extractions) | `Lobby.tsx`, new `TavernLighting.tsx`, new `TavernScene.tsx`, new `LobbySettingsDialog.tsx`, new `LobbyAvatar.tsx`, new `useLobbyMovement.ts` |
| MAINT-14 (PlayerController dedup) | `PlayerController.tsx` |

**MAINT-11 + MAINT-12 both touch Lobby.tsx** → must be sequential or carefully wave-separated within Lobby.
**MAINT-11 + MAINT-14 both touch PlayerController.tsx** → must be sequential in PlayerController.
**MAINT-13 ALL steps touch Lobby.tsx** → strictly sequential.
**MAINT-14 (PlayerController) can run PARALLEL to Lobby work** — no file overlap.

### Recommended Wave Structure

**Wave A (parallel-safe — different files):**
- `A1`: MAINT-11 in `Lobby.tsx` — promote buff refs, collapse dep array
- `A2`: MAINT-11 + MAINT-14 in `PlayerController.tsx` — `currentDirectionRef` + `handleShootAtTarget` + `startCooldown`

Wait for Wave A. Then:

**Wave B (sequential — all Lobby.tsx):**
- `B1`: MAINT-12 — create `buffReducer.ts`, `applySpellEffects.ts`, replace 13 useState + if-cascade in Lobby.tsx
- `B2`: MAINT-13 Step 1 — extract `TavernLighting.tsx` + `TavernScene.tsx` (also removes `dpr` from Lobby)
- `B3`: MAINT-13 Step 2 — extract `LobbySettingsDialog.tsx`
- `B4`: MAINT-13 Step 3 — extract `LobbyAvatar.tsx` + `computeSizeScale` pure helper
- `B5`: MAINT-13 Step 4 — dedup `applySpellEffects` + `resolveTargets` (reuse the utils from B1)
- `B6`: MAINT-13 Step 5 — extract `useLobbyMovement` (LAST — deps on A1 refs being in place)

**Why useLobbyMovement LAST:** The hook wraps the 16ms interval. If extracted before the buff refs are promoted (A1), the hook would capture stale setState closures. A1 must be committed and refs in place before the hook extraction, otherwise the dep-array collapse is meaningless.

### Parallelization Summary

This phase is NOT fully parallel:
- Wave A (A1 + A2) CAN run in parallel worktrees (different files)
- Wave B steps are strictly sequential (all modify Lobby.tsx)
- B1 (reducer) should precede B5 (applySpellEffects dedup) because B5 reuses `dispatch` from B1
- A1 must precede B6 (useLobbyMovement) because the hook needs the promoted refs

---

## Architecture Patterns

### Ref-Mirror Pattern (established in this codebase)

[VERIFIED: Lobby.tsx:258–267]

```typescript
// Existing pattern (flyingPlayersRef, playerPositionsRef, etc.):
const flyingPlayersRef = React.useRef(flyingPlayers);
React.useEffect(() => { flyingPlayersRef.current = flyingPlayers; }, [flyingPlayers]);
```

Every new ref in MAINT-11 follows this exact pattern. The ref is declared right after the state and the sync effect follows immediately. This is the repo's convention.

### React.memo for Extracted Scene Components

[VERIFIED: PlayerController.tsx:25 — `export const PlayerController = React.memo(function PlayerController...`]

All extracted components in this phase should be `React.memo(function Name...)` named function exports. This matches the Phase 49 convention.

### useReducer for Complex State Machines

The pattern recommended is:
1. Declare `buffReducer` as a pure function (testable without React) in `client/src/lib/reducers/buffReducer.ts`
2. Use `const [buffState, dispatch] = useReducer(buffReducer, initialBuffState)` in Lobby
3. Destructure `const { deadPlayers, flyingPlayers, ... } = buffState` for consumption

This keeps render references identical to the pre-refactor code (JSX reads `deadPlayers` regardless of whether it comes from `useState` or `useReducer`), minimizing diff surface in the JSX.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Render-count spy in tests | Custom render tracker | TrackingWrapper + mirror-subscription (Phase 49 pattern) | Already proven, already in codebase |
| Canvas dpr management | Custom prop-receiver pattern | Internal useState owned by TavernScene | Re-mounts WebGL context on prop change |
| Buff effect dispatch table | `Record<BuffType, handler>` | `useReducer` with `BuffAction` union | Reducer handles ordering, DISPEL_ALL, and is pure-testable |
| `resolveTargets` as module-level closure | Embedding in socket handler | Pure function with explicit params | Enables unit testing without socket mocks |

---

## Common Pitfalls

### Pitfall 1: Changing the movement dep array incorrectly
**What goes wrong:** Removing `keys` from the dep array (it MUST stay) or keeping a per-frame dep (e.g., `jumpState` instead of only `jumpState.isJumping` in the jump animation's effect).
**Why it happens:** The dep array collapse looks mechanical but requires understanding which deps are "guards" vs "frame-level updates."
**How to avoid:** Keep `keys` and `currentLobby?.gamePhase` in Lobby's movement dep array. In PlayerController, keep `keys`, `viewport`, `characterSize`, `moveSpeed`, `emit`. Only remove `currentDirection` (promoted to ref).
**Warning signs:** Movement stops responding after refactor (keys dep removed), or position jumps after buff (wrong dep kept).

### Pitfall 2: Reducer changing effect ordering vs the if-cascade
**What goes wrong:** The if-cascade processes effects in insertion order (die before revive, etc.). `forEach` dispatch preserves order, but the reducer MUST be synchronous and produce intermediate states correctly. A `REVIVE` action after `DIE` on the same player in one `detectedEffects` array should produce the player alive.
**Why it happens:** Reducers accumulate state via `return { ...state, ... }`, which may not compose correctly if a player appears in both `die` targets and `revive` targets.
**How to avoid:** Test the reducer with multi-effect sequences: `['die', 'revive']` targeting the same player should leave them alive. `['enlarge', 'enlarge', 'enlarge']` should cap at stacks:3.

### Pitfall 3: LobbySettingsDialog dropping the host+phase guard
**What goes wrong:** Extracting the dialog removes `if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;` from `updateEstimationSettings`.
**Why it happens:** The guard is on the handler function, not the Dialog trigger. A developer might move only the JSX and forget the callback logic.
**How to avoid:** The guard is non-negotiable — include it in the extracted `onEstimationUpdate` prop implementation (which stays in Lobby) OR thread it as a check inside the extracted dialog's callback. Either way, tsc won't catch this — it's a runtime-behavior guard, not a type error.
**Warning signs:** Non-host players can call `updateEstimationSettings` via direct API invocation; existing host-only checkbox `disabled` prop is insufficient (client-side only).

### Pitfall 4: LobbyAvatar with isLocal flag
**What goes wrong:** Using `isLocal: boolean` and conditionally rendering `{isLocal && '👻'}` / `{!isLocal && isReady && '✓'}` in one component.
**Why it happens:** Looks like an obvious DRY refactor.
**How to avoid:** Use explicit props as enumerated above. Three real divergences exist; `isLocal` is an indirect encoding that hides the reasons.

### Pitfall 5: Extracting useLobbyMovement before buff refs are promoted
**What goes wrong:** The hook closes over `frozenPlayers`, `speedBuffs`, etc. as state values. Without MAINT-11's ref promotion, the hook dep array will be identical to the old interval dep array — still recreating on every buff change.
**Why it happens:** Hook extraction is tempting to do early (it's a clean win).
**How to avoid:** MAINT-11 commit must be in main before B6 begins. Verify by checking `frozenPlayersRef` is imported/used inside the hook.

### Pitfall 6: MAINT-14 deduping pre-51 Ctrl-shoot code
**What goes wrong:** Writing `handleShootAtTarget` based on the pre-51 coordinate math (raw `/ viewport.worldWidth * 100`) instead of the post-51 `worldToPercent` helper calls.
**Why it happens:** The objective documentation references "three verbatim Ctrl-shoot blocks" without specifying they were already updated in Phase 51.
**How to avoid:** Read the post-51 PlayerController (the current file). All three sites already use `worldToPercent` — `handleShootAtTarget` must call `worldToPercent`, not re-implement the math.

### Pitfall 7: Afterimage dual-trigger confusion
**What goes wrong:** Trying to unify the two `setAfterimages` calls in the movement callback (L565) and the jump animation (L621) into a shared helper.
**Why it happens:** They look similar (both append to afterimages array with similar structure).
**How to avoid:** The two triggers are intentionally distinct (DEBUNKED seam). Movement afterimages use `jumpHeightRef.current`; jump-arc afterimages use the rAF-local `height` variable. Leave both.

---

## Validation Architecture

nyquist_validation key is absent from `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + happy-dom |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run path/to/file.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAINT-11 | ONE interval created per movement session (no interval recreation on buff/jump changes) | unit (fake-timers) | `npx vitest run client/src/lib/hooks/useLobbyMovement.test.ts` | Wave 0 gap |
| MAINT-11 | PlayerController ONE interval per movement session | unit (fake-timers) | `npx vitest run client/src/components/game/PlayerController.test.ts` | Wave 0 gap |
| MAINT-12 | buffReducer handles DISPEL_ALL, multi-target spells, stacking limits | unit | `npx vitest run client/src/lib/reducers/buffReducer.test.ts` | Wave 0 gap |
| MAINT-12 | resolveTargets pure function returns caster-id fallback when no match | unit | `npx vitest run client/src/lib/utils/applySpellEffects.test.ts` | Wave 0 gap |
| MAINT-13 | TavernScene does NOT re-render when Lobby state changes | unit (TrackingWrapper) | `npx vitest run client/src/components/game/TavernScene.test.tsx` | Wave 0 gap |
| MAINT-13 | LobbySettingsDialog host+phase guard blocks non-host / non-lobby calls | unit | `npx vitest run client/src/components/game/LobbySettingsDialog.test.tsx` | Wave 0 gap |
| MAINT-14 | handleShootAtTarget emits correct event (projectile vs direct) | unit | `npx vitest run client/src/components/game/PlayerController.test.ts` | Wave 0 gap |
| PERF | dpr no longer appears in Lobby useState after extraction | static (grep in CI) | `grep 'const \[dpr' client/src/components/game/Lobby.tsx \| wc -l == 0` | inline |

### Sampling Rate

- **Per task commit:** `npx vitest run [test file for that plan's scope]`
- **Per wave merge:** `npm test` (full 963-test suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

All test files below must be created as part of Wave A/B before the implementation they test:

- [ ] `client/src/lib/reducers/buffReducer.test.ts` — covers MAINT-12 (pure reducer, no React)
- [ ] `client/src/lib/utils/applySpellEffects.test.ts` — covers resolveTargets pure function
- [ ] `client/src/lib/hooks/useLobbyMovement.test.ts` — covers MAINT-11 interval-once test (fake-timers)
- [ ] `client/src/components/game/PlayerController.test.ts` — covers MAINT-11 (PlayerController) + MAINT-14 (handleShootAtTarget/startCooldown)
- [ ] `client/src/components/game/TavernScene.test.tsx` — covers perf guardrail (render-count)
- [ ] `client/src/components/game/LobbySettingsDialog.test.tsx` — covers host+phase guard

Note: `buffReducer.ts` can be tested without React (pure function) — fastest tests to write first.

---

## Security Domain

No ASVS categories apply to this phase. All changes are:
- Pure refactors of client-side React components (no new network endpoints)
- No auth paths, no file access, no input validation surface changes
- The buff state machine is client-visual only; the server remains the authority on player state
- `emit()` call sites are preserved verbatim — no new event names emitted

---

## Environment Availability

Step 2.6: All dependencies are already available — this is a pure TypeScript/React client refactor. No external tools, services, or databases required beyond the existing dev setup (`npm run dev`, `npm test`, `npm run check`).

Current test baseline confirmed: **963 tests passing** (as of 2026-06-24 npm test run).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `currentDirection` ref promotion is the only dep-array fix needed in PlayerController's movement loop (no other per-frame dep exists) | §1 PlayerController | If another dep causes recreation, the fake-timers test will catch it; low risk |
| A2 | `flyHeight` (local player fly altitude, L230) should remain as a separate useState, NOT in the reducer | §2 Reducer | If it goes in the reducer, every 16ms movement frame dispatches an action — defeats the perf fix. Verify by confirming `flyHeight` is only mutated by the movement loop and the earthbind/dispel handlers |
| A3 | React 18 batching applies inside socket handlers in this codebase (socket handlers are async → batching is NOT automatic pre-18) | §2 DISPEL_ALL rationale | If batching IS applied, the 7-setter dispel still works today. DISPEL_ALL is still better for reducer purity, but the "race" framing is conservative |

**If this table has 3 entries:** All remaining claims were verified against the live codebase.

---

## Open Questions (RESOLVED)

1. **Did Phase 51 already implement `handleShootAtTarget`?**
   - What we know: Phase 51 Plan 03 added `worldToPercent`/`percentToWorld` helpers and converted 6 coordinate sites. The 51-03-SUMMARY.md lists only coordinate-site conversions.
   - What was clarified: grep confirms `handleShootAtTarget` does NOT exist in the post-51 PlayerController (grep returns 0 matches). MAINT-14 still needs to create it.
   - Recommendation: MAINT-14 creates `handleShootAtTarget` as a `useCallback` using the post-51 `worldToPercent` calls already in place.

2. **Which useState slots belong in the reducer vs stay separate?**
   - What we know: 13 slots total; 3 are continuous/derived (`flyHeight`, `invisibleFlicker`, `screenShake`).
   - Resolution: 10 slots go into the reducer; 3 (`flyHeight`, `invisibleFlicker`, `screenShake`) remain as separate `useState`. Reducer test coverage is for the 10 slots only.

3. **Can MAINT-11 and MAINT-12 run in parallel within Lobby.tsx?**
   - Resolution: NO — both modify Lobby.tsx heavily and their changes interleave (MAINT-11 promotes refs used by the movement loop; MAINT-12 replaces state that the movement loop reads). Run MAINT-11 first, then MAINT-12 can rewrite the if-cascade referencing the new reducer.

4. **Is TavernLighting a separate file from TavernScene, or co-located?**
   - Resolution: Co-locate `TavernLighting` as a local function inside `TavernScene.tsx`. It has zero props, no external dependencies, and will only ever be used inside the scene. A separate file for a zero-prop 53-line function adds navigation friction without benefit.

---

## Standard Stack

No new packages are required for Phase 52. All capabilities are covered by existing deps:

| Capability | Existing API |
|------------|-------------|
| useReducer | React 18 (already imported) |
| React.memo | React 18 (already in PlayerController) |
| useRef / useEffect | React 18 (already imported in Lobby.tsx) |
| Vitest fake-timers | `vi.useFakeTimers()` (already used in PlayerCharacter.test.tsx) |
| TrackingWrapper render-count | Pattern established in PlayerCharacter.test.tsx |

## Package Legitimacy Audit

No new packages to install. This section is N/A — Phase 52 is a pure refactor within existing dependencies.

---

## Sources

### Primary (HIGH confidence)
- Live codebase: `client/src/components/game/Lobby.tsx` — all line ranges verified by direct Read
- Live codebase: `client/src/components/game/PlayerController.tsx` — post-51 state verified by direct Read
- `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` — adversarial council findings (76 agents)
- `.planning/phases/51-event-contract-hardening-handler-boilerplate/51-03-SUMMARY.md` — Phase 51 coordinate helpers delta
- `.planning/phases/49-state-source-of-truth-consolidation/49-03-SUMMARY.md` — Phase 49 React.memo + useShallow delta
- `client/src/components/game/PlayerCharacter.test.tsx` — TrackingWrapper render-count pattern

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md:356–366` — MAINT-11/12/13/14 requirements text
- `.planning/phases/48-testability-seams/48-03-SUMMARY.md` — testability seam infrastructure (wireDomains, makeMockSocket)

---

## Metadata

**Confidence breakdown:**
- Movement dep array fix: HIGH — exact lines read, dep arrays confirmed in live code
- Reducer design (BuffState/BuffAction): HIGH — 13 useState slots enumerated from live code; council guidance confirmed
- Seam audit (VERIFIED vs DEBUNKED): HIGH — council debunk reasoning verified against actual dual-path code
- PlayerController Ctrl-shoot sites: HIGH — grep output + direct code read
- Phase 51 delta inventory: HIGH — confirmed from 51-03-SUMMARY.md + direct grep
- Perf guardrail approach: HIGH — canvas/dpr pattern confirmed in live code, TrackingWrapper pattern confirmed in test file

**Research date:** 2026-06-24
**Valid until:** 90 days (stable React/Vitest stack, no external dependencies)
