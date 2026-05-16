import { test, expect } from '@playwright/test';
import { viewports, screenshotOptions, waitForStableUI } from '../helpers/visual-helpers';

test.describe('Victory Screen Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    await page.goto('/');
  });

  for (const [name, dimensions] of Object.entries(viewports)) {
    test.skip(`victory screen - ${name}`, async ({ page }) => {
      // Skip by default - victory screen requires completing a full game
      // This test structure exists for when victory flow is testable
      await page.setViewportSize(dimensions);

      // TODO: Navigate to victory screen (requires completing game)
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot(
        `victory-screen-${name}.png`,
        screenshotOptions(page)
      );
    });
  }

  // TODO: previously this navigated through `/` looking for a generic
  // "create" button which never matched the marketing landing page, then
  // silently captured a blank baseline. Now `.fixme` until a real victory
  // fixture exists (requires completing a battle, which needs a multi-page
  // mocked flow). Leaving in place so the gap is visible.
  test.fixme('game completion UI elements - desktop', async () => {});
});
