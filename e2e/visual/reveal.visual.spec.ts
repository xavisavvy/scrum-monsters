import { test, expect } from '@playwright/test';
import { viewports, screenshotOptions, waitForStableUI } from '../helpers/visual-helpers';

test.describe('Reveal Phase Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    await page.goto('/');
  });

  for (const [name, dimensions] of Object.entries(viewports)) {
    test.skip(`reveal phase - ${name}`, async ({ page }) => {
      // Skip by default - reveal phase requires full game setup
      // This test structure exists for when reveal flow is testable
      await page.setViewportSize(dimensions);

      // TODO: Navigate to reveal phase (requires game state setup)
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot(
        `reveal-phase-${name}.png`,
        screenshotOptions(page)
      );
    });
  }
});
