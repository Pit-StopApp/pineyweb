"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/components/DashboardShell";

type Tab = "images" | "text" | "colors";

export default function EditSite() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("images");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data } = await supabase.from("pineyweb_clients").select("business_name, status").eq("user_id", session.user.id).single();
      if (data?.status === "pending") { router.push("/activate"); return; }
      setBusinessName(data?.business_name || session.user.user_metadata?.business_name || "");
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "images", label: "IMAGES" },
    { key: "text", label: "TEXT" },
    { key: "colors", label: "COLORS" },
  ];

  return (
    <DashboardShell businessName={businessName} onLogout={handleLogout}>
      <header className="mb-12">
        <span className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "#805533" }}>Editor Mode</span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Refine Your Presence</h1>
      </header>

      {/* Tab Navigation */}
      <div className="flex gap-12 border-b mb-12" style={{ borderColor: "rgba(193,201,191,0.3)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="pb-4 relative font-bold transition-colors"
            style={{ color: activeTab === t.key ? "#316342" : "#414942" }}
          >
            {t.label}
            {activeTab === t.key && <div className="absolute bottom-[-1.5px] left-0 right-0 h-[2px]" style={{ backgroundColor: "#316342" }} />}
          </button>
        ))}
      </div>

      {/* IMAGES Tab */}
      {activeTab === "images" && (
        <section className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {[
              { title: "Hero Banner", size: "1920 x 1080 px" },
              { title: "Service Gallery (1)", size: "800 x 600 px" },
              { title: "Business Logo", size: "500 x 200 px (PNG)" },
            ].map((img) => (
              <div key={img.title} className="p-2 group overflow-hidden" style={{ backgroundColor: "#f8f3eb" }}>
                <div className="aspect-video relative overflow-hidden mb-4 flex items-center justify-center" style={{ backgroundColor: "#e7e2da" }}>
                  <span className="material-symbols-outlined text-4xl" style={{ color: "#c1c9bf" }}>image</span>
                </div>
                <div className="px-3 pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg" style={{ color: "#1d1c17" }}>{img.title}</h3>
                      <p className="text-xs uppercase tracking-tighter" style={{ color: "#414942", opacity: 0.7 }}>{img.size}</p>
                    </div>
                    <button className="font-bold text-sm underline underline-offset-4 transition-colors" style={{ color: "#316342" }}>Replace</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TEXT Tab */}
      {activeTab === "text" && (
        <section className="max-w-4xl space-y-12">
          <h2 className="text-2xl font-bold pl-6" style={{ borderLeft: "2px solid #805533", color: "#1d1c17" }}>Content &amp; Copy</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <label className="text-xs uppercase tracking-widest" style={{ color: "#414942" }}>Hero Headline</label>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#717971" }}>0 / 60 characters</span>
            </div>
            <textarea className="w-full bg-transparent border-b border-[#717971] focus:border-[#316342] focus:ring-0 text-3xl font-bold py-4 transition-all resize-none overflow-hidden" rows={1} placeholder="Your headline here..." style={{ color: "#1d1c17" }} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <label className="text-xs uppercase tracking-widest" style={{ color: "#414942" }}>Primary Subtext</label>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#717971" }}>0 / 250 characters</span>
            </div>
            <textarea className="w-full bg-transparent border-b border-[#717971] focus:border-[#316342] focus:ring-0 text-lg py-4 transition-all resize-none" rows={3} placeholder="Describe your business..." style={{ color: "#1d1c17" }} />
          </div>
        </section>
      )}

      {/* COLORS Tab */}
      {activeTab === "colors" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-8">
            <h2 className="text-2xl font-bold pl-6" style={{ borderLeft: "2px solid #805533", color: "#1d1c17" }}>Brand Palette</h2>
            <div className="space-y-6">
              {[
                { label: "Primary Color", name: "Sage Forest Green", hex: "#316342" },
                { label: "Secondary Color", name: "Aged Leather", hex: "#805533" },
                { label: "Accent", name: "Muted Moss", hex: "#6E745F" },
              ].map((c) => (
                <div key={c.hex} className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-md flex-shrink-0" style={{ backgroundColor: c.hex, border: "4px solid #f8f3eb", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }} />
                  <div className="flex-1">
                    <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>{c.label}</label>
                    <div className="flex items-center justify-between border-b py-2" style={{ borderColor: "rgba(193,201,191,0.4)" }}>
                      <span className="font-semibold" style={{ color: "#1d1c17" }}>{c.name}</span>
                      <span className="font-mono text-xs" style={{ color: "#414942", opacity: 0.6 }}>{c.hex}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Card */}
          <div className="p-8 rounded-xl space-y-6 sticky top-32" style={{ backgroundColor: "#f8f3eb" }}>
            <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: "#316342" }}>Live Preview</span>
            <div className="p-6 border rounded-lg space-y-4" style={{ backgroundColor: "#fef9f1", borderColor: "rgba(193,201,191,0.2)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
              <div className="h-4 w-1/3 rounded-sm" style={{ backgroundColor: "#316342", opacity: 0.2 }} />
              <div className="h-8 w-2/3 rounded-sm" style={{ backgroundColor: "#1d1c17" }} />
              <div className="space-y-2">
                <div className="h-2 w-full rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
                <div className="h-2 w-full rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
                <div className="h-2 w-4/5 rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
              </div>
              <div className="pt-4 flex gap-4">
                <div className="h-10 w-24 rounded-md" style={{ backgroundColor: "#316342" }} />
                <div className="h-10 w-24 border rounded-md" style={{ borderColor: "#805533" }} />
              </div>
            </div>
            <p className="text-xs italic text-center px-8" style={{ color: "#414942" }}>Preview reflects the impact of your brand colors on the website architecture.</p>
          </div>
        </section>
      )}

      {/* Floating Action Bar */}
      <div className="h-24" />
      <footer className="fixed bottom-8 left-[calc(16rem+3rem)] right-12 z-50 hidden md:block">
        <div className="backdrop-blur-xl border px-8 py-5 flex items-center justify-between rounded-xl" style={{ backgroundColor: "rgba(254,249,241,0.9)", borderColor: "rgba(193,201,191,0.3)", boxShadow: "0 20px 50px rgba(48,20,0,0.1)" }}>
          <div className="flex items-center gap-4">
            <span className="flex h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#ba1a1a" }} />
            <p className="text-sm italic" style={{ color: "#1d1c17" }}>Unsaved changes detected</p>
          </div>
          <div className="flex gap-4">
            <button className="px-6 py-2.5 font-bold border-b transition-all" style={{ color: "#316342", borderColor: "#316342" }}>Draft</button>
            <button className="px-6 py-2.5 font-bold transition-colors" style={{ color: "#414942" }}>Preview</button>
            <button className="px-10 py-2.5 rounded-md font-bold text-white transition-all active:scale-95" style={{ backgroundColor: "#316342" }}>Publish</button>
          </div>
        </div>
      </footer>
    </DashboardShell>
  );
}
