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

  const remainingToSend = dailyCap - emailsSentToday;

  // Get next unscanned cities (closest first)
  const { data: cities } = await supabase
    .from("pineyweb_scanner_queue")
    .select("*")
    .eq("status", "pending")
    .order("distance_from_longview_miles", { ascending: true })
    .limit(3);

  if (!cities || cities.length === 0) {
    return NextResponse.json({ message: "All cities scanned. Queue exhausted." });
  }

  let totalEmailsSent = 0;
  const results: { city: string; prospects: number; emails_found: number }[] = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pineyweb.com";

  for (const city of cities) {
    if (totalEmailsSent >= remainingToSend) break;

    await supabase.from("pineyweb_scanner_queue").update({ status: "scanning" }).eq("id", city.id);

    try {
      // Run keyword scanner batches
      let batch = 0, done = false;
      let cityProspects = 0, cityEmails = 0;
      while (!done) {
        const res = await fetch(`${appUrl}/api/admin/scanner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: city.city, state: "TX", mode: "keywords", batch }),
        });
        const data = await res.json();
        cityProspects += data.stats?.new_prospects ?? 0;
        cityEmails += data.stats?.emails_found ?? 0;
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
        cityProspects += data.stats?.new_prospects ?? 0;
        cityEmails += data.stats?.emails_found ?? 0;
        done = data.done;
        batch = data.nextBatch ?? batch + 1;
      }

      // Send outreach to new prospects with emails
      const canSend = Math.min(cityEmails, remainingToSend - totalEmailsSent);
      if (canSend > 0) {
        const { data: newProspects } = await supabase
          .from("pineyweb_prospects")
          .select("place_id, business_name, email, email_source, city, phone, rating, review_count, priority_tier")
          .eq("city", city.city)
          .is("emailed_at", null)
          .not("email", "is", null)
          .limit(canSend);

        if (newProspects && newProspects.length > 0) {
          const outRes = await fetch(`${appUrl}/api/admin/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prospects: newProspects.map(p => ({ ...p, address: "" })) }),
          });
          const outData = await outRes.json();
          totalEmailsSent += outData.sent ?? 0;
        }
      }

      await supabase.from("pineyweb_scanner_queue").update({
        status: "complete", last_scanned_at: new Date().toISOString(),
        prospects_found: cityProspects, emails_found: cityEmails, emails_sent: totalEmailsSent,
      }).eq("id", city.id);

      results.push({ city: city.city, prospects: cityProspects, emails_found: cityEmails });
    } catch {
      await supabase.from("pineyweb_scanner_queue").update({ status: "error" }).eq("id", city.id);
    }
  }

  // Update daily tracker
  await supabase.from("pineyweb_daily_send_tracker").upsert({ date: today, emails_sent: emailsSentToday + totalEmailsSent }, { onConflict: "date" });

  // Daily summary email
  if (totalEmailsSent > 0 || results.length > 0) {
    try {
      const resend = getResend();
      await resend.emails.send({
        from: "Piney Web Bot <noreply@pineyweb.com>",
        to: "hello@pineyweb.com",
        subject: `Daily Scan — ${totalEmailsSent} emails sent`,
        html: `<p style="font-family:Georgia,serif;font-size:16px;"><strong>Daily Scan Summary — ${new Date().toLocaleDateString()}</strong><br/><br/>Cities scanned: ${results.length}<br/>Emails sent today: ${emailsSentToday + totalEmailsSent} / ${dailyCap}<br/><br/>${results.map(r => `• ${r.city}: ${r.prospects} prospects, ${r.emails_found} emails`).join("<br/>")}<br/><br/><a href="https://pineyweb.com/admin/prospects">View Prospects →</a></p>`,
      });
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ cities_scanned: results.length, emails_sent: totalEmailsSent, emails_sent_today: emailsSentToday + totalEmailsSent, daily_cap: dailyCap, results });
}
