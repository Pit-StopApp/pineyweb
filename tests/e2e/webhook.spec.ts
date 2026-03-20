import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL = "webhook-test@pineyweb-test.com";
const TEST_NAME = "Webhook Test Client";
const TEST_CUSTOMER_ID = "cus_test_webhook_" + Date.now();

test.describe("Payment to activation flow", () => {
  test("invoice.paid webhook creates order and populates stripe_customer_id", async ({ request }) => {
    const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY!);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_PINEYWEB!;

    // Build a test invoice.paid payload
    const payload = JSON.stringify({
      id: "evt_test_" + Date.now(),
      type: "invoice.paid",
      data: {
        object: {
          id: "in_test_" + Date.now(),
          customer: TEST_CUSTOMER_ID,
          customer_email: TEST_EMAIL,
          customer_name: TEST_NAME,
          amount_paid: 79900,
          status: "paid",
          status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
          lines: {
            data: [
              {
                price: { id: "price_1TCsURCl3mxbQo5hl7x27gRK" },
                description: "One-Time Website Build",
              },
            ],
          },
        },
      },
    });

    // Sign the payload
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const crypto = await import("crypto");
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");
    const stripeSignature = `t=${timestamp},v1=${signature}`;

    // POST to webhook
    const response = await request.post("/api/webhooks/stripe", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripeSignature,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);

    // Verify order in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order } = await supabase
      .from("pineyweb_orders")
      .select("*")
      .eq("email", TEST_EMAIL)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(order).toBeTruthy();
    expect(order!.confirmation_number).toMatch(/^PW-\d{4}-[A-Z]$/);
    expect(order!.email).toBe(TEST_EMAIL);
    expect(order!.tier).toBe("one_time");
    expect(order!.status).toBe("pending");

    // Verify stripe_customer_id populated on client (if row exists)
    const { data: client } = await supabase
      .from("pineyweb_clients")
      .select("stripe_customer_id")
      .eq("email", TEST_EMAIL)
      .single();

    if (client) {
      expect(client.stripe_customer_id).toBe(TEST_CUSTOMER_ID);
    }

    // Cleanup
    await supabase.from("pineyweb_orders").delete().eq("email", TEST_EMAIL);
  });
});
