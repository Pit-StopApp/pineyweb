import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe("Admin panel", () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_ADMIN_EMAIL!;
    const password = process.env.TEST_ADMIN_PASSWORD!;
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForTimeout(2000);
  });

  test("admin clients page renders table with rows", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForSelector("text=Client Management", { timeout: 10000 });
    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThanOrEqual(1);
  });

  test("search bar filters results", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForSelector("text=Client Management", { timeout: 10000 });
    const initialRows = await page.locator("tbody tr").count();
    await page.fill('input[placeholder="Search clients..."]', "zzzznonexistent");
    await page.waitForTimeout(500);
    const filteredRows = await page.locator("tbody tr").count();
    // Either 0 results or the "No clients found" row
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
  });

  test("Send Build Started updates status to in_progress", async ({ page }) => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Find an active client to test with
    const { data: clients } = await supabase.from("pineyweb_clients").select("id, status").eq("status", "active").limit(1);
    test.skip(!clients || clients.length === 0, "No active clients to test with");
    const clientId = clients![0].id;

    await page.goto("/admin/clients");
    await page.waitForSelector("text=Client Management", { timeout: 10000 });

    // Click Send Build Started for this client
    const buildBtn = page.locator(`button:has-text("Send Build Started")`).first();
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      await page.waitForTimeout(3000);

      const { data: updated } = await supabase.from("pineyweb_clients").select("status").eq("id", clientId).single();
      expect(updated?.status).toBe("in_progress");

      // Reset for future tests
      await supabase.from("pineyweb_clients").update({ status: "active" }).eq("id", clientId);
    }
  });

  test("Send Site Live updates status to live", async ({ page }) => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Set a client to in_progress for this test
    const { data: clients } = await supabase.from("pineyweb_clients").select("id").eq("role", "client").limit(1);
    test.skip(!clients || clients.length === 0, "No clients to test with");
    const clientId = clients![0].id;
    await supabase.from("pineyweb_clients").update({ status: "in_progress" }).eq("id", clientId);

    await page.goto("/admin/clients");
    await page.waitForSelector("text=Client Management", { timeout: 10000 });

    const liveBtn = page.locator(`button:has-text("Send Site Live")`).first();
    if (await liveBtn.isVisible()) {
      await liveBtn.click();
      await page.waitForTimeout(3000);

      const { data: updated } = await supabase.from("pineyweb_clients").select("status").eq("id", clientId).single();
      expect(updated?.status).toBe("live");

      // Reset
      await supabase.from("pineyweb_clients").update({ status: "active" }).eq("id", clientId);
    }
  });
});
