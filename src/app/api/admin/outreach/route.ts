import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Prospect {
  id: string;
  business_name: string;
  email: string;
  review_count: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prospects: Prospect[] = Array.isArray(body.prospects) ? body.prospects : [body];

    if (prospects.length > 50) {
      return NextResponse.json({ error: "Max 50 emails per call" }, { status: 400 });
    }

    const supabase = getSupabase();
    const resend = getResend();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const prospect of prospects) {
      if (!prospect.email || !prospect.id) {
        errors.push(`${prospect.business_name}: missing email or id`);
        failed++;
        continue;
      }

      try {
        await resend.emails.send({
          from: "Dustin Hartman <hello@pineyweb.com>",
          to: prospect.email,
          subject: `${prospect.review_count} reviews and no website yet?`,
          // @ts-expect-error Resend template API fields
          template_id: "c61d6c30-11af-4c99-b9ef-2e6c74af25ea",
          variables: {
            firstName: prospect.business_name.split(" ")[0],
            businessName: prospect.business_name,
            reviewCount: String(prospect.review_count || 0),
            portfolioUrl: "https://pineyweb.com#work",
            unsubscribeUrl: `https://pineyweb.com/unsubscribe?id=${prospect.id}`,
          },
        });

        await supabase
          .from("pineyweb_prospects")
          .update({
            outreach_status: "contacted",
            contact_method: "Email",
            emailed_at: new Date().toISOString(),
          })
          .eq("id", prospect.id);

        sent++;
      } catch (err) {
        errors.push(`${prospect.business_name}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }

      // Rate limit delay
      if (prospects.length > 1) await sleep(200);
    }

    return NextResponse.json({ sent, failed, errors });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
