import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const resend = getResend();

  // Find clients suspended exactly 10 days ago
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const start = new Date(tenDaysAgo);
  start.setHours(0, 0, 0, 0);
  const end = new Date(tenDaysAgo);
  end.setHours(23, 59, 59, 999);

  const { data: suspendedClients } = await supabase
    .from("pineyweb_clients")
    .select("full_name, email, site_url")
    .eq("status", "suspended")
    .gte("suspended_at", start.toISOString())
    .lte("suspended_at", end.toISOString());

  if (!suspendedClients || suspendedClients.length === 0) {
    return NextResponse.json({ message: "No clients at 10 day mark" });
  }

  for (const client of suspendedClients) {
    await resend.emails.send({
      from: "Piney Web Co. <noreply@pineyweb.com>",
      to: "hello@pineyweb.com",
      subject: `10-day payment reminder — ${client.full_name}`,
      html: `
        <p style="font-family:Georgia,serif;font-size:16px;">
          <strong>${client.full_name}</strong> (${client.email}) has been suspended for 10 days.<br/><br/>
          Per your terms of service, you may now consider permanent termination of services.<br/><br/>
          Site: ${client.site_url || "Not set"}<br/><br/>
          <a href="https://pineyweb.com/admin/clients">View in Admin Panel</a>
        </p>
      `,
    });
  }

  return NextResponse.json({ message: `Sent ${suspendedClients.length} reminder(s)` });
}
