"use client";

import { useState } from "react";
import Link from "next/link";

export default function Activate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    if (!code.trim()) { setError("Please enter your confirmation number."); return; }
    setLoading(true);
    setError("");
    // Placeholder — activation logic would validate the code against the DB
    setTimeout(() => {
      setError("Invalid confirmation number. Please check your invoice email and try again.");
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: "#fef9f1", fontFamily: "'Lora', serif" }}>
      <main className="w-full max-w-lg">
        {/* Brand */}
        <div className="flex flex-col items-center mb-12">
          <div className="mb-4">
            <span className="material-symbols-outlined text-5xl" style={{ color: "#4a7c59" }}>architecture</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tighter" style={{ color: "#316342" }}>Piney Web Co.</h1>
        </div>

        {/* Activation Card */}
        <section className="p-10 md:p-14 rounded-xl relative overflow-hidden" style={{ backgroundColor: "#f8f3eb", boxShadow: "0 12px 40px rgba(48,20,0,0.06)" }}>
          <div className="relative z-10">
            <header className="mb-10">
              <div className="inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.1em] uppercase mb-4 text-white" style={{ backgroundColor: "#6e745f" }}>
                Pending Verification
              </div>
              <h2 className="text-3xl md:text-4xl font-semibold mb-4 leading-tight" style={{ color: "#1d1c17" }}>Activate Your Account</h2>
              <p className="text-lg leading-relaxed" style={{ color: "#414942" }}>
                Enter the order confirmation number from your invoice email to link your account and get started.
              </p>
            </header>

            <div className="space-y-8">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: "#414942" }}>
                  Order Confirmation Number
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. PW-8829-X"
                  className="w-full bg-transparent border-0 border-b-[1.5px] py-4 px-0 text-xl focus:ring-0 transition-all duration-300"
                  style={{ borderColor: "#717971", color: "#1d1c17" }}
                  onFocus={(e) => (e.target.style.borderColor = "#316342")}
                  onBlur={(e) => (e.target.style.borderColor = "#717971")}
                />
              </div>

              {error && (
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleActivate}
                disabled={loading}
                className="w-full py-5 rounded-md font-medium text-lg transition-all duration-300 flex items-center justify-center gap-3 text-white active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: "#4a7c59", boxShadow: "0 4px 12px rgba(49,99,66,0.2)" }}
              >
                <span>{loading ? "Verifying..." : "Activate Account"}</span>
                {!loading && <span className="material-symbols-outlined text-xl">arrow_forward</span>}
              </button>
            </div>

            <footer className="mt-12 pt-8 flex flex-col items-center text-center" style={{ borderTop: "1px solid rgba(193,201,191,0.2)" }}>
              <p className="text-sm mb-2" style={{ color: "#414942" }}>Don&apos;t have a confirmation number?</p>
              <a className="font-medium border-b pb-0.5 text-sm transition-all" href="mailto:support@pineyweb.com" style={{ color: "#316342", borderColor: "rgba(49,99,66,0.3)" }}>
                Contact our support team
              </a>
            </footer>
          </div>
        </section>

        {/* Bottom Links */}
        <div className="mt-12 flex justify-between items-center px-4">
          <div className="flex items-center gap-2" style={{ color: "rgba(65,73,66,0.6)" }}>
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            <span className="text-xs uppercase tracking-widest font-bold">Secure Portal</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="text-xs transition-colors" style={{ color: "rgba(65,73,66,0.6)" }}>Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
