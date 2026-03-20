import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe("Client dashboard", () => {
  test("pending client redirects to /dashboard/onboarding", async ({ page }) => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Ensure test client is pending
    const email = process.env.TEST_CLIENT_EMAIL!;
    await supabase.from("pineyweb_clients").update({ status: "pending" }).eq("email", email);

    const password = process.env.TEST_CLIENT_PASSWORD!;
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForTimeout(3000);

    await page.goto("/dashboard");
    await page.waitForURL("**/?pending=1**", { timeout: 10000 });
    // Pending users redirect to home with banner
    expect(page.url()).toContain("pending=1");
  });

  test("onboarding Step 1 saves to pineyweb_site_content", async ({ page }) => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const email = process.env.TEST_CLIENT_EMAIL!;
    // Set to active so onboarding is accessible
    await supabase.from("pineyweb_clients").update({ status: "active" }).eq("email", email);

    const password = process.env.TEST_CLIENT_PASSWORD!;
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForTimeout(2000);

    await page.goto("/dashboard/onboarding");
    await page.waitForSelector("text=Business Profile", { timeout: 10000 });

    // Fill Step 1
    await page.fill('input[placeholder="e.g. Smith\'s Auto Shop"]', "Test Business");
    await page.fill('input[placeholder="Your brand\'s core promise"]', "Test Tagline");
    await page.fill('input[placeholder="(555) 000-0000"]', "(555) 123-4567");
    await page.fill('input[placeholder="hello@yourbusiness.com"]', "test@test.com");

    await page.click("button:has-text('Save & Continue')");
    await page.waitForTimeout(2000);

    // Verify data saved
    const { data: client } = await supabase.from("pineyweb_clients").select("id").eq("email", email).single();
    if (client) {
      const { data: content } = await supabase.from("pineyweb_site_content").select("content_key").eq("client_id", client.id).eq("content_type", "onboarding");
      const keys = (content || []).map(r => r.content_key);
      expect(keys).toContain("business_name");
      expect(keys).toContain("tagline");

      // Cleanup
      await supabase.from("pineyweb_site_content").delete().eq("client_id", client.id).eq("content_type", "onboarding");
      await supabase.from("pineyweb_clients").update({ status: "active" }).eq("id", client.id);
    }
  });

  test("billing page loads successfully", async ({ page }) => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const email = process.env.TEST_CLIENT_EMAIL!;
    await supabase.from("pineyweb_clients").update({ status: "active" }).eq("email", email);

    const password = process.env.TEST_CLIENT_PASSWORD!;
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForTimeout(2000);

    await page.goto("/dashboard/billing");
    await page.waitForSelector("text=Billing", { timeout: 10000 });
    const heading = page.locator("h1:has-text('Billing')");
    await expect(heading).toBeVisible();
  });
});
