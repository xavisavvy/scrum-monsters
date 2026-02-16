# Architecture Patterns: UI/UX Milestone

**Domain:** JRPG UI theming, mobile UX, routing/SEO, lobby interactions
**Researched:** 2026-02-11

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  React Router    │  │ Helmet Provider  │               │
│  │  (BrowserRouter) │  │  (Meta Tags)     │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                     │                          │
│           v                     v                          │
│  ┌─────────────────────────────────────────┐               │
│  │           Route Components              │               │
│  │  /          → HomePage (meta: landing)  │               │
│  │  /lobby/:id → LobbyPage (meta: dynamic) │               │
│  │  /game      → GamePage (meta: playing)  │               │
│  └─────────────────┬───────────────────────┘               │
│                    │                                       │
│                    v                                       │
│  ┌─────────────────────────────────────────┐               │
│  │        Phase Container Layer            │               │
│  │  (Responsive, Safe Areas, Theming)      │               │
│  └─────────────────┬───────────────────────┘               │
│                    │                                       │
│         ┌──────────┼──────────┐                            │
│         v          v          v                            │
│  ┌──────────┐ ┌────────┐ ┌─────────┐                      │
│  │  Lobby   │ │ Battle │ │ Victory │                      │
│  │  Phase   │ │ Phase  │ │  Phase  │ ...                 │
│  └──────────┘ └────────┘ └─────────┘                      │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │         Shared UI Components            │               │
│  │  - JRPGFrame (ornamental borders)       │               │
│  │  - JRPGButton (themed, touch-friendly)  │               │
│  │  - HealthBar (JRPG-styled)              │               │
│  │  - EmoteBubble (lobby interactions)     │               │
│  │  - ChargeEffect (magic system)          │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │           Audio System                  │               │
│  │  AudioManager (Howler.js wrapper)       │               │
│  │  - playSound(id, { volume, pitch })     │               │
│  │  - stopAll()                            │               │
│  │  - setMasterVolume(level)               │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    SERVER ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │        Express Middleware Stack         │               │
│  │                                         │               │
│  │  1. User-Agent Detection                │               │
│  │     ↓                                   │               │
│  │  2. Social Crawler Check                │               │
│  │     ├─ Yes → Meta Tag Injection         │               │
│  │     └─ No  → Serve SPA Shell            │               │
│  │                                         │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │      Meta Tag Generation Logic          │               │
│  │  extractRoute(path) → route params      │               │
│  │  getLobbyData(id) → lobby state         │               │
│  │  generateMeta(route, data) → HTML tags  │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  [No changes to WebSocket/game logic]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Component Boundaries

### Route Layer
| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `HomePage` | Landing page, create/join lobby | Router, Helmet (SEO) |
| `LobbyPage` | Lobby waiting room, pre-game setup | Router, Helmet, WebSocket, Phase Container |
| `GamePage` | Active gameplay phases (battle, voting, etc.) | Router, Helmet, WebSocket, Phase Container |

### Phase Container Layer
| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `PhaseContainer` | Responsive layout, safe areas, theme application | Phase components, theme context |
| Theme context | JRPG tokens (colors, borders, spacing) | All child components |
| Viewport detection | Orientation, screen size, safe area insets | Layout components |

### Shared UI Components
| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `JRPGFrame` | Ornamental borders around panels | Theme context |
| `JRPGButton` | Themed buttons with sound effects | AudioManager, theme context |
| `HealthBar` | JRPG-styled HP/status display | Game state |
| `EmoteBubble` | Lobby emote display | WebSocket (lobby_emote) |
| `ChargeEffect` | Charge/magic visual effects | WebSocket (player_charge) |

### Server Middleware
| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `socialCrawlerDetector` | User-agent parsing, bot detection | Express request |
| `metaTagInjector` | Generate and inject OG tags | Lobby data, route parser |
| `spaFallback` | Serve React app for non-crawlers | Express static handler |

## Data Flow

### Meta Tag Generation (Social Crawlers)
```
1. Request: GET /lobby/abc123
   ↓
2. User-Agent: "Twitterbot/1.0"
   ↓
3. socialCrawlerDetector → isCrawler = true
   ↓
4. extractRoute("/lobby/abc123") → { type: "lobby", id: "abc123" }
   ↓
5. getLobby("abc123") → { name: "Epic Game", players: 5, boss: "Product Owner" }
   ↓
6. generateMeta(route, lobby) → {
     title: "Join Epic Game - ScrumQuest",
     description: "5 players battling Product Owner",
     image: "/og/lobby-abc123.png"
   }
   ↓
7. injectMeta(HTML) → Return HTML with <meta> tags
```

### Route-Based Meta Tags (React App)
```
1. Route change: /lobby/abc123
   ↓
2. React Router → <LobbyPage lobbyId="abc123" />
   ↓
3. useLobby(lobbyId) → fetch lobby data
   ↓
4. <Helmet> component renders with lobby-specific meta
   ↓
5. Document <head> updated (client-side only)
```

### Audio System Flow
```
1. User action: Click button
   ↓
2. onClick → AudioManager.playSound("button_click")
   ↓
3. Howler.js → Play audio sprite
   ↓
4. Optional: Navigator.vibrate(50) for haptic feedback
```

### Responsive Layout Flow
```
1. Component mount
   ↓
2. useViewport() hook → { width, height, orientation, safeAreas }
   ↓
3. Determine layout variant:
   - width < 640px → Mobile compact
   - width >= 640px && width < 1024px → Tablet
   - width >= 1024px → Desktop
   ↓
4. Apply safe area CSS:
   - padding-top: env(safe-area-inset-top)
   - padding-bottom: env(safe-area-inset-bottom)
   ↓
5. Render appropriate component variant
```

## Patterns to Follow

### Pattern 1: Theme Token System
**What:** Centralized JRPG visual tokens via CSS custom properties

**When:** All styled components should use theme tokens, not hardcoded values

**Example:**
```css
/* Bad - hardcoded */
.panel {
  border: 3px solid #d4af37;
  border-radius: 6px;
}

/* Good - theme tokens */
.panel {
  border: var(--jrpg-border-width) solid var(--jrpg-frame-primary);
  border-radius: var(--jrpg-border-radius);
}
```

### Pattern 2: Responsive Component Variants
**What:** Components adapt to viewport size via composition, not conditionals

**When:** Layout changes across mobile/tablet/desktop

**Example:**
```tsx
// Bad - conditional rendering
function HealthBar({ hp }) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileHealthBar hp={hp} /> : <DesktopHealthBar hp={hp} />;
}

// Good - composition with shared logic
function HealthBar({ hp }) {
  return (
    <HealthBarContainer>
      <HealthBarFill percentage={hp / maxHp * 100} />
      <HealthBarLabel>{hp}/{maxHp}</HealthBarLabel>
    </HealthBarContainer>
  );
}
// Container handles responsive layout via CSS
```

### Pattern 3: Touch-First Button Design
**What:** Buttons designed for touch, enhanced for mouse

**When:** All interactive elements

**Example:**
```tsx
function JRPGButton({ onClick, children, sound = "button_click" }) {
  const audio = useAudioManager();

  const handleClick = () => {
    audio.playSound(sound);
    if (navigator.vibrate) navigator.vibrate(30);
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className="min-h-[44px] min-w-[44px] touch-manipulation"
    >
      {children}
    </button>
  );
}
```

### Pattern 4: Meta Tag Co-location
**What:** Meta tags defined alongside route components

**When:** Each routed page

**Example:**
```tsx
function LobbyPage({ lobbyId }) {
  const lobby = useLobby(lobbyId);

  return (
    <>
      <Helmet>
        <title>{lobby.name} - ScrumQuest</title>
        <meta name="description" content={`Join ${lobby.players.length} players`} />
        <meta property="og:title" content={lobby.name} />
        <meta property="og:image" content={`/og/lobby-${lobbyId}.png`} />
      </Helmet>
      <LobbyContent lobby={lobby} />
    </>
  );
}
```

### Pattern 5: Animation State Machine
**What:** Phase transitions use consistent timing and easing

**When:** Any UI state change (phase transition, modal open/close)

**Example:**
```tsx
function PhaseTransition({ from, to, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        duration: 0.25, // 250ms (mid-range of 100-500ms)
        ease: "easeOut"
      }}
    >
      {children}
    </motion.div>
  );
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Full Server-Side Rendering for SEO
**What:** Using Next.js/Remix SSR for entire app

**Why bad:** Overkill for game. Adds complexity, risks Google cloaking penalties, unnecessary for client-heavy real-time app

**Instead:** Social crawler middleware for meta tags only. SPA for actual users.

### Anti-Pattern 2: JavaScript-Only Safe Area Detection
**What:** Using `window.screen.availHeight` to calculate safe areas

**Why bad:** Inaccurate, device-specific, doesn't account for orientation changes

**Instead:** CSS `env(safe-area-inset-*)` with fallback padding

### Anti-Pattern 3: Touch Event Polyfills
**What:** Adding libraries to normalize touch/mouse events

**Why bad:** Modern React handles synthetic events well. Adds bundle size.

**Instead:** Use onClick (works for touch and mouse). Add touch-action CSS for gestures.

### Anti-Pattern 4: Pixel-Perfect Mobile Scaling
**What:** Attempting identical layout across all screen sizes

**Why bad:** Impossible and wasteful. Devices vary too much.

**Instead:** Fluid layouts with min/max constraints. Test on representative devices (iPhone SE, iPad, desktop).

### Anti-Pattern 5: Blocking Audio on Page Load
**What:** Preloading and playing audio immediately

**Why bad:** Browsers block autoplay. Startles users in meetings/public.

**Instead:** Lazy load audio. User-initiated playback. Respect autoplay policies.

## Scalability Considerations

### Concern: Asset Loading
| At 100 users | At 10K users | At 1M users |
|--------------|--------------|-------------|
| Basic image optimization | CDN for static assets | Adaptive image loading based on network quality |
| Single audio sprite | Multiple sprites, lazy load per phase | Audio streaming for large files |

### Concern: Meta Tag Generation
| At 100 users | At 10K users | At 1M users |
|--------------|--------------|-------------|
| Real-time lobby lookup | Cache lobby meta for 30s | Pre-generate OG images, store in CDN |
| Simple user-agent check | Bot detection library | Edge functions for fast meta injection |

### Concern: Animation Performance
| At 100 users | At 10K users | At 1M users |
|--------------|--------------|-------------|
| CSS transforms only | GPU-accelerated animations | Reduce motion for low-end devices |
| 60 FPS target | Adaptive frame rate | Performance budgets, lazy render off-screen |

## Mobile-Specific Patterns

### Safe Area Handling
```css
/* Root container */
.app {
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

/* Fixed bottom navigation */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom, 12px);
}
```

### Touch Target Sizing
```css
/* Minimum touch target */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  padding: 12px;
}

/* Touch-friendly spacing */
.button-group > * + * {
  margin-left: 16px; /* Prevent accidental taps */
}
```

### Orientation Detection
```typescript
function useOrientation() {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  );

  useEffect(() => {
    const handleResize = () => {
      setOrientation(
        window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
      );
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return orientation;
}
```

## Testing Strategy

### Visual Regression Testing
- Playwright screenshots across viewports (375px, 768px, 1920px)
- Safe area testing on iPhone simulators
- Orientation change testing

### Accessibility Testing
- Touch target size validation (44px minimum)
- Color contrast for JRPG theme
- Screen reader compatibility for game state

### Performance Testing
- Lighthouse mobile score (target: 90+)
- Frame rate during animations (target: 60 FPS)
- Audio loading time (target: < 200ms first sound)

## Sources

**Architecture Patterns:**
- [React Router Documentation](https://reactrouter.com/en/main)
- [Responsive UI design for games](https://genieee.com/responsive-ui-design-for-games/)
- [Motion UI Trends 2026](https://lomatechnology.com/blog/motion-ui-trends-2026/2911)

**Mobile Patterns:**
- [Touch Control Design: Ways Of Playing On Mobile](https://mobilefreetoplay.com/control-mechanics/)
- [Safe Area Insets - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Designing UI for Multiple Resolutions - Unity](https://docs.unity3d.com/Packages/com.unity.ugui@1.0/manual/HOWTO-UIMultiResolution.html)

**SEO Patterns:**
- [Dynamic OG Tags for React SPA - VibeIt](https://blog.vibeit.hr/blog/dynamic-og-tags)
- [React SEO Best Practices - Dheeman](https://www.dheemanthshenoy.com/blogs/react-seo-best-practices-spa)
