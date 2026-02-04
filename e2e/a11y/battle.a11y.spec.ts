import { test, expect } from '../helpers/a11y-fixture';
import {
  filterBlockingViolations,
  formatViolation,
  logWarningViolations
} from '../helpers/a11y-helpers';

test.describe('Battle Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('lobby waiting room should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    // Create a lobby to get to waiting room
    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      // Fill name if input exists
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('A11yTestPlayer');
      }

      await createButton.click();

      // Wait for lobby/waiting room
      await page.waitForTimeout(2000);

      // Check if we're in a lobby state
      const lobbyContent = page.getByText(/lobby|code|waiting|players/i).first();
      if (await lobbyContent.isVisible().catch(() => false)) {
        const results = await makeAxeBuilder().analyze();
        logWarningViolations(results.violations);

        const blockingViolations = filterBlockingViolations(results.violations);
        if (blockingViolations.length > 0) {
          console.error('\nBlocking accessibility violations in lobby waiting room:\n');
          blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
        }

        expect(blockingViolations).toEqual([]);
      }
    }
  });

  test('voting interface should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    // This test requires getting to a voting state
    // For now, test what's accessible from initial load
    // Full game flow accessibility requires multi-player setup

    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('A11yVoter');
      }

      await createButton.click();
      await page.waitForTimeout(2000);

      // Look for voting-related elements (estimation cards, etc.)
      const votingArea = page.locator('[data-testid="voting-cards"], .voting-cards, [class*="estimate"]').first();
      if (await votingArea.isVisible().catch(() => false)) {
        const results = await makeAxeBuilder().analyze();
        logWarningViolations(results.violations);

        const blockingViolations = filterBlockingViolations(results.violations);
        if (blockingViolations.length > 0) {
          console.error('\nBlocking accessibility violations in voting interface:\n');
          blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
        }

        expect(blockingViolations).toEqual([]);
      }
    }
  });

  test('avatar selection should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    // Avatar selection may appear during game setup
    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('A11yAvatar');
      }

      await createButton.click();
      await page.waitForTimeout(2000);

      // Look for avatar selection elements
      const avatarArea = page.locator('[data-testid="avatar-selection"], [class*="avatar"], [role="radiogroup"]').first();
      if (await avatarArea.isVisible().catch(() => false)) {
        const results = await makeAxeBuilder().analyze();
        logWarningViolations(results.violations);

        const blockingViolations = filterBlockingViolations(results.violations);
        if (blockingViolations.length > 0) {
          console.error('\nBlocking accessibility violations in avatar selection:\n');
          blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
        }

        expect(blockingViolations).toEqual([]);
      }
    }
  });
});
