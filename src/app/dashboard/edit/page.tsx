"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import DashboardShell from "@/components/DashboardShell";

type Tab = "images" | "text" | "colors";

interface ContentRow {
  content_type: string;
  content_key: string;
  content_value: string | null;
}

const IMAGE_SLOTS = [
  { key: "hero_banner", title: "Hero Banner", size: "1920 x 1080 px" },
  { key: "service_gallery_1", title: "Service Gallery (1)", size: "800 x 600 px" },
  { key: "business_logo", title: "Business Logo", size: "500 x 200 px (PNG)" },
];

const TEXT_FIELDS = [
  { key: "hero_headline", label: "Hero Headline", placeholder: "Your headline here...", maxLen: 60, rows: 1, fontSize: "text-3xl font-bold" },
  { key: "primary_subtext", label: "Primary Subtext", placeholder: "Describe your business...", maxLen: 250, rows: 3, fontSize: "text-lg" },
];

const DEFAULT_COLORS = [
  { key: "color_primary", label: "Primary Color", name: "Sage Forest Green", hex: "#316342" },
  { key: "color_secondary", label: "Secondary Color", name: "Aged Leather", hex: "#805533" },
  { key: "color_accent", label: "Accent", name: "Muted Moss", hex: "#6E745F" },
];

export default function EditSite() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("images");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Content state
  const [images, setImages] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [colors, setColors] = useState<{ key: string; label: string; name: string; hex: string }[]>(DEFAULT_COLORS);

  const loadContent = useCallback(async (cId: string) => {
    const { data } = await supabase.from("pineyweb_site_content").select("content_type, content_key, content_value").eq("client_id", cId);
    if (!data) return;
    const imgMap: Record<string, string> = {};
    const txtMap: Record<string, string> = {};
    const colorUpdates = [...DEFAULT_COLORS];
    for (const row of data as ContentRow[]) {
      if (row.content_type === "image") imgMap[row.content_key] = row.content_value || "";
      if (row.content_type === "text") txtMap[row.content_key] = row.content_value || "";
      if (row.content_type === "color") {
        const idx = colorUpdates.findIndex((c) => c.key === row.content_key);
        if (idx >= 0 && row.content_value) colorUpdates[idx] = { ...colorUpdates[idx], hex: row.content_value };
      }
    }
    setImages(imgMap);
    setTexts(txtMap);
    setColors(colorUpdates);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data } = await supabase.from("pineyweb_clients").select("id, business_name, status").eq("user_id", session.user.id).single();
      if (!data || data.status !== "active") { router.push("/?pending=1"); return; }
      setBusinessName(data.business_name || "");
      setClientId(data.id);
      await loadContent(data.id);
      setLoading(false);
    };
    checkAuth();
  }, [router, loadContent]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const saveContent = async (publish: boolean) => {
    if (!clientId) return;
    setSaving(true);
    setSaveMsg("");

    // Collect all content to upsert
    const rows: { client_id: string; content_type: string; content_key: string; content_value: string }[] = [];
    for (const [key, val] of Object.entries(images)) {
      rows.push({ client_id: clientId, content_type: "image", content_key: key, content_value: val });
    }
    for (const [key, val] of Object.entries(texts)) {
      rows.push({ client_id: clientId, content_type: "text", content_key: key, content_value: val });
    }
    for (const c of colors) {
      rows.push({ client_id: clientId, content_type: "color", content_key: c.key, content_value: c.hex });
    }

    // Delete existing and insert fresh
    await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId);
    const { error } = await supabase.from("pineyweb_site_content").insert(rows);

    if (error) {
      setSaveMsg("Save failed. Please try again.");
    } else if (publish) {
      // Trigger deploy hook if configured
      const hookUrl = process.env.NEXT_PUBLIC_DEPLOY_HOOK_URL;
      if (hookUrl) {
        try { await fetch(hookUrl, { method: "POST" }); } catch { /* non-blocking */ }
      }
      setSaveMsg("Published successfully!");
      setHasChanges(false);
    } else {
      setSaveMsg("Draft saved!");
      setHasChanges(false);
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handlePreview = () => {
    // Open current site in new tab as preview
    window.open(window.location.origin, "_blank");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "images", label: "IMAGES" },
    { key: "text", label: "TEXT" },
    { key: "colors", label: "COLORS" },
  ];

  return (
    <DashboardShell businessName={businessName} onLogout={handleLogout}>
      <header className="mb-12 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "#805533" }}>Editor Mode</span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Refine Your Presence</h1>
        </div>
        <Image src="/transparentPINEYWEB.png" width={80} height={80} alt="Piney Web Co." unoptimized className="hidden md:block" />
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
            {IMAGE_SLOTS.map((img) => (
              <div key={img.key} className="p-2 group overflow-hidden" style={{ backgroundColor: "#f8f3eb" }}>
                <div className="aspect-video relative overflow-hidden mb-4 flex items-center justify-center" style={{ backgroundColor: "#e7e2da" }}>
                  {images[img.key] ? (
                    <img src={images[img.key]} alt={img.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <span className="material-symbols-outlined text-4xl block mb-1" style={{ color: "#c1c9bf" }}>image</span>
                      <span className="text-xs" style={{ color: "#c1c9bf" }}>No image uploaded yet</span>
                    </div>
                  )}
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
          {TEXT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-xs uppercase tracking-widest" style={{ color: "#414942" }}>{field.label}</label>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "#717971" }}>{(texts[field.key] || "").length} / {field.maxLen} characters</span>
              </div>
              <textarea
                className={`w-full bg-transparent border-b border-[#717971] focus:border-[#316342] focus:ring-0 ${field.fontSize} py-4 transition-all resize-none`}
                rows={field.rows}
                placeholder={field.placeholder}
                value={texts[field.key] || ""}
                maxLength={field.maxLen}
                onChange={(e) => { setTexts((prev) => ({ ...prev, [field.key]: e.target.value })); setHasChanges(true); }}
                style={{ color: "#1d1c17" }}
              />
            </div>
          ))}
        </section>
      )}

      {/* COLORS Tab */}
      {activeTab === "colors" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-8">
            <h2 className="text-2xl font-bold pl-6" style={{ borderLeft: "2px solid #805533", color: "#1d1c17" }}>Brand Palette</h2>
            <div className="space-y-6">
              {colors.map((c, i) => (
                <div key={c.key} className="flex items-center gap-6">
                  <label className="w-16 h-16 rounded-md flex-shrink-0 cursor-pointer relative" style={{ backgroundColor: c.hex, border: "4px solid #f8f3eb", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                    <input
                      type="color"
                      value={c.hex}
                      onChange={(e) => {
                        const updated = [...colors];
                        updated[i] = { ...updated[i], hex: e.target.value };
                        setColors(updated);
                        setHasChanges(true);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
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
            <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: colors[0]?.hex || "#316342" }}>Live Preview</span>
            <div className="p-6 border rounded-lg space-y-4" style={{ backgroundColor: "#fef9f1", borderColor: "rgba(193,201,191,0.2)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
              <div className="h-4 w-1/3 rounded-sm" style={{ backgroundColor: colors[0]?.hex || "#316342", opacity: 0.2 }} />
              <div className="h-8 w-2/3 rounded-sm" style={{ backgroundColor: "#1d1c17" }} />
              <div className="space-y-2">
                <div className="h-2 w-full rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
                <div className="h-2 w-full rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
                <div className="h-2 w-4/5 rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
              </div>
              <div className="pt-4 flex gap-4">
                <div className="h-10 w-24 rounded-md" style={{ backgroundColor: colors[0]?.hex || "#316342" }} />
                <div className="h-10 w-24 border rounded-md" style={{ borderColor: colors[1]?.hex || "#805533" }} />
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
            {hasChanges ? (
              <>
                <span className="flex h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#ba1a1a" }} />
                <p className="text-sm italic" style={{ color: "#1d1c17" }}>Unsaved changes detected</p>
              </>
            ) : saveMsg ? (
              <p className="text-sm italic" style={{ color: "#316342" }}>{saveMsg}</p>
            ) : (
              <p className="text-sm italic" style={{ color: "#717971" }}>All changes saved</p>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={() => saveContent(false)} disabled={saving} className="px-6 py-2.5 font-bold border-b transition-all disabled:opacity-50" style={{ color: "#316342", borderColor: "#316342" }}>
              {saving ? "Saving..." : "Draft"}
            </button>
            <button onClick={handlePreview} className="px-6 py-2.5 font-bold transition-colors" style={{ color: "#414942" }}>Preview</button>
            <button onClick={() => saveContent(true)} disabled={saving} className="px-10 py-2.5 rounded-md font-bold text-white transition-all active:scale-95 disabled:opacity-50" style={{ backgroundColor: "#316342" }}>
              {saving ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      </footer>
    </DashboardShell>
  );
}
