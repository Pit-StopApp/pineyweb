import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY); }

export async function POST(request: NextRequest) {
  try {
    const { confirmationNumber, userId } = await request.json();
    if (!confirmationNumber || !userId) {
      return NextResponse.json({ error: "Confirmation number and user ID required" }, { status: 400 });
    }

    const supabase = getSupabase();

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

    await supabase.from("pineyweb_orders").update({ status: "active", user_id: userId }).eq("id", order.id);

    const clientUpdates: Record<string, unknown> = { status: "active" };
    if (order.tier) clientUpdates.tier = order.tier === "managed" ? "Managed" : "One-Time";
    if (order.site_url) clientUpdates.site_url = order.site_url;

    const { error: clientError } = await supabase
      .from("pineyweb_clients")
      .update(clientUpdates)
      .eq("user_id", userId);

    if (clientError) {
      return NextResponse.json({ error: "Failed to activate account. Please contact support." }, { status: 500 });
    }

    try {
      const { data: client } = await supabase.from("pineyweb_clients").select("full_name, email").eq("user_id", userId).single();
      if (client?.email) {
        const firstName = client.full_name?.split(" ")[0] || "there";
        await getResend().emails.send({
          from: "Piney Web Co. <noreply@pineyweb.com>",
          to: client.email,
          subject: "Your Piney Web Co. Account is Active!",
          // @ts-expect-error Resend template API fields
          template_id: "3c081e26-96b0-4f06-8349-6158e5e6c955",
          variables: { firstName },
        });
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
