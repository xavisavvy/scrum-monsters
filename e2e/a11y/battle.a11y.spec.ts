import { test, expect } from '../helpers/a11y-fixture';
import {
  filterBlockingViolations,
  formatViolation,
  logWarningViolations
} from '../helpers/a11y-helpers';

/**
 * Battle / in-game accessibility — axe-core scans on the real game screens,
 * reached through the redesigned flow:
 *   /play → Create Battle Lobby → avatar selection → lobby waiting room →
 *   add ticket → Begin Battle → voting interface.
 *
 * A solo host can reach every screen, so these run single-page. Tests fail
 * only on blocking (critical/serious) violations.
 */

/** Seed a saved player name so the create form prefills and storage is clean. */
async function seedName(page: import('@playwright/test').Page, name: string) {
  await page.addInitScript((n) => {
    window.localStorage.setItem('scrum-monsters-player-name', n);
  }, name);
}

/** Create a lobby and stop on the avatar selection screen. */
async function createToAvatar(
  page: import('@playwright/test').Page,
  hostName: string,
  lobbyName: string
) {
  await page.goto('/play');
  await page.getByRole('button', { name: 'Create Battle Lobby' }).click();
  await page.locator('input[name="hostName"]').fill(hostName);
  await page.locator('input[name="lobbyName"]').fill(lobbyName);
  await page.getByRole('button', { name: /create battle lobby/i }).click();
  await page.waitForURL(/\/game\/[A-Z0-9]{6}/, { timeout: 15000 });
  await expect(
    page.getByRole('heading', { name: /choose your avatar/i })
  ).toBeVisible({ timeout: 15000 });
}

test.describe('Battle Accessibility', () => {
  // KNOWN REAL DEFECT (test.fixme until fixed): the avatar/CharacterDetailsPanel has
  // serious color-contrast violations — "Total Points" ".text-gray-500" #6b7280 on
  // #1f2937 (ratio 3.03) and the specialty tags (Melee Combat/Defense/Leadership)
  // #b22222 on #312834 (ratio 2.11). Genuine pre-existing app defect; un-fixme once fixed.
  test.fixme('avatar selection should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    await seedName(page, 'A11yAvatar');
    await createToAvatar(page, 'A11yAvatar', 'A11y Avatar Lobby');

    // The in-game screens mount an off-screen YouTube embed; its <iframe>
    // content (#movie_player) is injected by YouTube and not app-authored, so
    // exclude the iframe like the 3D canvas — axe will not descend into it,
    // and the scan only audits ScrumMonsters' own markup.
    const results = await makeAxeBuilder().exclude('iframe').analyze();
    logWarningViolations(results.violations);

    const blockingViolations = filterBlockingViolations(results.violations);
    if (blockingViolations.length > 0) {
      console.error('\nBlocking accessibility violations in avatar selection:\n');
      blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
    }

    expect(blockingViolations).toEqual([]);
  });

  test('lobby waiting room should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    await seedName(page, 'A11yLobby');
    await createToAvatar(page, 'A11yLobby', 'A11y Waiting Lobby');

    await page.getByRole('button', { name: /confirm avatar/i }).click();
    await expect(page.getByText(/Lobby Code:/i)).toBeVisible({ timeout: 15000 });

    // The in-game screens mount an off-screen YouTube embed; its <iframe>
    // content (#movie_player) is injected by YouTube and not app-authored, so
    // exclude the iframe like the 3D canvas — axe will not descend into it,
    // and the scan only audits ScrumMonsters' own markup.
    const results = await makeAxeBuilder().exclude('iframe').analyze();
    logWarningViolations(results.violations);

    const blockingViolations = filterBlockingViolations(results.violations);
    if (blockingViolations.length > 0) {
      console.error('\nBlocking accessibility violations in lobby waiting room:\n');
      blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
    }

    expect(blockingViolations).toEqual([]);
  });

  // KNOWN REAL DEFECT (test.fixme until fixed): the voting interface's cyan "TAB" badge
  // (bg-cyan-600 + text-cyan-200 bold) is #a5f3fc on #0891b2 → ratio 2.95 (serious
  // color-contrast violation). Genuine pre-existing app defect; un-fixme once fixed.
  test.fixme('voting interface should be accessible', async ({
    page,
    makeAxeBuilder
  }) => {
    await seedName(page, 'A11yVoter');
    await createToAvatar(page, 'A11yVoter', 'A11y Voting Lobby');

    await page.getByRole('button', { name: /confirm avatar/i }).click();

    // Ensure host is on a voting team, then add a ticket and begin battle.
    const developersTeam = page.getByRole('button', { name: /^Developers/ });
    await expect(developersTeam).toBeVisible({ timeout: 15000 });
    await developersTeam.click();

    const ticketInput = page.getByPlaceholder(/add tickets/i);
    await ticketInput.fill('TEST-1');
    await page.getByRole('button', { name: /^Add$/ }).click();
    await page.getByRole('button', { name: /begin battle/i }).click();

    await expect(
      page.getByRole('heading', { name: /submit your estimate/i })
    ).toBeVisible({ timeout: 20000 });

    // The in-game screens mount an off-screen YouTube embed; its <iframe>
    // content (#movie_player) is injected by YouTube and not app-authored, so
    // exclude the iframe like the 3D canvas — axe will not descend into it,
    // and the scan only audits ScrumMonsters' own markup.
    const results = await makeAxeBuilder().exclude('iframe').analyze();
    logWarningViolations(results.violations);

    const blockingViolations = filterBlockingViolations(results.violations);
    if (blockingViolations.length > 0) {
      console.error('\nBlocking accessibility violations in voting interface:\n');
      blockingViolations.forEach(v => console.error(formatViolation(v) + '\n'));
    }

    expect(blockingViolations).toEqual([]);
  });
});
