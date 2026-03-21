import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findBusinessEmail(businessName: string, address: string, city: string, phone: string | null): Promise<{ email: string | null; source: string | null }> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { email: null, source: null };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `You are a business contact finder. Search extensively for the public email address of the business provided. Check their Facebook page, Yelp listing, BBB profile, Google Business profile, Instagram bio, Nextdoor, local chamber of commerce directories, and any other public listings. Try multiple search queries. Return ONLY a valid JSON object with no markdown: {"email": "found@email.com", "source": "Facebook"} or {"email": null, "source": null} if not found after thorough searching. Never guess or fabricate.`,
        messages: [{ role: "user", content: `Find the public contact email for: ${businessName}, located at ${address}, ${city}, TX${phone ? `, phone: ${phone}` : ""}` }],
      }),
    });
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return { email: null, source: null }; }
}

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
