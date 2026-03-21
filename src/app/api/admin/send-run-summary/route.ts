import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function POST(req: NextRequest) {
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

  const { cities_scanned, emails_sent, daily_cap, results } = await req.json();

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const totalProspects = (results || []).reduce((a: number, r: { prospects: number }) => a + r.prospects, 0);

  await resend.emails.send({
    from: "Piney Web Bot <noreply@pineyweb.com>",
    to: "hello@pineyweb.com",
    subject: `Daily Scan Complete — ${emails_sent} emails sent across ${cities_scanned} cities`,
    html: `
      <p style="font-family:Georgia,serif;font-size:16px;">
        <strong>Daily Scan Complete — ${new Date().toLocaleDateString()}</strong><br/><br/>
        Cities scanned: ${cities_scanned}<br/>
        New prospects saved to CRM: ${totalProspects}<br/>
        Emails sent today: ${emails_sent} / ${daily_cap}<br/><br/>
        ${(results || []).map((r: { city: string; prospects: number; emails_found: number; emails_sent: number }) =>
          `&bull; ${r.city}: ${r.prospects} prospects, ${r.emails_found} emails found, ${r.emails_sent} sent`
        ).join("<br/>")}
        <br/><br/>
        <a href="https://pineyweb.com/admin/prospects">View Prospects &rarr;</a>&nbsp;&nbsp;
        <a href="https://pineyweb.com/admin/queue">View Queue &rarr;</a>
      </p>
    `,
  });

  return NextResponse.json({ sent: true });
}
