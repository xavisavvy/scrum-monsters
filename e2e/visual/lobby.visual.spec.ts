import { test, expect } from '@playwright/test';
import { viewports, ViewportName, screenshotOptions, waitForStableUI } from '../helpers/visual-helpers';

test.describe('Lobby Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Mock time for consistent timestamps
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    await page.goto('/');
  });

  // Test home page at each viewport
  for (const [name, dimensions] of Object.entries(viewports)) {
    test(`home page - ${name}`, async ({ page }) => {
      await page.setViewportSize(dimensions);
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot(
        `home-page-${name}.png`,
        screenshotOptions(page)
      );
    });

    test(`lobby creation - ${name}`, async ({ page }) => {
      await page.setViewportSize(dimensions);

      // Create lobby flow
      const createButton = page.getByRole('button', { name: /create/i });
      if (await createButton.isVisible().catch(() => false)) {
        const nameInput = page.getByPlaceholder(/name/i);
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.fill('TestPlayer');
        }
        await createButton.click();

        // Wait for lobby to load
        await waitForStableUI(page);

        await expect(page).toHaveScreenshot(
          `lobby-created-${name}.png`,
          screenshotOptions(page)
        );
      }
    });
  }
});
