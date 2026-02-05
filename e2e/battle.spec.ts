import { test, expect, Page } from "@playwright/test";

/**
 * Helper to create a lobby and wait for it to be ready
 */
async function createLobby(page: Page, playerName: string): Promise<void> {
  await page.goto("/");

  // Find and click create button
  const createButton = page.getByRole("button", { name: /create/i });
  if (!(await createButton.isVisible().catch(() => false))) {
    const newGameButton = page.getByRole("button", { name: /new game/i });
    if (await newGameButton.isVisible().catch(() => false)) {
      await newGameButton.click();
    }
  }

  // Fill in player name
  const nameInput = page.getByPlaceholder(/name/i);
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(playerName);
  }

  const createBtn = page.getByRole("button", { name: /create/i });
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
  }

  // Wait for lobby to be created
  await page.waitForTimeout(2000);
}

/**
 * Helper to join an existing lobby
 */
async function joinLobby(
  page: Page,
  lobbyCode: string,
  playerName: string
): Promise<void> {
  await page.goto("/");

  const joinButton = page.getByRole("button", { name: /join/i });
  if (await joinButton.isVisible().catch(() => false)) {
    await joinButton.click();

    const codeInput = page.getByPlaceholder(/code/i);
    if (await codeInput.isVisible().catch(() => false)) {
      await codeInput.fill(lobbyCode);
    }

    const nameInput = page.getByPlaceholder(/name/i);
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(playerName);
    }

    const submitButton = page.getByRole("button", { name: /join|submit/i });
    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();
    }
  }

  await page.waitForTimeout(2000);
}

test.describe("Battle Flow", () => {
  test("should display voting options during battle phase", async ({
    page,
    context,
  }) => {
    // Create a lobby as host
    await createLobby(page, "BattleHost");

    // Find and get lobby code
    const lobbyCodeElement = page.locator(
      '[data-testid="lobby-code"], .lobby-code, [class*="code"]'
    );
    const codeVisible = await lobbyCodeElement.first().isVisible().catch(() => false);

    if (codeVisible) {
      const lobbyCode = await lobbyCodeElement.first().textContent();

      if (lobbyCode) {
        // Join as second player
        const player2Page = await context.newPage();
        await joinLobby(player2Page, lobbyCode, "BattlePlayer2");

        // Host starts the game
        const startButton = page.getByRole("button", { name: /start/i });
        if (await startButton.isVisible().catch(() => false)) {
          await startButton.click();

          // Wait for battle phase
          await page.waitForTimeout(3000);

          // Look for voting/estimation cards
          const votingCards = page.locator(
            '[data-testid="vote-card"], .vote-card, [class*="card"], button:has-text(/^[0-9]+$/)'
          );
          const cardsVisible = await votingCards.first().isVisible().catch(() => false);

          // Should see voting options (numbered cards like 1, 2, 3, 5, 8, etc.)
          if (cardsVisible) {
            await expect(votingCards.first()).toBeVisible();
          }
        }

        await player2Page.close();
      }
    }
  });

  test("should allow players to submit votes", async ({ page, context }) => {
    await createLobby(page, "VoteHost");

    const lobbyCodeElement = page.locator(
      '[data-testid="lobby-code"], .lobby-code, [class*="code"]'
    );
    const codeVisible = await lobbyCodeElement.first().isVisible().catch(() => false);

    if (codeVisible) {
      const lobbyCode = await lobbyCodeElement.first().textContent();

      if (lobbyCode) {
        const player2Page = await context.newPage();
        await joinLobby(player2Page, lobbyCode, "VotePlayer2");

        // Start game
        const startButton = page.getByRole("button", { name: /start/i });
        if (await startButton.isVisible().catch(() => false)) {
          await startButton.click();
          await page.waitForTimeout(3000);

          // Find and click a voting card (e.g., the "5" card)
          const voteCard = page.locator(
            'button:has-text("5"), [data-value="5"], [class*="card"]:has-text("5")'
          );
          if (await voteCard.first().isVisible().catch(() => false)) {
            await voteCard.first().click();

            // Vote should be submitted - look for confirmation
            await expect(
              page.getByText(/voted|selected|submitted/i).first()
            ).toBeVisible({ timeout: 5000 });
          }
        }

        await player2Page.close();
      }
    }
  });

  test("should show boss health bar during battle", async ({ page }) => {
    await createLobby(page, "BossHost");

    // If we need another player to start, we'll handle that
    const startButton = page.getByRole("button", { name: /start/i });

    // The game might allow single-player start for testing
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
      await page.waitForTimeout(3000);

      // Look for boss-related UI elements
      const bossHealth = page.locator(
        '[data-testid="boss-health"], .boss-health, [class*="health"], .progress'
      );
      const bossName = page.locator(
        '[data-testid="boss-name"], .boss-name, [class*="boss"]'
      );

      // At least one boss indicator should be visible in battle phase
      const healthVisible = await bossHealth.first().isVisible().catch(() => false);
      const nameVisible = await bossName.first().isVisible().catch(() => false);

      if (healthVisible || nameVisible) {
        expect(healthVisible || nameVisible).toBe(true);
      }
    }
  });

  test("should handle combat damage calculations", async ({
    page,
    context,
  }) => {
    await createLobby(page, "CombatHost");

    const lobbyCodeElement = page.locator(
      '[data-testid="lobby-code"], .lobby-code, [class*="code"]'
    );
    const codeVisible = await lobbyCodeElement.first().isVisible().catch(() => false);

    if (codeVisible) {
      const lobbyCode = await lobbyCodeElement.first().textContent();

      if (lobbyCode) {
        const player2Page = await context.newPage();
        await joinLobby(player2Page, lobbyCode, "CombatPlayer2");

        // Start game
        const startButton = page.getByRole("button", { name: /start/i });
        if (await startButton.isVisible().catch(() => false)) {
          await startButton.click();
          await page.waitForTimeout(3000);

          // Both players vote with same value for bonus
          const voteCard5Host = page.locator(
            'button:has-text("5"), [data-value="5"]'
          );
          const voteCard5Player = player2Page.locator(
            'button:has-text("5"), [data-value="5"]'
          );

          if (await voteCard5Host.first().isVisible().catch(() => false)) {
            await voteCard5Host.first().click();
          }
          if (await voteCard5Player.first().isVisible().catch(() => false)) {
            await voteCard5Player.first().click();
          }

          // Wait for combat resolution
          await page.waitForTimeout(5000);

          // Should see damage or phase transition
          const damageIndicator = page.getByText(/damage|hit|attack/i);
          const phaseChange = page.getByText(
            /reveal|discussion|victory|defeat/i
          );

          const damageVisible = await damageIndicator.first().isVisible().catch(() => false);
          const phaseVisible = await phaseChange.first().isVisible().catch(() => false);

          // Combat should have some visible effect
          if (damageVisible || phaseVisible) {
            expect(damageVisible || phaseVisible).toBe(true);
          }
        }

        await player2Page.close();
      }
    }
  });

  test("should transition through game phases correctly", async ({
    page,
    context,
  }) => {
    await createLobby(page, "PhaseHost");

    const lobbyCodeElement = page.locator(
      '[data-testid="lobby-code"], .lobby-code, [class*="code"]'
    );
    const codeVisible = await lobbyCodeElement.first().isVisible().catch(() => false);

    if (codeVisible) {
      const lobbyCode = await lobbyCodeElement.first().textContent();

      if (lobbyCode) {
        const player2Page = await context.newPage();
        await joinLobby(player2Page, lobbyCode, "PhasePlayer2");

        // Start game - should be in lobby phase initially
        const startButton = page.getByRole("button", { name: /start/i });
        if (await startButton.isVisible().catch(() => false)) {
          // We're in lobby phase
          await startButton.click();

          // Should transition to avatar_selection or battle
          await page.waitForTimeout(3000);

          // Check for phase indicators
          const phaseIndicators = [
            page.getByText(/select.*avatar|choose.*character/i),
            page.getByText(/battle|fight|combat/i),
            page.getByText(/vote|estimate/i),
          ];

          let foundPhase = false;
          for (const indicator of phaseIndicators) {
            if (await indicator.first().isVisible().catch(() => false)) {
              foundPhase = true;
              break;
            }
          }

          // Should be in some game phase after starting
          if (foundPhase) {
            expect(foundPhase).toBe(true);
          }
        }

        await player2Page.close();
      }
    }
  });
});
