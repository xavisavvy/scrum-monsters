import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("health endpoint returns 200 @smoke", { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });

  test("home page loads without error @smoke", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });
  });

  test("WebSocket health endpoint responds @smoke", { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get("/api/ws-health");
    expect(response.status()).toBe(200);
  });
});
