"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/prospects", label: "Prospects" },
  { href: "/admin/queue", label: "Queue" },
];

export default function AdminNav({ activePage, adminName, onLogout }: {
  activePage: string;
  adminName: string;
  onLogout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 w-full z-50 backdrop-blur-xl" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
      <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
        <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {NAV_LINKS.map(link => (
            link.label === activePage ? (
              <span key={link.href} className="font-semibold pb-1" style={{ color: "#316342", borderBottom: "2px solid #316342" }}>{link.label}</span>
            ) : (
              <Link key={link.href} href={link.href} style={{ color: "#414942" }}>{link.label}</Link>
            )
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span className="text-sm italic hidden sm:inline" style={{ color: "#414942" }}>{adminName}</span>
          <button onClick={onLogout} className="px-5 py-2 rounded-md font-medium text-white text-sm" style={{ backgroundColor: "#316342" }}>Logout</button>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-md transition-colors hover:bg-[#f2ede5]" aria-label="Menu">
            <span className="material-symbols-outlined text-[22px]" style={{ color: "#316342" }}>{mobileOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t px-8 pb-4" style={{ backgroundColor: "#fef9f1", borderColor: "rgba(193,201,191,0.3)" }}>
          <nav className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map(link => (
              link.label === activePage ? (
                <span key={link.href} className="px-4 py-3 rounded-md text-sm font-bold" style={{ color: "#316342", backgroundColor: "rgba(74,124,89,0.1)" }}>{link.label}</span>
              ) : (
                <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="px-4 py-3 rounded-md text-sm transition-colors hover:bg-[#f2ede5]" style={{ color: "#414942" }}>{link.label}</Link>
              )
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
