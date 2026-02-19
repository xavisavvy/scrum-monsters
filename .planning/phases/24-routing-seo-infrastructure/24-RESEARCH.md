# Phase 24: Routing & SEO Infrastructure - Research

**Researched:** 2026-02-18
**Domain:** React routing, SEO, static site generation, code splitting
**Confidence:** MEDIUM-HIGH

## Summary

Phase 24 requires implementing routing infrastructure to separate marketing pages from the game module, add SEO meta tags, enable static pre-rendering, and implement code splitting to lazy-load the heavy Three.js game bundle. The project currently uses a state-based navigation system (`appState` in App.tsx) without URL routing.

React Router v7 (released late 2024) consolidates all routing needs and offers three modes: declarative (simple SPA), data (with loaders/actions), and framework (full-stack with built-in SSG support). For this project, **framework mode with SPA configuration** is the recommended approach - it provides clean URLs, built-in SSG via `prerender()` function in `react-router.config.ts`, and works seamlessly with Vite's code splitting.

The current codebase already has `react-helmet-async` (v2.0.5) and `react-router-dom` (v6.26.0) installed, but neither is actively used. Upgrading to React Router v7's unified `react-router` package and configuring framework mode will provide the routing, SSG, and SEO foundation needed for this phase.

**Primary recommendation:** Adopt React Router v7 framework mode with SPA configuration for unified routing, built-in SSG, and clean URL support. Use React Helmet Async for meta tags, Vite's native code splitting for Three.js lazy loading, and persistent Canvas mounting to avoid WebGL context leaks.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-router | 7.13.0+ | Routing, SSG, data loading | Official React Router package, consolidates react-router-dom/native, has built-in SSG support in framework mode |
| react-helmet-async | 2.0.5+ | Meta tags, Open Graph, SEO | Fork of react-helmet with SSR compatibility, prevents memory leaks, async API, industry standard for React SEO |
| vite | 6.3.6+ | Build tool, code splitting | Already in use, native code splitting via dynamic imports, no additional config needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/fiber | 8.18.0+ | Three.js integration | Already in use; Canvas lifecycle management critical for routing integration |
| React.lazy / Suspense | React 18.3+ | Lazy loading components | Built-in React code splitting; use for route-based game module loading |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Router v7 framework mode | vite-react-ssg | vite-react-ssg is React Router v6-focused; v7 has official SSG support built-in - no need for third-party tool |
| React Router v7 | TanStack Router | TanStack is type-safe and modern but requires full rewrite; React Router v7 is more mature and battle-tested |
| react-helmet-async | Next.js Head | Next.js is a framework switch, overkill for this use case; helmet-async works with any React setup |

**Installation:**
```bash
# Upgrade React Router to v7 (replace v6)
npm uninstall react-router-dom
npm install react-router@latest

# react-helmet-async already installed (v2.0.5)
# Vite already installed (v6.3.6)
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── routes/                    # Route components (framework mode)
│   ├── _index.tsx            # Landing page (/) - pre-rendered
│   ├── about.tsx             # About page (/about) - pre-rendered
│   ├── how-to-play.tsx       # How-to-play (/how-to-play) - pre-rendered
│   ├── game.$lobbyId.tsx     # Game route (/game/:lobbyId) - dynamic
│   └── root.tsx              # Root layout with Helmet provider
├── components/
│   ├── marketing/            # Marketing pages (existing)
│   ├── game/                 # Game components (existing)
│   └── seo/                  # SEO components (new)
│       ├── PageMeta.tsx      # Reusable meta tag component
│       └── metaTags.ts       # Meta tag constants/helpers
└── main.tsx                  # Entry point
```

### Pattern 1: React Router v7 Framework Mode Configuration

**What:** Configure React Router in framework mode with SPA setting for static site generation and clean URLs.

**When to use:** When you need SSG for marketing pages but still want SPA behavior for dynamic game routes.

**Example:**
```typescript
// react-router.config.ts (new file at project root)
import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: disables server rendering, generates index.html at build
  ssr: false,

  // Pre-render marketing pages as static HTML for SEO
  async prerender() {
    return [
      "/",           // Landing page
      "/about",      // About page
      "/how-to-play" // How-to-play page
    ];
  },
} satisfies Config;
```
**Source:** [React Router Pre-Rendering Docs](https://reactrouter.com/how-to/pre-rendering), [Server-side rendering with React Router v7](https://blog.logrocket.com/server-side-rendering-react-router-v7/)

### Pattern 2: Route-Based Code Splitting with Lazy Loading

**What:** Use React.lazy to load game components (including Three.js) only when user navigates to game routes.

**When to use:** When you have heavy dependencies that shouldn't be in the initial bundle.

**Example:**
```typescript
// client/src/routes/game.$lobbyId.tsx
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';

// Lazy load the entire game module (includes Three.js)
const BattleScreen = lazy(() => import('@/components/game/BattleScreen'));
const Lobby = lazy(() => import('@/components/game/Lobby'));
const AvatarSelection = lazy(() => import('@/components/game/AvatarSelection'));

export default function GameRoute() {
  const { lobbyId } = useParams<{ lobbyId: string }>();

  // Game phase logic determines which component to render
  // (WebSocket connection provides phase state)

  return (
    <Suspense fallback={<GameLoadingFallback />}>
      {/* Conditionally render based on game phase */}
    </Suspense>
  );
}
```
**Source:** [Code Splitting in React w/ Vite](https://medium.com/@akashsdas_dev/code-splitting-in-react-w-vite-eae8a9c39f6e), [Optimizing React Apps with Code Splitting](https://medium.com/@ignatovich.dm/optimizing-react-apps-with-code-splitting-and-lazy-loading-e8c8791006e3)

### Pattern 3: Persistent Canvas Mounting for WebGL Context Preservation

**What:** Mount Canvas once at route level and control visibility of scene contents rather than mounting/unmounting Canvas.

**When to use:** When using React Three Fiber across multiple game phases to prevent WebGL context loss.

**Example:**
```typescript
// ANTI-PATTERN (causes context loss):
{gamePhase === 'battle' && <Canvas><BattleScene /></Canvas>}
{gamePhase === 'lobby' && <Canvas><LobbyScene /></Canvas>}

// CORRECT PATTERN (preserves context):
<Canvas>
  <BattleScene visible={gamePhase === 'battle'} />
  <LobbyScene visible={gamePhase === 'lobby'} />
</Canvas>
```
**Source:** [React Three Fiber Performance Pitfalls](https://docs.pmnd.rs/react-three-fiber/advanced/pitfalls), [Canvas Lifecycle Discussion](https://github.com/pmndrs/react-three-fiber/discussions/2457)

### Pattern 4: React Helmet Async for SEO Meta Tags

**What:** Wrap app in HelmetProvider and use Helmet component in each route to set unique meta tags.

**When to use:** Every public-facing route that needs SEO or social media sharing preview.

**Example:**
```typescript
// client/src/routes/root.tsx
import { HelmetProvider } from 'react-helmet-async';
import { Outlet } from 'react-router';

export default function Root() {
  return (
    <HelmetProvider>
      <Outlet />
    </HelmetProvider>
  );
}

// client/src/routes/_index.tsx (landing page)
import { Helmet } from 'react-helmet-async';

export default function LandingPage() {
  return (
    <>
      <Helmet>
        <title>ScrumQuest - Battle Tickets in Epic JRPG Style</title>
        <meta name="description" content="Real-time multiplayer scrum poker estimation with JRPG-style boss battles. Turn sprint planning into an epic adventure!" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="ScrumQuest - Battle Tickets in Epic JRPG Style" />
        <meta property="og:description" content="Real-time multiplayer scrum poker estimation with JRPG-style boss battles." />
        <meta property="og:image" content="https://scrumquest.com/og-image.png" />
        <meta property="og:url" content="https://scrumquest.com/" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="ScrumQuest - Battle Tickets in Epic JRPG Style" />
        <meta name="twitter:description" content="Real-time multiplayer scrum poker estimation with JRPG-style boss battles." />
        <meta name="twitter:image" content="https://scrumquest.com/twitter-card.png" />
      </Helmet>

      {/* Page content */}
    </>
  );
}
```
**Source:** [React Helmet Async npm](https://www.npmjs.com/package/react-helmet-async), [Meta Tags & Open Graph Implementation Guide](https://vladimirsiedykh.com/blog/meta-tags-open-graph-complete-implementation-guide-nextjs-react-helmet)

### Pattern 5: Manual Chunk Splitting for Three.js

**What:** Use Vite's rollupOptions.manualChunks to isolate Three.js libraries into separate bundle.

**When to use:** When you want fine-grained control over chunk boundaries for heavy libraries.

**Example:**
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separate Three.js and React Three Fiber into their own chunk
          if (id.includes('three') || id.includes('@react-three')) {
            return 'three-vendor';
          }

          // Separate React core libraries
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }

          // Other node_modules
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});
```
**Source:** [Vite manualChunks Optimization](https://github.com/vitejs/vite/discussions/17730), [Reducing Bundle Size Guide](https://shaxadd.medium.com/optimizing-your-react-vite-application-a-guide-to-reducing-bundle-size-6b7e93891c96)

### Anti-Patterns to Avoid

- **Using HashRouter (#/ URLs):** React Router v7 BrowserRouter provides clean URLs; hash fragments hurt SEO and look unprofessional.
- **Mounting/Unmounting Canvas on route changes:** Causes WebGL context loss (max 8-10 contexts before browser closes tab). Use visibility flags instead.
- **Putting all meta tags in index.html:** Static meta tags can't be page-specific; use Helmet for dynamic, route-specific meta tags.
- **Loading Three.js in main bundle:** Three.js is 600KB+ minified; lazy load only when game route is accessed.
- **Not pre-rendering marketing pages:** Search engine crawlers need static HTML; pre-render marketing pages at build time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL routing | Custom state + query params | React Router v7 | Handles history API, nested routes, data loading, SSG - 10+ years of edge cases solved |
| SEO meta tags | Manual document.title manipulation | react-helmet-async | Handles SSR, prevents memory leaks, manages duplicate tags, supports prioritization |
| Static site generation | Custom build script | React Router v7 prerender() | Built into framework mode, integrates with routing, handles data loading at build time |
| Code splitting | Manual webpack config | React.lazy + Vite defaults | Vite automatically handles dynamic imports, preload hints, and chunk optimization |
| Open Graph tags | Custom meta tag logic | react-helmet-async + templates | Handles tag deduplication, required vs optional fields, image size validation logic |

**Key insight:** Routing and SEO have deceptively complex edge cases. Browser history API is tricky (back button, popstate events, scroll restoration). Meta tags have platform-specific requirements (Facebook needs og:image 1200x630, Twitter needs different aspect ratio). Static generation needs to handle async data loading and route discovery. Use battle-tested tools that solve these problems.

## Common Pitfalls

### Pitfall 1: React Router v7 Framework Mode Requires Build Changes

**What goes wrong:** Installing React Router v7 but trying to use it like v6 causes build errors.

**Why it happens:** Framework mode changes the build process - requires `react-router.config.ts`, new CLI commands, and route file conventions.

**How to avoid:** Follow React Router v7 framework mode migration guide. Update package.json scripts to use `react-router` CLI commands for build/dev instead of Vite directly (or configure Vite plugin for framework mode).

**Warning signs:** Build errors mentioning "Server build file not found in manifest", "react-router.config.ts not found", or routes not rendering.

**Source:** [React Router v7 Framework Mode Issues](https://github.com/remix-run/react-router/issues/14096)

### Pitfall 2: WebGL Context Loss When Canvas Remounts

**What goes wrong:** Canvas unmounts/remounts on route changes, browser hits WebGL context limit (8-10), game breaks with "too many active WebGL contexts" error.

**Why it happens:** Each Canvas creates a new WebGL context. Browsers limit contexts per page. Unmounting doesn't automatically release context in all browsers (especially Safari).

**How to avoid:** Keep ONE Canvas mounted at the game route level. Control scene contents with visibility flags rather than conditional rendering. Use `<group visible={condition}>` to show/hide objects within the scene.

**Warning signs:** "CONTEXT_LOST_WEBGL" errors, Canvas not rendering after route changes, Safari-specific crashes, memory leaks in DevTools.

**Source:** [React Three Fiber Context Loss Discussion](https://github.com/pmndrs/react-three-fiber/discussions/2457), [WebGL Context Leak Issues](https://github.com/pmndrs/react-three-fiber/issues/3093)

### Pitfall 3: Server State vs URL State Mismatch

**What goes wrong:** Game state comes from WebSocket but URL tries to drive state, causing conflicts (e.g., URL says `/game/abc123` but player is actually in avatar selection phase).

**Why it happens:** Trying to make URL the source of truth for game state that's managed by server via Socket.IO.

**How to avoid:** URLs should REFLECT state, not DRIVE it. Use `/game/:lobbyId` for all game-related views. Let WebSocket events determine which component to render (lobby, avatar selection, battle). URL only provides lobbyId parameter for initial connection.

**Warning signs:** Race conditions between route navigation and WebSocket events, state resets when URL changes, back button breaks game state.

**Source:** Phase requirement ROUTE-06, prior decision in phase context

### Pitfall 4: Missing Base Tag Breaks Absolute Paths in Pre-rendered HTML

**What goes wrong:** Pre-rendered pages load from subdirectories (e.g., `/about/index.html`) but reference assets with absolute paths, causing 404s.

**Why it happens:** HTML base href isn't set correctly for nested routes, browser resolves `/styles.css` relative to current path.

**How to avoid:** Ensure Vite's `base` config matches deployment path. React Router v7 handles this automatically in framework mode, but verify in build output.

**Warning signs:** CSS not loading on pre-rendered pages, images 404 on routes with path segments, JavaScript bundles missing.

### Pitfall 5: Dynamic Imports Break in Production Bundle

**What goes wrong:** Lazy-loaded components work in dev but fail in production with "Failed to fetch dynamically imported module" errors.

**Why it happens:** Vite generates hashed filenames in production; incorrect public path or CDN configuration causes chunk loading failures.

**How to avoid:** Test production build locally (`npm run build && npm run start`). Ensure `base` in vite.config.ts matches deployment URL. Check browser network tab for 404s on chunk files.

**Warning signs:** Dev works but production fails, intermittent "chunk load errors", chunks have wrong URL path in network tab.

**Source:** [Vite Build Documentation](https://vite.dev/guide/build), [Code Splitting Issues](https://github.com/vitejs/vite/discussions/7316)

### Pitfall 6: Open Graph Images Don't Render in Social Previews

**What goes wrong:** Meta tags are set correctly but Twitter/Facebook/Discord show broken image or generic preview.

**Why it happens:** OG images must be absolute URLs (not relative), must be accessible (not behind auth), must meet size requirements (1200x630 minimum), and robots.txt must allow crawler access.

**How to avoid:** Use absolute URLs for og:image (https://domain.com/image.png). Test with [Twitter Card Validator](https://cards-dev.twitter.com/validator) and [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/). Ensure images are under 5MB and 16:9 aspect ratio.

**Warning signs:** Social media previews show default card, image appears broken in validators, "Image could not be fetched" errors in debugging tools.

**Source:** [Open Graph Best Practices Guide](https://www.everywheremarketer.com/blog/ultimate-guide-to-social-meta-tags-open-graph-and-twitter-cards), [Twitter Card Validator Guide](https://www.tweetarchivist.com/twitter-card-validator-guide)

## Code Examples

Verified patterns from official sources:

### React Router v7 Root Component with Helmet Provider
```typescript
// client/src/routes/root.tsx
import { HelmetProvider } from 'react-helmet-async';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <HelmetProvider>
          <Outlet />
        </HelmetProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

### Dynamic Game Route with Lobby ID Parameter
```typescript
// client/src/routes/game.$lobbyId.tsx
import { useParams } from 'react-router';
import { useGameState } from '@/lib/stores/useGameState';
import { lazy, Suspense } from 'react';

const Lobby = lazy(() => import('@/components/game/Lobby'));
const AvatarSelection = lazy(() => import('@/components/game/AvatarSelection'));
const BattleScreen = lazy(() => import('@/components/game/BattleScreen'));

export default function GameRoute() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { currentLobby } = useGameState();

  // WebSocket connection logic here (use lobbyId for initial connection)

  // Server state (gamePhase from WebSocket) drives which component renders
  const renderPhase = () => {
    switch (currentLobby?.gamePhase) {
      case 'lobby':
        return <Lobby />;
      case 'avatar_selection':
        return <AvatarSelection />;
      case 'battle':
      case 'scoring':
      case 'reveal':
      case 'discussion':
        return <BattleScreen />;
      default:
        return <Lobby />;
    }
  };

  return (
    <Suspense fallback={<GameLoadingFallback />}>
      {renderPhase()}
    </Suspense>
  );
}
```

### Vite Config for Code Splitting
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate Three.js libraries
          if (id.includes('three') || id.includes('@react-three')) {
            return 'three-vendor';
          }

          // Separate React core
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }

          // Socket.IO client
          if (id.includes('socket.io-client')) {
            return 'socket-vendor';
          }

          // Everything else from node_modules
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});
```
**Source:** [Vite Code Splitting Guide](https://sambitsahoo.com/blog/vite-code-splitting-that-works.html)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-router-dom separate package | react-router unified package | React Router v7 (Nov 2024) | Simplified imports, single source of truth |
| react-router-dom v6 declarative mode | Framework mode with SSG | React Router v7 (Nov 2024) | Built-in SSG removes need for vite-react-ssg |
| vite-react-ssg for SSG | React Router prerender() | React Router v7 (Nov 2024) | First-party SSG support, better integration |
| HashRouter for SPAs | BrowserRouter with history API | Standard since v4 (2017) | Clean URLs, SEO-friendly |
| react-helmet | react-helmet-async | 2020 | SSR compatibility, memory leak fixes |
| Manual webpack chunks | Vite auto code splitting | Vite 2+ (2021) | Automatic optimization, less config |

**Deprecated/outdated:**
- **vite-react-ssg:** Not technically deprecated but React Router v7 now has official SSG support, making third-party tools unnecessary for this use case
- **react-router-dom separate package:** Replaced by unified `react-router` package in v7
- **HashRouter:** Still works but not recommended; BrowserRouter with proper server config is the modern standard

## Open Questions

1. **Migration Path from State-Based Navigation to React Router**
   - What we know: App.tsx currently uses `appState` state variable to control which component renders; no URL routing exists
   - What's unclear: Best migration strategy - big bang rewrite vs gradual route-by-route migration
   - Recommendation: Big bang migration is safer here since current navigation is centralized in App.tsx switch statement. Create route files that map 1:1 to existing appState cases, then replace switch with Routes component. Test thoroughly in development before deploying.

2. **Server Configuration for SPA Fallback**
   - What we know: React Router v7 generates `__spa-fallback.html` or `index.html` for SPA mode; all routes must serve this file
   - What's unclear: Express server configuration needed to serve SPA fallback while preserving API routes
   - Recommendation: Express middleware pattern: `app.get('*', (req, res) => res.sendFile('index.html'))` AFTER API routes are defined. Ensure `/api/*`, `/socket.io/*`, and static assets are handled before catch-all route.

3. **Handling Invite Links During Migration**
   - What we know: Current invite links use query params (`?join=ABC123`); need to support legacy links during transition
   - What's unclear: Whether to redirect legacy links or support both formats indefinitely
   - Recommendation: Support both during migration - add redirect middleware that converts `?join=ABC123` to `/game/ABC123`. Keep for 3-6 months post-launch, then deprecate with console warning before removing.

4. **Production Build Size Impact**
   - What we know: Three.js is 600KB+ minified; code splitting should defer loading until game route
   - What's unclear: Actual bundle size impact, whether additional optimization (tree shaking Three.js) is needed
   - Recommendation: Run production build with bundle analyzer (`rollup-plugin-visualizer`) to measure actual impact. If Three.js chunk exceeds 1MB, investigate tree shaking or switching to three/examples imports for specific features.

## Sources

### Primary (HIGH confidence)
- [React Router Official Documentation](https://reactrouter.com/) - Core routing concepts, API reference
- [React Router Pre-Rendering Guide](https://reactrouter.com/how-to/pre-rendering) - Official SSG implementation
- [React Router Picking a Mode](https://reactrouter.com/start/modes) - Framework vs declarative vs data mode
- [react-helmet-async npm](https://www.npmjs.com/package/react-helmet-async) - Package documentation, API reference
- [Vite Official Guide](https://vite.dev/guide/features) - Code splitting, build optimization
- [React Three Fiber Performance Pitfalls](https://docs.pmnd.rs/react-three-fiber/advanced/pitfalls) - Official guidance on Canvas lifecycle

### Secondary (MEDIUM confidence)
- [How to use React Router v7 in React apps - LogRocket](https://blog.logrocket.com/react-router-v7-guide/) - Jan 2026, comprehensive migration guide
- [Server-side rendering with React Router v7 - LogRocket](https://blog.logrocket.com/server-side-rendering-react-router-v7/) - SSR and SSG patterns
- [React Router v7 Modes Guide - LogRocket](https://blog.logrocket.com/react-router-v7-modes/) - Comparison of three modes
- [Optimizing React Apps with Code Splitting - Medium](https://medium.com/@ignatovich.dm/optimizing-react-apps-with-code-splitting-and-lazy-loading-e8c8791006e3) - Code splitting patterns
- [Meta Tags & Open Graph Guide](https://vladimirsiedykh.com/blog/meta-tags-open-graph-complete-implementation-guide-nextjs-react-helmet) - Comprehensive SEO implementation
- [Vite Code Splitting That Just Works](https://sambitsahoo.com/blog/vite-code-splitting-that-works.html) - Practical manualChunks examples
- [Reducing Bundle Size with Vite](https://shaxadd.medium.com/optimizing-your-react-vite-application-a-guide-to-reducing-bundle-size-6b7e93891c96) - 2025 optimization guide

### Tertiary (LOW confidence - verify during implementation)
- [vite-react-ssg GitHub](https://github.com/Daydreamer-riri/vite-react-ssg) - Alternative SSG approach (superseded by RR v7)
- [React Three Fiber Canvas Lifecycle Discussion](https://github.com/pmndrs/react-three-fiber/discussions/2457) - Community discussion on WebGL contexts
- [React Three Fiber Context Loss Issues](https://github.com/pmndrs/react-three-fiber/issues/3093) - Memory leak reports and solutions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - React Router v7 is official, react-helmet-async is industry standard, Vite code splitting is built-in
- Architecture: MEDIUM-HIGH - Framework mode patterns verified with official docs; Canvas lifecycle patterns verified with pmndrs docs
- Pitfalls: MEDIUM - WebGL context issues well-documented in pmndrs discussions; routing pitfalls from LogRocket articles and GitHub issues

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days) - React Router v7 is stable, SEO best practices are long-term, Vite is mature

**Notes:**
- Project already has react-helmet-async and react-router-dom installed but unused
- Current navigation uses appState string literal, not URL routing
- Three.js already lazy-loaded in App.tsx but could benefit from route-based splitting
- Marketing pages exist as components but aren't pre-rendered (bad for SEO)
- No Open Graph tags present in current implementation
