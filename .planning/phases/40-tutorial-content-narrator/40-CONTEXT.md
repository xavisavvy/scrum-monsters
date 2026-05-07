# Phase 40: Tutorial Content & JRPG Narrator - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Source:** /gsd-discuss-phase

<domain>
## Phase Boundary

Author tutorial content (walkthrough steps, contextual hints) and a narrator-driven JRPG dialogue voice for the infrastructure shipped in Phase 39. Phase 39 delivered the plumbing (`useTutorial` store with persistence, `TutorialOverlay`, `SpotlightMask`, `HintBubble`, `HelpMenu`, `data-hint-target` attributes, exported `TutorialStep` type, `TUTORIAL_STEPS` placeholder). Phase 40 fills the placeholder with real content, adds a typewriter effect to `HintBubble`, introduces three named narrators with distinct voices, and wires first-encounter contextual hints for combat events.

Out of scope: portrait sprite art, sound effects, server-side tutorial events, new walkthrough phases beyond lobby/avatar/battle, narrator commentary on every screen.

</domain>

<decisions>
## Implementation Decisions

### Narrator cast & assignment
- Three narrators, **phase-locked**:
  - **Guild Master** — lobby + avatar selection. Tone: warm, welcoming, onboarding host.
  - **Battle Advisor** — battle phase + all combat hints (combo, item drop, boss telegraph). Tone: terse, tactical.
  - **Sage** — scoring / reveal / discussion phase + the first-vote-reveal hint. Tone: mystical, reflective.
- Voices are **strongly distinct** in writing — every line should be recognizable as its narrator without the name header.
- Visual: **name header + colored accent + pixel-font text** in the existing `HintBubble`. No portrait art this phase.
  - Color suggestion (planner can refine against theme tokens): Guild Master = gold, Battle Advisor = red, Sage = purple.
- Narrator identity is part of the `TutorialStep` content data, not a runtime prop on the bubble. Add a `narrator: 'guild_master' | 'battle_advisor' | 'sage'` field to `TutorialStep`.

### Walkthrough scope & pacing
- Tight step counts: **lobby = 3, avatar selection = 2, battle = 5**.
  - Lobby: welcome → invite link → start
  - Avatar selection: pick class → confirm
  - Battle: boss → vote card → submit → ability bar → phase flow overview
- **Manual Next / Skip only** — no auto-advance on user action. Predictable, doesn't fight game state.
- **Auto-start on first entry** to each phase (lobby, avatar, battle). Skip button is always present. Completion persisted via existing `useTutorial.completedTutorials`.
- Walkthroughs are independent: completing/skipping the lobby walkthrough does not skip the avatar or battle walkthrough.

### Typewriter & dialogue UX
- Speed: **30 characters per second** (~33ms per character).
- **Click-to-reveal** on the dialogue body: first click while typing reveals all remaining text instantly; the next click (or Next button) advances the step. Skip button always advances/dismisses regardless.
- **No sound effects** this phase. Defer audio to a later polish phase — game has no sound system today.
- **Respect `prefers-reduced-motion`**: when set, skip the typewriter and render full text immediately. Mirrors the pattern Phase 39 established for `SpotlightMask`.
- Typewriter implementation lives inside `HintBubble.tsx` (or a small `useTypewriter` hook colocated with it). Do not add a new top-level component.

### Contextual hint triggers
- **Client-side detection in existing stores** (no server changes). `useTutorial.completedHints` gates "first time."
- Hints shipping in this phase (all four selected):
  1. **First combo activated** — Battle Advisor explains what a combo is when team-combo state first goes active.
  2. **First item drop** — Battle Advisor explains item use when the player's inventory first gains an item.
  3. **First boss telegraph** — Battle Advisor explains the warning on the first telegraphed boss attack.
  4. **First vote reveal** — Sage comments on consensus / divergence on the first reveal screen.
- Trigger pattern: a `useFirstEncounter(hintId, condition)` style hook (or equivalent effect inside an existing component) that watches store state, and on the first transition where `condition` is true AND `completedHints[hintId]` is false, dispatches the hint and marks it complete.
- **Auto-skip silently and mark complete** if the hint's `data-hint-target` element is not rendered when the hint fires (Success Criterion 4). No retry, no untargeted fallback toast.

### Help menu integration
- Existing `HelpMenu` (Replay Tutorial / Reset All Hints from Phase 39) is reused as-is. Replay Tutorial replays the walkthrough for the **current phase** the user is in (not a global replay).

### Claude's Discretion
- Exact narrator color tokens (planner picks against existing theme palette).
- Internal file structure for tutorial content (e.g., `client/src/lib/tutorial/content/{lobby,avatar,battle}.ts` vs. a single `tutorialSteps.ts` constant). Keep colocated with `useTutorial` store.
- Wording of every individual line — author against the voice guide above; planner/executor draft, no further user review needed unless it ships obviously off-tone.
- Whether to introduce a tiny `Narrator` typed config object (color + display name) vs. inline literals — planner's call.
- Test approach (unit vs. component vs. light Playwright) — follow existing Phase 39 test patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 39 foundation (mandatory reading)
- `.planning/phases/39-tutorial-foundation/39-RESEARCH.md` — stack rationale (zustand persist, custom hint system, framer-motion), file layout, patterns
- `.planning/phases/39-tutorial-foundation/39-01-SUMMARY.md` — what Plan 39-01 shipped (store + hooks + data-hint-targets)
- `.planning/phases/39-tutorial-foundation/39-02-SUMMARY.md` — what Plan 39-02 shipped (overlay components + HelpMenu + z-index ladder + battle focus guard)

### Code surfaces this phase touches
- `client/src/lib/stores/useTutorial.tsx` — extend `TutorialStep` type with `narrator` field; populate `TUTORIAL_STEPS`
- `client/src/components/tutorial/HintBubble.tsx` — add typewriter + click-to-reveal + reduced-motion + narrator name header
- `client/src/components/tutorial/TutorialOverlay.tsx` — auto-start logic per phase
- `client/src/components/tutorial/HelpMenu.tsx` — verify Replay Tutorial respects current phase
- `client/src/lib/hooks/useHintTarget.ts` — used as-is for contextual hint targeting

### Project context
- `.planning/REQUIREMENTS.md` — TUTR-01, TUTR-02, TUTR-03 are this phase's deliverables; TUTR-04 was completed in Phase 39
- `.planning/ROADMAP.md` (lines 130-143) — phase goal and success criteria

</canonical_refs>

<specifics>
## Specific Ideas

- Narrator voice signatures (writing reference for the planner/executor):
  - **Guild Master**: warm, welcoming, slightly old-fashioned. Uses "adventurer," "guild," "welcome." Example: "Welcome, brave adventurer. The guild has prepared a hall for your party."
  - **Battle Advisor**: terse, tactical, present-tense. Skips pleasantries. Example: "Combo active. Sustain it — bonus damage scales with chain length."
  - **Sage**: mystical, reflective, sometimes asks rhetorical questions. Uses imagery. Example: "The party speaks with one voice... or many. Both reveal truth."
- z-index ladder is fixed by Phase 39: SpotlightMask 100, HintBubble 101, HelpMenu popover 200. Do not change.
- Battle focus guard from Phase 39 must continue to pass — adding the typewriter inside `HintBubble` must not steal focus from open Radix popovers/menus/dialogs.

</specifics>

<deferred>
## Deferred Ideas

- Narrator portrait sprites / character art (visual upgrade — own phase, requires asset work)
- Typewriter sound effects (requires building a sound system — own phase)
- Server-emitted "first encounter" events (only worth doing if multi-device cross-session accuracy becomes a need)
- Additional walkthrough phases beyond lobby/avatar/battle (e.g., scoring walkthrough, victory walkthrough) — add only if user feedback shows the gap
- Per-narrator typewriter speeds or punctuation pauses (cinematic polish — defer)
- Localized tutorial content (i18n) — outside current project scope

</deferred>

---

*Phase: 40-tutorial-content-narrator*
*Context gathered: 2026-05-06 via /gsd-discuss-phase*
