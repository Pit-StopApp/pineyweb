import Link from "next/link";
import { getMarkdownContent } from "@/lib/markdown";

export default async function PrivacyPolicy() {
  const content = await getMarkdownContent("privacy-policy.md");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F0E8", fontFamily: "'Lora', Georgia, serif" }}>
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "48px 24px 80px" }}>
        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#4A7C59", fontSize: "14px", fontWeight: 500, textDecoration: "none", marginBottom: "32px" }}
        >
          &larr; Back to Home
        </Link>
        <article
          className="legal-content"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
      <style>{`
        .legal-content h1 { color: #4A7C59; font-size: 32px; font-weight: 700; margin: 0 0 8px; font-family: 'Lora', Georgia, serif; }
        .legal-content h2 { color: #4A7C59; font-size: 20px; font-weight: 700; margin: 32px 0 12px; font-family: 'Lora', Georgia, serif; }
        .legal-content p { color: #1d1c17; font-size: 16px; line-height: 1.8; margin: 0 0 16px; }
        .legal-content strong { color: #1d1c17; }
        .legal-content a { color: #8B5E3C; text-decoration: underline; }
        .legal-content ul { color: #1d1c17; font-size: 16px; line-height: 1.8; margin: 0 0 16px; padding-left: 24px; }
        .legal-content li { margin-bottom: 6px; }
        .legal-content hr { border: none; border-top: 1px solid #c1c9bf; margin: 32px 0; }
      `}</style>
    </div>
  );
}
