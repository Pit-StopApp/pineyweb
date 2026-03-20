"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim()) { setError("Please enter your email."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) { setSent(true); }
      else { setError(data.error || "Something went wrong."); }
    } catch { setError("Network error."); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Lora', serif" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold" style={{ color: "#4A7C59" }}>Piney Web Co.</Link>
          <h1 className="text-3xl font-bold mt-6 mb-2" style={{ color: "#1d1c17" }}>Reset Password</h1>
          <p className="text-sm" style={{ color: "#414942" }}>Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        {sent ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
            <div className="text-4xl mb-4">📧</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#4A7C59" }}>Check your email</h2>
            <p className="text-sm mb-4" style={{ color: "#414942" }}>
              We&apos;ve sent a password reset link to <strong>{email}</strong>. It expires in 1 hour.
            </p>
            <Link href="/login" className="text-sm font-medium underline underline-offset-4" style={{ color: "#4A7C59" }}>Back to Login</Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#414942" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" className="w-full px-4 py-2.5 rounded-lg border text-sm" style={{ borderColor: "#c1c9bf" }} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} />
            </div>
            {error && <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</div>}
            <button onClick={handleSubmit} disabled={loading} className="w-full py-3 rounded-full text-white font-medium text-sm disabled:opacity-50" style={{ backgroundColor: "#4A7C59" }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <p className="text-center text-sm" style={{ color: "#414942" }}>
              <Link href="/login" className="font-medium underline underline-offset-4" style={{ color: "#4A7C59" }}>Back to Login</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
