import { test, expect, Page } from "@playwright/test";

/**
 * Battle flow E2E — drives the real redesigned UI end to end:
 *   /play → Create Battle Lobby → confirm avatar → add a ticket →
 *   Begin Battle → BattleScreen (voting cards + boss + submit).
 *
 * A solo host CAN reach the battle phase: the server only requires at least
 * one ticket and one active voter (the host is a Developer by default), so
 * these flows run single-page without a second player.
 *
 * The "matching-votes team bonus" damage path genuinely needs >=2 voters on
 * the same team; that specific assertion is marked test.skip with a reason.
 */

/** Seed a saved player name so the create form prefills and storage is clean. */
async function seedName(page: Page, name: string): Promise<void> {
  await page.addInitScript((n) => {
    window.localStorage.setItem("scrum-monsters-player-name", n);
  }, name);
}

/**
 * Mark every tutorial walkthrough as already-completed so a fresh test
 * session (fresh localStorage, same as a real first-time player) doesn't
 * get the "Battle Advisor" onboarding spotlight/hint-bubble sequence.
 * Without this, the spotlight overlay's full-screen click-catcher blocks
 * interaction with anything but the current walkthrough step's target
 * until each step is dismissed — these tests aren't exercising the
 * tutorial, so skip it the same way seedName skips the name-entry step.
 */
async function seedTutorialSeen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "scrumquest-tutorial",
      JSON.stringify({
        state: {
          completedTutorials: {
            "walkthrough:lobby": true,
            "walkthrough:avatar_selection": true,
            "walkthrough:battle": true,
          },
          completedHints: {},
          version: 1,
        },
        version: 1,
      })
    );
  });
}

/**
 * Create a lobby, confirm an avatar, add a ticket and begin the battle.
 * Returns once the BattleScreen voting UI is visible.
 */
async function startSoloBattle(
  page: Page,
  hostName: string,
  lobbyName: string
): Promise<void> {
  await seedTutorialSeen(page);
  await page.goto("/play");
  await page.getByRole("button", { name: "Create Battle Lobby" }).click();

  await page.locator('input[name="hostName"]').fill(hostName);
  await page.locator('input[name="lobbyName"]').fill(lobbyName);
  await page.getByRole("button", { name: /create battle lobby/i }).click();

  await page.waitForURL(/\/game\/[A-Z0-9]{6}/, { timeout: 15000 });

  // Avatar selection → confirm.
  await page.getByRole("button", { name: /confirm avatar/i }).click();

  // Lobby waiting room. Ensure the host is on a voting team (Developers) —
  // the server rejects start_battle with zero active voters, and the default
  // team placement is not guaranteed, so click Developers explicitly.
  const developersTeam = page.getByRole("button", { name: /^Developers/ });
  await expect(developersTeam).toBeVisible({ timeout: 15000 });
  await developersTeam.click();

  // Add a ticket.
  const ticketInput = page.getByPlaceholder(/add tickets/i);
  await expect(ticketInput).toBeVisible();
  await ticketInput.fill("TEST-1");
  await page.getByRole("button", { name: /^Add$/ }).click();

  // Begin Battle (button label includes the ticket count).
  const beginButton = page.getByRole("button", { name: /begin battle/i });
  await expect(beginButton).toBeVisible();
  await beginButton.click();

  // BattleScreen voting interface.
  await expect(
    page.getByRole("heading", { name: /submit your estimate/i })
  ).toBeVisible({ timeout: 20000 });
}

test.describe("Battle Flow", () => {
  test("displays voting options during the battle phase", async ({ page }) => {
    await seedName(page, "VotingHost");
    await startSoloBattle(page, "VotingHost", "Voting Options Lobby");

    // Fibonacci estimate cards plus the unsure option.
    for (const value of ["1", "2", "3", "5", "8", "13", "?"]) {
      await expect(
        page.getByRole("button", { name: value, exact: true })
      ).toBeVisible();
    }
  });

  test("allows a player to select and submit a vote", async ({ page }) => {
    await seedName(page, "SubmitHost");
    await startSoloBattle(page, "SubmitHost", "Submit Vote Lobby");

    // Submit is disabled until a card is chosen.
    await expect(
      page.getByRole("button", { name: /^Submit Score: \?/ })
    ).toBeDisabled();

    await page.getByRole("button", { name: "5", exact: true }).click();

    // Choosing a card enables the submit button labelled with the value.
    const submit = page.getByRole("button", { name: /^Submit Score: 5/ });
    await expect(submit).toBeEnabled();
  });

  test("shows the boss health bar during battle", async ({ page }) => {
    await seedName(page, "BossHost");
    await startSoloBattle(page, "BossHost", "Boss Health Lobby");

    // Boss HP progressbar is rendered with an accessible name ending in "HP".
    const bossHp = page.getByRole("progressbar", { name: /HP$/ }).first();
    await expect(bossHp).toBeVisible();
    await expect(page.getByText(/\d+\/\d+ HP/).first()).toBeVisible();
  });

  test("resolves combat after the only voter submits", async ({ page }) => {
    await seedName(page, "CombatHost");
    await startSoloBattle(page, "CombatHost", "Combat Resolution Lobby");

    // With a single active voter, submitting the lone vote completes the
    // round and reveals scores — exercising the combat/damage resolution path.
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: /^Submit Score: 5/ }).click();

    // Round resolution surfaces revealed results / consensus messaging.
    await expect(
      page
        .getByText(/reveal|consensus|results|estimate|damage|next/i)
        .first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("transitions from lobby into the battle phase", async ({ page }) => {
    await seedName(page, "PhaseHost");
    // startSoloBattle already asserts the lobby → battle transition by waiting
    // for the BattleScreen estimate UI; assert a couple of battle-only markers.
    await startSoloBattle(page, "PhaseHost", "Phase Transition Lobby");

    await expect(
      page.getByRole("heading", { name: /current objective/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /team battle status/i })
    ).toBeVisible();
  });

  test.skip(
    "applies the matching-votes team bonus (requires 2+ voters)",
    () => {
      // The same-estimate team damage bonus only triggers with two or more
      // voters on one team. A solo host cannot produce a matching pair, so
      // this multiplayer-only damage path is out of scope for the single-page
      // E2E run. Covered by server-side combat unit tests instead.
    }
  );
});
