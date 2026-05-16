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

    test(`lobby ready - ${name}`, async ({ page }, testInfo) => {
      await page.setViewportSize(dimensions);
      await createLobbyAndPickAvatar(page, {
        lobbyName: `Visual-${name}-${testInfo.testId.slice(0, 6)}`,
        playerName: 'TestPlayer',
        avatar: 'warrior',
      });
      await waitForStableUI(page);

      await expect(page).toHaveScreenshot(
        `lobby-ready-${name}.png`,
        screenshotOptions(page)
      );
    });
  }
});
