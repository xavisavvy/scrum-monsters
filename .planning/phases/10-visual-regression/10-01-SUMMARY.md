---
phase: 10-visual-regression
plan: 01
subsystem: testing
tags: [playwright, visual-regression, screenshot-testing, e2e]
requires:
  - phase-09
provides:
  - visual regression configuration
  - viewport definitions
  - masking utilities
affects:
  - 10-02 (uses viewports and helpers)
  - 10-03 (uses helpers for stable screenshots)
  - 10-04 (uses CI configuration foundation)
tech-stack:
  added: []
  patterns:
    - Playwright toHaveScreenshot configuration
    - Multi-viewport testing definitions
    - CSS-based dynamic content masking
    - Screenshot utility functions
key-files:
  created:
    - e2e/styles/visual-test.css
    - e2e/helpers/visual-helpers.ts
  modified:
    - playwright.config.ts
decisions:
  - id: 10-01-thresholds
    choice: maxDiffPixelRatio 0.01 (1%), threshold 0.2
    rationale: Industry standard from Playwright docs and research
  - id: 10-01-viewports
    choice: Desktop 1280x720, Tablet 768x1024, Mobile 375x667
    rationale: iPad portrait for tablet, iPhone SE for mobile baseline
  - id: 10-01-animations
    choice: animations disabled + reducedMotion reduce
    rationale: Ensures consistent UI state during screenshot capture
  - id: 10-01-canvas-masking
    choice: Mask all canvas elements by default
    rationale: WebGL rendering is non-deterministic across GPU drivers
metrics:
  duration: 154s
  completed: 2026-02-03
---

# Phase 10 Plan 01: Visual Regression Configuration Summary

**One-liner:** Playwright configured with 1% diff threshold, multi-viewport definitions (desktop/tablet/mobile), and CSS masking for dynamic content

## What Was Built

Established the foundation for visual regression testing across ScrumQuest's UI phases:

1. **Global Playwright Configuration** - Added `toHaveScreenshot` defaults to playwright.config.ts:
   - `maxDiffPixelRatio: 0.01` (1% pixel difference allowed)
   - `threshold: 0.2` (color difference tolerance in YIQ space)
   - `animations: "disabled"` (stops CSS animations during capture)
   - `reducedMotion: "reduce"` (emulates prefers-reduced-motion media query)

2. **CSS Stylesheet for Volatile Elements** - Created `e2e/styles/visual-test.css`:
   - Hides dynamic content: timestamps, lobby codes, loading spinners, live counters
   - Disables all animations and transitions as fallback safety
   - Applied via `stylePath` option in screenshot assertions

3. **TypeScript Helper Utilities** - Created `e2e/helpers/visual-helpers.ts`:
   - **viewports**: Standardized dimensions for desktop (1280x720), tablet (768x1024), mobile (375x667)
   - **commonMasks()**: Returns locators for timestamp, lobby-code, and canvas elements
   - **waitForStableUI()**: Waits for networkidle + 500ms settling
   - **screenshotOptions()**: Combines common masks with custom masks and stylePath

## How It Works

**Configuration cascade:**
```typescript
// Global config in playwright.config.ts
toHaveScreenshot: {
  maxDiffPixelRatio: 0.01,  // 1% tolerance for font rendering variance
  threshold: 0.2,            // YIQ color space difference
  animations: "disabled",    // Stop CSS animations during snapshot
}

// Applied to all tests, overridable per-test
await expect(page).toHaveScreenshot({
  ...screenshotOptions(page),  // Uses helpers
  maxDiffPixelRatio: 0.05,     // Can increase for 3D content
});
```

**Multi-viewport workflow:**
```typescript
import { viewports } from './helpers/visual-helpers';

for (const [name, size] of Object.entries(viewports)) {
  test(`lobby - ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    // Test runs at 1280x720, 768x1024, and 375x667
  });
}
```

**Dynamic content handling:**
- **CSS hiding** (`stylePath`): Non-testable elements (timestamps, spinners)
- **Masking** (`mask`): User-specific content (lobby codes, avatars)
- **Canvas exclusion**: 3D WebGL content (non-deterministic rendering)

## Key Decisions

### Decision: 1% Pixel Difference Threshold
**Context:** Visual regression tests need tolerance for font anti-aliasing and sub-pixel rendering differences across environments.

**Options:**
- 0.1% (strict): Catches tiny changes, high flakiness
- 1% (recommended): Balances precision with stability
- 5% (lenient): Reduces flakiness, may miss real issues

**Choice:** 1% (`maxDiffPixelRatio: 0.01`)

**Rationale:** Research showed 0.01-0.02 range is industry standard. Playwright's default `threshold: 0.2` handles color differences, while `maxDiffPixelRatio` handles layout/size changes. 1% allows font rendering variance without masking real regressions.

### Decision: Mask Canvas Elements by Default
**Context:** React Three Fiber battle scenes use WebGL rendering, which varies across GPU drivers and hardware acceleration settings.

**Choice:** Include `page.locator('canvas')` in `commonMasks()` helper

**Rationale:** Per research, WebGL rendering is non-deterministic. Lighting, shadows, and texture rendering differ subtly between GPU configurations. Visual tests should focus on UI around canvas (HUD, buttons, player list) rather than 3D content itself. Functional tests verify canvas presence; visual tests verify layout.

### Decision: iPad Portrait for Tablet Viewport
**Context:** CONTEXT.md specified desktop and mobile viewports, but tablet dimensions were unspecified.

**Options:**
- iPad landscape (1024x768): Wide format
- iPad portrait (768x1024): Tall format
- Android tablet (800x1280): Fragmented

**Choice:** 768x1024 (iPad portrait)

**Rationale:** Most common tablet orientation for web apps. Covers narrow/tall layout concerns that desktop (1280x720 wide) and mobile (375x667 tall) might miss. Research noted this as standard practice.

## Deviations from Plan

None - plan executed exactly as written.

## Performance

**Execution time:** 2.6 minutes (154 seconds)

**Tasks completed:**
1. ✅ Update Playwright config with visual testing defaults (commit d63d642)
2. ✅ Create visual test CSS and helper utilities (commit 560c1de)

**Commits:**
- d63d642: feat(10-01): configure visual regression testing defaults
- 560c1de: feat(10-01): add visual test CSS and helper utilities

## Next Phase Readiness

**Blockers:** None

**Ready for 10-02:** Yes - visual test infrastructure is in place for lobby/voting/reveal test specs

**Concerns:**
- Pre-existing TypeScript errors in codebase (not related to this plan):
  - BattleScreen.tsx, Lobby.tsx event type mismatches
  - server/socketHandlers.ts missing exports
  - server/websocket.ts type errors
  - These should be addressed in a future cleanup phase

**Recommendations:**
- Next plan should verify configuration works end-to-end with a sample visual test
- Monitor baseline screenshot file sizes - if >50 images accumulated, consider Git LFS
- Document baseline update workflow in phase 10 completion

## Artifacts

**Configuration:**
- `playwright.config.ts`: Visual regression defaults (lines 68-73, 34)

**Infrastructure:**
- `e2e/styles/visual-test.css`: 17 lines hiding dynamic elements
- `e2e/helpers/visual-helpers.ts`: 33 lines exporting viewports and utilities

**Exports from visual-helpers.ts:**
```typescript
export const viewports: { desktop, tablet, mobile }
export type ViewportName
export function commonMasks(page): Locator[]
export function waitForStableUI(page): Promise<void>
export function screenshotOptions(page, additionalMasks?): object
```

## Testing Strategy

**Verification performed:**
1. ✅ TypeScript compilation (visual-helpers.ts valid)
2. ✅ Configuration presence (`grep` confirmed maxDiffPixelRatio and reducedMotion)
3. ✅ File creation (both CSS and TS helper files exist)

**Not tested in this plan:**
- Actual screenshot capture (deferred to 10-02 which writes first visual tests)
- Baseline generation workflow (deferred to 10-04 CI integration)
- Multi-viewport rendering (will be validated when specs run)

## Documentation

**Inline documentation:**
- Comments in playwright.config.ts explain each visual regression setting
- visual-helpers.ts includes JSDoc-style comments on exported functions
- visual-test.css has section comments explaining purpose

**External references:**
- RESEARCH.md: Pattern 1 (toHaveScreenshot configuration)
- RESEARCH.md: Pattern 2 (multi-viewport testing)
- RESEARCH.md: Pattern 3-4 (masking and stylePath)

## Risk Assessment

**Low risk:**
- Configuration is additive only (no existing functionality broken)
- Settings match Playwright documentation and industry best practices
- Helpers are isolated modules (no cross-dependencies)

**No breaking changes:**
- Existing E2E tests unaffected (lobby.spec.ts doesn't use visual assertions)
- Visual regression is opt-in per test file

**Future considerations:**
- If visual tests become flaky: tune thresholds upward
- If layout regressions slip through: tune maxDiffPixelRatio downward
- If repo size grows: implement Git LFS for baseline PNGs
