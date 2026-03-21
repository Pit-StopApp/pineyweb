"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/components/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [businessName, setBusinessName] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  // Pages with their own standalone layouts
  const isStandalone = pathname === "/dashboard/onboarding" || pathname === "/dashboard/suspended";

  useEffect(() => {
    if (isStandalone) { setChecking(false); setAuthed(true); return; }
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // Never redirect away from admin pages
      if (window.location.pathname.startsWith("/admin")) return;
      if (!session) { router.push("/login"); return; }

      let name = "";
      const { data } = await supabase.from("pineyweb_clients").select("business_name").eq("user_id", session.user.id).single();
      if (data) {
        name = data.business_name || "";
      } else {
        try {
          const res = await fetch("/api/auth/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: session.user.id }) });
          const fallback = await res.json();
          if (fallback.data) name = fallback.data.business_name || "";
        } catch { /* ignore */ }
      }

      setBusinessName(name);
      setAuthed(true);
      setChecking(false);
    };
    check();
  }, [router, isStandalone]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Standalone pages render without the dashboard shell
  if (isStandalone) return <>{children}</>;

  // Always show nav shell while checking auth
  if (checking) {
    return (
      <DashboardShell businessName="" onLogout={handleLogout}>
        <div className="flex items-center justify-center py-32">
          <p style={{ color: "#414942" }}>Loading...</p>
        </div>
      </DashboardShell>
    );
  }

  if (!authed) return null;

  return (
    <DashboardShell businessName={businessName} onLogout={handleLogout}>
      {children}
    </DashboardShell>
  );
}
