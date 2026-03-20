import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY); }
function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }

const PRICE_MAP: Record<string, string> = {
  price_1TCsURCl3mxbQo5hl7x27gRK: "ONE_TIME_BUILD",
  price_1TCsYTCl3mxbQo5h3BS77kqT: "MANAGED_SETUP",
  price_1TCslFCl3mxbQo5h1muouhI8: "MANAGED_MONTHLY",
  price_1TCsYzCl3mxbQo5hT4mkWIrs: "Booking Calendar",
  price_1TCsZoCl3mxbQo5hH2eCnPrt: "Photo Gallery",
  price_1TCsaCCl3mxbQo5hQW6aHACx: "Google Reviews",
  price_1TCsaYCl3mxbQo5haJ9PJV9u: "Email Newsletter",
  price_1TCsatCl3mxbQo5hDI7B5ogt: "Basic E-commerce",
  price_1TCsbGCl3mxbQo5h7In95RBB: "Logo Design",
  price_1TCsbZCl3mxbQo5hGEJ7BQbH: "SEO Setup",
  price_1TCsgCCl3mxbQo5hoxxytrza: "Custom Intake Form",
};

async function generateConfirmationNumber(): Promise<string> {
  const sb = getSupabase();
  const { count } = await sb.from("pineyweb_orders").select("*", { count: "exact", head: true });
  const num = String((count || 0) + 1).padStart(4, "0");
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `PW-${num}-${letter}`;
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabase = getSupabase();

  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET_PINEYWEB!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[Stripe Webhook] Signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const fullSession = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items.data.price"] });
    const lineItems = fullSession.line_items?.data || [];

    const productNames: string[] = [];
    let isManaged = false;
    for (const item of lineItems) {
      const priceId = (item.price as Stripe.Price)?.id;
      const mapped = priceId ? PRICE_MAP[priceId] : null;
      if (mapped === "MANAGED_SETUP") isManaged = true;
      if (mapped && mapped !== "ONE_TIME_BUILD" && mapped !== "MANAGED_SETUP" && mapped !== "MANAGED_MONTHLY") {
        productNames.push(mapped);
      }
    }

    const tier = isManaged ? "managed" : "one_time";
    const email = session.customer_details?.email || session.customer_email || "";
    const firstName = session.customer_details?.name?.split(" ")[0] || "there";
    const confirmationNumber = await generateConfirmationNumber();

    await supabase.from("pineyweb_orders").insert({
      confirmation_number: confirmationNumber,
      email,
      tier,
      addons: productNames,
      status: "pending",
    });

    try {
      const resend = getResend();
      await resend.emails.send({
        from: "Piney Web Co. <noreply@pineyweb.com>",
        to: email,
        subject: `Order Confirmed — ${confirmationNumber}`,
        // @ts-expect-error Resend template API fields
        template_id: "3aa394e5-f6d0-42e4-88ff-6596b6ee787b",
        variables: { firstName, confirmationNumber },
      });
    } catch (emailErr) {
      console.error("[Stripe Webhook] Email send failed:", emailErr);
    }
  }

  return NextResponse.json({ received: true });
}
