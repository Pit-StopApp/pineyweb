import { Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, CTA, COLORS } from "./shared";

interface Props { firstName: string; }

export default function AccountActivated({ firstName }: Props) {
  return (
    <EmailLayout>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Hi {firstName},
      </Text>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Your Piney Web Co. account has been activated! You now have full access to your client dashboard where you can track your project, submit change requests, and manage your site.
      </Text>
      <CTA href="https://pineyweb.com/dashboard">Go to Your Dashboard</CTA>
      <Text style={{ fontSize: "14px", color: COLORS.muted, lineHeight: "1.6" }}>
        We&apos;re excited to build something great for your business. If you need anything, we&apos;re just a message away.
      </Text>
    </EmailLayout>
  );
}
