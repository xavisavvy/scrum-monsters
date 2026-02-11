# Technology Stack

**Project:** ScrumQuest UI Redesign & Mobile Responsiveness
**Researched:** 2026-02-11

## Recommended Stack Additions

This document covers ONLY the new libraries needed for responsive JRPG-themed UI, mobile-friendly interfaces, proper routing, and SEO optimization. Existing stack (React, Three.js, Zustand, Tailwind) remains unchanged.

### Routing & Navigation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Router | ^6.26.0 (current) → ^7.x (upgrade recommended) | Client-side routing, URL management | Already installed (v6.26.0). **Upgrade to v7 recommended** for type safety (automatic route typing with typegen), React 19 compatibility, 15% smaller bundle, and improved SSR support. V6→V7 is non-breaking if future flags enabled. V7 simplifies package structure (single `react-router` import) and adds automatic loader/action typing. |

**Note:** React Router v6.26.0 is already in package.json but NOT currently used (no Routes/Route components found in codebase). Current routing uses manual state management (`appState` variable in App.tsx with query params). Migration needed.

### SEO & Meta Tags
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| react-helmet-async | ^2.0.5 (current) | Dynamic meta tags, document head management | **Already installed and working.** Thread-safe, prevents performance issues vs original react-helmet. Essential for SPA SEO (title, description, Open Graph tags per route). Context-based, no hydration mismatches. |
| vite-react-ssg | ^0.5.0+ | Static site generation for marketing pages | **NEW - RECOMMENDED.** Pre-renders landing, about, features, pricing, support pages to static HTML for SEO. Wraps React Helmet for SSR. Enables hybrid approach: static marketing + dynamic game. Vite-native, works with existing build setup. |

**Alternative considered:** vite-plugin-prerender (more manual). vite-react-ssg chosen for better React Helmet integration and cleaner API.

### Responsive Design Utilities
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @tailwindcss/container-queries | Latest (built-in v4) | Component-level responsive design | **NEW - OPTIONAL.** Enables `@sm:`, `@md:` prefixes for container-based breakpoints vs viewport. Perfect for sidebar/panel layouts that resize independently. Now built into Tailwind v4 (no plugin needed). Use for micro-layouts; keep media queries for page-level. |
| react-responsive | ^10.0.0 | JavaScript-based media query hooks | **NEW - RECOMMENDED.** SSR-safe `useMediaQuery` hook for conditional rendering/logic. Needed for mobile vs desktop behavior in Three.js scenes (adjust quality, controls). Complements Tailwind CSS breakpoints with runtime detection. |

**Note:** Tailwind v3.4.14 already installed with mobile-first breakpoints (sm/md/lg/xl/2xl). Additional utilities only needed for JS-driven responsiveness.

### Animation & Transitions (JRPG Feel)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| framer-motion | ^11.13.1 (current) | Page transitions, UI animations, gestures | **Already installed.** Perfect for JRPG menu transitions (slide, fade), hover effects, dialog animations. React-native API (`motion.div`), gesture support (`whileHover`, `whileTap`), AnimatePresence for exit animations. 32KB gzipped, optimized for React. **Keep using.** |
| gsap | ^3.12.5 (current) | Complex timeline animations, scroll effects | **Already installed.** Use for cinematic cutscenes, boss intro sequences, complex multi-step animations. Timeline control superior to Framer Motion for scripted sequences. Performance-optimized (bypasses React diffing). **Keep using.** |

**Decision:** Use BOTH. Framer Motion for 90% of UI (menus, buttons, cards). GSAP for 10% cinematic moments (battle intros, victory screens, scrolling parallax). Already integrated, no new dependencies.

### Three.js Performance (Mobile Optimization)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @react-three/drei | ^9.122.0 (current) | Adaptive performance components | **Already installed.** Use `<AdaptivePixelRatio />` to cap devicePixelRatio on mobile (prevent 4x rendering on high-DPI phones). Use `<PerformanceMonitor>` to dynamically adjust quality based on FPS. Use `<AdaptiveDpr />` for idle vs interaction quality regression. Essential for mobile Three.js. |
| r3f-perf | ^7.2.3 (current) | Performance monitoring overlay | **Already installed.** Debug tool for mobile performance testing. Shows FPS, drawcalls, memory. Keep for development, disable in production. |

**Mobile-specific settings:**
```tsx
// Recommended Canvas props for mobile
<Canvas
  dpr={[1, 2]} // Min 1, max 2 (caps at 2x even on 3x/4x devices)
  performance={{ min: 0.5 }} // Allow 50% quality drop during interaction
  gl={{
    antialias: true, // Enable for visual quality
    powerPreference: "high-performance" // Use GPU on mobile
  }}
>
  <AdaptivePixelRatio /> {/* From @react-three/drei */}
  <PerformanceMonitor> {/* Auto-adjust on FPS drops */}
</Canvas>
```

### Utility & Class Management
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| clsx | ^2.1.1 (current) | Conditional class names | **Already installed and used** (in `lib/utils.ts` as `cn()` helper). Tiny (240 bytes), faster than classnames. Essential for dynamic Tailwind classes. Keep using. |
| tailwind-merge | ^2.5.4 (current) | Tailwind class conflict resolution | **Already installed and used** (combined with clsx in `cn()` utility). Prevents conflicts like `text-blue-500 text-red-500` by intelligently merging. Industry standard 2026. Keep using. |

## Installation Commands

### Required New Packages
```bash
# Static site generation for SEO
npm install -D vite-react-ssg@^0.5.0

# Responsive utilities
npm install react-responsive@^10.0.0

# Optional: Container queries (if Tailwind v4 upgrade planned)
# npm install -D @tailwindcss/container-queries@^0.1.0
```

### Optional Upgrades
```bash
# React Router v6 → v7 (recommended for type safety)
npm install react-router@^7.0.0

# Note: Remove react-router-dom after upgrade (consolidated into react-router in v7)
```

## What NOT to Add

| Anti-Library | Why Avoid | What to Use Instead |
|--------------|-----------|-------------------|
| react-helmet (original) | Synchronous, performance issues, not maintained | **react-helmet-async** (already installed) |
| Next.js / Remix | Full framework overkill, requires rewrite | vite-react-ssg for static pages + existing Vite setup |
| Material-UI / Chakra UI | Heavy component libraries, conflicts with custom retro styling | Existing Radix UI primitives + Tailwind |
| react-spring | Animation library overlap | Framer Motion (already installed, better DX) |
| Preact | React replacement, breaks Three.js ecosystem | Stick with React 18 |
| TanStack Router | Alternative router, ecosystem smaller than React Router | React Router v7 (battle-tested, type-safe) |
| CSS-in-JS (styled-components, emotion) | Runtime overhead, conflicts with Tailwind | Tailwind + CSS custom properties (already using) |

## Configuration Updates Needed

### 1. Vite Config (vite.config.ts)
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";
import viteReactSSG from 'vite-react-ssg'; // NEW

export default defineConfig({
  plugins: [
    react(),
    glsl(),
    viteReactSSG({
      // Pre-render marketing pages for SEO
      routes: ['/', '/about', '/features', '/pricing', '/support'],
      // Don't pre-render game routes (dynamic)
      exclude: ['/game', '/lobby', '/battle']
    })
  ],
  // ... rest of config
});
```

### 2. Tailwind Config (tailwind.config.ts)
```typescript
export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    // Mobile-first breakpoints (already configured)
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      // JRPG color scheme (already configured in :root CSS vars)
      // Add container queries if using @container syntax
      containers: { // NEW (optional)
        'xs': '20rem',
        'sm': '24rem',
        'md': '28rem',
        'lg': '32rem',
      }
    }
  },
  plugins: [
    require("tailwindcss-animate"), // Already installed
    require("@tailwindcss/typography"), // Already installed
    // require("@tailwindcss/container-queries"), // NEW (optional)
  ]
};
```

### 3. Router Integration Pattern

**Current state:** No React Router usage. App.tsx manages routing with manual `appState` variable.

**Recommended migration:**
```tsx
// NEW: client/src/router.tsx
import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
    meta: { title: 'ScrumQuest - JRPG Sprint Planning' }
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
  {
    path: '/game',
    element: <GameContainer />,
    children: [
      { path: 'lobby/:lobbyId', element: <Lobby /> },
      { path: 'battle/:lobbyId', element: <BattleScreen /> }
    ]
  }
]);

// Replace App.tsx manual routing with RouterProvider
```

**Integration with Zustand:** Navigation state can remain in Zustand. Router handles URL sync, Zustand handles game state. Use `useNavigate()` hook to trigger routing from Zustand actions.

### 4. SEO Meta Tags Pattern

```tsx
// Each route component
import { Helmet } from 'react-helmet-async';

function LandingPage() {
  return (
    <>
      <Helmet>
        <title>ScrumQuest - Turn Sprint Planning into Epic Boss Battles</title>
        <meta name="description" content="JRPG-style scrum poker..." />
        <meta property="og:title" content="ScrumQuest" />
        <meta property="og:image" content="/og-image.png" />
      </Helmet>
      {/* page content */}
    </>
  );
}
```

### 5. Mobile Three.js Settings

```tsx
// client/src/components/game/BattleScreen.tsx
import { useMediaQuery } from 'react-responsive';

function BattleScreen() {
  const isMobile = useMediaQuery({ maxWidth: 768 });

  return (
    <Canvas
      dpr={isMobile ? [1, 1.5] : [1, 2]} // Lower DPR on mobile
      performance={{ min: isMobile ? 0.3 : 0.5 }} // More aggressive regression
      gl={{
        antialias: !isMobile, // Disable AA on mobile for performance
        powerPreference: "high-performance"
      }}
    >
      <AdaptivePixelRatio /> {/* Auto-adjust during lag */}
      <PerformanceMonitor factor={1} onChange={({ fps }) => {
        if (fps < 30 && isMobile) {
          console.warn('Low FPS on mobile, reduce quality');
        }
      }} />
      {/* scene content */}
    </Canvas>
  );
}
```

## Mobile Responsiveness Strategy

### CSS Approach (Tailwind)
- **Use mobile-first classes** (already following this pattern in retro.css)
- **Breakpoint prefixes:** `sm:`, `md:`, `lg:` for progressive enhancement
- **Example:** `<div className="text-sm md:text-base lg:text-lg">`

### Container Queries (NEW - Optional)
- **Use for component-level responsiveness** (sidebar, panels)
- **Syntax:** `@container` wrapper + `@sm:`, `@md:` classes on children
- **Example:** Lobby sidebar that adapts to available space, not viewport

### JavaScript Detection (NEW - react-responsive)
- **Use for behavior changes** (not styling)
- **Examples:**
  - Disable particle effects on mobile
  - Use touch controls vs mouse controls
  - Adjust Three.js quality settings
  - Conditional component rendering (swap heavy 3D for sprite on mobile)

### Existing Responsive Patterns (retro.css)
✅ **Already implemented:**
- Avatar selection horizontal scroll on mobile (<699px)
- Player chip size reduction on mobile (<640px)
- Custom scrollbar styling for touch devices
- `scroll-snap-type: x mandatory` for carousels

## Performance Budget

| Asset Type | Desktop | Mobile | Notes |
|------------|---------|--------|-------|
| Initial JS | <500KB | <350KB | Existing bundle ~480KB (within range) |
| Three.js Bundle | <200KB | <150KB | Use dynamic imports for 3D scenes |
| Images (per page) | <2MB | <1MB | Use WebP, lazy load bosses |
| Animation FPS | 60 FPS | 30-60 FPS | Allow quality regression via PerformanceMonitor |

## Integration Checklist

- [x] Tailwind CSS already configured with mobile-first breakpoints
- [x] clsx + tailwind-merge already integrated in `cn()` utility
- [x] Framer Motion + GSAP already installed for animations
- [x] @react-three/drei already installed for adaptive performance
- [x] react-helmet-async already installed for meta tags
- [ ] **Add vite-react-ssg** for static marketing page generation
- [ ] **Add react-responsive** for JavaScript media queries
- [ ] **Upgrade React Router v6 → v7** for type safety (optional but recommended)
- [ ] **Configure vite-react-ssg routes** in vite.config.ts
- [ ] **Migrate App.tsx routing** from manual state to React Router
- [ ] **Add Helmet meta tags** to all marketing pages
- [ ] **Implement mobile Canvas settings** with useMediaQuery in BattleScreen

## Sources & Verification

### High Confidence (Official Docs + Current Versions)
- **Tailwind CSS responsive design:** [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design), [Best Practices 2026](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns)
- **React Router v7:** [Official v7 Announcement](https://reactrouter.com/), [v7 vs v6 Comparison](https://medium.com/@ignatovich.dm/react-router-7-vs-6-whats-new-and-should-you-upgrade-93bba58576a8)
- **react-helmet-async:** [NPM Package](https://www.npmjs.com/package/react-helmet-async), [SEO Guide](https://blog.sachinchaurasiya.dev/how-to-integrate-reactjs-and-react-helmet-async-manage-seo-and-meta-data)
- **Container Queries:** [Tailwind Container Queries](https://tailkits.com/blog/tailwind-container-queries/), [LogRocket Guide](https://blog.logrocket.com/container-queries-2026/)
- **clsx + tailwind-merge:** [Best Practices](https://medium.com/@naglaafouz4/enhancing-component-reusability-in-tailwind-css-with-clsx-and-tailwind-merge-986aa4e1fe76)

### Medium Confidence (Community Sources + WebSearch)
- **Framer Motion vs GSAP:** [2026 Comparison](https://blog.logrocket.com/best-react-animation-libraries/), [Performance Guide](https://semaphore.io/blog/react-framer-motion-gsap)
- **React Three Fiber mobile performance:** [Scaling Performance Docs](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [Adaptive Performance RFC](https://github.com/pmndrs/react-three-fiber/issues/1070)
- **vite-react-ssg:** [GitHub Repo](https://github.com/Daydreamer-riri/vite-react-ssg), [Vite SSG Discussion](https://github.com/vitejs/vite/discussions/18130)
- **react-responsive:** [NPM Package](https://www.npmjs.com/package/react-responsive), [SSR-safe useMediaQuery](https://medium.com/@dwinTech/managing-usemediaquery-hydration-errors-in-next-js-9ecc555542c7)

### Low Confidence (Flagged for Validation)
- **JRPG-specific color schemes:** No authoritative source found. Search returned generic game asset marketplaces. **Recommendation:** Design custom palette based on existing retro.css variables (already has JRPG aesthetic).
- **React Router + Three.js integration:** Limited 2026-specific guidance. Found [2023 blog post](https://romain-legall.fr/posts/handle-react-router-v6-with-react-18-and-react-three-fiber) but couldn't verify current best practices. **Recommendation:** Standard React Router wrapping works fine (Canvas inside Route components).

## Version Compatibility Matrix

| Library | Current | Recommended | React Version | Breaking Changes |
|---------|---------|-------------|---------------|------------------|
| React | 18.3.1 | 18.3.1 (keep) | - | - |
| React Router | 6.26.0 | 7.x (upgrade) | 18+ | None (with future flags) |
| Tailwind CSS | 3.4.14 | 3.4.14 (keep) | - | - |
| Framer Motion | 11.13.1 | 11.13.1 (keep) | 18+ | - |
| react-helmet-async | 2.0.5 | 2.0.5 (keep) | 18+ | - |
| @react-three/fiber | 8.18.0 | 8.18.0 (keep) | 18+ | - |
| @react-three/drei | 9.122.0 | 9.122.0 (keep) | 18+ | - |

**Note:** All existing versions are current as of 2026-02-11. Only additions needed, no upgrades required (except optional React Router v7).

## Decision Rationale

### Why React Router v7 over alternatives?
- **Type safety:** Automatic loader/action typing eliminates manual type casting
- **Bundle size:** 15% smaller than v6, matters for mobile
- **Ecosystem:** Largest React routing ecosystem, better Three.js community examples
- **Migration path:** Non-breaking upgrade from existing v6 installation
- **React 19 ready:** Future-proof for React 19 adoption

### Why vite-react-ssg over alternatives?
- **Vite-native:** Works with existing build setup, no migration
- **React Helmet integration:** Wraps helmet for SSR automatically
- **Hybrid approach:** Static marketing + dynamic game (perfect for ScrumQuest)
- **Lightweight:** Doesn't force full SSR framework (Next.js would be overkill)

### Why react-responsive over custom hooks?
- **SSR-safe:** Handles hydration mismatches correctly
- **Tested:** Battle-tested library, fewer edge cases
- **Features:** Device type detection, orientation, custom queries
- **Bundle size:** 3KB gzipped, acceptable overhead

### Why keep both Framer Motion AND GSAP?
- **Different use cases:** Framer for declarative UI, GSAP for imperative timelines
- **Already installed:** No new bundle impact
- **Performance:** Both optimized, use right tool for job
- **Examples:** Framer for menu transitions, GSAP for boss intro cinematics

### Why NOT Next.js/Remix?
- **Overkill:** Full framework for what's primarily a client-side game
- **Migration cost:** Requires rewriting existing Vite setup, Socket.IO integration complex
- **Bundle impact:** Larger runtime overhead for SSR features mostly unused
- **Decision:** vite-react-ssg provides 80% benefit (static marketing pages) with 20% effort
