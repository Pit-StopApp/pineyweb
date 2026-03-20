import { test, expect } from "@playwright/test";

test.describe("Auth gates", () => {
  test("unauthenticated user visiting /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user visiting /admin/clients redirects to /login", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });

  test("non-admin user visiting /admin/clients redirects to /dashboard", async ({ page }) => {
    const email = process.env.TEST_CLIENT_EMAIL!;
    const password = process.env.TEST_CLIENT_PASSWORD!;
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForTimeout(2000);
    await page.goto("/admin/clients");
    await page.waitForURL("**/dashboard**");
    expect(page.url()).toContain("/dashboard");
  });

  test("admin user visiting /admin/clients lands successfully", async ({ page }) => {
    const email = process.env.TEST_ADMIN_EMAIL!;
    const password = process.env.TEST_ADMIN_PASSWORD!;
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForTimeout(2000);
    await page.goto("/admin/clients");
    await page.waitForSelector("text=Client Management", { timeout: 10000 });
    expect(page.url()).toContain("/admin/clients");
  });
});
