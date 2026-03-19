"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function SignUp() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", businessName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSignUp = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.fullName, business_name: form.businessName },
        emailRedirectTo: "https://pineyweb.com/dashboard",
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("pineyweb_clients").insert({
        user_id: data.user.id,
        full_name: form.fullName,
        business_name: form.businessName,
        email: form.email,
      });
    }

    router.push("/dashboard");
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
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2 font-serif">Create Account</h1>
          <p className="text-gray-600 font-serif text-sm">Sign up to access your client portal</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 font-serif">Full Name *</label>
            <input type="text" value={form.fullName} onChange={set("fullName")} placeholder="John Smith" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 font-serif">Business Name</label>
            <input type="text" value={form.businessName} onChange={set("businessName")} placeholder="Your Business Name" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 font-serif">Email *</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="you@business.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 font-serif">Password *</label>
            <input type="password" value={form.password} onChange={set("password")} placeholder="At least 6 characters" className={inputClass} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-serif">
              {error}
            </div>
          )}

          <button
            onClick={handleSignUp}
            disabled={loading}
            className="w-full py-3 rounded-full bg-[#5A7D60] text-white font-medium hover:bg-[#4A6B50] transition-colors text-sm font-serif disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <p className="text-center text-sm text-gray-500 font-serif">
            Already have an account?{" "}
            <Link href="/login" className="text-[#5A7D60] font-medium hover:text-[#4A6B50]">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
