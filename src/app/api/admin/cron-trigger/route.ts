import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function GET(req: NextRequest) {
  // Verify authenticated admin
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.get("authorization") || "" } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminSupabase = getSupabase();
  const { data: me } = await adminSupabase.from("pineyweb_clients").select("role").eq("user_id", user.id).single();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Call auto-scan with server-side CRON_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pineyweb.com";
  const res = await fetch(`${appUrl}/api/cron/auto-scan`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const data = await res.json();

  return NextResponse.json(data);
}
