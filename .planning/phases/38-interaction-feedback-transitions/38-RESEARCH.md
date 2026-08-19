# Phase 38: Interaction Feedback & Transitions - Research

**Researched:** 2026-03-11
**Domain:** UI animation, toast notifications, JRPG-themed phase transitions
**Confidence:** HIGH

## Summary

This phase adds three categories of interaction feedback to ScrumQuest: (1) button press/spring-back animations and vote card selection glow, (2) toast notifications for key game events using the already-installed sonner library, and (3) JRPG-themed interstitial screens during phase transitions. The project already has framer-motion v11.13+ and sonner v1.7+ installed, a `<Toaster>` mounted in `App.tsx`, and an existing `PhaseTransition` component wrapping all phases with `AnimatePresence`. The existing `session:phase_changed` socket event provides the hook point for interstitial display.

The primary challenge is integrating interstitials into the existing `PhaseTransition` / `PhaseRenderer` pipeline without breaking the `AnimatePresence` exit/enter flow or causing the ErrorBoundary `resetKey` mechanism to fire prematurely. The `sonner.tsx` component currently uses a `next-themes` `useTheme()` call that may need adjustment since the app has a fixed dark JRPG theme rather than dynamic light/dark switching.

**Primary recommendation:** Use framer-motion for all animations (button springs, card glow, interstitials). Use sonner for toasts with JRPG-themed custom styling. Implement interstitials as an overlay layer managed by a new `usePhaseInterstitial` hook that intercepts `session:phase_changed` events and delays the `PhaseTransition` animation start.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| framer-motion | ^11.13.1 | Spring animations, AnimatePresence, layout animations | Already used for PhaseTransition and BattleLoadingSpinner |
| sonner | ^1.7.1 | Toast notifications | Already installed, `<Toaster>` mounted in App.tsx |
| @radix-ui/react-progress | ^1.1.8 | Cooldown progress indicator | Already installed for progress bars |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | installed | Variant-based button styles | Already used in GameButton |
| tailwindcss | installed | Utility CSS for glow/animation classes | Already used throughout |

### No New Dependencies Needed
All functionality can be implemented with the existing stack. No new packages required.

## Architecture Patterns

### Recommended File Structure
```
client/src/
├── components/
│   ├── ui/
│   │   ├── GameButton.tsx          # MODIFY: Add framer-motion spring on press
│   │   ├── sonner.tsx              # MODIFY: JRPG-themed toast styling, fix useTheme
│   │   └── CooldownIndicator.tsx   # NEW: Radial cooldown progress overlay
│   ├── game/
│   │   ├── ScoreSubmission.tsx     # MODIFY: Add glow/bounce on vote card selection
│   │   ├── AbilityButton.tsx       # MODIFY: Add confirmation flash on activation
│   │   └── phases/
│   │       ├── PhaseInterstitial.tsx    # NEW: JRPG interstitial overlay component
│   │       ├── PhaseTransition.tsx      # MODIFY: Integrate interstitial delay
│   │       └── PhaseRenderer.tsx        # MODIFY: Wire interstitial state
│   └── ...
├── lib/
│   ├── hooks/
│   │   └── usePhaseInterstitial.ts     # NEW: Hook managing interstitial display/timing
│   └── ...
```

### Pattern 1: Framer-Motion Spring Button Press
**What:** Replace CSS `transform` with framer-motion `whileTap` for spring-back feel.
**When to use:** All GameButton/RetroButton instances.
**Example:**
```typescript
// In GameButton.tsx — wrap the <button> with motion.button
import { motion } from 'framer-motion';

// Replace <button> with:
<motion.button
  ref={ref}
  className={cn(gameButtonVariants({ variant, size }), className)}
  onClick={handleClick}
  whileTap={{ scale: 0.92 }}
  whileHover={{ scale: 1.03 }}
  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
  {...props}
>
  {children}
</motion.button>
```

### Pattern 2: Vote Card Selection Glow/Bounce
**What:** When a fibonacci button is selected in ScoreSubmission, animate it with a bounce + glow effect.
**When to use:** ScoreSubmission fibonacci-button clicks.
**Example:**
```typescript
// Wrap each vote card button with motion + layoutId for smooth selection
<motion.div
  key={option}
  animate={selectedScore === option
    ? { scale: [1, 1.1, 1.05], boxShadow: '0 0 20px var(--retro-glow)' }
    : { scale: 1, boxShadow: 'none' }
  }
  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
>
  <RetroButton ... />
</motion.div>
```

### Pattern 3: Phase Interstitial Overlay
**What:** A fullscreen overlay that appears briefly between phase transitions showing JRPG text ("Encounter!", "Victory!", etc.).
**When to use:** Between `session:phase_changed` event receipt and `PhaseTransition` animation start.
**Example:**
```typescript
// PhaseInterstitial.tsx
import { AnimatePresence, motion } from 'framer-motion';

const PHASE_INTERSTITIALS: Partial<Record<GamePhase, { text: string; subtext?: string; duration: number }>> = {
  battle:      { text: 'Encounter!',          subtext: 'A boss appears...', duration: 1500 },
  scoring:     { text: 'Tallying Results...', duration: 1000 },
  reveal:      { text: 'Reveal!',             subtext: 'The scores are in!', duration: 1200 },
  victory:     { text: 'Victory!',            subtext: 'All bosses defeated!', duration: 1800 },
  next_level:  { text: 'Stage Clear!',        subtext: 'Prepare for the next battle', duration: 1500 },
  game_over:   { text: 'Game Over',           subtext: 'The quest ends here...', duration: 1500 },
};

export function PhaseInterstitial({ phase, onComplete }: { phase: GamePhase | null; onComplete: () => void }) {
  const config = phase ? PHASE_INTERSTITIALS[phase] : null;
  // ... AnimatePresence with fade-in text, auto-dismiss via setTimeout
}
```

### Pattern 4: Toast Notifications with JRPG Theme
**What:** sonner `toast()` calls with custom JRPG styling for game events.
**When to use:** Score submitted, reconnected, settings saved, ability used.
**Example:**
```typescript
import { toast } from 'sonner';

// Score submitted
toast.success('Estimate Submitted!', {
  description: `You voted ${score} story points`,
  className: 'jrpg-toast',
  duration: 2000,
});

// Ability used
toast('Ability Activated!', {
  description: `${abilityName} is now in effect`,
  icon: '⚔️',
  className: 'jrpg-toast',
  duration: 2500,
});
```

### Anti-Patterns to Avoid
- **Animating inside PhaseTransition's AnimatePresence key change:** The interstitial must be a separate overlay, NOT inside the keyed `motion.div`. Changing the key triggers exit animation immediately.
- **Blocking phase state updates for interstitial:** The lobby state should update immediately in Zustand. The interstitial is purely visual overlay that auto-dismisses.
- **Using CSS animations for button press:** The existing `.retro-button:active { transform: translateY(0px) }` is CSS-only. Framer-motion springs feel much better and are already in the project.
- **Custom toast implementation:** Do not hand-roll a toast system. Sonner is already installed and mounted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom toast component with portal/state | `sonner` `toast()` API | Already installed, mounted in App.tsx, handles stacking/dismiss/animation |
| Button press animation | CSS keyframes or manual requestAnimationFrame | framer-motion `whileTap` | Spring physics, reduced-motion support built-in |
| Cooldown progress ring | Custom SVG animation loop | CSS `conic-gradient` (already in AbilityButton) | Already implemented, just needs confirmation flash added |
| Phase transition timing | Manual setTimeout chains | framer-motion `onAnimationComplete` callbacks | Integrates with existing AnimatePresence flow |

**Key insight:** The project already has all the animation infrastructure. This phase is about applying patterns consistently, not building new systems.

## Common Pitfalls

### Pitfall 1: sonner.tsx useTheme() Returns "system" on a Dark-Only App
**What goes wrong:** The `sonner.tsx` wrapper uses `next-themes` `useTheme()` which defaults to "system". If the system is in light mode, toasts render with light background against the dark JRPG UI.
**Why it happens:** The shadcn/ui sonner component was generated for a generic app with theme switching. ScrumQuest is always dark.
**How to avoid:** Hardcode `theme="dark"` on the `<Sonner>` component in `sonner.tsx`, or add JRPG-specific class overrides. Remove the `next-themes` dependency from this file.
**Warning signs:** Toasts appearing with white background.

### Pitfall 2: Interstitial Blocking Game State
**What goes wrong:** If interstitial delays the actual phase state update in Zustand, other components (ErrorBoundary resetKey, AbilityBar phase check, etc.) will be out of sync.
**Why it happens:** Temptation to queue the state update behind the interstitial animation.
**How to avoid:** Update game state immediately. Interstitial is a purely visual overlay that reads the phase transition from a separate `usePhaseInterstitial` store/hook, not from the game state.
**Warning signs:** ErrorBoundary resetting during interstitial, abilities still active during scoring phase interstitial.

### Pitfall 3: AnimatePresence mode="wait" Conflict with Interstitial
**What goes wrong:** `PhaseTransition` uses `AnimatePresence mode="wait"`. If you try to show both the interstitial AND the new phase simultaneously, mode="wait" blocks the new child until the old exits.
**Why it happens:** The interstitial overlay must be outside the `AnimatePresence` that manages phase content.
**How to avoid:** Render `PhaseInterstitial` as a sibling/portal, not inside the `PhaseTransition` `AnimatePresence`. Use a separate `AnimatePresence` for the interstitial overlay.
**Warning signs:** Phase content disappearing behind interstitial, or interstitial never showing.

### Pitfall 4: Reduced Motion Not Respected
**What goes wrong:** Users with `prefers-reduced-motion: reduce` still see animations.
**Why it happens:** framer-motion's `useReducedMotion` is already used in `PhaseTransition` but not applied to new animations.
**How to avoid:** Check `useReducedMotion()` in all new animation components. Set duration to 0 and skip interstitials for reduced-motion users.
**Warning signs:** Accessibility audit failure.

### Pitfall 5: Vote Card Glow Persisting After Phase Change
**What goes wrong:** The glow animation on the selected fibonacci button stays when the battle phase re-renders for a new ticket.
**Why it happens:** `selectedScore` state resets via `useEffect` on `currentPlayer.hasSubmittedScore`, but animation state may not sync.
**How to avoid:** Key the motion wrapper on `currentTicket.id` so it remounts on ticket change.
**Warning signs:** Old vote card still glowing after new ticket loads.

### Pitfall 6: Toast Spam During Rapid Phase Changes
**What goes wrong:** Multiple toasts stack up if phases change rapidly (e.g., force-reveal immediately followed by scoring).
**Why it happens:** Each event independently fires a toast.
**How to avoid:** Use sonner's `toast.dismiss()` or unique toast IDs to replace rather than stack. Give phase-related toasts a shared ID.
**Warning signs:** 4-5 toasts stacked in corner after rapid game progression.

## Code Examples

### GameButton with Spring Animation
```typescript
// GameButton.tsx modification
import { motion } from 'framer-motion';

export const GameButton = React.forwardRef<HTMLButtonElement, GameButtonProps>(
  ({ className, variant, size, playSound = true, onClick, children, disabled, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (playSound) {
        useAudio.getState().playButtonSelect();
      }
      onClick?.(e);
    };

    return (
      <motion.button
        ref={ref}
        className={cn(gameButtonVariants({ variant, size }), className)}
        onClick={handleClick}
        whileTap={disabled ? undefined : { scale: 0.92 }}
        whileHover={disabled ? undefined : { scale: 1.03 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        disabled={disabled}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);
```

### JRPG-Themed Sonner Configuration
```typescript
// sonner.tsx — simplified for dark JRPG theme
import { Toaster as Sonner } from "sonner";

const Toaster = ({ ...props }: React.ComponentProps<typeof Sonner>) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-gray-900/95 border-2 border-retro-border text-retro-text font-jrpg shadow-lg shadow-retro-glow/20",
          description: "text-gray-400 font-jrpg text-xs",
          actionButton: "bg-retro-accent text-white font-jrpg",
          cancelButton: "bg-gray-700 text-gray-300 font-jrpg",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
```

### usePhaseInterstitial Hook
```typescript
// usePhaseInterstitial.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { GamePhase } from '@shared/gameEvents';

const INTERSTITIAL_CONFIG: Partial<Record<GamePhase, { text: string; subtext?: string; duration: number }>> = {
  battle:     { text: 'Encounter!',          subtext: 'A boss appears...',          duration: 1500 },
  scoring:    { text: 'Tallying Results...', duration: 1000 },
  reveal:     { text: 'Reveal!',             subtext: 'The scores are in!',         duration: 1200 },
  victory:    { text: 'Victory!',            subtext: 'All bosses defeated!',       duration: 1800 },
  next_level: { text: 'Stage Clear!',        subtext: 'Prepare for the next battle', duration: 1500 },
  game_over:  { text: 'Game Over',           subtext: 'The quest ends here...',     duration: 1500 },
};

export function usePhaseInterstitial() {
  const [activeInterstitial, setActiveInterstitial] = useState<{
    phase: GamePhase;
    text: string;
    subtext?: string;
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const triggerInterstitial = useCallback((newPhase: GamePhase) => {
    const config = INTERSTITIAL_CONFIG[newPhase];
    if (!config) return; // No interstitial for lobby, avatar_selection, discussion

    setActiveInterstitial({ phase: newPhase, text: config.text, subtext: config.subtext });

    timeoutRef.current = setTimeout(() => {
      setActiveInterstitial(null);
    }, config.duration);
  }, []);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveInterstitial(null);
  }, []);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return { activeInterstitial, triggerInterstitial, dismiss };
}
```

### Ability Confirmation Flash
```typescript
// In AbilityButton.tsx — add flash on activation
const [justActivated, setJustActivated] = useState(false);

const handleClick = () => {
  if (!isUnlocked || isCooling || disabled) return;
  onActivate(ability.id);
  setJustActivated(true);
  setTimeout(() => setJustActivated(false), 300);
};

// In the button JSX, add flash overlay:
{justActivated && (
  <motion.div
    className="absolute inset-0 rounded-lg bg-white/40 pointer-events-none"
    initial={{ opacity: 1 }}
    animate={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
  />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS `:active` transform | framer-motion `whileTap` with spring | Project has both; standardize on framer-motion | Consistent spring feel across all buttons |
| No toast notifications | sonner already installed but underused | sonner mounted in App.tsx, only used in GamePage/useWebSocket | Expand usage to all game events |
| Instant phase swap | PhaseTransition with AnimatePresence | Already implemented | Add interstitial overlay before the swap |

**Current state of existing animations:**
- `retro-button:active` — CSS translateY(0) (no spring)
- `retro-button:hover` — CSS translateY(-2px) + glow
- `AbilityButton` — Tailwind `active:scale-95 hover:scale-105` + CSS transition
- `PhaseTransition` — framer-motion fade + slide (opacity/y/scale)
- `LevelUpCelebration` — Pure CSS keyframes (particles, flash, text)
- `BattleLoadingSpinner` — framer-motion rotate
- `TierUpToast` — CSS opacity/translate transition

## Integration Points

### Where Toasts Should Fire
| Event | Toast Type | Trigger Location |
|-------|-----------|------------------|
| Score submitted | `toast.success` | `ScoreSubmission.handleScoreSubmit()` |
| Reconnected to lobby | `toast.info` | Already exists in `GamePage.tsx` (line 132) |
| Settings saved | `toast.success` | Lobby settings save handler |
| Ability used | `toast()` with icon | `useAbilities` store `ability:used` handler |
| Ability on cooldown (blocked) | `toast.warning` | `AbilityButton.handleClick()` when `isCooling` |

### Where Interstitials Display
| Phase Transition | Interstitial Text | Trigger |
|-----------------|-------------------|---------|
| any -> battle | "Encounter!" | `session:phase_changed` with `newPhase === 'battle'` |
| battle -> scoring | "Tallying Results..." | `session:phase_changed` with `newPhase === 'scoring'` |
| scoring -> reveal | "Reveal!" | `session:phase_changed` with `newPhase === 'reveal'` |
| any -> victory | "Victory!" | `session:phase_changed` with `newPhase === 'victory'` |
| any -> next_level | "Stage Clear!" | `session:phase_changed` with `newPhase === 'next_level'` |
| any -> game_over | "Game Over" | `session:phase_changed` with `newPhase === 'game_over'` |
| any -> lobby | None | No interstitial |
| any -> avatar_selection | None | No interstitial |
| any -> discussion | None | No interstitial |

## Open Questions

1. **Should interstitials be skippable?**
   - What we know: `LevelUpCelebration` is skippable via click/ESC. Interstitials are much shorter (1-1.8s).
   - Recommendation: Make them auto-dismiss only (too short to need skip), but clicking should dismiss early for impatient users.

2. **Should vote card selection play a sound?**
   - What we know: `GameButton` already plays `buttonSelect` sound. Vote cards use `RetroButton` which inherits `GameButton`.
   - Recommendation: The existing sound is sufficient. Add a distinct "confirm" sound only on the Submit action, not card selection.

3. **Sonner position: bottom-right conflicts with TierUpToast and AbilityBar**
   - What we know: `TierUpToast` renders at `fixed bottom-4 right-4 z-50`. AbilityBar is at `fixed bottom-20 right-4 z-40`.
   - Recommendation: Position sonner toasts at `top-right` to avoid overlap. Use `position="top-right"` on the `<Sonner>` component.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `GameButton.tsx`, `retro-button.tsx`, `ScoreSubmission.tsx`, `AbilityButton.tsx`, `AbilityBar.tsx`
- Codebase analysis: `PhaseTransition.tsx`, `PhaseRenderer.tsx`, `PhaseContainer.tsx`
- Codebase analysis: `App.tsx` (Toaster mount), `sonner.tsx` (current config)
- Codebase analysis: `eventHandlers.ts` (session:phase_changed handler)
- Codebase analysis: `retro.css` (existing button CSS)
- Codebase analysis: `LevelUpCelebration.tsx` (existing fullscreen overlay pattern)
- Codebase analysis: `TierUpToast.tsx` (existing toast-like notification pattern)
- `package.json`: framer-motion ^11.13.1, sonner ^1.7.1 confirmed installed

### Secondary (MEDIUM confidence)
- framer-motion whileTap/spring API — well-known stable API since v4+
- sonner toast API with custom classNames — stable API, verified in codebase usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, verified in package.json
- Architecture: HIGH - integration points clearly identified from codebase analysis
- Pitfalls: HIGH - derived from actual code analysis of existing components
- Code examples: HIGH - based on existing patterns in the codebase

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable domain, no fast-moving dependencies)
