import type { Metadata } from "next";
import { Lora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Piney Web Co. | East Texas Web Design",
  description:
    "Professional websites for East Texas small businesses. Custom design, local SEO, and ongoing support from a team that understands your market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lora.variable} scroll-smooth`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="font-serif antialiased bg-white text-gray-900">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
