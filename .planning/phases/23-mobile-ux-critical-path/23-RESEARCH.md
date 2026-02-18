# Phase 23: Mobile UX Critical Path - Research

**Researched:** 2026-02-18
**Domain:** Mobile web UX, touch input, CSS safe areas, React Three Fiber performance, orientation handling
**Confidence:** HIGH (primary claims verified against official docs and current sources)

---

## Summary

ScrumQuest has zero explicit mobile support today. The game uses a fixed 1920x1080 world with a viewport scale system, keyboard-driven player controls (WASD/Arrow keys, Ctrl to shoot, Q for specials, E for emotes), and a Three.js Canvas for the lobby's particle lighting. No safe-area CSS, no pointer events, no DPR capping, and no orientation adaptation exist. This phase retrofits mobile support across all five problem areas without breaking the existing desktop experience.

The work splits into five parallel tracks: (1) touch-target audit — the `AbilityButton` (64x64px, fine) and `fibonacci-button` (60px grid, borderline) need validation and the PlayerController needs touch-move controls added; (2) safe-area CSS — the viewport meta tag lacks `viewport-fit=cover` and zero CSS uses `env(safe-area-inset-*)`; (3) orientation adaptation — no media queries exist for portrait/landscape; (4) Three.js performance — the Canvas in `Lobby.tsx` has no `dpr` prop and no PerformanceMonitor; (5) reconnection UX — the `ReconnectionStatus` component exists and is well-built but needs verification it renders correctly on mobile viewports.

**Primary recommendation:** Use pure CSS (`env()`, media queries, Tailwind responsive utilities) and the existing `@react-three/drei` PerformanceMonitor for adaptive DPR. No new libraries are needed. Replace all `onClick`/`onMouseDown` + `addEventListener('click')` patterns on interactive game elements with `onPointerDown` to eliminate mobile double-fire.

---

## User Constraints

No CONTEXT.md exists for this phase. No locked user decisions. All choices are at Claude's discretion.

---

## Standard Stack

### Core (Already Installed — No New Packages Needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-three/fiber` | ^8.18.0 | Three.js React bindings including `dpr` prop on `<Canvas>` | Already in use; `dpr` prop is built-in |
| `@react-three/drei` | ^9.122.0 | `PerformanceMonitor` and `AdaptiveDpr` components | Already installed; PerformanceMonitor is the standard adaptive quality solution |
| Tailwind CSS | (current) | `min-h-[44px]`, `touch-action-none`, responsive prefixes | Already configured |
| CSS `env()` | Browser built-in | `safe-area-inset-top/right/bottom/left` | Universal browser support; no library needed |
| CSS `@media (orientation: portrait/landscape)` | Browser built-in | Orientation adaptation | No library needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-use` | (if needed) | `useOrientation` hook | Only if CSS media queries are insufficient for JS-side adaptation |
| `r3f-perf` | ^7.2.3 | Dev-only FPS monitoring | Already installed; useful during testing to verify DPR changes work |

### Alternatives Considered

| Standard Approach | Alternative | Why Not |
|-------------------|-------------|---------|
| CSS `env(safe-area-inset-*)` | `react-safe-area-component` npm package | The CSS primitive is universal and sufficient; no extra dependency needed |
| `onPointerDown` for inputs | `onTouchStart` + `onClick` | Pointer events unify touch/mouse/stylus; avoids double-fire without `preventDefault` hacks |
| `@react-three/drei` PerformanceMonitor | Custom FPS tracking | PerformanceMonitor is purpose-built, battle-tested, and already installed |
| CSS `@media (orientation)` | `ScreenOrientation.lock()` | Lock API requires fullscreen + special permissions on iOS; CSS is sufficient for layout adaptation |

**Installation:** No new packages required. All needed tools are already installed.

---

## Architecture Patterns

### Recommended Structure for New Mobile Files

```
client/src/
├── hooks/
│   ├── use-is-mobile.tsx          # EXISTS — MediaQuery-based, 768px breakpoint
│   └── useOrientation.ts          # NEW — wraps matchMedia orientation check
├── styles/
│   ├── tokens.css                 # EXISTS — JRPG tokens (Phase 22)
│   ├── retro.css                  # EXISTS — game styles
│   └── mobile.css                 # NEW — safe-area and orientation overrides
└── components/
    └── game/
        └── MobileControls.tsx     # NEW — virtual D-pad + action buttons for touch
```

---

### Pattern 1: Safe Area CSS with `viewport-fit=cover`

**What:** Two-step process. First, set `viewport-fit=cover` on the meta tag to allow content to extend edge-to-edge. Second, apply `env(safe-area-inset-*)` padding to fixed UI elements.

**When to use:** All fixed/absolute UI elements that appear near screen edges: PlayerHUD (bottom), TimerDisplay (top-left), BossMusicControls (top-right), ReconnectionStatus (top-center), sidebar toggle button.

**Step 1 — `client/index.html`:**
```html
<!-- Source: MDN env() docs + CSS-Tricks "The Notch" -->
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

**Step 2 — CSS:**
```css
/* Source: MDN env(), theosoti.com/short/safe-area-inset/ */
.player-hud {
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.fixed-top-left {
  padding-top: calc(8px + env(safe-area-inset-top));
  padding-left: calc(8px + env(safe-area-inset-left));
}

.fixed-top-right {
  padding-top: calc(8px + env(safe-area-inset-top));
  padding-right: calc(8px + env(safe-area-inset-right));
}
```

**Tailwind equivalent:**
```tsx
// Tailwind does not have built-in env() utilities — use inline style or CSS class
<div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
```

**Anti-pattern:** Do not just add padding to `body` globally — it will break the fixed 1920x1080 world coordinate system. Apply safe-area padding only to fixed-position UI overlay elements.

---

### Pattern 2: Touch Target Sizing (44x44px minimum)

**What:** Every interactive element must be at least 44x44 CSS pixels in tappable area. The visible element can be smaller, but its padding must make the total hit area ≥ 44x44.

**Current audit findings:**
- `AbilityButton`: `w-16 h-16` = 64x64px — **PASSES** already
- `fibonacci-button`: `minmax(60px, 1fr)` + `aspect-ratio: 1` — **BORDERLINE** — 60px minimum, but on narrow phones with many options, can shrink below 44px
- `retro-button`: padding `12px 24px`, no explicit height — height is font-size dependent, likely ~40px with Press Start 2P at `text-sm` — **LIKELY FAILS**
- `GameButton` `size.sm`: `px-3 py-1` — approximately 24-28px tall — **FAILS**
- BattleScreen sidebar toggle button: `p-3` = ~38px — **BORDERLINE**

**Fix pattern using Tailwind:**
```tsx
// Source: WCAG 2.5.8, Smashing Magazine accessible tap targets
<button className="min-h-[44px] min-w-[44px] px-3 py-2">
  ...
</button>
```

**Fix for GameButton component (`GameButton.tsx`):**
```tsx
// Update size variants to enforce minimum touch targets
size: {
  sm: 'px-3 py-2 min-h-[44px] text-xs',      // was: px-3 py-1
  md: 'px-6 py-3 min-h-[44px] text-sm',       // already sufficient
  lg: 'px-8 py-4 min-h-[44px] text-base',     // already sufficient
}
```

**For fibonacci-button grid:** Add `min-h-[44px]` to `.fibonacci-button` and adjust grid to prevent excessive shrinkage on narrow screens.

---

### Pattern 3: Pointer Events to Prevent Double-Fire

**What:** Mobile browsers synthesize a `click` event ~300ms after `touchend`. If a handler listens to both `onClick` (which fires for both touch and mouse) and `onTouchStart`, the handler fires twice. The fix is to replace touch/click combos with `onPointerDown`.

**When to use:** PlayerController (currently uses `onClick` for shooting and `window.addEventListener('keydown')` for keyboard — needs virtual touch controls), all interactive game elements.

**Example — PlayerController screen click:**
```tsx
// Source: javascript.info/pointer-events, MDN Pointer Events
// BEFORE (fires twice on mobile):
<div onClick={handleScreenClick}>

// AFTER (fires once for any input type):
<div onPointerDown={handleScreenPointerDown}>
```

**For global event listeners (PlayerController `keydown`):**
The keyboard-based movement is entirely non-functional on mobile. The PlayerController needs a virtual D-pad component added alongside the keyboard listeners — these should use `onPointerDown`/`onPointerUp` on button elements.

**Key insight:** React's synthetic `onClick` already handles touch via the browser's emulated click. The double-fire issue occurs specifically when code adds BOTH `onClick` AND `onTouchStart` listeners, or uses raw `addEventListener`. Audit for `addEventListener('click')` calls (found in BattleScreen emote modal open) and `onMouseDown` (found in PlayerController `onMouseDown` for focus) — these are the specific risk points.

---

### Pattern 4: Orientation Adaptation

**What:** CSS media queries detect portrait vs. landscape. The battle screen (fixed viewport with boss + players) is landscape-centric. Lobby/menus are scrollable and work in portrait. A "please rotate" nudge may be needed for battle phase on portrait mobile.

**CSS approach (no JS library needed):**
```css
/* Source: MDN Managing Screen Orientation, GeeksforGeeks useOrientation */
@media (orientation: portrait) and (max-width: 768px) {
  .battle-screen {
    /* Redirect layout or show rotate prompt */
  }

  .sidebar-panel {
    /* Convert from side panel to bottom sheet */
    width: 100%;
    height: auto;
    max-height: 40vh;
    bottom: 0;
    right: 0;
    top: auto;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  /* Short landscape (typical phone landscape) */
  .player-hud {
    padding: 4px 16px; /* Compact HUD to save vertical space */
  }
}
```

**React hook approach for conditional rendering:**
```tsx
// Lightweight hook — no library needed
export function useOrientation() {
  const [isPortrait, setIsPortrait] = useState(
    window.matchMedia('(orientation: portrait)').matches
  );

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const onChange = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isPortrait;
}
```

**Battle phase strategy:** Show a "rotate your device" overlay when in portrait + mobile during battle phase. This is the safest approach — the 1920x1080 fixed world simply cannot be meaningfully displayed in portrait on a phone.

---

### Pattern 5: React Three Fiber Mobile DPR + Adaptive Quality

**What:** The `<Canvas>` in `Lobby.tsx` renders Three.js particle lighting. On mobile, high `devicePixelRatio` (3-4 on modern iPhones) means 9-16x the pixels of a standard screen, which overwhelms mobile GPUs.

**Current state:** `Lobby.tsx` Canvas at line 2224 uses:
```tsx
<Canvas
  camera={{ position: [0, 2, 8], fov: 120 }}
  style={{ width: '100%', height: '100%' }}
  gl={{ antialias: true, alpha: true }}
>
```
No `dpr` prop — defaults to `window.devicePixelRatio`, uncapped.

**Fix — Cap DPR and add PerformanceMonitor:**
```tsx
// Source: r3f.docs.pmnd.rs/advanced/scaling-performance
// Source: github.com/pmndrs/drei PerformanceMonitor
import { PerformanceMonitor } from '@react-three/drei';

const [dpr, setDpr] = useState<number>(Math.min(window.devicePixelRatio, 2));

<Canvas
  camera={{ position: [0, 2, 8], fov: 120 }}
  style={{ width: '100%', height: '100%' }}
  gl={{ antialias: true, alpha: true }}
  dpr={dpr}  // Cap at 2 — eliminates 16x overdraw on iPhone 15 Pro (DPR=3)
>
  <PerformanceMonitor
    ms={250}
    iterations={10}
    bounds={(hz) => hz > 100 ? [60, 100] : [40, 60]}
    onDecline={() => setDpr(Math.max(dpr - 0.5, 1))}
    onIncline={() => setDpr(Math.min(dpr + 0.5, 2))}
  >
    <Suspense fallback={null}>
      <TavernLighting />
    </Suspense>
  </PerformanceMonitor>
</Canvas>
```

**PerformanceMonitor defaults (verified from GitHub source):**
- `ms`: 250 — collection window for FPS averaging
- `iterations`: 10 — number of averaging cycles
- `threshold`: 0.75 — 75% of iterations must match bounds to trigger
- `bounds`: auto-adapts to refresh rate (40-60 FPS for 60Hz screens, 60-100 for 120Hz)
- `step`: 0.1 — factor increment/decrement per adjustment

**Additional optimization for mobile:** If the lobby particle Canvas causes battery/heat issues, consider switching to `frameloop="demand"` mode and only re-rendering on interaction, or disabling the Canvas entirely on low-end mobile (detect via `navigator.hardwareConcurrency < 4`).

---

### Pattern 6: Virtual Mobile Controls for Battle

**What:** The battle phase `PlayerController` is 100% keyboard-driven. Mobile users have no way to move, jump, or attack. A virtual D-pad + action buttons must be added.

**Approach:** Add a `MobileControls` overlay component that renders only when `useIsMobile()` is true. These buttons call the same handlers as keyboard events but via touch.

```tsx
// Source: Game dev pattern — virtual gamepad with pointer events
function MobileControls({ onMove, onJump, onShoot }) {
  return (
    <div className="fixed bottom-safe-area left-0 right-0 z-50 pointer-events-none"
         style={{ bottom: 'env(safe-area-inset-bottom)' }}>
      {/* D-Pad */}
      <div className="pointer-events-auto absolute bottom-4 left-4">
        {['up', 'down', 'left', 'right'].map(dir => (
          <button
            key={dir}
            className="min-w-[44px] min-h-[44px]"
            onPointerDown={() => onMove(dir, true)}
            onPointerUp={() => onMove(dir, false)}
          >
            {/* Arrow icon */}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="pointer-events-auto absolute bottom-4 right-4">
        <button className="min-w-[44px] min-h-[44px]" onPointerDown={onJump}>
          JUMP
        </button>
        <button className="min-w-[44px] min-h-[44px]" onPointerDown={onShoot}>
          SHOOT
        </button>
      </div>
    </div>
  );
}
```

---

### Anti-Patterns to Avoid

- **Global `viewport-fit=cover` without safe-area padding:** Enables edge-to-edge but clips content behind notches. Must be paired with `env()` on fixed UI elements.
- **Using `window.addEventListener('touchstart')` + `onClick`:** Causes double-fire. Use `onPointerDown` instead.
- **Applying safe-area insets to the game world container:** The 1920x1080 world must stay untouched. Only overlay UI elements (fixed/absolute) get safe-area padding.
- **Setting DPR to 1 always:** Reduces quality too aggressively. Capping at 2 (instead of uncapped) is the right balance for mid-range phones.
- **Using `ScreenOrientation.lock()` for battle mode:** Requires fullscreen mode + special permissions on iOS Safari. Show a soft "rotate device" overlay instead.
- **`antialias: true` on mobile Canvas:** Anti-aliasing is expensive on mobile GPU. Consider `antialias: false` on mobile to reduce fragment shader cost.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Adaptive Three.js quality | Custom FPS tracker with requestAnimationFrame | `@react-three/drei` PerformanceMonitor | Built-in, handles refresh rate detection, flipflop protection, already installed |
| DPR capping | Manual `renderer.setPixelRatio()` | `<Canvas dpr={[1, 2]}>` prop | R3F Canvas `dpr` prop handles it declaratively; array form `[min, max]` also valid |
| Device detection for mobile | User-agent sniffing | CSS media queries + `window.matchMedia` | UA sniffing is unreliable; media queries are standard and accurate |
| Safe area values | JavaScript to read insets | CSS `env(safe-area-inset-*)` | CSS handles it natively; no JS polling needed |

**Key insight:** All five problem areas in this phase have well-established CSS and library-level solutions. The temptation to build custom solutions (custom FPS tracking, custom orientation polling, custom device detection) should be resisted — the primitives are robust and widely supported.

---

## Common Pitfalls

### Pitfall 1: `viewport-fit=cover` Without Safe-Area Padding
**What goes wrong:** Content is clipped behind iPhone notch or Android punch-hole. Bottom content is hidden behind home indicator.
**Why it happens:** `viewport-fit=cover` expands to full screen but does not automatically add safe-zone compensation.
**How to avoid:** Any time `viewport-fit=cover` is added, immediately audit ALL fixed/absolute elements near screen edges and add `env(safe-area-inset-*)` padding.
**Warning signs:** UI elements disappearing on device vs. browser simulator.

### Pitfall 2: Fibonacci Estimation Cards Too Small on Portrait Phone
**What goes wrong:** Score submission grid with 10+ options (Fibonacci: 1,2,3,5,8,13,21,34,55,89,?) renders at <40px per button on 375px-wide portrait phone.
**Why it happens:** `.fibonacci-grid` uses `minmax(60px, 1fr)` — with 11 options plus ? (12 items), and sidebar taking 30vw, remaining space is ~262px → ~21px per card. Even fullscreen, 11 items at 1fr = ~30px each.
**How to avoid:** On mobile, restructure the fibonacci grid to use 4 or 5 columns maximum with `min-h-[44px]` enforced. The sidebar moves to a bottom sheet on mobile.
**Warning signs:** Users tapping wrong numbers.

### Pitfall 3: PlayerController Keyboard Controls Are Dead on Mobile
**What goes wrong:** The entire game battle mechanic is keyboard-driven (WASD/arrows for movement, Ctrl to shoot, Space to jump, E to emote). None of these are available on a touchscreen.
**Why it happens:** PlayerController.tsx has no touch input path — it's a pure keyboard listener.
**How to avoid:** Add `MobileControls` component with virtual buttons that imperatively update the `keys` Set (or call handlers directly). Use `onPointerDown`/`onPointerUp` for hold-to-move behavior.
**Warning signs:** Player character unable to move during battle on phone.

### Pitfall 4: `antialias: true` Overheating Mobile GPU
**What goes wrong:** The Canvas in Lobby.tsx (TavernLighting particles) runs with `antialias: true`. On mobile, MSAA anti-aliasing multiplies GPU fragment work significantly.
**Why it happens:** The option was set for desktop visual quality without mobile consideration.
**How to avoid:** Detect mobile and pass `gl={{ antialias: !isMobile, alpha: true }}`, or use the PerformanceMonitor `onDecline` callback to toggle.
**Warning signs:** Device gets warm during lobby; FPS drops below 30.

### Pitfall 5: `maximum-scale=1` in Viewport Meta Breaks Accessibility
**What goes wrong:** Current `index.html` has `maximum-scale=1` which prevents pinch-to-zoom, violating WCAG 1.4.4 (Resize Text).
**Why it happens:** Common anti-pattern used to "fix" double-tap zoom issues on older iPhones.
**How to avoid:** Remove `maximum-scale=1`. Fix double-tap zoom using `touch-action: manipulation` on interactive elements instead.
**Warning signs:** WCAG audit failures; accessibility complaints.

### Pitfall 6: `touch-action: none` on Canvas Blocks Scrolling
**What goes wrong:** `client/src/index.css` sets `canvas { touch-action: none; }` globally — this prevents native scroll on iOS when Canvas is embedded in scrollable pages.
**Why it happens:** Blanket rule to prevent Three.js canvas from being scrolled accidentally.
**How to avoid:** Scope `touch-action: none` only to the actual Three.js Canvas during active interaction (the Lobby tavern lighting canvas). Non-interactive canvases should use `touch-action: auto` or `touch-action: pan-y`.

### Pitfall 7: BattleScreen Fixed Sidebar Breaks on Small Viewport
**What goes wrong:** `renderCollapsibleSidebar()` creates a fixed 30vw panel with `height: 80vh; marginTop: 10vh`. On phone landscape (568px wide), the sidebar takes 170px leaving only 398px for the game. In portrait, it's catastrophic.
**Why it happens:** Sidebar was designed for desktop 1080p+ screens.
**How to avoid:** Replace with bottom sheet on mobile using CSS `@media (max-width: 768px)`. The ScoreSubmission and Discussion components render full-width below the boss view on portrait, or as a slide-up from bottom on landscape.

---

## Code Examples

### Example 1: Safe Area in Tailwind (index.css utility classes)
```css
/* Add to index.css — creates utility for safe area bottom padding */
/* Source: MDN env(), CSS-Tricks env() almanac */
@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
  .pl-safe {
    padding-left: env(safe-area-inset-left);
  }
  .pr-safe {
    padding-right: env(safe-area-inset-right);
  }
}
```

### Example 2: Three.js Canvas with DPR Cap + PerformanceMonitor
```tsx
// Source: r3f.docs.pmnd.rs/advanced/scaling-performance
// Source: github.com/pmndrs/drei PerformanceMonitor component source
import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';

function ThreeCanvas({ children }) {
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 2));

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: window.devicePixelRatio < 2, alpha: true }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(d - 0.5, 1))}
        onIncline={() => setDpr((d) => Math.min(d + 0.5, 2))}
      >
        {children}
      </PerformanceMonitor>
    </Canvas>
  );
}
```

### Example 3: Pointer Events for Shooting (removes double-fire)
```tsx
// Source: javascript.info/pointer-events, MDN Pointer Events API
// BEFORE — fires twice on mobile (touch generates synthetic click)
const handleScreenClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
  // ...shoot logic
}, []);

// AFTER — fires once for any pointer type
const handleScreenPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
  if (event.pointerType === 'touch') {
    event.preventDefault(); // Prevent synthetic mouse events
  }
  // ...same shoot logic
}, []);

<div onPointerDown={isActive ? handleScreenPointerDown : undefined}>
```

### Example 4: Orientation Media Query for Battle Sidebar
```css
/* Source: MDN Managing Screen Orientation */
/* Mobile portrait: sidebar becomes bottom sheet */
@media (orientation: portrait) and (max-width: 768px) {
  .battle-sidebar {
    position: fixed;
    bottom: env(safe-area-inset-bottom);
    left: 0;
    right: 0;
    top: auto;
    height: auto;
    max-height: 45vh;
    width: 100%;
    border-top: 2px solid var(--retro-border);
    border-left: none;
    overflow-y: auto;
  }
}

/* Mobile landscape: compact sidebar stays right but narrower */
@media (orientation: landscape) and (max-height: 500px) {
  .battle-sidebar {
    width: 40vw; /* Wider to fit content */
    max-height: 85vh;
    margin-top: 5vh;
  }
  .player-hud {
    padding: 6px 12px; /* Reduce vertical footprint */
  }
}
```

### Example 5: Rotate Device Overlay for Battle Portrait Mode
```tsx
// Show when: isMobile AND isPortrait AND gamePhase === 'battle'
function RotateDeviceOverlay() {
  const isMobile = useIsMobile();
  const isPortrait = useOrientation(); // new hook returns true if portrait
  const { currentLobby } = useGameState();
  const isBattle = ['battle', 'discussion', 'reveal'].includes(
    currentLobby?.gamePhase ?? ''
  );

  if (!isMobile || !isPortrait || !isBattle) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center
                    bg-black/90 text-white text-center p-8">
      <div>
        <div className="text-4xl mb-4">↻</div>
        <p className="font-jrpg text-sm">
          Rotate your device to landscape for the best battle experience
        </p>
      </div>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `touchstart` + `click` handlers | Pointer Events API (`pointerdown`) | CSS WG 2019, universal browser support 2020+ | Single handler for all input types; no double-fire |
| `maximum-scale=1` to prevent double-tap | `touch-action: manipulation` on elements | iOS Safari 12.2+ (2019) | Prevents accidental zoom without breaking accessibility |
| Manual `renderer.setPixelRatio()` | R3F `<Canvas dpr={[1,2]}>` | R3F v8+ (2022) | Declarative; PerformanceMonitor can adjust it dynamically |
| UA-string device detection | `window.matchMedia()` + CSS media queries | Always preferred | Accurate, respects user preference, no UA parsing |
| Hard-coded `height: 100vh` for mobile | `min-height: 100dvh` (dynamic viewport height) | CSS Level 5, 2022+ | `100vh` on iOS includes address bar height; `dvh` excludes it |

**Deprecated/outdated:**
- `maximum-scale=1` in viewport meta: violates WCAG 1.4.4 — the project currently uses this (`client/index.html` line 5: `maximum-scale=1`). Must be removed.
- `vh` units for full-screen on mobile: use `dvh` (dynamic viewport height) for layouts that must fill the visible browser viewport excluding the Safari address bar.

---

## Open Questions

1. **Should battle phase enforce landscape orientation via UI prompt or be redesigned for portrait?**
   - What we know: The 1920x1080 fixed world system is landscape-centric. Portrait on phone would show ~54% of the game world.
   - What's unclear: Whether the product wants to support portrait battle, or prompt to rotate.
   - Recommendation: Ship a soft "rotate device" overlay for portrait+mobile+battle. Defer full portrait battle support to a future phase.

2. **How much of the PlayerController can be shared between keyboard and virtual touch controls?**
   - What we know: The `keys` Set and movement loop are in `PlayerController`. Touch buttons would need to set/clear the same keys Set, or bypass it.
   - What's unclear: Whether bypass handlers are cleaner than simulating key events.
   - Recommendation: Touch buttons update the `keys` Set directly by adding/removing key codes — same code path as keyboard, zero duplication.

3. **Does the Lobby Canvas (`TavernLighting`) need to remain active on mobile, or can it be disabled?**
   - What we know: It provides ambient particle lighting effects in the lobby. On mobile, it's a significant GPU cost.
   - What's unclear: Whether the visual effect is worth the performance cost on mobile.
   - Recommendation: Keep it but cap DPR at 2 and add PerformanceMonitor. If PerformanceMonitor hits `onFallback`, disable the Canvas with a CSS background fallback.

4. **What is `dvh` browser support on the target mobile browsers?**
   - What we know: `dvh` is supported in all major mobile browsers since 2022 (iOS Safari 15.4+, Chrome Android 108+).
   - Recommendation: Use `dvh` with `vh` fallback: `height: 100vh; height: 100dvh;`

---

## Sources

### Primary (HIGH confidence)
- R3F official docs (r3f.docs.pmnd.rs/advanced/scaling-performance) — Canvas `dpr` prop, performance system
- github.com/pmndrs/drei PerformanceMonitor source — verified all props, defaults, and API
- MDN `env()` docs (developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env) — safe-area-inset-* values and viewport-fit
- javascript.info/pointer-events — Pointer Events API fundamentals
- W3C WCAG 2.5.8 (w3.org/WAI/WCAG21/Understanding/target-size.html) — 44x44px minimum touch target

### Secondary (MEDIUM confidence)
- Codebase analysis: `client/src/components/game/Lobby.tsx` (Canvas usage, line 2224)
- Codebase analysis: `client/index.html` (viewport meta, maximum-scale=1 issue)
- Codebase analysis: `client/src/styles/retro.css` (fibonacci-button, retro-button sizing)
- Codebase analysis: `client/src/components/game/PlayerController.tsx` (keyboard-only input)
- CSS-Tricks "The Notch" article — verified safe-area implementation patterns
- Smashing Magazine accessible tap targets — touch target sizing guidance

### Tertiary (LOW confidence)
- Various WebSearch results on orientation hooks — usehooks.com `useOrientation` implementation pattern (LOW: single source, not official)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; APIs verified in official docs
- Architecture: HIGH — patterns derived from official R3F docs and MDN; codebase-specific findings from direct code reading
- Pitfalls: HIGH for safe-area and DPR (common, documented); MEDIUM for battle portrait layout (project-specific judgment)

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable APIs — R3F, CSS env(), Pointer Events are not fast-moving)
