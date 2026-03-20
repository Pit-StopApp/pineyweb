import { Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, CTA, COLORS } from "./shared";

interface Props { firstName: string; siteUrl: string; }

export default function SiteLive({ firstName, siteUrl }: Props) {
  return (
    <EmailLayout>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Hi {firstName},
      </Text>
      <Text style={{ fontSize: "20px", color: COLORS.header, fontWeight: "bold", lineHeight: "1.4" }}>
        Your website is live! 🎉
      </Text>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Your new site is up and running at:
      </Text>
      <Text style={{ fontSize: "18px", color: COLORS.accent, fontWeight: "bold", textAlign: "center" as const }}>
        {siteUrl}
      </Text>
      <CTA href={siteUrl}>Visit Your Website</CTA>
      <Text style={{ fontSize: "14px", color: COLORS.text, lineHeight: "1.6" }}>
        Your client dashboard is still available for submitting change requests, managing content, and reviewing your billing. We&apos;re here whenever you need updates.
      </Text>
      <Text style={{ fontSize: "14px", color: COLORS.muted, lineHeight: "1.6" }}>
        Congratulations on your new online presence!
      </Text>
    </EmailLayout>
  );
}
