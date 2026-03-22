import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildScannerLeadsEmail } from "@/lib/emails/scanner-leads-delivery";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { to, clientName, city, totalLeads, tier1Leads, tier2Leads, xlsxBase64, fileName } = await req.json();

    if (!to || !city || !xlsxBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const html = buildScannerLeadsEmail({
      clientName: clientName || "there",
      city,
      totalLeads: totalLeads || 0,
      tier1Leads: tier1Leads || 0,
      tier2Leads: tier2Leads || 0,
    });

    const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const { error } = await resend.emails.send({
      from: "Dustin at Piney Web <hello@pineyweb.com>",
      to: [to],
      subject: `Your Sip Society leads for ${city} — ${date}`,
      html,
      attachments: [
        {
          filename: fileName || `sip-society-leads-${city.toLowerCase().replace(/\s+/g, "-")}.xlsx`,
          content: xlsxBase64,
        },
      ],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
