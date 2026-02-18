# Pitfalls Research: UI Redesign, Mobile, & Routing for Three.js Game

**Domain:** Responsive JRPG UI redesign, mobile game UX, routing/SEO for existing React + Three.js real-time multiplayer app
**Researched:** 2026-02-11
**Confidence:** HIGH

---

## Critical Pitfalls

### PIT-01: Canvas Context Loss on Route Changes
**Risk:** HIGH | **Phase:** Routing/Architecture
**Problem:** WebGL renderer leaks GPU memory when React Router unmounts the Three.js Canvas component. Each route transition creates a new WebGL context — browsers limit these (typically 8-16), causing black screens or crashes.
**Prevention:**
- Keep Canvas mounted across routes — render it once at the app level, not per-route
- Use CSS visibility/display to hide the canvas rather than unmounting
- If unmounting is necessary, explicitly dispose renderer, geometries, materials, and textures
**Detection:** Monitor `renderer.info.memory` for climbing geometry/texture counts. Test route transitions in a loop.

### PIT-02: Camera Aspect Ratio on Mobile Orientation Change
**Risk:** HIGH | **Phase:** Responsive/Mobile
**Problem:** Three.js camera aspect ratio doesn't auto-update on device rotation. Results in stretched/squished 3D scenes after orientation change.
**Prevention:**
- Listen for `resize` events and update `camera.aspect` + `camera.updateProjectionMatrix()`
- Use `@react-three/drei`'s `AdaptiveDpr` and `AdaptiveEvents` for automatic handling
- Test both portrait and landscape on actual devices
**Detection:** Rotate device during gameplay. Check if 3D elements maintain correct proportions.

### PIT-03: Socket.IO Reconnection During Mobile Network Transitions
**Risk:** HIGH | **Phase:** Mobile/Infrastructure
**Problem:** Mobile devices frequently switch networks (WiFi ↔ cellular, tunnel dead zones). Socket.IO reconnection may lose game state or create duplicate connections.
**Prevention:**
- Already have reconnection with grace period and token (validated v1.0) — verify it handles mobile network switches
- Test with network throttling and airplane mode toggling
- Ensure server-side state survives reconnection window
**Detection:** Toggle airplane mode during active game. Switch WiFi on/off. Verify state resync.

### PIT-04: Dual Input Handling — Touch/Mouse Conflicts
**Risk:** HIGH | **Phase:** Mobile/UI
**Problem:** Mobile browsers fire both touch and synthesized mouse events. Without proper handling, game actions fire twice (double votes, double ability activations). Touch targets too small for fingers.
**Prevention:**
- Use `pointer` events (pointerdown/up/move) instead of separate mouse/touch handlers
- Set `touch-action: none` on game canvas to prevent browser gestures
- Minimum 44x44px touch targets (Apple HIG), 48x48dp (Material Design)
- `preventDefault()` on touch events to suppress synthesized mouse events
**Detection:** Test all interactive elements with touch. Verify no double-fire on taps.

### PIT-05: State Machine vs URL Navigation Conflicts
**Risk:** HIGH | **Phase:** Routing/Architecture
**Problem:** Game phases are server-driven state machine (lobby → avatar → battle → ...). Adding URL routing creates dual sources of truth — URL says `/game/battle` but server says phase is `scoring`.
**Prevention:**
- Server state machine remains authoritative for game phases
- URLs reflect game state, not drive it (read-only URL sync)
- Only non-game pages (landing, create, join) use URL-driven routing
- Game module gets a single route (`/game/:lobbyId`) with phases managed internally
**Detection:** Navigate directly to `/game/:id/battle` — should redirect to current actual phase.

---

## Moderate Pitfalls

### PIT-06: JRPG Theming Prioritizes Aesthetics Over Usability
**Risk:** MEDIUM | **Phase:** UI Design
**Problem:** JRPG-themed interfaces can sacrifice readability for style — ornate borders obscure content, pixel fonts are hard to read at small sizes, dark themes reduce contrast.
**Prevention:**
- WCAG AA contrast ratios minimum (4.5:1 text, 3:1 large text)
- Use JRPG theming for frames/borders/decorations, keep text in readable fonts
- Test with axe-core (already integrated from v1.2)
- Progressive disclosure — show JRPG flair without information overload
**Detection:** Run accessibility tests. User test with non-gamers.

### PIT-07: SEO Effort Wasted on Authenticated/Game Routes
**Risk:** MEDIUM | **Phase:** Routing/SEO
**Problem:** Spending effort on SEO for routes that require authentication or active game state. Search engines can't index a live multiplayer game.
**Prevention:**
- SEO only on public pages: landing, features, how-to-play, about
- Game routes (`/game/*`) get `noindex` meta
- Use pre-rendering (vite-react-ssg) only for marketing pages
- Focus crawl budget on content that converts (landing → create game)
**Detection:** Check Google Search Console for indexed URLs after launch.

### PIT-08: Desktop Graphics Settings Overwhelm Mobile GPUs
**Risk:** MEDIUM | **Phase:** Mobile/Performance
**Problem:** Three.js effects (shadows, particle systems, post-processing) designed for desktop GPUs cause mobile devices to thermal throttle, drain battery, and drop frames.
**Prevention:**
- Cap `devicePixelRatio` to 2 on mobile (window.devicePixelRatio can be 3+ on modern phones)
- Disable shadows and reduce particle counts on mobile
- Use `@react-three/drei` `PerformanceMonitor` to auto-downgrade
- Provide quality presets: High (desktop), Medium (tablet), Low (phone)
**Detection:** Monitor FPS on mid-range phone. Check battery drain during 30-min session.

### PIT-09: Z-Index Chaos Between Three.js Canvas and HTML Overlays
**Risk:** MEDIUM | **Phase:** UI Architecture
**Problem:** Three.js Canvas and HTML UI elements compete for stacking context. Tooltips, modals, and menus get trapped behind the canvas or fail to receive pointer events.
**Prevention:**
- Define clear z-index layers: canvas (0), game HUD (10), modals (100), toasts (1000)
- Use `@react-three/drei`'s `Html` component for in-scene UI that needs to overlay 3D
- Set `pointer-events: none` on canvas container when modals are open
**Detection:** Open every modal/tooltip during battle. Verify clickability and visibility.

### PIT-10: Theme Inconsistency Across 20+ Phase Components
**Risk:** MEDIUM | **Phase:** UI Design System
**Problem:** With many phase components (avatar selection, battle, scoring, reveal, discussion, victory, game over), inconsistent theming creeps in — different border styles, spacing, color usage.
**Prevention:**
- Build a JRPG design system with reusable themed components (GamePanel, GameButton, StatBar, etc.)
- Define tokens: colors, spacing, borders, shadows, fonts
- Apply theme via shared components, not per-phase CSS
**Detection:** Screenshot every phase. Visual diff for consistency.

---

## Minor Pitfalls

### PIT-11: Mobile Keyboard Pushes Game UI Off-Screen
**Risk:** LOW | **Phase:** Mobile/UI
**Problem:** Virtual keyboard on mobile resizes viewport, pushing game elements off screen or behind the keyboard. Particularly problematic during voting (number input) and discussion (text input).
**Prevention:**
- Use `visualViewport` API to detect keyboard presence
- Scroll relevant input into view, or use fixed-position input overlays
- Avoid `100vh` — use `100dvh` (dynamic viewport height) or `window.visualViewport.height`
**Detection:** Open keyboard on every input field. Check if game remains usable.

### PIT-12: Slow Three.js Initial Load on Mobile Networks
**Risk:** LOW | **Phase:** Performance
**Problem:** Three.js bundle + 3D assets can be large. On slow mobile networks, users see blank screen for extended periods.
**Prevention:**
- Code-split Three.js game module from marketing pages
- Lazy-load 3D assets after initial page render
- Show JRPG-styled loading screen with progress bar
- Pre-load critical assets during lobby phase
**Detection:** Test on 3G throttling. Measure Time to Interactive.

### PIT-13: React Strict Mode Double Canvas Initialization
**Risk:** LOW | **Phase:** Development
**Problem:** React 18 Strict Mode in dev double-invokes effects, causing Two Three.js renderers to initialize (memory waste, potential flickering).
**Prevention:**
- This is dev-only (Strict Mode doesn't run in production)
- Use refs to guard against double initialization if it causes issues
**Detection:** Check browser dev tools for multiple WebGL contexts in development.

### PIT-14: SEO Meta Tags Not Updated Per Route
**Risk:** LOW | **Phase:** SEO
**Problem:** SPA default is a single set of meta tags. Without per-route updates, all pages show the same title/description in search results.
**Prevention:**
- Use react-helmet-async (already installed per Stack research) for per-route meta
- Define unique title, description, og:image for each public page
- Test with `curl` or Google Rich Results tester
**Detection:** View page source on each route. Check meta tags are unique.

### PIT-15: Zustand State Lost on Page Refresh / Hard Navigation
**Risk:** LOW | **Phase:** Routing
**Problem:** Zustand stores are in-memory. Full page refresh loses game state. With proper routing, users might hit refresh or use browser back/forward.
**Prevention:**
- Game state is server-authoritative (already validated) — client re-fetches on reconnect
- Reconnection token system (validated v1.0) handles this
- Store lobby ID in URL params so refresh reconnects to same game
**Detection:** Refresh browser during active game. Verify state restoration.

---

## Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| Critical | 5 | Three.js lifecycle, dual input, state machine vs routes |
| Moderate | 5 | Accessibility, SEO scope, mobile performance, consistency |
| Minor | 5 | Mobile keyboard, loading, dev mode, meta tags, state persistence |

**Most impactful prevention:** Keep Three.js Canvas mounted across routes, use server state as single source of truth for game phases, build a JRPG design system early for consistency.

---
*Researched: 2026-02-11*
*Sources: React Three Fiber docs, Three.js migration guides, mobile web game best practices, WCAG 2.1 guidelines*
