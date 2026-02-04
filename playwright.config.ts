import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for ScrumQuest
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  // Run tests in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Opt out of parallel tests on CI for stability
  workers: process.env.CI ? 1 : undefined,
  // Reporter to use
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  // Shared settings for all projects
  use: {
    // Base URL for navigation actions
    baseURL: "http://localhost:5000",
    // Collect trace on first retry
    trace: "on-first-retry",
    // Take screenshots on failure
    screenshot: "only-on-failure",
    // Record video on failure
    video: "retain-on-failure",
    // Emulate prefers-reduced-motion for visual tests
    reducedMotion: "reduce",
  },

  // Use platform-agnostic snapshot paths (CI Docker ensures consistent rendering)
  snapshotPathTemplate: "{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}",

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    // Webkit can be added later if needed
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
  ],

  // Run local dev server before starting tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },

  // Timeouts
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
    // Visual regression testing configuration
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,    // 1% diff allowed
      threshold: 0.2,              // Color difference tolerance (YIQ space, default)
      animations: "disabled",      // Disable CSS animations/transitions
    },
  },
});
