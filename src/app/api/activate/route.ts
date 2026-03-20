import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { confirmationNumber, userId } = await request.json();

    if (!confirmationNumber || !userId) {
      return NextResponse.json({ error: "Confirmation number and user ID required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up order by confirmation number (case insensitive)
    const { data: order, error: orderError } = await supabase
      .from("pineyweb_orders")
      .select("*")
      .ilike("confirmation_number", confirmationNumber.trim())
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Confirmation number not found. Please check your invoice email or contact support." }, { status: 404 });
    }

    // Update pineyweb_clients: set active, copy tier/site_url from order
    const clientUpdates: Record<string, unknown> = { status: "active" };
    if (order.tier) clientUpdates.tier = order.tier;
    if (order.site_url) clientUpdates.site_url = order.site_url;

    const { error: clientError } = await supabase
      .from("pineyweb_clients")
      .update(clientUpdates)
      .eq("user_id", userId);

    if (clientError) {
      return NextResponse.json({ error: "Failed to activate account. Please contact support." }, { status: 500 });
    }

    // Link order to user
    await supabase
      .from("pineyweb_orders")
      .update({ user_id: userId })
      .eq("id", order.id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
