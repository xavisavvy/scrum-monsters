# Phase 40: Tutorial Content & JRPG Narrator - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 11 (3 new, 8 modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `client/src/lib/stores/useTutorial.tsx` | mod | store + content data | event-driven | (self — extending existing) | exact |
| `client/src/components/tutorial/HintBubble.tsx` | mod | component (presentational) | request-response (props in / events out) | (self — extending existing) | exact |
| `client/src/components/tutorial/TutorialOverlay.tsx` | mod | component (orchestrator) | event-driven (subscribes to stores) | (self — extending existing) | exact |
| `client/src/components/tutorial/HelpMenu.tsx` | mod | component (popover) | request-response | (self — verifying existing) | exact |
| `client/src/components/tutorial/useTypewriter.ts` | NEW | hook (UI effect) | transform (text → animated text) | `client/src/lib/hooks/usePhaseInterstitial.ts` | role-match (timer hook + reduced-motion) |
| `client/src/lib/hooks/useFirstEncounter.ts` | NEW | hook (store observer) | event-driven | `client/src/lib/hooks/useHintTarget.ts` | role-match (effect + ref-latch hook) |
| `client/src/components/game/phases/BattlePhase.tsx` | mod | component (phase host) | event-driven | (self — adding hook calls) | exact |
| `client/src/components/game/phases/RevealPhase.tsx` | mod | component (phase host) | event-driven | `BattlePhase.tsx` (sibling phase) | role-match |
| `client/src/components/game/{Lobby,AvatarSelection,LobbyReadyButton,ScoreSubmission,BossTelegraph,ComboNotification,combat/ItemBar}.tsx` | mod | component | n/a (data attribute add) | `BossDisplay.tsx:385` (Phase 39 attribute placement) | exact |
| `client/src/components/tutorial/useTypewriter.test.ts` | NEW | unit test | n/a | `client/src/lib/stores/useTutorial.test.ts` | role-match |
| `client/src/lib/hooks/useFirstEncounter.test.ts` | NEW | unit test | n/a | `client/src/lib/stores/useTutorial.test.ts` | role-match |
| `client/src/components/tutorial/HintBubble.test.tsx` | NEW | component test | n/a | `client/src/lib/stores/useTutorial.test.ts` | partial (only existing tutorial-area test) |
| `client/src/components/tutorial/TutorialOverlay.test.tsx` | NEW | component test | n/a | `client/src/lib/stores/useTutorial.test.ts` | partial |

## Pattern Assignments

### `client/src/lib/stores/useTutorial.tsx` — extend with NarratorId, NARRATORS, TutorialStep.narrator, TUTORIAL_STEPS

**Analog:** self (Phase 39 store). Content/type additions colocated.

**Imports pattern** (lines 1-2 — keep as-is):
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
```

**Store skeleton to preserve** (lines 25-98): the entire `create<TutorialState>()(persist(...))` block stays untouched. Add new exports BELOW the closing of the `useTutorial` create call.

**Pattern to add** (after line 98 — new exports colocated with store):
```typescript
// 1) NarratorId + NARRATORS typed const map (RESEARCH Pattern 1)
export type NarratorId = 'guild_master' | 'battle_advisor' | 'sage';

export interface NarratorConfig {
  displayName: string;
  accentBorderClass: string; // Tailwind class
  accentTextClass: string;
}

export const NARRATORS: Record<NarratorId, NarratorConfig> = {
  guild_master: {
    displayName: 'Guild Master',
    accentBorderClass: 'border-amber-500/60',
    accentTextClass: 'text-amber-400',
  },
  battle_advisor: {
    displayName: 'Battle Advisor',
    accentBorderClass: 'border-red-500/60',
    accentTextClass: 'text-red-400',
  },
  sage: {
    displayName: 'Sage',
    accentBorderClass: 'border-purple-500/60',
    accentTextClass: 'text-purple-400',
  },
};

// 2) TutorialStep type (move/re-export from TutorialOverlay; add `narrator`)
export interface TutorialStep {
  targetId: string;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  narrator: NarratorId; // NEW required field
}

// 3) TUTORIAL_STEPS — populate with lobby/avatar/battle walkthroughs + 4 hints
export const TUTORIAL_STEPS: Record<string, TutorialStep[]> = {
  'walkthrough:lobby': [ /* 3 steps, narrator: 'guild_master' */ ],
  'walkthrough:avatar_selection': [ /* 2 steps, narrator: 'guild_master' */ ],
  'walkthrough:battle': [ /* 5 steps, narrator: 'battle_advisor' */ ],
  'hint:first-combo': [ /* battle_advisor */ ],
  'hint:first-item': [ /* battle_advisor */ ],
  'hint:first-telegraph': [ /* battle_advisor */ ],
  'hint:first-vote-reveal': [ /* sage */ ],
};
```

**Persistence/migrate pattern (do NOT change)** — note version=1 already in place at lines 79-85; if `partialize` shape changes (it does NOT in this phase) bump to version 2 and add a migrate branch. Phase 40 only adds runtime exports, no new persisted keys.

**Note re: `TutorialOverlay.tsx:7-14`** — currently exports `TutorialStep` and declares a placeholder `TUTORIAL_STEPS = {}`. Remove these from `TutorialOverlay.tsx` and import from `useTutorial`. Update `useTutorial.test.ts` (no change needed; new exports are not part of `TutorialState`).

---

### `client/src/components/tutorial/HintBubble.tsx` — add narrator header + typewriter + click-to-reveal

**Analog:** self. Layout to preserve: lines 65-105 (positioning + AnimatePresence shell stay).

**Imports pattern to extend** (line 1):
```typescript
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { NARRATORS, type NarratorId } from '@/lib/stores/useTutorial';
import { useTypewriter } from './useTypewriter';
```

**Props additions** (lines 3-17 — extend interface):
```typescript
interface HintBubbleProps {
  // ... existing
  narrator?: NarratorId; // optional for back-compat; required from Phase 40 callers
}
```

**Render pattern to replace** (lines 76-101 — currently hardcoded `border-amber-500/60` + plain `{text}`):
```tsx
const config = narrator ? NARRATORS[narrator] : null;
const { displayed, isComplete, revealAll } = useTypewriter(text, 30);

const handleBodyClick = () => {
  if (!isComplete) revealAll();
  else onNext?.();
};

// inner card:
<div className={`bg-gray-900/95 border-2 ${config?.accentBorderClass ?? 'border-amber-500/60'} rounded-lg p-4 shadow-lg shadow-amber-500/10`}>
  {config && (
    <div className={`text-xs font-bold mb-1 ${config.accentTextClass}`}>
      {config.displayName}
    </div>
  )}
  {stepLabel && <div className="text-xs text-amber-400/70 mb-1">{stepLabel}</div>}
  <div className="text-sm text-gray-100 cursor-pointer" onClick={handleBodyClick}>
    {displayed}
  </div>
  {(onDismiss || onNext) && (
    <div className="flex gap-2 mt-3 justify-end" onClick={(e) => e.stopPropagation()}>
      {/* Skip / Next buttons unchanged from lines 83-99 */}
    </div>
  )}
</div>
```

**Critical (Pitfall 1):** `stopPropagation` on the button row prevents the body's click-to-reveal from also triggering Next. **Critical (Pitfall 3):** do NOT add `tabIndex` / `autoFocus` to the body div — preserves Phase 39 battle focus guard.

---

### `client/src/components/tutorial/useTypewriter.ts` (NEW)

**Analog:** `client/src/lib/hooks/usePhaseInterstitial.ts` (lines 1-46) — closest hook with timer + `useReducedMotion` + cleanup.

**Imports pattern** (mirror analog line 1-3):
```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
```

**Cleanup ref pattern** (mirror analog lines 33-41):
```typescript
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

const cleanup = () => {
  if (timerRef.current !== null) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
};
```

**Reduced-motion short-circuit** (mirror analog line 50-51):
```typescript
const prefersReducedMotion = useReducedMotion();
if (prefersReducedMotion) {
  setDisplayed(text);
  return;
}
```

**Full implementation** — see RESEARCH.md Pattern 2 (lines 168-216). Use `setInterval` not chained `setTimeout` (Anti-Pattern call-out at RESEARCH line 277). Effect deps: `[text, charsPerSecond, prefersReducedMotion]`.

---

### `client/src/components/tutorial/TutorialOverlay.tsx` — auto-start + auto-skip-on-missing-target + pass narrator to HintBubble

**Analog:** self.

**Imports to add** (line 1-5):
```typescript
import { useEffect, useRef } from 'react';
import { useTutorial, TUTORIAL_STEPS, type TutorialStep } from '@/lib/stores/useTutorial';
import { useGameState } from '@/lib/stores/useGameState';
import { useHintTarget } from '@/lib/hooks/useHintTarget';
import { SpotlightMask } from './SpotlightMask';
import { HintBubble } from './HintBubble';
```

**Remove** existing lines 7-14 (`export interface TutorialStep` and `TUTORIAL_STEPS = {}` placeholder) — moved to `useTutorial.tsx`.

**Auto-start pattern to add** (alongside existing locateTarget effect at lines 34-47 — RESEARCH Pattern 4):
```typescript
const currentPhase = useGameState(s => s.currentLobby?.gamePhase);
const completedTutorials = useTutorial(s => s.completedTutorials);
const startTutorial = useTutorial(s => s.startTutorial);
const lastStartedPhaseRef = useRef<string | null>(null);

useEffect(() => {
  if (!currentPhase) return;
  if (!isHydrated) return;
  if (activeTutorial) return; // priority: in-flight tutorial wins (Pitfall 6)
  const tutorialId = `walkthrough:${currentPhase}`;
  if (!TUTORIAL_STEPS[tutorialId]) return;
  if (completedTutorials[tutorialId]) return;
  if (lastStartedPhaseRef.current === currentPhase) return;
  lastStartedPhaseRef.current = currentPhase;
  startTutorial(tutorialId);
}, [currentPhase, isHydrated, activeTutorial, completedTutorials, startTutorial]);
```

**Auto-skip-if-target-missing pattern** (extend existing locateTarget effect lines 34-47 — Pitfall 4):
```typescript
useEffect(() => {
  if (!currentStep) return;
  timeoutRef.current = setTimeout(() => {
    const rect = locateTarget(currentStep.targetId);
    if (rect === null && activeTutorial?.startsWith('hint:')) {
      // Silent auto-skip for hints only; walkthroughs retain existing behavior
      completeTutorial(activeTutorial);
    }
  }, 350);
  return () => { /* unchanged cleanup at lines 41-46 */ };
}, [activeTutorial, activeStep, currentStep, locateTarget, completeTutorial]);
```

**Pass narrator to HintBubble** (line 80-87 — extend):
```tsx
<HintBubble
  targetRect={targetRect}
  text={currentStep?.text ?? ''}
  position={currentStep?.position}
  narrator={currentStep?.narrator}   // NEW
  onNext={handleNext}
  onDismiss={steps.length > 1 ? handleDismiss : undefined}
  stepLabel={stepLabel}
/>
```

---

### `client/src/components/tutorial/HelpMenu.tsx` — verify Replay = current phase

**Analog:** self.

**Current "Replay Tutorial" handler** (lines 28-36):
```typescript
onClick={() => {
  startTutorial('battle-basics');  // hardcoded; replace
  toast('Tutorial started!', { id: 'tutorial-restart' });
}}
```

**Pattern to replace with** (read currentPhase from useGameState, mirroring TutorialOverlay):
```typescript
const currentPhase = useGameState(s => s.currentLobby?.gamePhase);

onClick={() => {
  if (!currentPhase) return;
  const id = `walkthrough:${currentPhase}`;
  if (!TUTORIAL_STEPS[id]) {
    toast('No tutorial available for this phase', { id: 'tutorial-restart' });
    return;
  }
  resetTutorial(id);   // clear completion flag first so auto-start re-fires
  startTutorial(id);
  toast('Tutorial started!', { id: 'tutorial-restart' });
}}
```

Add `resetTutorial` to the destructured store actions on line 7. Toast pattern (`toast('...', { id })`) preserved from existing lines 30, 39.

---

### `client/src/lib/hooks/useFirstEncounter.ts` (NEW)

**Analog:** `client/src/lib/hooks/useHintTarget.ts` lines 1, 16-21 (effect + ref-latch hook in same dir).

**Imports pattern** (mirror analog line 1):
```typescript
import { useEffect, useRef } from 'react';
import { useTutorial } from '@/lib/stores/useTutorial';
```

**Ref-latch + effect pattern** (mirror analog lines 16-21 for ref usage):
```typescript
const firedRef = useRef(false);

useEffect(() => {
  if (firedRef.current) return;
  if (completedHints[hintId]) return;
  if (!condition) return;
  firedRef.current = true;
  dismissHint(hintId);   // Pitfall 5: persist completion BEFORE startTutorial
  startTutorial(`hint:${hintId}`);
}, [hintId, condition, completedHints, startTutorial, dismissHint]);
```

**Selector subscriptions** (mirror existing pattern at `BattlePhase.tsx:33-37`):
```typescript
const completedHints = useTutorial(s => s.completedHints);
const startTutorial = useTutorial(s => s.startTutorial);
const dismissHint = useTutorial(s => s.dismissHint);
```

Full body — see RESEARCH.md Pattern 3 (lines 222-247).

---

### `client/src/components/game/phases/BattlePhase.tsx` — mount three useFirstEncounter calls

**Analog:** self. Already imports `useGameState` (line 14), `useComboState` (line 17), `useItemStore` (line 20).

**Add at the top of the component** (after existing hook calls at lines 33-37):
```typescript
import { useFirstEncounter } from '@/lib/hooks/useFirstEncounter';
import { useComboState } from '@/lib/stores/useComboState';
import { useItemStore } from '@/lib/stores/useItemStore';

// inside component, after useItemSync():
const activeCombo = useComboState(s => s.activeCombo);
const inventorySize = useItemStore(s => s.inventory.size);
const telegraph = useGameState(s => s.telegraph);

useFirstEncounter('first-combo',     activeCombo !== null);
useFirstEncounter('first-item',      inventorySize >= 1);
useFirstEncounter('first-telegraph', telegraph !== null);
```

**Critical:** field paths verified by RESEARCH §"Combat Event Hooks" — `useComboState.activeCombo`, `useItemStore.inventory` (Map), `useGameState.telegraph`. Selector form prevents unnecessary re-renders.

---

### `client/src/components/game/phases/RevealPhase.tsx` — mount one useFirstEncounter + add reveal-summary target

**Analog:** `BattlePhase.tsx` (sibling phase, hook-mounting pattern).

**Add data-hint-target** (line 18 — RetroCard wrapper):
```tsx
<div data-hint-target="reveal-summary">
  <RetroCard title="Revealing Estimates...">
    {/* ... */}
  </RetroCard>
</div>
```
(Or pass via prop if `RetroCard` supports passthrough — check its API; otherwise wrap.)

**Mount the hint hook** (after function signature line 11):
```typescript
import { useFirstEncounter } from '@/lib/hooks/useFirstEncounter';
import { useGameState } from '@/lib/stores/useGameState';

// inside component:
const phase = useGameState(s => s.currentLobby?.gamePhase);
useFirstEncounter('first-vote-reveal', phase === 'reveal');
```

---

### data-hint-target attribute additions (7 files)

**Analog pattern source:** `BossDisplay.tsx:385` (Phase 39 SUMMARY 39-02 deviation #3 — verified placement on the actually-rendered branch).

**Excerpt of canonical placement** (Phase 39 anti-pattern: place attribute on the rendered branch, not the inert one):
```tsx
<div data-hint-target="boss-health" className="...">
  <HealthBar .../>
</div>
```

**Files + lines to add (from RESEARCH §"Targets to add for Phase 40"):**

| File | Approx line | Attribute | Notes |
|------|-------------|-----------|-------|
| `client/src/components/game/Lobby.tsx` | ~1750-1775 | `lobby-welcome` | Title/code block |
| `client/src/components/game/Lobby.tsx` | ~1779 | `lobby-invite` | Copy Invite Link button |
| `client/src/components/game/Lobby.tsx` | ~2138 | `lobby-start` | Begin Battle button (host only) |
| `client/src/components/game/LobbyReadyButton.tsx` | ~14 | `lobby-ready` | Non-host alt step 3 |
| `client/src/components/game/AvatarSelection.tsx` | ~69 | `avatar-grid` | `.avatar-selection-grid` div |
| `client/src/components/game/AvatarSelection.tsx` | ~99-102 | `avatar-confirm` | Confirm Avatar button |
| `client/src/components/game/ScoreSubmission.tsx` | (below ~144) | `vote-submit` | Submit/confirm action button |
| `client/src/components/game/BossTelegraph.tsx` | ~42 | `boss-telegraph` | Outer fixed div |
| `client/src/components/game/ComboNotification.tsx` | root div | `combo-notification` | (Open Question 2: verify display duration ≥ 3s) |
| `client/src/components/game/combat/ItemBar.tsx` | root div | `item-bar` | Mounts only for non-spectators (BattlePhase.tsx:92) |

Apply the attribute identically to existing precedents (`PlayerHUD.tsx:41-44`, `AbilityBar.tsx:46`).

---

### Test files (4 NEW)

**Analog:** `client/src/lib/stores/useTutorial.test.ts` (lines 1-122) — only existing tutorial test. Establishes Vitest + happy-dom + `renderHook`/`act` style.

**Setup pattern** (mirror analog lines 1-17):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  localStorage.clear();
  useTutorial.setState({ /* reset shape mirroring lines 8-16 */ });
});
```

**Per-test patterns:**

| Test file | Mirror | Specifics |
|-----------|--------|-----------|
| `useTypewriter.test.ts` | analog lines 19-25 (initial state), 37-50 (action sequence) | Add `vi.useFakeTimers()` + `vi.advanceTimersByTime(1000/30)` per char tick. Mock `useReducedMotion` via module mock. Assert: `displayed` grows; `isComplete` flips at end; `revealAll()` jumps to full text; cleanup on unmount cancels interval. |
| `useFirstEncounter.test.ts` | analog lines 27-50 | Seed `useTutorial.setState({ completedHints: { 'foo': true }})` to assert latch; rerender with `condition=true` and assert `dismissHint`+`startTutorial` called once across remounts. |
| `HintBubble.test.tsx` | analog (only structural) | Use `render` from `@testing-library/react`; mock `useReducedMotion` to return true (skip typewriter); assert narrator name + accent class present; click body advances when `isComplete`. |
| `TutorialOverlay.test.tsx` | analog | Spy on `useTutorial.getState().completeTutorial`; mock `useHintTarget` to return `{ targetRect: null, locateTarget: vi.fn(()=>null) }`; advance fake timer past 350ms; assert `completeTutorial` called when `activeTutorial='hint:foo'` AND NOT called when `activeTutorial='walkthrough:foo'`. |

**TUTORIAL_STEPS data integrity** — extend `useTutorial.test.ts` (analog lines 102-121 partialize test as template):
```typescript
it('TUTORIAL_STEPS integrity: counts and narrator validity', () => {
  expect(TUTORIAL_STEPS['walkthrough:lobby']).toHaveLength(3);
  expect(TUTORIAL_STEPS['walkthrough:avatar_selection']).toHaveLength(2);
  expect(TUTORIAL_STEPS['walkthrough:battle']).toHaveLength(5);
  for (const steps of Object.values(TUTORIAL_STEPS)) {
    for (const step of steps) {
      expect(NARRATORS[step.narrator]).toBeDefined();
    }
  }
});
```

---

## Shared Patterns

### Reduced-motion handling
**Source:** `client/src/lib/hooks/usePhaseInterstitial.ts:34, 50-51`; `HintBubble.tsx:62-63`
**Apply to:** `useTypewriter` (skip animation entirely on `prefersReducedMotion`)
```typescript
const prefersReducedMotion = useReducedMotion();
if (prefersReducedMotion) { setDisplayed(text); return; }
```

### Timer cleanup ref pattern
**Source:** `usePhaseInterstitial.ts:33, 36-41`; `TutorialOverlay.tsx:27, 41-46`
**Apply to:** `useTypewriter` (interval ref + cleanup function called from effect cleanup AND from `revealAll`)
```typescript
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
const cleanup = () => {
  if (timerRef.current !== null) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
};
```

### Zustand selector subscription (avoid full-store re-renders)
**Source:** `useTutorial.tsx` test seeds; existing pattern at `TeamPerformanceTracker.tsx:63` (per RESEARCH); `BattlePhase.tsx:33`
**Apply to:** `useFirstEncounter`, `TutorialOverlay` auto-start effect, `RevealPhase` phase observer
```typescript
const x = useTutorial(s => s.completedHints);          // selector form
const y = useGameState(s => s.currentLobby?.gamePhase);
```
**Anti-pattern:** `const { completedHints, startTutorial, dismissHint } = useTutorial();` — re-renders on any store change. Use only in components that legitimately consume most of the store (HelpMenu is OK; hooks are NOT).

### Persist-completion-before-firing latch
**Source:** RESEARCH Pitfall 5
**Apply to:** `useFirstEncounter` (call `dismissHint` BEFORE `startTutorial` to survive HMR/remount)

### Tailwind accent class composition (theme cohesion)
**Source:** `HintBubble.tsx:76` (amber default), `BossTelegraph.tsx:38` (red danger), `HelpMenu.tsx:21` (amber popover)
**Apply to:** `NARRATORS` const map — Guild Master = amber (matches existing default), Battle Advisor = red (matches existing danger family), Sage = purple (no collision per RESEARCH grep).

### Toast feedback after tutorial action
**Source:** `HelpMenu.tsx:30, 39` — `toast('msg', { id: 'unique' })`
**Apply to:** any new HelpMenu actions (e.g., the "no tutorial available for this phase" branch).

### z-index ladder (DO NOT CHANGE — Phase 39 lock)
**Source:** Phase 39 SUMMARY 39-02 line 49
- SpotlightMask: `z-100`
- HintBubble: `z-[101]` (HintBubble.tsx:69)
- HelpMenu popover: `z-[200]` (HelpMenu.tsx:21)

### Battle focus guard (DO NOT BREAK — Phase 39 lock)
**Source:** `client/src/components/game/PlayerController.tsx` (selector-based guard, Phase 39-02 deviation #1)
**Constraint for Phase 40:** Do NOT add `autoFocus`, `tabIndex`, or imperative `.focus()` calls inside `HintBubble` body. Click-to-reveal works on plain `onClick` — no focus required (RESEARCH Pitfall 3).

## No Analog Found

None — every Phase 40 file has a strong analog either in the Phase 39 surface (extending) or in adjacent hooks (`usePhaseInterstitial`, `useHintTarget`).

## Metadata

**Analog search scope:**
- `client/src/components/tutorial/` (Phase 39 surfaces)
- `client/src/lib/hooks/` (custom hook patterns)
- `client/src/lib/stores/` (zustand stores including `useTutorial`, `useGameState`, `useComboState`, `useItemStore`)
- `client/src/components/game/phases/` (BattlePhase, RevealPhase as hint mount points)

**Files scanned:** 11 read in full or relevant sections; ~7 additional file:line refs verified via RESEARCH.md cross-check (Lobby, AvatarSelection, ScoreSubmission, BossTelegraph, ComboNotification, ItemBar, LobbyReadyButton — line numbers from RESEARCH §"Targets to add for Phase 40").

**Pattern extraction date:** 2026-05-06
