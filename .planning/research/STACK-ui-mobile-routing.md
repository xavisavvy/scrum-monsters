# Technology Stack: UI/UX Milestone

**Project:** ScrumQuest JRPG UI, Mobile UX, Routing & Lobby Magic
**Researched:** 2026-02-11

## Recommended Stack

### Routing & SEO
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Router | ^6.22.0 | Client-side routing with clean URLs | Standard for React SPAs. BrowserRouter (not HashRouter) for SEO-friendly URLs. |
| React Helmet Async | ^2.0.4 | Dynamic meta tags per route | Fork of React Helmet with async rendering support. Handles title, description, OG tags. |
| Express middleware | (custom) | Social crawler detection | Inject meta tags in initial HTML for Twitter, Discord, Slack bots. Avoid full SSR overhead. |

### UI Theming & Design System
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| CSS Custom Properties | (native) | JRPG theme tokens | Color schemes, spacing, border styles. Dynamic theming without CSS-in-JS overhead. |
| Framer Motion | ^11.0.0 (existing) | UI animations, phase transitions | Already in project. Smooth 100-500ms transitions. View Transitions API as progressive enhancement. |
| Tailwind CSS | ^3.x (existing) | Utility-first styling | Already in use. Extend with JRPG theme tokens. |

### Mobile UX
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| CSS env() variables | (native) | Safe area insets | `safe-area-inset-top/bottom/left/right` for notches, rounded corners, home gesture. |
| Viewport meta tag | (native) | Mobile viewport control | `width=device-width, initial-scale=1, viewport-fit=cover` for safe area support. |
| Navigator Vibration API | (native) | Haptic feedback (optional) | Simple vibration on actions. User-controlled, graceful degradation. |

### Audio System
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Howler.js | ^2.2.4 | Game audio management | Lightweight, cross-browser, sprite support. Volume control, audio pooling, mobile-friendly. |
| *Alternative:* Web Audio API | (native) | Lower-level audio control | If precise timing or audio synthesis needed. More complex than Howler.js. |

### Asset Optimization
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vite-imagetools | ^6.2.0 | Image optimization | Vite plugin for responsive images, format conversion (WebP), lazy loading. |
| vite-plugin-compression | ^0.5.1 | Asset compression | Gzip/Brotli for static assets. Reduces mobile bandwidth usage. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Routing | React Router v6 | TanStack Router | Newer, less ecosystem support. React Router is battle-tested for SPAs. |
| Meta Tags | React Helmet Async | react-meta-tags | Less maintained. React Helmet is standard with better TypeScript support. |
| SEO Approach | Social crawler middleware | Full SSR (Next.js/Remix) | Overkill for game. SSR adds complexity, Google cloaking risk. Crawlers-only is simpler. |
| Audio | Howler.js | Tone.js | Tone.js is for music synthesis. Howler.js better for sound effects. |
| Theming | CSS Custom Properties | Styled Components / Emotion | CSS-in-JS adds runtime overhead. Custom properties are performant, cacheable. |
| Safe Areas | CSS env() | JavaScript viewport detection | Native CSS solution is simpler, more performant. JS fallback if env() unsupported. |

## Installation

```bash
# Core routing and meta tags
npm install react-router-dom@^6.22.0
npm install react-helmet-async@^2.0.4

# Audio system
npm install howler@^2.2.4
npm install @types/howler --save-dev

# Asset optimization
npm install -D vite-imagetools@^6.2.0
npm install -D vite-plugin-compression@^0.5.1
```

## Configuration

### React Router Setup

```typescript
// client/src/main.tsx
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

<HelmetProvider>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</HelmetProvider>
```

### Vite Config (asset optimization)

```typescript
// vite.config.ts
import { imagetools } from 'vite-imagetools';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    imagetools(),
    viteCompression({ algorithm: 'brotli' })
  ]
});
```

### Express Middleware (social crawler detection)

```typescript
// server/middleware/socialCrawler.ts
const SOCIAL_CRAWLERS = [
  'twitterbot', 'facebookexternalhit', 'slackbot', 'discordbot',
  'linkedinbot', 'whatsapp', 'telegrambot'
];

export function isSocialCrawler(userAgent: string): boolean {
  return SOCIAL_CRAWLERS.some(bot =>
    userAgent.toLowerCase().includes(bot)
  );
}

export function injectMetaTags(req, res, next) {
  const userAgent = req.headers['user-agent'] || '';

  if (isSocialCrawler(userAgent)) {
    // Extract lobby ID from URL
    const lobbyId = extractLobbyId(req.path);
    const lobby = lobbyId ? getLobby(lobbyId) : null;

    // Generate meta tags based on route
    const meta = generateMetaTags(req.path, lobby);

    // Serve HTML with meta tags injected
    return res.send(injectIntoHTML(meta));
  }

  next();
}
```

### Safe Area CSS

```css
/* client/src/index.css */
:root {
  --safe-area-inset-top: env(safe-area-inset-top);
  --safe-area-inset-bottom: env(safe-area-inset-bottom);
  --safe-area-inset-left: env(safe-area-inset-left);
  --safe-area-inset-right: env(safe-area-inset-right);
}

.app-container {
  padding-top: var(--safe-area-inset-top);
  padding-bottom: var(--safe-area-inset-bottom);
  padding-left: var(--safe-area-inset-left);
  padding-right: var(--safe-area-inset-right);
}
```

### Theme Tokens (JRPG styling)

```css
/* client/src/theme/jrpg.css */
:root {
  /* JRPG Frame Colors */
  --jrpg-frame-primary: #d4af37; /* Gold */
  --jrpg-frame-secondary: #1a1a2e; /* Dark blue */
  --jrpg-frame-accent: #9d4edd; /* Purple */

  /* Border Styles */
  --jrpg-border-width: 4px;
  --jrpg-border-radius: 8px;
  --jrpg-border-style: solid;

  /* Animation Timings */
  --transition-fast: 100ms;
  --transition-normal: 250ms;
  --transition-slow: 500ms;

  /* Touch Target Sizes */
  --touch-target-min: 44px;
  --button-padding: 12px 24px;
}
```

## Audio Asset Sources (recommended)

Since audio library sourcing was identified as a gap:

| Source | Type | License | Notes |
|--------|------|---------|-------|
| [freesound.org](https://freesound.org/) | Sound effects | CC0, CC-BY | Large community library. Filter by license. |
| [OpenGameArt.org](https://opengameart.org/) | Game audio | CC0, CC-BY, GPL | Game-specific sounds. UI sounds category. |
| [itch.io game assets](https://itch.io/game-assets/tag-sound-effects) | SFX packs | Various (check per pack) | Many free/paid UI sound packs. |
| [Zapsplat](https://www.zapsplat.com/) | Multimedia SFX | Free with attribution | Clean UI sounds. Multimedia category. |
| [BOOM Library - Casual UI](https://www.boomlibrary.com/sound-effects/casual-ui/) | Professional UI pack | Paid | High quality, game-ready. 150+ sounds. |

## Integration with Existing Stack

### Already in Project (leverage these)
- **Vite** - Fast dev server, asset optimization
- **React** - Component library, hooks
- **TypeScript** - Type safety across stack
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Animation library
- **Socket.IO** - Real-time events (keep, don't change)
- **Express** - Server framework (add middleware)

### New Additions
- **React Router** - Routing (NEW)
- **React Helmet Async** - Meta tags (NEW)
- **Howler.js** - Audio system (NEW)
- **vite-imagetools** - Image optimization (NEW)
- **Social crawler middleware** - SEO (NEW)

### No Changes Needed
- WebSocket infrastructure (reconnection already robust)
- Game state management (Zustand works well)
- Database layer (out of scope for UI milestone)
- Build system (Vite is ideal for this)

## Performance Considerations

### Mobile Bandwidth
- Optimize images with vite-imagetools (WebP, responsive sizes)
- Enable Brotli compression for text assets
- Lazy load phase-specific components with React.lazy()
- Audio sprite sheets (combine multiple sounds into one file)

### Touch Responsiveness
- Use CSS transforms for animations (GPU-accelerated)
- Debounce touch events (prevent double-taps)
- Haptic feedback only on intentional actions (not accidental touches)

### Safe Area Handling
- CSS env() variables for dynamic insets
- Fallback values for unsupported browsers
- Test on physical devices with notches

## Browser Support Targets

| Feature | Target Support | Fallback |
|---------|----------------|----------|
| CSS env() (safe areas) | iOS 11+, Chrome 69+ | Fixed padding (less precise) |
| View Transitions API | Chrome 111+, Safari 17.4+ | Framer Motion animations |
| Navigator Vibration | Chrome, Firefox, Samsung Internet | Graceful degradation (no vibration) |
| Web Audio API | All modern browsers | Fallback to Howler.js |

## Sources

**Routing & SEO:**
- [React Router Documentation](https://reactrouter.com/)
- [React Helmet Async GitHub](https://github.com/staylor/react-helmet-async)
- [Dynamic OG Tags for React SPA - VibeIt Blog](https://blog.vibeit.hr/blog/dynamic-og-tags)

**Mobile UX:**
- [CSS env() - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Viewport Meta Tag - MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag)
- [Navigator Vibration API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)

**Audio:**
- [Howler.js Documentation](https://howlerjs.com/)
- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

**Asset Optimization:**
- [vite-imagetools GitHub](https://github.com/JonasKruckenberg/imagetools)
- [vite-plugin-compression](https://github.com/vbenjs/vite-plugin-compression)
