# Phase 39: Tutorial Foundation - Research

**Researched:** 2026-03-11
**Domain:** Tutorial overlay infrastructure, Zustand persist middleware, DOM hint targeting
**Confidence:** HIGH

## Summary

Phase 39 builds tutorial infrastructure: an isolated Zustand store with localStorage persistence, spotlight/hint overlay components, a `data-hint-target` attribute system for positioning overlays relative to game elements, and a help menu button to re-trigger tutorials. This is foundational plumbing -- no tutorial *content* ships in this phase.

The codebase is well-suited for this work. All key tutorial target elements (BossDisplay, ScoreSubmission, PlayerHUD, AbilityBar, sidebar toggle) are standard DOM elements, not R3F/3D -- the Canvas is only used in Lobby for avatar preview. The existing PhaseRenderer already renders sibling overlays (PhaseInterstitial), establishing the exact pattern tutorial overlays should follow. Zustand `persist` middleware with `partialize` handles localStorage persistence cleanly. Framer Motion `AnimatePresence` is already used throughout for overlay enter/exit animations.

**Primary recommendation:** Build a custom lightweight hint system using `data-hint-target` attributes + `getBoundingClientRect()` + framer-motion, rather than importing a third-party tour library. The game's JRPG theme demands custom visuals that no off-the-shelf library provides, and the hint targets are all standard DOM elements.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.11 | Tutorial store with persist middleware | Already used for all stores; persist middleware built-in |
| framer-motion | ^11.13.1 | Overlay animations (AnimatePresence, motion) | Already used for PhaseInterstitial, toast, vote cards |
| lucide-react | ^0.563.0 | Help menu icon (HelpCircle, BookOpen) | Already used throughout UI |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-popover | ^1.1.15 | Help menu popover | Already wrapped in `components/ui/popover.tsx` |
| @radix-ui/react-dialog | ^1.1.2 | Help menu as dialog alternative if popover has z-index issues | Already wrapped in `components/ui/dialog.tsx` |
| sonner | ^1.7.1 | Toast feedback when tutorial is reset | Already configured with JRPG theme in `components/ui/sonner.tsx` |

### No New Dependencies Needed
All required libraries are already installed. No `npm install` needed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom hint system | react-joyride | react-joyride is broken on React 19, heavy (249k downloads but aging), and its default UI clashes with JRPG theme. Custom system is ~150 lines and gives full visual control. |
| Custom hint system | driver.js | Lightest option (82.5kB), but still requires extensive CSS overrides for JRPG theming. Not worth the dependency for this game's needs. |
| Custom spotlight | shepherd.js | Commercial license required for commercial use. Overkill for a few hint targets. |

## Architecture Patterns

### Recommended File Structure
```
client/src/
  lib/
    stores/
      useTutorial.tsx          # Zustand store with persist middleware
      useTutorial.test.ts      # Store unit tests
    hooks/
      useHintTarget.ts         # Hook to register/query hint target rects
  components/
    tutorial/
      SpotlightMask.tsx        # Full-screen SVG mask with cutout hole
      HintBubble.tsx           # Positioned speech-bubble with hint text
      TutorialOverlay.tsx      # Orchestrator: combines mask + bubble + step logic
      HelpMenu.tsx             # Radix Popover with tutorial re-trigger options
      HelpMenuButton.tsx       # The ? button placed in the game UI
```

### Pattern 1: Isolated Store with Persist + Partialize
**What:** A Zustand store completely separate from `useGameState`, persisting only completion flags to localStorage.
**When to use:** Tutorial state must survive page refreshes but NOT contain runtime-only state (active step, current rect).
**Example:**
```typescript
// Source: zustand.docs.pmnd.rs/reference/middlewares/persist
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface TutorialState {
  // Persisted (completion tracking)
  completedTutorials: Record<string, boolean>;
  completedHints: Record<string, boolean>;
  version: number;

  // Runtime-only (NOT persisted)
  activeTutorial: string | null;
  activeStep: number;
  isSpotlightVisible: boolean;

  // Actions
  startTutorial: (id: string) => void;
  advanceStep: () => void;
  completeTutorial: (id: string) => void;
  dismissHint: (id: string) => void;
  resetTutorial: (id: string) => void;
  resetAllTutorials: () => void;
}

export const useTutorial = create<TutorialState>()(
  persist(
    (set, get) => ({
      completedTutorials: {},
      completedHints: {},
      version: 1,
      activeTutorial: null,
      activeStep: 0,
      isSpotlightVisible: false,

      startTutorial: (id) => set({
        activeTutorial: id,
        activeStep: 0,
        isSpotlightVisible: true,
      }),
      advanceStep: () => set((s) => ({ activeStep: s.activeStep + 1 })),
      completeTutorial: (id) => set((s) => ({
        completedTutorials: { ...s.completedTutorials, [id]: true },
        activeTutorial: null,
        activeStep: 0,
        isSpotlightVisible: false,
      })),
      dismissHint: (id) => set((s) => ({
        completedHints: { ...s.completedHints, [id]: true },
      })),
      resetTutorial: (id) => set((s) => {
        const { [id]: _, ...rest } = s.completedTutorials;
        return { completedTutorials: rest };
      }),
      resetAllTutorials: () => set({
        completedTutorials: {},
        completedHints: {},
      }),
    }),
    {
      name: 'scrumquest-tutorial',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        completedTutorials: state.completedTutorials,
        completedHints: state.completedHints,
        version: state.version,
      }),
    }
  )
);
```

### Pattern 2: data-hint-target Attribute System
**What:** Game elements get `data-hint-target="target-id"` attributes. A hook queries them via `document.querySelector` + `getBoundingClientRect()`.
**When to use:** To position SpotlightMask cutouts and HintBubble arrows relative to target elements.
**Example:**
```typescript
// useHintTarget.ts
import { useCallback, useRef, useState } from 'react';

interface HintRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function useHintTarget() {
  const [targetRect, setTargetRect] = useState<HintRect | null>(null);
  const rafRef = useRef<number>();

  const locateTarget = useCallback((targetId: string): HintRect | null => {
    const el = document.querySelector(`[data-hint-target="${targetId}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const hintRect = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      right: rect.right,
    };
    setTargetRect(hintRect);
    return hintRect;
  }, []);

  // Track a target across frames (for elements that move/resize)
  const trackTarget = useCallback((targetId: string) => {
    const update = () => {
      locateTarget(targetId);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [locateTarget]);

  return { targetRect, locateTarget, trackTarget };
}
```

Usage in game components:
```tsx
// In ScoreSubmission.tsx - add data-hint-target to the vote card grid
<div data-hint-target="vote-cards" className="grid grid-cols-4 gap-3">
  {/* vote cards */}
</div>

// In PlayerHUD.tsx - add data-hint-target to the avatar area
<div data-hint-target="player-info" className="flex items-center gap-4">
  {/* player info */}
</div>

// In BossDisplay.tsx - add data-hint-target to the health bar area
<div data-hint-target="boss-health">
  <HealthBar ... />
</div>
```

### Pattern 3: SpotlightMask as SVG with Cutout
**What:** A full-viewport SVG with a filled rect and a transparent cutout positioned over the target element.
**When to use:** To draw attention to a specific UI element during tutorial steps.
**Example:**
```tsx
// SpotlightMask.tsx
import { motion, AnimatePresence } from 'framer-motion';

interface SpotlightMaskProps {
  targetRect: { top: number; left: number; width: number; height: number } | null;
  visible: boolean;
  padding?: number;
  onClickOverlay?: () => void;
}

export function SpotlightMask({ targetRect, visible, padding = 8, onClickOverlay }: SpotlightMaskProps) {
  return (
    <AnimatePresence>
      {visible && targetRect && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClickOverlay}
        >
          <svg width="100%" height="100%" className="absolute inset-0">
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - padding}
                  y={targetRect.top - padding}
                  width={targetRect.width + padding * 2}
                  height={targetRect.height + padding * 2}
                  rx={8}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.75)"
              mask="url(#spotlight-mask)"
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Pattern 4: Sibling Overlay Rendering (Established Pattern)
**What:** Tutorial overlays render as siblings to PhaseRenderer, not children. This follows the PhaseInterstitial precedent from Phase 38.
**When to use:** Always -- overlays must sit outside PhaseTransition's AnimatePresence to avoid mode="wait" conflicts.
**Where to mount:**
```tsx
// In PhaseRenderer.tsx or BattleScreen.tsx (the top-level render)
return (
  <>
    <PhaseInterstitial ... />
    <TutorialOverlay />      {/* NEW: sibling overlay */}
    <PhaseTransition ...>
      <ErrorBoundary ...>
        <PhaseComponent ... />
      </ErrorBoundary>
    </PhaseTransition>
  </>
);
```

### Anti-Patterns to Avoid
- **Coupling tutorial state to useGameState:** The tutorial store MUST be a separate Zustand store. Persisting game state and tutorial state together would be a data integrity nightmare.
- **Rendering overlays inside PhaseTransition:** This causes AnimatePresence mode="wait" conflicts as discovered in Phase 38. Always render as siblings.
- **Using Radix Popover for hint bubbles:** Radix Popover brings collision detection, portaling, and focus management that fights with the game's z-index system. Use simple absolutely-positioned divs for hint bubbles instead. Reserve Radix Popover only for the help menu trigger.
- **RAF-tracking all targets by default:** Only use `requestAnimationFrame` tracking for targets that actually move (player characters). Static elements (sidebar, buttons) need only a single `getBoundingClientRect()` call + resize listener.
- **Persisting runtime tutorial state:** `activeTutorial`, `activeStep`, `isSpotlightVisible` should NOT be persisted. If a user refreshes mid-tutorial, the tutorial should restart from the beginning (not resume mid-step with stale rects).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| localStorage serialization | Manual JSON.parse/stringify | Zustand `persist` middleware with `partialize` | Handles hydration, versioning, migration, edge cases |
| Overlay enter/exit animations | CSS transitions with manual state | framer-motion `AnimatePresence` | Already used everywhere; handles unmount animations |
| Help menu trigger/positioning | Custom dropdown | Radix Popover (already wrapped in `components/ui/popover.tsx`) | Keyboard nav, focus trap, collision-aware positioning |
| Schema migration for stored tutorial data | Manual version checking | Zustand persist `version` + `migrate` | Built-in, handles version mismatch gracefully |

**Key insight:** The tutorial system's visual components (spotlight, bubble) are simple enough to hand-build (~150 lines each), but the state persistence layer has subtle edge cases (hydration timing, stale data, version migration) that Zustand persist solves well.

## Common Pitfalls

### Pitfall 1: Hydration Flash
**What goes wrong:** On page load, Zustand persist hydrates asynchronously. If tutorial overlay checks `completedTutorials` before hydration, it shows the tutorial to users who already completed it.
**Why it happens:** `persist` middleware uses async storage by default; initial state is empty until hydration finishes.
**How to avoid:** Use the `onRehydrationFinished` callback or check `useTutorial.persist.hasHydrated()` before rendering tutorial triggers. Add an `isHydrated` guard.
**Warning signs:** Tutorial flashes on every page load for returning users.

### Pitfall 2: getBoundingClientRect Returns Zero During Transitions
**What goes wrong:** Calling `getBoundingClientRect()` on an element mid-animation (during PhaseTransition) returns 0-width/0-height or incorrect positions.
**Why it happens:** framer-motion applies CSS transforms and opacity changes during transitions; the element may be scaled to 0 or off-screen.
**How to avoid:** Delay hint target location until after `PhaseTransition` animation completes. Use `onAnimationComplete` callback from framer-motion, or add a small delay (300ms) after phase change before locating targets.
**Warning signs:** Spotlight appears in top-left corner (0,0) or has zero dimensions.

### Pitfall 3: Z-Index Wars
**What goes wrong:** Tutorial overlay is hidden behind game elements (boss display, sidebar, countdown overlay, emote bubbles).
**Why it happens:** The game uses z-indexes from z-40 to z-70 (CountdownOverlay z-50, PlayerController z-70, sidebar z-50).
**How to avoid:** Use z-[100] for SpotlightMask and z-[101] for HintBubble. Keep the hint target element itself clickable by setting `pointer-events: none` on the overlay SVG mask area over the target.
**Warning signs:** Click-through doesn't work on highlighted elements.

### Pitfall 4: Window Resize Invalidates Stored Rects
**What goes wrong:** User resizes window or rotates device; spotlight is positioned based on stale getBoundingClientRect() values.
**Why it happens:** Rect values are viewport-relative and change on resize.
**How to avoid:** Add a resize listener that re-locates the active target. Debounce to 100ms.
**Warning signs:** Spotlight is offset from target after resize.

### Pitfall 5: Radix Popover Z-Index in Game Context
**What goes wrong:** Help menu Popover renders behind game overlays or gets clipped.
**Why it happens:** Radix portals to document body by default, but game CSS may set up stacking contexts.
**How to avoid:** Test the help menu Popover in each game phase. If z-index issues arise, switch to Radix Dialog (modal, always on top) or use a custom portal container.
**Warning signs:** Help menu appears but clicks pass through it to game elements behind.

## Code Examples

### Zustand Persist with Partialize and Version Migration
```typescript
// Source: zustand.docs.pmnd.rs/reference/middlewares/persist
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useTutorial = create<TutorialState>()(
  persist(
    (set, get) => ({
      // ... state and actions
    }),
    {
      name: 'scrumquest-tutorial',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        completedTutorials: state.completedTutorials,
        completedHints: state.completedHints,
        version: state.version,
      }),
      // Future-proofing: migrate from v0 to v1
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Example migration: rename old keys
          return { ...persistedState, version: 1 };
        }
        return persistedState as TutorialState;
      },
    }
  )
);
```

### Hydration Guard
```typescript
// Check hydration before rendering tutorial triggers
function TutorialGuard({ children }: { children: React.ReactNode }) {
  const hasHydrated = useTutorial.persist?.hasHydrated?.() ?? false;
  if (!hasHydrated) return null;
  return <>{children}</>;
}
```

### HintBubble with Position Calculation
```tsx
// HintBubble.tsx - positioned relative to target rect
import { motion } from 'framer-motion';

interface HintBubbleProps {
  targetRect: { top: number; left: number; width: number; height: number; bottom: number };
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onNext?: () => void;
  onDismiss?: () => void;
}

export function HintBubble({ targetRect, text, position = 'bottom', onNext, onDismiss }: HintBubbleProps) {
  // Calculate bubble position based on target rect and preferred side
  const style = (() => {
    const centerX = targetRect.left + targetRect.width / 2;
    switch (position) {
      case 'bottom':
        return { top: targetRect.bottom + 12, left: centerX, transform: 'translateX(-50%)' };
      case 'top':
        return { top: targetRect.top - 12, left: centerX, transform: 'translate(-50%, -100%)' };
      case 'right':
        return { top: targetRect.top + targetRect.height / 2, left: targetRect.left + targetRect.width + 12, transform: 'translateY(-50%)' };
      case 'left':
        return { top: targetRect.top + targetRect.height / 2, left: targetRect.left - 12, transform: 'translate(-100%, -50%)' };
    }
  })();

  return (
    <motion.div
      className="fixed z-[101] max-w-xs"
      style={style}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <div className="bg-gray-900/95 border-2 border-amber-500/60 rounded-lg p-4 font-jrpg text-sm text-gray-100 shadow-lg shadow-amber-500/10">
        <p>{text}</p>
        <div className="flex gap-2 mt-3 justify-end">
          {onDismiss && (
            <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-200">
              Skip
            </button>
          )}
          {onNext && (
            <button onClick={onNext} className="text-xs text-amber-400 hover:text-amber-300 font-bold">
              Next
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

### Help Menu Button (TUTR-04 requirement)
```tsx
// HelpMenuButton.tsx
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useTutorial } from '@/lib/stores/useTutorial';
import { toast } from 'sonner';

export function HelpMenuButton() {
  const { startTutorial, resetAllTutorials } = useTutorial();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-hint-target="help-menu"
          className="p-2 rounded-lg bg-gray-900/80 border border-gray-600 hover:border-amber-500/50 transition-colors"
          aria-label="Help menu"
        >
          <HelpCircle className="w-5 h-5 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 bg-gray-900/95 border-amber-500/40">
        <div className="space-y-2 font-jrpg text-sm">
          <h3 className="font-bold text-amber-400">Help</h3>
          <button
            onClick={() => {
              startTutorial('battle-basics');
              toast('Tutorial started!', { id: 'tutorial-restart' });
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-200"
          >
            Replay Tutorial
          </button>
          <button
            onClick={() => {
              resetAllTutorials();
              toast('All tutorials reset', { id: 'tutorial-reset' });
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-400 text-xs"
          >
            Reset All Hints
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-joyride for all tour needs | Custom hint systems for themed apps; react-joyride for generic SaaS | 2025 (React 19 breakage) | react-joyride uses deprecated findDOMNode; broken on React 19 |
| zustand v4 persist import path | zustand v5 `import { persist } from 'zustand/middleware'` | zustand v5 (2024) | Single import path for all middleware |
| Manual localStorage in useEffect | Zustand persist middleware | Stable since zustand v3 | Eliminates boilerplate, adds versioning |

**Deprecated/outdated:**
- react-joyride: Broken on React 19, uses deprecated `findDOMNode`. This project is on React 18 so technically still works, but not worth the dependency.
- intro.js: Requires commercial license. Avoid.

## Open Questions

1. **Where exactly to mount HelpMenuButton in the game UI?**
   - What we know: PlayerHUD renders at the bottom. BossMusicControls renders top-right. Timer renders top-left.
   - What's unclear: Best position that doesn't overlap existing UI and is accessible across all phases.
   - Recommendation: Place in PlayerHUD area (bottom bar) since it's visible across all battle phases. Final positioning is a planning decision.

2. **Should tutorial auto-trigger on first game join?**
   - What we know: Phase 39 only builds infrastructure, not content. TUTR-04 requires manual re-trigger from help menu.
   - What's unclear: Whether auto-trigger on first visit is Phase 39 or Phase 40+ scope.
   - Recommendation: Build the `startTutorial` action now, but leave auto-trigger wiring to a later phase. The store should track `hasSeenTutorial` so Phase 40+ can auto-trigger.

3. **Reduced motion handling for spotlight overlay?**
   - What we know: Phase 38 established `useReducedMotion` as a no-op pattern for animations.
   - What's unclear: Should spotlight mask still show (it's functional, not decorative) with reduced motion?
   - Recommendation: Keep spotlight visible (it's a functional focus aid) but disable entry/exit animations when reduced motion is preferred. Only skip decorative effects.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `useGameState.tsx`, `useProgression.tsx` (Zustand store patterns)
- Codebase analysis: `PhaseRenderer.tsx`, `PhaseInterstitial.tsx` (sibling overlay pattern)
- Codebase analysis: `BattleScreen.tsx` (z-index map, overlay mounting)
- Codebase analysis: `CountdownOverlay.tsx` (fixed fullscreen overlay pattern)
- Codebase analysis: `Lobby.tsx` (only R3F Canvas usage -- confirms battle screen is DOM-only)
- [Zustand persist middleware docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist) - partialize, version, migrate API

### Secondary (MEDIUM confidence)
- [Zustand v5 persist fix for state inconsistency](https://github.com/pmndrs/zustand) - v5.0.10 fix (Jan 2026)
- [React tour library comparison 2025](https://sandroroth.com/blog/evaluating-tour-libraries/) - react-joyride broken on React 19

### Tertiary (LOW confidence)
- [driver.js bundle size claim](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared) - 82.5kB claim needs verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and used in codebase; no new dependencies
- Architecture: HIGH - Sibling overlay pattern established in Phase 38; Zustand persist is well-documented
- Pitfalls: HIGH - Z-index map derived from actual codebase analysis; hydration timing is well-known Zustand persist issue
- Hint targeting: HIGH - All battle-phase elements confirmed to be DOM (not R3F), so getBoundingClientRect works directly

**Critical finding:** The known blocker "Tutorial overlay positioning on 3D/R3F elements needs prototyping (hint targets lack DOM rects)" is a **non-issue** for battle phase tutorials. R3F Canvas is only used in `Lobby.tsx` for avatar preview. All battle screen elements (BossDisplay, ScoreSubmission, PlayerHUD, AbilityBar, sidebar) are standard DOM elements with accessible bounding rects.

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable domain, no fast-moving dependencies)
