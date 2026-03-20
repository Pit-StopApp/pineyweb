import { Body, Container, Head, Hr, Html, Section, Text } from "@react-email/components";
import * as React from "react";

export const COLORS = {
  bg: "#F5F0E8",
  header: "#4A7C59",
  text: "#1d1c17",
  accent: "#8B5E3C",
  cta: "#4A7C59",
  muted: "#414942",
};

export function EmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: "'Georgia', serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "20px" }}>
          {/* Header */}
          <Section style={{ backgroundColor: COLORS.header, padding: "24px 32px", textAlign: "center" as const }}>
            <Text style={{ color: "#ffffff", fontSize: "20px", fontWeight: "bold", letterSpacing: "2px", margin: 0 }}>
              PINEY WEB CO.
            </Text>
          </Section>
          {/* Body */}
          <Section style={{ backgroundColor: "#ffffff", padding: "40px 32px" }}>
            {children}
          </Section>
          {/* Footer */}
          <Section style={{ padding: "24px 32px", textAlign: "center" as const }}>
            <Hr style={{ borderColor: "#c1c9bf", margin: "0 0 16px" }} />
            <Text style={{ color: COLORS.muted, fontSize: "12px", margin: 0 }}>
              hello@pineyweb.com | pineyweb.com | &copy; 2026 Piney Web Co.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function CTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
      <a
        href={href}
        style={{
          backgroundColor: COLORS.cta,
          color: "#ffffff",
          padding: "14px 32px",
          fontSize: "14px",
          fontWeight: "bold",
          textDecoration: "none",
          borderRadius: "4px",
          display: "inline-block",
        }}
      >
        {children}
      </a>
    </Section>
  );
}
