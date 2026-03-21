import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET_PINEYWEB;
  if (!secret) {
    console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET_PINEYWEB not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  const body = await req.text();
  const wh = new Webhook(secret);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;

  try {
    payload = wh.verify(body, headers);
  } catch {
    console.error("[Resend Webhook] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { type, data } = payload;
  const recipientEmail = data?.to?.[0] || data?.email_to?.[0];
  if (!recipientEmail) return NextResponse.json({ received: true });

  const supabase = getSupabase();

  // Extract prospect metadata from tags
  const tags: Record<string, string> = {};
  if (Array.isArray(data?.tags)) {
    for (const tag of data.tags) {
      if (tag.name && tag.value) tags[tag.name] = tag.value;
    }
  }

  if (type === "email.delivered") {
    // Check if prospect already in CRM
    const { data: existing } = await supabase
      .from("pineyweb_prospects")
      .select("id")
      .eq("email", recipientEmail)
      .single();

    if (!existing && tags.place_id) {
      // Save to CRM on first delivery
      await supabase.from("pineyweb_prospects").insert({
        place_id: tags.place_id,
        business_name: tags.business_name || "",
        address: tags.address || "",
        city: tags.city || "",
        phone: tags.phone || null,
        email: recipientEmail,
        email_source: tags.email_source || null,
        rating: tags.rating ? Number(tags.rating) : null,
        review_count: tags.review_count ? Number(tags.review_count) : null,
        priority_tier: tags.priority_tier ? Number(tags.priority_tier) : 2,
        outreach_status: "contacted",
        contact_method: "Email",
        emailed_at: new Date().toISOString(),
        email_delivered: true,
      });
    } else {
      // Already in CRM — update delivery status
      await supabase
        .from("pineyweb_prospects")
        .update({
          email_delivered: true,
          outreach_status: "contacted",
          contact_method: "Email",
          emailed_at: new Date().toISOString(),
        })
        .eq("email", recipientEmail);
    }
  }

  if (type === "email.complained") {
    await supabase.from("pineyweb_prospects").update({ email_spam: true }).eq("email", recipientEmail);

    // Auto-pause: set daily cap to 0
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("pineyweb_daily_send_tracker").upsert({ date: today, daily_cap: 0 }, { onConflict: "date" });

    // Alert admin
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Piney Web Bot <noreply@pineyweb.com>",
        to: "hello@pineyweb.com",
        subject: `⚠️ Spam complaint — sending paused`,
        html: `<p style="font-family:Georgia,serif;font-size:16px;color:#1d1c17;">Spam complaint received from <strong>${recipientEmail}</strong>.<br/><br/>Automated sending has been paused (daily_cap set to 0).<br/><br/>Review before resuming at <a href="https://pineyweb.com/admin/queue">Admin Queue</a>.</p>`,
      });
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ received: true });
}
