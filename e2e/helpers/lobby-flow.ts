import { Page, expect } from '@playwright/test';

/**
 * Click the marketing landing page CTA to reach the /play screen.
 */
export async function openPlayScreen(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /start a battle/i }).first().click();
  await page.waitForURL(/\/play/);
}

/**
 * Open the "Create Battle Lobby" form on /play.
 * Idempotent if already open.
 */
export async function openCreateLobbyForm(page: Page): Promise<void> {
  const createTopLevel = page.getByRole('button', { name: /^create battle lobby$/i });
  await createTopLevel.first().click();
  // Form heading anchors the modal/section
  await expect(page.getByRole('heading', { name: /create battle lobby/i })).toBeVisible();
}

/**
 * Fill the create-lobby form and submit. Returns once the route changes
 * into the /game/:code page.
 */
export async function submitCreateLobby(
  page: Page,
  opts: { lobbyName: string; playerName?: string }
): Promise<void> {
  if (opts.playerName) {
    await page.getByPlaceholder(/enter your name/i).fill(opts.playerName);
  }
  await page.getByPlaceholder(/enter lobby name/i).fill(opts.lobbyName);
  // Submit (the form-level submit button has the same label as the top-level
  // CTA — disambiguate by finding the enabled one inside the form).
  const submitButtons = page.getByRole('button', { name: /^create battle lobby$/i });
  const count = await submitButtons.count();
  for (let i = 0; i < count; i++) {
    const btn = submitButtons.nth(i);
    if (await btn.isEnabled()) {
      await btn.click();
      break;
    }
  }
  await page.waitForURL(/\/game\//);
}

/**
 * Click an avatar class card and confirm. Waits until the avatar
 * selection UI is replaced by the lobby ready-up screen.
 */
export async function confirmAvatar(
  page: Page,
  avatarClass:
    | 'ranger'
    | 'rogue'
    | 'bard'
    | 'sorcerer'
    | 'wizard'
    | 'warrior'
    | 'paladin'
    | 'cleric'
    | 'oathbreaker'
    | 'monk' = 'warrior'
): Promise<void> {
  // Avatar selection panel renders 10 cards; each is a heading with the
  // class name (capitalised). Click the heading's container.
  const heading = page.getByRole('heading', {
    name: new RegExp(`^${avatarClass}$`, 'i'),
    level: 4,
  });
  await heading.click();
  await page.getByRole('button', { name: /^confirm avatar$/i }).click();
  // After confirm, avatar selection panel goes away. Wait for the
  // lobby UI to appear (Ready Up button is the post-avatar anchor).
  await expect(
    page.getByRole('button', { name: /ready up|not ready/i })
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * End-to-end: from a fresh page load, create a lobby and confirm the
 * default warrior avatar. Returns the game URL the page lands on.
 */
export async function createLobbyAndPickAvatar(
  page: Page,
  opts: { lobbyName: string; playerName?: string; avatar?: Parameters<typeof confirmAvatar>[1] }
): Promise<string> {
  await openPlayScreen(page);
  await openCreateLobbyForm(page);
  await submitCreateLobby(page, opts);
  await confirmAvatar(page, opts.avatar ?? 'warrior');
  return page.url();
}
