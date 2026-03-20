import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const { email, firstName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Generate a confirmation link via Supabase admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "https://pineyweb.com/dashboard",
      },
    });

    if (error || !data?.properties?.action_link) {
      console.error("[Auth] generateLink error:", error);
      return NextResponse.json(
        { error: "Failed to generate confirmation link" },
        { status: 500 }
      );
    }

    const confirmationUrl = data.properties.action_link;

    // Send confirmation email via Resend template
    const resend = getResend();
    await resend.emails.send({
      from: "Piney Web Co. <noreply@pineyweb.com>",
      to: email,
      subject: "Confirm your Piney Web Co. account",
      // @ts-expect-error Resend template API fields
      template_id: "fd770b43-793f-4158-a0d2-12482c6aedcb",
      variables: {
        firstName: firstName || "there",
        confirmationUrl,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Auth] send-confirmation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
