"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Result { place_id: string; business_name: string; address: string; city: string; phone: string | null; email: string | null; email_source: string | null; rating: number | null; review_count: number | null; priority_tier: 1 | 2; }
interface Stats { raw: number; chains_removed: number; has_website: number; zero_reviews_skipped: number; already_in_crm: number; new_prospects: number; tier_1: number; tier_2: number; emails_found: number; }

export default function ScannerPage() {
  const router = useRouter();
  const [city, setCity] = useState("Longview");
  const [state, setState] = useState("TX");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [stats, setStats] = useState<Stats>({ raw: 0, chains_removed: 0, has_website: 0, zero_reviews_skipped: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0, emails_found: 0 });
  // Prospects auto-saved by scanner API
  const [emailed, setEmailed] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("Admin");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: me } = await supabase.from("pineyweb_clients").select("role, full_name").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }
      setAdminName(me.full_name || "Admin");
      setLoading(false);
    };
    init();
  }, [router]);

  const mergeStats = (prev: Stats, next: Stats): Stats => ({
    raw: prev.raw + next.raw, chains_removed: prev.chains_removed + next.chains_removed,
    has_website: prev.has_website + next.has_website, zero_reviews_skipped: prev.zero_reviews_skipped + (next.zero_reviews_skipped || 0),
    already_in_crm: prev.already_in_crm + next.already_in_crm,
    new_prospects: prev.new_prospects + next.new_prospects, tier_1: prev.tier_1 + next.tier_1, tier_2: prev.tier_2 + next.tier_2, emails_found: prev.emails_found + (next.emails_found || 0),
  });

  const runScan = async () => {
    setScanning(true); setResults([]); setProgressPct(0);
    setStats({ raw: 0, chains_removed: 0, has_website: 0, zero_reviews_skipped: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0, emails_found: 0 });
    const allResults: Result[] = [];
    const seenIds = new Set<string>();
    let dupeCount = 0;
    const addResults = (results: Result[]) => {
      for (const r of results) {
        if (seenIds.has(r.place_id)) { dupeCount++; continue; }
        seenIds.add(r.place_id);
        allResults.push(r);
      }
    };
    let runningStats: Stats = { raw: 0, chains_removed: 0, has_website: 0, zero_reviews_skipped: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0, emails_found: 0 };
    const totalSteps = 9 + 6 + 1;
    let step = 0;

    let batch = 0, done = false;
    while (!done) {
      step++; setProgressPct(Math.round((step / totalSteps) * 100));
      setProgress(`Scanning keywords... (batch ${batch + 1})`);
      try {
        const res = await fetch("/api/admin/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, batch, mode: "keywords" }) });
        const data = await res.json();
        if (data.results) { addResults(data.results); setResults([...allResults]); }
        if (data.stats) { runningStats = mergeStats(runningStats, data.stats); setStats({ ...runningStats }); }
        done = data.done; batch = data.nextBatch ?? batch + 1;
      } catch { done = true; }
    }

    batch = 0; done = false;
    while (!done) {
      step++; setProgressPct(Math.round((step / totalSteps) * 100));
      setProgress(`Scanning place types... (batch ${batch + 1})`);
      try {
        const res = await fetch("/api/admin/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, batch, mode: "types" }) });
        const data = await res.json();
        if (data.results) { addResults(data.results); setResults([...allResults]); }
        if (data.stats) { runningStats = mergeStats(runningStats, data.stats); setStats({ ...runningStats }); }
        done = data.done; batch = data.nextBatch ?? batch + 1;
      } catch { done = true; }
    }

    setProgress("Running AI discovery..."); setProgressPct(95);
    try {
      const res = await fetch("/api/admin/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, mode: "ai" }) });
      const data = await res.json();
      if (data.results) { addResults(data.results); setResults([...allResults]); }
      if (data.stats) { runningStats = mergeStats(runningStats, data.stats); setStats({ ...runningStats }); }
    } catch {}

    console.log(`[Scanner] Deduped: ${dupeCount} duplicates removed (${allResults.length} unique from ${allResults.length + dupeCount} raw)`);
    setProgress(""); setProgressPct(100); setScanning(false);
  };

  const sendEmail = async (r: Result) => {
    if (!r.email) return;
    await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place_id: r.place_id, business_name: r.business_name, email: r.email, email_source: r.email_source, address: r.address, city: r.city, phone: r.phone, rating: r.rating, review_count: r.review_count || 0, priority_tier: r.priority_tier }) });
    setEmailed(prev => new Set(prev).add(r.place_id));
  };

  const bulkSendAll = async () => {
    setShowBulkConfirm(false);
    setBulkSending(true);
    const emailable = results.filter(r => r.email && !emailed.has(r.place_id));
    const batches: Result[][] = [];
    for (let i = 0; i < emailable.length; i += 50) batches.push(emailable.slice(i, i + 50));

    let totalSent = 0;
    for (let b = 0; b < batches.length; b++) {
      setBulkProgress(`Sending... ${totalSent} of ${emailable.length}`);
      const prospects = batches[b].map(r => ({ place_id: r.place_id, business_name: r.business_name, email: r.email || "", email_source: r.email_source || null, address: r.address, city: r.city, phone: r.phone, rating: r.rating, review_count: r.review_count || 0, priority_tier: r.priority_tier }));
      const res = await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prospects }) });
      const data = await res.json();
      totalSent += data.sent || 0;
      for (const r of batches[b]) setEmailed(prev => new Set(prev).add(r.place_id));
    }
    setBulkProgress(`${totalSent} emails sent successfully`);
    setBulkSending(false);
    setTimeout(() => setBulkProgress(""), 5000);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const tier1 = results.filter(r => r.priority_tier === 1);
  const tier2 = results.filter(r => r.priority_tier === 2);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      {/* Nav */}
      <header className="sticky top-0 w-full z-50 backdrop-blur-xl" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
          <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/dashboard" style={{ color: "#414942" }}>Dashboard</Link>
            <Link href="/admin/clients" style={{ color: "#414942" }}>Clients</Link>
            <span className="font-semibold pb-1" style={{ color: "#316342", borderBottom: "2px solid #316342" }}>Scanner</span>
            <Link href="/admin/prospects" style={{ color: "#414942" }}>Prospects</Link>
          </nav>
          <div className="flex items-center gap-6">
            <span className="text-sm italic" style={{ color: "#414942" }}>{adminName}</span>
            <button onClick={handleLogout} className="px-5 py-2 rounded-md font-medium text-white text-sm" style={{ backgroundColor: "#316342" }}>Logout</button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-screen-xl mx-auto w-full px-8 py-16">
        {/* Header */}
        <div className="mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4" style={{ backgroundColor: "#b9efc5", color: "#00210e" }}>Lead Generation Engine</span>
          <h1 className="text-5xl font-bold tracking-tight mb-3" style={{ color: "#1d1c17" }}>Business Scanner</h1>
          <p className="text-lg italic max-w-2xl" style={{ color: "#414942" }}>Find local businesses with no website. Filter by location and priority to fuel your next outreach campaign.</p>
        </div>

        {/* Scan Card */}
        <div className="max-w-[680px] mx-auto mb-16 p-10 rounded-xl" style={{ backgroundColor: "#f8f3eb", boxShadow: "0 12px 40px rgba(48,20,0,0.04)" }}>
          <div className="flex gap-6 mb-8">
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: "#414942" }}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="w-full bg-transparent border-0 border-b-2 px-0 py-3 text-xl focus:ring-0 transition-all" style={{ borderColor: "#c1c9bf", color: "#1d1c17" }} placeholder="Longview" />
            </div>
            <div className="w-24">
              <label className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: "#414942" }}>State</label>
              <input value={state} onChange={e => setState(e.target.value)} className="w-full bg-transparent border-0 border-b-2 px-0 py-3 text-xl focus:ring-0 transition-all" style={{ borderColor: "#c1c9bf", color: "#1d1c17" }} placeholder="TX" />
            </div>
          </div>
          <button onClick={runScan} disabled={scanning || !city} className="w-full py-4 rounded-md font-bold text-white text-lg transition-all active:scale-[0.98] disabled:opacity-50" style={{ backgroundColor: "#316342" }}>
            {scanning ? "Scanning..." : "Start Scan"}
          </button>
          {scanning && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: "#414942" }}>{progress}</span>
                <span className="font-bold" style={{ color: "#316342" }}>{progressPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#e7e2da" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: "#316342" }} />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {stats.raw > 0 && (
          <div className="flex justify-center gap-0 mb-16 flex-wrap">
            {[
              { label: "Raw Results", val: stats.raw },
              { label: "Chains", val: stats.chains_removed },
              { label: "Has Website", val: stats.has_website },
              { label: "0 Reviews", val: stats.zero_reviews_skipped },
              { label: "Prospects", val: stats.new_prospects },
              { label: "Emails", val: stats.emails_found },
              { label: "Tier 1", val: stats.tier_1 },
              { label: "Tier 2", val: stats.tier_2 },
            ].map((s, i) => (
              <div key={s.label} className="text-center px-8 py-4" style={i > 0 ? { borderLeft: "1px solid rgba(193,201,191,0.3)" } : undefined}>
                <p className="text-3xl font-bold" style={{ color: "#316342" }}>{s.val}</p>
                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "#414942" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Send All Emails Button */}
        {results.length > 0 && (() => {
          const emailCount = results.filter(r => r.email && !emailed.has(r.place_id)).length;
          return (
            <div className="flex items-center justify-center gap-4 mb-12">
              {bulkProgress && <span className="text-sm italic" style={{ color: "#316342" }}>{bulkProgress}</span>}
              <button onClick={() => setShowBulkConfirm(true)} disabled={bulkSending || emailCount === 0} className="px-8 py-3 rounded-md font-bold text-white text-sm disabled:opacity-50 transition-all active:scale-95" style={{ backgroundColor: "#316342" }}>
                {bulkSending ? "Sending..." : emailCount === 0 ? "No Emails Found" : `Send All Emails (${emailCount})`}
              </button>
            </div>
          );
        })()}

        {/* Bulk Confirm Modal */}
        {showBulkConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="w-full max-w-md p-8 rounded-xl" style={{ backgroundColor: "#F5F0E8" }}>
              <h3 className="text-xl font-bold mb-4" style={{ color: "#1d1c17" }}>Confirm Send</h3>
              <p className="text-sm mb-2" style={{ color: "#414942" }}>You&apos;re about to send <strong>{results.filter(r => r.email && !emailed.has(r.place_id)).length}</strong> cold emails to businesses with no website. Proceed?</p>
              {results.filter(r => r.email && !emailed.has(r.place_id)).length > 50 && <p className="text-xs mb-4 italic" style={{ color: "#805533" }}>Sending in {Math.ceil(results.filter(r => r.email && !emailed.has(r.place_id)).length / 50)} batches due to rate limits</p>}
              <div className="flex gap-3 mt-6">
                <button onClick={bulkSendAll} className="flex-1 py-3 rounded-md text-sm font-bold text-white" style={{ backgroundColor: "#316342" }}>Proceed</button>
                <button onClick={() => setShowBulkConfirm(false)} className="px-6 py-3 rounded-md text-sm font-bold border" style={{ color: "#414942", borderColor: "#c1c9bf" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Tier 1 Results */}
        {tier1.length > 0 && (
          <div className="mb-12">
            <div className="py-3 px-6 rounded-t-xl text-[11px] font-bold uppercase tracking-widest" style={{ backgroundColor: "#fdc39a", color: "#794e2e" }}>
              ★ TIER 1 — HIGH Priority
            </div>
            <div className="rounded-b-xl border border-t-0 overflow-hidden" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
              <ResultTable results={tier1} emailed={emailed} onEmail={sendEmail} />
            </div>
          </div>
        )}

        {/* Old bulk modal removed — now above results */}

        {/* Tier 2 Results */}
        {tier2.length > 0 && (
          <div className="mb-12">
            <div className="py-3 px-6 rounded-t-xl text-[11px] font-bold uppercase tracking-widest" style={{ backgroundColor: "#e7e2da", color: "#414942" }}>
              TIER 2 — Standard
            </div>
            <div className="rounded-b-xl border border-t-0 overflow-hidden" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
              <ResultTable results={tier2} emailed={emailed} onEmail={sendEmail} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full mt-auto pt-8 pb-6 px-8" style={{ backgroundColor: "#f8f3eb" }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 max-w-screen-2xl mx-auto text-sm" style={{ color: "#414942" }}>
          <span>Piney Web Co. &middot; Admin Access Level: <span className="italic">Master Craftsman</span></span>
          <div className="flex gap-6">
            <Link href="/admin/clients" className="hover:underline">Clients</Link>
            <Link href="/admin/prospects" className="hover:underline">Prospects</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ResultTable({ results, emailed, onEmail }: { results: Result[]; emailed: Set<string>; onEmail: (r: Result) => void }) {
  const [sortField, setSortField] = useState<"business_name" | "review_count" | "rating">("review_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };
  const arrow = (field: typeof sortField) => sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const thStyle = (field: typeof sortField) => ({ color: sortField === field ? "#316342" : "#414942", cursor: "pointer" as const });

  const sorted = [...results].sort((a, b) => {
    const m = sortDir === "asc" ? 1 : -1;
    if (sortField === "business_name") return ((a.business_name || "") > (b.business_name || "") ? 1 : -1) * m;
    if (sortField === "review_count") return ((a.review_count || 0) - (b.review_count || 0)) * m;
    if (sortField === "rating") return ((a.rating || 0) - (b.rating || 0)) * m;
    return 0;
  });

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-[11px] uppercase tracking-[0.12em] font-bold border-b" style={{ borderColor: "rgba(193,201,191,0.15)" }}>
          <th className="py-3 pl-6 w-16" style={{ color: "#414942" }}>Priority</th>
          <th className="py-3" style={thStyle("business_name")} onClick={() => toggleSort("business_name")}>Business Name{arrow("business_name")}</th>
          <th className="py-3" style={{ color: "#414942" }}>Address</th>
          <th className="py-3" style={{ color: "#414942" }}>Phone</th>
          <th className="py-3" style={{ color: "#414942" }}>Email</th>
          <th className="py-3" style={thStyle("rating")} onClick={() => toggleSort("rating")}>Rating{arrow("rating")}</th>
          <th className="py-3" style={thStyle("review_count")} onClick={() => toggleSort("review_count")}>Reviews{arrow("review_count")}</th>
          <th className="py-3 text-right pr-6" style={{ color: "#414942" }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.place_id} className="border-b transition-colors hover:bg-[#f2ede5]" style={{ borderColor: "rgba(193,201,191,0.08)" }}>
            <td className="py-4 pl-6">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={r.priority_tier === 1 ? { backgroundColor: "rgba(253,195,154,0.4)", color: "#794e2e" } : { backgroundColor: "rgba(193,201,191,0.3)", color: "#717971" }}>T{r.priority_tier}</span>
            </td>
            <td className="py-4 font-semibold" style={{ color: "#1d1c17" }}>{r.business_name}</td>
            <td className="py-4 text-sm" style={{ color: "#414942" }}>{r.address}</td>
            <td className="py-4 text-sm">{r.phone ? <a href={`tel:${r.phone}`} className="underline underline-offset-4" style={{ color: "#316342" }}>{r.phone}</a> : <span style={{ color: "#c1c9bf" }}>—</span>}</td>
            <td className="py-4 text-sm">
              {r.email ? (
                <div><a href={`mailto:${r.email}`} className="underline underline-offset-4" style={{ color: "#316342" }}>{r.email}</a>{r.email_source && <span className="block text-[10px]" style={{ color: "#717971" }}>via {r.email_source}</span>}</div>
              ) : <span style={{ color: "#c1c9bf" }}>—</span>}
            </td>
            <td className="py-4 text-sm" style={{ color: "#414942" }}>{r.rating ? `⭐ ${r.rating}` : <span style={{ color: "#c1c9bf" }}>—</span>}</td>
            <td className="py-4 text-sm" style={{ color: "#717971" }}>{r.review_count ?? 0}</td>
            <td className="py-4 text-right pr-6">
              <div className="flex gap-2 justify-end items-center">
                <span className="text-[10px]" style={{ color: "#717971" }}>Saved ✓</span>
                {emailed.has(r.place_id) ? (
                  <button disabled className="px-3 py-1.5 rounded-md text-xs font-bold" style={{ backgroundColor: "rgba(193,201,191,0.2)", color: "#717971" }}>Emailed ✓</button>
                ) : !r.email ? (
                  <button disabled className="px-3 py-1.5 rounded-md text-xs font-bold" style={{ backgroundColor: "rgba(193,201,191,0.1)", color: "#c1c9bf" }}>No Email</button>
                ) : (
                  <button onClick={() => onEmail(r)} className="px-3 py-1.5 rounded-md text-xs font-bold border transition-all" style={{ color: "#805533", borderColor: "#805533", backgroundColor: "transparent" }}>Send Email</button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
