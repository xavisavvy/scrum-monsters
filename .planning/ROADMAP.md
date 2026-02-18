# Roadmap: ScrumQuest

## Milestones

- ✅ **v1.0 Domain Separation** — Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** — Phases 7-14 (shipped 2026-02-03)
- ✅ **v1.3 Game Progression** — Phases 15-20 (shipped 2026-02-11)
- 🚧 **v2.0 UI Redesign & Mobile** — Phases 21-24 (in progress)

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

- [x] Phase 15: XP/Progression Foundation (8/8 plans) — completed 2026-02-10
- [x] Phase 16: Class Mastery System (5/5 plans) — completed 2026-02-11
- [x] Phase 17: Boss AI Patterns (5/5 plans) — completed 2026-02-11
- [x] Phase 18: Class Abilities (3/3 plans) — completed 2026-02-11
- [x] Phase 19: Team Combos (3/3 plans) — completed 2026-02-11
- [x] Phase 20: Combat Items & Lifetime Stats (4/4 plans) — completed 2026-02-11

</details>

### 🚧 v2.0 UI Redesign & Mobile (In Progress)

**Milestone Goal:** Redesign entire game experience with JRPG theming, responsive layout, simplified information architecture, and proper routing/SEO — making ScrumQuest look and feel like a polished product on any device.

#### Phase 21: JRPG Theme Foundation
**Goal**: Establish design system with reusable themed components preventing rework across all UI
**Depends on**: Nothing (foundational)
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05, THEME-06, THEME-07
**Success Criteria** (what must be TRUE):
  1. All game panels and modals use consistent JRPG-styled ornamental frames
  2. Developers can build new UI using reusable themed components (GamePanel, GameButton, StatBar, HealthBar)
  3. CSS custom property tokens define all colors, spacing, borders, shadows, and fonts
  4. Phase transitions (lobby → avatar → battle → reveal) have smooth 100-500ms animations
  5. UI sound effects play on button clicks, phase transitions, and key game events
  6. JRPG theming maintains WCAG AA contrast ratios (4.5:1 text, 3:1 large)
**Plans**: TBD

Plans:
- [ ] 21-01: Design system architecture and CSS tokens
- [ ] 21-02: Themed component library (GamePanel, GameButton, StatBar, HealthBar)
- [ ] 21-03: UI sound effects library and integration
- [ ] 21-04: Phase transition animations
- [ ] 21-05: Accessibility validation and contrast fixes

#### Phase 22: Mobile UX Critical Path
**Goal**: Ensure core game UX works on mobile devices with touch-friendly controls and adaptive performance
**Depends on**: Phase 21 (themed components make responsive refactor easier)
**Requirements**: MOBILE-01, MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-05, MOBILE-06, MOBILE-07
**Success Criteria** (what must be TRUE):
  1. All interactive elements (buttons, cards, abilities) have minimum 44x44px touch targets
  2. Content is never obscured by notches, rounded corners, or home gesture zones on any device
  3. Game UI adapts smoothly to both landscape (battle) and portrait (lobby/menus) orientations
  4. Three.js canvas renders at acceptable FPS on mid-range phones without overheating
  5. User sees visible reconnection status when network interrupts on mobile
  6. User can complete a full game session on a phone browser without layout issues or double-tap bugs
**Plans**: TBD

Plans:
- [ ] 22-01: Touch target audit and mobile-first responsive layouts
- [ ] 22-02: Safe area handling with CSS env() variables
- [ ] 22-03: Dual orientation support (landscape/portrait)
- [ ] 22-04: Mobile Three.js performance optimization
- [ ] 22-05: Mobile reconnection UX and input handler fixes

#### Phase 23: Routing & SEO Infrastructure
**Goal**: Separate website/game modules with proper routing, SEO meta tags, and static marketing pages
**Depends on**: Nothing (parallel to 21/22, integrates at App.tsx level)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, ROUTE-06, ROUTE-07
**Success Criteria** (what must be TRUE):
  1. App uses clean URLs without hash fragments (/game/abc123 not /#/lobby?id=abc123)
  2. Each public page (landing, about, how-to-play) has unique title, description, and meta tags
  3. Links shared on Twitter/Discord/Slack show rich previews with Open Graph/Twitter card tags
  4. Marketing pages pre-render as static HTML for search engine crawlers
  5. Three.js game bundle only loads when user navigates to game routes (code splitting works)
  6. Game routes use /game/:lobbyId with server state as authoritative (URLs reflect, don't drive state)
  7. Three.js Canvas stays mounted across route changes without WebGL context leaks
**Plans**: TBD

Plans:
- [ ] 23-01: React Router v7 integration and clean URL structure
- [ ] 23-02: React Helmet meta tags and Open Graph tags
- [ ] 23-03: vite-react-ssg static page pre-rendering
- [ ] 23-04: Route-based code splitting (lazy load Three.js)
- [ ] 23-05: Canvas lifecycle management and routing integration

#### Phase 24: Lobby Polish & Animations
**Goal**: Enhance lobby interactions with visible emote system, readiness indicators, and idle animations
**Depends on**: Phase 21 (theme foundation), Phase 22 (touch-friendly interactions)
**Requirements**: LOBBY-01, LOBBY-02, LOBBY-03
**Success Criteria** (what must be TRUE):
  1. User sees clear, visible UI for sending emotes and viewing others' emotes
  2. Player readiness state is visually indicated before game starts (ready/not ready)
  3. Characters have idle animations during waiting periods (not static models)
**Plans**: TBD

Plans:
- [ ] 24-01: Enhanced emote UI system
- [ ] 24-02: Player readiness indicators
- [ ] 24-03: Character idle animations

## Backlog

### Phase 21-backlog: Lobby Magic & Emote System (ad-hoc, partially complete)

Implemented ad-hoc during v1.3 without formal planning. Needs formal test coverage, code review, server-side validation, and visual polish before shipping. Deferred to Phase 24 formal planning.

## Progress

**Execution Order:**
Phases execute in numeric order: 21 → 22 → 23 → 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15. XP/Progression | v1.3 | 8/8 | Complete | 2026-02-10 |
| 16. Class Mastery | v1.3 | 5/5 | Complete | 2026-02-11 |
| 17. Boss AI Patterns | v1.3 | 5/5 | Complete | 2026-02-11 |
| 18. Class Abilities | v1.3 | 3/3 | Complete | 2026-02-11 |
| 19. Team Combos | v1.3 | 3/3 | Complete | 2026-02-11 |
| 20. Items & Stats | v1.3 | 4/4 | Complete | 2026-02-11 |
| 21. JRPG Theme Foundation | v2.0 | 0/5 | Not started | - |
| 22. Mobile UX Critical Path | v2.0 | 0/5 | Not started | - |
| 23. Routing & SEO Infrastructure | v2.0 | 0/5 | Not started | - |
| 24. Lobby Polish & Animations | v2.0 | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-11*
*Last updated: 2026-02-11 after v2.0 milestone start*
