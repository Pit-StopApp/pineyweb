"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
// Image uploads handled via file input

interface ContentRow { content_type: string; content_key: string; content_value: string | null; }

const IMAGE_SLOTS = [
  { key: "logo_url", title: "Business Logo", size: "500 x 200 px (PNG)" },
  { key: "hero_image_url", title: "Hero Image", size: "1920 x 1080 px" },
  { key: "gallery_image_1_url", title: "Gallery Image 1", size: "800 x 600 px" },
  { key: "gallery_image_2_url", title: "Gallery Image 2", size: "800 x 600 px" },
  { key: "gallery_image_3_url", title: "Gallery Image 3", size: "800 x 600 px" },
];

const TEXT_KEYS = ["business_name", "tagline", "phone", "email", "address", "hours", "services_offered", "about_text"];

const DEFAULT_COLORS = [
  { key: "primary_color", label: "Primary Color", name: "Primary", hex: "#316342" },
  { key: "secondary_color", label: "Secondary Color", name: "Secondary", hex: "#805533" },
  { key: "background_color", label: "Background Color", name: "Background", hex: "#F5F0E8" },
];

export default function EditSite() {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [deployHookUrl, setDeployHookUrl] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("yoursite.com");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [, setHasChanges] = useState(false);
  const [, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKey] = useState("");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [images, setImages] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [colors, setColors] = useState(DEFAULT_COLORS);

  const loadContent = useCallback(async (cId: string) => {
    const { data } = await supabase.from("pineyweb_site_content").select("content_type, content_key, content_value").eq("client_id", cId);
    if (!data) return;
    const rows = data as ContentRow[];
    const imgMap: Record<string, string> = {};
    const txtMap: Record<string, string> = {};
    const colorUpdates = [...DEFAULT_COLORS];
    const imageKeys = IMAGE_SLOTS.map(f => f.key);
    const colorKeys = DEFAULT_COLORS.map(f => f.key);
    for (const row of rows) {
      const val = row.content_value || "";
      if (row.content_type === "image") { imgMap[row.content_key] = val; continue; }
      if (row.content_type === "text") { txtMap[row.content_key] = val; continue; }
      if (row.content_type === "color") { const idx = colorUpdates.findIndex(c => c.key === row.content_key); if (idx >= 0 && val) colorUpdates[idx] = { ...colorUpdates[idx], hex: val }; continue; }
      if (row.content_type === "onboarding" && val) {
        if (imageKeys.includes(row.content_key)) imgMap[row.content_key] = val;
        else if (colorKeys.includes(row.content_key)) { const idx = colorUpdates.findIndex(c => c.key === row.content_key); if (idx >= 0) colorUpdates[idx] = { ...colorUpdates[idx], hex: val }; }
        else if (TEXT_KEYS.includes(row.content_key)) txtMap[row.content_key] = val;
      }
    }
    setImages(imgMap); setTexts(txtMap); setColors(colorUpdates);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      let clientRow = null;
      const { data } = await supabase.from("pineyweb_clients").select("id, business_name, status, deploy_hook_url, site_url").eq("user_id", session.user.id).single();
      if (data) clientRow = data;
      else { try { const r = await fetch("/api/auth/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: session.user.id }) }); const f = await r.json(); if (f.data) clientRow = f.data; } catch {} }
      if (!clientRow) { setLoading(false); return; }
      if (clientRow.status === "pending" || clientRow.status === "active") { router.push("/dashboard/onboarding"); return; }
      setClientId(clientRow.id);
      setDeployHookUrl(clientRow.deploy_hook_url || null);
      if (clientRow.site_url) setSiteUrl(clientRow.site_url.replace(/^https?:\/\//, ""));
      await loadContent(clientRow.id);
      setLoading(false);
      if (typeof window !== "undefined" && localStorage.getItem("piney_edit_modal_seen") !== "true") setShowHelpModal(true);
    };
    checkAuth();
  }, [router, loadContent]);

  const saveDraft = async () => {
    if (!clientId) return; setSaving(true); setSaveMsg("");
    const rows: { client_id: string; content_type: string; content_key: string; content_value: string }[] = [];
    for (const [k, v] of Object.entries(images)) rows.push({ client_id: clientId, content_type: "image", content_key: k, content_value: v });
    for (const [k, v] of Object.entries(texts)) rows.push({ client_id: clientId, content_type: "text", content_key: k, content_value: v });
    for (const c of colors) rows.push({ client_id: clientId, content_type: "color", content_key: c.key, content_value: c.hex });
    await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId);
    const { error } = await supabase.from("pineyweb_site_content").insert(rows);
    setSaveMsg(error ? "Save failed." : "Draft saved!"); if (!error) setHasChanges(false);
    setSaving(false); setTimeout(() => setSaveMsg(""), 3000);
  };

  const handlePublish = async () => {
    if (!clientId) return; setPublishing(true); setSaveMsg("");
    const rows: { client_id: string; content_type: string; content_key: string; content_value: string }[] = [];
    for (const [k, v] of Object.entries(images)) rows.push({ client_id: clientId, content_type: "image", content_key: k, content_value: v });
    for (const [k, v] of Object.entries(texts)) rows.push({ client_id: clientId, content_type: "text", content_key: k, content_value: v });
    for (const c of colors) rows.push({ client_id: clientId, content_type: "color", content_key: c.key, content_value: c.hex });
    await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId);
    await supabase.from("pineyweb_site_content").insert(rows);
    if (!deployHookUrl) { setSaveMsg("Your site isn't connected yet. Contact us via chat to complete setup."); }
    else { try { await fetch(deployHookUrl, { method: "POST" }); setSaveMsg("Changes will be live in about 60 seconds."); setHasChanges(false); } catch { setSaveMsg("Deploy failed."); } }
    setPublishing(false); setTimeout(() => setSaveMsg(""), 5000);
  };

  const handleImageUpload = async (file: File, key: string) => {
    if (!clientId) return; setUploading(key);
    const path = `${clientId}/${key}.${file.name.split(".").pop() || "png"}`;
    const { error } = await supabase.storage.from("pineyweb-assets").upload(path, file, { upsert: true });
    if (!error) { const { data: u } = supabase.storage.from("pineyweb-assets").getPublicUrl(path); setImages(p => ({ ...p, [key]: u.publicUrl + `?t=${Date.now()}` })); setHasChanges(true); }
    setUploading(null);
  };

  const dismissModal = () => { if (dontShowAgain) localStorage.setItem("piney_edit_modal_seen", "true"); setShowHelpModal(false); setDontShowAgain(false); };
  const set = (k: string, v: string) => { setTexts(p => ({ ...p, [k]: v })); setHasChanges(true); };

  if (loading) return <div className="flex items-center justify-center py-32"><p style={{ color: "#414942" }}>Loading...</p></div>;

  // Parse services for preview
  const services = (texts.services_offered || "").split(",").map(s => s.trim()).filter(Boolean);
  const serviceIcons = ["door_front", "forest", "architecture", "build", "handyman"];
  const addressCity = (texts.address || "").split(",").slice(1).join(",").trim();

  return (
    <>
      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-[520px] p-8 md:p-10 rounded-xl" style={{ backgroundColor: "#F5F0E8", boxShadow: "0 20px 60px rgba(48,20,0,0.15)" }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: "#4A7C59" }}>How Your Edit Page Works</h2>
            <div className="space-y-5 mb-6">
              {[["edit_note", "Text Fields", "Update your business name, tagline, contact info, hours, and description. Changes appear in the live preview instantly."],
                ["image", "Images", "Upload your logo, hero image, and gallery photos via the Images tab (coming soon)."],
                ["palette", "Colors", "Adjust your brand colors via the Colors tab (coming soon)."]
              ].map(([icon, title, desc]) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-lg mt-0.5" style={{ color: "#4A7C59" }}>{icon}</span>
                  <div><p className="font-bold text-sm mb-1" style={{ color: "#1d1c17" }}>{title}</p><p className="text-sm leading-relaxed" style={{ color: "#414942" }}>{desc}</p></div>
                </div>
              ))}
            </div>
            <hr style={{ borderColor: "rgba(193,201,191,0.3)", margin: "20px 0" }} />
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#414942" }}><strong>Save Draft</strong> saves changes. <strong>Publish</strong> pushes everything live in ~60 seconds.</p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "#8B5E3C" }}>For larger changes, use the chat bubble in the bottom right.</p>
            <label className="flex items-center gap-2 mb-5 cursor-pointer"><input type="checkbox" checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} style={{ accentColor: "#4A7C59" }} /><span className="text-sm" style={{ color: "#414942" }}>Don&apos;t show this again</span></label>
            <button onClick={dismissModal} className="w-full py-3.5 rounded-md font-bold text-white active:scale-95" style={{ backgroundColor: "#4A7C59" }}>Got it, let&apos;s go</button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && uploadKey) handleImageUpload(f, uploadKey); e.target.value = ""; }} />

      {/* Info Banner */}
      <div className="mb-8 p-5 rounded-lg" style={{ backgroundColor: "#FAF8F5", borderLeft: "4px solid #4A7C59" }}>
        <p className="text-sm leading-relaxed" style={{ color: "#414942" }}>
          <strong style={{ color: "#316342" }}>Need to make a change?</strong> Use the chat bubble to reach us. For small updates use the editor below. For larger changes — send us a message.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-12 items-start">
        {/* Left: Form (40%) */}
        <section className="w-full md:w-[40%] space-y-10">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.2em] font-bold mb-2 block" style={{ color: "#805533" }}>Editor Mode</span>
              <h1 className="text-3xl md:text-4xl font-semibold" style={{ color: "#316342" }}>Website Details</h1>
              <p className="mt-2 text-sm max-w-md" style={{ color: "#414942" }}>Update your business identity. Changes are reflected instantly in the live preview to the right.</p>
            </div>
            <button onClick={() => setShowHelpModal(true)} title="How does this work?" className="w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold flex-shrink-0" style={{ borderColor: "#4A7C59", color: "#4A7C59", backgroundColor: "#FAF8F5" }}>?</button>
          </div>

          <div className="space-y-8">
            <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Business Name</label><input value={texts.business_name || ""} onChange={e => set("business_name", e.target.value)} placeholder="Enter business name" className="w-full bg-transparent border-0 border-b py-2 text-xl font-semibold focus:ring-0 transition-all" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
            <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Tagline</label><input value={texts.tagline || ""} onChange={e => set("tagline", e.target.value)} placeholder="Enter business tagline" className="w-full bg-transparent border-0 border-b py-2 text-lg focus:ring-0 transition-all" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
            <div className="grid grid-cols-2 gap-6">
              <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Phone</label><input value={texts.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="Phone number" className="w-full bg-transparent border-0 border-b py-2 focus:ring-0 transition-all" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
              <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Email</label><input value={texts.email || ""} onChange={e => set("email", e.target.value)} placeholder="Business email" type="email" className="w-full bg-transparent border-0 border-b py-2 focus:ring-0 transition-all" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
            </div>
            <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Address</label><input value={texts.address || ""} onChange={e => set("address", e.target.value)} placeholder="Full address" className="w-full bg-transparent border-0 border-b py-2 focus:ring-0 transition-all" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
            <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Operating Hours</label><input value={texts.hours || ""} onChange={e => set("hours", e.target.value)} placeholder="e.g. Mon-Fri 8am-5pm" className="w-full bg-transparent border-0 border-b py-2 focus:ring-0 transition-all" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
            <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Services</label><textarea value={texts.services_offered || ""} onChange={e => set("services_offered", e.target.value)} placeholder="List your key services, separated by commas..." rows={3} className="w-full bg-transparent border-0 border-b py-2 focus:ring-0 transition-all resize-none" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
            <div><label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(65,73,66,0.7)" }}>Business Description</label><textarea value={texts.about_text || ""} onChange={e => set("about_text", e.target.value)} placeholder="Tell your story..." rows={4} className="w-full bg-transparent border-0 border-b py-2 focus:ring-0 transition-all resize-none" style={{ borderColor: "#717971", color: "#1d1c17" }} /></div>
          </div>

          {/* Save/Publish + status */}
          {saveMsg && <p className="text-sm italic" style={{ color: saveMsg.includes("failed") || saveMsg.includes("isn't") ? "#805533" : "#316342" }}>{saveMsg}</p>}
          <div className="flex items-center gap-4 pt-4">
            <button onClick={saveDraft} disabled={saving} className="px-8 py-3 rounded-md border font-bold transition-colors active:scale-95 disabled:opacity-50" style={{ borderColor: "#316342", color: "#316342" }}>{saving ? "Saving..." : "Save Draft"}</button>
            <button onClick={handlePublish} disabled={publishing} className="px-8 py-3 rounded-md font-bold text-white transition-colors active:scale-95 disabled:opacity-50" style={{ backgroundColor: "#316342", boxShadow: "0 4px 12px rgba(49,99,66,0.2)" }}>{publishing ? "Publishing..." : "Publish Changes"}</button>
          </div>
        </section>

        {/* Right: Live Preview (60%) */}
        <aside className="w-full md:w-[60%] md:sticky md:top-28">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.15em] font-medium" style={{ color: "#414942" }}>Live Preview — changes appear here as you type</span>
            <div className="flex gap-2 items-center">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#316342" }} />
              <span className="text-[10px] font-bold uppercase tracking-tighter" style={{ color: "#316342" }}>Syncing</span>
            </div>
          </div>

          <div className="relative rounded-xl overflow-hidden border flex flex-col" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)", boxShadow: "0 20px 60px rgba(48,20,0,0.08)", aspectRatio: "16/10" }}>
            {/* Browser Chrome */}
            <div className="h-8 flex items-center px-4 gap-1.5 border-b" style={{ backgroundColor: "#e7e2da", borderColor: "rgba(193,201,191,0.3)" }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "rgba(113,121,113,0.6)" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "rgba(113,121,113,0.6)" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "rgba(113,121,113,0.6)" }} />
              <div className="mx-auto px-6 py-0.5 rounded text-[10px]" style={{ backgroundColor: "#f8f3eb", color: "rgba(65,73,66,0.6)" }}>{siteUrl}</div>
            </div>

            {/* Mini Site */}
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "#fef9f1" }}>
              {/* Header */}
              <header className="px-6 py-4 flex justify-between items-center border-b" style={{ backgroundColor: "rgba(255,255,255,0.5)", borderColor: "#ece8e0" }}>
                <div>
                  <span className="text-sm font-bold" style={{ color: "#316342" }}>{texts.business_name || "Your Business"}</span>
                  {addressCity && <span className="block text-[8px] uppercase tracking-widest" style={{ color: "#805533" }}>{addressCity}</span>}
                </div>
                <nav className="flex gap-4"><span className="text-[10px]" style={{ color: "#414942" }}>Gallery</span><span className="text-[10px] font-bold border-b" style={{ color: "#316342", borderColor: "rgba(49,99,66,0.4)" }}>Connect</span></nav>
              </header>

              {/* Hero */}
              <section className="relative h-64 overflow-hidden" style={{ backgroundColor: "#e7e2da" }}>
                <div className="absolute inset-0 flex flex-col justify-center px-10 z-10" style={{ backgroundColor: "rgba(49,99,66,0.1)" }}>
                  <div className="w-16 h-0.5 mb-4" style={{ backgroundColor: "#805533" }} />
                  <h2 className="text-2xl md:text-3xl max-w-xs leading-tight" style={{ color: "#1d1c17" }}>{texts.tagline || "Your tagline here."}</h2>
                  <p className="text-[11px] mt-3 max-w-[240px]" style={{ color: "#414942" }}>{(texts.about_text || "Your business description will appear here.").slice(0, 120)}</p>
                  <div className="mt-6 flex gap-3">
                    <div className="px-4 py-1.5 text-[10px] font-bold rounded-sm text-white" style={{ backgroundColor: "#316342" }}>View Work</div>
                    <div className="px-4 py-1.5 text-[10px] font-bold rounded-sm border" style={{ color: "#316342", borderColor: "#316342" }}>Our Process</div>
                  </div>
                </div>
              </section>

              {/* Services */}
              {services.length > 0 && (
                <section className="p-8" style={{ backgroundColor: "#f8f3eb" }}>
                  <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "#805533" }}>What we offer</span>
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    {services.slice(0, 3).map((s, i) => (
                      <div key={i} className="space-y-1">
                        <span className="material-symbols-outlined text-lg" style={{ color: "#316342" }}>{serviceIcons[i % serviceIcons.length]}</span>
                        <h4 className="text-[11px] font-bold" style={{ color: "#1d1c17" }}>{s}</h4>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Footer */}
              <footer className="p-8 flex justify-between items-start text-white" style={{ backgroundColor: "#1d1c17" }}>
                <div className="space-y-3">
                  <h3 className="text-lg italic">Let&apos;s build together.</h3>
                  <div className="space-y-1 text-[10px]" style={{ color: "rgba(231,226,218,0.7)" }}>
                    {texts.phone && <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[12px]">call</span> {texts.phone}</p>}
                    {texts.address && <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[12px]">pin_drop</span> {texts.address}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] opacity-50 block uppercase tracking-tighter mb-3">{texts.business_name || "Business"} &copy; 2026</span>
                  {texts.hours && (
                    <div className="inline-block p-3 border rounded-md" style={{ borderColor: "rgba(254,249,241,0.2)", backgroundColor: "rgba(49,99,66,0.2)" }}>
                      <span className="text-[10px] font-bold block">Open Hours</span>
                      <span className="text-[11px] opacity-80 italic">{texts.hours}</span>
                    </div>
                  )}
                </div>
              </footer>
            </div>
          </div>

          {/* Preview Controls */}
          <div className="mt-6 flex justify-center gap-6">
            <button className="flex items-center gap-2 text-xs" style={{ color: "#414942" }}><span className="material-symbols-outlined text-base">desktop_windows</span> Desktop</button>
            <button className="flex items-center gap-2 text-xs" style={{ color: "rgba(65,73,66,0.4)" }}><span className="material-symbols-outlined text-base">smartphone</span> Mobile</button>
            <button className="flex items-center gap-2 text-xs" style={{ color: "rgba(65,73,66,0.4)" }}><span className="material-symbols-outlined text-base">open_in_new</span> External Preview</button>
          </div>
        </aside>
      </div>
    </>
  );
}
