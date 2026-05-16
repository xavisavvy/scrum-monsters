import { test, expect } from '@playwright/test';
import { viewports, screenshotOptions, waitForStableUI } from '../helpers/visual-helpers';
import { createLobbyAndPickAvatar, openPlayScreen } from '../helpers/lobby-flow';

test.describe('Lobby Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
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
