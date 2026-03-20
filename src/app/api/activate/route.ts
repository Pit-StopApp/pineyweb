import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { render } from "@react-email/components";
import AccountActivated from "@/emails/AccountActivated";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY); }

export async function POST(request: NextRequest) {
  try {
    const { confirmationNumber, userId } = await request.json();
    if (!confirmationNumber || !userId) {
      return NextResponse.json({ error: "Confirmation number and user ID required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Look up order
    const { data: order, error: orderError } = await supabase
      .from("pineyweb_orders")
      .select("*")
      .ilike("confirmation_number", confirmationNumber.trim())
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Confirmation number not found. Please check your invoice email or contact support." }, { status: 404 });
    }

    if (order.status === "active") {
      return NextResponse.json({ error: "This confirmation number has already been used." }, { status: 400 });
    }

    // Update order status
    await supabase.from("pineyweb_orders").update({ status: "active", user_id: userId }).eq("id", order.id);

    // Update client: match by email from order
    const clientUpdates: Record<string, unknown> = { status: "active" };
    if (order.tier) clientUpdates.tier = order.tier === "managed" ? "Managed" : "One-Time";
    if (order.site_url) clientUpdates.site_url = order.site_url;

    // Try matching by user_id first, then by email
    const { error: clientError } = await supabase
      .from("pineyweb_clients")
      .update(clientUpdates)
      .eq("user_id", userId);

    if (clientError) {
      return NextResponse.json({ error: "Failed to activate account. Please contact support." }, { status: 500 });
    }

    // Send activation email
    try {
      const { data: client } = await supabase.from("pineyweb_clients").select("full_name, email").eq("user_id", userId).single();
      if (client?.email) {
        const firstName = client.full_name?.split(" ")[0] || "there";
        const html = await render(AccountActivated({ firstName }));
        await getResend().emails.send({
          from: "Piney Web Co. <noreply@pineyweb.com>",
          to: client.email,
          subject: "Your Piney Web Co. Account is Active!",
          html,
        });
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
