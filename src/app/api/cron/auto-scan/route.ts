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
  const today = new Date().toISOString().split("T")[0];

  // Check daily cap
  const { data: tracker } = await supabase.from("pineyweb_daily_send_tracker").select("emails_sent, daily_cap").eq("date", today).single();
  const emailsSentToday = tracker?.emails_sent ?? 0;
  const dailyCap = tracker?.daily_cap ?? 50;

  if (dailyCap === 0) {
    return NextResponse.json({ message: "Sending paused (daily_cap = 0).", sent_today: emailsSentToday });
  }

  if (emailsSentToday >= dailyCap) {
    return NextResponse.json({ message: `Daily cap of ${dailyCap} reached.`, sent_today: emailsSentToday });
  }

  // Get next pending city (closest first)
  const { data: cities } = await supabase
    .from("pineyweb_scanner_queue")
    .select("*")
    .eq("status", "pending")
    .order("distance_from_longview_miles", { ascending: true })
    .limit(1);

  if (!cities || cities.length === 0) {
    return NextResponse.json({ message: "All cities scanned. Queue exhausted.", emails_sent_today: emailsSentToday, daily_cap: dailyCap });
  }

  const city = cities[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pineyweb.com";
  let emailsSentThisCity = 0;
  let prospectsFound = 0;
  let emailsFound = 0;

  // Mark as scanning
  await supabase.from("pineyweb_scanner_queue").update({ status: "scanning" }).eq("id", city.id);

  try {
    // Run keyword scanner batches
    let batch = 0, done = false;
    while (!done) {
      const res = await fetch(`${appUrl}/api/admin/scanner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.city, state: "TX", mode: "keywords", batch }),
      });
      const data = await res.json();
      prospectsFound += data.stats?.new_prospects ?? 0;
      emailsFound += data.stats?.emails_found ?? 0;
      done = data.done;
      batch = data.nextBatch ?? batch + 1;
    }

    // Run type searches
    batch = 0; done = false;
    while (!done) {
      const res = await fetch(`${appUrl}/api/admin/scanner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.city, state: "TX", mode: "types", batch }),
      });
      const data = await res.json();
      prospectsFound += data.stats?.new_prospects ?? 0;
      emailsFound += data.stats?.emails_found ?? 0;
      done = data.done;
      batch = data.nextBatch ?? batch + 1;
    }

    // Send outreach to new prospects with emails (up to remaining cap)
    const remainingCap = dailyCap - emailsSentToday;
    if (emailsFound > 0 && remainingCap > 0) {
      const { data: newProspects } = await supabase
        .from("pineyweb_prospects")
        .select("place_id, business_name, email, email_source, city, phone, rating, review_count, priority_tier")
        .eq("city", city.city)
        .is("emailed_at", null)
        .not("email", "is", null)
        .limit(remainingCap);

      if (newProspects && newProspects.length > 0) {
        const outRes = await fetch(`${appUrl}/api/admin/outreach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospects: newProspects.map(p => ({ ...p, address: "" })) }),
        });
        const outData = await outRes.json();
        emailsSentThisCity = outData.sent ?? 0;
      }
    }

    // Mark city complete
    await supabase.from("pineyweb_scanner_queue").update({
      status: "complete", last_scanned_at: new Date().toISOString(),
      prospects_found: prospectsFound, emails_found: emailsFound, emails_sent: emailsSentThisCity,
    }).eq("id", city.id);
  } catch (error) {
    console.error(`[AutoScan] Error scanning ${city.city}:`, error);
    await supabase.from("pineyweb_scanner_queue").update({ status: "error" }).eq("id", city.id);
  }

  // Update daily tracker
  const newEmailsToday = emailsSentToday + emailsSentThisCity;
  await supabase.from("pineyweb_daily_send_tracker").upsert({ date: today, emails_sent: newEmailsToday, daily_cap: dailyCap }, { onConflict: "date" });

  // Summary email
  if (emailsSentThisCity > 0 || prospectsFound > 0) {
    try {
      const resend = getResend();
      await resend.emails.send({
        from: "Piney Web Bot <noreply@pineyweb.com>",
        to: "hello@pineyweb.com",
        subject: `Auto-Scan — ${city.city}: ${emailsSentThisCity} emails sent`,
        html: `<p style="font-family:Georgia,serif;font-size:16px;"><strong>Auto-Scan — ${city.city}</strong><br/><br/>Prospects found: ${prospectsFound}<br/>Emails found: ${emailsFound}<br/>Emails sent: ${emailsSentThisCity}<br/>Daily total: ${newEmailsToday} / ${dailyCap}<br/><br/><a href="https://pineyweb.com/admin/queue">View Queue →</a></p>`,
      });
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({
    current_city: city.city,
    prospects_found: prospectsFound,
    emails_found: emailsFound,
    emails_sent: emailsSentThisCity,
    emails_sent_today: newEmailsToday,
    daily_cap: dailyCap,
    cap_reached: newEmailsToday >= dailyCap,
  });
}
