import { test, expect } from '../helpers/a11y-fixture';
import {
  filterBlockingViolations,
  formatViolation,
  logWarningViolations
} from '../helpers/a11y-helpers';

test.describe('Lobby Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');
  });

  test('home page should have no critical accessibility violations', async ({
    page: _page,
    makeAxeBuilder
  }) => {
    const results = await makeAxeBuilder().analyze();

    // Log warnings but don't fail
    logWarningViolations(results.violations);

    // Only fail on blocking violations
    const blockingViolations = filterBlockingViolations(results.violations);

    if (blockingViolations.length > 0) {
      console.error('\nBlocking accessibility violations:\n');
      blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
    }

    expect(blockingViolations).toEqual([]);
  });

  test('create lobby modal should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    // Look for create button and click if visible
    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();

      // Wait for modal/dialog to appear
      await page.waitForTimeout(500);

      const results = await makeAxeBuilder().analyze();
      logWarningViolations(results.violations);

      const blockingViolations = filterBlockingViolations(results.violations);
      if (blockingViolations.length > 0) {
        console.error('\nBlocking accessibility violations in create modal:\n');
        blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
      }

      expect(blockingViolations).toEqual([]);
    }
  });

  test('join lobby modal should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    // Look for join button and click if visible
    const joinButton = page.getByRole('button', { name: /join/i });
    if (await joinButton.isVisible().catch(() => false)) {
      await joinButton.click();

      // Wait for modal/dialog to appear
      await page.waitForTimeout(500);

      const results = await makeAxeBuilder().analyze();
      logWarningViolations(results.violations);

      const blockingViolations = filterBlockingViolations(results.violations);
      if (blockingViolations.length > 0) {
        console.error('\nBlocking accessibility violations in join modal:\n');
        blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
      }

      expect(blockingViolations).toEqual([]);
    }
  });
});
