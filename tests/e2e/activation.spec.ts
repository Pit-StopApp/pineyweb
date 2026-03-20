import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe("/activate flow", () => {
  const TEST_CONFIRMATION = "PW-TEST-A";
  const TEST_EMAIL = "activation-test@pineyweb-test.com";

  test.beforeAll(async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    // Seed a test order
    await supabase.from("pineyweb_orders").delete().eq("email", TEST_EMAIL);
    await supabase.from("pineyweb_orders").insert({
      confirmation_number: TEST_CONFIRMATION,
      email: TEST_EMAIL,
      tier: "one_time",
      status: "pending",
    });
  });

  test.afterAll(async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.from("pineyweb_orders").delete().eq("email", TEST_EMAIL);
  });

  test("entering valid confirmation number activates account", async ({ page }) => {
    // Log in as test client first
    const email = process.env.TEST_CLIENT_EMAIL!;
    const password = process.env.TEST_CLIENT_PASSWORD!;
    await page.goto("/login?redirect=/activate");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click("button:has-text('Log In')");
    await page.waitForURL("**/activate**", { timeout: 10000 });

    // Enter confirmation number
    await page.fill('input[placeholder="e.g. PW-8829-X"]', TEST_CONFIRMATION);
    await page.click("button:has-text('Activate Account')");

    // Should redirect to dashboard on success
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    expect(page.url()).toContain("/dashboard");

    // Verify in DB
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from("pineyweb_orders").select("status").eq("confirmation_number", TEST_CONFIRMATION).single();
    expect(order?.status).toBe("active");
  });
});
