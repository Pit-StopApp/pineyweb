import { Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, CTA, COLORS } from "./shared";

interface Props { firstName: string; }

export default function BuildStarted({ firstName }: Props) {
  return (
    <EmailLayout>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Hi {firstName},
      </Text>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Great news — we&apos;ve started building your website! Our team is working on your custom design and will have a first draft ready for your review soon.
      </Text>
      <Text style={{ fontSize: "14px", color: COLORS.accent, fontWeight: "bold", lineHeight: "1.6" }}>
        What happens next:
      </Text>
      <Text style={{ fontSize: "14px", color: COLORS.text, lineHeight: "1.8", paddingLeft: "16px" }}>
        1. We build your initial design<br />
        2. You review and provide feedback via your dashboard<br />
        3. We refine until you&apos;re happy<br />
        4. We launch your site live
      </Text>
      <CTA href="https://pineyweb.com/dashboard">Check Your Dashboard</CTA>
      <Text style={{ fontSize: "14px", color: COLORS.muted, lineHeight: "1.6" }}>
        You can submit feedback, upload content, and track progress anytime from your client dashboard.
      </Text>
    </EmailLayout>
  );
}
