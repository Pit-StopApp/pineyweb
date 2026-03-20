import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }
function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const supabase = getSupabase();
    const { data: client } = await supabase.from("pineyweb_clients").select("stripe_customer_id").eq("user_id", userId).single();

    const stripeCustomerId = client?.stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json({ paymentMethod: null, invoices: [] });
    }

    const stripe = getStripe();

    // Fetch default payment method
    let paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null = null;
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer;
      const pmId = typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id;
      if (pmId) {
        const pm = await stripe.paymentMethods.retrieve(pmId);
        if (pm.card) {
          paymentMethod = { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
        }
      }
    } catch { /* no payment method */ }

    // Fetch invoices
    let invoices: { date: string; description: string; amount: string; status: string; pdfUrl: string | null }[] = [];
    try {
      const stripeInvoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 20 });
      invoices = stripeInvoices.data.map((inv) => ({
        date: new Date((inv.created || 0) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        description: inv.lines.data[0]?.description || "Payment",
        amount: `$${((inv.amount_paid || 0) / 100).toFixed(2)}`,
        status: inv.status || "unknown",
        pdfUrl: inv.invoice_pdf || null,
      }));
    } catch { /* no invoices */ }

    return NextResponse.json({ paymentMethod, invoices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
