---
phase: 22-jrpg-theme-foundation
plan: 05
subsystem: ui
tags: [accessibility, wcag, axe-core, css, contrast, playwright, jrpg]

# Dependency graph
requires:
  - phase: 22-01
    provides: tokens.css with --jrpg-text-* color tokens
  - phase: 22-02
    provides: GamePanel/GameButton using token colors

provides:
  - WCAG AA validated color tokens with documented contrast ratios
  - Fixed .retro-text-glow and .retro-text-glow-light using static WCAG-safe colors for text
  - Animated hue-cycle preserved for decorative non-text elements (text-shadow, box-shadow)
  - Press Start 2P minimum 12px enforcement via .font-jrpg rule
  - E2E color-contrast axe-core test at e2e/accessibility.spec.ts

affects: [all future phases using retro.css glow classes, JRPG theme components]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Animated CSS custom properties are decorative-only for WCAG compliance — use fixed tokens for text color"
    - "text-shadow is WCAG-exempt (decorative) — animated glow preserved in shadow without affecting contrast"
    - "axe-core color-contrast rule validates JRPG theme at E2E layer (not unit layer — requires real browser)"

key-files:
  created:
    - e2e/accessibility.spec.ts
  modified:
    - client/src/styles/retro.css
    - client/src/styles/tokens.css

key-decisions:
  - ".retro-text-glow uses --jrpg-text-primary (#f5f5f5, 12.6:1) not --retro-glow-light — animated hue fails at many positions"
  - ".retro-text-glow-light uses --jrpg-text-accent (#ffd700 gold, 9.8:1) — preserves themed look while passing WCAG AA"
  - "text-shadow animated glow is WCAG-exempt per WCAG 2.1 — shadow is decorative, not the text color"
  - "e2e/accessibility.spec.ts uses direct AxeBuilder (not a11y-fixture) — plan specifies top-level file with color-contrast-only rule"

patterns-established:
  - "Pattern: Fixed WCAG-safe token for text color, animated hue for decorative shadow"
  - "Pattern: E2E axe-core color-contrast validates rendered token colors that JSDOM cannot check"

# Metrics
duration: 18min
completed: 2026-02-18
---

# Phase 22 Plan 05: WCAG AA Contrast Validation Summary

**Fixed animated hue glow text to use static WCAG-safe tokens (#f5f5f5 12.6:1, gold 9.8:1) while preserving neon glow effect via decorative text-shadow; added axe-core E2E color-contrast test**

## Performance

- **Duration:** 18 min
- **Started:** 2026-02-18T20:12:43Z
- **Completed:** 2026-02-18T20:30:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fixed WCAG AA violation in `.retro-text-glow` and `.retro-text-glow-light` — replaced animated `--retro-glow-light` (hue-cycle, frequently fails 4.5:1) with fixed WCAG-validated token colors
- Documented all `--jrpg-text-*` contrast ratios with extended WCAG commentary in tokens.css including a critical warning against using animated hue as text color
- Created `e2e/accessibility.spec.ts` with axe-core color-contrast rule tests for landing page and lobby creation page using Playwright
- Added `.font-jrpg` minimum font size rule enforcing 12px floor for Press Start 2P bitmap font legibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix contrast violations in glow text and validate token colors** - `2521122` (fix)
2. **Task 2: Add E2E accessibility contrast test** - `9bb1f0a` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified

- `client/src/styles/retro.css` - Fixed `.retro-text-glow` color from `--retro-glow-light` (animated) to `--jrpg-text-primary`; `.retro-text-glow-light` to `--jrpg-text-accent`; added `.font-jrpg` 12px minimum font size rule
- `client/src/styles/tokens.css` - Added extended WCAG contrast ratio documentation with ratios and critical warning against animated hue as text color
- `e2e/accessibility.spec.ts` - New Playwright E2E test using AxeBuilder with `color-contrast` rule on landing page and lobby creation

## Decisions Made

- **`--jrpg-text-primary` for `.retro-text-glow`:** The plan specified this. #f5f5f5 at 12.6:1 contrast is well above WCAG AA threshold and preserves near-white text look while the animated glow shadow still provides the neon visual effect.

- **`--jrpg-text-accent` (gold) for `.retro-text-glow-light`:** #ffd700 at 9.8:1 contrast gives the "lighter/accent" character of the class while fitting the JRPG gold aesthetic. Better than plain white for the "light" variant.

- **Direct AxeBuilder in `e2e/accessibility.spec.ts` (not a11y-fixture):** Plan explicitly specified this pattern. The file focuses only on `color-contrast` rule unlike the comprehensive `e2e/a11y/*.spec.ts` tests that check all WCAG tags. This focused test is a better regression signal for Phase 22 theme work.

- **E2E test excludes canvas:** 3D WebGL canvas is non-accessible by design (per existing a11y-fixture), so canvas is excluded from contrast checks.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- `npm run check` has pre-existing TypeScript errors in `shared/schema.ts` (Drizzle/Zod type constraint issues). These are not related to Phase 22 CSS changes and were confirmed pre-existing by stash test. The build (`npm run build`) succeeds and all 575 unit tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 22 (JRPG Theme Foundation) is now complete — all 5 plans executed
- The design system is ready for Phase 23 (Social Meta Tags & OG Images) and Phase 24 (Lobby Polish)
- Accessibility regression protection is in place via `e2e/accessibility.spec.ts`
- All token colors are WCAG AA validated and documented

---
*Phase: 22-jrpg-theme-foundation*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: client/src/styles/retro.css
- FOUND: client/src/styles/tokens.css
- FOUND: e2e/accessibility.spec.ts
- FOUND: .planning/phases/22-jrpg-theme-foundation/22-05-SUMMARY.md
- FOUND: commit 2521122 (fix glow text contrast)
- FOUND: commit 9bb1f0a (add E2E accessibility test)
