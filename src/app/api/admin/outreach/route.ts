import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { COLD_OUTREACH_HTML } from "@/lib/emails/cold-outreach";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getFirstName(businessName: string): string {
  const cleaned = businessName
    .replace(/^the\s+/i, "")
    .replace(/^a\s+/i, "")
    .replace(/^an\s+/i, "");
  return cleaned.split(" ")[0];
}

interface Prospect {
  place_id: string;
  business_name: string;
  email: string;
  email_source: string | null;
  address: string;
  city: string;
  phone: string | null;
  rating: number | null;
  review_count: number;
  priority_tier: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prospects: Prospect[] = Array.isArray(body.prospects) ? body.prospects : [body];

    if (prospects.length > 50) {
      return NextResponse.json({ error: "Max 50 emails per call" }, { status: 400 });
    }

    const resend = getResend();
    const supabase = getSupabase();

    // Deduplicate: filter out email addresses already sent to
    const { data: alreadyEmailed } = await supabase
      .from("pineyweb_prospects")
      .select("email")
      .not("emailed_at", "is", null);
    const emailedAddresses = new Set(alreadyEmailed?.map(p => p.email?.toLowerCase()).filter(Boolean) ?? []);

    // Also deduplicate within the batch itself (keep first occurrence)
    const seenInBatch = new Set<string>();
    const uniqueProspects = prospects.filter(p => {
      const lower = p.email?.toLowerCase();
      if (!lower || emailedAddresses.has(lower) || seenInBatch.has(lower)) return false;
      seenInBatch.add(lower);
      return true;
    });

    let sent = 0;
    let failed = 0;
    const skipped = prospects.length - uniqueProspects.length;
    const errors: string[] = [];

    for (const prospect of uniqueProspects) {
      if (!prospect.email || !prospect.place_id) {
        errors.push(`${prospect.business_name}: missing email or place_id`);
        failed++;
        continue;
      }

      try {
        const firstName = getFirstName(prospect.business_name);
        const personalizedHtml = COLD_OUTREACH_HTML
          .replace(/\{\{firstName\}\}/g, firstName)
          .replace(/\{\{businessName\}\}/g, prospect.business_name)
          .replace(/\{\{reviewCount\}\}/g, String(prospect.review_count || 0))
          .replace(/\{\{portfolioUrl\}\}/g, "https://pineyweb.com/#work")
          .replace(/\{\{unsubscribeUrl\}\}/g, `https://pineyweb.com/unsubscribe?id=${prospect.place_id}`);

        console.log("[Outreach] Sending to:", prospect.email);
        console.log("[Outreach] From: Dustin Hartman <hello@pineyweb.com>");
        console.log("[Outreach] Subject:", `${prospect.review_count} reviews and no website yet?`);
        console.log("[Outreach] HTML length:", personalizedHtml.length);

        const result = await resend.emails.send({
          from: "Dustin Hartman <hello@pineyweb.com>",
          to: prospect.email,
          subject: `${prospect.review_count} reviews and no website yet?`,
          html: personalizedHtml,
        });

        if (result.error) {
          console.error("[Outreach] Resend error:", JSON.stringify(result.error));
          errors.push(`${prospect.business_name}: ${JSON.stringify(result.error)}`);
          failed++;
        } else {
          console.log("[Outreach] Sent successfully, id:", result.data?.id);
          // Set emailed_at immediately on ALL prospects sharing this email address
          await supabase
            .from("pineyweb_prospects")
            .update({ emailed_at: new Date().toISOString() })
            .filter("email", "ilike", prospect.email);
          sent++;
        }
      } catch (err) {
        errors.push(`${prospect.business_name}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }

      if (prospects.length > 1) await sleep(200);
    }

    return NextResponse.json({ sent, failed, skipped, errors });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
