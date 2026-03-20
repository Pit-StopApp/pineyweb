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

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
  active: { bg: "rgba(74,124,89,0.15)", color: "#4A7C59" },
  in_progress: { bg: "rgba(245,158,11,0.15)", color: "#d97706" },
  live: { bg: "rgba(22,101,52,0.2)", color: "#166534" },
};

export default function AdminClients() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminUserId, setAdminUserId] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: me } = await supabase.from("pineyweb_clients").select("role").eq("user_id", session.user.id).single();
      if (!me || me.role !== "admin") { router.push("/dashboard"); return; }
      setAdminUserId(session.user.id);

      const { data } = await supabase.from("pineyweb_clients").select("*").order("created_at", { ascending: false });
      setClients((data || []) as Client[]);
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
        setMsg(`Email sent!`);
        // Refresh clients
        const { data: updated } = await supabase.from("pineyweb_clients").select("*").order("created_at", { ascending: false });
        setClients((updated || []) as Client[]);
      } else {
        setMsg(data.error || "Failed to send");
      }
    } catch { setMsg("Network error"); }
    setSending(null);
    setTimeout(() => setMsg(""), 3000);
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q || (c.full_name || "").toLowerCase().includes(q) || (c.business_name || "").toLowerCase().includes(q);
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p>Loading...</p></div>;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      <header className="border-b px-8 py-4 flex items-center justify-between" style={{ backgroundColor: "#f8f3eb", borderColor: "#e7e2da" }}>
        <Link href="/dashboard" className="text-xl font-bold" style={{ color: "#316342" }}>Piney Web Co.</Link>
        <span className="text-xs uppercase tracking-widest font-bold" style={{ color: "#805533" }}>Admin Panel</span>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#1d1c17" }}>Client Management</h1>
          {msg && <span className="text-sm font-medium" style={{ color: "#4A7C59" }}>{msg}</span>}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or business..."
          className="w-full max-w-md px-4 py-2.5 rounded-lg border mb-8 text-sm"
          style={{ borderColor: "#c1c9bf", backgroundColor: "#ffffff" }}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: "0 8px" }}>
            <thead>
              <tr className="text-xs uppercase tracking-[0.15em] font-bold" style={{ color: "#414942" }}>
                <th className="pb-2 pl-4">Client Name</th>
                <th className="pb-2">Business</th>
                <th className="pb-2">Tier</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Joined</th>
                <th className="pb-2 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = STATUS_STYLES[c.status || "pending"] || STATUS_STYLES.pending;
                return (
                  <tr key={c.id} style={{ backgroundColor: "#ffffff" }}>
                    <td className="py-4 pl-4 rounded-l-lg font-medium" style={{ color: "#1d1c17" }}>{c.full_name || "—"}</td>
                    <td className="py-4" style={{ color: "#414942" }}>{c.business_name || "—"}</td>
                    <td className="py-4 text-sm">{c.tier || "—"}</td>
                    <td className="py-4">
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ backgroundColor: st.bg, color: st.color }}>{c.status || "pending"}</span>
                    </td>
                    <td className="py-4 text-sm" style={{ color: "#414942" }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-4 text-right pr-4 rounded-r-lg">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => sendEmail(c.id, "build_started")}
                          disabled={sending === `${c.id}-build_started`}
                          className="px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#d97706" }}
                        >
                          {sending === `${c.id}-build_started` ? "..." : "Build Started"}
                        </button>
                        <button
                          onClick={() => sendEmail(c.id, "site_live")}
                          disabled={sending === `${c.id}-site_live`}
                          className="px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "rgba(22,101,52,0.15)", color: "#166534" }}
                        >
                          {sending === `${c.id}-site_live` ? "..." : "Site Live"}
                        </button>
                        <Link
                          href={`/dashboard`}
                          className="px-3 py-1.5 rounded text-xs font-bold"
                          style={{ backgroundColor: "rgba(74,124,89,0.15)", color: "#4A7C59" }}
                        >
                          Dashboard
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-sm" style={{ color: "#414942" }}>No clients found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
