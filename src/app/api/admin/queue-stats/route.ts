import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function GET() {
  const supabase = getSupabase();

  const { data: queue } = await supabase
    .from("pineyweb_scanner_queue")
    .select("*")
    .order("distance_from_longview_miles", { ascending: true });

  const today = new Date().toISOString().split("T")[0];
  const { data: tracker } = await supabase
    .from("pineyweb_daily_send_tracker")
    .select("emails_sent, daily_cap")
    .eq("date", today)
    .single();

  return NextResponse.json({
    queue: queue || [],
    emailsToday: tracker?.emails_sent ?? 0,
    dailyCap: tracker?.daily_cap ?? 50,
  });
}
