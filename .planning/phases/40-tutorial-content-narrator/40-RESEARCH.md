# Phase 40: Tutorial Content & JRPG Narrator - Research

**Researched:** 2026-05-06
**Domain:** Tutorial content authoring, typewriter UX, narrator dialogue, contextual-hint event hooks
**Confidence:** HIGH

## Summary

Phase 39 shipped a complete tutorial framework with everything Phase 40 needs to plug into: a hydrated `useTutorial` Zustand store with `completedTutorials` / `completedHints`, the `TutorialOverlay` orchestrator, `HintBubble` with 4-side positioning, `SpotlightMask`, `useHintTarget` for DOM targeting, a `HelpMenu` Radix popover, and a battle-phase focus guard. The placeholder `TUTORIAL_STEPS = {}` and exported `TutorialStep` type at `client/src/components/tutorial/TutorialOverlay.tsx:7-14` are the explicit handoff points for content authoring.

Combat events for the four contextual hints are already observable client-side in three Zustand stores: `useComboState.activeCombo` (combo trigger), `useItemStore.inventory` (item drop), `useGameState.telegraph` (boss telegraph). The reveal-phase trigger comes from `currentLobby.gamePhase === 'reveal'`. No server changes are needed. **Important correction:** CONTEXT.md references "useGameStore" but the actual store is `useGameState` (`client/src/lib/stores/useGameState.tsx`); CLAUDE.md refers to "useGameStore" historically — the planner should standardize on `useGameState` since that is what exists in code.

**Primary recommendation:** Add three small surfaces — (1) a `narrator` field + `Narrator` typed const map in `useTutorial.tsx` colocated with `TUTORIAL_STEPS`, (2) a `useTypewriter(text, speed, options)` hook colocated with `HintBubble.tsx`, (3) a `useFirstEncounter(hintId, condition)` hook in `client/src/lib/hooks/`. Author all walkthrough content in a single colocated `tutorialContent.ts` (or extend `TUTORIAL_STEPS` directly) — the volume is small (10 steps total) and a separate per-phase folder is over-engineered. Reuse the existing amber/gold theme for Guild Master, the existing `jrpg-text-danger` red for Battle Advisor, and Tailwind `purple-400`/`violet-400` for Sage.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tutorial step content (`TUTORIAL_STEPS`) | Browser/Client | — | Static data, colocated with store |
| Narrator config map (`Narrator`) | Browser/Client | — | Pure client presentation data |
| Typewriter rendering | Browser/Client | — | Pure UI effect, no server contract |
| First-encounter detection | Browser/Client | — | Client-side observation of existing store state; CONTEXT explicitly forbids server changes |
| Per-phase auto-start logic | Browser/Client (TutorialOverlay) | — | Reads `currentLobby.gamePhase` from existing client store |
| Hint persistence | Browser/Client (localStorage via Zustand persist) | — | Already shipped in Phase 39 |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Three narrators, phase-locked:**
  - Guild Master — lobby + avatar selection (warm, welcoming)
  - Battle Advisor — battle phase + all combat hints (combo, item, telegraph) (terse, tactical)
  - Sage — scoring/reveal/discussion + first-vote-reveal hint (mystical, reflective)
- **Voices strongly distinct in writing**; recognizable without name header.
- **Visual:** name header + colored accent + pixel-font in existing `HintBubble`. **No portrait art.** **No SFX.**
- **Walkthrough sizes:** lobby=3, avatar=2, battle=5. Total 10 steps.
- **Manual Next/Skip only**, auto-start on first entry per phase, persisted via existing `completedTutorials`.
- **Typewriter:** 30 cps (~33ms/char), click-to-reveal-then-advance, respect `prefers-reduced-motion`, lives in `HintBubble.tsx` or colocated `useTypewriter` hook (no new top-level component).
- **Four contextual hints:** first combo, first item drop, first boss telegraph, first vote reveal. Client-side detection only, no server changes. Auto-skip silently and mark complete if hint target absent.
- **Add `narrator` field to `TutorialStep`** type. HelpMenu Replay = current phase only.
- **z-index ladder fixed:** SpotlightMask 100, HintBubble 101, HelpMenu popover 200 — do not change.
- **Battle focus guard from Phase 39 must continue to pass.**

### Claude's Discretion
- Exact narrator color tokens (planner picks against existing theme palette).
- File structure for tutorial content (single file vs. per-phase folder).
- `Narrator` typed config object vs. inline literals on each step.
- Wording of every line — author against voice guide, no further user review unless obviously off-tone.
- Test approach (unit vs. component vs. light Playwright) — follow Phase 39 patterns.

### Deferred Ideas (OUT OF SCOPE)
- Narrator portrait sprites / character art.
- Typewriter sound effects.
- Server-emitted "first encounter" events.
- Walkthroughs beyond lobby/avatar/battle.
- Per-narrator typewriter speeds.
- i18n / localized tutorial content.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TUTR-01 | Walkthrough tutorials for lobby (3), avatar (2), battle (5) with manual Next/Skip and per-phase auto-start | Step 4 (auto-start placement); Step 3 (`data-hint-target` inventory); existing `TutorialOverlay` already implements step iteration with Next/Skip |
| TUTR-02 | Four contextual hints (first combo, first item, first telegraph, first vote reveal) gated by `completedHints`, auto-skip if target missing | Step 1 (combat event hooks: `useComboState.activeCombo`, `useItemStore.inventory`, `useGameState.telegraph`, `currentLobby.gamePhase==='reveal'`) |
| TUTR-03 | JRPG narrator voices (Guild Master/Battle Advisor/Sage) with typewriter dialogue, `prefers-reduced-motion` honored | Step 2 (typewriter hook design); Step 5 (Narrator config); Step 7 (color tokens) |

## Standard Stack

### Already Installed (No new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.11 | `useTutorial` store extension; first-encounter `subscribe` API for combat hooks | Already used; selector subscribe is built-in |
| framer-motion | ^11.13.1 | `useReducedMotion` hook for typewriter disable; AnimatePresence still used by `HintBubble` for entry/exit | Already imported in `HintBubble.tsx:1` |
| react | ^18.x | `useEffect`/`useState`/`useRef` for typewriter timer; `useSyncExternalStore` not needed | Existing |

### No New Dependencies Needed
All four contextual hints, the typewriter, and the narrator metadata can be implemented with existing primitives. Confirmed by inspection of `useGameState.tsx`, `useComboState.tsx`, `useItemStore.tsx`. `[VERIFIED: codebase grep]`

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `useTypewriter` | `react-typed` / `typed.js` wrappers | Adds a dep for ~30 lines of code. Hand-roll wins. `[ASSUMED]` for typed.js bundle cost; not worth verifying given the trivial replacement. |
| Hand-rolled `useFirstEncounter` | A generic `useOnce(condition)` from npm | None on shelf reliably scoped to Zustand persistence semantics; trivial to write. |

## Architecture Patterns

### System Architecture Diagram

```
[Game phase change]            [Combat store mutation]
       |                               |
       v                               v
 currentLobby.gamePhase          useComboState.activeCombo
       |                         useItemStore.inventory
       |                         useGameState.telegraph
       |                         currentLobby.gamePhase==='reveal'
       v                               v
 [TutorialOverlay              [useFirstEncounter(hintId, cond)]
   useEffect on phase]                 |
       |                               | (cond ⇒ true && !completedHints[id])
       | (first entry &&               v
       |  !completedTutorials[id])  startHint(id) → useTutorial.startTutorial(`hint:${id}`)
       v                               |
 startTutorial(`walkthrough:${phase}`) v
       |                          [TutorialOverlay reads TUTORIAL_STEPS]
       v                               |
 [TutorialOverlay reads TUTORIAL_STEPS for `walkthrough:${phase}`]
                                       |
                                       v
                            [SpotlightMask + HintBubble (with narrator + typewriter)]
                                       |
                  Next ─────────────────┤
                                       |
                  Skip ─────────────────┤
                                       v
                            completeTutorial(id)
                            └─ also dismissHint(id) for hints
```

### Component Responsibilities

| File | New Responsibility (Phase 40) |
|------|-------------------------------|
| `client/src/lib/stores/useTutorial.tsx` | Add `narrator` field to `TutorialStep` (move type here from TutorialOverlay or re-export); export `Narrator` typed const map; populate `TUTORIAL_STEPS` for lobby/avatar/battle walkthroughs and four hint mini-tutorials |
| `client/src/components/tutorial/HintBubble.tsx` | Add narrator name header + colored accent border; integrate `useTypewriter`; wire click-on-body to reveal-instantly then advance |
| `client/src/components/tutorial/useTypewriter.ts` (NEW, colocated) | 30 cps text reveal, instant on `prefers-reduced-motion`, `revealAll()` API for click |
| `client/src/components/tutorial/TutorialOverlay.tsx` | Auto-start logic: `useEffect` watching `currentLobby.gamePhase`; passes `narrator` prop to `HintBubble`; auto-skip if `targetRect===null` after locate timeout |
| `client/src/lib/hooks/useFirstEncounter.ts` (NEW) | Generic hook: `useFirstEncounter(hintId, condition: boolean, options?)` — fires `startTutorial` once when condition flips true |
| `client/src/components/game/phases/BattlePhase.tsx` | Mount three `useFirstEncounter` calls (combo, item, telegraph) — already imports the relevant stores |
| `client/src/components/game/phases/RevealPhase.tsx` | Mount one `useFirstEncounter` call for first-vote-reveal |

### Pattern 1: Narrator Typed Const Map (recommend over inline literals)

```typescript
// In client/src/lib/stores/useTutorial.tsx (colocated with TUTORIAL_STEPS)
export type NarratorId = 'guild_master' | 'battle_advisor' | 'sage';

export interface NarratorConfig {
  displayName: string;
  /** Tailwind-compatible accent class for HintBubble border + name header text */
  accentBorderClass: string;
  accentTextClass: string;
}

export const NARRATORS: Record<NarratorId, NarratorConfig> = {
  guild_master: {
    displayName: 'Guild Master',
    accentBorderClass: 'border-amber-500/60',  // matches existing HintBubble default
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
```

**Why typed map over inline:** Future portrait art adds an `iconUrl` field to `NarratorConfig` — one place. Inline literals would touch every step. `[VERIFIED: minimizes drift by inspection]`

### Pattern 2: useTypewriter Hook (recommend hook over component)

```typescript
// client/src/components/tutorial/useTypewriter.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface UseTypewriterResult {
  displayed: string;
  isComplete: boolean;
  revealAll: () => void;
}

export function useTypewriter(text: string, charsPerSecond = 30): UseTypewriterResult {
  const prefersReducedMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(prefersReducedMotion ? text : '');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const revealAll = useCallback(() => {
    cleanup();
    indexRef.current = text.length;
    setDisplayed(text);
  }, [text]);

  useEffect(() => {
    cleanup();
    indexRef.current = 0;
    if (prefersReducedMotion) {
      setDisplayed(text);
      return;
    }
    setDisplayed('');
    const intervalMs = 1000 / charsPerSecond;
    timerRef.current = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) cleanup();
    }, intervalMs);
    return cleanup;
  }, [text, charsPerSecond, prefersReducedMotion]);

  return { displayed, isComplete: displayed.length >= text.length, revealAll };
}
```

**Hook vs. component shape:** Hook because `HintBubble` already owns its layout, and the typewriter is purely state. A component would force prop drilling and an extra wrapper div, making positioning math fragile. `[VERIFIED: code structure of HintBubble.tsx]`

### Pattern 3: useFirstEncounter Hook (effect that observes existing store state)

```typescript
// client/src/lib/hooks/useFirstEncounter.ts
import { useEffect, useRef } from 'react';
import { useTutorial } from '@/lib/stores/useTutorial';

/**
 * Fires startTutorial(`hint:${hintId}`) the first time `condition` flips to true,
 * provided the hint has not been completed (completedHints[hintId] !== true).
 * Uses an internal latch to prevent re-firing on subsequent re-evaluations.
 */
export function useFirstEncounter(hintId: string, condition: boolean) {
  const completedHints = useTutorial(s => s.completedHints);
  const startTutorial = useTutorial(s => s.startTutorial);
  const dismissHint = useTutorial(s => s.dismissHint);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (completedHints[hintId]) return;
    if (!condition) return;
    firedRef.current = true;
    // Mark dismissed immediately so we never fire twice across remounts
    dismissHint(hintId);
    startTutorial(`hint:${hintId}`);
  }, [hintId, condition, completedHints, startTutorial, dismissHint]);
}
```

The "auto-skip silently if target missing" is enforced inside `TutorialOverlay` (extension point — see Pitfall 4 below).

### Pattern 4: Per-Phase Auto-Start in TutorialOverlay

```typescript
// In TutorialOverlay.tsx — add alongside existing locateTarget useEffect
const currentPhase = useGameState(s => s.currentLobby?.gamePhase);
const { completedTutorials } = useTutorial();
const lastStartedPhaseRef = useRef<string | null>(null);

useEffect(() => {
  if (!currentPhase) return;
  if (!isHydrated) return;            // wait for persist hydration
  if (activeTutorial) return;          // don't interrupt an active tutorial/hint
  const tutorialId = `walkthrough:${currentPhase}`;
  if (!TUTORIAL_STEPS[tutorialId]) return;       // no walkthrough for this phase
  if (completedTutorials[tutorialId]) return;    // already done
  if (lastStartedPhaseRef.current === currentPhase) return;
  lastStartedPhaseRef.current = currentPhase;
  startTutorial(tutorialId);
}, [currentPhase, isHydrated, activeTutorial, completedTutorials, startTutorial]);
```

Place this in `TutorialOverlay` (not `useTutorial`) because `useTutorial` must stay decoupled from `useGameState` (Phase 39 anti-pattern).

### Anti-Patterns to Avoid
- **Coupling `useTutorial` to `useGameState`:** Phase 39 explicitly forbids this. Auto-start logic stays in `TutorialOverlay`.
- **Driving typewriter via `setTimeout` chains:** Use `setInterval` so cleanup is one branch. Recursive `setTimeout` makes cancel-on-unmount fragile under React 18 strict mode.
- **Storing `displayed` text in Zustand:** Typewriter state is per-render; `useTutorial` should not see it.
- **Re-running typewriter on parent re-renders:** Keying the effect on `text` (string identity) is sufficient — every step has unique text. Do NOT key on `step` index alone.
- **Auto-starting hint when target is rendered but not yet measured:** `TutorialOverlay` already debounces `locateTarget` by 350ms after phase change (line 39). Apply the same delay to hint starts; otherwise `targetRect` will be null at first paint and the auto-skip will fire.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reduced-motion detection | Custom `matchMedia` hook | framer-motion `useReducedMotion` | Already imported in `HintBubble.tsx:1` |
| Persistence of completion | Manual localStorage | `useTutorial.dismissHint`/`completeTutorial` | Phase 39 already wired and tested |
| DOM target measurement | Custom rect logic | `useHintTarget.locateTarget` | Phase 39 hook already handles resize/scroll |
| Step iteration UX (Next/Skip/labels) | New component | Existing `HintBubble` + `TutorialOverlay` | Already shipped |

## Common Pitfalls

### Pitfall 1: Click-to-reveal Interferes with Next Button
**What goes wrong:** Click anywhere on the bubble triggers reveal-instantly *and* fires the Next button beneath the cursor.
**Why it happens:** Event bubbling — bubble container click handler runs first, then Next button click runs.
**How to avoid:** Bind the click-to-reveal handler to the **dialogue body container only** (not the button row). Buttons should `stopPropagation` defensively. The "first click reveals, next click advances" rule means the body click handler should advance only when `isComplete` is already true.
**Warning signs:** Tutorial skips two steps per click instead of one.

### Pitfall 2: Stale Closure in useTypewriter When Step Changes Mid-Animation
**What goes wrong:** User clicks Next while typewriter is mid-animation; new step renders but old `setInterval` continues writing the old text into state.
**Why it happens:** The effect cleanup runs, but if `revealAll` was called in the same tick, the queued `setDisplayed` may stomp the new text.
**How to avoid:** Inside the interval tick, always re-read `text.slice(0, indexRef.current)` from the closure-captured `text`. Cleanup function in the effect cancels the interval before the next effect runs. The `text` dep ensures the effect re-runs when it changes. Already handled in the Pattern 2 example.
**Warning signs:** Garbled text on rapid Next clicks.

### Pitfall 3: Battle Focus Guard Triggers When Bubble Renders
**What goes wrong:** Adding focus-trapping or auto-focus to the typewriter body breaks Phase 39's `PlayerController` focus guard.
**Why it happens:** `PlayerController.tsx` was patched to skip auto-focus when `activeElement` is non-body. If the bubble auto-focuses anything, it won't trigger the guard, but if it focuses then blurs (e.g., on text update re-render), it'll race.
**How to avoid:** Do **not** auto-focus the bubble body. Click-to-reveal works on plain `<div onClick>` — no focus needed. The Skip/Next buttons are real `<button>` elements; they receive focus only when the user clicks/tabs to them, which is the correct behavior.
**Warning signs:** Battle phase keyboard input dies when a hint shows. Reproduces the Phase 39 checkpoint bug.

### Pitfall 4: Auto-Skip on Missing Target Must Mark Complete
**What goes wrong:** Hint fires but `data-hint-target` element is not in the DOM; tutorial sits in zombie state with no visible UI but `activeTutorial !== null`.
**Why it happens:** `TutorialOverlay` returns null when `targetRect` is null, but `activeTutorial` stays set, blocking other tutorials.
**How to avoid:** In `TutorialOverlay`, after the 350ms `locateTarget` delay, if the result is null AND the tutorial is a `hint:*`, call `completeTutorial(activeTutorial)` to mark complete and clear active state. Only do this for hints — walkthroughs should retain the existing behavior because their targets ARE expected to exist.
**Warning signs:** First hint fires invisibly; subsequent hints/auto-starts never fire.

### Pitfall 5: useFirstEncounter Re-Fires on HMR / Remount
**What goes wrong:** During dev hot-reload, the `firedRef` resets but `condition` is already true, causing a duplicate fire.
**Why it happens:** Refs reset on remount; `completedHints` is the only persistent latch.
**How to avoid:** Pattern 3 calls `dismissHint(hintId)` *before* `startTutorial`, so even on remount the `completedHints[hintId]` check short-circuits. This also means a hint shown once never replays unless reset via HelpMenu.
**Warning signs:** Hint flashes twice during dev.

### Pitfall 6: TutorialOverlay Auto-Start Races Hint Auto-Start
**What goes wrong:** Player enters battle phase for the first time AND first combo fires immediately; both `walkthrough:battle` and `hint:first-combo` try to start.
**Why it happens:** Two `useEffect`s fire in the same render pass.
**How to avoid:** The `if (activeTutorial) return;` guard in the auto-start effect (Pattern 4) handles this — whichever wins the race blocks the other. Walkthroughs should win in practice because the phase change effect runs before combat events on phase entry. Document this priority in code comments.
**Warning signs:** First-combo hint never fires for new players because the battle walkthrough is still active when combo triggers.

## Combat Event Hooks (Research Question 1)

Each hint maps to a precise observable in an existing client store. **No server changes required** (per CONTEXT.md).

| Hint ID | Observed in | Field/Selector | Truthy Condition | File:line |
|---------|-------------|----------------|------------------|-----------|
| `first-combo` | `useComboState` | `state.activeCombo` | `activeCombo !== null` | `client/src/lib/stores/useComboState.tsx:33,39-47` (set by `showCombo` from `combo:triggered` socket event at line 103) |
| `first-item` | `useItemStore` | `state.inventory` | `inventory.size >= 1` | `client/src/lib/stores/useItemStore.tsx:67,73-82` (mutated by `handleItemAwarded` from `item:awarded` socket event at line 140) |
| `first-telegraph` | `useGameState` | `state.telegraph` | `telegraph !== null` | `client/src/lib/stores/useGameState.tsx:43,79,128` (set by `setTelegraph` action) |
| `first-vote-reveal` | `useGameState` | `state.currentLobby?.gamePhase` | `=== 'reveal'` | `client/src/lib/stores/useGameState.tsx:50` (entire lobby object) — confirmed observable pattern at `client/src/components/game/TeamPerformanceTracker.tsx:63` |

**Where to mount each `useFirstEncounter`:**
- `first-combo`, `first-item`, `first-telegraph`: in `BattlePhase.tsx` (already imports all three stores at lines 14-20)
- `first-vote-reveal`: in `RevealPhase.tsx` (currently a thin component with room — `client/src/components/game/phases/RevealPhase.tsx:8-11`). Alternative: subscribe in `TutorialOverlay` since gamePhase is global. **Recommendation: keep it in RevealPhase** to mirror combat hint mounting and keep `TutorialOverlay` simple.

**Subscribe form (recommended):**
```tsx
// In BattlePhase.tsx
const activeCombo = useComboState(s => s.activeCombo);
const inventorySize = useItemStore(s => s.inventory.size);
const telegraph = useGameState(s => s.telegraph);

useFirstEncounter('first-combo',     activeCombo !== null);
useFirstEncounter('first-item',      inventorySize >= 1);
useFirstEncounter('first-telegraph', telegraph !== null);
```

`[VERIFIED: codebase grep + read of each store file]`

## data-hint-target Inventory (Research Question 3)

### Already exists (Phase 39, verified by grep)
| Target | File:line | Renders in phase |
|--------|-----------|------------------|
| `boss-health` | `BossDisplay.tsx:385` (fullscreen branch — the one PhaseContainer renders) and `:442` (non-fullscreen, inert) | battle |
| `vote-cards` | `ScoreSubmission.tsx:144` | battle (sidebar) |
| `player-hud` | `PlayerHUD.tsx:41` | all phases (mounted globally) |
| `player-info` | `PlayerHUD.tsx:44` | all phases |
| `ability-bar` | `AbilityBar.tsx:46` | battle |
| `help-menu` | `HelpMenu.tsx:13` | all phases |

### Targets to add for Phase 40 (table maps step/hint → target → file)

| Walkthrough/Hint | Step | Target attr | Status | File to edit |
|------------------|------|-------------|--------|--------------|
| **lobby walkthrough (3 steps)** | 1: welcome | `lobby-welcome` (or reuse existing card) | **add** | `client/src/components/game/Lobby.tsx` near the lobby code/title block (~line 1750-1775) |
| | 2: invite link | `lobby-invite` | **add** | `Lobby.tsx:1779` (Copy Invite Link button) — wrap that button row |
| | 3: start | `lobby-start` | **add** | `Lobby.tsx:2138` (Begin Battle button) — host only; for non-hosts, point at `lobby-ready` |
| (non-host alt) | 3: ready up | `lobby-ready` | **add** | `LobbyReadyButton.tsx:14` (the GameButton) — wrap |
| **avatar walkthrough (2 steps)** | 1: pick class | `avatar-grid` | **add** | `AvatarSelection.tsx:69` (the `.avatar-selection-grid` div) |
| | 2: confirm | `avatar-confirm` | **add** | `AvatarSelection.tsx:99-102` (Confirm Avatar button) |
| **battle walkthrough (5 steps)** | 1: boss | `boss-health` | exists | — |
| | 2: vote card | `vote-cards` | exists | — |
| | 3: submit | `vote-submit` | **add** | `ScoreSubmission.tsx` near submit button (search for the submit/confirm action below line 144) |
| | 4: ability bar | `ability-bar` | exists | — |
| | 5: phase flow overview | `phase-flow` (or reuse `boss-health`) | **add** OR reuse | `BossDisplay.tsx` upper area, or simply reuse `boss-health` and let the bubble narrate the cycle |
| **first-combo hint** | — | `combo-notification` | **add** | `client/src/components/game/ComboNotification.tsx` on root div |
| **first-item hint** | — | `item-bar` | **add** | `client/src/components/game/combat/ItemBar.tsx` on root div (mounts only when player has team !== 'spectators', see `BattlePhase.tsx:92`) |
| **first-telegraph hint** | — | `boss-telegraph` | **add** | `client/src/components/game/BossTelegraph.tsx:42` on the outer fixed div |
| **first-vote-reveal hint** | — | `vote-cards` (reuse, fires during reveal-phase rendering of sidebar) OR new `reveal-summary` | **decide** | `RevealPhase.tsx:14-30` is currently a placeholder card; recommend adding `reveal-summary` to the RetroCard at line 18 |

**Total new attributes:** ~9 (one is conditional on host vs. non-host walkthrough fork). The planner can choose to fork lobby step 3 by host status (read `currentLobby.hostId === currentPlayer?.id`) or pick the lowest-common-denominator target. Recommend forking — host's "start" experience and non-host's "ready up" experience are different actions.

`[VERIFIED: grep over client/src for data-hint-target + read of each candidate file]`

## Auto-Start Logic Placement (Research Question 4)

**Decision:** Place auto-start `useEffect` in `TutorialOverlay.tsx`, not `useTutorial.tsx`.

**Rationale:**
- `useTutorial` must stay decoupled from `useGameState` (Phase 39 explicit anti-pattern at lines 283-285 of `39-RESEARCH.md`).
- `TutorialOverlay` already imports both stores transitively and runs once in the tree (mounted as sibling in `PhaseRenderer.tsx:116`).
- The hydration guard at `TutorialOverlay.tsx:50` (`if (!isHydrated) return null;`) protects against the persist-hydration flash. Auto-start should be checked **before** that early-return, but should also wait for `isHydrated`. See Pattern 4 above.

**Interaction with phase transitions:** `PhaseRenderer` triggers `usePhaseInterstitial` on phase change (`PhaseRenderer.tsx:44-49`). The interstitial overlay is a sibling, not a wrapper, so the tutorial auto-start can fire concurrently. The 350ms `locateTarget` delay in `TutorialOverlay` (line 39) gives the interstitial time to clear and target elements time to mount. If the interstitial duration is longer than 350ms in some phases, increase the delay only for the *first* step of a walkthrough — `[ASSUMED]` 350ms is sufficient based on Phase 39 working without complaints; verify in QA.

**Tutorial id naming convention:** Use `walkthrough:<phase>` (e.g., `walkthrough:lobby`) for walkthroughs and `hint:<id>` (e.g., `hint:first-combo`) for hints. Keeps namespaces separate inside `completedTutorials` and `completedHints`.

## Narrator Config Shape (Research Question 5)

**Recommendation:** Typed const map (Pattern 1 above) colocated with `TUTORIAL_STEPS` in `useTutorial.tsx`.

**Why not inline literals on each step:**
- 10 walkthrough steps + 4 hints = 14 places to update color tokens if the theme shifts.
- Future phase will likely add `iconUrl` for portrait art — must NOT cause every step entry to bloat.
- The narrator-per-phase rule is enforced by the type system: each step's `narrator: NarratorId` field references `NARRATORS[step.narrator]` at render time in `HintBubble`.

**Type changes:**
```typescript
// Move TutorialStep from TutorialOverlay.tsx to useTutorial.tsx (or re-export)
export interface TutorialStep {
  targetId: string;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  narrator: NarratorId;  // NEW — required
}
```

`HintBubble` gains:
```tsx
narrator?: NarratorId;  // optional for backward-compat; required in Phase 40 callers
```

## Test Patterns (Research Question 6)

**Phase 39 baseline:**
- Only `client/src/lib/stores/useTutorial.test.ts` exists (`Glob` confirms no `tutorial/*.test.*` component tests). 8 unit tests covering store actions and persistence semantics.
- No Playwright tutorial tests.
- Pattern: Vitest + `@testing-library/react` `renderHook` + `act`. happy-dom env (CLAUDE.md confirms).

**Recommended Phase 40 minimum coverage:**

| Layer | Coverage | Approach |
|-------|----------|----------|
| Unit | `useTypewriter`: completes, respects reduced-motion, `revealAll()` jumps to end, cleanup on unmount | `renderHook` with `vi.useFakeTimers()` |
| Unit | `useFirstEncounter`: fires once, latches via `completedHints`, no fire when `condition` was already true on mount and hint already complete | `renderHook` + `useTutorial.setState` to seed |
| Unit | `useTutorial.TUTORIAL_STEPS` data integrity: every step's `narrator` is a valid `NarratorId`; every walkthrough has the documented step count | Plain assertion test (no rendering) |
| Component | `HintBubble` renders narrator name + accent color + typewriter text | `render` + assertions on text content; mock `useReducedMotion` to skip animation |
| Component | `TutorialOverlay` auto-skip: when `useHintTarget` returns null after delay, `completeTutorial` is called for `hint:*` ids only | Spy on `useTutorial.getState().completeTutorial`; mock `useHintTarget` |
| E2E (optional) | One Playwright happy path: clear localStorage, enter lobby, see Guild Master walkthrough, click Skip, verify next session does not show it | Use existing Playwright config (CLAUDE.md confirms `npm run test:e2e`) |

**Skip Playwright if time-constrained.** Unit + component coverage is sufficient given Phase 39 shipped with no component tests at all.

## Narrator Color Tokens (Research Question 7)

**Theme inventory:** `tailwind.config.ts:14-93` exposes a `jrpg.*` color namespace bound to CSS vars. Inspection of `client/src/index.css` shows base shadcn HSL vars (`--background`, `--accent`, etc.) but no JRPG-specific gold/red/purple tokens visible in the first 60 lines (`Grep` for `--jrpg|jrpg-` returned no matches in the queried range — the JRPG vars must live deeper in the file or in a separate stylesheet). `[ASSUMED]` the `--jrpg-text-accent` and `--jrpg-text-danger` vars exist in `index.css` further down based on `tailwind.config.ts` referencing them.

**Existing narrator-relevant signals from codebase:**
- `HintBubble.tsx:76` already uses `border-amber-500/60` and `text-amber-400` as the default accent. Guild Master inherits this — zero new tokens needed.
- Battle Advisor red: `BossTelegraph.tsx:38` uses `bg-red-500/20 border-red-400` for danger states. Use Tailwind `border-red-500/60` + `text-red-400` to mirror.
- Sage purple: no existing precedent in the searched files. Tailwind `border-purple-500/60` + `text-purple-400` is a safe pick that doesn't collide with any existing palette use. `[VERIFIED: grep "purple-" returned only this research file]`

**Recommendation table (final):**

| Narrator | Border | Name header text | Rationale |
|----------|--------|------------------|-----------|
| Guild Master | `border-amber-500/60` | `text-amber-400` | Matches existing `HintBubble` default — zero theme drift |
| Battle Advisor | `border-red-500/60` | `text-red-400` | Mirrors `BossTelegraph` danger color family |
| Sage | `border-purple-500/60` | `text-purple-400` | Distinct, mystical, no existing collisions |

If the planner discovers a `--jrpg-` purple var deeper in `index.css`, prefer that over Tailwind `purple-*` for theme cohesion. This is a cosmetic refinement, not blocking.

## Code Examples

### TUTORIAL_STEPS shape (illustrative — planner authors final wording)

```typescript
// Excerpt from useTutorial.tsx, after the store definition
export const TUTORIAL_STEPS: Record<string, TutorialStep[]> = {
  'walkthrough:lobby': [
    { narrator: 'guild_master', targetId: 'lobby-welcome', position: 'bottom',
      text: 'Welcome, brave adventurer. The guild has prepared a hall for your party.' },
    { narrator: 'guild_master', targetId: 'lobby-invite', position: 'top',
      text: 'Share this rune with your companions — they will join you here.' },
    { narrator: 'guild_master', targetId: 'lobby-start', position: 'top',
      text: 'When all are ready, begin the trial. The boss awaits.' },
  ],
  'walkthrough:avatar_selection': [
    { narrator: 'guild_master', targetId: 'avatar-grid', position: 'bottom',
      text: 'Choose your class wisely. Each carries a different blade into battle.' },
    { narrator: 'guild_master', targetId: 'avatar-confirm', position: 'top',
      text: 'Steady your resolve. Confirm your choice and the trial begins.' },
  ],
  'walkthrough:battle': [
    { narrator: 'battle_advisor', targetId: 'boss-health', position: 'bottom',
      text: 'Target. Health bar shows what stands between you and victory.' },
    { narrator: 'battle_advisor', targetId: 'vote-cards', position: 'top',
      text: 'Estimate the ticket. Higher consensus, harder hit.' },
    { narrator: 'battle_advisor', targetId: 'vote-submit', position: 'top',
      text: 'Lock your card. No second-guessing once it lands.' },
    { narrator: 'battle_advisor', targetId: 'ability-bar', position: 'top',
      text: 'Abilities. Spend them on the right phase — boss has tells.' },
    { narrator: 'battle_advisor', targetId: 'boss-health', position: 'bottom',
      text: 'Cycle: vote, reveal, discuss, strike. Repeat until the boss falls.' },
  ],
  'hint:first-combo': [
    { narrator: 'battle_advisor', targetId: 'combo-notification', position: 'bottom',
      text: 'Combo active. Sustain it — bonus damage scales with chain length.' },
  ],
  'hint:first-item': [
    { narrator: 'battle_advisor', targetId: 'item-bar', position: 'top',
      text: 'Item dropped. Use it before the next phase — items expire on victory.' },
  ],
  'hint:first-telegraph': [
    { narrator: 'battle_advisor', targetId: 'boss-telegraph', position: 'bottom',
      text: 'Warning. Boss is winding up. Read the tell, position accordingly.' },
  ],
  'hint:first-vote-reveal': [
    { narrator: 'sage', targetId: 'reveal-summary', position: 'bottom',
      text: 'The party speaks with one voice... or many. Both reveal truth.' },
  ],
};
```

`[ASSUMED]` exact wording — planner/executor finalizes against the voice guide in CONTEXT.md `<specifics>`.

### HintBubble narrator integration sketch

```tsx
// In HintBubble.tsx — add narrator prop and read NARRATORS map
import { NARRATORS, NarratorId } from '@/lib/stores/useTutorial';
import { useTypewriter } from './useTypewriter';

interface HintBubbleProps {
  // ... existing props
  narrator?: NarratorId;
}

// inside component:
const config = narrator ? NARRATORS[narrator] : null;
const { displayed, isComplete, revealAll } = useTypewriter(text, 30);

const handleBodyClick = () => {
  if (!isComplete) revealAll();
  else onNext?.();
};

// in render:
<div className={`bg-gray-900/95 border-2 ${config?.accentBorderClass ?? 'border-amber-500/60'} rounded-lg p-4 ...`}>
  {config && (
    <div className={`text-xs font-bold mb-1 ${config.accentTextClass}`}>
      {config.displayName}
    </div>
  )}
  {stepLabel && <div className="text-xs text-amber-400/70 mb-1">{stepLabel}</div>}
  <div className="text-sm text-gray-100 cursor-pointer" onClick={handleBodyClick}>
    {displayed}
  </div>
  <div className="flex gap-2 mt-3 justify-end" onClick={(e) => e.stopPropagation()}>
    {/* Skip / Next buttons unchanged */}
  </div>
</div>
```

## Project Constraints (from CLAUDE.md)

- **TypeScript everywhere.** New files in `client/src/`.
- **Path aliases:** `@/` → `client/src/`, `@shared` → `shared/`.
- **Tests** colocated with `.test.ts`/`.spec.ts` suffix; Vitest + happy-dom.
- **Conventional Commits** enforced via husky/commitlint.
- **No server changes** for this phase (CONTEXT explicit) — preserve `shared/gameEvents.ts` contracts.
- **Lint clean:** `npm run lint`. **Type check:** `npm run check`.

## Runtime State Inventory

Not applicable — this phase adds new content and UI; no rename/refactor of existing keys, no datastore migration. New `completedTutorials` keys (`walkthrough:lobby`, etc.) and `completedHints` keys (`first-combo`, etc.) are net-new and have no prior values to migrate.

**Categories explicitly checked:**
- Stored data: none affected. New localStorage keys created on first run; no existing tutorial data to migrate. `[VERIFIED: useTutorial persist version=1, no Phase 39 content shipped]`
- Live service config: none. No external service involved.
- OS-registered state: none.
- Secrets/env vars: none.
- Build artifacts: none. New TS files only.

## Common Pitfalls (additional, Phase-40-specific)

Already covered above (Pitfalls 1-6).

## Environment Availability

Skipped — phase is pure code changes in TypeScript/React. No new external tools, runtimes, or services required. All dependencies already installed and verified (`zustand`, `framer-motion`, `react`).

## Validation Architecture

> Per `.planning/config.json`, including unless `workflow.nyquist_validation` is explicitly false. `[ASSUMED]` enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + happy-dom + @testing-library/react |
| Config file | `vitest.config.ts` (root) — `[ASSUMED]` exists per CLAUDE.md test commands |
| Quick run command | `npx vitest run client/src/lib/hooks/useFirstEncounter.test.ts client/src/components/tutorial/useTypewriter.test.ts -x` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TUTR-01 | Walkthrough steps populated, manual Next/Skip, per-phase auto-start | unit + component | `npx vitest run client/src/components/tutorial/TutorialOverlay.test.tsx -x` | Wave 0 |
| TUTR-01 | TUTORIAL_STEPS data integrity (counts, narrator validity) | unit | `npx vitest run client/src/lib/stores/useTutorial.test.ts -x` | extend existing |
| TUTR-02 | useFirstEncounter latches; auto-skip when target missing | unit + component | `npx vitest run client/src/lib/hooks/useFirstEncounter.test.ts client/src/components/tutorial/TutorialOverlay.test.tsx -x` | Wave 0 |
| TUTR-03 | useTypewriter completes, reduced-motion, revealAll | unit | `npx vitest run client/src/components/tutorial/useTypewriter.test.ts -x` | Wave 0 |
| TUTR-03 | HintBubble renders narrator name + accent | component | `npx vitest run client/src/components/tutorial/HintBubble.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** quick run command above (file-targeted)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + manual smoke (clear localStorage, walk through each phase) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `client/src/components/tutorial/useTypewriter.test.ts` — covers TUTR-03
- [ ] `client/src/components/tutorial/HintBubble.test.tsx` — covers TUTR-03 (narrator rendering)
- [ ] `client/src/components/tutorial/TutorialOverlay.test.tsx` — covers TUTR-01 (auto-start) + TUTR-02 (auto-skip)
- [ ] `client/src/lib/hooks/useFirstEncounter.test.ts` — covers TUTR-02
- [ ] Extension to `client/src/lib/stores/useTutorial.test.ts` — TUTORIAL_STEPS integrity assertions

No new framework install needed.

## Security Domain

Not applicable. No auth/session/access-control/crypto surfaces touched. Input validation: tutorial text strings are author-controlled compile-time literals (never user input), so V5 does not apply. `[VERIFIED: TUTORIAL_STEPS is a typed const, not user-derived]`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 350ms locateTarget delay is enough after phase transition for hint targets too | Pitfall 4 / Auto-start | Low — observed working in Phase 39; if not, increase delay or add MutationObserver |
| A2 | `--jrpg-*` CSS vars exist deeper in `index.css` than the first 60 lines grepped | Color tokens | Low — falling back to Tailwind `amber/red/purple` is fully functional |
| A3 | typed.js wrapper bundle cost not worth verifying given trivial hand-roll | Stack alternatives | None — hand-roll wins regardless |
| A4 | `vitest.config.ts` exists at repo root | Validation | Low — CLAUDE.md confirms vitest works; if missing, `vite.config.ts` likely has test config inline |
| A5 | Exact narrator wording in code examples is illustrative only | Code Examples | None — planner finalizes wording |
| A6 | `nyquist_validation` enabled (default if absent in config.json) | Validation | None — section can be ignored if disabled |

## Open Questions

1. **Should the lobby walkthrough fork between host and non-host?**
   - What we know: Hosts see "Begin Battle" button; non-hosts see "Ready Up" / waiting message.
   - What's unclear: One walkthrough with shared steps + final-step swap, or two distinct walkthrough ids?
   - Recommendation: Single `walkthrough:lobby` id; in step 3, the planner can either (a) use `targetId: 'lobby-action'` with both buttons given that attribute conditionally, or (b) split into `walkthrough:lobby-host` / `walkthrough:lobby-guest` and pick the right id at start time. Option (a) is simpler.

2. **Combo hint timing — does `combo-notification` element stay mounted long enough?**
   - What we know: `ComboNotification` reads `useComboState.activeCombo` which is set by socket events; dismissal pattern is in `useComboState.dismissCombo`.
   - What's unclear: How long the notification stays visible after `combo:triggered`. If <1s the typewriter (30 cps × ~80 chars = ~2.6s) won't finish before target unmounts.
   - Recommendation: Verify dismissal timing during planning; if too short, the hint can position relative to `boss-health` instead, with text describing combos rather than pointing at the (transient) notification UI. Defer the decision to plan-time visual QA.

3. **Reveal-phase target choice (`vote-cards` reuse vs. new `reveal-summary`)?**
   - What we know: `RevealPhase` is a placeholder card with no specific target.
   - What's unclear: Whether to add `data-hint-target="reveal-summary"` to the placeholder card or reuse `vote-cards` (which renders in the sidebar during battle and may not render in reveal phase).
   - Recommendation: Add `reveal-summary` to `RevealPhase.tsx:18` RetroCard. Cleaner ownership.

## Sources

### Primary (HIGH confidence)
- Codebase: `client/src/lib/stores/useTutorial.tsx` (full read)
- Codebase: `client/src/components/tutorial/{HintBubble,TutorialOverlay,HelpMenu}.tsx` (full read)
- Codebase: `client/src/lib/hooks/useHintTarget.ts` (full read)
- Codebase: `client/src/lib/stores/{useGameState,useComboState,useItemStore}.tsx` (relevant excerpts)
- Codebase: `client/src/components/game/{BossTelegraph,Lobby,AvatarSelection,LobbyReadyButton}.tsx`
- Codebase: `client/src/components/game/phases/{BattlePhase,RevealPhase,PhaseRenderer}.tsx`
- Codebase: `tailwind.config.ts`
- Phase 39 deliverables: `39-RESEARCH.md`, `39-01-SUMMARY.md`, `39-02-SUMMARY.md`
- CONTEXT.md (Phase 40 user decisions)

### Secondary (MEDIUM confidence)
- CLAUDE.md (project conventions, test commands)

### Tertiary (LOW confidence)
- Tailwind purple/red palette — known stable but not codebase-verified for collisions beyond grep.

## Metadata

**Confidence breakdown:**
- Combat event hooks: HIGH — direct read of all four stores
- Typewriter pattern: HIGH — standard React hook + framer-motion API both verified in code
- data-hint-target inventory: HIGH — exhaustive grep of `client/src` plus per-file inspection of candidates
- Auto-start placement: HIGH — confirmed against Phase 39 anti-pattern guidance and existing TutorialOverlay structure
- Narrator config shape: HIGH — pattern choice purely structural
- Test patterns: HIGH — verified zero existing tutorial component tests via Glob
- Color tokens: MEDIUM — JRPG CSS vars partially traced; Tailwind fallback is safe

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable; no fast-moving deps)
