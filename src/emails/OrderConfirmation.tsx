import { Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, CTA, COLORS } from "./shared";

interface Props { firstName: string; confirmationNumber: string; }

export default function OrderConfirmation({ firstName, confirmationNumber }: Props) {
  return (
    <EmailLayout>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Hi {firstName},
      </Text>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Thank you for choosing Piney Web Co.! Your order has been received and we&apos;re ready to get started on your project.
      </Text>
      <Section style={{ border: "2px solid #c1c9bf", borderRadius: "8px", padding: "24px", textAlign: "center" as const, margin: "24px 0" }}>
        <Text style={{ fontSize: "12px", color: COLORS.muted, letterSpacing: "2px", textTransform: "uppercase" as const, margin: "0 0 8px" }}>
          Your Confirmation Number
        </Text>
        <Text style={{ fontSize: "32px", fontWeight: "bold", color: COLORS.header, margin: 0, letterSpacing: "2px" }}>
          {confirmationNumber}
        </Text>
      </Section>
      <Text style={{ fontSize: "14px", color: COLORS.accent, lineHeight: "1.6" }}>
        Save this number — you&apos;ll need it to activate your client dashboard at pineyweb.com/activate.
      </Text>
      <CTA href="https://pineyweb.com/activate">Activate Your Dashboard</CTA>
      <Text style={{ fontSize: "14px", color: COLORS.muted, lineHeight: "1.6" }}>
        We&apos;ll be in touch within 24 hours to kick off your project. If you have any questions, reply to this email or reach out at hello@pineyweb.com.
      </Text>
    </EmailLayout>
  );
}
