import { test, expect } from "@playwright/test";

test.describe("Public legal pages", () => {
  test("/privacy shows Privacy Policy", async ({ page }) => {
    await page.goto("/privacy");
    const heading = page.locator("h1:has-text('Privacy Policy')");
    await expect(heading).toBeVisible();
    const backLink = page.locator("a:has-text('Back to Home')");
    await expect(backLink).toBeVisible();
  });

  test("/terms shows Terms of Service", async ({ page }) => {
    await page.goto("/terms");
    const heading = page.locator("h1:has-text('Terms of Service')");
    await expect(heading).toBeVisible();
    const backLink = page.locator("a:has-text('Back to Home')");
    await expect(backLink).toBeVisible();
  });
});
