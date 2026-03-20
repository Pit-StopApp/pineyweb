"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function ResetPassword() {
  const router = useRouter();
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setValidSession(!!session);
    };
    check();
  }, []);

  const handleReset = async () => {
    if (newPw !== confirmPw) { setError("Passwords don't match."); return; }
    if (newPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError("");
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
    if (updateErr) { setError(updateErr.message); setLoading(false); return; }
    router.push("/dashboard");
  };

  if (validSession === null) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F5" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Lora', serif" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold" style={{ color: "#4A7C59" }}>Piney Web Co.</Link>
          <h1 className="text-3xl font-bold mt-6 mb-2" style={{ color: "#1d1c17" }}>Set New Password</h1>
        </div>

        {!validSession ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
            <p className="text-sm mb-4" style={{ color: "#414942" }}>This link has expired or has already been used.</p>
            <Link href="/forgot-password" className="text-sm font-medium underline underline-offset-4" style={{ color: "#4A7C59" }}>Request a new reset link</Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#414942" }}>New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" className="w-full px-4 py-2.5 rounded-lg border text-sm" style={{ borderColor: "#c1c9bf" }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#414942" }}>Confirm Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password" className="w-full px-4 py-2.5 rounded-lg border text-sm" style={{ borderColor: "#c1c9bf" }} onKeyDown={e => { if (e.key === "Enter") handleReset(); }} />
            </div>
            {error && <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#ffdad6", color: "#93000a" }}>{error}</div>}
            <button onClick={handleReset} disabled={loading} className="w-full py-3 rounded-full text-white font-medium text-sm disabled:opacity-50" style={{ backgroundColor: "#4A7C59" }}>
              {loading ? "Updating..." : "Reset Password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
