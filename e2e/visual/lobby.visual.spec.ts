import { test, expect } from '@playwright/test';
import { viewports, screenshotOptions, waitForStableUI } from '../helpers/visual-helpers';
import { openPlayScreen } from '../helpers/lobby-flow';

test.describe('Lobby Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    // CinematicBackground gates its 5s crossfade interval behind
    // `prefers-reduced-motion`, checked via `matchMedia` — but Playwright
    // applies that media emulation over CDP, which under CI resource
    // contention can race against the page's very first script execution.
    // When it loses, the interval starts for real and can fire mid-test,
    // landing the screenshot on a different background image than the
    // baseline (Chromium-only, load-dependent — exactly issue #198's
    // symptom, previously misattributed to text-shadow blur rasterization).
    // addInitScript is guaranteed by Playwright to run before any of the
    // page's own scripts, so this flag is synchronous and race-proof in a
    // way matchMedia timing isn't.
    await page.addInitScript(() => {
      (window as unknown as { __DISABLE_CINEMATIC_CROSSFADE__?: boolean }).__DISABLE_CINEMATIC_CROSSFADE__ = true;
    });
  });

  for (const [name, dimensions] of Object.entries(viewports)) {
    test(`home page - ${name}`, async ({ page }) => {
      await page.setViewportSize(dimensions);
      await page.goto('/');
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot(
        `home-page-${name}.png`,
        screenshotOptions(page)
      );
    });

    test(`play screen - ${name}`, async ({ page }) => {
      await page.setViewportSize(dimensions);
      await openPlayScreen(page);
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot(
        `play-screen-${name}.png`,
        screenshotOptions(page)
      );
    });

    // TODO: lobby-ready snapshots aren't useful because the 3D
    // PlayerCharacter canvas fills the viewport and our visual-helper
    // commonMasks() masks `<canvas>` entirely with magenta — so the
    // whole screen comes out solid pink. Real coverage requires either
    // an alternate mask strategy (only mask animated regions) or a
    // dedicated non-3D lobby layout for testing. Skipped until then.
    test.fixme(`lobby ready - ${name}`, async () => {});
  }
});
