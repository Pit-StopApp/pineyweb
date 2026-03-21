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
  const recipientEmail = data?.email_to?.[0];

  if (!recipientEmail) {
    return NextResponse.json({ received: true });
  }

  const supabase = getSupabase();

  if (type === "email.delivered") {
    await supabase
      .from("pineyweb_prospects")
      .update({ email_delivered: true })
      .eq("email", recipientEmail);
  }

  if (type === "email.complained") {
    await supabase
      .from("pineyweb_prospects")
      .update({ email_spam: true })
      .eq("email", recipientEmail);
  }

  return NextResponse.json({ received: true });
}
