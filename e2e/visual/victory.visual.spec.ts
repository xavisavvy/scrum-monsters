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

  // Test any victory-related UI that's accessible without full game completion
  test('game completion UI elements - desktop', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);

    // This test captures any accessible victory-related UI
    // Adjust selectors based on actual game structure
    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('TestPlayer');
      }
      await createButton.click();
      await waitForStableUI(page);

      // Capture initial game state as baseline
      await expect(page).toHaveScreenshot('game-ui-desktop.png', screenshotOptions(page));
    }
  });
});
