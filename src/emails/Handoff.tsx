import { Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, COLORS } from "./shared";

interface Account { label: string; email: string; password: string; }
interface Props { firstName: string; domain: string; accounts: Account[]; }

export default function Handoff({ firstName, domain, accounts }: Props) {
  return (
    <EmailLayout>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Hi {firstName},
      </Text>
      <Text style={{ fontSize: "16px", color: COLORS.text, lineHeight: "1.6" }}>
        Here are your website credentials and account details for <strong>{domain}</strong>. Please store these in a safe place.
      </Text>
      <Text style={{ fontSize: "14px", color: COLORS.accent, fontWeight: "bold" }}>
        ⚠️ Change all passwords after your first login.
      </Text>
      {accounts.map((acc, i) => (
        <Section key={i} style={{ border: "1px solid #c1c9bf", borderRadius: "6px", padding: "16px", margin: "12px 0", backgroundColor: "#faf8f5" }}>
          <Text style={{ fontSize: "13px", color: COLORS.header, fontWeight: "bold", textTransform: "uppercase" as const, letterSpacing: "1px", margin: "0 0 8px" }}>
            {acc.label}
          </Text>
          <Text style={{ fontSize: "14px", color: COLORS.text, margin: "2px 0" }}>Email: <strong>{acc.email}</strong></Text>
          <Text style={{ fontSize: "14px", color: COLORS.text, margin: "2px 0" }}>Password: <code style={{ backgroundColor: "#e7e2da", padding: "2px 6px", borderRadius: "3px" }}>{acc.password}</code></Text>
        </Section>
      ))}
      <Text style={{ fontSize: "14px", color: COLORS.muted, lineHeight: "1.6", marginTop: "24px" }}>
        If you have any questions about these accounts, reach out at hello@pineyweb.com.
      </Text>
    </EmailLayout>
  );
}
