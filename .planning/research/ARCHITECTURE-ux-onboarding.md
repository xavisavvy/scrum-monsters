# Architecture: UX Onboarding, Tutorials, and Polish

**Domain:** Tutorial system, contextual hints, loading/transition polish, error/empty states, interaction feedback
**Researched:** 2026-03-11
**Confidence:** HIGH (based on direct codebase analysis of existing patterns)

## Recommended Architecture

The system adds three new architectural layers that overlay the existing game without modifying its core flow:

1. **Tutorial/Onboarding Layer** -- A new Zustand store + overlay component system that tracks user progress and renders contextual guidance
2. **UX Feedback Layer** -- Toast/notification enhancements, micro-animations, and interaction confirmations wired into existing event handlers
3. **State Polish Layer** -- Loading skeletons, empty states, and error recovery upgrades to existing components

All three layers are **read-only observers** of existing state. They subscribe to `useGameState`, `useProgression`, and Socket.IO events but never mutate game state directly. This is the same pattern used by `FloatingXPManager`, `LevelUpCelebration`, and `ComboNotification` -- overlay components that react to state without owning it.

### Architecture Diagram

```
  Existing Architecture                    New Overlay Layers
  ====================                    ===================

  [useGameState]  ----subscribe---->  [useTutorial store]
  [useProgression] ---subscribe---->      |
  [useWebSocket]  ----subscribe---->      v
       |                             [TutorialOverlay]
       |                                  |
       v                                  v
  [PhaseRenderer]                    [HintBubble]  [SpotlightMask]
       |
       v
  [PhaseContainer]  <---wrap-with-->  [LoadingStates]  [EmptyStates]
       |
       v
  [BattlePhase]     <---enhance--->   [FeedbackToasts]  [MicroAnimations]
  [DiscussionPhase]
  [VictoryPhase]
  ...
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `useTutorial` (new store) | Track tutorial progress, hint visibility, dismissed hints, first-time flags | Reads from `useGameState`, `useProgression`. Persists to `localStorage`. |
| `TutorialOverlay` (new) | Render step-by-step onboarding sequence over game UI | Reads `useTutorial`, renders `HintBubble` and `SpotlightMask` children |
| `HintBubble` (new) | Contextual tooltip/callout positioned relative to target element | Receives target ref/selector, content, and dismiss callback from parent |
| `SpotlightMask` (new) | Dark overlay with spotlight cutout highlighting a UI element | Receives target bounding rect from `TutorialOverlay` |
| `useUXFeedback` (new hook) | Centralize feedback patterns: success/error toasts, haptic, sound triggers | Wraps existing `sonner` toast + `useGameSounds` + Framer Motion |
| `LoadingSkeleton` (new) | Phase-aware loading placeholders matching JRPG design tokens | Used inside `PhaseContainer` and `PhaseRenderer` fallbacks |
| `EmptyState` (new) | Thematic empty state for zero-data scenarios (no tickets, no players, etc.) | Receives `variant` prop, renders JRPG-themed illustration + CTA |
| `ErrorRecovery` (enhanced) | Upgrade existing `ErrorBoundary` with retry, report, and themed UI | Wraps existing `ErrorBoundary` class component with better fallback UI |

### Data Flow

#### Tutorial State Flow

```
User Action (e.g., joins lobby for first time)
    |
    v
useGameState.currentLobby changes --> useTutorial.evaluateStep()
    |
    v
useTutorial determines: "show lobby_overview hint"
    |
    v
TutorialOverlay renders HintBubble pointing at lobby UI
    |
    v
User clicks "Got it" or performs expected action
    |
    v
useTutorial.completeStep('lobby_overview')
    |
    v
localStorage persists completed steps
    |
    v
useTutorial.evaluateStep() --> next hint or tutorial complete
```

#### Contextual Hint Trigger Flow

Hints are reactive, not scripted. They fire based on state conditions:

```typescript
// Example: hint triggers when user is in battle phase but hasn't voted after 15s
const HINT_RULES: HintRule[] = [
  {
    id: 'battle_vote_reminder',
    condition: (state) =>
      state.gamePhase === 'battle' &&
      !state.currentPlayer?.hasSubmittedScore &&
      state.timeSincePhaseStart > 15_000,
    content: 'Click a number card to submit your estimate!',
    target: '[data-hint-target="score-submission"]',
    dismissAfter: 'submit_score',
    showOnce: true,
  },
];
```

#### Feedback Integration Flow

```
Existing Socket.IO event (e.g., 'combat:boss_damaged')
    |
    v
Existing handler in useWebSocket/useGameState processes state
    |
    v
useUXFeedback.onBossDamaged() fires (subscribed via useEffect)
    |
    v
Triggers: screen shake (CSS), damage number float (Framer Motion),
          sound effect (useGameSounds -- already exists)
```

## Integration Points with Existing Stores

### useGameState -- Read-Only Subscriptions

The tutorial system subscribes to gamePhase transitions using Zustand's `subscribeWithSelector`:

```typescript
// In useTutorial store initialization
useGameState.subscribe(
  (state) => state.currentLobby?.gamePhase,
  (gamePhase, prevPhase) => {
    if (gamePhase && gamePhase !== prevPhase) {
      useTutorial.getState().onPhaseChange(gamePhase, prevPhase);
    }
  }
);
```

This mirrors how `useProgression` already subscribes to game events -- no new patterns needed.

### useWebSocket -- Event Listener Hook

A new `useTutorialSync` hook (pattern matches `useAbilitySync`, `useComboSync`, `useItemSync` in BattlePhase):

```typescript
export function useTutorialSync() {
  const socket = useWebSocket((s) => s.socket);
  const { onPlayerAction } = useTutorial();

  useEffect(() => {
    if (!socket) return;
    // Track user actions to advance tutorial
    const onScoreSubmitted = () => onPlayerAction('submit_score');
    socket.on('score_submitted', onScoreSubmitted);
    return () => { socket.off('score_submitted', onScoreSubmitted); };
  }, [socket, onPlayerAction]);
}
```

### PhaseRenderer -- Overlay Injection Point

The `TutorialOverlay` mounts **alongside** PhaseRenderer, not inside it. This avoids any disruption to the existing `AnimatePresence` keyed by `toPhase`:

```typescript
// In GamePage.tsx or BattleScreen.tsx
<>
  <PhaseRenderer {...props} />
  <TutorialOverlay />  {/* New: renders above phases, portal-based */}
</>
```

### PhaseContainer -- Loading State Enhancement

PhaseContainer's layout slots (`mainContent`, `overlayContent`) already support nullable content. Loading states integrate by replacing `mainContent` with a skeleton when data is loading:

```typescript
// Inside a phase component (e.g., BattlePhase)
if (!boss) {
  return (
    <PhaseContainer
      layout="simple"
      mainContent={<LoadingSkeleton variant="battle" />}  // Replaces current emoji placeholder
    />
  );
}
```

### PhaseRegistry -- Hint Metadata Extension

Extend `PhaseConfig` with optional hint metadata:

```typescript
interface PhaseConfig {
  // ...existing fields...
  hints?: {
    onEnter?: string;  // Hint ID to show when phase starts
    targets?: Record<string, string>;  // data-hint-target -> hint content
  };
}
```

This is backward-compatible -- existing phases without hints just don't define the field.

## New Store: useTutorial

```typescript
interface TutorialStep {
  id: string;
  phase: GamePhase | 'any';
  condition?: (gameState: GameState) => boolean;
  content: string;
  target?: string;  // CSS selector or data-hint-target value
  position?: 'top' | 'bottom' | 'left' | 'right';
  dismissOn?: string;  // action ID that auto-dismisses
  showOnce: boolean;
}

interface TutorialState {
  // Persisted state
  completedSteps: Set<string>;
  dismissedHints: Set<string>;
  hasCompletedOnboarding: boolean;
  tutorialEnabled: boolean;

  // Transient state
  activeHint: TutorialStep | null;
  activeOnboardingStep: number | null;
  hintQueue: TutorialStep[];

  // Actions
  evaluateHints: () => void;
  completeStep: (stepId: string) => void;
  dismissHint: (hintId: string) => void;
  skipTutorial: () => void;
  resetTutorial: () => void;
  onPhaseChange: (newPhase: GamePhase, oldPhase?: GamePhase) => void;
  onPlayerAction: (actionId: string) => void;
}
```

**Persistence:** Uses `localStorage` with a namespaced key (`scrumquest-tutorial-state`), matching the existing pattern in `lobbySettingsStorage.ts`, `playerNameStorage.ts`, etc.

**No server-side state needed.** Tutorial progress is per-browser, not per-account. This matches the existing pattern where player preferences (name, team, lobby settings) are all client-side localStorage.

## New Components Inventory

### Completely New Components

| Component | Location | Size Estimate | Purpose |
|-----------|----------|---------------|---------|
| `useTutorial.ts` | `client/src/lib/stores/` | ~150 LOC | Tutorial state management |
| `useTutorialSync.ts` | `client/src/lib/hooks/` | ~40 LOC | Socket event -> tutorial action bridge |
| `useUXFeedback.ts` | `client/src/lib/hooks/` | ~80 LOC | Centralized feedback triggers |
| `TutorialOverlay.tsx` | `client/src/components/tutorial/` | ~120 LOC | Main tutorial rendering overlay |
| `HintBubble.tsx` | `client/src/components/tutorial/` | ~100 LOC | Positioned tooltip/callout |
| `SpotlightMask.tsx` | `client/src/components/tutorial/` | ~60 LOC | Dimmed overlay with cutout |
| `TutorialProgress.tsx` | `client/src/components/tutorial/` | ~50 LOC | Progress indicator (e.g., "Step 2/5") |
| `LoadingSkeleton.tsx` | `client/src/components/ui/` | ~80 LOC | Phase-aware loading placeholders |
| `EmptyState.tsx` | `client/src/components/ui/` | ~70 LOC | Thematic empty state with variants |
| `ErrorRecoveryFallback.tsx` | `client/src/components/ui/` | ~90 LOC | Themed error boundary fallback |
| `FeedbackToast.tsx` | `client/src/components/ui/` | ~50 LOC | JRPG-styled toast wrapper for sonner |

### Modified Existing Components

| Component | Modification | Impact |
|-----------|-------------|--------|
| `GamePage.tsx` | Add `<TutorialOverlay />` sibling to phase rendering | Minimal -- one line addition |
| `BattleScreen.tsx` | Add `data-hint-target` attributes to key UI elements | Attribute-only, no behavior change |
| `Lobby.tsx` | Add `data-hint-target` attributes, replace basic loading with `LoadingSkeleton` | Attribute-only + loading UI swap |
| `ScoreSubmission.tsx` | Add `data-hint-target="score-submission"` | One attribute |
| `PhaseRenderer.tsx` | Replace inline error/loading divs with `LoadingSkeleton` / `ErrorRecoveryFallback` | Swap existing placeholders |
| `PhaseContainer.tsx` | No changes needed | -- |
| `ErrorBoundary.tsx` | Enhance fallback to use `ErrorRecoveryFallback` | Better fallback UI only |
| `BattlePhase.tsx` | Replace emoji loading state with `LoadingSkeleton variant="battle"` | Visual improvement only |

### Components That Should NOT Be Modified

| Component | Reason |
|-----------|--------|
| `PhaseTransition.tsx` | AnimatePresence/Framer Motion logic is correct and stable |
| `PhaseRegistry.tsx` | Hint metadata extension is optional; can use external mapping instead |
| `useGameState.tsx` | Tutorial reads state, never writes to it |
| `useEventSync.ts` | Sequence-based event recovery is unrelated |
| `useWebSocket.tsx` | No new Socket.IO events needed on the wire |

## Patterns to Follow

### Pattern 1: Overlay Component (matches existing FloatingXPManager, ComboNotification)

**What:** Components that render above game UI, subscribe to stores, and manage their own lifecycle.

**When:** Any new visual feedback that overlays the game (hints, toasts, celebrations).

**Why this pattern:** BattlePhase already composes 7+ overlay components (`FloatingXPManager`, `LevelUpCelebration`, `TierUpToast`, `BossTelegraph`, `ComboNotification`, `CountdownOverlay`, `AbilityBar`). Tutorial overlays follow the exact same pattern.

```typescript
// Existing pattern in BattlePhase.tsx:
<>
  <PhaseContainer layout="battle" ... />
  <BossTelegraph />
  <ComboNotification />
  <FloatingXPManager />
  {/* New additions follow same pattern: */}
  <TutorialOverlay />
</>
```

### Pattern 2: Sync Hook (matches useAbilitySync, useComboSync, useItemSync)

**What:** A hook that connects Socket.IO events to a Zustand store.

**When:** Bridging server events to client-side state that doesn't live in `useGameState`.

```typescript
// Existing pattern:
export function useAbilitySync() {
  const socket = useWebSocket((s) => s.socket);
  useEffect(() => {
    if (!socket) return;
    socket.on('ability:used', handler);
    return () => socket.off('ability:used', handler);
  }, [socket]);
}

// Tutorial equivalent:
export function useTutorialSync() {
  // Same pattern, listening to game events to advance tutorial steps
}
```

### Pattern 3: localStorage Persistence (matches playerNameStorage, lobbySettingsStorage)

**What:** Dedicated storage utility with typed get/set/clear methods.

**When:** Persisting user preferences that don't need server storage.

```typescript
// Existing pattern:
export class PlayerNameStorage {
  private static KEY = 'scrum-monsters-player-name';
  static get(): string | null { ... }
  static set(name: string): void { ... }
}

// Tutorial equivalent:
export class TutorialStorage {
  private static KEY = 'scrumquest-tutorial-state';
  static getCompletedSteps(): string[] { ... }
  static markStepComplete(stepId: string): void { ... }
  static hasCompletedOnboarding(): boolean { ... }
}
```

### Pattern 4: CVA-Based Variant Components (matches RetroButton, RetroCard)

**What:** Components with variant props using class-variance-authority.

**When:** New UI components that need multiple visual variants.

```typescript
// LoadingSkeleton, EmptyState, HintBubble should all use CVA variants
// to stay consistent with the existing 53-token JRPG design system
const hintBubbleVariants = cva("absolute z-[100] rounded-lg border-2 p-4 shadow-xl", {
  variants: {
    theme: {
      tutorial: "bg-amber-900/95 border-amber-400 text-amber-100",
      hint: "bg-blue-900/95 border-blue-400 text-blue-100",
      warning: "bg-red-900/95 border-red-400 text-red-100",
    },
    position: {
      top: "bottom-full mb-2",
      bottom: "top-full mt-2",
      left: "right-full mr-2",
      right: "left-full ml-2",
    }
  }
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Wrapping PhaseRenderer with Tutorial Logic

**What:** Inserting tutorial logic between PhaseRenderer and PhaseTransition.

**Why bad:** PhaseTransition uses `AnimatePresence mode="wait"` keyed on `toPhase`. Any intermediate wrapper breaks the exit/enter animation chain. The codebase comments explicitly warn: "CRITICAL: key={toPhase} drives AnimatePresence."

**Instead:** Mount TutorialOverlay as a sibling, using CSS `position: fixed` and high `z-index` to overlay. Use React portals if needed.

### Anti-Pattern 2: Adding Tutorial State to useGameState

**What:** Putting `tutorialStep`, `hintVisible`, etc. into the main game state store.

**Why bad:** `useGameState` is synced with server via `lobby_updated`. Tutorial state is client-only. Mixing them creates false coupling and subscription noise for every component that reads game state.

**Instead:** Separate `useTutorial` store. Cross-store communication via `subscribeWithSelector` (already used by `useProgression`).

### Anti-Pattern 3: Imperative Hint Positioning (getBoundingClientRect in render)

**What:** Calculating hint positions by querying DOM elements during render.

**Why bad:** React Three Fiber components (PlayerController, BossDisplay) don't have traditional DOM rects. Layout shifts during Framer Motion transitions make positions stale.

**Instead:** Use `data-hint-target` attributes + `ResizeObserver`/`IntersectionObserver` in a `useEffect`. For 3D elements, use screen-space overlay with approximate fixed positions.

### Anti-Pattern 4: Blocking Game Flow for Tutorial

**What:** Preventing phase transitions or user actions until tutorial steps complete.

**Why bad:** This is a multiplayer game. Other players don't wait. Server-driven phase transitions happen regardless of one player's tutorial state.

**Instead:** Tutorial is purely additive overlay. Hints dismiss automatically when the relevant action occurs or phase changes. Never intercept `emit()` calls or block server events.

## Build Order (Dependency-Aware)

### Phase 1: Foundation (no existing component modifications)

1. `TutorialStorage` utility class (localStorage)
2. `useTutorial` Zustand store
3. `HintBubble` component (standalone, testable)
4. `SpotlightMask` component (standalone, testable)

### Phase 2: Loading/Empty/Error States (modify existing fallbacks)

5. `LoadingSkeleton` component with phase variants
6. `EmptyState` component with JRPG-themed variants
7. `ErrorRecoveryFallback` component
8. Update `PhaseRenderer` to use new fallback components
9. Update `BattlePhase` loading state

### Phase 3: Tutorial Integration (wire into game flow)

10. `TutorialOverlay` orchestrator component
11. `useTutorialSync` hook
12. Mount `TutorialOverlay` in `GamePage.tsx`
13. Add `data-hint-target` attributes to key components
14. Define tutorial step sequence and hint rules

### Phase 4: Feedback Polish (enhance existing interactions)

15. `useUXFeedback` hook
16. `FeedbackToast` styled toast wrapper
17. Integrate feedback triggers into existing event handlers
18. Add micro-animations (button press, vote confirmation, etc.)

## Scalability Considerations

| Concern | Current Scale | At 20+ Hints | At 50+ Hints |
|---------|---------------|--------------|--------------|
| Hint evaluation | Evaluate all rules on phase change | Rule evaluation stays O(n) but n is small | Consider rule indexing by phase |
| localStorage | One key, JSON blob | Still fine (~2KB) | Still fine (~5KB) |
| Render overhead | One overlay component | One overlay, conditional children | Same -- only active hint renders |
| Hint content | Hardcoded in code | Hardcoded is fine for <50 hints | Consider separate hints config file |

## Sources

- Direct codebase analysis of `client/src/lib/stores/*.tsx` (all Zustand stores)
- Direct codebase analysis of `client/src/components/game/phases/` (PhaseRenderer, PhaseTransition, PhaseContainer, PhaseRegistry, BattlePhase)
- Direct codebase analysis of `client/src/pages/GamePage.tsx` (lazy loading, phase routing)
- Direct codebase analysis of `client/src/components/ui/ErrorBoundary.tsx` (existing error handling)
- Direct codebase analysis of `shared/gameEvents.ts` (all Socket.IO events, GamePhase types)
- Direct codebase analysis of `client/src/lib/utils/` (localStorage persistence patterns)
- Framer Motion AnimatePresence documentation (HIGH confidence -- well-established pattern)
- Zustand subscribeWithSelector documentation (HIGH confidence -- already used in codebase)
