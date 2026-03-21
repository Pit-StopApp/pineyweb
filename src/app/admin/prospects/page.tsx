"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Prospect {
  id: string; place_id: string; business_name: string; city: string; phone: string | null;
  priority_tier: number; outreach_status: string; follow_up_date: string | null; notes: string | null;
  contact_method: string | null; rating: number | null; review_count: number | null; created_at: string; updated_at: string;
}

const STATUSES = ["new", "contacted", "follow_up", "closed_won", "closed_lost"];
const STATUS_STYLES: Record<string, { bg: string; color: string; dot?: string }> = {
  new: { bg: "rgba(193,201,191,0.4)", color: "#717971" },
  contacted: { bg: "rgba(74,124,89,0.15)", color: "#4A7C59", dot: "#4A7C59" },
  follow_up: { bg: "#fef3c7", color: "#92400e", dot: "#d97706" },
  closed_won: { bg: "#316342", color: "#ffffff", dot: "#ffffff" },
  closed_lost: { bg: "rgba(128,85,51,0.15)", color: "#805533" },
};
const STATUS_LABELS: Record<string, string> = { new: "New", contacted: "Contacted", follow_up: "Follow Up", closed_won: "Won", closed_lost: "Lost" };

const PAGE_SIZE = 10;

export default function ProspectsPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [adminName, setAdminName] = useState("Admin");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: me } = await supabase.from("pineyweb_clients").select("role, full_name").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }
      setAdminName(me.full_name || "Admin");
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
    setPage(0);
  };

  const updateProspect = async (id: string, updates: Record<string, string | null>) => {
    await fetch("/api/admin/prospects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p));
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const filtered = prospects.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!(p.business_name || "").toLowerCase().includes(q) && !(p.city || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      {/* Nav */}
      <header className="sticky top-0 w-full z-50 backdrop-blur-xl" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
          <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/dashboard" style={{ color: "#414942" }}>Dashboard</Link>
            <Link href="/admin/clients" style={{ color: "#414942" }}>Clients</Link>
            <Link href="/admin/scanner" style={{ color: "#414942" }}>Scanner</Link>
            <span className="font-semibold pb-1" style={{ color: "#316342", borderBottom: "2px solid #316342" }}>Prospects</span>
          </nav>
          <div className="flex items-center gap-6">
            <span className="text-sm italic" style={{ color: "#414942" }}>{adminName}</span>
            <button onClick={handleLogout} className="px-5 py-2 rounded-md font-medium text-white text-sm" style={{ backgroundColor: "#316342" }}>Logout</button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-screen-xl mx-auto w-full px-8 py-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <span className="text-[11px] uppercase tracking-[0.15em] font-bold mb-2 block" style={{ color: "#805533" }}>Internal Tool</span>
            <h1 className="text-5xl font-bold tracking-tight mb-2" style={{ color: "#1d1c17" }}>Prospects</h1>
            <p className="text-lg italic" style={{ color: "#414942" }}>Track outreach progress for every potential client in your pipeline.</p>
          </div>
          <div className="relative">
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search by name or city..." className="pl-10 pr-4 py-2.5 rounded-lg border text-sm w-64" style={{ borderColor: "#c1c9bf", backgroundColor: "#ffffff" }} />
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "#c1c9bf" }}>search</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {["all", ...STATUSES].map(s => (
            <button key={s} onClick={() => { setFilter(s); loadProspects(s); }} className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors" style={filter === s ? { backgroundColor: "#316342", color: "#fff" } : { backgroundColor: "rgba(193,201,191,0.2)", color: "#414942" }}>
              {s === "all" ? "All" : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.12em] font-bold border-b" style={{ color: "#414942", borderColor: "rgba(193,201,191,0.2)" }}>
                <th className="py-4 pl-6">Business Name</th>
                <th className="py-4">City</th>
                <th className="py-4">Phone</th>
                <th className="py-4">Priority</th>
                <th className="py-4">Status</th>
                <th className="py-4">Follow Up</th>
                <th className="py-4 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => {
                const st = STATUS_STYLES[p.outreach_status] || STATUS_STYLES.new;
                return (
                  <tr key={p.id} className="group">
                    <td colSpan={7} className="p-0">
                      {/* Main Row */}
                      <div className="flex items-center border-b transition-colors hover:bg-[#f2ede5]" style={{ borderColor: "rgba(193,201,191,0.08)" }}>
                        <div className="py-4 pl-6 flex-1 min-w-0">
                          <span className="font-semibold" style={{ color: "#1d1c17" }}>{p.business_name}</span>
                        </div>
                        <div className="py-4 w-24 text-sm" style={{ color: "#414942" }}>{p.city || "—"}</div>
                        <div className="py-4 w-36 text-sm font-mono">{p.phone ? <a href={`tel:${p.phone}`} style={{ color: "#316342" }}>{p.phone}</a> : <span style={{ color: "#c1c9bf" }}>—</span>}</div>
                        <div className="py-4 w-20">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={p.priority_tier === 1 ? { backgroundColor: "rgba(253,195,154,0.4)", color: "#794e2e" } : { backgroundColor: "rgba(193,201,191,0.3)", color: "#717971" }}>T{p.priority_tier}</span>
                        </div>
                        <div className="py-4 w-28">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: st.bg, color: st.color }}>
                            {st.dot && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: st.dot }} />}
                            {STATUS_LABELS[p.outreach_status] || p.outreach_status}
                          </span>
                        </div>
                        <div className="py-4 w-28 text-sm" style={{ color: "#414942" }}>{p.follow_up_date || "—"}</div>
                        <div className="py-4 w-32 text-right pr-6">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => {
                              const next = STATUSES[(STATUSES.indexOf(p.outreach_status) + 1) % STATUSES.length];
                              updateProspect(p.id, { outreach_status: next });
                            }} title="Cycle status" className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[#e7e2da]">
                              <span className="material-symbols-outlined text-[18px]" style={{ color: "#316342" }}>rule</span>
                            </button>
                            <button onClick={() => setExpandedNote(expandedNote === p.id ? null : p.id)} title="Notes" className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[#e7e2da]">
                              <span className="material-symbols-outlined text-[18px]" style={{ color: p.notes ? "#805533" : "#c1c9bf" }}>notes</span>
                            </button>
                            <button onClick={() => {
                              const d = prompt("Follow-up date (YYYY-MM-DD):", p.follow_up_date || "");
                              if (d !== null) updateProspect(p.id, { follow_up_date: d || null });
                            }} title="Set follow-up" className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-[#e7e2da]">
                              <span className="material-symbols-outlined text-[18px]" style={{ color: "#414942" }}>event_repeat</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Expanded Note Row */}
                      {expandedNote === p.id && (
                        <div className="px-6 py-5 border-b" style={{ borderLeft: "4px solid #316342", borderColor: "rgba(193,201,191,0.15)", backgroundColor: "rgba(254,249,241,0.5)" }}>
                          <span className="text-[10px] uppercase tracking-widest font-bold mb-3 block" style={{ color: "#805533" }}>Interaction History &amp; Context</span>
                          <textarea
                            defaultValue={p.notes || ""}
                            onBlur={e => updateProspect(p.id, { notes: e.target.value })}
                            placeholder="Add notes about this prospect..."
                            className="w-full p-3 rounded-lg border text-sm resize-none mb-2"
                            style={{ borderColor: "#c1c9bf", backgroundColor: "#ffffff" }}
                            rows={3}
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] italic" style={{ color: "#717971" }}>Last edited: {p.updated_at ? new Date(p.updated_at).toLocaleString() : "Never"}</span>
                            <button onClick={() => setExpandedNote(null)} className="px-4 py-1.5 rounded-md text-xs font-bold text-white" style={{ backgroundColor: "#316342" }}>Save Note</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && <tr><td colSpan={7} className="py-16 text-center text-sm" style={{ color: "#414942" }}>No prospects found</td></tr>}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: "rgba(193,201,191,0.2)" }}>
              <span className="text-xs" style={{ color: "#717971" }}>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded text-xs font-bold disabled:opacity-30" style={{ color: "#316342" }}>Previous</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)} className="w-8 h-8 rounded text-xs font-bold" style={page === i ? { backgroundColor: "#316342", color: "#fff" } : { color: "#414942" }}>{i + 1}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded text-xs font-bold disabled:opacity-30" style={{ color: "#316342" }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FAB */}
      <Link href="/admin/scanner" className="fixed bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center text-white z-50 shadow-lg transition-transform hover:scale-105 active:scale-95" style={{ backgroundColor: "#316342" }}>
        <span className="material-symbols-outlined text-2xl">add</span>
      </Link>
    </div>
  );
}
