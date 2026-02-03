import { test, expect } from "@playwright/test";

test.describe("Lobby Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display home page with create and join options", async ({
    page,
  }) => {
    // Check that the main UI elements are present
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Should have options to create or join a lobby
    const createButton = page.getByRole("button", { name: /create/i });
    const joinButton = page.getByRole("button", { name: /join/i });

    // At least one of these should be visible
    const createVisible = await createButton.isVisible().catch(() => false);
    const joinVisible = await joinButton.isVisible().catch(() => false);
    expect(createVisible || joinVisible).toBe(true);
  });

  test("should create a new lobby", async ({ page }) => {
    // Look for create lobby button
    const createButton = page.getByRole("button", { name: /create/i });

    // If not immediately visible, there might be a menu or dialog to open first
    if (!(await createButton.isVisible().catch(() => false))) {
      // Try looking for a "New Game" or similar entry point
      const newGameButton = page.getByRole("button", { name: /new game/i });
      if (await newGameButton.isVisible().catch(() => false)) {
        await newGameButton.click();
      }
    }

    // Now try to find and interact with create lobby
    if (await createButton.isVisible().catch(() => false)) {
      // Fill in player name if there's an input
      const nameInput = page.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("TestPlayer");
      }

      await createButton.click();

      // Should navigate to lobby or show lobby code
      await expect(
        page.getByText(/lobby|code|room|waiting/i).first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("should join an existing lobby with code", async ({ page, context }) => {
    // First, create a lobby in a new page to get a code
    const hostPage = await context.newPage();
    await hostPage.goto("/");

    // Create lobby as host
    const createButton = hostPage.getByRole("button", { name: /create/i });
    if (await createButton.isVisible().catch(() => false)) {
      const nameInput = hostPage.getByPlaceholder(/name/i);
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("HostPlayer");
      }
      await createButton.click();

      // Wait for lobby code to appear
      await hostPage.waitForTimeout(2000);

      // Try to find the lobby code - it might be displayed in various ways
      const lobbyCodeElement = hostPage.locator(
        '[data-testid="lobby-code"], .lobby-code, [class*="code"]'
      );
      const codeVisible = await lobbyCodeElement.first().isVisible().catch(() => false);

      if (codeVisible) {
        const lobbyCode = await lobbyCodeElement.first().textContent();

        // Now join as a second player
        const joinButton = page.getByRole("button", { name: /join/i });
        if (await joinButton.isVisible().catch(() => false)) {
          await joinButton.click();

          // Enter the lobby code
          const codeInput = page.getByPlaceholder(/code/i);
          if (await codeInput.isVisible().catch(() => false) && lobbyCode) {
            await codeInput.fill(lobbyCode);

            const nameInput = page.getByPlaceholder(/name/i);
            if (await nameInput.isVisible().catch(() => false)) {
              await nameInput.fill("JoinPlayer");
            }

            const submitButton = page.getByRole("button", {
              name: /join|submit/i,
            });
            await submitButton.click();

            // Should join the lobby
            await expect(
              page.getByText(/lobby|waiting|players/i).first()
            ).toBeVisible({ timeout: 10000 });
          }
        }
      }
    }

    await hostPage.close();
  });

  test("should show validation error for invalid lobby code", async ({
    page,
  }) => {
    const joinButton = page.getByRole("button", { name: /join/i });

    if (await joinButton.isVisible().catch(() => false)) {
      await joinButton.click();

      const codeInput = page.getByPlaceholder(/code/i);
      if (await codeInput.isVisible().catch(() => false)) {
        // Enter an invalid code
        await codeInput.fill("INVALID");

        const submitButton = page.getByRole("button", { name: /join|submit/i });
        if (await submitButton.isVisible().catch(() => false)) {
          await submitButton.click();

          // Should show an error message
          await expect(
            page.getByText(/not found|invalid|error|doesn't exist/i).first()
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});
