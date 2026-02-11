# Project Research Summary

**Project:** ScrumQuest v2.0 UI/UX Milestone
**Domain:** JRPG-themed UI redesign, responsive mobile game UX, SPA routing with SEO
**Researched:** 2026-02-11
**Confidence:** HIGH

## Executive Summary

ScrumQuest v2.0 represents a frontend evolution milestone focused on four domains: JRPG-themed visual redesign, mobile-optimized game UX, proper routing with SEO support, and lobby interaction polish. The research reveals that this milestone leverages existing infrastructure exceptionally well. The real-time WebSocket reconnection system (validated in v1.0) already handles mobile network interruptions. Server-side events for emotes (`lobby_emote`, `battle_emote`) and charge system (`player_charge`) exist but need UI polish. The phase transition state machine (`GamePhase` type) is ready for animation hooks. This positions the project for a primarily frontend implementation with minimal server-side changes.

The recommended approach centers on building a JRPG design system as the foundation, then layering mobile responsiveness, routing infrastructure, and lobby polish on top. Key stack additions include React Router v7 (upgrade from existing v6 for type safety), maintaining react-helmet-async for SEO meta tags, adding vite-react-ssg for static marketing page generation, and using react-responsive for JavaScript-based media queries. The architecture separates website routes (lightweight marketing pages without Three.js) from game routes (heavyweight real-time 3D experience), preventing Three.js bundle overhead on public pages. For mobile, CSS environment variables handle safe areas natively, with 44x44px minimum touch targets enforced across all phases.

The primary risks center on Three.js lifecycle management during route changes (WebGL context leaks), dual input handling (touch/mouse conflicts causing double-fires), and state machine vs URL navigation conflicts (server-driven phases vs URL-driven routing). These are mitigated by keeping Canvas mounted across route changes, using pointer events instead of separate touch/mouse handlers, and maintaining server state as authoritative with URLs reflecting (not driving) game phases. The biggest complexity lies in dual-orientation support (landscape for battle, portrait for lobby) and ensuring JRPG theming doesn't sacrifice accessibility. Overall, this milestone is well-scoped with clear patterns and manageable risks.

## Key Findings

### Recommended Stack

Stack research reveals minimal new dependencies needed. React Router is already installed (v6.26.0) but unused—upgrading to v7 recommended for automatic route typing and 15% smaller bundle. React-helmet-async already installed and working for meta tags. Major additions: vite-react-ssg for static marketing page pre-rendering (SEO without full SSR), react-responsive for JavaScript media queries (mobile behavior detection), and optionally container queries for component-level responsiveness.

**Core technologies:**
- **React Router v7** (upgrade from v6): Client-side routing with type safety — automatic loader/action typing eliminates manual casting, 15% smaller bundle than v6, non-breaking upgrade path
- **vite-react-ssg**: Static site generation for marketing pages — pre-renders landing/about/features to static HTML for SEO, hybrid approach (static marketing + dynamic game), Vite-native integration
- **react-responsive**: JavaScript media query hooks — SSR-safe useMediaQuery for conditional rendering, needed for mobile vs desktop behavior in Three.js scenes (quality settings, controls)
- **Framer Motion + GSAP** (already installed): UI animations — Framer Motion for 90% of UI (menus, buttons, cards), GSAP for 10% cinematic moments (battle intros, victory screens)
- **@react-three/drei** (already installed): Adaptive performance — AdaptivePixelRatio to cap devicePixelRatio on mobile, PerformanceMonitor for dynamic quality adjustment based on FPS

**Performance-critical settings:**
- Canvas dpr capped at [1, 2] on mobile (prevents 3x/4x rendering on high-DPI phones)
- Tailwind mobile-first breakpoints already configured (sm/md/lg/xl/2xl)
- clsx + tailwind-merge already integrated via cn() utility

### Expected Features

Feature research separates table stakes (expected behaviors) from differentiators (competitive advantages). Most table stakes leverage existing infrastructure: WebSocket reconnection handles mobile network interruptions, emote events already exist, phase transitions are ready for animation hooks.

**Must have (table stakes):**
- JRPG UI theming: Ornamental frames on panels/modals, readable busy menus with WCAG AA contrast, phase-consistent visual language, UI sound effects (button clicks, phase transitions), smooth state transitions (100-500ms)
- Mobile UX: Touch-friendly 44x44px minimum tap targets, safe area handling for notches/rounded corners, landscape + portrait support, network interruption UX with visible reconnection status, lightweight asset optimization
- Routing/SEO: Unique meta tags per route via React Helmet, Open Graph tags for social sharing, clean URL structure (no hash routing), server-side rendering for social crawlers ONLY (not full SSR—avoids Google cloaking penalty)
- Lobby interactions: Enhanced emote system visibility, player readiness indicators, idle character animations during waiting

**Should have (differentiators):**
- Class-specific UI flourishes: UI accents reflect player's chosen class (color, icons, borders) for Persona-style personalization
- Charge/magic system polish: Visual effects for hold-to-charge mechanic (server events already exist via `player_charge`)
- Adaptive UI density: Switch between compact (mobile) and spacious (desktop) layouts based on viewport
- Haptic feedback: Vibration on button press, attack hit (Navigator Vibration API, user-controlled)

**Defer (v2+):**
- Pixel-perfect animations (sprite sheets, high complexity)
- Gesture controls (swipe, pinch, long-press)
- Dynamic lobby OG images (server-side image generation)
- Lobby mini-games (scope creep risk, only if wait times become problematic)
- Player collision physics (fun but non-essential)

### Architecture Approach

Architecture research recommends routing layer separation: website routes (SEO-optimized marketing pages without Three.js) vs game module routes (Three.js-enabled real-time experience). This prevents Three.js bundle overhead on public pages. React Router defines routes, Zustand stores remain router-agnostic, Socket.IO connection persists across route changes with route-specific event handler subscriptions.

**Major components:**
1. **Router Shell**: BrowserRouter wrapper with route definitions and meta tag management via React Helmet. Website Layout wraps marketing pages (no Three.js dependency). Game Layout wraps game session (persistent UI like audio controls, connection status).
2. **Domain-Separated Managers** (server-side): SessionManager (player/lobby lifecycle), EstimationManager (voting/consensus), CombatManager (battle mechanics). Communicate via internal EventBus rather than direct method calls. This avoids monolithic GameState coupling.
3. **Phase Components** (client-side): Phase-specific UI (BattleScreen, RevealPhase, etc.) mounted based on `gamePhase` from server state machine. Three.js Canvas lifecycle managed carefully—mounted only when needed, explicit cleanup to prevent WebGL context leaks.
4. **JRPG Design System**: Reusable themed components (GamePanel, GameButton, StatBar) with CSS custom property tokens for colors, spacing, borders. Prevents inconsistent theming across 20+ phase components.
5. **Responsive Strategy**: Mobile-first Tailwind classes for styling, react-responsive hooks for behavior changes (disable particle effects, adjust Three.js quality), container queries (optional) for component-level responsiveness.

**Critical patterns:**
- Route-based code splitting: Lazy load Three.js-heavy components only when game routes accessed
- Fine-grained events: Replace coarse `lobby_updated` with specific events (`player_voted`, `boss_damaged`, `phase_changed`) to reduce bandwidth
- Three.js state mutations in `useFrame`, NOT via React state updates (avoids re-render overhead)
- Server state as authoritative for game phases; URLs reflect state, don't drive it (prevents URL vs state machine conflicts)

### Critical Pitfalls

Top pitfalls from research focus on Three.js lifecycle management, mobile input handling, and architecture conflicts.

1. **Canvas Context Loss on Route Changes (CRITICAL)** — WebGL renderer leaks GPU memory when Canvas unmounts. Browsers limit contexts (8-16), causing black screens. Prevention: Keep Canvas mounted across routes using CSS visibility, not unmounting. If unmounting necessary, explicitly dispose renderer, geometries, materials, textures. Detection: Monitor `renderer.info.memory` for climbing counts.

2. **Dual Input Handling - Touch/Mouse Conflicts (CRITICAL)** — Mobile browsers fire both touch and synthesized mouse events. Without handling, game actions fire twice (double votes, double ability activations). Prevention: Use pointer events (pointerdown/up/move), set `touch-action: none` on canvas, minimum 44x44px touch targets, `preventDefault()` on touch events. Detection: Test all interactive elements with touch.

3. **State Machine vs URL Navigation Conflicts (CRITICAL)** — Game phases are server-driven state machine (lobby → avatar → battle → ...). Adding URL routing creates dual sources of truth. Prevention: Server state machine remains authoritative, URLs reflect (don't drive) game state, only non-game pages use URL-driven routing, game module gets single route `/game/:lobbyId` with phases managed internally.

4. **JRPG Theming Prioritizes Aesthetics Over Usability (MODERATE)** — Ornate borders obscure content, pixel fonts hard to read at small sizes, dark themes reduce contrast. Prevention: WCAG AA contrast ratios minimum (4.5:1 text, 3:1 large), use JRPG theming for decorations but keep text readable, test with axe-core (already integrated), progressive disclosure without information overload.

5. **Desktop Graphics Overwhelm Mobile GPUs (MODERATE)** — Three.js effects (shadows, particles, post-processing) designed for desktop cause mobile thermal throttling, battery drain, frame drops. Prevention: Cap devicePixelRatio to 2 on mobile, disable shadows/reduce particles, use PerformanceMonitor for auto-downgrade, provide quality presets (High/Medium/Low). Detection: Monitor FPS on mid-range phone, check battery drain during 30-min session.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: JRPG Theme Foundation
**Rationale:** Building a design system first prevents rework. All subsequent UI work inherits theme tokens, reusable components, and animation patterns. Research shows JRPG theming affects every phase component (20+ components), making upfront standardization critical to avoid inconsistency (Pitfall PIT-10).

**Delivers:**
- JRPG design system with reusable themed components (GamePanel, GameButton, StatBar, HealthBar)
- CSS custom property tokens (colors, spacing, borders, shadows, fonts)
- UI sound effects library integrated with Howler.js or Web Audio API
- Smooth state transition animations (100-500ms using Framer Motion)
- Phase-consistent visual language applied to lobby, avatar selection, battle

**Addresses:**
- Table stakes: Ornamental frames/borders, readable busy menus, phase-consistent theming, UI sound effects, smooth state transitions
- Architecture: Component library with theme tokens, reusable JRPG-styled components

**Avoids:**
- PIT-10 (Theme inconsistency across phase components) — design system establishes standards upfront
- PIT-06 (Aesthetics over usability) — build accessibility testing into design system creation

**Duration:** Medium (component refactoring, asset sourcing)
**Dependencies:** None — foundational work

---

### Phase 2: Mobile UX Critical Path
**Rationale:** Mobile represents majority of web game traffic. Ensuring core UX works on primary device type before polish work prevents mobile-specific issues discovered late. Research emphasizes 44px minimum touch targets (Pitfall PIT-04) and safe area handling as non-negotiable for mobile games.

**Delivers:**
- Touch-friendly tap targets (44px minimum enforced across all phases)
- Safe area handling for notches, rounded corners, home gesture zones (CSS env() variables)
- Dual orientation support (landscape for battle, portrait for lobby/menus)
- Mobile Canvas settings with adaptive performance (capped DPR, quality regression)
- Network interruption UX enhancements (visible connection status using existing reconnection system)

**Addresses:**
- Table stakes: Touch targets, safe areas, orientation support, network interruption UX, lightweight assets
- Differentiators: Adaptive UI density (compact mobile vs spacious desktop)
- Critical pitfalls: PIT-02 (Camera aspect ratio on orientation change), PIT-04 (Touch/mouse conflicts), PIT-08 (Desktop graphics overwhelm mobile)

**Avoids:**
- Desktop-only UX that breaks on mobile
- Accidental taps from insufficient spacing
- WebGL performance issues on mobile GPUs

**Duration:** Medium (UI audit, responsive refactor, mobile testing)
**Dependencies:** Phase 1 (reusable themed components make responsive refactor easier)

---

### Phase 3: Routing & SEO Infrastructure
**Rationale:** Can be developed in parallel with UI work since routing layer has minimal overlap with theming/mobile. React Router already installed (unused), making integration straightforward. Social crawler middleware is moderate complexity but isolated from game logic.

**Delivers:**
- React Router v7 integration (upgrade from existing v6.26.0)
- Clean URL structure without hash fragments (`/lobby/abc123` not `/#/lobby?id=abc123`)
- React Helmet Async for dynamic meta tags per route
- Open Graph + Twitter card tags for rich social sharing previews
- vite-react-ssg for static marketing page pre-rendering
- Express middleware for social crawler detection (meta tags in initial HTML)

**Addresses:**
- Table stakes: Unique meta tags per route, Open Graph tags, clean URLs, server-side rendering for crawlers
- Architecture: Route-based code splitting (lazy load Three.js only for game routes)

**Avoids:**
- PIT-07 (SEO effort wasted on authenticated/game routes) — SEO only on public pages, game routes get `noindex` meta
- PIT-05 (State machine vs URL conflicts) — URLs reflect server state, don't drive it
- Hash routing that breaks SEO

**Duration:** Low-Medium (routing straightforward, middleware moderate)
**Dependencies:** None — parallel to Phase 1/2

---

### Phase 4: Lobby Polish & Animations
**Rationale:** Builds on theme foundation and mobile UX. Adds differentiators after table stakes established. Server events for emotes and charge system already exist, making this primarily UI polish work rather than backend complexity.

**Delivers:**
- Enhanced emote UI (make existing `lobby_emote`/`battle_emote` events more visible)
- Player readiness indicators (visual cue showing who's ready to start)
- Idle character animations during waiting periods
- Charge/magic system visual polish (effects for existing `player_charge` events)
- Smooth phase transition animations (hooks on existing `GamePhase` state machine)

**Addresses:**
- Table stakes: Enhanced emote system, readiness indicators, idle animations
- Differentiators: Charge/magic system polish, emote wheel/quick chat, haptic feedback

**Avoids:**
- Static lobby that feels dead
- Jarring phase transitions without visual continuity

**Duration:** Low-Medium (UI polish, animation timing, playtesting)
**Dependencies:** Phase 1 (theme foundation for consistent animations), Phase 2 (touch-friendly emote interactions)

---

### Phase Ordering Rationale

- **Theme first:** Prevents rework. All UI work in subsequent phases inherits design system. Research shows 20+ phase components need consistent theming—upfront standardization is critical.
- **Mobile second:** Ensures core UX works on primary device type (mobile web games see 85% mobile traffic per research). Building on themed components makes responsive refactor easier.
- **Routing parallel:** Minimal overlap with UI work. Can be developed alongside Phases 1-2. Integration happens at App.tsx level without touching individual components.
- **Lobby polish last:** Builds on theme + mobile foundation. Adds differentiators after table stakes met. Server events already exist, making this straightforward UI work.

**Dependency flow:**
```
Phase 1 (Theme Foundation) → Phase 2 (Mobile UX) → Phase 4 (Lobby Polish)
                    ↓
Phase 3 (Routing/SEO) [parallel, integrates at end]
```

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 1 (Theme):** Asset sourcing for audio library (research found design principles but not specific royalty-free sources). Need to explore freesound.org, OpenGameArt.org, itch.io for UI sound effects.
- **Phase 3 (Routing):** Social crawler middleware implementation. User-agent detection needs careful implementation to avoid false positives (blocking real users) or false negatives (missing crawlers). May need deeper research on Vite/Express integration patterns.

**Phases with standard patterns (skip research-phase):**
- **Phase 2 (Mobile):** Safe area handling well-documented. CSS env() variables are standard. Touch targets have established minimums (44px Apple HIG, 48dp Material Design).
- **Phase 4 (Lobby):** Straightforward polish work. Animation timing may need playtesting but no research needed.

### Technical Unknowns Requiring Validation

- **Performance impact of JRPG frames:** Will ornamental CSS borders or canvas-based pixel art frames affect frame rate on mobile? Test during Phase 1.
- **Social crawler reliability:** How to test that crawlers receive correct meta tags without manual verification on each platform? May need test tooling during Phase 3.
- **Dual-orientation UX flow:** Should app hint/enforce orientation change, or adapt silently? User testing needed during Phase 2.
- **View Transitions API browser support:** Modern API for phase transitions. Need fallback for older browsers (Framer Motion already installed as fallback).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing dependencies cover most needs. React Router, react-helmet-async already installed. vite-react-ssg and react-responsive are well-documented additions. Version compatibility verified. |
| Features | HIGH | Table stakes clearly defined from mobile game UX research. Existing server events (emotes, charge) validated in codebase. Feature dependencies mapped. |
| Architecture | HIGH | Routing layer separation pattern verified across multiple React + Three.js projects. Component boundaries align with existing codebase structure. Socket.IO persistence pattern already implemented. |
| Pitfalls | HIGH | Critical pitfalls (Canvas context loss, dual input, state machine conflicts) sourced from React Three Fiber official docs and mobile web game best practices. Mitigation strategies proven. |

**Overall confidence:** HIGH

Research synthesizes patterns from authoritative sources (React Router docs, Three.js migration guides, WCAG 2.1 guidelines, mobile web game best practices) with analysis of existing ScrumQuest codebase. All recommended technologies have official documentation and current version verification (2026-02-11). Architecture patterns align with existing implementation (Zustand, Socket.IO, phase-based state machine).

### Gaps to Address

**Areas where research was inconclusive:**
- **Audio asset sourcing:** Found design principles (UI sound effects need pitch/volume variation to prevent fatigue) and integration patterns (Howler.js vs Web Audio API), but not specific asset libraries or creation workflows. Gap: Need to research royalty-free game sound effect sources during Phase 1 planning.
- **Social crawler user-agent detection:** General approach documented (check user-agent header, inject meta tags for crawlers), but specific implementation for Vite/Express needs validation. Risk of false positives or false negatives. Gap: Test with actual social platform crawlers during Phase 3.
- **View Transitions API browser support:** Modern API available in Chrome 111+, Safari 17.4+, but support across target devices needs verification. Fallback strategy (Framer Motion) already exists. Gap: Test on target mobile browsers during Phase 1.

**Topics needing phase-specific research later:**
- **Phase 1 (Theme):** Audio integration patterns for React apps. Pixel art asset creation or sourcing workflow. Animation timing for JRPG feel (100ms vs 250ms vs 500ms transitions).
- **Phase 2 (Mobile):** Testing methodology for safe areas across devices. Emulator vs real device testing requirements. Dual-orientation testing strategy.
- **Phase 3 (Routing):** Social crawler detection implementation details. Meta tag validation for different platforms (Twitter, Discord, Slack, LinkedIn). vite-react-ssg configuration for hybrid static/dynamic approach.
- **Phase 4 (Lobby):** Idle animation loops (sprite sheets vs CSS animations). Emote UI patterns (toast vs bubble vs overhead display).

## Sources

### Primary (HIGH confidence)
- **Stack:** React Router v7 official docs, react-helmet-async GitHub, Tailwind CSS responsive design guide, @react-three/drei scaling performance docs
- **Features:** Game UI Database (gameuidatabase.com), mobile game UX best practices (genieee.com, pixune.com), WCAG 2.1 guidelines
- **Architecture:** React Three Fiber official docs, React Router v6 guide, Socket.IO with React integration guide, domain-driven design patterns (DDD Academy, HackerNoon)
- **Pitfalls:** Three.js migration guides, React Three Fiber discussions (GitHub), mobile web game development (gamedeveloper.com), WCAG accessibility guidelines

### Secondary (MEDIUM confidence)
- Framer Motion vs GSAP comparison (blog.logrocket.com 2026), React Router + Three.js integration (2023 blog post - patterns still valid), vite-react-ssg GitHub repo, react-responsive NPM package

### Tertiary (LOW confidence - flagged for validation)
- JRPG color schemes (generic game asset marketplaces - need custom design), social crawler middleware patterns (community discussions - need testing)

### Additional Context Files
- `.planning/research/UI_ROUTING_ARCHITECTURE.md` — Detailed routing patterns and component boundaries
- `.planning/research/STACK-ui-mobile-routing.md` — Howler.js audio library, safe area CSS, asset optimization
- `.planning/research/SUMMARY-ui-mobile-routing.md` — Early synthesis focusing on UI/routing domain

---
*Research completed: 2026-02-11*
*Ready for roadmap: YES*
