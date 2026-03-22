"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Client {
  id: string;
  user_id: string;
  full_name: string;
  business_name: string;
  email: string;
  tier: string | null;
  status: string | null;
  created_at: string;
  site_url: string | null;
}

const PAGE_SIZE = 10;

export default function AdminClients() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminUserId, setAdminUserId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(0);
  // Scanner clients
  interface ScannerClient { id: string; client_id: string; name: string; scanner_type: string | null; geography: string | null; status: string; last_run_at: string | null; total_leads: number; keywords: string[] | null; business_types: string[] | null; google_sheet_url: string | null; }
  const [scannerClients, setScannerClients] = useState<ScannerClient[]>([]);
  const [scanModal, setScanModal] = useState<ScannerClient | null>(null);
  const [scanCity, setScanCity] = useState("");
  const [scanRadius, setScanRadius] = useState(25);
  const [scanMaxResults, setScanMaxResults] = useState(100);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  // Handoff modal
  const [handoffClient, setHandoffClient] = useState<Client | null>(null);
  const [handoffGithub, setHandoffGithub] = useState("");
  const [handoffVercel, setHandoffVercel] = useState("");
  const [handoffChecks, setHandoffChecks] = useState<boolean[]>([false, false, false, false, false]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: me } = await supabase.from("pineyweb_clients").select("role, full_name").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }
      setAdminUserId(session.user.id);
      setAdminName(me.full_name || "Admin");
      const { data } = await supabase.from("pineyweb_clients").select("*").order("created_at", { ascending: false });
      setClients((data || []) as Client[]);
      const { data: sc } = await supabase.from("pineyweb_scanner_clients").select("*").order("created_at", { ascending: false });
      setScannerClients((sc || []) as ScannerClient[]);
      setLoading(false);
    };
    init();
  }, [router]);

  const sendEmail = async (clientId: string, emailType: string) => {
    setSending(`${clientId}-${emailType}`);
    setMsg("");
    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, emailType, adminUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg("Email sent!");
        const { data: updated } = await supabase.from("pineyweb_clients").select("*").order("created_at", { ascending: false });
        setClients((updated || []) as Client[]);
      } else {
        setMsg(data.error || "Failed to send");
      }
    } catch { setMsg("Network error"); }
    setSending(null);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q || (c.full_name || "").toLowerCase().includes(q) || (c.business_name || "").toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats
  const totalClients = clients.length;
  const activeBuilds = clients.filter(c => c.status === "in_progress").length;
  const managedCount = clients.filter(c => c.tier === "Managed").length;
  const managedPct = totalClients > 0 ? Math.round((managedCount / totalClients) * 100) : 0;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      {/* Top Nav */}
      <header className="fixed top-0 left-0 w-full flex justify-between items-center px-8 py-4 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <Link href="/dashboard" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/dashboard" className="text-sm tracking-wide uppercase" style={{ color: "#414942", opacity: 0.7 }}>Dashboard</Link>
          <Link href="/admin/clients" className="text-sm tracking-wide uppercase font-bold" style={{ color: "#316342" }}>Clients</Link>
          <Link href="/admin/prospects" className="text-sm tracking-wide uppercase" style={{ color: "#414942", opacity: 0.7 }}>Prospects</Link>
          <Link href="/admin/queue" className="text-sm tracking-wide uppercase" style={{ color: "#414942", opacity: 0.7 }}>Queue</Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: "#414942" }}>{adminName}</span>
          <button onClick={handleLogout} className="text-sm font-medium tracking-tight transition-colors" style={{ color: "#414942" }}>Log Out</button>
        </div>
      </header>

      <main className="pt-24 pb-20 px-6 md:px-12 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4" style={{ backgroundColor: "#fdc39a", color: "#794e2e" }}>Admin</span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2" style={{ color: "#1d1c17" }}>Client Management</h1>
            <p className="text-lg italic max-w-xl" style={{ color: "#414942" }}>Oversee the lifecycle of Piney Web Co. partners from initial build to live maintenance.</p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-sm font-medium" style={{ color: "#4A7C59" }}>{msg}</span>}
            <div className="relative">
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search clients..."
                className="pl-10 pr-4 py-2.5 rounded-lg border text-sm w-64"
                style={{ borderColor: "#c1c9bf", backgroundColor: "#ffffff" }}
              />
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "#c1c9bf" }}>search</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden mb-10" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.15em] font-bold border-b" style={{ color: "#414942", borderColor: "rgba(193,201,191,0.2)" }}>
                  <th className="py-4 pl-6">Client Name</th>
                  <th className="py-4">Business Name</th>
                  <th className="py-4">Tier</th>
                  <th className="py-4">Status</th>
                  <th className="py-4">Date Joined</th>
                  <th className="py-4 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c) => {
                  const status = c.status || "pending";
                  return (
                    <tr key={c.id} className="border-b transition-colors hover:bg-[#f2ede5]" style={{ borderColor: "rgba(193,201,191,0.1)" }}>
                      <td className="py-5 pl-6">
                        <div className="font-semibold" style={{ color: "#1d1c17" }}>{c.full_name || "—"}</div>
                        <div className="text-xs" style={{ color: "#717971" }}>{c.email || ""}</div>
                      </td>
                      <td className="py-5" style={{ color: "#414942" }}>{c.business_name || "—"}</td>
                      <td className="py-5">
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "rgba(113,121,113,0.15)", color: "#717971" }}>
                          {c.tier || "—"}
                        </span>
                      </td>
                      <td className="py-5">
                        <StatusBadge status={status} />
                      </td>
                      <td className="py-5 text-sm" style={{ color: "#414942" }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td className="py-5 text-right pr-6">
                        <div className="flex gap-2 justify-end flex-wrap">
                          {status === "pending" && (
                            <button
                              onClick={() => sendEmail(c.id, "build_started")}
                              disabled={!!sending}
                              className="px-4 py-1.5 rounded-md text-xs font-bold text-white transition-all disabled:opacity-50"
                              style={{ backgroundColor: "#4A7C59" }}
                            >
                              {sending === `${c.id}-build_started` ? "Sending..." : "Send Build Started"}
                            </button>
                          )}
                          {status === "in_progress" && (
                            <button
                              onClick={() => sendEmail(c.id, "site_live")}
                              disabled={!!sending}
                              className="px-4 py-1.5 rounded-md text-xs font-bold text-white transition-all disabled:opacity-50"
                              style={{ backgroundColor: "#805533" }}
                            >
                              {sending === `${c.id}-site_live` ? "Sending..." : "Send Site Live"}
                            </button>
                          )}
                          {status === "live" && c.tier === "One-Time" && (
                            <button
                              onClick={() => { setHandoffClient(c); setHandoffGithub(""); setHandoffVercel(""); setHandoffChecks([false, false, false, false, false]); }}
                              className="px-4 py-1.5 rounded-md text-xs font-bold text-white transition-all"
                              style={{ backgroundColor: "#414942" }}
                            >
                              Send Handoff
                            </button>
                          )}
                          <Link
                            href={`/dashboard?impersonate=${c.id}`}
                            className="px-4 py-1.5 rounded-md text-xs font-bold border transition-colors"
                            style={{ color: "#316342", borderColor: "#316342" }}
                          >
                            View Dashboard
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-sm" style={{ color: "#414942" }}>No clients found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: "rgba(193,201,191,0.2)" }}>
              <span className="text-xs" style={{ color: "#717971" }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded text-xs font-bold disabled:opacity-30" style={{ color: "#316342" }}>Previous</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded text-xs font-bold disabled:opacity-30" style={{ color: "#316342" }}>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard label="Total Clients" value={String(totalClients)} icon="group" />
          <StatCard label="Active Builds" value={String(activeBuilds)} icon="construction" />
          <StatCard label="Managed Tiers" value={`${managedPct}%`} icon="auto_awesome" />
          <div className="rounded-xl p-6 text-white" style={{ backgroundColor: "#4A7C59" }}>
            <span className="material-symbols-outlined text-2xl mb-3 block" style={{ opacity: 0.8 }}>person_add</span>
            <h3 className="text-sm uppercase tracking-widest opacity-70 mb-1">Quick Action</h3>
            <p className="text-xl font-bold mb-4">Onboard Client</p>
            <button className="px-5 py-2 rounded-md text-sm font-bold transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}>
              + New Client
            </button>
          </div>
        </div>

        {/* Lead Generation */}
        <div className="mt-16 mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3" style={{ backgroundColor: "rgba(49,99,66,0.1)", color: "#316342" }}>Lead Generation</span>
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Client Scanners</h2>
            </div>
          </div>

          {scannerClients.length === 0 ? (
            <div className="rounded-xl border p-12 text-center" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
              <span className="material-symbols-outlined text-5xl mb-4 block" style={{ color: "#c1c9bf" }}>precision_manufacturing</span>
              <p className="text-lg font-bold mb-2" style={{ color: "#1d1c17" }}>No scanner clients yet</p>
              <p className="text-sm mb-6" style={{ color: "#414942" }}>Add a scanner configuration for a client to start generating leads.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {scannerClients.map(sc => {
                const client = clients.find(c => c.id === sc.client_id);
                return (
                  <div key={sc.id} className="rounded-xl border p-6 transition-colors hover:bg-[#f2ede5]" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(193,201,191,0.3)" }}>
                        <span className="material-symbols-outlined text-[18px]" style={{ color: "#805533" }}>foundation</span>
                      </div>
                      <div>
                        <h3 className="font-bold" style={{ color: "#1d1c17" }}>{sc.name}</h3>
                        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: sc.status === "active" ? "#4A7C59" : "#717971" }}>{sc.status}</span>
                      </div>
                    </div>
                    <div className="space-y-2 mb-4 text-sm">
                      {sc.scanner_type && <div><span style={{ color: "#717971" }}>Type:</span> <span style={{ color: "#414942" }}>{sc.scanner_type}</span></div>}
                      {sc.geography && <div><span style={{ color: "#717971" }}>Geography:</span> <span style={{ color: "#414942" }}>{sc.geography}</span></div>}
                      <div className="flex justify-between pt-2 border-t" style={{ borderColor: "rgba(193,201,191,0.15)" }}>
                        <div><span className="text-[10px] uppercase tracking-widest" style={{ color: "#717971" }}>Last Run</span><br/><span style={{ color: "#414942" }}>{sc.last_run_at ? new Date(sc.last_run_at).toLocaleDateString() : "Never"}</span></div>
                        <div className="text-right"><span className="text-[10px] uppercase tracking-widest" style={{ color: "#717971" }}>Total Leads</span><br/><span className="font-bold text-lg" style={{ color: "#316342" }}>{sc.total_leads.toLocaleString()}</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setScanModal(sc); setScanCity(sc.geography || ""); setScanProgress(""); }} className="flex-1 py-2 rounded-md text-xs font-bold text-white" style={{ backgroundColor: "#316342" }}>Run Scanner</button>
                      {sc.google_sheet_url && <a href={sc.google_sheet_url} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 rounded-md text-xs font-bold text-center border" style={{ color: "#316342", borderColor: "#316342" }}>View Leads</a>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Scanner Run Modal */}
      {scanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => !scanRunning && setScanModal(null)}>
          <div className="w-full max-w-lg rounded-xl shadow-xl overflow-hidden" style={{ backgroundColor: "#F5F0E8" }} onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-3 border-b" style={{ borderColor: "rgba(193,201,191,0.2)" }}>
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#805533" }}>Scanner Configuration</span>
              <h3 className="text-2xl font-bold" style={{ color: "#316342" }}>{scanModal.name}</h3>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "#717971" }}>Target City / Zip</label>
                <input value={scanCity} onChange={e => setScanCity(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "#c1c9bf", backgroundColor: "#fff" }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "#717971" }}>Search Radius</label>
                <div className="flex items-center gap-4">
                  <input type="range" min={10} max={100} value={scanRadius} onChange={e => setScanRadius(Number(e.target.value))} className="flex-grow" style={{ accentColor: "#316342" }} />
                  <span className="font-bold w-14 text-right" style={{ color: "#1d1c17" }}>{scanRadius}mi</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "#717971" }}>Max Results</label>
                <div className="flex items-center gap-4">
                  <input type="range" min={10} max={500} step={10} value={scanMaxResults} onChange={e => setScanMaxResults(Number(e.target.value))} className="flex-grow" style={{ accentColor: "#805533" }} />
                  <span className="font-bold w-14 text-right" style={{ color: "#1d1c17" }}>{scanMaxResults}</span>
                </div>
              </div>
              {scanProgress && (
                <div className="text-sm italic" style={{ color: "#316342" }}>{scanProgress}</div>
              )}
            </div>
            <div className="px-6 py-4 flex justify-end gap-3" style={{ backgroundColor: "#f8f3eb" }}>
              <button onClick={() => setScanModal(null)} disabled={scanRunning} className="px-5 py-2.5 text-sm font-bold" style={{ color: "#414942" }}>Cancel</button>
              <button
                onClick={async () => {
                  setScanRunning(true);
                  setScanProgress("Scanning...");
                  try {
                    const res = await fetch("/api/admin/client-scanner", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ client_id: scanModal.client_id, city: scanCity, radius: scanRadius, max_results: scanMaxResults, keywords: scanModal.keywords || [], business_types: scanModal.business_types || [] }),
                    });
                    const data = await res.json();
                    setScanProgress(`Complete — ${data.total || 0} leads found`);
                    const { data: sc } = await supabase.from("pineyweb_scanner_clients").select("*").order("created_at", { ascending: false });
                    setScannerClients((sc || []) as ScannerClient[]);
                  } catch { setScanProgress("Scan failed"); }
                  setScanRunning(false);
                }}
                disabled={scanRunning || !scanCity.trim()}
                className="px-6 py-2.5 rounded-md text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{ backgroundColor: "#316342" }}
              >
                {scanRunning ? "Generating..." : "Generate Leads"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handoff Modal */}
      {handoffClient && (() => {
        const allChecked = handoffChecks.every(Boolean);
        const checkLabels = [
          "GitHub repository transferred to client's account",
          "Vercel project transferred to client's account",
          "Removed from Namecheap domain sharing",
          "Removed from Stripe (if applicable)",
          "Removed from Supabase (if applicable)",
        ];
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="w-full max-w-lg p-8 rounded-xl" style={{ backgroundColor: "#F5F0E8" }}>
              <h3 className="text-xl font-bold mb-1" style={{ color: "#1d1c17" }}>Send Handoff — {handoffClient.full_name || handoffClient.business_name}</h3>
              <p className="text-sm mb-6" style={{ color: "#414942" }}>Complete all steps below before sending the handoff email.</p>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Client&apos;s GitHub Username</label>
                  <input value={handoffGithub} onChange={e => setHandoffGithub(e.target.value)} placeholder="github-username" className="w-full px-4 py-2.5 rounded-lg border text-sm" style={{ borderColor: "#c1c9bf", backgroundColor: "#fff" }} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Client&apos;s Vercel Username</label>
                  <input value={handoffVercel} onChange={e => setHandoffVercel(e.target.value)} placeholder="vercel-username" className="w-full px-4 py-2.5 rounded-lg border text-sm" style={{ borderColor: "#c1c9bf", backgroundColor: "#fff" }} />
                </div>
              </div>
              <div className="space-y-3 mb-6">
                {checkLabels.map((label, i) => (
                  <label key={i} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={handoffChecks[i]} onChange={() => { const u = [...handoffChecks]; u[i] = !u[i]; setHandoffChecks(u); }} style={{ accentColor: "#4A7C59" }} />
                    <span className="text-sm" style={{ color: "#1d1c17" }}>{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => { await sendEmail(handoffClient.id, "handoff"); setMsg(`Handoff email sent to ${handoffClient.email}`); setHandoffClient(null); setTimeout(() => setMsg(""), 4000); }}
                  disabled={!allChecked || !!sending}
                  className="flex-1 py-3 rounded-md text-sm font-bold text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: "#4A7C59" }}
                >
                  {sending ? "Sending..." : "Send Handoff Email"}
                </button>
                <button onClick={() => setHandoffClient(null)} className="px-6 py-3 rounded-md text-sm font-bold border" style={{ color: "#414942", borderColor: "#c1c9bf" }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") return <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "rgba(193,201,191,0.4)", color: "#717971" }}>Pending</span>;
  if (status === "active") return <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: "#4a7c59" }}>Active</span>;
  if (status === "in_progress") return <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>In Progress</span>;
  if (status === "live") return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: "#316342" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
      Live
    </span>
  );
  return <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: "rgba(193,201,191,0.4)", color: "#717971" }}>{status}</span>;
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl p-6 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
      <span className="material-symbols-outlined text-2xl mb-3 block" style={{ color: "#316342" }}>{icon}</span>
      <h3 className="text-[11px] uppercase tracking-widest mb-1" style={{ color: "#414942" }}>{label}</h3>
      <p className="text-3xl font-bold" style={{ color: "#1d1c17" }}>{value}</p>
    </div>
  );
}
