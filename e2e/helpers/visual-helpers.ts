import { Page, Locator } from '@playwright/test';

// Viewport definitions per CONTEXT.md
export const viewports = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 768, height: 1024 },  // iPad portrait
  mobile: { width: 375, height: 667 },   // iPhone SE
} as const;

export type ViewportName = keyof typeof viewports;

// Common elements to mask in screenshots
export function commonMasks(page: Page): Locator[] {
  return [
    page.locator('[data-testid="timestamp"]'),
    page.locator('[data-testid="lobby-code"]'),
    page.locator('canvas'),  // 3D battle scene - mask entirely
  ];
}

// Wait for UI to stabilize before screenshot
export async function waitForStableUI(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Additional wait for any animations to complete
  await page.waitForTimeout(500);
}

// Screenshot options with defaults
export function screenshotOptions(page: Page, additionalMasks: Locator[] = []) {
  return {
    mask: [...commonMasks(page), ...additionalMasks],
    stylePath: './e2e/styles/visual-test.css',
  };
}
