# Requirements: ScrumQuest

**Defined:** 2026-02-11
**Core Value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun

## v2.0 Requirements

Requirements for UI Redesign & Mobile milestone. Each maps to roadmap phases.

### JRPG Theming

- [ ] **THEME-01**: All game panels and modals use JRPG-styled ornamental frames consistently
- [ ] **THEME-02**: Design system provides reusable themed components (GamePanel, GameButton, StatBar, HealthBar)
- [ ] **THEME-03**: CSS custom property tokens define colors, spacing, borders, shadows, and fonts
- [ ] **THEME-04**: Phase-consistent visual language across all post-lobby screens
- [ ] **THEME-05**: UI sound effects play on button clicks, phase transitions, and key game events
- [ ] **THEME-06**: State transitions between phases use smooth animations (100-500ms)
- [ ] **THEME-07**: JRPG theming maintains WCAG AA contrast ratios (4.5:1 text, 3:1 large)

### Mobile UX

- [ ] **MOBILE-01**: All interactive elements have minimum 44x44px touch targets
- [ ] **MOBILE-02**: Safe area handling prevents content from being obscured by notches, rounded corners, and home gesture zones
- [ ] **MOBILE-03**: Game UI adapts to both landscape and portrait orientations
- [ ] **MOBILE-04**: Three.js canvas caps devicePixelRatio at 2 on mobile and auto-downgrades quality based on FPS
- [ ] **MOBILE-05**: User sees visible reconnection status during network interruptions on mobile
- [ ] **MOBILE-06**: All input handlers use pointer events to prevent touch/mouse double-fire
- [ ] **MOBILE-07**: User can complete a full game session on a phone browser without layout issues

### Routing & SEO

- [ ] **ROUTE-01**: App uses clean URL structure with React Router (no hash fragments)
- [ ] **ROUTE-02**: Each public page has unique title, description, and meta tags via React Helmet
- [ ] **ROUTE-03**: Open Graph and Twitter card tags render rich previews when sharing links
- [ ] **ROUTE-04**: Marketing pages (landing, about, how-to-play) are pre-rendered as static HTML for SEO
- [ ] **ROUTE-05**: Three.js game module is lazy-loaded only when game routes are accessed (code splitting)
- [ ] **ROUTE-06**: Game routes use `/game/:lobbyId` with server state as authoritative (URLs reflect, don't drive)
- [ ] **ROUTE-07**: Three.js Canvas stays mounted across route changes to prevent WebGL context leaks

### Lobby Polish

- [ ] **LOBBY-01**: Emote system has clear, visible UI for sending and displaying emotes
- [ ] **LOBBY-02**: Player readiness state is visually indicated (ready/not ready before game start)
- [ ] **LOBBY-03**: Characters have idle animations during waiting periods

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### JRPG Theming

- **THEME-08**: Class-specific UI flourishes (color/icon accents reflect player's chosen class)
- **THEME-09**: Adaptive UI density switching between compact (mobile) and spacious (desktop) layouts

### Mobile UX

- **MOBILE-08**: Haptic feedback (vibration) on button presses and combat hits
- **MOBILE-09**: Gesture controls (swipe, pinch, long-press) for game interactions

### Lobby Polish

- **LOBBY-04**: Charge/magic system visual effects polish
- **LOBBY-05**: Phase transition cinematic animations
- **LOBBY-06**: Emote wheel or quick-chat UI

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Pixel-perfect sprite animations | High complexity, diminishing returns for estimation app |
| Dynamic lobby OG images | Server-side image generation complexity, low SEO impact |
| Lobby mini-games | Scope creep risk, only warranted if wait times become problematic |
| Full SSR framework (Next.js) | Overkill — vite-react-ssg handles marketing pages, game is client-side |
| Player collision physics in lobby | Fun but non-essential, high implementation cost |
| Native mobile app (PWA/React Native) | Responsive web sufficient for v2.0, native deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| THEME-01 | Phase 21 | Pending |
| THEME-02 | Phase 21 | Pending |
| THEME-03 | Phase 21 | Pending |
| THEME-04 | Phase 21 | Pending |
| THEME-05 | Phase 21 | Pending |
| THEME-06 | Phase 21 | Pending |
| THEME-07 | Phase 21 | Pending |
| MOBILE-01 | Phase 22 | Pending |
| MOBILE-02 | Phase 22 | Pending |
| MOBILE-03 | Phase 22 | Pending |
| MOBILE-04 | Phase 22 | Pending |
| MOBILE-05 | Phase 22 | Pending |
| MOBILE-06 | Phase 22 | Pending |
| MOBILE-07 | Phase 22 | Pending |
| ROUTE-01 | Phase 23 | Pending |
| ROUTE-02 | Phase 23 | Pending |
| ROUTE-03 | Phase 23 | Pending |
| ROUTE-04 | Phase 23 | Pending |
| ROUTE-05 | Phase 23 | Pending |
| ROUTE-06 | Phase 23 | Pending |
| ROUTE-07 | Phase 23 | Pending |
| LOBBY-01 | Phase 24 | Pending |
| LOBBY-02 | Phase 24 | Pending |
| LOBBY-03 | Phase 24 | Pending |

**Coverage:**
- v2.0 requirements: 24 total
- Mapped to phases: 24/24 ✓
- Unmapped: 0

**Phase Distribution:**
- Phase 21 (JRPG Theme Foundation): 7 requirements
- Phase 22 (Mobile UX Critical Path): 7 requirements
- Phase 23 (Routing & SEO Infrastructure): 7 requirements
- Phase 24 (Lobby Polish & Animations): 3 requirements

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after v2.0 roadmap creation*
