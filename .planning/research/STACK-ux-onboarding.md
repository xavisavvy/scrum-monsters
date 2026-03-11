# Technology Stack: UX Onboarding, Tutorials, and Polish

**Project:** ScrumQuest
**Researched:** 2026-03-11

## Core Recommendation: Build Custom on Existing Primitives

The project already has every building block needed for tutorials, hints, loading states, error states, and interaction feedback. **No new runtime dependencies are recommended.** The JRPG theme is too specific for generic tour libraries (react-joyride, driver.js) to look right without extensive restyling that negates their value.

## What Already Exists (Do NOT Add)

| Capability | Already Have | Used For |
|------------|-------------|----------|
| Overlay/spotlight | `@radix-ui/react-dialog` + CSS backdrop | Tutorial spotlight overlays |
| Positioned hints | `@radix-ui/react-popover`, `@radix-ui/react-tooltip` | Contextual hint popovers |
| Skeleton loading | `Skeleton` component (shadcn) | Loading placeholder shapes |
| Toast notifications | `sonner` (installed), custom `TierUpToast` | Feedback messages |
| Animations | `framer-motion` ^11.13.1 | Enter/exit/transition animations |
| Phase transitions | `PhaseTransition` (AnimatePresence) | Already handles phase enter/exit |
| State management | `zustand` ^5.0.11 | Tutorial progress, hint state |
| Local persistence | `localStorage` utilities (6+ existing utils) | Remembering tutorial completion |
| Error boundary | `ErrorBoundary` component | Crash recovery (needs polish) |
| Design tokens | `tokens.css` with `--jrpg-*` prefix | Themed tutorial UI |
| CVA variants | `GamePanel`, `GameButton`, `StatBar`, `HealthBar` | Consistent JRPG-styled components |
| Icons | `lucide-react` ^0.563.0 | Hint icons, state indicators |

## Recommended Stack (Zero New Dependencies)

### Tutorial System
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand store | existing ^5.0.11 | `useTutorial` store for step tracking, completion state | Already used for all game state; adding another slice is trivial |
| Radix Popover | existing ^1.1.15 | Positioned tutorial callouts anchored to UI elements | Already installed, handles positioning/collision, accessible |
| Radix Dialog | existing ^1.1.2 | Full-screen tutorial overlays, modal tutorial steps | Already used for dialogs; overlay + portal built in |
| Framer Motion | existing ^11.13.1 | Step transitions, spotlight pulse, entrance animations | Already animating phase transitions; extend to tutorial steps |
| localStorage | browser API | Persist which tutorials user has completed | Pattern already established in 6+ storage utilities |
| CSS custom properties | existing tokens.css | `--jrpg-tutorial-*` tokens for spotlight/callout theming | Extend existing JRPG token layer |

### Contextual Hints
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Radix Tooltip | existing ^1.2.8 | Hover hints for game controls, buttons, HUD elements | Already wrapped as shadcn `Tooltip` component |
| Radix Popover | existing ^1.1.15 | Richer contextual hints with dismiss action | Better than tooltip when hint has a CTA or multi-line content |
| Zustand store | existing | `useHints` store tracking dismissed/seen hints per user | Consistent with existing state patterns |

### Loading/Transition States
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Skeleton component | existing (shadcn) | Content placeholder shapes during load | Already exists at `ui/skeleton.tsx`; just needs JRPG-themed variants |
| Framer Motion | existing | Shimmer animation, smooth skeleton-to-content transition | `AnimatePresence` + `motion.div` for fade between skeleton and real content |
| CSS `@keyframes` | native | JRPG-themed shimmer gradient animation | Lighter than JS animation for repeating shimmer; extend `tokens.css` |

### Error/Empty States
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ErrorBoundary | existing (custom) | Crash recovery with JRPG-themed fallback UI | Already exists; needs themed fallback instead of empty `<div>` |
| GamePanel + CVA | existing | Themed empty state containers ("No players yet", "No items") | Consistent with existing JRPG panel design |
| Lucide icons | existing ^0.563.0 | State illustrations (empty, error, disconnected) | Already in bundle; `AlertTriangle`, `Inbox`, `WifiOff`, etc. |

### Interaction Feedback
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Framer Motion | existing | Button press scale, success/error shake, haptic-feel animations | Micro-interactions via `whileTap`, `whileHover` on motion components |
| Sonner | existing ^1.7.1 | Success/error/info toasts for actions (vote submitted, etc.) | Already installed but underused; JRPG-theme the toast styles |
| CSS custom properties | existing | `--jrpg-feedback-success`, `--jrpg-feedback-error` color tokens | Extend token layer for consistent feedback colors |

## Alternatives Considered and Rejected

| Category | Rejected | Why Not |
|----------|----------|---------|
| Tour library | react-joyride ^2.9.3 | 635K weekly downloads but stale (no release in 12+ months). Generic styling conflicts with JRPG theme -- you'd spend more time restyling than building custom. Adds 45KB+ gzipped. React 19 incompatible (blocks future upgrade). |
| Tour library | driver.js ^1.3 | No React bindings -- requires manual ref/useEffect management. Framework-agnostic means no React lifecycle awareness. Imperative API clashes with declarative React + Zustand patterns. |
| Tour library | @reactour/tour | Smaller but still generic-styled. Overlay approach doesn't match JRPG panel aesthetic. Another dependency for something achievable with existing Radix primitives. |
| Skeleton library | react-loading-skeleton | Adds 8KB for animated skeletons. Existing `Skeleton` component + CSS shimmer keyframes achieves same result with zero bundle increase. |
| Animation library | GSAP (already installed) | Already in bundle for specific 3D effects. Overkill for UI micro-interactions where Framer Motion excels. Keep GSAP for canvas/3D, Framer for DOM. |
| Toast library | react-hot-toast | Would duplicate Sonner's functionality. Sonner is already installed and configured. |
| State library | @tanstack/react-query | Already installed but wrong tool for tutorial/UI state. React Query is for server state; Zustand is correct for client-only UI state like tutorial progress. |

## Implementation Patterns (No Install Required)

### Tutorial Spotlight via CSS + Radix Dialog

```css
/* Add to tokens.css */
--jrpg-spotlight-bg: rgba(0, 0, 0, 0.85);
--jrpg-spotlight-ring: var(--jrpg-text-accent); /* gold highlight ring */
```

Use Radix Dialog's overlay as the darkened backdrop. The "spotlighted" element gets a higher z-index + gold ring border using `--jrpg-spotlight-ring`. No canvas manipulation or SVG cutouts needed.

### Shimmer Skeleton via CSS Keyframes

```css
/* Add to tokens.css or a new skeleton-jrpg.css */
@keyframes jrpg-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.jrpg-skeleton {
  background: linear-gradient(
    90deg,
    var(--jrpg-panel-bg) 25%,
    var(--jrpg-panel-bg-raised) 50%,
    var(--jrpg-panel-bg) 75%
  );
  background-size: 200% 100%;
  animation: jrpg-shimmer 1.5s ease-in-out infinite;
}
```

### Zustand Tutorial Store Pattern

```typescript
// Pattern for useTutorial store
interface TutorialState {
  completedTutorials: Set<string>;
  activeTutorial: string | null;
  currentStep: number;
  startTutorial: (id: string) => void;
  nextStep: () => void;
  completeTutorial: (id: string) => void;
  hasSeen: (id: string) => boolean;
}
```

Persist `completedTutorials` to localStorage using the same pattern as `lobbySettingsStorage.ts`, `playerNameStorage.ts`, etc.

### Framer Motion Micro-interactions

```typescript
// Extend GameButton with interaction feedback
const tapVariants = {
  tap: { scale: 0.95 },
  hover: { scale: 1.02 },
};

// Success shake pattern
const successShake = {
  x: [0, -2, 2, -2, 0],
  transition: { duration: 0.3 }
};
```

## What This Means for Bundle Size

**Zero new dependencies = zero bundle increase.** All tutorial, hint, loading, error, and feedback features are built from existing primitives. The only additions are:

- New Zustand store slices (~1-2KB)
- New CSS tokens and keyframes (~0.5KB)
- New React components composing existing primitives (~5-10KB)

Total estimated addition: ~10-15KB unminified, well under 5KB gzipped.

## Confidence Assessment

| Decision | Confidence | Basis |
|----------|------------|-------|
| No tour library needed | HIGH | Examined react-joyride (stale, generic), driver.js (no React bindings), @reactour (generic styling). JRPG theme demands custom UI anyway. Existing Radix primitives cover positioning/overlay. |
| Zustand for tutorial state | HIGH | Consistent with 10+ existing stores in codebase. Client-only state, no server sync needed. |
| Framer Motion for feedback | HIGH | Already used for phase transitions (PhaseTransition.tsx). `whileTap`/`whileHover` are built-in. |
| CSS shimmer over JS shimmer | HIGH | Offloads to compositor thread. Framer official blog recommends CSS for repeating animations. |
| Sonner for action toasts | MEDIUM | Already installed but Sonner component references `next-themes` which this project may not fully use. May need to restyle or wrap. Existing `TierUpToast` is a custom implementation that bypasses Sonner entirely -- suggests the team prefers custom toasts for themed output. Consider using the `TierUpToast` pattern over Sonner for JRPG-consistent toasts. |

## Sources

- [react-joyride npm](https://www.npmjs.com/package/react-joyride) -- 635K weekly downloads, last published 12+ months ago, React 19 incompatible
- [react-joyride React 18 compatibility issue](https://github.com/gilbarbara/react-joyride/issues/1124)
- [driver.js evaluation](https://sandroroth.com/blog/evaluating-tour-libraries/) -- no React bindings, imperative API
- [React onboarding library comparison 2026](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared)
- [Framer Motion shimmer techniques](https://www.framer.com/blog/shimmer-effect/) -- CSS keyframes recommended for repeating patterns
- [Skeleton UI best practices](https://blog.logrocket.com/improve-react-ux-skeleton-ui/) -- match content dimensions, prevent layout shift
- Existing codebase: `tokens.css`, `PhaseTransition.tsx`, `TierUpToast.tsx`, `ErrorBoundary.tsx`, `skeleton.tsx`, 6+ localStorage utilities
