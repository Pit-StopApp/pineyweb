import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const prospect of prospects) {
      if (!prospect.email || !prospect.place_id) {
        errors.push(`${prospect.business_name}: missing email or place_id`);
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
          tags: [
            { name: "place_id", value: prospect.place_id },
            { name: "business_name", value: (prospect.business_name || "").substring(0, 50) },
            { name: "city", value: prospect.city || "" },
            { name: "priority_tier", value: String(prospect.priority_tier || 2) },
            { name: "address", value: (prospect.address || "").substring(0, 50) },
            { name: "phone", value: prospect.phone || "" },
            { name: "email_source", value: prospect.email_source || "" },
            { name: "rating", value: String(prospect.rating || 0) },
            { name: "review_count", value: String(prospect.review_count || 0) },
          ],
          variables: {
            firstName: prospect.business_name.split(" ")[0],
            businessName: prospect.business_name,
            reviewCount: String(prospect.review_count || 0),
            portfolioUrl: "https://pineyweb.com#work",
            unsubscribeUrl: `https://pineyweb.com/unsubscribe?id=${prospect.place_id}`,
          },
        });
        // No CRM update here — wait for delivery confirmation via Resend webhook
        sent++;
      } catch (err) {
        errors.push(`${prospect.business_name}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }

      if (prospects.length > 1) await sleep(200);
    }

    return NextResponse.json({ sent, failed, errors });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
