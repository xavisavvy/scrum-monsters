# Architecture Patterns: UI Redesign & Routing Integration

**Domain:** JRPG-themed UI redesign with routing and responsive layouts
**Researched:** 2026-02-11
**Confidence:** HIGH

## Recommended Architecture

### Routing Layer Separation

```
ScrumQuest Architecture (Post-Routing Integration)

┌───────────────────────────────────────────────────────────────────┐
│ React Router (BrowserRouter)                                      │
│ ├── Website Routes (SEO-optimized, no Three.js)                  │
│ │   ├── / (Landing)                                               │
│ │   ├── /about                                                    │
│ │   ├── /features                                                 │
│ │   ├── /pricing                                                  │
│ │   └── /support                                                  │
│ │                                                                  │
│ └── Game Module Routes (Three.js-enabled)                        │
│     ├── /game (menu)                                              │
│     ├── /game/create                                              │
│     ├── /game/join/:lobbyId?                                      │
│     └── /game/session (active game state machine)                │
│         └── Phase-based rendering:                                │
│             ├── lobby → Lobby (2D canvas)                         │
│             ├── avatar_selection → AvatarSelection                │
│             └── battle/scoring/reveal/discussion                  │
│                 → BattleScreen (Three.js Canvas)                  │
└───────────────────────────────────────────────────────────────────┘
         ↓                    ↓
    Zustand Stores      Socket.IO Connection
    (Global State)      (Persistent, route-aware)
```

**Key Principle:** Website pages = lightweight marketing content. Game module = heavyweight real-time 3D experience. Separate routing contexts prevent Three.js overhead on public pages.

### Component Boundaries

| Component | Responsibility | Communicates With | Three.js Dependency |
|-----------|---------------|-------------------|---------------------|
| **Router Shell** | Route definition, meta tag management | All top-level routes | NO |
| **Website Layout** | Marketing page wrapper, nav, footer | Website routes only | NO |
| **Game Layout** | Game session wrapper, persistent UI (audio, connection status) | Game routes, Zustand, Socket.IO | YES (for `/game/session` only) |
| **Phase Components** | Phase-specific game UI (battle, lobby, etc.) | Game Layout, useGameState, useWebSocket | YES (BattleScreen only) |
| **Zustand Stores** | Global client state (game, audio, auth, progression) | All components | NO |
| **Socket.IO Manager** | WebSocket connection, reconnection, event handlers | Game components only | NO |

## Data Flow

### Route Navigation Flow

```
User Action → React Router navigate() → Route change
                                            ↓
                                      Zustand persists
                                      Socket.IO persists
                                            ↓
                                      New route renders
                                            ↓
                                      useEffect hooks run
                                            ↓
                                      Subscribe to needed events
```

### Three.js Canvas Lifecycle

```
Route: /game/session + gamePhase: 'battle'
        ↓
    <BattleScreen key={remountKey}>
        ↓
    <Canvas> mounts
        ↓
    Three.js scene initializes
        ↓
    useFrame animation loop starts
        ↓
    Socket.IO battle events → Direct Three.js mutations (NOT React state)
        ↓
    Route change OR phase change
        ↓
    <Canvas> unmounts
        ↓
    Three.js cleanup (dispose geometries, materials, textures)
```

**Critical:** Three.js state mutations happen in `useFrame`, NOT via React state updates. Avoid triggering React re-renders for animation frames.

### Socket.IO Persistence Across Routes

```javascript
// Initialize once in App/Router wrapper
useEffect(() => {
  connect(); // Socket persists across routes
  return () => disconnect(); // Only on app unmount
}, []);

// Route-specific subscriptions
useEffect(() => {
  if (!socket || !isGameRoute) return;

  // Subscribe to game events
  setupGameEventHandlers(socket);

  return () => {
    // Cleanup route-specific listeners
    teardownGameEventHandlers(socket);
    // Socket connection STAYS OPEN
  };
}, [socket, currentRoute]);
```

**Existing Pattern:** Current App.tsx already implements this correctly—socket connects once, event handlers are route-aware.

## Patterns to Follow

### Pattern 1: Route-Based Code Splitting

**What:** Lazy load Three.js-heavy components only when game routes are accessed.

**When:** Always for game module, never for marketing pages.

**Example:**
```typescript
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Website routes: eager load (small bundles)
import LandingPage from '@/components/marketing/LandingPage';
import AboutPage from '@/components/marketing/AboutPage';

// Game routes: lazy load (Three.js bundles)
const GameLayout = lazy(() => import('@/components/game/GameLayout'));
const BattleScreen = lazy(() => import('@/components/game/BattleScreen'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Marketing routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />

          {/* Game routes */}
          <Route path="/game/*" element={<GameLayout />}>
            <Route path="session" element={<BattleScreen />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

**Benefit:** Marketing pages load instantly. Three.js downloads only when user enters game.

### Pattern 2: Meta Tag Management Per Route

**What:** Update `<title>`, `<meta description>`, Open Graph tags on route change for SEO.

**When:** Every public route (landing, about, features, pricing, support).

**Example:**
```typescript
import { Helmet } from 'react-helmet-async';

function LandingPage() {
  return (
    <>
      <Helmet>
        <title>ScrumQuest - JRPG Scrum Poker Battles</title>
        <meta name="description" content="Real-time multiplayer scrum poker with epic JRPG boss battles. Estimate tickets, battle monsters, level up your team." />
        <meta property="og:title" content="ScrumQuest - JRPG Scrum Poker" />
        <meta property="og:description" content="Battle tickets in epic JRPG style" />
        <meta property="og:url" content="https://scrumquest.app/" />
        <link rel="canonical" href="https://scrumquest.app/" />
      </Helmet>
      {/* Page content */}
    </>
  );
}
```

**Tool:** `react-helmet-async` (modern, async-safe version of react-helmet).

### Pattern 3: Responsive JRPG UI Components

**What:** CSS Grid for layout structure, Flexbox for component arrangement, media queries for breakpoints.

**When:** All game UI components (battle HUD, score cards, team displays).

**Example:**
```css
/* Battle HUD Layout */
.battle-hud {
  display: grid;
  grid-template-areas:
    "boss-info    timer       players"
    "ability-bar  ability-bar inventory"
    "chat         chat        minimap";
  grid-template-columns: 1fr 2fr 1fr;
  grid-template-rows: auto 80px 120px;
  gap: 1rem;
  padding: 1rem;
}

/* Mobile: Stack vertically */
@media (max-width: 768px) {
  .battle-hud {
    grid-template-areas:
      "boss-info"
      "timer"
      "players"
      "ability-bar"
      "inventory"
      "chat";
    grid-template-columns: 1fr;
    grid-template-rows: auto;
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Three.js State in React State

**What goes wrong:** Storing Three.js object positions/rotations in `useState` causes massive re-render overhead.

**Prevention:**
```typescript
// BAD: React state for Three.js mutations
const [rotation, setRotation] = useState(0);
useFrame(() => {
  setRotation(r => r + 0.01); // Triggers React re-render every frame!
});

// GOOD: Direct mutation with refs
const meshRef = useRef<THREE.Mesh>(null);
useFrame(() => {
  if (meshRef.current) {
    meshRef.current.rotation.x += 0.01; // No React re-render
  }
});
```

### Anti-Pattern 2: Socket Event Listeners in Child Components

**What goes wrong:** Registering Socket.IO listeners in deeply nested components causes missed events when components unmount.

**Prevention:** Register listeners in parent/layout, update Zustand, let children consume state.

### Anti-Pattern 3: Blocking Route Navigation During Socket Operations

**What goes wrong:** Preventing route changes until socket response received freezes UI.

**Prevention:** Use optimistic navigation—navigate immediately, server confirms later.

## Integration Points

### Integration Point 1: App.tsx → React Router Migration

**Current State:** App.tsx uses internal `appState` state machine.

**Target State:** React Router `BrowserRouter` with routes.

**Migration Strategy:**
1. Wrap App in `<BrowserRouter>` (main.tsx)
2. Map `appState` values to routes
3. Replace `setAppState()` calls with `navigate()` calls
4. Keep `gamePhase` in Zustand (unchanged)—it's NOT a route

### Integration Point 2: useWebSocket Hook → Route-Aware Event Handlers

**Current State:** Socket connects on App mount, handlers registered separately.

**Target State:** Socket connects on app mount (unchanged), handlers only registered for game routes.

### Integration Point 3: BattleScreen → Route-Aware Canvas Lifecycle

**Current State:** BattleScreen mounts when `appState === 'battle'`.

**Target State:** BattleScreen mounts when route is `/game/session` AND `gamePhase` in battle-related phases.

### Integration Point 4: Zustand Stores → Router Integration

**Current State:** Zustand stores are router-agnostic.

**Target State:** Zustand stores remain router-agnostic (no changes needed).

**Why No Changes:** Zustand's design is intentionally decoupled from routing.

### Integration Point 5: Meta Tags → react-helmet-async

**Current State:** No per-route meta tags.

**Target State:** Dynamic meta tags per route for SEO.

## Component Changes Overview

### New Components

| Component | Purpose | Location | Dependencies |
|-----------|---------|----------|-------------|
| **RouterShell** | BrowserRouter wrapper, route definitions | `client/src/App.tsx` (refactor) | react-router-dom |
| **WebsiteLayout** | Marketing page wrapper (nav, footer) | `client/src/layouts/WebsiteLayout.tsx` | None |
| **GameLayout** | Game session wrapper (persistent UI) | `client/src/layouts/GameLayout.tsx` | Zustand, Socket.IO |
| **GameSession** | Phase-based rendering route | `client/src/routes/GameSession.tsx` | useGameState |
| **RouteGuard** | Redirect if not authenticated | `client/src/components/RouteGuard.tsx` | react-router-dom |
| **SEOHead** | Reusable meta tag component | `client/src/components/SEOHead.tsx` | react-helmet-async |

### Modified Components

| Component | Current Behavior | After Routing | Change Type |
|-----------|------------------|---------------|-------------|
| **App.tsx** | State machine with `appState` | React Router with `<Routes>` | Major refactor |
| **LandingPage** | Manual navigation via callbacks | Uses `useNavigate()`, adds `<Helmet>` | Minor refactor |
| **BattleScreen** | Mounted via `appState === 'battle'` | Mounted via route + `gamePhase` | Minor |

### Unchanged Components

- **Phase components** (BattlePhase, RevealPhase, etc.) — Internal logic unchanged
- **Zustand stores** (useGameState, useAudio, etc.) — Router-agnostic by design
- **UI components** (RetroButton, RetroCard, etc.) — Pure presentation

## Responsive Design Strategy

### Breakpoints

```css
/* Mobile-first approach */

/* Base: Mobile (320px - 767px) */
.battle-hud {
  /* Single column, stacked layout */
}

/* Tablet: 768px - 1023px */
@media (min-width: 768px) {
  .battle-hud {
    /* 2-column grid, collapsible sidebars */
  }
}

/* Desktop: 1024px+ */
@media (min-width: 1024px) {
  .battle-hud {
    /* 3-column grid, always-visible sidebars */
  }
}

/* Large Desktop: 1440px+ */
@media (min-width: 1440px) {
  .battle-hud {
    /* Max-width container, centered */
  }
}
```

### JRPG UI Theming

**Retro Aesthetic:** Existing `retro.css` already implements pixel-perfect borders, scanlines, glow effects. Keep this.

**Color Palette:**
```css
:root {
  --retro-bg: #0a0a0a;
  --retro-border: #00ffff; /* Cyan accent */
  --retro-accent: #ff00ff; /* Magenta highlights */
  --retro-text: #ffffff;
  --retro-success: #00ff00;
  --retro-danger: #ff0000;
}
```

## Build Order (Dependency-Aware)

### Phase 1: Routing Foundation

1. Install dependencies: `react-router-dom`, `react-helmet-async`
2. Create RouterShell (refactor App.tsx)
3. Create layouts (WebsiteLayout, GameLayout)
4. Route-aware Socket.IO

**Validation:** Navigate between routes, no game events on marketing pages.

### Phase 2: Meta Tags & SEO

5. Integrate react-helmet-async
6. Create SEOHead component
7. Add meta tags to all marketing routes
8. Test SEO (Lighthouse audit)

**Validation:** Lighthouse SEO score >90.

### Phase 3: Game Module Routing

9. Create GameSession route component
10. Migrate navigation calls (`setAppState` → `navigate`)
11. Test reconnection flow

**Validation:** Game flow works exactly as before, with URL changes.

### Phase 4: Code Splitting

12. Lazy load game routes
13. Measure bundle sizes

**Validation:** Marketing bundle <200KB, game bundle ~2MB.

### Phase 5: Responsive JRPG UI

14. Audit existing components
15. Implement responsive layouts
16. Mobile touch optimizations

**Validation:** All phases usable on 375px wide screen.

## Dependencies

**New NPM Packages:**
- `react-router-dom@^6.28.0` (routing)
- `react-helmet-async@^2.0.5` (meta tags)

**No Breaking Changes:** Existing Zustand, Socket.IO, Three.js code remains unchanged.

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Socket.IO desync during route changes | High | Persist socket connection, test reconnection |
| Three.js memory leaks on route changes | Medium | Proper cleanup in Canvas unmount |
| Route guards conflict with reconnection | Medium | Reconnection check in route guards |
| Mobile layout breaks on battle phase | High | Responsive testing, progressive enhancement |

## Sources

1. **React Router v6:** [React Router v6 Guide](https://blog.logrocket.com/react-router-v6-guide/), [Multiple Canvas Architecture](https://github.com/pmndrs/react-three-fiber/discussions/3221)

2. **Three.js lifecycle:** [React Three Fiber Docs](https://docs.pmnd.rs/react-three-fiber/api/canvas), [Three.js Performance Tips (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

3. **SEO for React SPAs:** [React SEO Guide (2026)](https://www.linkgraph.com/blog/seo-for-react-applications/), [React Helmet Best Practices](https://www.fullstack.com/labs/resources/blog/improving-seo-in-react-apps-with-react-helmet)

4. **Zustand:** [Zustand Documentation](https://zustand.docs.pmnd.rs/), [State Persistence](https://reactnavigation.org/docs/state-persistence/)

5. **Socket.IO lifecycle:** [Socket.IO with React](https://socket.io/how-to/use-with-react), [Real-Time Resource Locking](https://marmelab.com/blog/2017/09/13/real-time-resource-locking-using-socketio-and-react-router.html)

6. **Responsive CSS (2026):** [Modern CSS Layout Techniques](https://www.frontendtools.tech/blog/modern-css-layout-techniques-flexbox-grid-subgrid-2025), [Responsive Game UI](https://genieee.com/responsive-ui-design-for-games/)

---

**Confidence Level:** HIGH

All recommendations based on official documentation, verified with 2026-current best practices, and aligned with existing ScrumQuest architecture.
