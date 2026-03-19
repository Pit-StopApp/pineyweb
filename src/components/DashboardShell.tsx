"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CrispChat from "./CrispChat";

interface Props {
  businessName?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/edit", label: "Edit Site", icon: "edit_note" },
  { href: "/dashboard/billing", label: "Billing", icon: "receipt_long" },
];

export default function DashboardShell({ businessName, onLogout, children }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      {/* Top Nav */}
      <header className="fixed top-0 left-0 w-full flex justify-between items-center px-8 py-4 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <Link href="/" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>
          Piney Web Co.
        </Link>
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
          <span className="font-semibold text-xl tracking-tight italic" style={{ color: "#1d1c17" }}>
            {businessName || "Client Portal"}
          </span>
        </div>
        <button onClick={onLogout} className="font-medium tracking-tight transition-colors duration-300" style={{ color: "#414942" }}>
          Log Out
        </button>
      </header>

      <div className="flex min-h-screen">
        {/* Side Nav — desktop */}
        <aside className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 z-40 pt-20" style={{ backgroundColor: "#f8f3eb" }}>
          <div className="px-8 mb-12">
            <p className="text-sm tracking-wide uppercase" style={{ color: "#316342" }}>Client Portal</p>
            <p className="text-xs opacity-60 font-medium">Piney Web Co.</p>
          </div>
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 py-3 text-sm tracking-wide uppercase transition-all duration-200 ${
                    isActive
                      ? "font-bold pl-4"
                      : "opacity-70 pl-5 hover:text-[#316342]"
                  }`}
                  style={{
                    color: isActive ? "#316342" : "#414942",
                    borderLeft: isActive ? "4px solid #316342" : "4px solid transparent",
                    backgroundColor: isActive ? "rgba(231,226,218,0.5)" : undefined,
                  }}
                >
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 md:ml-64 mt-20 p-6 md:p-10">
          {children}
        </main>
      </div>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around py-3 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(231,226,218,0.9)", boxShadow: "0 -4px 20px rgba(0,0,0,0.05)" }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1" style={{ color: isActive ? "#316342" : "#414942", opacity: isActive ? 1 : 0.6 }}>
              <span className="material-symbols-outlined" style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
              <span className="text-[10px] uppercase font-bold tracking-tighter">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>

      <CrispChat />
    </div>
  );
}
