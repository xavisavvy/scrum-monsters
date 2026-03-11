# Feature Landscape: Onboarding, Tutorials, and UX Polish

**Domain:** Browser-based multiplayer game (gamified scrum poker) -- onboarding and UX polish layer
**Researched:** 2026-03-11
**Confidence:** HIGH (patterns well-established, verified against existing codebase)

## Context: What Already Exists

Before mapping features, it is critical to note what ScrumQuest already has:

| Existing Feature | Relevance to This Milestone |
|---|---|
| ErrorBoundary | Minimal -- auto-recovers DOM errors, shows empty div fallback. No user-friendly messaging. |
| ReconnectionDialog + ReconnectionStatus | Solid reconnection UX with retry, countdown, troubleshooting. Keep as-is. |
| ConnectionIndicator | Status badge in bottom-right. Functional. |
| PhaseTransition (Framer Motion) | AnimatePresence with enter/exit animations. Good foundation for polish. |
| Skeleton component (shadcn) | Exists but unused. Ready to deploy for loading states. |
| Tooltip component (Radix) | Exists but unused in game context. Foundation for hint system. |
| Sonner toaster | Installed but zero `toast()` calls in codebase. Ready for feedback notifications. |
| RetroButton, retro-card | Themed UI primitives. Tutorial UI should use these. |
| RotateDeviceOverlay | Handles orientation. Shows awareness of device context. |

**Key insight:** The codebase has infrastructure for tooltips, skeletons, and toasts already installed but not wired up. This milestone is largely about *using* what exists plus building the tutorial layer on top.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or hostile to new players.

### 1. First-Time Tutorial / Guided Walkthrough

| Aspect | Detail |
|---|---|
| **Why Expected** | ScrumQuest has 8 game phases, 5 boss AIs, 20 class abilities, items, combos, team mechanics. A new player joining a lobby has zero context for what any of this means. Without guidance, they will stare at the screen, feel lost, and leave. |
| **Complexity** | Medium |
| **What to Build** | Step-by-step overlay walkthrough triggered on first visit. Highlight key UI elements (vote cards, boss HP, ability bar, XP bar) with spotlight + tooltip. 5-8 steps max, skippable, dismissable, remembers completion in localStorage. |
| **Pattern** | "Learn by spotlighting" -- dark overlay with cutout around target element, tooltip explaining what it does and why. NOT a separate tutorial mode or practice battle. |
| **Anti-pattern** | Do NOT build a separate tutorial level/sandbox. This is an estimation tool, not a AAA game. The real game IS the tutorial -- just annotate it. |
| **Dependencies** | Existing Radix Tooltip component. Needs a TutorialProvider wrapper and step definitions per phase. |
| **Notes** | Tutorial should be phase-aware: lobby tutorial on first lobby visit, battle tutorial on first battle, etc. Not one monolithic walkthrough. |

### 2. Contextual Hints / First-Encounter Tooltips

| Aspect | Detail |
|---|---|
| **Why Expected** | Even after a tutorial, users will encounter features incrementally (first combo opportunity, first item drop, first boss telegraph). Each needs a one-time explanation. |
| **Complexity** | Low-Medium |
| **What to Build** | "Hint" system that shows a styled tooltip the first time a user encounters a specific game event. Examples: first ability unlock, first boss telegraph warning, first combo opportunity, first spectator minion appearance. Dismissed by clicking, never shown again (localStorage). |
| **Pattern** | Pulsing indicator on the element + popover with 1-2 sentence explanation and "Got it" button. NOT hover tooltips (mobile users cannot hover). |
| **Dependencies** | Existing Radix Tooltip/Popover. Needs a hint registry and localStorage persistence layer. |
| **Notes** | Keep hint count under 15 total across all phases. Each hint should be 1-2 sentences maximum. Respect the JRPG aesthetic -- hints should feel like NPC dialogue boxes, not corporate onboarding. |

### 3. Loading States for Async Operations

| Aspect | Detail |
|---|---|
| **Why Expected** | Multiple moments where data is loading with no feedback: joining a lobby, boss spawning ("Preparing Battle..." is a plain div), WebSocket connection establishing, avatar/sprite loading. Users see blank screens or stale UI. |
| **Complexity** | Low |
| **What to Build** | Skeleton screens for lobby player list (using existing Skeleton component). Themed loading spinner for battle preparation. Connection establishing state before lobby loads. Sprite/asset preloading indicator. |
| **Pattern** | Use skeleton screens for layout-known content (player cards, scoreboard). Use themed spinner for unknown-layout content (initial connection). Use progress bar for deterministic loads (asset preloading if applicable). |
| **Dependencies** | Existing Skeleton component (shadcn). Existing PhaseTransition animations. |
| **Notes** | The BattlePhase already has a "Preparing Battle..." fallback when boss is null -- this should become a proper themed loading state with the boss silhouette or a JRPG-style "Encounter!" animation. |

### 4. Error States with Recovery Actions

| Aspect | Detail |
|---|---|
| **Why Expected** | Current ErrorBoundary shows an empty div on crash. No user messaging, no recovery path. If the game crashes mid-battle, the user sees nothing and must refresh manually. |
| **Complexity** | Low-Medium |
| **What to Build** | Themed error fallback UI for ErrorBoundary (JRPG "Game Over" style with retry button). Granular error boundaries per phase (battle crash should not kill lobby sidebar). Network error states distinct from app crashes. Form validation errors for lobby creation/join. |
| **Pattern** | Wrap each major section (battle area, sidebar, HUD) in its own ErrorBoundary with a themed fallback. "Something went wrong" with a "Try Again" button that resets the boundary. Use react-error-boundary library for resetKeys support. |
| **Dependencies** | Existing ErrorBoundary (needs upgrade). Existing ReconnectionDialog (already handles network errors well). |
| **Notes** | The current ErrorBoundary silently recovers DOM errors in 10ms -- keep this behavior for transient DOM errors but add visible fallback for persistent errors. |

### 5. Empty States

| Aspect | Detail |
|---|---|
| **Why Expected** | Several screens have empty states with no guidance: empty lobby (no players yet), no tickets loaded, no completed tickets in history, no abilities unlocked yet. Users see blank areas with no indication of what should be there. |
| **Complexity** | Low |
| **What to Build** | Themed empty state illustrations/messages for: empty player list ("Waiting for adventurers..."), no tickets ("No quests assigned yet"), empty scoreboard, no abilities yet ("Level up to unlock abilities"). Each with a CTA where applicable (e.g., "Share lobby link" for empty player list). |
| **Pattern** | JRPG-themed messaging with a simple icon/illustration, 1 sentence explanation, and action button if applicable. Use existing retro-card styling. |
| **Dependencies** | None beyond existing UI primitives. |
| **Notes** | Empty states are the easiest wins in this milestone. Low effort, high polish impact. |

### 6. Interaction Feedback (Micro-interactions)

| Aspect | Detail |
|---|---|
| **Why Expected** | Users need confirmation that their actions registered, especially in real-time multiplayer where latency exists. Clicking vote cards, using abilities, submitting estimates -- all need immediate visual + optional audio feedback. |
| **Complexity** | Low-Medium |
| **What to Build** | Button press animations (scale down on click, spring back). Vote card selection animation (flip, glow, or bounce). Ability use confirmation (brief flash + cooldown indicator). Score submission success feedback (checkmark animation or toast). Toast notifications for key events using Sonner (already installed, zero usage). |
| **Pattern** | Framer Motion for element animations (already in project). Sonner toast for success/error messages. CSS transitions for hover/active states on interactive elements. Keep animations under 300ms for responsiveness. |
| **Dependencies** | Existing Framer Motion. Existing Sonner (unused). Existing useGameSounds hook. |
| **Notes** | Respect prefers-reduced-motion (PhaseTransition already does this -- extend pattern to all animations). |

---

## Differentiators

Features that set the product apart. Not expected, but would make ScrumQuest feel polished and memorable.

### 7. JRPG-Themed Tutorial Narrator

| Aspect | Detail |
|---|---|
| **Value Proposition** | Instead of generic tooltips, tutorial hints appear as dialogue from a JRPG guide character (guild master, quest giver). Reinforces the game fantasy and makes onboarding feel like part of the experience rather than an interruption. |
| **Complexity** | Medium |
| **What to Build** | Dialogue box component styled like a JRPG text box (portrait, name, typewriter text effect). 3-4 character "voices" for different contexts (Guild Master for lobby, Battle Advisor for combat, Sage for scoring/discussion). Reusable for both tutorial steps and contextual hints. |
| **Dependencies** | Tutorial system (Feature 1). Existing retro-card styling. |
| **Notes** | This is the single differentiator worth prioritizing. It turns a chore (reading tutorial text) into part of the game experience. Other scrum poker tools have zero personality in their onboarding. |

### 8. Progressive Complexity Revelation

| Aspect | Detail |
|---|---|
| **Value Proposition** | Hide advanced features (combos, items, class mastery) until the player has completed a few rounds. Reduces cognitive load for new players while giving veterans depth to discover. |
| **Complexity** | Medium |
| **What to Build** | Feature gate system that tracks rounds completed (localStorage or player level). Show simplified battle UI for rounds 1-2 (just vote cards + boss). Unlock ability bar visibility at round 3+. Unlock combo hints at round 5+. Unlock item bar when first item drops. |
| **Dependencies** | Existing progression system (useProgression store, player level). Needs a feature-visibility store. |
| **Notes** | This is powerful but risky -- hiding features can frustrate returning players who expect to see everything. Must include a "Show all features" toggle or respect player level (level 3+ sees everything). |

### 9. Animated Phase Transitions with Context

| Aspect | Detail |
|---|---|
| **Value Proposition** | Current phase transitions are functional fade/slide animations. Adding JRPG-style transition screens ("A Wild Bug Appears!", "Victory!", "The team discusses strategy...") between phases makes the game feel alive and gives context for what is happening. |
| **Complexity** | Medium |
| **What to Build** | Interstitial screens during phase transitions (1-2 second duration). Battle start: "Encounter!" screen with boss silhouette. Victory: celebration animation (existing TeamCelebration, LevelUpCelebration). Scoring: "Tallying the results..." with dice/scroll animation. |
| **Dependencies** | Existing PhaseTransition component. Existing Framer Motion. |
| **Notes** | Keep transitions SHORT (1-1.5 seconds max). Long transitions in a work tool are annoying. The user is here to estimate tickets, not watch cutscenes. Add a "Skip" option or respect reduced motion. |

### 10. Keyboard Shortcut Hints

| Aspect | Detail |
|---|---|
| **Value Proposition** | Power users can vote faster with keyboard shortcuts. Showing shortcut hints on interactive elements rewards exploration and speeds up workflow for repeat users. |
| **Complexity** | Low |
| **What to Build** | Small keyboard shortcut badges on vote cards (1-8 for Fibonacci), ability buttons (Q/W/E/R), and common actions. Show on hover (desktop) or in a help overlay (mobile). Quick-reference card accessible from a "?" button. |
| **Dependencies** | Keyboard event handlers (may need to be added if not present). |
| **Notes** | Only show shortcut hints after first session or if user has completed tutorial. Avoid visual clutter for new players. |

---

## Anti-Features

Features to explicitly NOT build. Tempting but wrong for this product.

### Separate Tutorial Mode / Practice Battle

| Why Avoid | A practice mode requires maintaining a parallel game state, mock boss, mock players. Enormous effort for a feature most users would skip. The real game with real teammates IS the best tutorial environment. |
| What to Do Instead | Annotate the real game with contextual hints. First-time players learn by doing with guidance overlays, not by practicing alone. |

### Video Tutorial / Walkthrough Recording

| Why Avoid | Expensive to produce, goes stale immediately when UI changes, users skip videos. |
| What to Do Instead | Interactive in-app walkthrough that always matches current UI because it IS the UI. |

### Onboarding Quiz / Knowledge Check

| Why Avoid | This is a work tool used during sprint planning. Nobody wants to pass a quiz before estimating a ticket. Patronizing. |
| What to Do Instead | Assume competent adults. Provide hints they can dismiss. |

### Mandatory Tutorial (Unskippable)

| Why Avoid | Returning players, players who learn by doing, players in a hurry -- all will resent forced tutorials. Mandatory onboarding is the #1 complaint in game UX research. |
| What to Do Instead | Always skippable. Always dismissable. "Skip tutorial" button prominent and guilt-free. Can be re-triggered from settings/help menu. |

### Animated Mascot That Follows You Around

| Why Avoid | Clippy syndrome. A persistent animated character is distracting during actual estimation work. |
| What to Do Instead | JRPG dialogue boxes that appear at specific moments and disappear completely when dismissed. Character shows up only during tutorial/hint moments, not as a persistent presence. |

### Complex Achievement Notification System

| Why Avoid | The progression system (XP, levels, mastery) already has celebration animations. Adding a separate achievement toast system creates notification fatigue. |
| What to Do Instead | Use existing LevelUpCelebration, TierUpToast, FloatingXP. Add Sonner toasts only for non-progression events (reconnected, settings saved, etc). |

---

## Feature Dependencies

```
Empty States (5) ──────────────────────> [no dependencies, start here]
Loading States (3) ────────────────────> [depends on: existing Skeleton component]
Interaction Feedback (6) ──────────────> [depends on: existing Framer Motion, Sonner]
Error States (4) ──────────────────────> [depends on: existing ErrorBoundary upgrade]
Contextual Hints (2) ─────────────────> [depends on: hint registry + localStorage layer]
Tutorial Walkthrough (1) ─────────────> [depends on: hint registry, tutorial provider]
JRPG Narrator (7) ────────────────────> [depends on: Tutorial Walkthrough (1)]
Progressive Complexity (8) ───────────> [depends on: feature-visibility store, progression system]
Phase Transition Polish (9) ──────────> [depends on: existing PhaseTransition]
Keyboard Shortcuts (10) ──────────────> [depends on: Tutorial Walkthrough (1) for hint display]
```

**Critical path:** Empty States -> Loading States -> Interaction Feedback -> Error States -> Hint System -> Tutorial -> JRPG Narrator

---

## MVP Recommendation

**Prioritize (Phase 1 -- immediate impact, low risk):**

1. **Empty States** (Feature 5) -- Lowest effort, highest polish-per-hour. Fill every blank screen with themed messaging and CTAs. Half-day of work for significant perceived quality improvement.
2. **Loading States** (Feature 3) -- Wire up the existing Skeleton component. Add themed spinners. Replace "Preparing Battle..." with proper loading UI. Another half-day.
3. **Interaction Feedback** (Feature 6) -- Wire up Sonner for toast notifications. Add button press animations. Vote card selection feedback. 1-2 days.
4. **Error States** (Feature 4) -- Upgrade ErrorBoundary with themed fallback UI. Add granular boundaries per phase. 1 day.

**Prioritize (Phase 2 -- tutorial layer):**

5. **Hint System Infrastructure** (Feature 2) -- Build the hint registry, localStorage persistence, and styled hint popover component. This is the foundation for both contextual hints and the tutorial. 1-2 days.
6. **Tutorial Walkthrough** (Feature 1) -- Phase-aware step-by-step walkthrough using hint infrastructure. Define steps for lobby, avatar selection, and battle phases. 2-3 days.
7. **JRPG Narrator** (Feature 7) -- Restyle tutorial/hint popovers as JRPG dialogue boxes. Add typewriter text effect. 1 day (if tutorial infrastructure is solid).

**Defer:**

- **Progressive Complexity** (Feature 8): High risk of frustrating returning players. Needs careful design and a "show everything" escape hatch. Consider for a future milestone after observing how new players actually struggle.
- **Animated Phase Transitions** (Feature 9): Nice-to-have polish. Can be added incrementally to individual phases without blocking anything.
- **Keyboard Shortcuts** (Feature 10): Power user feature. Add after core onboarding is solid.

---

## Sources

- [Game UX: Best Practices for Video Game Onboarding (Inworld)](https://inworld.ai/blog/game-ux-best-practices-for-video-game-onboarding) -- MEDIUM confidence, aligns with multiple sources
- [6 Takeaways from Video Game Onboarding for UX (UserGuiding)](https://userguiding.com/blog/video-game-onboarding) -- MEDIUM confidence
- [5 Proven Game Onboarding Techniques (Acagamic)](https://acagamic.com/newsletter/2023/04/04/dont-spook-the-newbies-unveiling-5-proven-game-onboarding-techniques/) -- MEDIUM confidence
- [Top 8 UX Patterns for Contextual Help (Chameleon)](https://www.chameleon.io/blog/contextual-help-ux) -- MEDIUM confidence
- [Tooltip Guidelines (NN/g)](https://www.nngroup.com/articles/tooltip-guidelines/) -- HIGH confidence (authoritative UX research)
- [Skeleton Screens 101 (NN/g)](https://www.nngroup.com/articles/skeleton-screens/) -- HIGH confidence
- [Skeleton Loading Screen Design (LogRocket)](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/) -- MEDIUM confidence
- [Empty State UX Best Practices (UXPin)](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/) -- MEDIUM confidence
- [Microinteractions in UX (NN/g)](https://www.nngroup.com/articles/microinteractions/) -- HIGH confidence
- [React Error Boundary (react-error-boundary GitHub)](https://github.com/bvaughn/react-error-boundary) -- HIGH confidence
- [React UI Walkthrough (GitHub)](https://github.com/gagop/react-ui-walkthrough) -- MEDIUM confidence, reference implementation
- Codebase analysis of existing components (ErrorBoundary, Skeleton, Tooltip, Sonner, PhaseTransition, ReconnectionDialog) -- HIGH confidence, direct code review
