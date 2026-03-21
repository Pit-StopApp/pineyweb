"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Result { place_id: string; business_name: string; address: string; city: string; phone: string | null; rating: number | null; review_count: number | null; priority_tier: 1 | 2; }
interface Stats { raw: number; chains_removed: number; has_website: number; already_in_crm: number; new_prospects: number; tier_1: number; tier_2: number; }

export default function ScannerPage() {
  const router = useRouter();
  const [city, setCity] = useState("Longview");
  const [state, setState] = useState("TX");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [stats, setStats] = useState<Stats>({ raw: 0, chains_removed: 0, has_website: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0 });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: me } = await supabase.from("pineyweb_clients").select("role").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }
      setLoading(false);
    };
    init();
  }, [router]);

  const mergeStats = (prev: Stats, next: Stats): Stats => ({
    raw: prev.raw + next.raw, chains_removed: prev.chains_removed + next.chains_removed,
    has_website: prev.has_website + next.has_website, already_in_crm: prev.already_in_crm + next.already_in_crm,
    new_prospects: prev.new_prospects + next.new_prospects, tier_1: prev.tier_1 + next.tier_1, tier_2: prev.tier_2 + next.tier_2,
  });

  const runScan = async () => {
    setScanning(true);
    setResults([]);
    setStats({ raw: 0, chains_removed: 0, has_website: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0 });
    const allResults: Result[] = [];
    let runningStats: Stats = { raw: 0, chains_removed: 0, has_website: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0 };

    // Keywords
    let batch = 0;
    let done = false;
    while (!done) {
      setProgress(`Scanning keywords... (batch ${batch + 1})`);
      try {
        const res = await fetch("/api/admin/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, batch, mode: "keywords" }) });
        const data = await res.json();
        if (data.results) { allResults.push(...data.results); setResults([...allResults]); }
        if (data.stats) { runningStats = mergeStats(runningStats, data.stats); setStats({ ...runningStats }); }
        done = data.done;
        batch = data.nextBatch ?? batch + 1;
      } catch { done = true; }
    }

    // Types
    batch = 0; done = false;
    while (!done) {
      setProgress(`Scanning place types... (batch ${batch + 1})`);
      try {
        const res = await fetch("/api/admin/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, batch, mode: "types" }) });
        const data = await res.json();
        if (data.results) { allResults.push(...data.results); setResults([...allResults]); }
        if (data.stats) { runningStats = mergeStats(runningStats, data.stats); setStats({ ...runningStats }); }
        done = data.done;
        batch = data.nextBatch ?? batch + 1;
      } catch { done = true; }
    }

    // AI
    setProgress("Running AI discovery...");
    try {
      const res = await fetch("/api/admin/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, mode: "ai" }) });
      const data = await res.json();
      if (data.results) { allResults.push(...data.results); setResults([...allResults]); }
      if (data.stats) { runningStats = mergeStats(runningStats, data.stats); setStats({ ...runningStats }); }
    } catch { /* non-blocking */ }

    setProgress("");
    setScanning(false);
  };

  const saveProspect = async (r: Result) => {
    await fetch("/api/admin/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    setSaved(prev => new Set(prev).add(r.place_id));
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p>Loading...</p></div>;

  const sorted = [...results].sort((a, b) => a.priority_tier - b.priority_tier);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      <header className="sticky top-0 w-full z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
          <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/admin/clients" className="text-sm" style={{ color: "#414942" }}>Clients</Link>
            <span className="text-sm font-bold" style={{ color: "#316342", borderBottom: "2px solid #316342", paddingBottom: 4 }}>Scanner</span>
            <Link href="/admin/prospects" className="text-sm" style={{ color: "#414942" }}>Prospects</Link>
          </nav>
        </div>
      </header>

      <main className="pt-24 pb-20 px-8 max-w-7xl mx-auto">
        <div className="mb-10">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4" style={{ backgroundColor: "#fdc39a", color: "#794e2e" }}>Admin</span>
          <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ color: "#1d1c17" }}>Prospect Scanner</h1>
          <p className="text-lg italic" style={{ color: "#414942" }}>Find local businesses without websites.</p>
        </div>

        {/* Controls */}
        <div className="flex gap-4 items-end mb-8 flex-wrap">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} className="px-4 py-2.5 rounded-lg border text-sm w-48" style={{ borderColor: "#c1c9bf" }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>State</label>
            <input value={state} onChange={e => setState(e.target.value)} className="px-4 py-2.5 rounded-lg border text-sm w-20" style={{ borderColor: "#c1c9bf" }} />
          </div>
          <button onClick={runScan} disabled={scanning || !city} className="px-8 py-2.5 rounded-md font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: "#4A7C59" }}>
            {scanning ? "Scanning..." : "Start Scan"}
          </button>
          {progress && <span className="text-sm italic" style={{ color: "#805533" }}>{progress}</span>}
        </div>

        {/* Stats */}
        {stats.raw > 0 && (
          <div className="text-sm mb-8 p-4 rounded-lg" style={{ backgroundColor: "#f8f3eb", color: "#414942" }}>
            {stats.raw} raw &middot; {stats.chains_removed} chains &middot; {stats.has_website} have websites &middot; {stats.already_in_crm} in CRM &middot; <strong style={{ color: "#4A7C59" }}>{stats.new_prospects} new prospects</strong> &middot; <strong style={{ color: "#805533" }}>{stats.tier_1} Tier 1</strong> &middot; {stats.tier_2} Tier 2
          </div>
        )}

        {/* Results */}
        {sorted.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.15em] font-bold border-b" style={{ color: "#414942", borderColor: "rgba(193,201,191,0.2)" }}>
                  <th className="py-3 pl-6">Priority</th>
                  <th className="py-3">Business Name</th>
                  <th className="py-3">Address</th>
                  <th className="py-3">Phone</th>
                  <th className="py-3">Reviews</th>
                  <th className="py-3 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.place_id} className="border-b transition-colors hover:bg-[#f2ede5]" style={{ borderColor: "rgba(193,201,191,0.1)" }}>
                    <td className="py-4 pl-6">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={r.priority_tier === 1 ? { backgroundColor: "rgba(128,85,51,0.15)", color: "#805533" } : { backgroundColor: "rgba(113,121,113,0.15)", color: "#717971" }}>T{r.priority_tier}</span>
                    </td>
                    <td className="py-4 font-semibold" style={{ color: "#1d1c17" }}>{r.business_name}</td>
                    <td className="py-4 text-sm" style={{ color: "#414942" }}>{r.address}</td>
                    <td className="py-4 text-sm">{r.phone ? <a href={`tel:${r.phone}`} style={{ color: "#316342" }}>{r.phone}</a> : "—"}</td>
                    <td className="py-4 text-sm" style={{ color: "#414942" }}>{r.review_count ?? 0}</td>
                    <td className="py-4 text-right pr-6">
                      <button onClick={() => saveProspect(r)} disabled={saved.has(r.place_id)} className="px-4 py-1.5 rounded-md text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: saved.has(r.place_id) ? "#717971" : "#4A7C59" }}>
                        {saved.has(r.place_id) ? "Saved" : "Save to CRM"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
