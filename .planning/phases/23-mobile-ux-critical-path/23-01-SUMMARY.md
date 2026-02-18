---
phase: 23-mobile-ux-critical-path
plan: "01"
subsystem: ui
tags: [mobile, css, viewport, safe-area, touch-targets, wcag, tailwind]

# Dependency graph
requires: []
provides:
  - viewport-fit=cover meta tag enabling env() safe-area inset CSS values
  - mobile.css with pb-safe/pt-safe/pl-safe/pr-safe/p-safe/pb-safe-plus utility classes
  - touch-action: manipulation on all interactive elements (WCAG 1.4.4 compliant)
  - 44px minimum touch targets on GameButton sm/md/lg, retro-button, fibonacci-button
  - 4-column mobile fibonacci grid preventing button shrinkage on narrow screens
  - 100dvh dynamic viewport height fix for iOS Safari address bar
affects:
  - 23-02 (battle HUD safe-area)
  - 23-03 (lobby/panel safe-area)
  - any phase using GameButton, fibonacci-button, or retro-button

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Safe-area CSS utilities via @layer utilities (pb-safe etc.) consumed by HUD components
    - touch-action: manipulation via @layer base for all interactive elements
    - Per-component touch-action: none for Three.js canvases (not global)

key-files:
  created:
    - client/src/styles/mobile.css
  modified:
    - client/index.html
    - client/src/index.css
    - client/src/App.tsx
    - client/src/components/ui/GameButton.tsx
    - client/src/styles/retro.css

key-decisions:
  - "viewport-fit=cover replaces maximum-scale=1 — prevents WCAG 1.4.4 violation while enabling safe-area CSS"
  - "touch-action: manipulation in mobile.css @layer base replaces maximum-scale=1 for double-tap prevention"
  - "Global canvas touch-action: none removed — applied per-component for Three.js canvases only"
  - "fibonacci-button aspect-ratio: auto on mobile — rectangular buttons improve text readability on 4-col grid"
  - "100dvh with 100vh fallback — fixes iOS Safari address bar collapsing viewport height"

patterns-established:
  - "Safe-area pattern: import mobile.css, apply .pb-safe/.pt-safe/.p-safe classes to HUD containers"
  - "Touch target pattern: all button variants must carry min-h-[44px] in CVA size definitions"

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 23 Plan 01: Mobile CSS Foundation Summary

**Viewport-fit=cover meta tag, safe-area CSS utility classes (pb-safe/pt-safe/p-safe/pb-safe-plus), and WCAG 2.5.8 compliant 44px touch targets on all interactive button components**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18T22:36:18Z
- **Completed:** 2026-02-18T22:51:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created)

## Accomplishments

- Removed `maximum-scale=1` from viewport meta (WCAG 1.4.4 violation — blocked pinch-to-zoom); replaced with `viewport-fit=cover` which enables `env()` safe-area CSS values
- Created `client/src/styles/mobile.css` with six safe-area utility classes, `touch-action: manipulation` for all interactive elements, and `100dvh` dynamic viewport height fix
- Enforced 44px minimum touch targets on GameButton (all 3 size variants), `.retro-button`, and `.fibonacci-button`; added 4-column mobile grid for fibonacci buttons with `aspect-ratio: auto` override

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix viewport meta, create mobile.css with safe-area utilities** - `93eb292` (feat)
2. **Task 2: Enforce 44px minimum touch targets on GameButton, fibonacci-button, retro-button** - `30da2ea` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified

- `client/index.html` - viewport meta: removed maximum-scale=1, added viewport-fit=cover
- `client/src/styles/mobile.css` - new mobile foundation: safe-area utilities, touch-action, dvh fix
- `client/src/index.css` - removed global canvas touch-action: none (now per-component)
- `client/src/App.tsx` - added import for mobile.css after tokens.css
- `client/src/components/ui/GameButton.tsx` - sm/md/lg all get min-h-[44px]; sm adds min-w-[44px]
- `client/src/styles/retro.css` - min-height: 44px on retro-button and fibonacci-button; 4-col mobile fibonacci grid; aspect-ratio: auto on mobile fibonacci-button

## Decisions Made

- `viewport-fit=cover` replaces `maximum-scale=1` — one enables safe-area CSS, the other violated WCAG 1.4.4 (users cannot zoom content). Using `touch-action: manipulation` on interactive elements is the WCAG-compliant way to prevent double-tap zoom without blocking pinch-to-zoom.
- Global `canvas { touch-action: none }` removed — Three.js interactive canvases apply this per-component; non-interactive canvases should not block scroll.
- `fibonacci-button` `aspect-ratio: auto` on mobile — with 4-column grid on 375px screens, buttons are ~84px wide and rectangular. Keeping aspect-ratio: 1 would make them only ~84px tall which is fine, but rectangular allows number text to render without clipping.
- `100dvh` with `100vh` fallback — dvh (dynamic viewport height) is the correct fix for iOS Safari's address bar collapsing the visible viewport.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in `shared/schema.ts` (Zod type compatibility) caused `npm run check` to report errors — confirmed these are pre-existing (present on `main` before any changes) and unrelated to this plan's scope.
- commitlint body-max-line-length (100 chars) rejected first commit attempt — reformatted bullet points to fit within limit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `viewport-fit=cover` is active — Plan 02+ can use `env(safe-area-inset-*)` values immediately
- `.pb-safe`, `.pt-safe`, `.p-safe`, `.pb-safe-plus` are available as utility classes
- All GameButton, retro-button, and fibonacci-button instances now meet 44px touch target requirement
- Plan 02 (battle HUD safe-area) can proceed without blockers

---
*Phase: 23-mobile-ux-critical-path*
*Completed: 2026-02-18*

## Self-Check: PASSED

All files verified present:
- FOUND: client/index.html
- FOUND: client/src/styles/mobile.css
- FOUND: client/src/index.css
- FOUND: client/src/App.tsx
- FOUND: client/src/components/ui/GameButton.tsx
- FOUND: client/src/styles/retro.css

All commits verified:
- FOUND: 93eb292 (Task 1)
- FOUND: 30da2ea (Task 2)
