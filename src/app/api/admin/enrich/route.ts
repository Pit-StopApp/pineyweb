import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findBusinessEmail } from "@/lib/email-enrichment";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function POST(req: NextRequest) {
  try {
    const { prospect_ids } = await req.json();
    if (!prospect_ids || !Array.isArray(prospect_ids)) {
      return NextResponse.json({ error: "prospect_ids array required" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: prospects } = await supabase
      .from("pineyweb_prospects")
      .select("id, business_name, address, city, phone, email")
      .in("id", prospect_ids)
      .is("email", null);

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ enriched: 0, failed: 0, skipped: prospect_ids.length, total: prospect_ids.length });
    }

    let enriched = 0;
    let failed = 0;

    for (let i = 0; i < prospects.length; i += 5) {
      const batch = prospects.slice(i, i + 5);
      await Promise.all(
        batch.map(async (prospect) => {
          const { email, source } = await findBusinessEmail(prospect.business_name, prospect.address || "", prospect.city || "", prospect.phone);
          if (email) {
            await supabase.from("pineyweb_prospects").update({ email, email_source: source }).eq("id", prospect.id);
            enriched++;
          } else {
            failed++;
          }
        })
      );
      if (i + 5 < prospects.length) await new Promise(r => setTimeout(r, 500));
    }

    return NextResponse.json({ enriched, failed, skipped: prospect_ids.length - prospects.length, total: prospect_ids.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
