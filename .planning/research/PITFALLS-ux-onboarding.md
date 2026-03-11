# Domain Pitfalls: UX Onboarding, Tutorials, and Polish

**Domain:** Adding tutorial system, contextual hints, loading/transition polish, error/empty states, and interaction feedback to an existing real-time multiplayer game
**Researched:** 2026-03-11

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Tutorial State Conflicts with Live Game State

**What goes wrong:** Tutorial overlays or guided flows write to the same Zustand stores (`useGameState`, `useEventSync`, `useProgression`) that live Socket.IO events also write to. A `lobby_updated` event arrives mid-tutorial and either overwrites the tutorial's mock state or the tutorial's state leaks into the real game state, causing desyncs for all players in the lobby.

**Why it happens:** ScrumQuest's state is deeply coupled -- `useGameState` holds `currentLobby`, `currentBoss`, `countdown`, `telegraph`, etc. all in one store. A tutorial that needs to show "here's what a boss attack looks like" must either use real state (risking conflict) or mock state (risking divergence from the live store shape).

**Consequences:**
- Other players see the tutorial player as "in battle" when they're in onboarding
- `useEventSync` sequence numbers get corrupted if tutorial events are mixed with real events
- Phase transitions triggered by tutorial (`battle` -> `scoring`) propagate to server via Socket.IO

**Prevention:**
- Create a dedicated `useTutorialStore` that shadows `useGameState` shape but is completely isolated. Tutorial components read from the tutorial store; real components read from the game store.
- Never emit real Socket.IO events during tutorials. Create a `TutorialEmitter` that swallows events or simulates server responses locally.
- Gate all tutorial state behind an `isTutorialActive` flag in a lightweight context or store. PhaseRenderer should check this flag and route to tutorial-specific rendering when active.

**Detection:** Players reporting they are "stuck" in a phase that doesn't match what other players see. `useEventSync` recovery loops triggering during what should be a tutorial-only flow.

**ScrumQuest-specific:** The `PhaseRegistry` system is a natural extension point -- register tutorial-specific phase variants that render educational overlays without touching the real phase components.

**Phase to address:** Tutorial System (first phase -- architecture must be right from the start)

---

### Pitfall 2: Blocking Real-Time Events During Onboarding

**What goes wrong:** Tutorial modals, step-by-step overlays, or "welcome" flows use `pointer-events: none` on the game layer or block user interaction. Meanwhile, Socket.IO events keep arriving -- countdowns expire, boss telegraphs fire, other players submit scores. The player exits the tutorial into a game state they can't recover from (e.g., they missed a voting window, or the phase already advanced).

**Why it happens:** Tutorial UX patterns from single-player or non-real-time apps (step-through modals, forced sequences) don't account for the server-authoritative, time-sensitive nature of multiplayer games.

**Consequences:**
- Player misses a `countdown` and is automatically scored as absent
- Phase advances to `reveal` while player is still reading "how to submit estimates"
- Boss attacks damage the player while they're reading tooltip text, leading to confusion

**Prevention:**
- Tutorials in ScrumQuest must be **non-blocking overlays** that float above the game but never disable interaction. Use Framer Motion for dismissible tooltips, not modals.
- Contextual hints should be **phase-aware**: show "submit your estimate here" only during `battle` phase, auto-dismiss when phase changes, and never prevent the user from interacting with game controls underneath.
- Consider a "sandbox lobby" mode where the tutorial creates a single-player lobby with no real server timers. The `PhaseRegistry.register()` method can register tutorial-specific phases that don't broadcast to other players.

**Detection:** Bug reports about "missed votes" or "was scored absent" from new users who joined mid-game. Analytics showing high drop-off during first battle phase.

**Phase to address:** Tutorial System and Contextual Hints

---

### Pitfall 3: AnimatePresence Key Conflicts with Hint/Tutorial Layers

**What goes wrong:** ScrumQuest already uses `AnimatePresence` with `key={toPhase}` in `PhaseTransition` for phase changes. Adding tutorial overlays or hint tooltips that also use `AnimatePresence` creates nested `AnimatePresence` contexts where exit animations conflict -- the phase transition's `mode="wait"` blocks until all children (including tutorial animations) complete their exit, causing visible freezes or layout jumps.

**Why it happens:** Framer Motion's `AnimatePresence` manages mount/unmount animations by key. Nesting them without careful key management causes the outer `AnimatePresence` to wait for inner ones, or inner animations to be abruptly cancelled.

**Consequences:**
- Phase transitions stall for 300-500ms while tutorial tooltips animate out
- Hints that should persist across phase transitions get unmounted and remounted, causing flicker
- `useReducedMotion` is respected in `PhaseTransition` but not in new tutorial components, creating inconsistent motion behavior

**Prevention:**
- Tutorial/hint overlays must render **outside** the `PhaseTransition` component tree. Place them as siblings in the component hierarchy, not children of phase components.
- Use a separate `AnimatePresence` for hints/tutorials at the app level, not inside `PhaseRenderer`.
- Always respect `useReducedMotion` in new animation code -- copy the pattern from `PhaseTransition` where `duration: 0` is used when reduced motion is preferred.
- Keep tutorial animation durations short (150-200ms max) so they never block phase transitions.

**Detection:** Phase transitions taking noticeably longer after tutorial system is added. Visual "double fade" effects during phase changes.

**Phase to address:** Loading/Transition Polish (but must be considered from Phase 1 architecture)

---

### Pitfall 4: Tutorial Content Diverges from Actual Game

**What goes wrong:** Tutorials are built once with hardcoded descriptions ("click the sword icon to attack") but the actual UI evolves. The attack button gets renamed, moved, or replaced with an ability bar. Tutorials now teach incorrect interactions, which is worse than no tutorial at all.

**Why it happens:** Tutorials are treated as static content rather than as code coupled to the components they describe. No mechanism enforces that tutorial text stays in sync with the components it references.

**Consequences:**
- New players follow tutorial instructions that don't match the current UI
- Maintenance burden grows as every UI change requires a tutorial audit
- Screenshots in tutorials become stale

**Prevention:**
- Contextual hints should be **co-located with the components they describe**. The `ScoreSubmission` component should own its own hint text, not a central tutorial config file. Use a pattern like:
  ```tsx
  <HintTarget id="score-submit" hint="Choose a story point estimate">
    <ScoreSubmission ... />
  </HintTarget>
  ```
- Never use screenshots in tutorials -- use pointer/highlight overlays on the actual live components.
- Tutorial steps should reference component existence, not hardcoded positions. If `AbilityBar` isn't rendered (e.g., player level too low), its tutorial step should auto-skip.

**Detection:** User feedback mentioning "the tutorial told me to X but I can't find X." Tutorial completion rates dropping after UI changes.

**Phase to address:** Contextual Hints (architecture), Tutorial System (implementation)

## Moderate Pitfalls

### Pitfall 5: Loading Skeletons That Flash

**What goes wrong:** Adding loading skeletons or spinners to Socket.IO-driven state causes brief flashes. Data arrives within 50-100ms (typical for WebSocket), but the skeleton mounts, renders one frame, then immediately unmounts -- creating a jarring flash rather than a smooth experience.

**Prevention:**
- Use a minimum display time for loading states (300ms) or a delayed appearance (show skeleton only if data hasn't arrived after 200ms). Pattern:
  ```tsx
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(timer);
  }, []);
  ```
- For ScrumQuest specifically, the `PhaseRegistry.validatePhase()` already returns a loading state when boss/player data is missing. Enhance this with a delayed skeleton rather than an immediate one.
- Distinguish between "first load" (show skeleton) and "update" (don't show skeleton, just swap data).

**Phase to address:** Loading/Transition Polish

---

### Pitfall 6: Hint Fatigue from Overeager Contextual Tips

**What goes wrong:** Every component gets a tooltip, every phase gets a hint banner, every action gets a confirmation. Returning players are buried in guidance they don't need. The game feels patronizing.

**Prevention:**
- Track hint dismissals in `localStorage` with a simple `Set<string>` of dismissed hint IDs. Once dismissed, never show again.
- Use progressive disclosure: show only 1-2 hints per phase, prioritizing the most critical action. In `battle` phase, the only hint should be "submit your estimate." Don't also hint about abilities, items, combos simultaneously.
- Add a global "I know what I'm doing" toggle in settings that suppresses all hints.
- Implement a hint priority system: `critical` (always show until dismissed), `helpful` (show first 3 times), `nice-to-know` (show once).

**Phase to address:** Contextual Hints

---

### Pitfall 7: Error States That Swallow Socket.IO Context

**What goes wrong:** Generic error boundaries catch errors but lose the WebSocket connection context. The `ErrorBoundary.tsx` catches a render error, shows "Something went wrong," but doesn't attempt reconnection or preserve lobby state. The user must refresh and rejoin.

**Prevention:**
- ScrumQuest already has `ReconnectionDialog` and `ConnectionIndicator` components. Error states should integrate with `useWebSocket`'s reconnection flow, not replace it.
- Error boundaries should distinguish between:
  - **Render errors** (component crashed): Show error UI but keep WebSocket alive. The lobby state in `useGameState` is still valid.
  - **Connection errors** (Socket.IO disconnect): Defer to `ReconnectionDialog`, don't show a generic error.
  - **Game logic errors** (invalid phase, missing data): Show contextual recovery ("Rejoining lobby...") and trigger `reconnectToLobby()`.
- Never call `clearAll()` on `useGameState` from an error boundary -- that destroys the reconnection data.

**Phase to address:** Error/Empty States

---

### Pitfall 8: Mobile Tutorial Overlays Breaking Virtual D-Pad

**What goes wrong:** Tutorial highlights or hint popovers on mobile cover or interfere with the virtual D-pad controls. Touch events are captured by the tutorial layer instead of passing through to the game controls underneath.

**Prevention:**
- Tutorial overlays must use `pointer-events: none` on their backdrop with `pointer-events: auto` only on interactive tutorial elements (next button, dismiss).
- Test hint positions against the D-pad area specifically. Hints near bottom-left (where D-pads typically sit) should anchor to different positions on mobile.
- Use `@media (max-width: 768px)` or a mobile detection hook to reposition hints that would overlap controls.

**Phase to address:** Contextual Hints, Interaction Feedback

---

### Pitfall 9: Zustand Store Bloat from Tutorial/Hint State

**What goes wrong:** Tutorial progress, hint visibility, onboarding step, animation states all get added to `useGameState`. The store becomes a grab-bag that re-renders the entire game tree on every hint dismissal.

**Prevention:**
- Tutorial/hint state belongs in its own store(s), not in `useGameState`. ScrumQuest already uses `subscribeWithSelector` which helps, but the cleanest approach is separate stores:
  - `useTutorialStore` - tutorial progress, current step, completion status
  - `useHintStore` - hint visibility, dismissal state, priority queue
- These stores should persist to `localStorage` for cross-session state (which hints were dismissed, whether tutorial was completed).
- Use Zustand's `subscribeWithSelector` on these new stores too, so components only re-render for the specific hint they care about.

**Phase to address:** Tutorial System (architecture decision, Phase 1)

## Minor Pitfalls

### Pitfall 10: Transition Polish Breaking `prefers-reduced-motion`

**What goes wrong:** New loading animations, skeleton pulse effects, and transition polish are added without checking `useReducedMotion`. Users with motion sensitivity get a worse experience than before the polish was added.

**Prevention:**
- Follow the existing pattern in `PhaseTransition.tsx`: check `useReducedMotion()` and set `duration: 0` for all animations. Create a shared utility:
  ```tsx
  export function useAnimationDuration(normalMs: number): number {
    const reduced = useReducedMotion();
    return reduced ? 0 : normalMs;
  }
  ```
- Apply this to every new Framer Motion animation, CSS transition, and skeleton pulse.

**Phase to address:** All phases (cross-cutting concern)

---

### Pitfall 11: Empty States That Don't Explain What To Do

**What goes wrong:** Empty states just say "No data" or show a blank area. In a multiplayer game, empty states often mean "waiting for others" not "nothing exists" -- but the UI doesn't distinguish.

**Prevention:**
- Every empty state should answer: "Why is this empty?" and "What should I do?"
  - Lobby with no players: "Share the invite link to get started" + copy button
  - Battle with no scores: "Submit your estimate using the cards below"
  - Discussion with no comments: "Waiting for the host to start discussion"
- Map empty states to the game phase. The same "no scores" state means different things in `battle` (expected, game just started) vs `reveal` (something went wrong).

**Phase to address:** Error/Empty States

---

### Pitfall 12: Sound Effects for Feedback Without Volume/Mute Control

**What goes wrong:** Interaction feedback sounds (button clicks, hint appearances, achievement dings) are added but the existing `useGameSounds` hook doesn't provide granular control. Users can't mute feedback sounds while keeping game sounds.

**Prevention:**
- Extend `useGameSounds` with categories: `music`, `effects`, `feedback`. New onboarding/polish sounds go in `feedback` category.
- Check that existing `BossMusicControls` component handles the new category.
- Default new feedback sounds to a lower volume than existing game effects.

**Phase to address:** Interaction Feedback

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Tutorial System | Tutorial emits real Socket.IO events, corrupting game state for other players | Isolated tutorial emitter that never touches real socket |
| Tutorial System | Tutorial store shape diverges from game store, tutorials break silently | Share TypeScript interfaces between tutorial and game stores |
| Contextual Hints | Hints render inside PhaseTransition's AnimatePresence, causing animation conflicts | Render hint layer as sibling to PhaseRenderer, not inside it |
| Contextual Hints | Hints reference components that conditionally render (abilities, items), crash on null refs | Hint system must gracefully handle missing target components |
| Loading/Transition Polish | Skeleton flash from fast WebSocket updates | Delayed skeleton pattern (200ms threshold before showing) |
| Loading/Transition Polish | New transitions don't respect existing `mode="wait"` on AnimatePresence | Test all new animations alongside phase transitions, not in isolation |
| Error/Empty States | Error boundary kills WebSocket connection, losing reconnection capability | Error boundaries must preserve `useWebSocket` state |
| Error/Empty States | Empty state for "no players" shown briefly during reconnection | Delay empty states by the reconnection grace period |
| Interaction Feedback | Haptic/sound feedback fires during tutorial, confusing users | Tutorial mode should suppress or clearly differentiate feedback |
| Interaction Feedback | Toast notifications (sonner) stack up during rapid phase transitions | Deduplicate toasts by ID, auto-dismiss on phase change |

## Sources

- ScrumQuest codebase analysis: `PhaseRegistry.tsx`, `PhaseTransition.tsx`, `PhaseRenderer.tsx`, `useGameState.tsx`, `useEventSync.ts`, `useWebSocket.tsx`
- [Game UX: Best practices for video game onboarding](https://inworld.ai/blog/game-ux-best-practices-for-video-game-onboarding)
- [Tutorial UX: Your Indie Game's Onboarding Roadmap](https://www.wayline.io/blog/tutorial-ux-indie-game-onboarding)
- [The Importance of First Time User Experience (FTUE) in Games](https://antidote.gg/the-importance-of-first-time-user-experience-in-games/)
- [Pitfalls of overusing React Context](https://blog.logrocket.com/pitfalls-of-overusing-react-context/)
- [Improving Onboarding Experience for First-Time Players in a Multiplayer Video Game](https://ginakong.com/ux-researcher/improving-onboarding-experience-for-firsttime-players-in-a-multiplayer-video-game)
