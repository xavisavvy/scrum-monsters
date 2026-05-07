# Roadmap: ScrumQuest

## Milestones

- ✅ **v1.0 Domain Separation** — Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** — Phases 7-14 (shipped 2026-02-03)
- ✅ **v1.3 Game Progression** — Phases 15-20 (shipped 2026-02-11)
- ✅ **v2.0 UI Redesign & Mobile** — Phases 21-25 (shipped 2026-02-19)
- ✅ **v3.0 Production Optimization** — Phases 26-29 (shipped 2026-02-20)
- ✅ **v3.1 Tech Debt Cleanup** — Phases 30-31 (completed 2026-02-24, 1 plan deferred)
- ✅ **v4.0 Hosting & Deployment** — Phases 32-36 (shipped 2026-03-11)
- 🚧 **v5.0 UX & Onboarding** — Phases 37-41 (in progress)

## Phases

<details>
<summary>✅ v1.0 Domain Separation (Phases 1-6) — SHIPPED 2026-02-02</summary>

See `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 SDLC Best Practices (Phases 7-14) — SHIPPED 2026-02-03</summary>

See `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Game Progression (Phases 15-20) — SHIPPED 2026-02-11</summary>

See `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 UI Redesign & Mobile (Phases 21-25) — SHIPPED 2026-02-19</summary>

See `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 Production Optimization (Phases 26-29) — SHIPPED 2026-02-20</summary>

See `.planning/milestones/v3.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.1 Tech Debt Cleanup (Phases 30-31) — SHIPPED 2026-02-24</summary>

See `.planning/milestones/v3.1-ROADMAP.md`

</details>

<details>
<summary>✅ v4.0 Hosting & Deployment (Phases 32-36) — SHIPPED 2026-03-11</summary>

See `.planning/milestones/v4.0-ROADMAP.md`

- [x] Phase 32: Infrastructure Foundation (3/3 plans) — completed 2026-03-02
- [x] Phase 33: Production Hardening (2/2 plans) — completed 2026-03-03
- [x] Phase 34: CI/CD Pipeline (3/3 plans) — completed 2026-03-09
- [x] Phase 35: Observability (3/3 plans) — completed 2026-03-09
- [x] Phase 36: Disaster Recovery (3/3 plans) — completed 2026-03-10

</details>

### 🚧 v5.0 UX & Onboarding (In Progress)

**Milestone Goal:** Make ScrumQuest welcoming to new players and polished for everyone — tutorial system, contextual hints, smooth transitions, meaningful error/empty states, and responsive interaction feedback.

- [x] **Phase 37: State Polish & Bug Fixes** — Graceful handling of every app state plus known bug fixes (completed 2026-03-11)
- [x] **Phase 38: Interaction Feedback & Transitions** — Responsive micro-interactions, toast notifications, and cinematic phase transitions (completed 2026-03-11)
- [ ] **Phase 39: Tutorial Foundation** — Tutorial infrastructure (store, overlays, hint system) and help menu
- [x] **Phase 40: Tutorial Content & JRPG Narrator** — Phase-aware walkthroughs, contextual hints, and narrator dialogue boxes (plans complete 2026-05-07; pending /gsd-verify-work)
- [x] **Phase 41: Reconnection State Bugfix** — Fix stale lobby snapshot/reconnect-token causing duplicate self and lost host status on rejoin (completed 2026-05-06)

## Phase Details

### Phase 37: State Polish & Bug Fixes
**Goal**: Every screen handles empty, loading, and error states gracefully with JRPG theming, and known bugs are resolved
**Depends on**: Nothing (first phase of milestone)
**Requirements**: POLISH-01, POLISH-02, POLISH-03, FIX-01, FIX-02
**Success Criteria** (what must be TRUE):
  1. User sees themed empty state messages with actionable CTAs when lobby has no players, no tickets, no abilities, or empty scoreboard
  2. User sees skeleton loading placeholders for lobby player list and a themed spinner during battle preparation (no blank screens or raw "Loading..." text)
  3. User sees a JRPG-styled error fallback with retry button when any phase component crashes, and the rest of the app continues working
  4. User can click "New Game" on the victory screen and it works (server handler exists and responds)
  5. Developer menu Character Tools and Boss Tools buttons either function correctly or are removed
**Plans**: 2 plans

Plans:
- [x] 37-01: Empty states and loading skeletons
- [x] 37-02: Error boundaries and bug fixes

### Phase 38: Interaction Feedback & Transitions
**Goal**: Every user action produces immediate visual feedback, and phase changes feel cinematic
**Depends on**: Phase 37 (error boundaries must exist before adding animations that could mask errors)
**Requirements**: FEED-01, FEED-02, FEED-03, POLISH-04
**Success Criteria** (what must be TRUE):
  1. User sees press/spring-back animation on game buttons and glow/bounce feedback when selecting a vote card
  2. User receives toast notifications for key events: score submitted, reconnected, settings saved, ability used
  3. User sees a brief confirmation flash and cooldown progress indicator when activating a combat ability
  4. User sees JRPG interstitial screens during phase transitions (e.g., "Encounter!", "Victory!", "Tallying results...") that are short and non-blocking
**Plans**: 3 plans

Plans:
- [x] 38-01: Button animations and vote card feedback
- [x] 38-02: Toast notifications and ability confirmation
- [x] 38-03: JRPG phase transition interstitials

### Phase 39: Tutorial Foundation
**Goal**: Tutorial infrastructure is built and verified — isolated store, overlay system, hint targeting, and help menu — ready for content
**Depends on**: Phase 37 (empty/loading/error states provide stable rendering context for overlays)
**Requirements**: TUTR-04
**Success Criteria** (what must be TRUE):
  1. A `useTutorial` Zustand store exists, fully isolated from `useGameState`, with localStorage persistence for tutorial/hint completion state
  2. SpotlightMask and HintBubble overlay components render as siblings to PhaseRenderer (not children), with their own AnimatePresence context
  3. Key game elements have `data-hint-target` attributes and the hint system can locate and position overlays relative to them
  4. User can open a help menu from a button in the game UI that allows re-triggering the tutorial walkthrough
**Plans**: 2 plans

Plans:
- [ ] 39-01-PLAN.md — Tutorial store and hint targeting infrastructure
- [ ] 39-02-PLAN.md — Spotlight overlay, help menu, and game UI mounting

### Phase 40: Tutorial Content & JRPG Narrator
**Goal**: First-time players receive guided walkthroughs and contextual hints delivered through JRPG narrator characters
**Depends on**: Phase 39 (tutorial infrastructure must exist before defining content that uses it)
**Requirements**: TUTR-01, TUTR-02, TUTR-03
**Success Criteria** (what must be TRUE):
  1. First-time user sees a phase-aware spotlight walkthrough in lobby, avatar selection, and battle phases that is skippable and remembers completion across sessions
  2. User sees one-time contextual hints on first encounter with advanced features (first combo, first item drop, first boss telegraph) that auto-dismiss and never repeat
  3. All tutorial text and contextual hints appear in JRPG dialogue box style with typewriter text effect and narrator characters (Guild Master, Battle Advisor, Sage)
  4. Tutorial walkthrough steps auto-skip if their target element is not rendered (content cannot diverge from actual UI)
**Plans**: TBD

Plans:
- [x] 40-01: Tutorial walkthrough content and contextual hints (completed 2026-05-07)
- [x] 40-02: JRPG narrator dialogue boxes and typewriter effect (completed 2026-05-07)

### Phase 41: Reconnection State Bugfix
**Goal**: A returning player rejoins the same lobby with their original identity and host status, with no duplicate avatars and no stale snapshot/token state
**Depends on**: Phase 39 (tutorial work touches PlayerHUD/PlayerController focus paths; resolve after to avoid conflicts)
**Requirements**: FIX-03 (new — to be added to REQUIREMENTS.md when planning starts)
**Success Criteria** (what must be TRUE):
  1. `scrum-monsters-current-lobby` and `scrum-monsters-lobby-snapshot` localStorage entries always reference the same `lobbyId`; mismatched/stale snapshots are cleared on detection
  2. Reconnecting to a lobby restores the original player (no duplicate self appears in the player list/teams)
  3. The original host retains `isHost: true` after reconnect, instead of being reattached as a non-host
  4. `reconnectToken` is invalidated and removed once it expires or once the matching lobby/player is gone server-side
  5. Repro is a closed regression: stop dev server during an active lobby, restart, reload tab — single self in roster, host preserved

**Repro evidence (2026-05-06):**
  - `scrum-monsters-current-lobby` → lobby `MT1Q4L`
  - `scrum-monsters-lobby-snapshot` → lobby `36I0RL` (different)
  - `reconnectToken` was scoped to `36I0RL`
  - Result: duplicate self in roster, original host status lost on rejoin
**Plans**: TBD (1-2 plans expected: snapshot/token cleanup + reconnect handler integrity)

Plans:
- [x] 41-01: Lobby snapshot/token consistency and stale-state cleanup (completed 2026-05-06)
- [x] 41-02: Reconnect handler — preserve identity and host status (completed 2026-05-06)

## Progress

**Execution Order:**
Phases execute in numeric order: 37 -> 38 -> 39 -> 40

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15-20 | v1.3 | 28/28 | Complete | 2026-02-11 |
| 21-25 | v2.0 | 23/23 | Complete | 2026-02-19 |
| 26-29 | v3.0 | 9/9 | Complete | 2026-02-20 |
| 30-31 | v3.1 | 3/4 (1 deferred) | Complete | 2026-02-24 |
| 32-36 | v4.0 | 14/14 | Complete | 2026-03-11 |
| 37. State Polish & Bug Fixes | v5.0 | 2/2 | Complete | 2026-03-11 |
| 38. Interaction Feedback & Transitions | v5.0 | 3/3 | Complete | 2026-03-11 |
| 39. Tutorial Foundation | v5.0 | 0/2 | Not started | - |
| 40. Tutorial Content & JRPG Narrator | v5.0 | 2/2 | Plans complete | - |
| 41. Reconnection State Bugfix | v5.0 | 2/2 | Complete | 2026-05-06 |

**Total: 8 milestones shipped, 39 phases complete, 137 plans (1 deferred) | v5.0: 3/5 phases complete, 10/11 plans done**

---
*Roadmap created: 2026-02-11*
*Last updated: 2026-05-07 — Plan 40-02 shipped (useTypewriter hook + HintBubble narrator header/typewriter); Phase 40 plans complete*
