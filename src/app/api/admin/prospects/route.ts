import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase.from("pineyweb_prospects").select("*", { count: "exact" }).order("priority_tier", { ascending: true }).order("created_at", { ascending: false });
  if (status && status !== "all") query = query.eq("outreach_status", status);

  // Supabase JS defaults to LIMIT 1000 — fetch all rows in pages
  const allData: Record<string, unknown>[] = [];
  let from = 0;
  const PAGE = 1000;
  let totalCount = 0;

  while (true) {
    const { data: page, error, count } = await query.range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (count !== null) totalCount = count;
    if (!page || page.length === 0) break;
    allData.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ data: allData, count: totalCount });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const body = await request.json();
  const { error } = await supabase.from("pineyweb_prospects").upsert(body, { onConflict: "place_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  updates.updated_at = new Date().toISOString();
  const { error } = await supabase.from("pineyweb_prospects").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
