import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY); }

export async function POST(request: NextRequest) {
  try {
    const { clientId, emailType, adminUserId } = await request.json();

    const supabase = getSupabase();
    const resend = getResend();

    if (!adminUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: admin } = await supabase.from("pineyweb_clients").select("role").eq("user_id", adminUserId).single();
    if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const { data: client } = await supabase.from("pineyweb_clients").select("*").eq("id", clientId).single();
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const firstName = client.full_name?.split(" ")[0] || "there";
    const email = client.email;
    if (!email) return NextResponse.json({ error: "Client has no email" }, { status: 400 });

    let subject = "";
    let templateId = "";
    let variables: Record<string, string> = { firstName };

    if (emailType === "build_started") {
      subject = "Your Website Build Has Started!";
      templateId = "2b02c5c5-9ac7-4858-9957-b4ec350f2629";
      await supabase.from("pineyweb_clients").update({ status: "in_progress" }).eq("id", clientId);
    } else if (emailType === "site_live") {
      subject = "Your Website is Live!";
      templateId = "39e01065-57e9-46d9-8d05-86f1f6bd4d8b";
      variables = { firstName, siteUrl: client.site_url || "https://pineyweb.com" };
      await supabase.from("pineyweb_clients").update({ status: "live" }).eq("id", clientId);
    } else if (emailType === "handoff") {
      subject = "Your Website Credentials — Piney Web Co.";
      templateId = "d1fa68d9-098a-4101-b21b-a22c84df4003";
      variables = {
        firstName,
        domain: client.site_url || "",
        vercelEmail: "",
        vercelPassword: "",
        namecheapEmail: "",
        namecheapPassword: "",
        googleEmail: "",
        googlePassword: "",
      };
    } else {
      return NextResponse.json({ error: "Invalid email type" }, { status: 400 });
    }

    await resend.emails.send({
      from: "Piney Web Co. <noreply@pineyweb.com>",
      to: email,
      subject,
      // @ts-expect-error Resend template API fields
      template_id: templateId,
      variables,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
