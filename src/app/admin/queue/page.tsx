"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface QueueItem { id: string; city: string; distance_from_longview_miles: number; status: string; prospects_found: number; emails_found: number; emails_sent: number; last_scanned_at: string | null; population: number | null; }

export default function QueuePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyCap, setDailyCap] = useState(50);
  const [emailsToday, setEmailsToday] = useState(0);
  const [newCap, setNewCap] = useState("");
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: me } = await supabase.from("pineyweb_clients").select("role").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }

      const res = await fetch("/api/admin/queue-stats");
      const stats = await res.json();
      setQueue((stats.queue || []) as QueueItem[]);
      setEmailsToday(stats.emailsToday ?? 0);
      setDailyCap(stats.dailyCap ?? 50);
      setLoading(false);
    };
    init();
  }, [router]);

  const updateCap = async () => {
    const cap = parseInt(newCap);
    if (isNaN(cap) || cap < 0) return;
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("pineyweb_daily_send_tracker").upsert({ date: today, daily_cap: cap, emails_sent: emailsToday }, { onConflict: "date" });
    setDailyCap(cap);
    setNewCap("");
  };

  const pauseAutomation = async () => {
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("pineyweb_daily_send_tracker").upsert({ date: today, daily_cap: 0, emails_sent: emailsToday }, { onConflict: "date" });
    setDailyCap(0);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p>Loading...</p></div>;

  const total = queue.length;
  const scanned = queue.filter(q => q.status === "complete").length;
  const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;

  const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    pending: { bg: "rgba(193,201,191,0.3)", color: "#717971" },
    scanning: { bg: "#fef3c7", color: "#92400e" },
    complete: { bg: "rgba(74,124,89,0.15)", color: "#4A7C59" },
    error: { bg: "rgba(186,26,26,0.15)", color: "#ba1a1a" },
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      <header className="sticky top-0 w-full z-50 backdrop-blur-xl" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
          <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/admin/clients" style={{ color: "#414942" }}>Clients</Link>
            <Link href="/admin/scanner" style={{ color: "#414942" }}>Scanner</Link>
            <Link href="/admin/prospects" style={{ color: "#414942" }}>Prospects</Link>
            <span className="font-semibold pb-1" style={{ color: "#316342", borderBottom: "2px solid #316342" }}>Queue</span>
          </nav>
        </div>
      </header>

      <main className="pt-24 pb-20 px-8 max-w-7xl mx-auto">
        <div className="mb-10">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4" style={{ backgroundColor: "#fdc39a", color: "#794e2e" }}>Automation</span>
          <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ color: "#1d1c17" }}>Scanner Queue</h1>
          <p className="text-lg italic" style={{ color: "#414942" }}>Automated daily scanning expanding outward from Longview, TX.</p>
        </div>

        {/* Seed button when empty */}
        {total === 0 && (
          <div className="mb-10 p-8 rounded-xl text-center border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
            <span className="material-symbols-outlined text-4xl mb-4 block" style={{ color: "#c1c9bf" }}>location_city</span>
            <p className="text-sm mb-4" style={{ color: "#414942" }}>No cities in the queue yet. Seed 200+ Texas cities to start automated scanning.</p>
            <button
              onClick={async () => {
                setSeeding(true);
                const res = await fetch("/api/admin/seed-queue", { method: "POST" });
                const data = await res.json();
                if (data.seeded) {
                  const r = await fetch("/api/admin/queue-stats");
                  const s = await r.json();
                  setQueue((s.queue || []) as QueueItem[]);
                }
                setSeeding(false);
              }}
              disabled={seeding}
              className="px-8 py-3 rounded-md font-bold text-white text-sm disabled:opacity-50 transition-all active:scale-95"
              style={{ backgroundColor: "#316342" }}
            >
              {seeding ? "Seeding..." : "Seed Texas Cities"}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <div className="p-6 rounded-xl border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
            <p className="text-3xl font-bold" style={{ color: "#316342" }}>{total}</p>
            <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "#414942" }}>Total Cities</p>
          </div>
          <div className="p-6 rounded-xl border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
            <p className="text-3xl font-bold" style={{ color: "#316342" }}>{scanned} / {total}</p>
            <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "#414942" }}>Scanned</p>
          </div>
          <div className="p-6 rounded-xl border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
            <p className="text-3xl font-bold" style={{ color: "#316342" }}>{emailsToday} / {dailyCap}</p>
            <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "#414942" }}>Emails Today</p>
          </div>
          <div className="p-6 rounded-xl border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
            <p className="text-3xl font-bold" style={{ color: dailyCap === 0 ? "#ba1a1a" : "#316342" }}>{dailyCap === 0 ? "PAUSED" : "ACTIVE"}</p>
            <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "#414942" }}>Automation</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-1" style={{ color: "#414942" }}>
            <span>{scanned} of {total} cities scanned</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full h-3 rounded-full" style={{ backgroundColor: "#e7e2da" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#316342" }} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-10 flex-wrap">
          <div className="flex items-center gap-2">
            <input value={newCap} onChange={e => setNewCap(e.target.value)} placeholder={String(dailyCap)} className="w-20 px-3 py-2 rounded-lg border text-sm text-center" style={{ borderColor: "#c1c9bf" }} />
            <button onClick={updateCap} className="px-4 py-2 rounded-md text-xs font-bold border" style={{ color: "#316342", borderColor: "#316342" }}>Set Cap</button>
          </div>
          <button onClick={pauseAutomation} disabled={dailyCap === 0} className="px-4 py-2 rounded-md text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: "#ba1a1a" }}>
            {dailyCap === 0 ? "Paused" : "Pause Automation"}
          </button>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.12em] font-bold border-b" style={{ color: "#414942", borderColor: "rgba(193,201,191,0.2)" }}>
                <th className="py-3 pl-6">City</th>
                <th className="py-3">Distance</th>
                <th className="py-3">Pop.</th>
                <th className="py-3">Status</th>
                <th className="py-3">Prospects</th>
                <th className="py-3">Emails</th>
                <th className="py-3">Sent</th>
                <th className="py-3 pr-6">Last Scanned</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, 50).map(q => {
                const st = STATUS_COLORS[q.status] || STATUS_COLORS.pending;
                return (
                  <tr key={q.id} className="border-b hover:bg-[#f2ede5]" style={{ borderColor: "rgba(193,201,191,0.08)" }}>
                    <td className="py-3 pl-6 font-semibold" style={{ color: "#1d1c17" }}>{q.city}</td>
                    <td className="py-3 text-sm" style={{ color: "#414942" }}>{q.distance_from_longview_miles} mi</td>
                    <td className="py-3 text-sm" style={{ color: "#414942" }}>{q.population ? q.population.toLocaleString() : "—"}</td>
                    <td className="py-3"><span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: st.bg, color: st.color }}>{q.status}</span></td>
                    <td className="py-3 text-sm" style={{ color: "#414942" }}>{q.prospects_found}</td>
                    <td className="py-3 text-sm" style={{ color: "#414942" }}>{q.emails_found}</td>
                    <td className="py-3 text-sm" style={{ color: "#414942" }}>{q.emails_sent}</td>
                    <td className="py-3 pr-6 text-sm" style={{ color: "#717971" }}>{q.last_scanned_at ? new Date(q.last_scanned_at).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {queue.length > 50 && <div className="py-4 text-center text-xs" style={{ color: "#717971" }}>Showing first 50 of {queue.length} cities</div>}
        </div>
      </main>
    </div>
  );
}
