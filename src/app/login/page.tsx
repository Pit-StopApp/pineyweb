"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function Login() {
  return <Suspense><LoginInner /></Suspense>;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleLogin = async () => {
    if (!form.email.trim() || !form.password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
  };

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#6B8F71] focus:border-transparent outline-none transition-shadow text-sm font-serif";

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FAF8F5" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#4A6B50] font-serif">
            Piney Web Co.
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2 font-serif">Welcome Back</h1>
          <p className="text-gray-600 font-serif text-sm">Log in to your client portal</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 font-serif">Email</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="you@business.com" className={inputClass} />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700 font-serif">Password</label>
              <Link href="/forgot-password" className="text-xs font-medium font-serif" style={{ color: "#5A7D60" }}>Forgot password?</Link>
            </div>
            <input type="password" value={form.password} onChange={set("password")} placeholder="Your password" className={inputClass} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-serif">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 rounded-full bg-[#5A7D60] text-white font-medium hover:bg-[#4A6B50] transition-colors text-sm font-serif disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>

          <p className="text-center text-sm text-gray-500 font-serif">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[#5A7D60] font-medium hover:text-[#4A6B50]">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
