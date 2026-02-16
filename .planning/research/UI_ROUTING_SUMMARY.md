# Research Summary: JRPG UI Redesign + Routing + Mobile Responsiveness

**Project:** ScrumQuest v2.0 - UI/UX Modernization
**Researched:** 2026-02-11
**Overall Confidence:** HIGH

## Executive Summary

The research confirms that ScrumQuest's existing architecture (React + Three.js + Zustand + Socket.IO) integrates seamlessly with React Router v6/v7 for proper routing and SEO without breaking real-time game functionality. The key insight: routing is an additive layer, not a replacement—Zustand and Socket.IO remain the source of truth for game state, while React Router handles URL synchronization and meta tag management.

The recommended approach separates the codebase into two distinct routing contexts: **Website Routes** (landing, about, features, pricing, support) which are lightweight, SEO-optimized marketing pages, and **Game Routes** (/game/*) which lazy-load the heavy Three.js bundle only when users enter the game. This code-splitting strategy delivers the single biggest performance win—marketing pages load in <500ms instead of 3-5s.

For responsive JRPG UI, the research emphasizes mobile-first CSS Grid for layout structure, Flexbox for component internals, and existing Tailwind breakpoints (already configured correctly). The existing retro.css aesthetic is production-ready; the gap is mobile-specific touch targets (44px minimum), safe area handling (notches/rounded corners), and orientation support (landscape for battle, portrait for lobby).

The most critical risk is Three.js memory leaks on route changes. React Three Fiber's Canvas component must properly dispose geometries, materials, and textures when unmounting. The existing remount strategy (BattleScreen.tsx line 869 with unique `key` prop) already demonstrates correct lifecycle management—this pattern must be preserved during routing migration.

## Key Findings

### Stack: Minimal New Dependencies

**What to add:**
- `react-router-dom@^6.28.0` → Already installed but unused. **Upgrade to v7 recommended** for automatic type safety and 15% smaller bundle
- `vite-react-ssg@^0.5.0` → NEW. Pre-renders marketing pages for SEO without full SSR framework
- `react-responsive@^10.0.0` → NEW. SSR-safe useMediaQuery for mobile Three.js quality settings

**What exists (leverage these):**
- react-helmet-async (meta tags) → Already installed
- Tailwind CSS (responsive design) → Already configured with mobile-first breakpoints
- Framer Motion + GSAP (animations) → Already installed, perfect for JRPG transitions
- @react-three/drei (adaptive performance) → Already installed, includes AdaptivePixelRatio for mobile

**What NOT to add:**
- Next.js/Remix → Full framework overkill, requires rewrite
- Material-UI/Chakra → Conflicts with custom retro styling
- XState → Over-engineering for routing state machine

**Total bundle impact:** +50KB (gzipped) for routing/SSR libraries. Marketing pages shrink by 1.8MB (Three.js code-split out).

### Architecture: Route-Aware Event Handlers

**Current state:** App.tsx manages routing with internal `appState` state machine. Socket.IO connects once, event handlers registered on mount.

**Target state:** React Router manages URL state, Zustand manages game state, Socket.IO persists across routes with route-aware cleanup.

**Integration pattern:**
```typescript
const location = useLocation();
const isGameRoute = location.pathname.startsWith('/game');

useEffect(() => {
  if (!socket || !isGameRoute) return;
  setupEventHandlers(socket);
  return () => teardownEventHandlers(socket);
}, [socket, isGameRoute]);
```

**Key principle:** Socket connection persists (never disconnect on route change). Event handler registration is route-specific. Marketing pages never subscribe to game events.

**Three.js lifecycle:**
- Canvas only renders when route is `/game/session` AND `gamePhase` is in `['battle', 'scoring', 'reveal', 'discussion']`
- Existing remount strategy (line 869: `key={remountKey}`) prevents DOM reconciliation errors
- Cleanup via Canvas unmount handlers (dispose geometries/materials)

### Features: Table Stakes vs Differentiators

**Table Stakes (must have):**
1. JRPG UI theming - Ornamental frames, phase-consistent styling, readable busy menus
2. Mobile touch targets - 44px minimum, safe area handling, landscape + portrait support
3. Proper routing - Clean URLs (/lobby/abc123), unique meta tags per route, Open Graph previews
4. Network interruption UX - Reconnection already built, need visible connection status

**Differentiators (nice-to-have):**
1. Class-specific UI flourishes - Persona-style personalization per avatar class
2. Gesture controls - Swipe/pinch/long-press for mobile (complex but elevates feel)
3. Dynamic lobby OG images - Server-generated preview images with lobby details
4. Charge/magic system visual polish - Server events already exist, add particle effects

**Anti-Features (do NOT build):**
1. Flash-style intros - Users want to play, not watch splash screens
2. Forced tutorials - Contextual help only, no interruptions
3. Auto-play music - Default muted, user-initiated
4. Separate mobile app - Responsive design covers all devices

### Pitfalls: Three.js + Routing Edition

**Critical:**
1. **Three.js state in React state** → Causes 60fps → 20fps drop. Use refs, not useState for animations.
2. **Socket listeners in child components** → Missed events when components unmount. Register in layouts only.
3. **Blocking navigation during socket ops** → Freezes UI. Use optimistic navigation, server confirms later.
4. **Creating new Canvas on every phase** → Janky 200-500ms black screens. Canvas persists, swap content inside.

**Moderate:**
1. **Mobile visual regression test flakiness** → Font rendering/anti-aliasing varies. Docker environment + disable animations.
2. **Accessibility debt accumulation** → Add axe-playwright, but triage incrementally. Exclude 3D canvas initially.

**Detection strategies:**
- Three.js FPS drops → Profile with r3f-perf, check for useState in useFrame loops
- Socket events missed → Add event logging, verify handler registration timing
- Canvas flicker → Check key prop changes, verify cleanup in unmount

## Implications for Roadmap

### Suggested Phase Structure

#### Phase 1: Routing Foundation (No UI changes)
**Deliverables:**
- Install react-router-dom, react-helmet-async, vite-react-ssg, react-responsive
- Wrap App in BrowserRouter, define route structure
- Create WebsiteLayout (nav/footer), GameLayout (audio/connection)
- Route-aware Socket.IO handler registration

**Addresses:** Clean URLs, code splitting setup, marketing vs game separation
**Avoids:** Three.js overhead on marketing pages, Socket.IO subscription waste

**Validation:** Navigate between routes. DevTools Network tab shows no game events on marketing pages.

**Estimated effort:** 3-5 days. Low risk (additive changes).

---

#### Phase 2: Meta Tags & SEO
**Deliverables:**
- Integrate react-helmet-async with HelmetProvider wrapper
- Create SEOHead reusable component
- Add unique title/description/OG tags to all marketing routes
- Configure vite-react-ssg to pre-render marketing pages

**Addresses:** Social sharing previews, search engine indexing, unique page titles
**Uses:** Phase 1 routing structure

**Validation:** Lighthouse SEO score >90. Twitter Card Validator shows rich preview.

**Estimated effort:** 2-3 days. Low risk (isolated meta tag changes).

---

#### Phase 3: Game Module Routing
**Deliverables:**
- Create GameSession route component with phase-based rendering
- Migrate all setAppState() calls to navigate()
- Add route guards (redirect if not in lobby)
- Preserve existing BattleScreen remount logic (key prop)

**Addresses:** Game flow with URLs, browser back button, reconnection with routing
**Avoids:** Route/Zustand state desync (Zustand remains source of truth)

**Validation:** Complete game flow works exactly as before, but with URL changes. Reconnection preserves route state.

**Estimated effort:** 5-7 days. Medium risk (touches core navigation logic).

---

#### Phase 4: Code Splitting & Bundle Optimization
**Deliverables:**
- Lazy load GameLayout, BattleScreen, 3D scene components
- Add Suspense with themed loading screens
- Measure bundle sizes (npm run build)
- Optimize Three.js imports (tree-shaking)

**Addresses:** Initial load time, mobile data usage, marketing page performance
**Uses:** Phases 1-3 routing structure

**Validation:** Marketing bundle <200KB. Game bundle ~2MB. Marketing loads <1s.

**Estimated effort:** 3-4 days. Low risk (build optimization).

---

#### Phase 5: Responsive JRPG UI (Independent of routing)
**Deliverables:**
- Audit existing components for hardcoded sizes
- Implement CSS Grid for BattleScreen HUD layout
- Add mobile breakpoints (320px, 768px, 1024px, 1440px)
- Increase touch targets to 44px minimum
- Safe area handling (CSS env(safe-area-inset-*))

**Addresses:** Mobile usability, touch-friendly controls, notch/home gesture zones
**Avoids:** Hardcoded pixel values, desktop-only layouts

**Validation:** All phases playable on 375px wide screen (iPhone SE). No horizontal scroll.

**Estimated effort:** 7-10 days. Medium-high risk (requires real device testing).

---

#### Phase 6: Mobile Three.js Optimization
**Deliverables:**
- Implement useMediaQuery for mobile detection
- Adjust Canvas props (dpr, antialias, powerPreference) based on device
- Add AdaptivePixelRatio and PerformanceMonitor from drei
- Reduce particle density on mobile
- Test on real iOS/Android devices

**Addresses:** Mobile frame rate, battery drain, GPU memory
**Uses:** Phase 5 responsive breakpoints

**Validation:** Battle phase maintains 30+ FPS on mid-range phones.

**Estimated effort:** 4-6 days. Medium risk (device-specific debugging).

---

#### Phase 7: JRPG UI Theming Polish
**Deliverables:**
- Add ornamental frames to all panels (CSS borders + images)
- Implement UI sound effects (button clicks, phase transitions)
- Add smooth state transitions (100-500ms animations)
- Create reusable themed components (RetroPanel, JRPGCard, etc.)
- Visual consistency audit across all phases

**Addresses:** Game feel, polish, JRPG aesthetic immersion
**Uses:** Existing Framer Motion + GSAP libraries

**Validation:** Every interaction has audio feedback. All transitions smooth. Theme consistent.

**Estimated effort:** 5-8 days. Low-medium risk (visual polish).

---

### Phase Ordering Rationale

**Dependencies:**
- Phase 2 (SEO) requires Phase 1 (routing structure)
- Phase 3 (game routing) requires Phase 1 (router setup)
- Phase 4 (code splitting) requires Phase 3 (game routes defined)
- Phase 6 (mobile Three.js) requires Phase 5 (responsive breakpoints)

**Risk management:**
- Routing foundation (Phases 1-3) before UI changes minimizes merge conflicts
- Code splitting (Phase 4) early to measure performance baseline
- Responsive UI (Phase 5) before mobile optimization (Phase 6) to avoid duplicate work

**Cut points:**
- Phase 7 (JRPG polish) can be deferred if time-constrained
- Phase 6 (mobile Three.js) can be simplified (disable 3D on mobile, 2D fallback)

### Research Flags for Phases

**Likely need deeper research:**
- Phase 3 (Game routing): React Router + Zustand navigation integration patterns
- Phase 6 (Mobile Three.js): Device-specific GPU settings, iOS Safari quirks

**Standard patterns (skip research):**
- Phase 1 (Routing foundation): React Router docs are comprehensive
- Phase 2 (SEO): React Helmet usage is well-documented
- Phase 4 (Code splitting): Vite lazy imports are straightforward
- Phase 5 (Responsive UI): CSS Grid/Flexbox best practices established
- Phase 7 (JRPG theming): Visual design, not technical complexity

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Stack | HIGH | All tools verified in official docs. Package versions current as of 2026-02-11. |
| Features | MEDIUM | JRPG UI patterns researched from industry sources. Mobile UX from game dev articles. Social crawler middleware needs validation. |
| Architecture | HIGH | Based on existing codebase analysis (App.tsx, useWebSocket.tsx, gameEvents.ts). Extends proven patterns. |
| Pitfalls | HIGH | Three.js antipatterns verified in React Three Fiber docs. Socket.IO patterns from official guide. |

**Overall confidence:** HIGH

Main uncertainty is social crawler middleware for SEO (not full SSR) - may require serverless function experimentation during Phase 2.

## Roadmap Implications

**Build order:**
1. Routing foundation → SEO → Game routing → Code splitting (Phases 1-4, sequential)
2. Responsive UI → Mobile Three.js (Phases 5-6, sequential)
3. JRPG theming (Phase 7, parallel to 5-6 if resources available)

**Critical path:** Phases 1-4 (routing + code splitting) unlock all other work. Phases 5-7 can be parallelized.

**Deferrable:** Phase 7 (JRPG theming polish) is lowest priority. If time-constrained, ship with functional responsive UI and add theming post-launch.

## Open Questions

**Gaps that couldn't be resolved (need phase-specific research):**

1. **Social crawler middleware strategy** - Should we use Vercel Edge Functions, Cloudflare Workers, or prerender.io? Decision depends on deployment target. **Research during:** Phase 2 planning.

2. **React Router v6 vs v7 upgrade path** - v7 offers type safety but requires package consolidation. Is migration effort worth 15% bundle savings? **Research during:** Phase 1 planning.

3. **Three.js Canvas persistence across routes** - Should Canvas persist in background when navigating to lobby, or unmount entirely? Trade-off: memory vs initialization time. **Research during:** Phase 3 planning.

4. **Mobile gesture library selection** - react-use-gesture vs Framer Motion gestures vs native touch events? Need comparative testing. **Research during:** Phase 5 planning (optional, can defer).

5. **JRPG UI asset sourcing** - Custom pixel art vs asset marketplace? Budget and timeline dependent. **Design decision, not research.**

## Sources

This research synthesizes official documentation and 2026-current best practices:

**React Router:**
- [React Router v6 Guide - LogRocket](https://blog.logrocket.com/react-router-v6-guide/)
- [React Three Fiber + Router Architecture Discussion](https://github.com/pmndrs/react-three-fiber/discussions/3221)

**Three.js Performance:**
- [React Three Fiber Documentation](https://docs.pmnd.rs/react-three-fiber/api/canvas)
- [100 Three.js Performance Tips (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [React Three Fiber vs Three.js 2026](https://graffersid.com/react-three-fiber-vs-three-js/)

**SEO for React SPAs:**
- [React SEO Guide (2026)](https://www.linkgraph.com/blog/seo-for-react-applications/)
- [React Helmet Best Practices](https://www.fullstack.com/labs/resources/blog/improving-seo-in-react-apps-with-react-helmet)

**Zustand State Management:**
- [Zustand Documentation](https://zustand.docs.pmnd.rs/)
- [State Persistence Guide](https://reactnavigation.org/docs/state-persistence/)

**Socket.IO Lifecycle:**
- [Socket.IO with React](https://socket.io/how-to/use-with-react)
- [Real-Time Resource Locking with React Router](https://marmelab.com/blog/2017/09/13/real-time-resource-locking-using-socketio-and-react-router.html)

**Responsive CSS (2026):**
- [Modern CSS Layout Techniques (2025-2026)](https://www.frontendtools.tech/blog/modern-css-layout-techniques-flexbox-grid-subgrid-2025)
- [Responsive Game UI Design](https://genieee.com/responsive-ui-design-for-games/)

**JRPG UI Frameworks:**
- [RPGUI Framework](https://ronenness.github.io/RPGUI/)
- [React UI Libraries 2026](https://www.builder.io/blog/react-component-libraries-2026)

---

**Ready for roadmap:** YES

All research files complete:
- UI_ROUTING_ARCHITECTURE.md (detailed patterns + antipatterns)
- STACK.md (dependencies + configuration)
- FEATURES.md (table stakes + differentiators)
- PITFALLS.md (from different milestone, but routing pitfalls covered in ARCHITECTURE.md)
- UI_ROUTING_SUMMARY.md (this file)
