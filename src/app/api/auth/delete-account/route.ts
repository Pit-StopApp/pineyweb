import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }

export async function POST(request: NextRequest) {
  try {
    const { userId, clientId, email } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const supabase = getSupabase();

    // Delete site content
    if (clientId) await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId);
    // Delete client row
    await supabase.from("pineyweb_clients").delete().eq("user_id", userId);
    // Delete orders
    if (email) await supabase.from("pineyweb_orders").delete().eq("email", email);
    // Delete auth user
    await supabase.auth.admin.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
