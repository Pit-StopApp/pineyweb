"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const STEPS = [
  { num: 1, label: "Your Business", icon: "storefront" },
  { num: 2, label: "Your Style", icon: "palette" },
  { num: 3, label: "Your Accounts", icon: "manage_accounts" },
];

export default function Onboarding() {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1 fields
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  // Step 2 toggles
  const [hasLogo, setHasLogo] = useState(false);
  const [hasColors, setHasColors] = useState(false);

  // Step 3 toggles
  const [hasDomain, setHasDomain] = useState(true);
  const [needsLogins, setNeedsLogins] = useState(false);
  const [needsPayments, setNeedsPayments] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data } = await supabase.from("pineyweb_clients").select("id, full_name, business_name, status").eq("user_id", session.user.id).single();
      if (!data) { router.push("/?pending=1"); return; }
      if (data.status === "live" || data.status === "in_progress") { router.push("/dashboard/edit"); return; }
      setClientId(data.id);
      setClientName(data.full_name || data.business_name || "Client");

      // Load existing onboarding data
      const { data: content } = await supabase.from("pineyweb_site_content").select("content_key, content_value").eq("client_id", data.id).eq("content_type", "onboarding");
      if (content) {
        const map: Record<string, string> = {};
        for (const row of content) { if (row.content_value) map[row.content_key] = row.content_value; }
        setF(map);
        if (map.logo_url) setHasLogo(true);
        if (map.primary_color) setHasColors(true);
      }
      setLoading(false);
    };
    init();
  }, [router]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const saveStep = async () => {
    if (!clientId) return;
    setSaving(true);
    const keys = step === 1
      ? ["business_name", "tagline", "phone", "email", "address", "hours", "services_offered", "service_area", "business_description"]
      : step === 2
      ? ["logo_url", "primary_color", "accent_color", "admired_websites", "styles_to_avoid"]
      : ["has_domain", "needs_logins", "needs_payments", "extra_notes"];

    for (const key of keys) {
      let val = f[key] || "";
      if (step === 3) {
        if (key === "has_domain") val = hasDomain ? "yes" : "no";
        if (key === "needs_logins") val = needsLogins ? "yes" : "no";
        if (key === "needs_payments") val = needsPayments ? "yes" : "no";
        if (key === "extra_notes") val = f.extra_notes || "";
      }
      if (!val && key !== "has_domain" && key !== "needs_logins" && key !== "needs_payments") continue;
      // Delete existing then insert
      await supabase.from("pineyweb_site_content").delete().eq("client_id", clientId).eq("content_key", key).eq("content_type", "onboarding");
      await supabase.from("pineyweb_site_content").insert({ client_id: clientId, content_type: "onboarding", content_key: key, content_value: val });
    }

    if (step < 3) {
      setStep(step + 1);
    } else {
      // Final step — mark in_progress
      await supabase.from("pineyweb_clients").update({ status: "in_progress" }).eq("id", clientId);
      router.push("/dashboard?onboarded=1");
    }
    setSaving(false);
  };

  const handleLogoUpload = async (file: File) => {
    if (!clientId) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${clientId}/logo.${ext}`;
    await supabase.storage.from("pineyweb-assets").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("pineyweb-assets").getPublicUrl(path);
    set("logo_url", data.publicUrl + `?t=${Date.now()}`);
    setUploading(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F0E8" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const inputClass = "w-full bg-transparent border-0 border-b-2 px-0 py-2 transition-all text-lg focus:ring-0" as const;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F5F0E8", fontFamily: "'Lora', serif" }}>
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b backdrop-blur-xl" style={{ backgroundColor: "rgba(254,249,241,0.8)", borderColor: "rgba(193,201,191,0.3)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <Link href="/" className="text-xl font-bold tracking-tight" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <div className="flex items-center gap-6">
            <span className="text-sm" style={{ color: "#414942" }}>{clientName}</span>
            <button onClick={handleLogout} className="text-sm font-bold transition-colors" style={{ color: "#316342" }}>Logout</button>
          </div>
        </div>
      </header>

      <main className="flex-grow pt-28 pb-24 px-4 flex flex-col items-center">
        {/* Stepper */}
        <div className="w-full max-w-[680px] mb-12">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 w-full h-[1px] -z-10" style={{ backgroundColor: "rgba(193,201,191,0.3)" }} />
            {STEPS.map((s) => {
              const completed = s.num < step;
              const active = s.num === step;
              return (
                <div key={s.num} className="flex flex-col items-center" style={{ backgroundColor: "#F5F0E8", padding: "0 8px" }}>
                  <div className="flex items-center justify-center mb-2 rounded-full" style={{
                    width: active ? 40 : 32, height: active ? 40 : 32,
                    backgroundColor: completed ? "#805533" : active ? "#4A7C59" : "#e7e2da",
                    color: completed || active ? "#fff" : "#414942",
                    boxShadow: active ? "0 0 0 4px rgba(74,124,89,0.1)" : undefined,
                  }}>
                    {completed ? <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span> : <span className="text-sm font-bold">{s.num}</span>}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: completed ? "#805533" : active ? "#4A7C59" : "#414942", opacity: completed || active ? 1 : 0.5 }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-[680px] p-8 md:p-12 rounded-xl" style={{ backgroundColor: "#ffffff", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>

          {/* Step 1 */}
          {step === 1 && (
            <>
              <div className="mb-10">
                <span className="text-xs uppercase tracking-[0.15em] font-bold mb-2 block" style={{ color: "#805533" }}>Foundations</span>
                <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-3" style={{ color: "#1d1c17" }}>Business Profile</h1>
                <p className="text-lg" style={{ color: "#414942" }}>Let&apos;s begin with the essentials. This information will help us craft your digital identity.</p>
              </div>
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Business Name" value={f.business_name} onChange={v => set("business_name", v)} placeholder="e.g. Smith's Auto Shop" cls={inputClass} />
                  <Field label="Tagline" value={f.tagline} onChange={v => set("tagline", v)} placeholder="Your brand's core promise" cls={inputClass} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Business Phone Number" value={f.phone} onChange={v => set("phone", v)} placeholder="(555) 000-0000" cls={inputClass} type="tel" />
                  <div className="space-y-2">
                    <Field label="Business Email (customer-facing)" value={f.email} onChange={v => set("email", v)} placeholder="hello@yourbusiness.com" cls={inputClass} type="email" />
                    <p className="text-xs" style={{ color: "#717971" }}>This is the email your customers will use to contact you — not your personal email.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Business Address" value={f.address} onChange={v => set("address", v)} placeholder="123 Main St, Longview, TX" cls={inputClass} />
                  <Field label="Business Hours" value={f.hours} onChange={v => set("hours", v)} placeholder="Mon-Fri, 8am - 5pm" cls={inputClass} />
                </div>
                <TextArea label="Services Offered" value={f.services_offered} onChange={v => set("services_offered", v)} placeholder="List your primary services, separated by commas..." rows={3} cls={inputClass} />
                <TextArea label="Service Area" value={f.service_area} onChange={v => set("service_area", v)} placeholder="Cities, counties, or radius you serve..." rows={2} cls={inputClass} />
                <TextArea label="Brief Business Description" value={f.business_description} onChange={v => set("business_description", v)} placeholder="Tell us about your history, values, and what makes you unique..." rows={4} cls={inputClass} />
              </div>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <div className="mb-10 text-center">
                <span className="inline-block px-3 py-1 rounded-full text-[10px] uppercase tracking-widest mb-4 text-white" style={{ backgroundColor: "#6e745f" }}>Design Discovery</span>
                <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-3" style={{ color: "#1d1c17" }}>Define your visual voice.</h1>
                <p className="text-lg" style={{ color: "#414942" }}>Help us understand the aesthetic you&apos;re aiming for. No right or wrong answers.</p>
              </div>
              <div className="space-y-10">
                {/* Logo */}
                <div className="space-y-4">
                  <Toggle label="Do you have a logo?" value={hasLogo} onChange={setHasLogo} />
                  {hasLogo && (
                    <div className="p-6 border-2 border-dashed rounded-lg flex flex-col items-center gap-3 cursor-pointer" style={{ borderColor: "rgba(193,201,191,0.5)", backgroundColor: "#f8f3eb" }} onClick={() => fileRef.current?.click()}>
                      {f.logo_url ? (
                        <img src={f.logo_url} alt="Logo" className="max-h-24 object-contain" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-3xl" style={{ color: "#4A7C59" }}>cloud_upload</span>
                          <p className="text-sm font-medium" style={{ color: "#1d1c17" }}>{uploading ? "Uploading..." : "Click to upload"}</p>
                          <p className="text-xs" style={{ color: "#414942" }}>SVG, PNG, or JPG (Max. 5MB)</p>
                        </>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const fl = e.target.files?.[0]; if (fl) handleLogoUpload(fl); e.target.value = ""; }} />
                    </div>
                  )}
                </div>
                {/* Colors */}
                <div className="space-y-6 pt-4" style={{ borderTop: "1px solid rgba(193,201,191,0.1)" }}>
                  <Toggle label="Do you have brand colors?" value={hasColors} onChange={setHasColors} />
                  {hasColors && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ColorPicker label="Primary Brand Color" value={f.primary_color || "#316342"} onChange={v => set("primary_color", v)} />
                      <ColorPicker label="Accent Color" value={f.accent_color || "#805533"} onChange={v => set("accent_color", v)} />
                    </div>
                  )}
                </div>
                {/* Textareas */}
                <div className="space-y-8 pt-4" style={{ borderTop: "1px solid rgba(193,201,191,0.1)" }}>
                  <div>
                    <label className="block text-lg font-semibold mb-2" style={{ color: "#1d1c17" }}>Any websites you admire?</label>
                    <p className="text-sm mb-4" style={{ color: "#414942" }}>Provide 2-3 links or descriptions that inspire you.</p>
                    <textarea value={f.admired_websites || ""} onChange={e => set("admired_websites", e.target.value)} placeholder="https://apple.com, or 'The layout of National Geographic'" rows={3} className="w-full bg-transparent border-0 border-b-2 px-0 py-2 focus:ring-0 transition-all" style={{ borderColor: "rgba(113,121,113,0.4)", color: "#1d1c17" }} />
                  </div>
                  <div>
                    <label className="block text-lg font-semibold mb-2" style={{ color: "#1d1c17" }}>Any styles or colors to avoid?</label>
                    <p className="text-sm mb-4" style={{ color: "#414942" }}>Anything that feels off-brand for your business?</p>
                    <textarea value={f.styles_to_avoid || ""} onChange={e => set("styles_to_avoid", e.target.value)} placeholder="e.g. 'Neon colors', 'Excessive animations'" rows={3} className="w-full bg-transparent border-0 border-b-2 px-0 py-2 focus:ring-0 transition-all" style={{ borderColor: "rgba(113,121,113,0.4)", color: "#1d1c17" }} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <div className="mb-8">
                <span className="text-[11px] uppercase tracking-[0.1em] font-bold mb-2 block" style={{ color: "#805533" }}>Step 03 — Infrastructure</span>
                <h1 className="text-3xl md:text-4xl font-bold leading-tight" style={{ color: "#1d1c17" }}>Technical Foundations</h1>
                <p className="mt-3 leading-relaxed" style={{ color: "#414942" }}>Let&apos;s coordinate the essential services that will power your digital presence.</p>
              </div>
              <div className="space-y-8">
                {/* Domain */}
                <section className="space-y-4">
                  <Toggle label="Do you already have a domain?" value={hasDomain} onChange={setHasDomain} />
                  {!hasDomain && (
                    <div className="p-5 rounded-md flex items-start gap-4" style={{ backgroundColor: "#f8f3eb", borderLeft: "4px solid rgba(128,85,51,0.4)" }}>
                      <span className="material-symbols-outlined" style={{ color: "#805533" }}>language</span>
                      <div>
                        <p className="text-sm mb-2" style={{ color: "#414942" }}>You&apos;ll need a domain before we can launch your site. Head to Namecheap and grab one before someone else does.</p>
                        <a href="https://namecheap.com" target="_blank" rel="noopener noreferrer" className="text-sm font-bold underline underline-offset-4" style={{ color: "#316342" }}>namecheap.com &rarr; Find your domain</a>
                      </div>
                    </div>
                  )}
                  {hasDomain && (
                    <div className="p-5 rounded-md" style={{ backgroundColor: "#f8f3eb", borderLeft: "4px solid rgba(74,124,89,0.4)" }}>
                      <div className="flex items-start gap-4 mb-3">
                        <span className="material-symbols-outlined" style={{ color: "#4A7C59" }}>language</span>
                        <p className="text-sm" style={{ color: "#414942" }}>Perfect. To give us access to your domain settings:</p>
                      </div>
                      <div className="pl-10 text-sm" style={{ color: "#414942" }}>
                        <ol className="list-decimal pl-4 space-y-1 mb-3">
                          <li>Log into Namecheap</li>
                          <li>Go to Account &rarr; Sharing &amp; Transfer</li>
                          <li>Share access with <strong>info@pineyweb.com</strong></li>
                          <li>Send us a message in the chat to let us know it&apos;s done</li>
                        </ol>
                        <p className="italic text-xs" style={{ color: "#717971" }}>Not on Namecheap? No problem — just send us a message in the chat and we&apos;ll walk you through it.</p>
                      </div>
                    </div>
                  )}
                </section>
                {/* Logins */}
                <section className="space-y-4 pt-8" style={{ borderTop: "1px solid rgba(193,201,191,0.1)" }}>
                  <Toggle label="Will your site need user logins?" value={needsLogins} onChange={setNeedsLogins} />
                  {needsLogins && (
                    <div className="p-5 rounded-md" style={{ backgroundColor: "#f8f3eb", borderLeft: "4px solid rgba(74,124,89,0.4)" }}>
                      <div className="flex items-start gap-4 mb-3">
                        <span className="material-symbols-outlined" style={{ color: "#4A7C59" }}>database</span>
                        <p className="text-sm" style={{ color: "#414942" }}>You&apos;ll need a free Supabase account for user authentication and data storage.</p>
                      </div>
                      <div className="pl-10 text-sm" style={{ color: "#414942" }}>
                        <p className="font-semibold mb-2" style={{ color: "#1d1c17" }}>Once your account is created:</p>
                        <ol className="list-decimal pl-4 space-y-1 mb-3">
                          <li>Create a new project</li>
                          <li>Go to Project Settings &rarr; Team</li>
                          <li>Invite <strong>info@pineyweb.com</strong> as a team member</li>
                          <li>Send us a message in the chat with your project URL so we can get started</li>
                        </ol>
                        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4" style={{ color: "#316342" }}>supabase.com &rarr; Sign up free</a>
                      </div>
                    </div>
                  )}
                </section>
                {/* Payments */}
                <section className="space-y-4 pt-8" style={{ borderTop: "1px solid rgba(193,201,191,0.1)" }}>
                  <Toggle label="Will you sell products or take payments?" value={needsPayments} onChange={setNeedsPayments} />
                  {needsPayments && (
                    <div className="p-5 rounded-md" style={{ backgroundColor: "#f8f3eb", borderLeft: "4px solid rgba(128,85,51,0.4)" }}>
                      <div className="flex items-start gap-4 mb-3">
                        <span className="material-symbols-outlined" style={{ color: "#805533" }}>payments</span>
                        <p className="text-sm" style={{ color: "#414942" }}>You&apos;ll need your own Stripe account to process payments. Stripe is free to set up — you only pay a small fee per transaction.</p>
                      </div>
                      <div className="pl-10 text-sm" style={{ color: "#414942" }}>
                        <p className="font-semibold mb-2" style={{ color: "#1d1c17" }}>Once your account is created:</p>
                        <ol className="list-decimal pl-4 space-y-1 mb-3">
                          <li>Go to Settings &rarr; Team</li>
                          <li>Invite <strong>info@pineyweb.com</strong> as an Administrator</li>
                          <li>Send us a message in the chat so we can integrate payments into your site</li>
                        </ol>
                        <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4" style={{ color: "#316342" }}>stripe.com &rarr; Create account</a>
                      </div>
                    </div>
                  )}
                </section>
                {/* Extra notes */}
                <section className="space-y-4 pt-4">
                  <label className="text-xl font-semibold" style={{ color: "#1d1c17" }}>Anything else we should know?</label>
                  <textarea value={f.extra_notes || ""} onChange={e => set("extra_notes", e.target.value)} placeholder="Special requirements, legacy data, third-party tools..." rows={4} className="w-full bg-transparent border-0 border-b-2 px-0 py-2 focus:ring-0 transition-all" style={{ borderColor: "rgba(193,201,191,0.3)", color: "#1d1c17" }} />
                </section>
              </div>
            </>
          )}

          {/* Buttons */}
          <div className="pt-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <button onClick={() => { if (step < 3) setStep(step + 1); else router.push("/dashboard"); }} className="text-sm uppercase tracking-widest underline underline-offset-4 transition-colors" style={{ color: "#414942", textDecorationColor: "rgba(193,201,191,0.4)" }}>
              Skip for now
            </button>
            <button onClick={saveStep} disabled={saving} className="w-full md:w-auto px-10 py-4 rounded-md font-bold text-white transition-all active:scale-95 disabled:opacity-50" style={{ backgroundColor: "#4A7C59", boxShadow: "0 4px 12px rgba(74,124,89,0.2)" }}>
              {saving ? "Saving..." : step === 3 ? "Complete Setup" : "Save & Continue"}
            </button>
          </div>
        </div>

        <p className="text-center mt-12 text-[11px] uppercase tracking-[0.2em] max-w-[680px]" style={{ color: "rgba(65,73,66,0.5)" }}>
          Crafting Excellence &bull; &copy; 2026 Piney Web Co.
        </p>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 h-16 z-50 border-t" style={{ backgroundColor: "#fef9f1", borderColor: "rgba(193,201,191,0.3)" }}>
        {STEPS.map(s => (
          <button key={s.num} onClick={() => s.num <= step && setStep(s.num)} className="flex flex-col items-center justify-center px-4 py-1 rounded-md" style={{ color: s.num === step ? "#316342" : "#414942", backgroundColor: s.num === step ? "#f8f3eb" : "transparent" }}>
            <span className="material-symbols-outlined text-lg">{s.icon}</span>
            <span className="text-[10px] uppercase tracking-wider">{s.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, cls, type = "text" }: { label: string; value?: string; onChange: (v: string) => void; placeholder: string; cls: string; type?: string }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm uppercase tracking-wider" style={{ color: "rgba(65,73,66,0.8)" }}>{label}</label>
      <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={{ borderColor: "rgba(113,121,113,0.4)", color: "#1d1c17" }} />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows, cls }: { label: string; value?: string; onChange: (v: string) => void; placeholder: string; rows: number; cls: string }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm uppercase tracking-wider" style={{ color: "rgba(65,73,66,0.8)" }}>{label}</label>
      <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`${cls} resize-none`} style={{ borderColor: "rgba(113,121,113,0.4)", color: "#1d1c17" }} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-lg font-semibold" style={{ color: "#1d1c17" }}>{label}</label>
      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: "#414942" }}>No</span>
        <button type="button" onClick={() => onChange(!value)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ backgroundColor: value ? "#4A7C59" : "#e7e2da" }}>
          <span className="inline-block h-4 w-4 transform rounded-full bg-white transition duration-200" style={{ transform: value ? "translateX(22px)" : "translateX(4px)" }} />
        </button>
        <span className="text-sm font-bold" style={{ color: value ? "#4A7C59" : "#414942" }}>Yes</span>
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-widest" style={{ color: "#414942" }}>{label}</label>
      <div className="flex items-center gap-3 p-2 rounded border" style={{ backgroundColor: "#fef9f1", borderColor: "rgba(193,201,191,0.3)" }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-10 border-none rounded bg-transparent cursor-pointer" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="flex-1 bg-transparent border-none text-sm font-mono focus:ring-0" />
      </div>
    </div>
  );
}
