"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Prospect {
  id: string; place_id: string; business_name: string; city: string; phone: string | null;
  priority_tier: number; outreach_status: string; follow_up_date: string | null; notes: string | null;
  contact_method: string | null; rating: number | null; review_count: number | null; created_at: string;
}

const STATUSES = ["new", "contacted", "follow_up", "closed_won", "closed_lost"];
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  new: { bg: "rgba(193,201,191,0.4)", color: "#717971" },
  contacted: { bg: "rgba(74,124,89,0.15)", color: "#4A7C59" },
  follow_up: { bg: "#fef3c7", color: "#92400e" },
  closed_won: { bg: "rgba(22,101,52,0.2)", color: "#166534" },
  closed_lost: { bg: "rgba(186,26,26,0.15)", color: "#ba1a1a" },
};

export default function ProspectsPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: me } = await supabase.from("pineyweb_clients").select("role").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }
      await loadProspects();
      setLoading(false);
    };
    init();
  }, [router]);

  const loadProspects = async (status?: string) => {
    const url = status && status !== "all" ? `/api/admin/prospects?status=${status}` : "/api/admin/prospects";
    const res = await fetch(url);
    const data = await res.json();
    setProspects(data.data || []);
  };

  const updateProspect = async (id: string, updates: Record<string, string | null>) => {
    await fetch("/api/admin/prospects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p>Loading...</p></div>;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      <header className="sticky top-0 w-full z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
          <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/admin/clients" className="text-sm" style={{ color: "#414942" }}>Clients</Link>
            <Link href="/admin/scanner" className="text-sm" style={{ color: "#414942" }}>Scanner</Link>
            <span className="text-sm font-bold" style={{ color: "#316342", borderBottom: "2px solid #316342", paddingBottom: 4 }}>Prospects</span>
          </nav>
        </div>
      </header>

      <main className="pt-24 pb-20 px-8 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4" style={{ backgroundColor: "#fdc39a", color: "#794e2e" }}>Admin</span>
            <h1 className="text-4xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Prospect Outreach</h1>
          </div>
          <div className="flex gap-2">
            {["all", ...STATUSES].map(s => (
              <button key={s} onClick={() => { setFilter(s); loadProspects(s); }} className="px-3 py-1.5 rounded-md text-xs font-bold" style={filter === s ? { backgroundColor: "#4A7C59", color: "#fff" } : { backgroundColor: "rgba(193,201,191,0.2)", color: "#414942" }}>
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.15em] font-bold border-b" style={{ color: "#414942", borderColor: "rgba(193,201,191,0.2)" }}>
                <th className="py-3 pl-6">Business</th>
                <th className="py-3">City</th>
                <th className="py-3">Phone</th>
                <th className="py-3">Priority</th>
                <th className="py-3">Status</th>
                <th className="py-3">Follow Up</th>
                <th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map(p => {
                const st = STATUS_STYLES[p.outreach_status] || STATUS_STYLES.new;
                return (
                  <tr key={p.id} className="border-b hover:bg-[#f2ede5]" style={{ borderColor: "rgba(193,201,191,0.1)" }}>
                    <td className="py-4 pl-6">
                      <div className="font-semibold" style={{ color: "#1d1c17" }}>{p.business_name}</div>
                      {expandedNote === p.id && (
                        <textarea
                          defaultValue={p.notes || ""}
                          onBlur={e => { updateProspect(p.id, { notes: e.target.value }); setExpandedNote(null); }}
                          placeholder="Add a note..."
                          className="mt-2 w-full text-xs p-2 rounded border resize-none"
                          style={{ borderColor: "#c1c9bf" }}
                          rows={2}
                          autoFocus
                        />
                      )}
                    </td>
                    <td className="py-4 text-sm" style={{ color: "#414942" }}>{p.city || "—"}</td>
                    <td className="py-4 text-sm">{p.phone ? <a href={`tel:${p.phone}`} style={{ color: "#316342" }}>{p.phone}</a> : "—"}</td>
                    <td className="py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={p.priority_tier === 1 ? { backgroundColor: "rgba(128,85,51,0.15)", color: "#805533" } : { backgroundColor: "rgba(113,121,113,0.15)", color: "#717971" }}>T{p.priority_tier}</span>
                    </td>
                    <td className="py-4">
                      <select value={p.outreach_status} onChange={e => updateProspect(p.id, { outreach_status: e.target.value })} className="text-[10px] font-bold uppercase rounded-full px-2 py-1 border-none cursor-pointer" style={{ backgroundColor: st.bg, color: st.color }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </td>
                    <td className="py-4">
                      <input type="date" value={p.follow_up_date || ""} onChange={e => updateProspect(p.id, { follow_up_date: e.target.value || null })} className="text-xs border rounded px-2 py-1" style={{ borderColor: "#c1c9bf" }} />
                    </td>
                    <td className="py-4 text-right pr-6">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setExpandedNote(expandedNote === p.id ? null : p.id)} className="px-3 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: "rgba(193,201,191,0.2)", color: "#414942" }}>Note</button>
                        <select value={p.contact_method || ""} onChange={e => updateProspect(p.id, { contact_method: e.target.value })} className="text-[10px] rounded px-2 py-1 border" style={{ borderColor: "#c1c9bf", color: "#414942" }}>
                          <option value="">Log Contact</option>
                          <option value="Email">Email</option>
                          <option value="Phone">Phone</option>
                          <option value="Both">Both</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {prospects.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: "#414942" }}>No prospects found</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
