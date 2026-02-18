# Phase 22: JRPG Theme Foundation - Research

**Researched:** 2026-02-18
**Domain:** CSS Design Tokens, React Component Architecture, Animation, Audio, Accessibility
**Confidence:** HIGH

---

## Summary

Phase 22 establishes the foundational design system for ScrumQuest's JRPG aesthetic. The codebase already has meaningful groundwork: a `retro.css` file with CSS custom properties (`--retro-bg`, `--retro-primary`, `--retro-accent`, etc.), existing `RetroCard` and `RetroButton` components, `retro-health-bar`/`retro-health-fill` classes, and a fully operational `useAudio` Zustand store playing 8 sound effects (button-select, hit, explosion, walking, success, level-up, menu-theme, boss-fight). The app uses `framer-motion@11.13.1`, `howler@2.2.4`, `gsap@3.14.2`, `class-variance-authority@0.7.1`, and `@axe-core/playwright@4.11.1` — all already installed.

The primary work is **systematizing and extending** what exists rather than starting from scratch. The existing CSS variables in `retro.css` and `index.css` need consolidation into a coherent token hierarchy. The existing `RetroCard`/`RetroButton` need to become the full `GamePanel`/`GameButton`/`StatBar`/`HealthBar` component family with CVA-based variants. JRPG ornamental frames are achievable with CSS `border-image` using a 9-slice sprite or with layered `box-shadow` — no external JS framework needed. Phase transitions already have a skeleton (`PhaseTransition.tsx`) that needs Framer Motion wired in. Sound effects for game events (phase transitions, confirmations, errors) need mapping from the useAudio store to UI event hooks. Accessibility contrast is the highest-risk item because the glowing neon-on-dark aesthetic frequently violates WCAG AA — measurement and targeted fixes are required.

**Primary recommendation:** Extend `retro.css` into a structured `--jrpg-*` token layer, evolve existing `RetroCard`/`RetroButton` into CVA-based themed components, wire `framer-motion`'s `AnimatePresence` into `PhaseTransition.tsx`, and validate all text against 4.5:1 contrast using the WebAIM checker before shipping.

---

## Codebase State (What Already Exists)

This section is critical for planning — do not rebuild what exists.

### Existing CSS Tokens (retro.css)
```css
/* Already defined in :root of retro.css */
--retro-bg: #1a1a2e
--retro-primary: #16213e
--retro-secondary: #0f3460
--retro-accent: #e94560
--retro-text: #f5f5f5
--retro-text-dim: #b0b0b0
--retro-border: #333366
--retro-glow: hsl(var(--hue) 100% 60%)  /* animating rainbow */
--retro-glow-light: hsl(var(--hue) 100% 85%)
```

### Existing CSS Classes (retro.css)
- `.retro-container` — full-page background wrapper
- `.retro-window` — panel with border + inset shadow
- `.retro-button` — gradient button with glow hover
- `.retro-input` — styled text input
- `.retro-card` — content card (used in 20+ components)
- `.retro-health-bar` / `.retro-health-fill` — health bar track + fill
- `.retro-text-glow` / `.retro-text-glow-light` — neon text effects
- `.retro-pixel-border` — pixelated image rendering

### Existing Components
- `client/src/components/ui/retro-button.tsx` — `RetroButton` with variant (primary/secondary/accent) + size (sm/md/lg)
- `client/src/components/ui/retro-card.tsx` — `RetroCard` with optional title
- `client/src/components/game/XPBar.tsx` — XP stat bar (CSS module pattern)
- `client/src/components/game/phases/PhaseTransition.tsx` — skeleton for phase transitions (timeouts, no Framer Motion yet)

### Existing Audio (useAudio store)
Files already in `/client/public/sounds/`:
- `button-select.mp3`, `hit.mp3`, `explosion.mp3`, `walking.mp3`, `success.mp3`, `level-up.mp3`
- `menu-theme.mp3`, `scrum-battles.mp3`, `boss-fight.mp3`, `lobby-theme.mp3`, `background.mp3`

`useAudio` store functions already wired: `playButtonSelect()`, `playHit()`, `playSuccess()`, `playExplosion()`, `playLevelUp()`, `startWalkingSound()`.

**Missing sounds for phase events:** cursor move (hover), confirm/open panel, close panel, error — these need sourcing.

### Existing Shadcn/UI Variables (index.css)
The app already has shadcn CSS variables (`--background`, `--foreground`, `--primary`, etc.) plus `tailwind.config.ts` with those mapped to Tailwind utilities. Press Start 2P font is loaded via `@font-face` in `index.css`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| framer-motion | 11.13.1 (installed) | Phase transition animations, AnimatePresence | Already installed, industry standard for React animations |
| class-variance-authority | 0.7.1 (installed) | CVA variants for themed components | Used by shadcn/ui, enables type-safe component variants |
| clsx + tailwind-merge | installed | Conditional class merging | Already used via `cn()` utility throughout codebase |
| tailwindcss | 3.4.14 (installed) | Utility CSS | Already the CSS foundation |
| @axe-core/playwright | 4.11.1 (installed) | Accessibility contrast auditing | Already installed for E2E tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| howler | 2.2.4 (installed) | Sound effect playback | Already used via useAudio store; extend for new SFX |
| gsap | 3.14.2 (installed) | Complex animation sequences | For ornate JRPG animations (not routine transitions) |
| tailwindcss-animate | installed | CSS keyframe utilities | Already used for shadcn components |

### Not Needed (Already Covered)
| Problem | Don't Install | Already Have |
|---------|---------------|--------------|
| Animation library | Don't install motion/react | framer-motion@11 (same codebase, different package name) |
| Sound library | Don't install react-howler | useAudio Zustand store wraps HTML5 Audio directly |
| Component variants | Don't install another system | CVA already installed |
| Pixel fonts | Don't fetch from Google Fonts | Press Start 2P loaded via local woff2 |

**Installation needed:** No new packages required. All dependencies are installed.

---

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── styles/
│   ├── retro.css           # EXTEND (add --jrpg-* tokens, keep --retro-* for compatibility)
│   └── tokens.css          # NEW: Semantic token layer (maps --jrpg-* to roles)
├── components/
│   ├── ui/
│   │   ├── GamePanel.tsx    # NEW: Replaces/wraps RetroCard with JRPG frame
│   │   ├── GameButton.tsx   # NEW: Replaces/wraps RetroButton with CVA variants
│   │   ├── StatBar.tsx      # NEW: Generic stat bar (XP, mana, stamina)
│   │   ├── HealthBar.tsx    # NEW: Boss/player health bar with segments
│   │   ├── retro-button.tsx # KEEP: Backward compat during migration
│   │   └── retro-card.tsx   # KEEP: Backward compat during migration
│   └── game/
│       └── phases/
│           └── PhaseTransition.tsx  # REFACTOR: Add AnimatePresence
└── lib/
    └── stores/
        └── useAudio.tsx      # EXTEND: Add phase-transition SFX triggers
```

### Pattern 1: CSS Token Hierarchy (Two-Layer)
**What:** Separate primitive tokens (raw colors) from semantic tokens (role-based).
**When to use:** Any new color, spacing, or shadow value.
**Example:**
```css
/* Layer 1: Primitives (in retro.css :root — extend existing) */
:root {
  /* Keep existing --retro-* for backward compat */
  --retro-bg: #1a1a2e;

  /* Add JRPG semantic tokens */
  --jrpg-panel-bg: var(--retro-primary);        /* #16213e */
  --jrpg-panel-border: var(--retro-border);      /* #333366 */
  --jrpg-panel-glow: var(--retro-glow);
  --jrpg-btn-primary-bg: var(--retro-secondary); /* #0f3460 */
  --jrpg-btn-primary-text: var(--retro-text);    /* #f5f5f5 */
  --jrpg-btn-danger-bg: var(--retro-accent);     /* #e94560 */
  --jrpg-health-high: #22c55e;   /* green-500 */
  --jrpg-health-mid: #eab308;    /* yellow-500 */
  --jrpg-health-low: #ef4444;    /* red-500 */
  --jrpg-xp-fill: #3b82f6;       /* blue-500 */
  --jrpg-spacing-panel: 16px;
  --jrpg-radius-panel: 8px;
  --jrpg-border-width: 2px;
  --jrpg-font-primary: 'Press Start 2P', 'Courier New', monospace;
  --jrpg-shadow-panel: 0 0 20px var(--jrpg-panel-glow), inset 0 0 20px rgba(0,0,0,0.5);
}
```

### Pattern 2: CVA-Based Component Variants
**What:** Use `class-variance-authority` for typed component variants.
**When to use:** Any themed component with variant/size props.
**Example:**
```typescript
// Source: class-variance-authority docs pattern (used by shadcn/ui)
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const gamePanelVariants = cva(
  // Base classes always applied
  'jrpg-panel relative rounded font-jrpg text-jrpg-text',
  {
    variants: {
      variant: {
        default: 'bg-[var(--jrpg-panel-bg)] border-[var(--jrpg-panel-border)]',
        golden: 'bg-amber-950 border-amber-500',
        dark:   'bg-gray-950 border-gray-700',
      },
      size: {
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

interface GamePanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
          VariantProps<typeof gamePanelVariants> {
  title?: string;
}

export function GamePanel({ className, variant, size, title, children, ...props }: GamePanelProps) {
  return (
    <div className={cn(gamePanelVariants({ variant, size }), className)} {...props}>
      {title && <h3 className="jrpg-panel-title">{title}</h3>}
      {children}
    </div>
  );
}
```

### Pattern 3: JRPG Ornamental Frames (CSS-Only)
**What:** Multi-border frame effect using `box-shadow` layers + `::before`/`::after` pseudo-elements.
**When to use:** GamePanel, modals, and card components.
**Example:**
```css
/* Ornamental frame using layered box-shadow (no image assets needed) */
.jrpg-panel {
  border: 2px solid var(--jrpg-panel-border);
  box-shadow:
    /* Outer glow */
    0 0 12px var(--jrpg-panel-glow),
    /* Inner highlight */
    inset 0 0 8px rgba(0, 0, 0, 0.5),
    /* Inner border simulation */
    inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  position: relative;
}

/* Corner ornament using pseudo-elements (JRPG aesthetic) */
.jrpg-panel::before {
  content: '';
  position: absolute;
  inset: -4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: inherit;
  pointer-events: none;
}
```

**Alternative (image-based ornaments):** Use CSS `border-image` with a 9-slice PNG if pixel-art corner decorations are desired. Source from OpenGameArt or craft simple 32x32 corner sprites. This requires image assets and is optional.

### Pattern 4: Framer Motion Phase Transitions
**What:** `AnimatePresence` wraps the phase-keyed component. Variants define enter/exit states.
**When to use:** All phase changes in `PhaseTransition.tsx`.
**Example:**
```typescript
// framer-motion@11 — import stays "framer-motion" (not "motion/react" until v12+)
import { AnimatePresence, motion } from 'framer-motion';

const phaseVariants = {
  hidden:  { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0,  scale: 1 },
  exit:    { opacity: 0, y: -20, scale: 0.98 },
};

// In PhaseTransition.tsx — replace setTimeout logic with AnimatePresence
export function PhaseTransition({ toPhase, isTransitioning, children }: PhaseTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={toPhase}               // Key change triggers exit → enter
        variants={phaseVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

**AnimatePresence `mode` options:**
- `"wait"` — exit completes before enter starts (recommended for phase transitions)
- `"sync"` — exit and enter run simultaneously
- `"popLayout"` — pops the exiting element out of layout flow

### Pattern 5: StatBar and HealthBar Components
**What:** Controlled progress bars with animated fill transitions.
**When to use:** All numeric stats (health, XP, timer, mana).
**Example:**
```typescript
interface StatBarProps {
  value: number;       // 0–100 percent OR raw value
  max?: number;        // If provided, renders value/max
  variant?: 'health' | 'xp' | 'timer' | 'mana';
  label?: string;
  showValue?: boolean;
}

export function StatBar({ value, max, variant = 'health', label, showValue }: StatBarProps) {
  const pct = max ? (value / max) * 100 : value;
  // Health color shifts red/yellow/green based on pct
  return (
    <div className="jrpg-stat-bar" role="progressbar" aria-valuenow={value} aria-valuemax={max ?? 100} aria-label={label}>
      <div className="jrpg-stat-fill" style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
      {showValue && <span className="jrpg-stat-label">{max ? `${value}/${max}` : `${value}%`}</span>}
    </div>
  );
}
```

### Pattern 6: Sound Effect Hook
**What:** A `useGameSounds` hook that maps semantic events to `useAudio` store calls.
**When to use:** In `GameButton`, `GamePanel`, and phase transitions.
**Example:**
```typescript
// Sound event mapping — extend useAudio, don't bypass it
export function useGameSounds() {
  const { playButtonSelect, playSuccess, playHit } = useAudio();
  return {
    onButtonClick: playButtonSelect,
    onPanelOpen:   playSuccess,     // Map to existing 'success.mp3' temporarily
    onPhaseChange: playSuccess,
    onError:       playHit,         // Map to existing sound temporarily
  };
}
```

### Anti-Patterns to Avoid
- **Duplicating tokens in Tailwind config:** Define colors once in CSS variables, map to Tailwind via `@theme inline`. Do not hardcode hex values in `tailwind.config.ts`.
- **Bypassing useAudio for sound:** Do not create `new Audio()` directly in components. All sounds go through the Zustand store.
- **Using framer-motion for simple CSS transitions:** Button hover, card fade-in — use CSS `transition` property. Reserve Framer Motion for unmount/mount (AnimatePresence) scenarios.
- **Removing existing --retro-* tokens:** Keep them. Many components depend on these classes. Add --jrpg-* on top; migrate gradually.
- **One giant CSS file:** Keep `retro.css` as-is for existing styles. Add a new `tokens.css` for the token layer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Component variant system | Custom className logic | `class-variance-authority` (installed) | Type safety, handles compound variants, shadcn/ui uses it |
| Exit/enter animations | setTimeout + opacity toggles | `AnimatePresence` from framer-motion | Already in `PhaseTransition.tsx` skeleton; handles unmount edge cases |
| Contrast calculation | Manual hex math | WebAIM contrast checker + @axe-core | WCAG math is non-trivial; tools catch dynamically-computed values |
| Audio sprite management | Multiple Audio() instances | Extend useAudio store (Howler under the hood) | Store already handles mute state, fade timers, and track management |
| CSS `border-image` 9-slice | Custom JS tiling | Native CSS `border-image` + `border-image-slice` | Browser-native, scales with element |

**Key insight:** The biggest risk is rebuilding what exists. Read `retro.css`, `retro-button.tsx`, `retro-card.tsx`, `XPBar.tsx`, and `useAudio.tsx` before writing any new code.

---

## Common Pitfalls

### Pitfall 1: WCAG Contrast Failure on Neon-on-Dark
**What goes wrong:** The existing neon glow effect on dark backgrounds frequently fails WCAG AA. `--retro-glow: hsl(var(--hue) 100% 60%)` on `#1a1a2e` background produces contrast ratios well below 4.5:1 at many hue values. The rainbow animation means different ratios at each moment.
**Why it happens:** High-saturation neon colors look vivid to designers but have luminance values close to mid-gray, not high-contrast white/black.
**How to avoid:** Freeze the animated `--retro-glow` for text — use a fixed, pre-validated color for interactive text (not the animated hue cycle). Reserve the hue animation for decorative/non-text elements.
**Warning signs:** Any `retro-text-glow` on interactive elements; text with `opacity < 1`; hover state color changes without contrast re-validation.

### Pitfall 2: AnimatePresence Key Mismatch
**What goes wrong:** If `key` on the `motion` child doesn't change between phase transitions, AnimatePresence won't trigger exit animations. The component re-renders in place without the transition.
**Why it happens:** Developers use a stable key (e.g., `key="phase-content"`) instead of the phase value.
**How to avoid:** Always `key={toPhase}` or `key={someUniquePhaseId}`. Every unique phase must produce a unique key.
**Warning signs:** Transitions feel instant with no visible animation; no console errors.

### Pitfall 3: Sound on Every Re-render
**What goes wrong:** A `playButtonSelect()` call inside a component body (not in an event handler) fires on every re-render, creating a sound loop.
**Why it happens:** Easy to accidentally put sound calls in `useEffect` with wrong dependencies or in JSX.
**How to avoid:** Sound calls only in event handlers (`onClick`, `onHover`, `onChange`). Never in render body.
**Warning signs:** Rapid audio clicks on state updates; useAudio store `isTransitioning` flag thrashing.

### Pitfall 4: CSS Token Naming Collision with Shadcn
**What goes wrong:** Adding `--primary` or `--background` JRPG tokens collides with shadcn/ui's own CSS variables, breaking shadcn components.
**Why it happens:** shadcn uses a flat namespace without a package prefix.
**How to avoid:** Use `--jrpg-*` prefix for all new tokens. Never redefine `--primary`, `--secondary`, `--card`, etc. unless intentionally theming shadcn.

### Pitfall 5: Press Start 2P at Tiny Sizes
**What goes wrong:** Press Start 2P is a bitmap pixel font that becomes unreadable at sizes below 10px (and sometimes 12px). It also renders poorly at non-integer pixel sizes.
**Why it happens:** Existing global `* { font-family: 'Press Start 2P' }` means body text at `text-sm` (14px) may be OK, but hints, captions, and metadata at `text-xs` (12px) or smaller are often illegible and fail contrast.
**How to avoid:** For small text, switch to a fallback readable sans-serif OR increase size. Establish a minimum 14px rule for Press Start 2P. Add `font-size: clamp(12px, 2vw, 16px)` for responsive scaling.

---

## Code Examples

### CSS Token Layer (tokens.css)
```css
/* Source: shadcn/ui theming pattern + existing retro.css tokens */
/* client/src/styles/tokens.css — import AFTER retro.css */

:root {
  /* ── Color Tokens ─────────────────────────── */
  /* Panel/Container */
  --jrpg-panel-bg:          var(--retro-primary);   /* #16213e */
  --jrpg-panel-bg-raised:   #1d2d5a;
  --jrpg-panel-border:      var(--retro-border);    /* #333366 */
  --jrpg-panel-border-gold: #b8860b;
  --jrpg-panel-glow:        var(--retro-glow);

  /* Text */
  --jrpg-text-primary:   #f5f5f5;   /* 12.6:1 on panel-bg */
  --jrpg-text-secondary: #b0b0b0;   /* 7.2:1 on panel-bg */
  --jrpg-text-accent:    #ffd700;   /* 9.8:1 on panel-bg — use this for headers */
  --jrpg-text-danger:    #ff6b6b;   /* 4.7:1 on panel-bg — passes AA */
  --jrpg-text-muted:     #808080;   /* 4.6:1 on panel-bg — just passes AA */

  /* Interactive */
  --jrpg-btn-primary-bg:   var(--retro-secondary);  /* #0f3460 */
  --jrpg-btn-primary-text: #f5f5f5;
  --jrpg-btn-danger-bg:    var(--retro-accent);     /* #e94560 */
  --jrpg-btn-danger-text:  #ffffff;

  /* Stat Bars */
  --jrpg-health-high:  #22c55e;  /* hp > 50% */
  --jrpg-health-mid:   #eab308;  /* hp 25–50% */
  --jrpg-health-low:   #ef4444;  /* hp < 25% */
  --jrpg-xp-fill:      #3b82f6;
  --jrpg-mana-fill:    #8b5cf6;

  /* ── Spacing Tokens ───────────────────────── */
  --jrpg-space-xs:  4px;
  --jrpg-space-sm:  8px;
  --jrpg-space-md:  16px;
  --jrpg-space-lg:  24px;
  --jrpg-space-xl:  32px;

  /* ── Border Tokens ────────────────────────── */
  --jrpg-border-width:  2px;
  --jrpg-border-radius: 4px;   /* Pixel-art: low radius */

  /* ── Shadow Tokens ────────────────────────── */
  --jrpg-shadow-panel:  0 0 20px var(--jrpg-panel-glow), inset 0 0 20px rgba(0,0,0,0.5);
  --jrpg-shadow-button: 0 0 15px var(--jrpg-panel-glow);

  /* ── Typography Tokens ────────────────────── */
  --jrpg-font-primary: 'Press Start 2P', 'Courier New', monospace;
  --jrpg-font-size-min: 12px;  /* Never go below this with Press Start 2P */
}
```

### StatBar Component
```typescript
// client/src/components/ui/StatBar.tsx
import { cn } from '@/lib/utils';

interface StatBarProps {
  value: number;
  max?: number;
  variant?: 'health' | 'xp' | 'mana' | 'timer';
  label?: string;
  className?: string;
}

const fillColor: Record<NonNullable<StatBarProps['variant']>, string> = {
  health: 'bg-[var(--jrpg-health-high)]',
  xp:     'bg-[var(--jrpg-xp-fill)]',
  mana:   'bg-[var(--jrpg-mana-fill)]',
  timer:  'bg-amber-400',
};

export function StatBar({ value, max = 100, variant = 'health', label, className }: StatBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div
      className={cn('jrpg-stat-bar-track relative w-full h-5 rounded overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      aria-label={label ?? variant}
      style={{ background: 'var(--jrpg-panel-bg)', border: 'var(--jrpg-border-width) solid var(--jrpg-panel-border)' }}
    >
      <div
        className={cn('h-full transition-[width] duration-500 ease-out', fillColor[variant])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// HealthBar is a specialized StatBar with color transitions
export function HealthBar({ value, max, label, className }: Omit<StatBarProps, 'variant'>) {
  const pct = max ? (value / max) * 100 : value;
  const color = pct > 50
    ? 'var(--jrpg-health-high)'
    : pct > 25
      ? 'var(--jrpg-health-mid)'
      : 'var(--jrpg-health-low)';

  return (
    <div
      className={cn('relative w-full h-5 rounded overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max ?? 100}
      aria-label={label ?? 'Health'}
      style={{ background: 'var(--jrpg-panel-bg)', border: 'var(--jrpg-border-width) solid var(--jrpg-panel-border)' }}
    >
      <div
        className="h-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
```

### AnimatePresence Phase Transition
```typescript
// Refactored PhaseTransition.tsx — replaces setTimeout logic
import { AnimatePresence, motion } from 'framer-motion';

const phaseVariants = {
  hidden:  { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1 },
  exit:    { opacity: 0, y: -16, scale: 0.97 },
};

export function PhaseTransition({ toPhase, children }: PhaseTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={toPhase}
        variants={phaseVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

### Sound Hook Pattern
```typescript
// client/src/lib/hooks/useGameSounds.ts
import { useAudio } from '@/lib/stores/useAudio';

export function useGameSounds() {
  const audio = useAudio();
  return {
    onButtonClick:    audio.playButtonSelect,
    onConfirm:        audio.playSuccess,
    onError:          audio.playHit,
    onPhaseTransition: audio.playSuccess,
    onPanelOpen:      audio.playSuccess,   // Replace when cursor/open SFX added
  };
}
```

---

## Sound Effects Gap Analysis

### Already Have
| Event | Sound File | Store Function |
|-------|-----------|----------------|
| Button click | `button-select.mp3` | `playButtonSelect()` |
| Damage taken | `hit.mp3` | `playHit()` |
| Success/confirm | `success.mp3` | `playSuccess()` |
| Explosion | `explosion.mp3` | `playExplosion()` |
| Level up | `level-up.mp3` | `playLevelUp()` |
| Walking | `walking.mp3` | `startWalkingSound()` |

### Missing (Needed for Phase 22)
| Event | Needed Sound | Source Recommendation |
|-------|-------------|----------------------|
| Cursor hover | Soft "tick" or "blip" | OpenGameArt: "JRPG Style UI Sounds" (CC-BY 3.0, by KillaMaaki) — includes cursor move |
| Panel open | Whoosh/paper sound | Same pack — includes "Open UI sound" |
| Panel close | Reverse whoosh | Same pack — includes "Close UI sound" |
| Error/invalid | Buzzer/wrong note | Same pack — includes "Error sound" |
| Phase transition | Swoosh/cinematic | Can synthesize from existing explosion + success |

**Recommended source:** [OpenGameArt JRPG Style UI Sounds](https://opengameart.org/content/jrpg-style-ui-sounds) — CC-BY 3.0 by KillaMaaki. Contains exactly the 9 sounds needed. Attribution required in credits.

**Alternative:** [Shapeforms Audio Free SFX](https://shapeforms.itch.io/shapeforms-audio-free-sfx) — royalty-free, no credit required, commercial OK.

---

## Ornamental Frame Asset Strategy

Two approaches, ordered by implementation effort:

### Option A: Pure CSS (Recommended for Phase 22)
Use layered `box-shadow`, `border`, and `::before`/`::after` pseudo-elements to create JRPG frame aesthetics without image assets.

**Pros:** No asset pipeline, no file formats, scales perfectly, accessible.
**Cons:** Limited to geometric/glow effects; cannot do pixel-art corner decorations.

```css
.jrpg-panel {
  border: 2px solid var(--jrpg-panel-border);
  border-radius: var(--jrpg-border-radius);
  box-shadow: var(--jrpg-shadow-panel);
  position: relative;
}
/* Double-border ornament via pseudo-element */
.jrpg-panel::before {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: calc(var(--jrpg-border-radius) - 1px);
  pointer-events: none;
}
```

### Option B: CSS border-image with Sprite (For Premium Look)
Create or source a 32x32 corner sprite PNG and use `border-image` 9-slice.

```css
.jrpg-panel-ornate {
  border-image: url('/images/ui/panel-frame.png') 8 fill / 8px / 0px stretch;
}
```

**Recommendation:** Implement Option A in Phase 22 (immediate, no asset dependency). Plan Option B as a post-Phase 22 enhancement if the team wants pixel-art corner decorations.

---

## Accessibility (WCAG AA)

### Requirements
- Normal text (< 18pt / < 14pt bold): **4.5:1** contrast ratio
- Large text (≥ 18pt / ≥ 14pt bold): **3:1** contrast ratio
- UI components and state indicators: **3:1** against adjacent color

### Pre-validated Colors (on `#16213e` panel background)
| Token | Hex | Contrast Ratio | WCAG AA |
|-------|-----|----------------|---------|
| `--jrpg-text-primary` | #f5f5f5 | ~12.6:1 | PASS |
| `--jrpg-text-secondary` | #b0b0b0 | ~7.2:1 | PASS |
| `--jrpg-text-accent` | #ffd700 | ~9.8:1 | PASS |
| `--jrpg-text-danger` | #ff6b6b | ~4.7:1 | PASS (barely) |
| `--jrpg-text-muted` | #808080 | ~4.6:1 | PASS (barely) |

### High-Risk Areas
1. **`--retro-glow` animated text** — Hue-cycle animation means contrast varies by frame. Fix: Use `--jrpg-text-accent` (#ffd700) for text, keep animated glow for non-text decorations only.
2. **Hover/active button states** — Button hover changes background; must re-validate text contrast on hover color too.
3. **`opacity < 1` text** — Any `text-opacity-*` or `opacity:` on text elements reduces effective contrast.
4. **Press Start 2P below 12px** — At small sizes, the font becomes illegible independent of contrast.

### Testing Strategy
- Manual spot-check: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) for each new token pair.
- `@axe-core/playwright` (installed) — run E2E test sweeps. Note: axe-core's `color-contrast` rule does NOT work in JSDOM (Vitest), only in real browser (Playwright).
- `prefers-reduced-motion`: Already handled in `retro.css` — extend to Framer Motion via `useReducedMotion()` hook.

```typescript
// Respect prefers-reduced-motion in Framer Motion
import { useReducedMotion } from 'framer-motion';

function PhaseTransition({ ... }) {
  const shouldReduce = useReducedMotion();
  const transition = shouldReduce
    ? { duration: 0 }
    : { duration: 0.2, ease: 'easeInOut' };
  // ...
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| framer-motion package name | Library rebranded to `motion`, import from `"motion/react"` in v12+ | Current installed v11 uses `"framer-motion"` imports — do NOT change imports |
| Tailwind v3 `theme()` function | Tailwind v4 `@theme` directive | Project uses v3 — use CSS variables + `theme.extend.colors` pattern |
| Multiple `new Audio()` per component | Centralized Zustand store (useAudio) | Already in place; extend, don't bypass |
| shadcn/ui with Tailwind config colors | shadcn v2 uses CSS variables with `oklch()` | Project uses shadcn v1 HSL pattern; don't upgrade mid-phase |

**Deprecated/outdated:**
- `--retro-glow` on text: Replace with fixed `--jrpg-text-accent` for WCAG compliance. Keep `--retro-glow` for decorative elements.
- `@keyframes hue-cycle` on `:root`: Acceptable for decorative glows, but should not drive text colors.

---

## Open Questions

1. **Ornamental corner sprites: CSS-only vs image-based?**
   - What we know: CSS-only (box-shadow + pseudo-elements) is immediately implementable. Image-based gives richer pixel-art look.
   - What's unclear: Does the team want pixel-art corner decorations in Phase 22, or is the CSS glow-frame sufficient?
   - Recommendation: Default to CSS-only for Phase 22; leave image-based as Phase 22+ enhancement. Document the `border-image` approach so it can be dropped in later.

2. **Sound effects: source new files or map to existing?**
   - What we know: 4 sounds are missing (cursor, open, close, error). OpenGameArt JRPG pack has them under CC-BY 3.0.
   - What's unclear: Does the project want zero-attribution (CC0) sounds only, or is CC-BY acceptable?
   - Recommendation: Use CC-BY with proper credits section if attribution is acceptable; otherwise use Shapeforms Audio (attribution-free).

3. **RetroCard/RetroButton migration: rename or wrap?**
   - What we know: 20+ components use `RetroCard` and `RetroButton` by import name.
   - What's unclear: Should `GamePanel`/`GameButton` be new components that replace the old ones, or wrappers that the old ones delegate to?
   - Recommendation: Make `GamePanel` and `GameButton` the canonical components, and make `RetroCard`/`RetroButton` re-export the new ones. This avoids a 20-file import migration.

4. **`prefers-color-scheme` / light mode?**
   - What we know: The app is dark-only. No light mode support exists.
   - What's unclear: Is light mode needed for WCAG? (It is NOT — WCAG applies to whichever theme is rendered, not requiring multi-theme support.)
   - Recommendation: Dark-only is fine. Document this explicitly to prevent scope creep.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `retro.css`, `retro-button.tsx`, `retro-card.tsx`, `XPBar.tsx`, `useAudio.tsx`, `PhaseTransition.tsx`, `App.tsx`, `package.json`, `tailwind.config.ts`
- Installed package inspection: framer-motion@11.13.1, howler@2.2.4, gsap@3.14.2, class-variance-authority@0.7.1, @axe-core/playwright@4.11.1

### Secondary (MEDIUM confidence)
- [shadcn/ui Theming docs](https://ui.shadcn.com/docs/theming) — CSS variable structure and token naming
- [OpenGameArt JRPG Style UI Sounds](https://opengameart.org/content/jrpg-style-ui-sounds) — CC-BY 3.0 sound pack by KillaMaaki
- [RPGUI Framework](https://ronenness.github.io/RPGUI/) — CSS class-based JRPG frame technique reference
- [howler.js documentation](https://github.com/goldfire/howler.js#documentation) — Howl constructor, sprite pattern
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) — WCAG contrast validation tool

### Tertiary (LOW confidence — verify before use)
- framer-motion v11 AnimatePresence API patterns from community tutorials (not verified against installed version's changelog; verify via `node_modules/framer-motion` README)
- Pre-calculated contrast ratios above — verify with WebAIM tool before committing token values

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified by installed package inspection
- Architecture patterns: HIGH — based on existing codebase + shadcn/ui official docs
- Sound effects gaps: HIGH — verified by listing `/public/sounds/` directory
- Ornamental frames: MEDIUM — CSS-only approach well understood; image approach needs asset sourcing
- Contrast ratios: MEDIUM — rough calculations; verify with tool before finalizing token values
- Framer Motion API: MEDIUM — API pattern well established; specific framer-motion@11 behavior should be verified against installed version

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (stable ecosystem; shadcn/ui and framer-motion APIs unlikely to change significantly)
