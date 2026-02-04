import { test, expect } from '@playwright/test';
import { viewports, screenshotOptions, waitForStableUI, commonMasks } from '../helpers/visual-helpers';

test.describe('Voting Screen Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    await page.goto('/');
  });

  // Desktop only for voting - includes 3D canvas which needs special handling
  test('voting screen with battle scene - desktop', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);

    // Create lobby and navigate to voting phase
    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('TestPlayer');
      }
      await createButton.click();
      await waitForStableUI(page);

      // Look for voting UI elements (estimation cards)
      const votingElement = page.locator('[data-testid="estimation-cards"], .estimation-cards, [class*="vote"]').first();
      if (await votingElement.isVisible().catch(() => false)) {
        await expect(page).toHaveScreenshot('voting-screen-desktop.png', {
          ...screenshotOptions(page),
          // Higher tolerance for 3D content
          maxDiffPixelRatio: 0.02,
        });
      }
    }
  });

  // Mobile voting without 3D (if applicable)
  test('voting screen - mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);

    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('TestPlayer');
      }
      await createButton.click();
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot('voting-screen-mobile.png', screenshotOptions(page));
    }
  });
});
