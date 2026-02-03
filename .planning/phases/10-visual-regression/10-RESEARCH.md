# Phase 10: Visual Regression - Research

**Researched:** 2026-02-03
**Domain:** Playwright visual regression testing with screenshot comparison
**Confidence:** HIGH

## Summary

Playwright's built-in `toHaveScreenshot()` assertion provides a mature, production-ready visual regression testing solution using the pixelmatch library for pixel-level comparison. The CONTEXT.md decisions align well with industry best practices: Docker-based consistency, selective masking for dynamic content, committed baselines, and PR-based review workflows.

Key finding: Playwright's native capabilities cover all requirements without additional tools. The toHaveScreenshot() method supports animations control, masking, threshold tuning, and multiple comparison metrics (maxDiffPixels, maxDiffPixelRatio, threshold). The official Docker images (mcr.microsoft.com/playwright:v1.49.1-noble) include pre-installed fonts and browser dependencies for consistent rendering across CI and local environments.

**Primary recommendation:** Use Playwright's native visual testing with Docker containers for consistency, mask/stylePath for dynamic content, and GitHub Actions workflows for baseline management. Threshold: 0.2 (default), maxDiffPixelRatio: 0.01 (1%), 2 retries for flakiness.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.49.1 | Visual regression testing framework | Industry standard with built-in toHaveScreenshot(), native Docker support, mature ecosystem |
| pixelmatch | (bundled) | Pixel-level image comparison | Used internally by Playwright for YIQ color space comparison |
| mcr.microsoft.com/playwright | v1.49.1-noble | Docker image for consistent rendering | Official Microsoft image with pinned fonts and browser dependencies |
| actions/upload-artifact | v4 | CI artifact management | GitHub's official action for storing test reports and baseline diffs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| actions/labeler | v5 | Auto-label PRs with changed files | Label PRs as 'visual-changes' when baseline screenshots modified |
| GitHub Actions reporters | latest | PR comment integration | Post visual diff reports to PR comments for review |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright native | Percy/Chromatic | Third-party services offer visual diff UI and unlimited baselines storage, but add cost ($$$), external dependencies, and vendor lock-in. Playwright native is free and self-contained. |
| Docker consistency | Cross-platform baselines per OS | Maintaining separate baselines for darwin/win32/linux increases repo size 3x and complicates reviews. Docker provides single source of truth. |
| Committed baselines | Cloud storage (S3/Azure) | Cloud storage reduces repo size but breaks Git-based review workflow and adds infrastructure complexity. Committed baselines enable atomic PR reviews. |

**Installation:**
```bash
# Already installed per package.json
npm install --save-dev @playwright/test@^1.49.1

# Docker image (used in CI)
docker pull mcr.microsoft.com/playwright:v1.49.1-noble
```

## Architecture Patterns

### Recommended Project Structure
```
e2e/
├── visual/                    # Visual regression tests separate from functional E2E
│   ├── lobby.visual.spec.ts   # Lobby creation, join flows
│   ├── voting.visual.spec.ts  # Voting screen states
│   ├── reveal.visual.spec.ts  # Reveal phase
│   └── victory.visual.spec.ts # Victory/game-over screens
├── visual-snapshots/          # Baseline screenshots (committed to Git)
│   ├── lobby.visual.spec.ts-snapshots/
│   │   ├── lobby-creation-desktop-chromium.png
│   │   ├── lobby-creation-mobile-chromium.png
│   │   └── lobby-creation-tablet-chromium.png
│   └── ... (organized by test file)
├── styles/
│   └── visual-test.css        # CSS to hide dynamic elements via stylePath
└── helpers/
    └── visual-helpers.ts      # Shared masking/viewport utilities
```

### Pattern 1: toHaveScreenshot() Configuration
**What:** Configure visual comparison thresholds at global and per-test levels
**When to use:** Global config for baseline behavior, per-test overrides for special cases (e.g., 3D canvas)
**Example:**
```typescript
// playwright.config.ts - Global configuration
// Source: https://playwright.dev/docs/api/class-pageassertions
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,    // 1% diff allowed (recommended range: 0.1-1%)
      threshold: 0.2,              // Color difference tolerance (YIQ space, default)
      animations: "disabled",      // Disable CSS animations/transitions
    },
  },
  use: {
    // Emulate prefers-reduced-motion for all tests
    reducedMotion: "reduce",
  },
});

// Per-test override for 3D canvas with more tolerance
// Source: https://playwright.dev/docs/api/class-snapshotassertions
await expect(page).toHaveScreenshot({
  maxDiffPixelRatio: 0.05,  // 5% for 3D rendering variance
  mask: [page.locator('canvas')],  // Mask the canvas element
  maskColor: '#000000',     // Black mask instead of default pink
});
```

### Pattern 2: Multi-Viewport Testing
**What:** Test critical UI states across desktop, tablet, and mobile viewports
**When to use:** For all visual regression tests to catch responsive design issues
**Example:**
```typescript
// Source: https://playwright.dev/docs/emulation
const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },   // iPad portrait
  { name: 'mobile', width: 375, height: 667 },    // iPhone SE
];

for (const viewport of viewports) {
  test(`lobby creation - ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page).toHaveScreenshot(
      `lobby-creation-${viewport.name}.png`
    );
  });
}
```

### Pattern 3: Masking Dynamic Content
**What:** Use mask option to exclude dynamic elements (timestamps, user-specific data, 3D canvas)
**When to use:** When elements change unpredictably but aren't the focus of visual testing
**Example:**
```typescript
// Source: https://playwright.dev/docs/api/class-pageassertions
await expect(page).toHaveScreenshot({
  mask: [
    page.locator('[data-testid="timestamp"]'),
    page.locator('canvas'),           // 3D battle scene
    page.locator('.player-avatar'),   // User-specific avatars
  ],
  maskColor: '#FF00FF',  // Pink overlay (default)
});
```

### Pattern 4: stylePath for Volatile Content
**What:** Apply custom CSS stylesheet during screenshot to hide animations, ads, or dynamic content
**When to use:** For global hiding of elements that can't be controlled via mocking
**Example:**
```typescript
// e2e/styles/visual-test.css
/* Hide elements that change unpredictably */
[data-testid="live-counter"],
.animated-background,
.loading-spinner {
  visibility: hidden !important;
}

/* Disable all animations as fallback */
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}

// Test file
// Source: https://playwright.dev/docs/api/class-pageassertions (v1.41+)
await expect(page).toHaveScreenshot({
  stylePath: './e2e/styles/visual-test.css',
});
```

### Pattern 5: Docker-based CI Consistency
**What:** Run visual tests in Docker containers to ensure font/rendering consistency
**When to use:** Always in CI, optionally for local baseline generation
**Example:**
```yaml
# .github/workflows/visual-regression.yml
# Source: https://playwright.dev/docs/docker
jobs:
  visual-tests:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.49.1-noble
      options: --init --ipc=host  # Prevent zombie processes, avoid Chromium OOM
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff-report
          path: playwright-report/
```

### Anti-Patterns to Avoid
- **Generating baselines on different OS than CI:** Fonts and rendering differ between macOS/Windows/Linux. Always use Docker or generate baselines in CI environment.
- **Automatically updating baselines on failure:** This hides regressions. Updates must be explicit (--update-snapshots flag) and reviewed.
- **Testing every UI state:** Leads to 100+ baselines and slow test suite. Focus on critical paths only (lobby, voting, reveal, victory).
- **Ignoring flaky tests:** Flakiness indicates timing issues, dynamic content, or environment drift. Fix root cause instead of increasing thresholds.
- **Pixel-perfect comparison (threshold: 0):** Anti-aliasing, font hinting, and GPU rendering cause sub-pixel differences. Use threshold: 0.2 (default).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image comparison | Custom pixel diffing algorithm | Playwright's toHaveScreenshot() (uses pixelmatch) | Handles YIQ color space, threshold tuning, diff image generation, cross-platform rendering. Mature and battle-tested. |
| Baseline storage | Custom cloud storage (S3/Azure) | Git-committed snapshots | Git provides versioning, atomic reviews (baseline + code in same PR), and no external dependencies. |
| PR diff comments | Custom GitHub API integration | Playwright HTML reporter + actions/upload-artifact | Built-in diff visualization, side-by-side comparison, automatic artifact upload. No custom code needed. |
| Animation disabling | Custom JS to stop animations | Playwright's animations: "disabled" + reducedMotion: "reduce" | Handles CSS animations, CSS transitions, and Web Animations API. Covers all cases. |
| Dynamic content hiding | Repeated screenshot retries | stylePath CSS + mask option | Declarative, maintainable, and prevents flakiness at the source. |
| Cross-browser consistency | Separate baselines per browser | Docker container with pinned fonts | Single source of truth, smaller repo size, easier reviews. |

**Key insight:** Visual regression testing is notoriously complex due to OS rendering differences, font anti-aliasing, GPU variations, and animation timing. Playwright has solved these problems through Docker images, built-in masking, animation control, and threshold tuning. Custom solutions inevitably rediscover these edge cases the hard way.

## Common Pitfalls

### Pitfall 1: Environment Inconsistency (CI vs Local)
**What goes wrong:** Tests pass locally but fail in CI with "pixel diff" errors, even though UI looks identical
**Why it happens:** Different OS, fonts, GPU, or browser versions render text and graphics differently. MacOS uses sub-pixel anti-aliasing, Linux doesn't. Windows has different default fonts.
**How to avoid:**
- Generate baselines in Docker container (same image as CI uses)
- Use `mcr.microsoft.com/playwright:v1.49.1-noble` consistently
- Never generate baselines on macOS/Windows and expect CI (Linux) to pass
- For local development, run `docker run --rm -v $(pwd):/work -w /work mcr.microsoft.com/playwright:v1.49.1-noble npm run test:visual:update`
**Warning signs:**
- "maxDiffPixelRatio exceeded" errors only in CI
- Baseline updates don't fix failures
- Text appears slightly shifted or blurry in diff images

### Pitfall 2: Dynamic Content Causing Flakiness
**What goes wrong:** Tests fail intermittently with different diffs each run (timestamps, loading states, animations mid-transition)
**Why it happens:** Content changes between test runs (current time, random avatars, API response timing), or screenshots capture animations in-progress
**How to avoid:**
- Mock time-dependent data at test level: `await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'))`
- Use `stylePath` to hide volatile elements with CSS `visibility: hidden !important`
- Use `mask` option for user-specific content (avatars, names)
- Wait for network idle before screenshot: `await page.waitForLoadState('networkidle')`
- Ensure animations are disabled: `animations: "disabled"` + `reducedMotion: "reduce"`
**Warning signs:**
- Tests labeled "flaky" in Playwright report (pass on retry)
- Different diff regions each failure
- Failures happen 30-50% of runs, not consistently

### Pitfall 3: 3D Canvas Rendering Variance
**What goes wrong:** React Three Fiber battle scenes fail visual tests due to WebGL rendering differences (GPU driver, hardware acceleration)
**Why it happens:** WebGL rendering is non-deterministic across GPU drivers. Lighting, shadows, and textures render slightly differently on different hardware.
**How to avoid:**
- Mask entire canvas element: `mask: [page.locator('canvas')]`
- Increase tolerance for 3D scenes: `maxDiffPixelRatio: 0.05` (5%)
- Alternative: Test canvas presence without screenshot comparison
- Consider testing UI *around* canvas instead of canvas content itself
**Warning signs:**
- Only canvas region shows diffs
- Diffs appear as subtle color/lighting changes, not layout shifts
- Failures more common with different GPU configurations

### Pitfall 4: Baseline Update Workflow Confusion
**What goes wrong:** Developers unsure when to update baselines, leading to either ignored regressions or blocked PRs
**Why it happens:** Unclear workflow for legitimate UI changes vs actual bugs
**How to avoid:**
- Document clear workflow:
  1. Visual test fails → Review diff in Playwright report
  2. If intentional change → `npm run test:visual:update` → Commit updated baselines
  3. If unintentional → Fix UI bug → Tests pass without baseline update
- Use PR labels: `visual-changes` auto-applied when baselines change
- Block merges on visual test failures (forces explicit decision)
- Make baseline updates part of same commit as UI change (atomic review)
**Warning signs:**
- Developers running `--update-snapshots` without reviewing diffs
- PRs with baseline updates but no UI code changes
- "Just update the baselines" comments without investigation

### Pitfall 5: Over-Testing (Too Many Baselines)
**What goes wrong:** Test suite has 100+ baseline screenshots, runs take 10+ minutes, reviews are painful
**Why it happens:** Testing every possible UI permutation instead of critical paths
**How to avoid:**
- Focus on **phase transitions** and **key user actions** only
- Critical paths per CONTEXT.md: lobby creation, voting screen, reveal, victory
- Combine related states: single test for "lobby with 2 players" instead of separate tests for 1, 2, 3, 4 players
- Don't test error states visually unless they have unique UI
- Use functional tests (assertions) for variations, visual tests for happy path
**Warning signs:**
- More than 50 baseline images
- Test suite takes >5 minutes
- PR reviews include 20+ baseline changes
- "Update all baselines" becomes common practice

### Pitfall 6: Threshold Too Strict or Too Lenient
**What goes wrong:**
- Too strict: Constant failures from font anti-aliasing, sub-pixel shifts
- Too lenient: Real regressions slip through (button color changed, text misaligned)
**Why it happens:** Default threshold (0.2) works for most cases, but project-specific needs vary
**How to avoid:**
- Start with defaults: `threshold: 0.2`, `maxDiffPixelRatio: 0.01` (1%)
- If font rendering causes failures: increase threshold to 0.3
- If layout shifts slip through: decrease maxDiffPixelRatio to 0.005 (0.5%)
- Monitor failure patterns: >50% flaky = too strict, missed bugs = too lenient
- Use per-test overrides for special cases (3D canvas, complex animations)
**Warning signs:**
- Tests fail 30%+ of runs with tiny font diffs
- Real UI bugs found in production that passed visual tests
- Baseline updates become weekly chore

## Code Examples

Verified patterns from official sources:

### Complete Visual Test Example
```typescript
// e2e/visual/lobby.visual.spec.ts
// Source: Combined patterns from https://playwright.dev/docs/test-snapshots
import { test, expect } from '@playwright/test';

test.describe('Lobby Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Mock time for consistent timestamps
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    await page.goto('/');
  });

  const viewports = [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 },
  ];

  for (const viewport of viewports) {
    test(`lobby creation - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);

      // Create lobby
      await page.getByRole('button', { name: /create/i }).click();
      await page.getByPlaceholder(/name/i).fill('TestPlayer');
      await page.getByRole('button', { name: /create lobby/i }).click();

      // Wait for lobby to load
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('lobby-code')).toBeVisible();

      // Capture screenshot with masking
      await expect(page).toHaveScreenshot(
        `lobby-creation-${viewport.name}.png`,
        {
          mask: [
            page.locator('[data-testid="lobby-code"]'),  // Dynamic code
            page.locator('[data-testid="timestamp"]'),   // Current time
          ],
          stylePath: './e2e/styles/visual-test.css',
        }
      );
    });
  }

  test('voting screen with 3D battle - desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to voting phase (setup helper not shown)
    await setupVotingPhase(page);

    // Wait for 3D canvas to render
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForTimeout(1000);  // Allow WebGL initialization

    // Mask canvas due to rendering variance
    await expect(page).toHaveScreenshot('voting-screen-desktop.png', {
      mask: [page.locator('canvas')],
      maskColor: '#000000',
      maxDiffPixelRatio: 0.02,  // Slightly higher tolerance
    });
  });
});
```

### Baseline Update Script
```bash
# package.json
# Source: https://playwright.dev/docs/test-snapshots
{
  "scripts": {
    "test:visual": "playwright test e2e/visual/",
    "test:visual:update": "playwright test e2e/visual/ --update-snapshots"
  }
}

# Usage:
# 1. Make UI change
# 2. Visual tests fail
# 3. Review diffs in playwright-report/
# 4. If intentional: npm run test:visual:update
# 5. Commit updated baselines with UI changes
```

### GitHub Actions Workflow with Baseline Artifacts
```yaml
# .github/workflows/visual-regression.yml
# Source: https://playwright.dev/docs/ci-intro and https://playwright.dev/docs/docker
name: Visual Regression

on:
  pull_request:
    branches: [main]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.49.1-noble
      options: --init --ipc=host

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Run visual regression tests
        id: visual-tests
        run: npm run test:visual
        continue-on-error: true

      - name: Upload visual diff report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff-report
          path: playwright-report/
          retention-days: 7

      - name: Upload updated baselines (for developer download)
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: updated-baselines
          path: e2e/visual-snapshots/
          retention-days: 3

      - name: Comment PR with results
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Visual regression tests failed. [Download diff report](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})'
            })

      - name: Fail if tests failed
        if: steps.visual-tests.outcome == 'failure'
        run: exit 1
```

### Auto-label PRs with Baseline Changes
```yaml
# .github/workflows/label-visual-changes.yml
# Source: https://github.com/actions/labeler
name: Label Visual Changes

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/labeler@v5
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          configuration-path: .github/labeler.yml

# .github/labeler.yml
visual-changes:
  - changed-files:
    - any-glob-to-any-file: 'e2e/visual-snapshots/**/*.png'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Percy/Applitools cloud services | Playwright native toHaveScreenshot() | v1.15+ (2021) | Eliminated external dependencies, reduced costs, improved Git integration. Native solution matured. |
| Separate baseline per OS (darwin/win32/linux) | Docker container for single baseline | 2022+ | Reduced repo size 3x, simplified reviews, eliminated cross-platform rendering issues. |
| jest-image-snapshot with Puppeteer | Playwright toHaveScreenshot() | 2021+ | Better API (mask, stylePath, animations), built-in retry logic, superior TypeScript support. |
| Manual baseline updates via Git | CI-generated artifacts for download | 2023+ | Developers download updated baselines from failed CI runs instead of local regeneration. |
| Pixel-perfect comparison (threshold: 0) | Perceptual diff (threshold: 0.2) | Since pixelmatch introduction | Reduced flakiness from anti-aliasing while still catching real regressions. |
| Screenshot entire page always | Selective masking + stylePath | v1.35+ (mask), v1.41+ (stylePath) | Enabled testing pages with dynamic content without flakiness. |

**Deprecated/outdated:**
- **jest-image-snapshot**: Still works but lacks Playwright's built-in features (masking, animation control). Playwright native is superior.
- **BackstopJS**: Heavy, requires separate config. Playwright handles visual regression natively.
- **Separate baselines per browser**: Modern practice is single Docker-based baseline for consistency. Cross-browser visual testing rarely needed (functional differences more important).

## Open Questions

Things that couldn't be fully resolved:

1. **React Three Fiber canvas testing depth**
   - What we know: WebGL rendering is non-deterministic, masking is recommended
   - What's unclear: Whether to test canvas presence only vs attempting visual comparison with high tolerance
   - Recommendation: Start with full masking (`mask: [page.locator('canvas')]`), re-evaluate if 3D UI changes need visual regression coverage. May need separate approach (e.g., snapshot Three.js scene graph instead of pixels).

2. **Exact tablet viewport dimensions**
   - What we know: CONTEXT.md specifies desktop (1280x720) and mobile (375x667), tablet unspecified
   - What's unclear: iPad portrait (768x1024) vs iPad landscape (1024x768) vs other tablets
   - Recommendation: Use 768x1024 (iPad portrait) as standard tablet viewport. Most common tablet orientation for web apps.

3. **Optimal retry count (2 vs 3)**
   - What we know: Playwright config already uses `retries: process.env.CI ? 2 : 0`
   - What's unclear: Whether visual tests need higher retry count due to flakiness
   - Recommendation: Keep existing 2 retries. If visual tests show >10% flakiness, fix root cause (timing, dynamic content) instead of increasing retries.

4. **Baseline storage with Git LFS**
   - What we know: Committing PNG files to Git increases repo size. Git LFS manages large files efficiently.
   - What's unclear: Whether ScrumQuest needs Git LFS given ~20-30 expected baseline images (5-10MB total)
   - Recommendation: Start without Git LFS. If baseline count exceeds 50 images or repo size becomes problematic, migrate to Git LFS. Not a phase 10 concern.

## Sources

### Primary (HIGH confidence)
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots) - Official toHaveScreenshot() documentation
- [Playwright PageAssertions API](https://playwright.dev/docs/api/class-pageassertions) - Complete API reference for configuration options
- [Playwright SnapshotAssertions API](https://playwright.dev/docs/api/class-snapshotassertions) - Threshold, maxDiffPixels, maxDiffPixelRatio details
- [Playwright Docker](https://playwright.dev/docs/docker) - Official Docker image setup and CI recommendations
- [Playwright Emulation](https://playwright.dev/docs/emulation) - Viewport sizes and device descriptors
- [Playwright Test Retries](https://playwright.dev/docs/test-retries) - Retry configuration
- [Playwright CI Setup](https://playwright.dev/docs/ci-intro) - GitHub Actions integration

### Secondary (MEDIUM confidence)
- [Playwright Visual Testing Complete Guide](https://testdino.com/blog/playwright-visual-testing/) - Comprehensive patterns and best practices (2026)
- [BrowserStack Playwright Snapshot Testing](https://www.browserstack.com/guide/playwright-snapshot-testing) - 2026 guidance on configuration and pitfalls
- [TestMu.ai Playwright Visual Regression Guide](https://www.testmu.ai/learning-hub/playwright-visual-regression-testing/) - Practical threshold recommendations
- [Streamlining Playwright Visual Regression with GitHub Actions](https://medium.com/@haleywardo/streamlining-playwright-visual-regression-testing-with-github-actions-e077fd33c27c) - PR comment workflows
- [Automating visual UI tests with Playwright and GitHub Actions](https://mmazzarolo.com/blog/2022-09-09-visual-regression-testing-with-playwright-and-github-actions/) - Complete CI/CD setup
- [Playwright Server in Docker for Consistent Visual Assertions](https://patricktree.me/blog/consistent-visual-assertions-via-playwright-server-in-docker) - Docker consistency patterns
- [Making Visual Comparison Test Maintenance Easier with GitHub Actions](https://blog.scottlogic.com/2025/08/21/making-visual-comparison-test-maintenance-easier-with-github-actions.html) - Baseline update workflows
- [GitHub Actions Labeler](https://github.com/actions/labeler) - Official action for auto-labeling PRs

### Tertiary (LOW confidence - flagged for validation)
- React Three Fiber canvas screenshot approaches - No authoritative source found; recommendation based on general WebGL testing practices
- Exact threshold percentage recommendations - Community practices vary (0.1-0.3 range); official docs recommend 0.2 default

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Playwright's toHaveScreenshot() is documented, mature, and widely adopted for visual regression
- Architecture: HIGH - Patterns verified against official Playwright documentation and 2026 best practice guides
- Pitfalls: HIGH - Common issues well-documented in official guides and recent blog posts (2025-2026)
- 3D canvas testing: MEDIUM - Limited specific guidance for React Three Fiber visual testing; WebGL non-determinism is established fact

**Research date:** 2026-02-03
**Valid until:** ~30 days (Playwright stable, but new features added monthly; re-verify threshold recommendations if >1.50.0 released)
