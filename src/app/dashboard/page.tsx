"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/components/DashboardShell";

interface ClientProfile {
  full_name: string;
  business_name: string;
  email: string;
  status: string | null;
  site_url: string | null;
  tier: string | null;
}

export default function DashboardHome() {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data } = await supabase
        .from("pineyweb_clients")
        .select("full_name, business_name, email, status, site_url, tier")
        .eq("user_id", session.user.id)
        .single();

      if (!data || data.status !== "active") {
        router.push("/?pending=1");
        return;
      }
      setProfile(data);
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}>
        <p style={{ color: "#414942" }}>Loading...</p>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] || profile?.business_name || "there";

  return (
    <DashboardShell businessName={profile?.business_name} onLogout={handleLogout}>
      {/* Header */}
      <div className="mb-12">
        <span className="text-xs tracking-[0.15em] uppercase font-bold mb-2 block" style={{ color: "#316342" }}>DASHBOARD OVERVIEW</span>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: "#1d1c17" }}>Good morning, {firstName}.</h2>
        <p className="max-w-2xl text-lg leading-relaxed italic" style={{ color: "#414942" }}>
          Your digital presence is performing optimally. Review your live site and account status below.
        </p>
      </div>

      {/* Website Preview */}
      <div className="rounded-xl overflow-hidden mb-12" style={{ backgroundColor: "#f8f3eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: "#e7e2da", borderColor: "rgba(193,201,191,0.1)" }}>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "rgba(186,26,26,0.4)" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#fdc39a" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "rgba(74,124,89,0.4)" }} />
            </div>
            <div className="ml-4 px-4 py-1.5 rounded text-xs flex items-center gap-2 border" style={{ backgroundColor: "#fef9f1", color: "#414942", borderColor: "rgba(193,201,191,0.3)" }}>
              <span className="material-symbols-outlined text-[14px]">lock</span>
              {profile?.site_url?.replace(/^https?:\/\//, "") || "yoursite.com"}
            </div>
          </div>
          {profile?.site_url && (
            <a href={profile.site_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-md" style={{ backgroundColor: "#316342" }}>
              <span>Open Site</span>
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            </a>
          )}
        </div>
        <div className="w-full relative overflow-hidden" style={{ backgroundColor: "#fef9f1", height: "600px" }}>
          {profile?.site_url ? (
            <iframe src={profile.site_url} className="w-full h-full border-0" title="Website Preview" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "#f8f3eb" }}>
              <div className="text-center">
                <span className="material-symbols-outlined text-5xl mb-4 block" style={{ color: "#c1c9bf" }}>web</span>
                <p className="text-sm" style={{ color: "#414942" }}>Your website preview will appear here</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bento Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Site Status */}
        <div className="p-8 rounded-xl border transition-colors" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <div className="flex items-center justify-between mb-6">
            <span className="material-symbols-outlined text-3xl" style={{ color: "#316342" }}>verified</span>
            <div className="px-4 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase" style={{ backgroundColor: "rgba(74,124,89,0.2)", color: "#4a7c59" }}>
              Active
            </div>
          </div>
          <h3 className="text-sm uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Site Status</h3>
          <p className="text-2xl font-bold" style={{ color: "#1d1c17" }}>Online &amp; Healthy</p>
        </div>

        {/* Current Tier */}
        <div className="p-8 rounded-xl border transition-colors" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <div className="flex items-center justify-between mb-6">
            <span className="material-symbols-outlined text-3xl" style={{ color: "#805533" }}>military_tech</span>
          </div>
          <h3 className="text-sm uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Current Tier</h3>
          <p className="text-2xl font-bold" style={{ color: "#805533" }}>{profile?.tier || "Managed"}</p>
        </div>

        {/* Next Billing */}
        <div className="p-8 rounded-xl border transition-colors" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <div className="flex items-center justify-between mb-6">
            <span className="material-symbols-outlined text-3xl" style={{ color: "#414942" }}>event_upcoming</span>
          </div>
          <h3 className="text-sm uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Next Billing Date</h3>
          <p className="text-2xl font-bold" style={{ color: "#1d1c17" }}>—</p>
        </div>
      </div>
    </DashboardShell>
  );
}
