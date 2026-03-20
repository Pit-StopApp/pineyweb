import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }
function getResend() { return new Resend(process.env.RESEND_API_KEY); }

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const supabase = getSupabase();

    // Look up client to get firstName
    const { data: client } = await supabase.from("pineyweb_clients").select("full_name").eq("email", email).single();
    if (!client) return NextResponse.json({ error: "No account found with that email." }, { status: 404 });

    const firstName = client.full_name?.split(" ")[0] || "there";

    // Generate recovery link
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://pineyweb.com/reset-password" },
    });

    if (error || !data?.properties?.action_link) {
      console.error("[Auth] generateLink error:", error);
      return NextResponse.json({ error: "Failed to generate reset link" }, { status: 500 });
    }

    // Send via Resend
    const resend = getResend();
    await resend.emails.send({
      from: "Piney Web Co. <noreply@pineyweb.com>",
      to: email,
      subject: "Reset your Piney Web Co. password",
      // @ts-expect-error Resend template API fields
      template_id: "7e91c75e-e491-4133-892b-9ff92380f053",
      variables: { firstName, resetUrl: data.properties.action_link },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
