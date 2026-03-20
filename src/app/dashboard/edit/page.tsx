"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import DashboardShell from "@/components/DashboardShell";

type Tab = "images" | "text" | "colors";

interface ContentRow { content_type: string; content_key: string; content_value: string | null; }

const IMAGE_SLOTS = [
  { key: "logo_url", title: "Business Logo", size: "500 x 200 px (PNG)" },
  { key: "hero_image_url", title: "Hero Image", size: "1920 x 1080 px" },
  { key: "gallery_image_1_url", title: "Gallery Image 1", size: "800 x 600 px" },
  { key: "gallery_image_2_url", title: "Gallery Image 2", size: "800 x 600 px" },
  { key: "gallery_image_3_url", title: "Gallery Image 3", size: "800 x 600 px" },
];

const TEXT_FIELDS = [
  { key: "business_name", label: "Business Name", placeholder: "Your Business Name", maxLen: 100, rows: 1, fontSize: "text-2xl font-bold" },
  { key: "tagline", label: "Tagline", placeholder: "Your tagline or slogan...", maxLen: 120, rows: 1, fontSize: "text-xl" },
  { key: "about_text", label: "About Text", placeholder: "Tell visitors about your business...", maxLen: 500, rows: 4, fontSize: "text-base" },
  { key: "phone", label: "Phone Number", placeholder: "(903) 555-0123", maxLen: 20, rows: 1, fontSize: "text-base" },
  { key: "email", label: "Email", placeholder: "you@business.com", maxLen: 100, rows: 1, fontSize: "text-base" },
  { key: "address", label: "Address", placeholder: "123 Main St, Longview, TX 75601", maxLen: 200, rows: 1, fontSize: "text-base" },
  { key: "hours", label: "Business Hours", placeholder: "Mon-Fri 8am-5pm, Sat 9am-1pm", maxLen: 200, rows: 2, fontSize: "text-base" },
];

const DEFAULT_COLORS = [
  { key: "primary_color", label: "Primary Color", name: "Primary", hex: "#316342" },
  { key: "secondary_color", label: "Secondary Color", name: "Secondary", hex: "#805533" },
  { key: "background_color", label: "Background Color", name: "Background", hex: "#F5F0E8" },
];

export default function EditSite() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [deployHookUrl, setDeployHookUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("text");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKey, setUploadKey] = useState("");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [images, setImages] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [colors, setColors] = useState<{ key: string; label: string; name: string; hex: string }[]>(DEFAULT_COLORS);

  const loadContent = useCallback(async (cId: string) => {
    console.log("[Edit] Loading content for client_id:", cId);
    const { data } = await supabase.from("pineyweb_site_content").select("content_type, content_key, content_value").eq("client_id", cId);
    if (!data) return;
    const rows = data as ContentRow[];
    console.log("[Edit] Loaded", rows.length, "content rows");
    const imgMap: Record<string, string> = {};
    const txtMap: Record<string, string> = {};
    const colorUpdates = [...DEFAULT_COLORS];
    const textKeys = TEXT_FIELDS.map(f => f.key);
    const imageKeys = IMAGE_SLOTS.map(f => f.key);
    const colorKeys = DEFAULT_COLORS.map(f => f.key);
    for (const row of rows) {
      const val = row.content_value || "";
      // Map by content_type first
      if (row.content_type === "image") { imgMap[row.content_key] = val; continue; }
      if (row.content_type === "text") { txtMap[row.content_key] = val; continue; }
      if (row.content_type === "color") {
        const idx = colorUpdates.findIndex((c) => c.key === row.content_key);
        if (idx >= 0 && val) colorUpdates[idx] = { ...colorUpdates[idx], hex: val };
        continue;
      }
      // For onboarding rows, map by content_key to the right bucket
      if (row.content_type === "onboarding" && val) {
        if (imageKeys.includes(row.content_key)) { imgMap[row.content_key] = val; }
        else if (colorKeys.includes(row.content_key)) {
          const idx = colorUpdates.findIndex((c) => c.key === row.content_key);
          if (idx >= 0) colorUpdates[idx] = { ...colorUpdates[idx], hex: val };
        }
        else if (textKeys.includes(row.content_key) || ["business_name", "tagline", "phone", "email", "address", "hours", "about_text"].includes(row.content_key)) {
          txtMap[row.content_key] = val;
        }
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
      const { data } = await supabase.from("pineyweb_clients").select("id, business_name, status, deploy_hook_url").eq("user_id", session.user.id).single();
      if (!data) { router.push("/?pending=1"); return; }
      if (data.status === "pending" || data.status === "active") { router.push("/dashboard/onboarding"); return; }
      if (data.status !== "live" && data.status !== "in_progress") { router.push("/?pending=1"); return; }
      setBusinessName(data.business_name || "");
      setClientId(data.id);
      setDeployHookUrl(data.deploy_hook_url || null);
      await loadContent(data.id);
      setLoading(false);
      // Show help modal on first visit
      if (typeof window !== "undefined" && localStorage.getItem("piney_edit_modal_seen") !== "true") {
        setShowHelpModal(true);
      }
    };
    checkAuth();
  }, [router, loadContent]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const saveDraft = async () => {
    if (!clientId) return;
    setSaving(true);
    setSaveMsg("");
    const rows: { client_id: string; content_type: string; content_key: string; content_value: string }[] = [];
    for (const [key, val] of Object.entries(images)) rows.push({ client_id: clientId, content_type: "image", content_key: key, content_value: val });
    for (const [key, val] of Object.entries(texts)) rows.push({ client_id: clientId, content_type: "text", content_key: key, content_value: val });
    for (const c of colors) rows.push({ client_id: clientId, content_type: "color", content_key: c.key, content_value: c.hex });
    await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId);
    const { error } = await supabase.from("pineyweb_site_content").insert(rows);
    setSaveMsg(error ? "Save failed." : "Draft saved!");
    if (!error) setHasChanges(false);
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handlePublish = async () => {
    if (!clientId) return;
    setPublishing(true);
    setSaveMsg("");
    // Save first
    const rows: { client_id: string; content_type: string; content_key: string; content_value: string }[] = [];
    for (const [key, val] of Object.entries(images)) rows.push({ client_id: clientId, content_type: "image", content_key: key, content_value: val });
    for (const [key, val] of Object.entries(texts)) rows.push({ client_id: clientId, content_type: "text", content_key: key, content_value: val });
    for (const c of colors) rows.push({ client_id: clientId, content_type: "color", content_key: c.key, content_value: c.hex });
    await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId);
    await supabase.from("pineyweb_site_content").insert(rows);

    if (!deployHookUrl) {
      setSaveMsg("Your site isn't connected yet. Contact us via chat to complete setup.");
    } else {
      try {
        await fetch(deployHookUrl, { method: "POST" });
        setSaveMsg("Your site is being updated. Changes will be live in about 60 seconds.");
        setHasChanges(false);
      } catch {
        setSaveMsg("Deploy failed. Please try again or contact support.");
      }
    }
    setPublishing(false);
    setTimeout(() => setSaveMsg(""), 5000);
  };

  const handleImageUpload = async (file: File, key: string) => {
    if (!clientId) return;
    setUploading(key);
    const ext = file.name.split(".").pop() || "png";
    const path = `${clientId}/${key}.${ext}`;
    const { error } = await supabase.storage.from("pineyweb-assets").upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from("pineyweb-assets").getPublicUrl(path);
      const url = urlData.publicUrl + `?t=${Date.now()}`;
      setImages(prev => ({ ...prev, [key]: url }));
      setHasChanges(true);
    }
    setUploading(null);
  };

  const dismissModal = () => {
    if (dontShowAgain) localStorage.setItem("piney_edit_modal_seen", "true");
    setShowHelpModal(false);
    setDontShowAgain(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "text", label: "TEXT" },
    { key: "images", label: "IMAGES" },
    { key: "colors", label: "COLORS" },
  ];

  return (
    <DashboardShell businessName={businessName} onLogout={handleLogout}>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "#805533" }}>Editor Mode</span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Refine Your Presence</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHelpModal(true)}
            title="How does this work?"
            className="w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold transition-colors"
            style={{ borderColor: "#4A7C59", color: "#4A7C59", backgroundColor: "#FAF8F5" }}
          >
            ?
          </button>
          <Image src="/transparentPINEYWEB.png" width={80} height={80} alt="Piney Web Co." unoptimized className="hidden md:block" />
        </div>
      </header>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)", animation: "fadeIn 0.2s ease-out" }}>
          <div className="w-full max-w-[520px] p-8 md:p-10 rounded-xl" style={{ backgroundColor: "#F5F0E8", boxShadow: "0 20px 60px rgba(48,20,0,0.15)", animation: "fadeIn 0.2s ease-out" }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: "#4A7C59" }}>How Your Edit Page Works</h2>

            <div className="space-y-5 mb-6">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-lg mt-0.5" style={{ color: "#4A7C59" }}>edit_note</span>
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: "#1d1c17" }}>Text Tab</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#414942" }}>Update your business name, tagline, contact info, hours, and description. Changes save as a draft until you publish.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-lg mt-0.5" style={{ color: "#4A7C59" }}>image</span>
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: "#1d1c17" }}>Images Tab</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#414942" }}>Upload your logo, hero image, and gallery photos. Supported formats: JPG, PNG, SVG up to 5MB.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-lg mt-0.5" style={{ color: "#4A7C59" }}>palette</span>
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: "#1d1c17" }}>Colors Tab</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#414942" }}>Adjust your primary color, secondary color, and background to match your brand.</p>
                </div>
              </div>
            </div>

            <hr style={{ borderColor: "rgba(193,201,191,0.3)", margin: "20px 0" }} />

            <p className="text-sm leading-relaxed mb-4" style={{ color: "#414942" }}>
              <strong>Save Draft</strong> saves your changes to our system. <strong>Publish</strong> pushes everything live to your website — changes go live in about 60 seconds.
            </p>

            <p className="text-sm leading-relaxed mb-6" style={{ color: "#8B5E3C" }}>
              For larger changes like new pages, layout updates, or new features, use the chat bubble in the bottom right.
            </p>

            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input type="checkbox" checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} className="rounded" style={{ accentColor: "#4A7C59" }} />
              <span className="text-sm" style={{ color: "#414942" }}>Don&apos;t show this again</span>
            </label>

            <button onClick={dismissModal} className="w-full py-3.5 rounded-md font-bold text-white transition-all active:scale-95" style={{ backgroundColor: "#4A7C59" }}>
              Got it, let&apos;s go
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

      {/* Info Banner */}
      <div className="mb-10 p-5 rounded-lg" style={{ backgroundColor: "#FAF8F5", borderLeft: "4px solid #4A7C59" }}>
        <p className="text-sm leading-relaxed" style={{ color: "#414942" }}>
          <strong style={{ color: "#316342" }}>Need to make a change?</strong> Use the chat bubble in the bottom right to reach us directly. For small updates like text and images, use the editor below. For larger changes — new pages, layout updates, or new features — send us a message and we&apos;ll handle it.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-12 border-b mb-12" style={{ borderColor: "rgba(193,201,191,0.3)" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className="pb-4 relative font-bold transition-colors" style={{ color: activeTab === t.key ? "#316342" : "#414942" }}>
            {t.label}
            {activeTab === t.key && <div className="absolute bottom-[-1.5px] left-0 right-0 h-[2px]" style={{ backgroundColor: "#316342" }} />}
          </button>
        ))}
      </div>

      {/* Hidden file input for image uploads */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && uploadKey) handleImageUpload(f, uploadKey); e.target.value = ""; }} />

      {/* TEXT Tab */}
      {activeTab === "text" && (
        <section className="max-w-4xl space-y-10">
          <h2 className="text-2xl font-bold pl-6" style={{ borderLeft: "2px solid #805533", color: "#1d1c17" }}>Content &amp; Copy</h2>
          {TEXT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-xs uppercase tracking-widest" style={{ color: "#414942" }}>{field.label}</label>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "#717971" }}>{(texts[field.key] || "").length} / {field.maxLen}</span>
              </div>
              <textarea
                className={`w-full bg-transparent border-b border-[#717971] focus:border-[#316342] focus:ring-0 ${field.fontSize} py-3 transition-all resize-none`}
                rows={field.rows}
                placeholder={field.placeholder}
                value={texts[field.key] || ""}
                maxLength={field.maxLen}
                onChange={(e) => { setTexts(prev => ({ ...prev, [field.key]: e.target.value })); setHasChanges(true); }}
                style={{ color: "#1d1c17" }}
              />
            </div>
          ))}
        </section>
      )}

      {/* IMAGES Tab */}
      {activeTab === "images" && (
        <section className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {IMAGE_SLOTS.map((img) => (
              <div key={img.key} className="p-2 group overflow-hidden rounded-lg" style={{ backgroundColor: "#f8f3eb" }}>
                <div className="aspect-video relative overflow-hidden mb-4 flex items-center justify-center rounded" style={{ backgroundColor: "#e7e2da" }}>
                  {uploading === img.key ? (
                    <span className="text-sm" style={{ color: "#316342" }}>Uploading...</span>
                  ) : images[img.key] ? (
                    <img src={images[img.key]} alt={img.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <span className="material-symbols-outlined text-4xl block mb-1" style={{ color: "#c1c9bf" }}>image</span>
                      <span className="text-xs" style={{ color: "#c1c9bf" }}>No image uploaded yet</span>
                    </div>
                  )}
                </div>
                <div className="px-3 pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-base" style={{ color: "#1d1c17" }}>{img.title}</h3>
                      <p className="text-[10px] uppercase tracking-tighter" style={{ color: "#414942", opacity: 0.7 }}>{img.size}</p>
                    </div>
                    <button onClick={() => { setUploadKey(img.key); fileInputRef.current?.click(); }} disabled={!!uploading} className="font-bold text-sm underline underline-offset-4 transition-colors disabled:opacity-50" style={{ color: "#316342" }}>
                      {images[img.key] ? "Replace" : "Upload"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                    <input type="color" value={c.hex} onChange={(e) => { const u = [...colors]; u[i] = { ...u[i], hex: e.target.value }; setColors(u); setHasChanges(true); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
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
          <div className="p-8 rounded-xl space-y-6 sticky top-32" style={{ backgroundColor: "#f8f3eb" }}>
            <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: colors[0]?.hex || "#316342" }}>Live Preview</span>
            <div className="p-6 border rounded-lg space-y-4" style={{ backgroundColor: colors[2]?.hex || "#F5F0E8", borderColor: "rgba(193,201,191,0.2)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
              <div className="h-4 w-1/3 rounded-sm" style={{ backgroundColor: colors[0]?.hex, opacity: 0.2 }} />
              <div className="h-8 w-2/3 rounded-sm" style={{ backgroundColor: "#1d1c17" }} />
              <div className="space-y-2">
                <div className="h-2 w-full rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
                <div className="h-2 w-full rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
                <div className="h-2 w-4/5 rounded-sm" style={{ backgroundColor: "#414942", opacity: 0.1 }} />
              </div>
              <div className="pt-4 flex gap-4">
                <div className="h-10 w-24 rounded-md" style={{ backgroundColor: colors[0]?.hex }} />
                <div className="h-10 w-24 border rounded-md" style={{ borderColor: colors[1]?.hex }} />
              </div>
            </div>
            <p className="text-xs italic text-center px-8" style={{ color: "#414942" }}>Preview reflects your brand colors on the website.</p>
          </div>
        </section>
      )}

      {/* Floating Action Bar */}
      <div className="h-24" />
      <footer className="fixed bottom-8 left-[calc(16rem+3rem)] right-12 z-50 hidden md:block">
        <div className="backdrop-blur-xl border px-8 py-5 flex items-center justify-between rounded-xl" style={{ backgroundColor: "rgba(254,249,241,0.9)", borderColor: "rgba(193,201,191,0.3)", boxShadow: "0 20px 50px rgba(48,20,0,0.1)" }}>
          <div className="flex items-center gap-4">
            {hasChanges ? (
              <><span className="flex h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#ba1a1a" }} /><p className="text-sm italic" style={{ color: "#1d1c17" }}>Unsaved changes</p></>
            ) : saveMsg ? (
              <p className="text-sm italic" style={{ color: saveMsg.includes("isn't connected") || saveMsg.includes("failed") ? "#805533" : "#316342" }}>{saveMsg}</p>
            ) : (
              <p className="text-sm italic" style={{ color: "#717971" }}>All changes saved</p>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={saveDraft} disabled={saving} className="px-6 py-2.5 font-bold border-b transition-all disabled:opacity-50" style={{ color: "#316342", borderColor: "#316342" }}>
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button onClick={() => window.open(window.location.origin, "_blank")} className="px-6 py-2.5 font-bold transition-colors" style={{ color: "#414942" }}>Preview</button>
            <button onClick={handlePublish} disabled={publishing} className="px-10 py-2.5 rounded-md font-bold text-white transition-all active:scale-95 disabled:opacity-50" style={{ backgroundColor: "#316342" }}>
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      </footer>
    </DashboardShell>
  );
}
