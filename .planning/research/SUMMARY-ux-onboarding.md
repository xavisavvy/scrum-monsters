# Project Research Summary

**Project:** ScrumQuest -- UX Onboarding, Tutorials, and Polish
**Domain:** Multiplayer game onboarding UX / tutorial system / UI polish layer
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

ScrumQuest needs a UX polish layer that adds first-time user guidance, contextual hints, loading/empty/error states, and interaction feedback to an already feature-rich multiplayer JRPG estimation game. The critical finding across all research is that **zero new dependencies are needed**. The codebase already contains every primitive required -- Radix tooltips/popovers/dialogs, Framer Motion animations, shadcn Skeleton components, Sonner toasts, and 6+ localStorage utilities -- all installed but largely unused for onboarding purposes. The work is about composing and wiring up what exists, not adding new libraries.

The recommended approach is to build three overlay layers that observe existing game state without modifying it: a tutorial/hint layer (new Zustand store + overlay components), a UX feedback layer (toasts, micro-animations), and a state polish layer (loading skeletons, empty states, error recovery). All three layers are read-only subscribers to `useGameState` and Socket.IO events, following the exact pattern already established by `FloatingXPManager`, `ComboNotification`, and `LevelUpCelebration`. This architecture ensures the onboarding system cannot corrupt live multiplayer state -- the single most dangerous pitfall identified in research.

The primary risks are: (1) tutorial state accidentally leaking into or conflicting with live game state via Socket.IO, causing desyncs for other players; (2) tutorial overlays blocking real-time game events in a multiplayer context where other players do not wait; and (3) AnimatePresence nesting conflicts between new hint animations and the existing phase transition system. All three are fully preventable through the proposed architecture of sibling overlay components, isolated Zustand stores, and rendering tutorial layers outside the PhaseTransition component tree.

## Key Findings

### Recommended Stack

No new runtime dependencies. All features are built from existing installed primitives. This is unusual and should be treated as a hard constraint -- adding tour libraries (react-joyride, driver.js, @reactour) was explicitly evaluated and rejected because JRPG theming would negate their value and some have React 19 compatibility issues.

**Core technologies (all existing):**
- **Zustand** (`useTutorial` store): Tutorial/hint progress tracking, isolated from game state -- consistent with 10+ existing stores
- **Radix Popover/Tooltip/Dialog**: Positioned hint callouts, tutorial spotlights, modal overlays -- already installed, accessible, collision-aware
- **Framer Motion**: Step transitions, spotlight pulse, micro-interactions via `whileTap`/`whileHover` -- already powering phase transitions
- **Sonner**: Toast notifications for action confirmations -- installed with zero usage in codebase, ready to wire up
- **shadcn Skeleton**: Loading placeholder shapes -- component exists but is unused, needs JRPG-themed variants
- **localStorage**: Tutorial completion persistence -- 6+ existing storage utility patterns to follow
- **CSS custom properties** (`tokens.css`): Extend existing 53-token JRPG design system with tutorial/feedback tokens

### Expected Features

**Must have (table stakes):**
- **First-time tutorial walkthrough** -- Phase-aware spotlight overlay, 5-8 steps per phase, skippable, localStorage-persisted. NOT a separate tutorial mode.
- **Contextual hints** -- One-time popovers for first encounters (first ability, first combo, first boss telegraph). Max 15 total, 1-2 sentences each, JRPG NPC dialogue style.
- **Loading states** -- Skeleton screens for lobby/player list, themed loading for battle prep (replace current "Preparing Battle..." plain div), connection establishing state.
- **Error states with recovery** -- Upgrade empty-div ErrorBoundary fallback to themed JRPG "Game Over" UI with retry. Granular boundaries per phase section. Preserve WebSocket connection context.
- **Empty states** -- Themed messaging for every blank screen (no players, no tickets, no abilities). Each with CTA where applicable. Lowest effort, highest polish-per-hour.
- **Interaction feedback** -- Button press animations, vote card selection feedback, Sonner toasts for key events, prefers-reduced-motion compliance throughout.

**Should have (differentiators):**
- **JRPG narrator dialogue boxes** -- Tutorial hints styled as guild master/battle advisor dialogue. Typewriter text effect. Makes onboarding part of the game experience instead of an interruption. Single highest-value differentiator.
- **Animated phase transitions with context** -- "A Wild Bug Appears!" interstitial screens. Short (1-1.5s max), skippable.
- **Keyboard shortcut hints** -- Power user feature, badges on vote cards and ability buttons.

**Defer (v2+):**
- **Progressive complexity revelation** -- Hide advanced features for new players. High risk of frustrating returning players. Needs careful design and escape hatch.
- Separate tutorial mode / practice battle (anti-feature: enormous effort, most users skip)
- Video tutorials (go stale immediately)
- Mandatory/unskippable tutorials (top complaint in game UX research)
- Persistent animated mascot (Clippy syndrome)

### Architecture Approach

Three overlay layers that subscribe to existing state stores as read-only observers, following the established pattern of overlay components like `FloatingXPManager` and `ComboNotification`. Tutorial components render as **siblings** to `PhaseRenderer` (never children), avoiding AnimatePresence nesting conflicts. A dedicated `useTutorial` Zustand store handles all tutorial/hint state, completely isolated from `useGameState` which is server-synced. Persistence uses localStorage via a `TutorialStorage` utility class matching existing patterns.

**Major components:**
1. **`useTutorial` store** (~150 LOC) -- Tutorial progress, hint visibility, step tracking, localStorage persistence. Subscribes to `useGameState` via `subscribeWithSelector`.
2. **`TutorialOverlay` + `HintBubble` + `SpotlightMask`** (~280 LOC total) -- Overlay rendering system. Portal-based, fixed positioning, separate AnimatePresence context.
3. **`LoadingSkeleton` + `EmptyState` + `ErrorRecoveryFallback`** (~240 LOC total) -- Phase-aware loading/empty/error components using CVA variants and JRPG design tokens.
4. **`useUXFeedback` hook + `FeedbackToast`** (~130 LOC total) -- Centralized feedback triggers wrapping Sonner + useGameSounds + Framer Motion.
5. **`useTutorialSync` hook** (~40 LOC) -- Socket.IO event to tutorial action bridge, matching existing useAbilitySync/useComboSync pattern.

**Existing components modified (minimal changes):**
- `GamePage.tsx` -- Add `<TutorialOverlay />` sibling (one line)
- `BattleScreen.tsx`, `Lobby.tsx`, `ScoreSubmission.tsx` -- Add `data-hint-target` attributes only
- `PhaseRenderer.tsx`, `BattlePhase.tsx` -- Swap inline loading divs for `LoadingSkeleton`
- `ErrorBoundary.tsx` -- Enhance fallback UI (no logic changes)

### Critical Pitfalls

1. **Tutorial state corrupting live multiplayer game state** -- Never emit real Socket.IO events during tutorials. Never add tutorial state to `useGameState`. Use completely isolated `useTutorial` store with its own localStorage persistence.
2. **Blocking real-time events during onboarding** -- Tutorials must be non-blocking overlays. Hints auto-dismiss on phase change. Never prevent user interaction with game controls underneath. Server-driven phase transitions happen regardless of tutorial state.
3. **AnimatePresence nesting conflicts** -- Tutorial/hint overlays must render outside the `PhaseTransition` component tree as siblings, not children. Use separate AnimatePresence context. Keep tutorial animation durations under 200ms.
4. **Tutorial content diverging from actual UI** -- Co-locate hint text with the components they describe using `<HintTarget>` wrapper pattern. Tutorial steps should reference component existence and auto-skip if target is not rendered.
5. **Loading skeleton flash from fast WebSocket updates** -- Use delayed appearance pattern (show skeleton only if data has not arrived after 200ms) to prevent single-frame flash artifacts.

## Implications for Roadmap

Based on combined research, the work breaks into 4 phases following the dependency chain identified across all research files. The critical path is: foundation infrastructure -> state polish -> tutorial system -> feedback polish.

### Phase 1: State Polish -- Loading, Empty, and Error States
**Rationale:** Zero dependencies on new infrastructure. Uses only existing components (Skeleton, ErrorBoundary, GamePanel). Highest polish-per-effort ratio. Creates the foundation of "the app handles every state gracefully" before adding tutorial complexity.
**Delivers:** Themed loading skeletons for all async states, JRPG empty state messages with CTAs for every blank screen, upgraded ErrorBoundary with themed fallback and granular per-section boundaries.
**Addresses:** Features 3 (Loading States), 4 (Error States), 5 (Empty States) from FEATURES research.
**Avoids:** Pitfall 5 (skeleton flash -- use delayed appearance), Pitfall 7 (error states swallowing Socket.IO context -- preserve WebSocket state), Pitfall 11 (empty states without guidance -- always answer "why empty" and "what to do").
**Estimated scope:** ~8-12 components/modifications, low risk.

### Phase 2: Tutorial Foundation -- Store, Hint Infrastructure, and Spotlight System
**Rationale:** Must establish the tutorial architecture (isolated store, HintBubble, SpotlightMask) before defining tutorial content. Getting the architecture wrong here triggers Pitfalls 1, 2, and 3 which are all critical-severity. This phase is architecture-heavy, content-light.
**Delivers:** `useTutorial` Zustand store, `TutorialStorage` localStorage utility, `HintBubble` and `SpotlightMask` components, `data-hint-target` attributes on key game components, hint rule evaluation engine.
**Addresses:** Feature 2 (Contextual Hints) infrastructure, Feature 1 (Tutorial) infrastructure.
**Avoids:** Pitfall 1 (tutorial state conflicts -- isolated store from day one), Pitfall 3 (AnimatePresence conflicts -- sibling rendering), Pitfall 9 (store bloat -- separate store).
**Estimated scope:** ~6-8 new files, medium risk (architecture decisions are load-bearing).

### Phase 3: Tutorial Content and JRPG Narrator
**Rationale:** With infrastructure from Phase 2 in place, this phase defines the actual tutorial sequences and hint content per phase. The JRPG narrator differentiator layers on top of the hint system with a dialogue box component. Grouping content definition with the narrator avoids the common mistake of building a generic tutorial first and restyling it later.
**Delivers:** Phase-aware tutorial step definitions (lobby, avatar selection, battle), contextual hint content for first encounters, JRPG narrator dialogue box component with typewriter effect, `TutorialOverlay` orchestrator mounted in GamePage.
**Addresses:** Feature 1 (Tutorial Walkthrough), Feature 2 (Contextual Hints) content, Feature 7 (JRPG Narrator differentiator).
**Avoids:** Pitfall 4 (tutorial content diverging -- co-locate hints with components), Pitfall 6 (hint fatigue -- max 1-2 hints per phase, priority system), Pitfall 2 (blocking events -- auto-dismiss on phase change).
**Estimated scope:** ~5-7 files, medium risk (content quality matters, mobile positioning needs testing).

### Phase 4: Interaction Feedback and Final Polish
**Rationale:** Micro-interactions and toasts are the finishing layer that makes everything feel responsive. Depends on all prior phases being stable -- adding feedback animations to a broken tutorial or missing loading states would mask real issues.
**Delivers:** `useUXFeedback` hook, JRPG-styled Sonner toast wrapper, button press/vote card/ability use animations, prefers-reduced-motion compliance across all new animations, keyboard shortcut hints for power users.
**Addresses:** Feature 6 (Interaction Feedback), Feature 9 (Animated Phase Transitions), Feature 10 (Keyboard Shortcuts).
**Avoids:** Pitfall 10 (breaking prefers-reduced-motion -- use shared `useAnimationDuration` utility), Pitfall 12 (sound feedback without volume control -- extend useGameSounds categories), Pitfall 8 (mobile overlay blocking D-pad -- pointer-events management).
**Estimated scope:** ~4-6 files, low risk (additive polish, no architectural decisions).

### Phase Ordering Rationale

- **State polish first** because it has zero dependencies and provides immediate visible improvement. Every user benefits from loading/empty/error states, not just new users.
- **Tutorial foundation second** because architectural decisions (isolated store, sibling rendering, hint targeting) must be validated before content is written on top of them. Getting Phase 2 wrong is the primary risk in this entire milestone.
- **Tutorial content + narrator together** because the JRPG dialogue box should be the tutorial delivery mechanism from the start, not a retrofit. Building generic tutorials then restyling them as JRPG dialogue wastes effort.
- **Feedback polish last** because it is purely additive and independent of tutorial correctness. It can also be partially delivered in earlier phases as quick wins without formal phase dependency.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Tutorial Foundation):** Architecture decisions are critical and load-bearing. The interaction between `useTutorial` subscriptions to `useGameState`, hint target resolution via `data-hint-target` attributes, and the SpotlightMask positioning system should be prototyped and validated. Research the exact behavior of Radix Popover collision detection with the existing game layout.
- **Phase 3 (Tutorial Content):** Mobile hint positioning needs device testing. The interaction between tutorial overlays and the virtual D-pad (Pitfall 8) requires hands-on validation on actual mobile viewports.

Phases with standard patterns (skip research-phase):
- **Phase 1 (State Polish):** Loading skeletons, empty states, and error boundaries are thoroughly documented patterns. The codebase already has the components; this is wiring work.
- **Phase 4 (Feedback Polish):** Framer Motion micro-interactions and Sonner toasts are well-documented. The `whileTap`/`whileHover` API and toast styling are straightforward.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every recommended technology is already installed in the codebase. Zero new dependencies. Decision validated by examining and rejecting 6 alternative libraries with specific rationale. |
| Features | HIGH | Feature set derived from established game UX research (NN/g, Acagamic, Inworld) cross-referenced with direct codebase analysis of existing gaps. Clear anti-features identified. |
| Architecture | HIGH | Architecture directly extends 4+ existing patterns in the codebase (overlay components, sync hooks, localStorage utilities, CVA variants). No novel patterns required. |
| Pitfalls | HIGH | All critical pitfalls derived from direct analysis of existing code (AnimatePresence keying, useGameState coupling, Socket.IO event flow). ScrumQuest-specific, not generic warnings. |

**Overall confidence:** HIGH

### Gaps to Address

- **Sonner vs custom toast pattern:** The codebase has both Sonner (installed, unused) and custom `TierUpToast` (actively used). Phase 4 needs to decide: extend the `TierUpToast` pattern for JRPG-themed feedback, or restyle Sonner. The `TierUpToast` approach is likely more consistent but Sonner offers better queue management. Validate during Phase 4 planning.
- **3D element hint targeting:** `HintBubble` positioning works for DOM elements via `data-hint-target`, but React Three Fiber components (PlayerController, BossDisplay) lack traditional DOM rects. The architecture research suggests "screen-space overlay with approximate fixed positions" but this needs prototyping in Phase 2.
- **Tutorial content quality:** The research identifies what hints to build and how many (max 15), but the actual copy/content for each hint and tutorial step is a design task, not a research output. Phase 3 planning should include content writing as explicit work items.
- **Progressive complexity (deferred):** Feature 8 was deferred due to risk, but if analytics show new player drop-off after launch of the basic tutorial, it may need to be reconsidered. Flag for post-milestone evaluation.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all referenced components, stores, hooks, and utilities
- [Tooltip Guidelines (NN/g)](https://www.nngroup.com/articles/tooltip-guidelines/)
- [Skeleton Screens 101 (NN/g)](https://www.nngroup.com/articles/skeleton-screens/)
- [Microinteractions in UX (NN/g)](https://www.nngroup.com/articles/microinteractions/)
- [react-error-boundary (GitHub)](https://github.com/bvaughn/react-error-boundary)
- Framer Motion AnimatePresence documentation
- Zustand subscribeWithSelector documentation

### Secondary (MEDIUM confidence)
- [Game UX: Best Practices for Video Game Onboarding (Inworld)](https://inworld.ai/blog/game-ux-best-practices-for-video-game-onboarding)
- [6 Takeaways from Video Game Onboarding for UX (UserGuiding)](https://userguiding.com/blog/video-game-onboarding)
- [5 Proven Game Onboarding Techniques (Acagamic)](https://acagamic.com/newsletter/2023/04/04/dont-spook-the-newbies-unveiling-5-proven-game-onboarding-techniques/)
- [Top 8 UX Patterns for Contextual Help (Chameleon)](https://www.chameleon.io/blog/contextual-help-ux)
- [Skeleton Loading Screen Design (LogRocket)](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)
- [Empty State UX Best Practices (UXPin)](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/)
- [Tutorial UX: Your Indie Game's Onboarding Roadmap (Wayline)](https://www.wayline.io/blog/tutorial-ux-indie-game-onboarding)
- [The Importance of FTUE in Games (Antidote)](https://antidote.gg/the-importance-of-first-time-user-experience-in-games/)
- [Improving Onboarding for First-Time Players in Multiplayer (Gina Kong)](https://ginakong.com/ux-researcher/improving-onboarding-experience-for-firsttime-players-in-a-multiplayer-video-game)

### Tertiary (LOW confidence)
- [react-joyride npm](https://www.npmjs.com/package/react-joyride) -- evaluated and rejected
- [driver.js evaluation (Sandro Roth)](https://sandroroth.com/blog/evaluating-tour-libraries/) -- evaluated and rejected
- [React onboarding library comparison 2026 (OnboardJS)](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared) -- evaluated for alternatives

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
