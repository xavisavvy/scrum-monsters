# Phase 42: v5.0 Pre-Ship Fixes & Polish — Pattern Map

**Mapped:** 2026-05-07
**Plans covered:** 42-01, 42-02a, 42-02b, 42-03
**Files analyzed:** 18 new/modified files across the four plans
**Analogs found:** 16 / 18 (2 files have no direct analog and rely on RESEARCH.md guidance)

---

## File Classification

### Plan 42-01 — Boss damage CLIENT FEEDBACK

| File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|------|---------|------|-----------|----------------|---------------|
| `client/src/components/game/PlayerHUD.tsx` | modify | component (HUD) | event-driven (store subscription) | `client/src/components/game/MasteryProgressBar.tsx` (gradient bar) + `client/src/components/ui/HealthBar.tsx` (HP-aware primitive) | exact (HealthBar already exists, just need to render in HUD) |
| `client/src/components/game/PlayerCharacter.tsx` | modify | component | event-driven (HP delta detection) | self (existing `attackAnimations` damage-flash hook at lines 88–116) | exact (extend in place) |
| `client/src/components/game/FloatingDamageManager.tsx` | new | component (overlay manager) | event-driven (queue consumer) | `client/src/components/game/FloatingXPManager.tsx` (full file, 85 lines) | exact mirror |
| `client/src/components/game/FloatingDamage.tsx` | new | component (animated leaf) | render-only | `client/src/components/game/FloatingXP.tsx` (full file, 58 lines) | exact mirror |
| `client/src/lib/stores/useGameState.tsx` | modify | store slice | event-driven (queue) | `client/src/lib/stores/useProgression.ts` `pendingXPGains` slice (mirror) | role-match |
| `client/src/lib/socket/eventHandlers.ts` | modify | event handler | request-response (socket) | self (lines 351–371 `combat:player_damaged` handler — extend, don't replace) | exact (extend in place) |
| `client/src/components/game/PlayerCharacter.test.tsx` | new (Wave 0) | test | unit | any existing `*.test.tsx` colocated with component (e.g., `LevelUpCelebration.test.tsx`) | role-match |
| `client/src/components/game/FloatingDamageManager.test.tsx` | new (Wave 0) | test | unit | (no `FloatingXPManager.test.tsx` exists — use generic vitest+happy-dom pattern) | partial |

### Plan 42-02a — Auto-advance Lobby UI toggle

| File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|------|---------|------|-----------|----------------|---------------|
| `shared/socket-schemas.ts` | modify | schema | validation | self (lines 125–128 `EstimationSettingsSchema`) | exact (extend in place) |
| `shared/gameEvents.ts` | modify | type def | n/a | self (existing `EstimationSettings` interface) | exact |
| `client/src/lib/utils/lobbySettingsStorage.ts` | modify | utility (persistence) | file-I/O (localStorage) | self (lines 97–110 defaults, 115–145 validation) | exact (extend in place) |
| `client/src/components/game/Lobby.tsx` | modify | component (host UI) | request-response | self (lines 1810–1822 timer-enabled checkbox; lines 1638–1648 `updateEstimationSettings`) | exact |
| `server/gameState.ts` | modify | service (auth state) | event-driven | self (lines 1534–1556 `checkDiscussionConsensus` countdown gate) | exact (1-line change) |
| `client/src/lib/utils/lobbySettingsStorage.test.ts` | new (Wave 0) | test | unit | (no current test) — vitest unit test pattern | partial |
| `server/gameState.test.ts` (new or extend) | new/mod (Wave 0) | test | unit | `server/domains/ProgressionManager.test.ts` (vitest describe/it/expect) | role-match |

### Plan 42-02b — `lobby_updated` full retirement (26 emit sites)

| File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|------|---------|------|-----------|----------------|---------------|
| `shared/gameEvents.ts` | modify | type def | n/a | self (lines 422–462 fine-grained `session:*`/`combat:*`/`estimation:*` events) | exact (mirror existing taxonomy for new `session:tickets_updated`, `session:settings_updated`, etc.) |
| `server/websocket.ts` | modify (heavy) | event handler | event-driven | self (existing `io.to(lobbyId).emit('session:phase_changed', …)` patterns elsewhere in file; existing emit at line 1277 line for the deletion target) | exact |
| `server/gameState.ts` | modify | service | event-driven | self (line 173, 1368 emit sites — same emit pattern) | exact |
| `client/src/pages/GamePage.tsx` | modify | page | event-driven | self (lines 188–219 deprecated handler — DELETE; lines 302–306 cleanup — DELETE) | exact (deletion + remount-logic migration) |
| `client/src/lib/socket/eventHandlers.ts` | modify | event handler | request-response | self (existing `socket.on('session:phase_changed', …)`, `socket.on('combat:player_damaged', …)` handlers) | exact (add new fine-grained handlers, fold in BattleScreen-remount logic from GamePage) |
| `CLAUDE.md` | modify | docs | n/a | n/a | docs change only (line 78 stale doc) |
| `specs/asyncapi.yaml` | modify | spec | n/a | self (line 715 `lobby_updated` — DELETE) | exact |
| `README.md` | modify | docs | n/a | n/a | docs change only (line 206) |

### Plan 42-03 — XP pacing tuning

| File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|------|---------|------|-----------|----------------|---------------|
| `shared/progressionTypes.ts` | modify | constants | n/a | self (lines 16–21 `XP_RATES`) | exact (1 number change) |
| `server/domains/ProgressionManager.ts` | modify | service (math) | n/a | self (lines 43–46 `DEFAULT_CURVE_CONFIG`; lines 52–57 `XP_RATE_VALUES` duplicate) | exact (2 number changes + optional dedup) |
| `server/domains/ProgressionManager.test.ts` | modify | test | unit | self (lines 15–80 table-driven `describe('XPCurve')` blocks) | exact (update expected thresholds for new exponent) |

---

## Pattern Assignments

### Plan 42-01

#### `client/src/components/game/PlayerCharacter.tsx` (modify — extend damage flash to listen for HP decrement)

**Analog:** self, `client/src/components/game/PlayerCharacter.tsx:55-116`

**Existing imports/state pattern to copy** (lines 55–59):
```typescript
const [isDamaged, setIsDamaged] = useState(false);
const timeoutRef = useRef<NodeJS.Timeout | null>(null);
const lastProcessedAttackId = useRef<string | null>(null);

const { currentLobby, attackAnimations } = useGameState();
```

**Existing `combatState` derivation already in place** (lines 65–68):
```typescript
const combatState = currentLobby && playerId ? currentLobby.playerCombatStates?.[playerId] : null;
const currentHp = combatState?.hp || 100;
const maxHp = combatState?.maxHp || 100;
```

**Existing flash-trigger pattern (lines 88–116) — KEEP UNCHANGED. ADD a sibling effect:**
```typescript
// NEW: hp-decrement detection (canonical damage signal)
const previousHpRef = useRef<number>(currentHp);
useEffect(() => {
  if (currentHp < previousHpRef.current && playerId) {
    setIsDamaged(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsDamaged(false);
      timeoutRef.current = null;
    }, 400); // match existing 400ms window (line 112)
  }
  previousHpRef.current = currentHp;
}, [currentHp, playerId]);
```

**Cleanup pattern already present** (lines 79–86) — no change needed.

---

#### `client/src/components/game/FloatingDamageManager.tsx` (new)

**Analog:** `client/src/components/game/FloatingXPManager.tsx` (full file, mirror verbatim)

**Imports pattern** (FloatingXPManager.tsx:1-3):
```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { FloatingDamage } from './FloatingDamage';
```

**Queue-consumer core pattern** (FloatingXPManager.tsx:23-85 — change types and source-positioning to player coords; remove SOURCE_POSITIONS dictionary, derive `position` from the event payload directly):
```typescript
interface ActiveDamage {
  id: string;
  amount: number;
  position: { x: number; y: number };
}

export function FloatingDamageManager() {
  const { pendingDamageEvents, clearPendingDamage } = useGameState();
  const [active, setActive] = useState<ActiveDamage[]>([]);
  const processedRef = useRef(new Set<string>());

  // Process new pending damage events — copy processedRef gate from FloatingXPManager:36-44
  useEffect(() => {
    pendingDamageEvents.forEach((evt) => {
      if (!processedRef.current.has(evt.id)) {
        processedRef.current.add(evt.id);
        setActive(prev => [...prev, { id: evt.id, amount: evt.amount, position: evt.position }]);
      }
    });
  }, [pendingDamageEvents]);

  // Cleanup on completion — copy from FloatingXPManager:66-70
  const handleComplete = useCallback((id: string) => {
    setActive(prev => prev.filter(g => g.id !== id));
    processedRef.current.delete(id);
    clearPendingDamage(id);
  }, [clearPendingDamage]);

  // Render container — copy from FloatingXPManager:72-84
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 55 }}>
      {active.map(d => (
        <FloatingDamage
          key={d.id}
          amount={d.amount}
          startPosition={d.position}
          onComplete={() => handleComplete(d.id)}
        />
      ))}
    </div>
  );
}
```

---

#### `client/src/components/game/FloatingDamage.tsx` (new)

**Analog:** `client/src/components/game/FloatingXP.tsx` (full file, mirror verbatim)

**Render pattern** (FloatingXP.tsx:23-58 — swap palette to RED, swap text from `+{amount} XP` to `-{amount}`):
```typescript
import { useEffect, useState } from 'react';

const DAMAGE_COLOR = '#E74C3C'; // matches FloatingXP boss_damage red

export interface FloatingDamageProps {
  amount: number;
  startPosition: { x: number; y: number };
  onComplete: () => void;
  duration?: number;
}

export function FloatingDamage({ amount, startPosition, onComplete, duration = 1000 }: FloatingDamageProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  if (!visible) return null;

  return (
    <div
      className="floating-damage"
      style={{
        position: 'absolute',
        left: startPosition.x,
        top: startPosition.y,
        color: DAMAGE_COLOR,
        fontSize: '1.4rem', // slightly larger than vote XP
        fontWeight: 'bold',
        fontFamily: '"Press Start 2P", monospace',
        textShadow: `0 0 6px ${DAMAGE_COLOR}80, 2px 2px 4px rgba(0,0,0,0.9)`,
        pointerEvents: 'none',
        zIndex: 60,
        animation: `floatUp ${duration}ms ease-out forwards`, // reuse existing CSS keyframes
        whiteSpace: 'nowrap',
      }}
    >
      -{amount}
    </div>
  );
}
```

Note: `floatUp` CSS keyframes are global — already used by FloatingXP. No new CSS needed.

---

#### `client/src/components/game/PlayerHUD.tsx` (modify — add HP bar)

**Analog:** `client/src/components/ui/HealthBar.tsx` (primitive, already exists, full file 78 lines) — render it inside the existing player-info block

**Existing PlayerHUD player-info block** (PlayerHUD.tsx:73-83):
```typescript
<div>
  <div className="font-bold">{currentPlayer.name}</div>
  <div className="text-sm text-gray-400">
    {AVATAR_CLASSES[currentPlayer.avatar]?.name} • {currentPlayer.team}
  </div>
  {currentLobby.gamePhase !== 'lobby' && currentLobby.gamePhase !== 'avatar_selection' && (
    <div className="mt-1">
      <XPBar />
    </div>
  )}
</div>
```

**Pattern to add (sibling to XPBar, gated on battle-relevant phases):**
```typescript
import { HealthBar } from '@/components/ui/HealthBar';
// ...
const combatState = currentPlayer.id ? currentLobby.playerCombatStates?.[currentPlayer.id] : null;
const hp = combatState?.hp ?? 100;
const maxHp = combatState?.maxHp ?? 100;

{currentLobby.gamePhase === 'battle' && combatState && (
  <div className="mt-1 w-48">
    <HealthBar value={hp} max={maxHp} size="sm" showValue label="Player HP" />
  </div>
)}
```

`HealthBar` already auto-pulses at ≤25% HP (line 47) — pattern reuse covers low-HP feedback.

---

#### `client/src/lib/stores/useGameState.tsx` (modify — add `pendingDamageEvents` slice)

**Analog:** `useProgression.pendingXPGains` (mirror) — but slot into existing `useGameState` per researcher recommendation (Open Question 3)

**Pattern to add** (mirror existing `attackAnimations` slice at useGameState.tsx:37, 55-56):
```typescript
interface PendingDamageEvent {
  id: string;
  playerId: string;
  amount: number;
  position: { x: number; y: number };
}

// in GameState interface:
pendingDamageEvents: PendingDamageEvent[];
addPendingDamage: (evt: PendingDamageEvent) => void;
clearPendingDamage: (id: string) => void;

// in store body (mirror addAttackAnimation/removeAttackAnimation pattern):
pendingDamageEvents: [],
addPendingDamage: (evt) => set((s) => ({ pendingDamageEvents: [...s.pendingDamageEvents, evt] })),
clearPendingDamage: (id) => set((s) => ({ pendingDamageEvents: s.pendingDamageEvents.filter(e => e.id !== id) })),
```

---

#### `client/src/lib/socket/eventHandlers.ts` (modify — push damage event into store)

**Analog:** self, lines 351–371 (existing `combat:player_damaged` handler — extend, don't replace)

**Existing pattern** (eventHandlers.ts:351-371):
```typescript
socket.on('combat:player_damaged', (data: any) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('combat:player_damaged', data, socket);

  if (processed) {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      const updatedLobby = {
        ...currentLobby,
        playerCombatStates: {
          ...currentLobby.playerCombatStates,
          [data.playerId]: {
            ...currentLobby.playerCombatStates[data.playerId],
            hp: data.newHp
          }
        }
      };
      setLobby(updatedLobby);
    }
  }
});
```

**Extension to add inside `if (processed)` block:**
```typescript
// NEW: push floating damage popup event
const { addPendingDamage } = useGameState.getState();
addPendingDamage({
  id: `${data.playerId}-${data.seq ?? Date.now()}`,
  playerId: data.playerId,
  amount: data.damage,
  // Position derived from player screen coords; planner picks helper.
  // For first cut: center-screen.
  position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
});
```

---

### Plan 42-02a — Auto-advance Lobby UI toggle

#### `shared/socket-schemas.ts` (modify — add `autoAdvance` field)

**Analog:** self, `shared/socket-schemas.ts:125-128`

**Existing schema:**
```typescript
export const EstimationSettingsSchema = z.object({
  scaleType: EstimationScaleTypeSchema,
  customTshirtMapping: z.record(z.string(), z.number()).optional(),
});
```

**Extension:**
```typescript
export const EstimationSettingsSchema = z.object({
  scaleType: EstimationScaleTypeSchema,
  customTshirtMapping: z.record(z.string(), z.number()).optional(),
  autoAdvance: z.boolean().optional().default(false), // NEW (default OFF per CONTEXT)
});
```

---

#### `client/src/lib/utils/lobbySettingsStorage.ts` (modify — extend defaults + validator)

**Analog:** self, lines 97-145

**Defaults pattern** (lines 97-110) — add `autoAdvance: false`:
```typescript
private static getDefaultSettings(): LobbySettingsPresets {
  return {
    timerSettings: { enabled: false, durationMinutes: 5 },
    jiraSettings: { baseUrl: undefined },
    estimationSettings: {
      scaleType: 'fibonacci',
      autoAdvance: false, // NEW
    }
  };
}
```

**Validator pattern** (lines 135-143) — add boolean coercion for new field, mirror the typeof guards used for `timerSettings.enabled`:
```typescript
estimationSettings: {
  scaleType: ['fibonacci', 'doubling', 'tshirt'].includes(settings.estimationSettings?.scaleType)
    ? settings.estimationSettings.scaleType
    : defaults.estimationSettings!.scaleType,
  customTshirtMapping: settings.estimationSettings?.customTshirtMapping &&
    typeof settings.estimationSettings.customTshirtMapping === 'object'
    ? settings.estimationSettings.customTshirtMapping
    : undefined,
  autoAdvance: typeof settings.estimationSettings?.autoAdvance === 'boolean' // NEW
    ? settings.estimationSettings.autoAdvance
    : false,
}
```

---

#### `client/src/components/game/Lobby.tsx` (modify — add toggle in Estimation Settings section)

**Analog:** self, lines 1810–1822 (timer-enabled checkbox pattern)

**Existing checkbox pattern to copy** (lines 1810-1821):
```typescript
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
    checked={currentLobby.timerSettings?.enabled || false}
    onChange={(e) => updateTimerSettings({
      enabled: e.target.checked,
      durationMinutes: currentLobby.timerSettings?.durationMinutes || 5
    })}
  />
  <span className="text-sm font-medium">Enable estimation timer</span>
</label>
```

**Pattern for new auto-advance toggle (place inside Estimation Scale section, around line 1933):**
```typescript
<label className="flex items-center gap-2 cursor-pointer mt-3">
  <input
    type="checkbox"
    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
    checked={currentLobby.estimationSettings?.autoAdvance ?? false}
    onChange={(e) => updateEstimationSettings({
      scaleType: currentLobby.estimationSettings?.scaleType ?? 'fibonacci',
      customTshirtMapping: currentLobby.estimationSettings?.customTshirtMapping,
      autoAdvance: e.target.checked,
    })}
    disabled={!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby'}
  />
  <span className="text-sm font-medium">Auto-advance to next ticket on consensus (5s countdown)</span>
</label>
```

`updateEstimationSettings` (lines 1638-1648) already does emit + LobbySettingsStorage persist + toast — no new wiring needed; the host-gate at line 1639 covers the disabled state.

---

#### `server/gameState.ts` (modify — gate consensus countdown on toggle)

**Analog:** self, lines 1534–1556

**Existing condition** (line 1534):
```typescript
if (teamsAgree && lobby.boss && lobby.currentTicket) {
  if (!lobby.consensusCountdown?.isActive) {
    // start countdown ...
  }
}
```

**Modified condition (single-line change):**
```typescript
if (teamsAgree && lobby.boss && lobby.currentTicket && lobby.estimationSettings?.autoAdvance) {
  if (!lobby.consensusCountdown?.isActive) {
    // start countdown ... unchanged
  }
}
```

3-min voting timeout at `gameState.ts:1322-1346` is UNTOUCHED (per CONTEXT — safety net stays).

---

### Plan 42-02b — `lobby_updated` retirement

#### `shared/gameEvents.ts` (modify — add new fine-grained events, remove `lobby_updated` declaration)

**Analog:** self, lines 422–462 (existing `session:*`/`combat:*`/`estimation:*` definitions)

**Existing taxonomy pattern (copy this signature shape for all new events):**
```typescript
'session:phase_changed': (data: { oldPhase: GamePhase; newPhase: GamePhase; seq: number; timestamp: number }) => void;
'session:host_changed': (data: { oldHostId: string; newHostId: string; newHostName: string; seq: number; timestamp: number }) => void;
```

**New events to add (researcher's consolidated list — Section: lobby_updated audit, item "Required new events"):**
```typescript
'session:tickets_updated': (data: { tickets: JiraTicket[]; seq: number; timestamp: number }) => void;
'session:player_ready_changed': (data: { playerId: string; isReady: boolean; seq: number; timestamp: number }) => void;
'session:lobby_renamed': (data: { name: string; seq: number; timestamp: number }) => void;
'session:settings_updated': (data: { timerSettings?: TimerSettings; jiraSettings?: JiraSettings; estimationSettings?: EstimationSettings; seq: number; timestamp: number }) => void;
'session:game_reset': (data: { lobby: Lobby; seq: number; timestamp: number }) => void; // OR reuse system:full_state
'session:ticket_advanced': (data: { currentTicket: JiraTicket; seq: number; timestamp: number }) => void; // for mid-battle ticket changes (Pitfall 1)
```

**Removal:** delete `'lobby_updated'` line at `shared/gameEvents.ts:322` from `ServerToClientEvents`. TypeScript compiler then catches every dangling emit (Open Question 4 — verified-by-tsc strategy).

---

#### `server/websocket.ts` (modify — migrate 24+ emit sites)

**Analog:** self — every existing `io.to(lobbyId).emit('session:phase_changed', …)` invocation in the file already shows the pattern. Use the migration table in RESEARCH.md (lines 250–276) to map each of the 26 sites to its replacement.

**Existing emit pattern to copy** (websocket.ts:1277, current `lobby_updated` site):
```typescript
io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
```

**Replacement pattern (most common case — phase transitions):**
```typescript
io.to(lobbyId).emit('session:phase_changed', {
  oldPhase: previousPhase,
  newPhase: updatedLobby.gamePhase,
  seq: getNextSeq(lobbyId), // existing helper
  timestamp: Date.now(),
});
```

**Settings replacement pattern** (for sites at lines 1453, 1464, 1475 — timer/jira/estimation):
```typescript
io.to(lobbyId).emit('session:settings_updated', {
  estimationSettings: updatedLobby.estimationSettings, // include only changed slice
  seq: getNextSeq(lobbyId),
  timestamp: Date.now(),
});
```

**Tickets replacement pattern** (sites 611, 629):
```typescript
io.to(lobbyId).emit('session:tickets_updated', {
  tickets: updatedLobby.tickets,
  seq: getNextSeq(lobbyId),
  timestamp: Date.now(),
});
```

Researcher's full 26-site mapping table (RESEARCH.md lines 250–276) is authoritative. Each site is independent — planner can split into tasks.

---

#### `client/src/pages/GamePage.tsx` (modify — DELETE deprecated handler, migrate remount logic)

**Analog:** self, lines 188-219 (handler) + 306 (cleanup)

**Existing remount logic that MUST migrate (lines 201-216):**
```typescript
const lastPhase = lastGamePhaseRef.current;
const cl = currentLobbyRef.current;
const shouldRemount = (
  (lastPhase && lastPhase !== 'battle' && lobby.gamePhase === 'battle') ||
  (lastPhase === 'battle' && lobby.gamePhase === 'battle' &&
   JSON.stringify(cl?.currentTicket) !== JSON.stringify(lobby.currentTicket))
);
if (shouldRemount) {
  setIsBattleUnmounting(true);
  setTimeout(() => {
    setBattleRemountKey(prev => prev + 1);
    setIsBattleUnmounting(false);
  }, 100);
}
```

**Migration target:** split this between two new handlers in `eventHandlers.ts`:
1. `session:phase_changed` (newPhase === 'battle' branch)
2. `session:ticket_advanced` (mid-battle ticket change branch, NEW event per Pitfall 1)

**Deletions:**
- Lines 188-219 (full handler)
- Line 306 (`socket.off('lobby_updated')`)

---

#### `client/src/lib/socket/eventHandlers.ts` (modify — add fine-grained handlers)

**Analog:** self — existing `socket.on('combat:player_damaged', …)` at lines 351-371 is the canonical handler shape (handleEvent gate, scoped setLobby update).

**Pattern to copy verbatim per new event:**
```typescript
socket.on('session:settings_updated', (data: any) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('session:settings_updated', data, socket);
  if (processed) {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      setLobby({
        ...currentLobby,
        ...(data.timerSettings && { timerSettings: data.timerSettings }),
        ...(data.jiraSettings && { jiraSettings: data.jiraSettings }),
        ...(data.estimationSettings && { estimationSettings: data.estimationSettings }),
      });
    }
  }
});
```

Same shape for `session:tickets_updated`, `session:player_ready_changed`, `session:lobby_renamed`, `session:ticket_advanced`.

---

### Plan 42-03 — XP pacing

#### `shared/progressionTypes.ts` (modify)

**Analog:** self, lines 16-21

**Change:**
```typescript
export const XP_RATES = {
  vote: 10,
  boss_damage: 1,        // CHANGED 2 → 1
  consensus: 50,
  revival: 30,
} as const;
```

---

#### `server/domains/ProgressionManager.ts` (modify)

**Analog:** self, lines 43-46 (curve config) + 52-57 (duplicated rate values)

**Curve change:**
```typescript
const DEFAULT_CURVE_CONFIG: XPCurveConfig = {
  baseXP: 100,
  exponent: 1.8, // CHANGED 1.5 → 1.8
};
```

**Rate-value mirror change (must stay in sync with shared):**
```typescript
const XP_RATE_VALUES: typeof XP_RATES = {
  vote: 10,
  boss_damage: 1, // CHANGED 2 → 1 (matches shared)
  consensus: 50,
  revival: 30,
};
// CONSIDER (researcher's optional refactor): replace this duplicate with `import { XP_RATES } from '@shared/progressionTypes'`
```

---

#### `server/domains/ProgressionManager.test.ts` (modify — table-driven curve assertions)

**Analog:** self, lines 15-80 (existing table-driven `describe('XPCurve')` block — exact pattern to reuse)

**Existing pattern:**
```typescript
describe('XPCurve', () => {
  let curve: XPCurve;

  beforeEach(() => {
    curve = new XPCurve({ baseXP: 100, exponent: 1.5 });
  });

  describe('getLevelThreshold', () => {
    it('calculates correct threshold for level 2', () => {
      expect(curve.getLevelThreshold(2)).toBe(100);
    });
    it('calculates correct threshold for level 3', () => {
      // Level 3 threshold is 100 * 2^1.5 = 282.84..., floored to 282
      expect(curve.getLevelThreshold(3)).toBe(282);
    });
    // ...
  });
});
```

**Update for new exponent — recompute expected values for `exponent: 1.8`:**
- L2: `floor(100 * 1^1.8)` = 100 (unchanged)
- L3: `floor(100 * 2^1.8)` = 348 (was 282)
- L10: `floor(100 * 9^1.8)` = ~5099 (was ~2700)

The `beforeEach` curve constructor and the `it()` table format stay identical; only the expected numbers change. Add a new `describe` block for boss_damage rate=1 alongside the existing rate-multiplier tests.

---

## Shared Patterns

### Shared 1 — fine-grained socket-event emit (server side)

**Source:** existing `io.to(lobbyId).emit('session:phase_changed', { …, seq, timestamp })` invocations across `server/websocket.ts` and `server/gameState.ts`.

**Apply to:** every `lobby_updated` removal site in 42-02b.

**Required envelope fields (verified from `shared/gameEvents.ts:422-462`):** every fine-grained event takes `seq: number` and `timestamp: number`. Missing either breaks `useEventSync` ordering at `client/src/lib/stores/useEventSync.ts:34-63`.

```typescript
io.to(lobbyId).emit('session:phase_changed', {
  oldPhase, newPhase,
  seq: getNextSeq(lobbyId),
  timestamp: Date.now(),
});
```

### Shared 2 — fine-grained socket-event handler (client side)

**Source:** `client/src/lib/socket/eventHandlers.ts:351-371` (canonical shape, present for every existing fine-grained event).

**Apply to:** every new `session:*` handler added in 42-02b, plus the floating-damage extension in 42-01.

```typescript
socket.on('<event_name>', (data: any) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('<event_name>', data, socket);
  if (processed) {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      setLobby({ ...currentLobby, /* scoped update */ });
    }
  }
});
```

### Shared 3 — Lobby settings round-trip (schema + storage + UI)

**Source:** existing 3-tier pattern verified by researcher:
- Schema: `shared/socket-schemas.ts:125-128`
- Storage defaults: `client/src/lib/utils/lobbySettingsStorage.ts:97-110, 115-145`
- UI emit: `client/src/components/game/Lobby.tsx:1638-1648`

**Apply to:** the new `autoAdvance` field in 42-02a. No new wiring — every layer already exists; just extend each.

### Shared 4 — host-gate (server + client)

**Source:** `client/src/components/game/Lobby.tsx:1639` (`if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;`) and existing server-side `playerId === lobby.hostId` checks at `server/websocket.ts:1242, 1256, 1383`.

**Apply to:** auto-advance toggle UI (42-02a) — disabled state and server-side guard for `update_estimation_settings` already enforce host-only mutation. No new code needed beyond reusing existing `disabled={!currentPlayer?.isHost || …}` prop pattern.

### Shared 5 — Vitest table-driven balance test

**Source:** `server/domains/ProgressionManager.test.ts:15-80`.

**Apply to:** XP curve assertions in 42-03 (update expected values, do not refactor structure).

```typescript
describe('XPCurve', () => {
  beforeEach(() => { curve = new XPCurve({ baseXP: 100, exponent: 1.8 }); });
  describe('getLevelThreshold', () => {
    it('returns NN for level X', () => { expect(curve.getLevelThreshold(X)).toBe(NN); });
  });
});
```

### Shared 6 — `combat:player_damaged` payload contract

**Source:** RESEARCH.md Pitfall 2 — server EventBus emits `playerHealth`; wire payload uses `newHp`. Schema at `shared/gameEvents.ts:448`. Client reads `data.newHp` (eventHandlers.ts:364).

**Apply to:** all 42-01 tests. Server-side asserts use `playerHealth`, client-side asserts use `newHp`. Don't mix.

---

## No Analog Found

| File | Plan | Role | Reason | Fallback |
|------|------|------|--------|----------|
| `client/src/components/game/FloatingDamageManager.test.tsx` | 42-01 | unit test | No `FloatingXPManager.test.tsx` exists in tree | Use generic vitest+happy-dom render-and-assert pattern; assert that adding a `pendingDamageEvents` entry renders a `FloatingDamage` child. |
| `client/src/lib/utils/lobbySettingsStorage.test.ts` | 42-02a | unit test | No existing test for storage utility | Mock `localStorage` (already supported by happy-dom); table-test default + roundtrip + invalid-input → default. Mirror `ProgressionManager.test.ts` style. |

---

## Metadata

**Analog search scope:** `client/src/components/game/`, `client/src/components/ui/`, `client/src/lib/`, `client/src/pages/`, `server/`, `server/domains/`, `shared/`.
**Files scanned:** 14 read in full or targeted offset.
**Pattern extraction date:** 2026-05-07
