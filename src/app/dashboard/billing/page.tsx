"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface ClientData {
  business_name: string;
  full_name: string;
  tier: string | null;
  status: string | null;
  created_at: string | null;
  stripe_customer_id: string | null;
}

interface PaymentMethod { brand: string; last4: string; expMonth: number; expYear: number; }
interface Invoice { date: string; description: string; amount: string; status: string; pdfUrl: string | null; }

function getNextBillingDate(createdAt: string): string {
  const created = new Date(createdAt);
  const day = created.getDate();
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  if (thisMonth > now) return thisMonth.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return new Date(now.getFullYear(), now.getMonth() + 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function Billing() {
  const router = useRouter();
  const [client, setClient] = useState<ClientData | null>(null);
  // userId passed to billing API
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stripeLoading, setStripeLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const currentUserId = session.user.id;

      // Try client-side first, fall back to server if RLS blocks
      let clientData = null;
      const { data } = await supabase.from("pineyweb_clients").select("business_name, full_name, status, tier, created_at, stripe_customer_id").eq("user_id", currentUserId).single();
      if (data) {
        clientData = data;
      } else {
        try {
          const res = await fetch("/api/auth/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: currentUserId }) });
          const fallback = await res.json();
          if (fallback.data) clientData = fallback.data;
        } catch { /* fallback failed */ }
      }

      if (!clientData) { router.push("/?pending=1"); return; }
      if (clientData.status === "suspended") { router.push("/dashboard/suspended"); return; }
      if (clientData.status === "pending" || clientData.status === "active") { router.push("/dashboard/onboarding"); return; }

      setClient(clientData);
      setLoading(false);

      // Fetch Stripe data
      if (clientData.stripe_customer_id) {
        setStripeLoading(true);
        try {
          const res = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: currentUserId }) });
          const result = await res.json();
          if (result.paymentMethod) setPaymentMethod(result.paymentMethod);
          if (result.invoices) setInvoices(result.invoices);
        } catch { /* non-blocking */ }
        setStripeLoading(false);
      }
    };
    init();
  }, [router]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const tier = client?.tier || "Managed";
  const isManaged = tier === "Managed";
  const status = client?.status || "active";

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      {/* Top Nav */}
      <header className="sticky top-0 w-full z-50 backdrop-blur-xl" style={{ backgroundColor: "rgba(254,249,241,0.8)", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
        <div className="flex justify-between items-center px-8 py-4 max-w-screen-2xl mx-auto">
          <Link href="/" className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/dashboard" className="transition-colors" style={{ color: "#414942" }}>Dashboard</Link>
            <Link href="/dashboard/edit" className="transition-colors" style={{ color: "#414942" }}>Edit Site</Link>
            <span className="font-semibold pb-1" style={{ color: "#316342", borderBottom: "2px solid #316342" }}>Billing</span>
          </nav>
          <div className="flex items-center gap-6">
            <span className="italic" style={{ color: "#414942" }}>{client?.full_name || "Client"}</span>
            <button onClick={handleLogout} className="px-5 py-2 rounded-md font-medium text-white active:scale-95 transition-all" style={{ backgroundColor: "#316342" }}>Logout</button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-screen-xl mx-auto w-full px-8 py-16">
        {/* Page Title */}
        <div className="mb-12">
          <span className="text-xs uppercase tracking-[0.2em] font-semibold mb-2 block" style={{ color: "#805533" }}>Account Administration</span>
          <h1 className="text-5xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Billing &amp; Payments</h1>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16">
          {/* Current Plan */}
          <div className="md:col-span-7 p-8 rounded-lg flex flex-col justify-between transition-colors" style={{ backgroundColor: "#f8f3eb" }}>
            <div>
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-semibold" style={{ color: "#1d1c17" }}>Current Plan</h2>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" style={status === "active" ? { backgroundColor: "#b9efc5", color: "#00210e" } : { backgroundColor: "#fef3c7", color: "#92400e" }}>
                  {status === "active" ? "Active" : "Pending"}
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold" style={{ color: "#316342" }}>{isManaged ? "Managed" : "One-Time Build"}</span>
                  {isManaged && <span className="italic" style={{ color: "#414942" }}>hosting &amp; maintenance</span>}
                </div>
                {isManaged && client?.created_at ? (
                  <p className="text-lg" style={{ color: "#414942" }}>Next billing date: <span className="font-medium" style={{ color: "#1d1c17" }}>{getNextBillingDate(client.created_at)}</span></p>
                ) : !isManaged ? (
                  <p className="text-lg italic" style={{ color: "#414942" }}>No recurring charges</p>
                ) : null}
              </div>
            </div>
            <div className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(193,201,191,0.3)" }}>
              {isManaged ? (
                <><span className="text-3xl" style={{ color: "#805533" }}>$99.00</span><span style={{ color: "#414942" }}> / month</span></>
              ) : (
                <><span className="text-3xl" style={{ color: "#805533" }}>$799.00</span><span style={{ color: "#414942" }}> one-time</span></>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="md:col-span-5 p-8 rounded-lg flex flex-col" style={{ backgroundColor: "#e7e2da" }}>
            <h2 className="text-2xl font-semibold mb-6" style={{ color: "#1d1c17" }}>Payment Method</h2>
            {paymentMethod ? (
              <div className="p-6 rounded-md mb-8" style={{ backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-3xl" style={{ color: "#805533" }}>credit_card</span>
                    <span className="font-bold tracking-widest">&bull;&bull;&bull;&bull; {paymentMethod.last4}</span>
                  </div>
                  <span className="material-symbols-outlined text-2xl" style={{ color: "#316342" }}>verified</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="italic" style={{ color: "#414942" }}>Expires {String(paymentMethod.expMonth).padStart(2, "0")}/{String(paymentMethod.expYear).slice(-2)}</span>
                  <span className="font-bold uppercase" style={{ color: "#414942" }}>{paymentMethod.brand}</span>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-md mb-8 text-center" style={{ backgroundColor: "#ffffff" }}>
                <span className="material-symbols-outlined text-4xl mb-2 block" style={{ color: "#c1c9bf" }}>credit_card_off</span>
                <p className="text-sm" style={{ color: "#414942" }}>No payment method on file.</p>
              </div>
            )}
            <a href="https://billing.stripe.com/p/login/bJe7sKgT82UMfO7aHHa3u00" target="_blank" rel="noopener noreferrer" className="mt-auto w-full py-4 rounded-md font-medium text-white flex items-center justify-center gap-2 active:scale-95 transition-all text-center" style={{ backgroundColor: "#316342" }}>
              <span className="material-symbols-outlined text-sm">settings</span>
              Manage Payment Method
            </a>
          </div>
        </div>

        {/* Invoice History */}
        <div className="space-y-8">
          <h2 className="text-3xl font-bold italic" style={{ color: "#1d1c17", textUnderlineOffset: "8px", textDecorationColor: "rgba(49,99,66,0.3)", textDecorationLine: "underline" }}>Invoice History</h2>
          <div className="overflow-hidden rounded-lg" style={{ backgroundColor: "#f8f3eb" }}>
            {invoices.length > 0 || stripeLoading ? (
              <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="text-sm font-semibold uppercase tracking-wider" style={{ backgroundColor: "#ece8e0", color: "#414942" }}>
                    <th className="px-8 py-4">Date</th>
                    <th className="px-8 py-4">Description</th>
                    <th className="px-8 py-4">Amount</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {stripeLoading ? (
                    <tr><td colSpan={5} className="px-8 py-8 text-center text-sm" style={{ color: "#414942" }}>Loading invoices...</td></tr>
                  ) : invoices.map((inv, i) => (
                    <tr key={i} className="transition-colors" style={{ borderBottom: "1px solid rgba(193,201,191,0.2)" }}>
                      <td className="px-8 py-6 font-medium">{inv.date}</td>
                      <td className="px-8 py-6 italic" style={{ color: "#414942" }}>{inv.description}</td>
                      <td className="px-8 py-6 font-bold" style={{ color: "#316342" }}>{inv.amount}</td>
                      <td className="px-8 py-6">
                        <span className="flex items-center gap-2 text-sm" style={{ color: inv.status === "paid" ? "#316342" : "#805533" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: inv.status === "paid" ? "#316342" : "#805533" }} />
                          {inv.status === "paid" ? "Paid" : inv.status}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        {inv.pdfUrl ? (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#805533" }}>
                            <span className="material-symbols-outlined">download</span>
                          </a>
                        ) : <span style={{ color: "#c1c9bf" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center">
                <span className="material-symbols-outlined text-4xl mb-4 block" style={{ color: "#c1c9bf" }}>receipt_long</span>
                <p className="text-sm" style={{ color: "#414942" }}>No invoices yet. Your billing history will appear here once payments are processed.</p>
              </div>
            )}
          </div>
        </div>

        {/* Security Note */}
        <div className="mt-12 p-6 rounded-lg flex items-start gap-4" style={{ backgroundColor: "rgba(110,116,95,0.1)" }}>
          <span className="material-symbols-outlined mt-1" style={{ color: "#555b48", fontVariationSettings: "'FILL' 1" }}>security</span>
          <p className="text-sm italic leading-relaxed" style={{ color: "#414942" }}>
            Billing is managed securely through Stripe. To update payment details or cancel your subscription, use the Manage button above. Piney Web Co. does not store your full card details on our servers.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full mt-auto pt-12 pb-8 px-8" style={{ backgroundColor: "#f8f3eb" }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 max-w-screen-2xl mx-auto">
          <div className="text-lg font-semibold" style={{ color: "#316342" }}>Piney Web Co.</div>
          <p className="text-sm italic" style={{ color: "#414942" }}>&copy; 2026 Piney Web Co. Crafted with Precision.</p>
          <div className="flex gap-6 text-sm italic">
            <a href="https://pineyweb.com/privacy" className="underline underline-offset-4 transition-opacity" style={{ color: "#414942" }}>Privacy Policy</a>
            <a href="https://pineyweb.com/terms" className="transition-opacity" style={{ color: "#414942" }}>Terms of Service</a>
            <a href="mailto:hello@pineyweb.com" className="transition-opacity" style={{ color: "#414942" }}>Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
