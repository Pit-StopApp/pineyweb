"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/components/DashboardShell";

export default function Billing() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data } = await supabase.from("pineyweb_clients").select("business_name, status").eq("user_id", session.user.id).single();
      if (!data || data.status !== "active") { router.push("/?pending=1"); return; }
      setBusinessName(data.business_name || "");
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const invoices = [
    { date: "Oct 15, 2026", desc: "Managed Service Tier — Monthly", amount: "$99.00" },
    { date: "Sep 15, 2026", desc: "Managed Service Tier — Monthly", amount: "$99.00" },
    { date: "Aug 15, 2026", desc: "Managed Service Tier — Monthly", amount: "$99.00" },
  ];

  return (
    <DashboardShell businessName={businessName} onLogout={handleLogout}>
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] font-bold mb-2" style={{ color: "#805533" }}>Account Management</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Billing &amp; Subscriptions</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Plan & Payment */}
          <div className="lg:col-span-7 space-y-8">
            {/* Current Plan */}
            <section className="rounded-xl p-8 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.1)" }}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold mb-1" style={{ color: "#1d1c17" }}>Current Plan</h3>
                  <p className="text-sm italic" style={{ color: "#414942" }}>Active since sign-up</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: "#6e745f" }}>Premium Service</span>
              </div>
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold mb-2" style={{ color: "#316342" }}>Managed Service Tier</h2>
                <p className="text-4xl font-light" style={{ color: "#1d1c17" }}>$99<span className="text-lg" style={{ color: "#414942" }}>/mo</span></p>
              </div>
              <div className="flex items-center gap-3 py-4 border-t" style={{ borderColor: "rgba(193,201,191,0.2)" }}>
                <span className="material-symbols-outlined" style={{ color: "#316342" }}>event_upcoming</span>
                <div className="text-sm">
                  <span style={{ color: "#414942" }}>Next billing date:</span>
                  <span className="font-bold ml-1" style={{ color: "#1d1c17" }}>—</span>
                </div>
              </div>
            </section>

            {/* Payment Method */}
            <section className="rounded-xl p-8 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.1)" }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: "#1d1c17" }}>Payment Method</h3>
              <div className="flex items-center justify-between p-6 rounded-lg" style={{ backgroundColor: "#e7e2da" }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 flex items-center justify-center rounded" style={{ backgroundColor: "#1d1c17" }}>
                    <span className="material-symbols-outlined text-xl" style={{ color: "#fef9f1" }}>credit_card</span>
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: "#1d1c17" }}>No card on file</p>
                    <p className="text-xs uppercase tracking-tighter" style={{ color: "#414942" }}>Add a payment method</p>
                  </div>
                </div>
                <button className="font-bold text-sm border-b pb-1 transition-all" style={{ color: "#316342", borderColor: "#316342" }}>
                  Add Payment Method
                </button>
              </div>
            </section>
          </div>

          {/* Right: Billing Support */}
          <div className="lg:col-span-5">
            <section className="rounded-xl p-8 sticky top-28 text-white" style={{ backgroundColor: "#316342" }}>
              <h3 className="text-xl font-bold mb-4">Billing Support</h3>
              <p className="opacity-90 mb-6 leading-relaxed" style={{ color: "#e1ffe5" }}>
                Need to adjust your plan or have questions about an invoice? Our team is ready to assist your business growth.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined">mail</span>
                  <span className="text-sm">billing@pineyweb.com</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined">support_agent</span>
                  <span className="text-sm">Schedule a consultation</span>
                </div>
              </div>
              <div className="mt-10 pt-8" style={{ borderTop: "1px solid rgba(225,255,229,0.2)" }}>
                <p className="text-xs uppercase tracking-widest opacity-60 mb-2">Automated Billing</p>
                <p className="text-sm italic">Enabled — Your service will remain uninterrupted.</p>
              </div>
            </section>
          </div>

          {/* Invoice History */}
          <div className="lg:col-span-12 mt-8">
            <section className="rounded-xl p-8 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.1)" }}>
              <h3 className="text-xl font-bold mb-8" style={{ color: "#1d1c17" }}>Invoice History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderSpacing: "0 1rem", borderCollapse: "separate" }}>
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.2em] font-bold" style={{ color: "#414942" }}>
                      <th className="pb-4 pl-4">Date</th>
                      <th className="pb-4">Description</th>
                      <th className="pb-4">Amount</th>
                      <th className="pb-4">Status</th>
                      <th className="pb-4 text-right pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, i) => (
                      <tr key={i} className="group transition-colors" style={{ backgroundColor: "#ffffff" }}>
                        <td className="py-6 pl-6 rounded-l-lg font-medium">{inv.date}</td>
                        <td className="py-6">{inv.desc}</td>
                        <td className="py-6 font-bold" style={{ color: "#316342" }}>{inv.amount}</td>
                        <td className="py-6">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ backgroundColor: "rgba(74,124,89,0.1)", color: "#4a7c59" }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#4a7c59" }} />
                            Paid
                          </span>
                        </td>
                        <td className="py-6 text-right pr-6 rounded-r-lg">
                          <button className="transition-colors" style={{ color: "#414942" }}>
                            <span className="material-symbols-outlined">download</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
