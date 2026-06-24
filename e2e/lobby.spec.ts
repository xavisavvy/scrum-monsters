import { test, expect, Page } from "@playwright/test";

/**
 * Lobby flow E2E — exercises the real redesigned UI:
 *   /        landing page (CTA "Start a Battle") → navigates to /play
 *   /play    MenuPage: "Create Battle Lobby" / "Join Battle"
 *   create   LobbyCreation form → /game/:id → avatar selection
 *   join     invalid code surfaces a "Lobby not found" error
 *
 * Each test seeds a unique localStorage player name where convenient so the
 * /play "Rejoin" shortcut (driven by last-lobby storage) never interferes.
 */

/** Create a lobby through the real /play → create flow and land in-game. */
async function createLobby(
  page: Page,
  hostName: string,
  lobbyName: string
): Promise<string> {
  await page.goto("/play");

  await page.getByRole("button", { name: "Create Battle Lobby" }).click();

  await page.locator('input[name="hostName"]').fill(hostName);
  await page.locator('input[name="lobbyName"]').fill(lobbyName);

  await page.getByRole("button", { name: /create battle lobby/i }).click();

  // On lobby_created the client navigates to /game/:lobbyId
  await page.waitForURL(/\/game\/[A-Z0-9]{6}/, { timeout: 15000 });
  const match = /\/game\/([A-Z0-9]{6})/.exec(page.url());
  expect(match).not.toBeNull();
  return match![1];
}

test.describe("Lobby Flow", () => {
  test("landing page shows the Start a Battle CTA and navigates to /play", async ({
    page,
  }) => {
    await page.goto("/");

    // The marketing landing page has the main title + a primary CTA.
    await expect(
      page.getByRole("heading", { level: 1, name: /scrum monsters/i })
    ).toBeVisible();

    const startButton = page.getByRole("button", { name: /start a battle/i });
    await expect(startButton.first()).toBeVisible();

    await startButton.first().click();

    // Lands on the menu page with Create / Join options.
    await page.waitForURL(/\/play/);
    await expect(
      page.getByRole("button", { name: "Create Battle Lobby" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Join Battle" })
    ).toBeVisible();
  });

  test("menu page exposes Create and Join options", async ({ page }) => {
    await page.goto("/play");

    await expect(
      page.getByRole("button", { name: "Create Battle Lobby" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Join Battle" })
    ).toBeVisible();
  });

  test("create lobby flow reaches the in-game avatar selection", async ({
    page,
  }) => {
    const lobbyId = await createLobby(page, "CreateHost", "Create Flow Lobby");
    expect(lobbyId).toMatch(/^[A-Z0-9]{6}$/);

    // First in-game screen for a fresh player is avatar selection.
    await expect(
      page.getByRole("heading", { name: /choose your avatar/i })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: /confirm avatar/i })
    ).toBeVisible();
  });

  test("create → confirm avatar reaches the lobby waiting room", async ({
    page,
  }) => {
    const lobbyId = await createLobby(page, "WaitHost", "Waiting Room Lobby");

    await page.getByRole("button", { name: /confirm avatar/i }).click();

    // Lobby waiting room shows the joinable lobby code + team picker.
    await expect(page.getByText(`Lobby Code: ${lobbyId}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("heading", { name: /battle teams/i })
    ).toBeVisible();
  });

  test("opening the Join form shows the code + name inputs", async ({
    page,
  }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: "Join Battle" }).click();

    // LobbyJoin renders within /play (no navigation).
    await expect(
      page.getByRole("heading", { name: /join battle/i })
    ).toBeVisible();
    await expect(page.getByPlaceholder(/enter your name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/enter lobby code/i)).toBeVisible();
  });

  test("navigating to an invalid lobby code shows a not-found error", async ({
    page,
  }) => {
    // Seed a saved name so GamePage auto-joins (rather than bouncing to the
    // name-entry form). The invalid-code error is surfaced by GamePage's
    // game_error handler as a sonner toast, then it redirects back to /play.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "scrum-monsters-player-name",
        "InvalidJoiner"
      );
    });

    await page.goto("/game/ZZZZZZ");

    await expect(page.getByText(/lobby not found/i).first()).toBeVisible({
      timeout: 10000,
    });
    // And we get bounced back to the menu.
    await page.waitForURL(/\/play/, { timeout: 10000 });
  });
});
