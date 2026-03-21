import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("pineyweb_clients")
      .select("full_name, business_name, email, status, site_url, tier")
      .eq("user_id", userId)
      .single();

    if (error) return NextResponse.json({ error: error.message, data: null });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err), data: null }, { status: 500 });
  }
}
