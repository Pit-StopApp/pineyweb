"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import CrispChat from "@/components/CrispChat";

interface ClientProfile {
  full_name: string;
  business_name: string;
  email: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("pineyweb_clients")
        .select("full_name, business_name, email")
        .eq("user_id", session.user.id)
        .single();

      if (data) {
        setProfile(data);
      } else {
        setProfile({
          full_name: session.user.user_metadata?.full_name || "Client",
          business_name: session.user.user_metadata?.business_name || "",
          email: session.user.email || "",
        });
      }
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSubmitRequest = async () => {
    if (!request.trim()) return;
    setSubmitStatus("sending");
    setErrorMsg("");

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY,
          subject: `Change Request from ${profile?.business_name || profile?.full_name || "Client"}`,
          from_name: profile?.full_name || "Client",
          business_name: profile?.business_name || "",
          email: profile?.email || "",
          message: request,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitStatus("success");
        setRequest("");
      } else {
        setErrorMsg(data.message || "Something went wrong.");
        setSubmitStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setSubmitStatus("error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F5" }}>
        <p className="text-gray-500 font-serif">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF8F5" }}>
      {/* Header */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-[#4A6B50] font-serif">
            Piney Web Co.
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors font-serif"
          >
            Log Out
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 font-serif mb-1">
            Welcome back{profile?.business_name ? `, ${profile.business_name}` : ""}
          </h1>
          <p className="text-gray-600 font-serif text-sm">
            {profile?.full_name} &middot; {profile?.email}
          </p>
        </div>

        {/* Change Request Form */}
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-2">
            Submit a Change Request
          </h2>
          <p className="text-gray-500 font-serif text-sm mb-6">
            Need something updated on your website? Describe the change below and we&apos;ll get on it.
          </p>

          {submitStatus === "success" ? (
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-4 text-sm text-[#4A6B50] font-serif">
              Your request has been submitted. We&apos;ll follow up within 24 hours.
              <button
                onClick={() => setSubmitStatus("idle")}
                className="block mt-3 text-[#5A7D60] font-medium hover:text-[#4A6B50]"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                rows={5}
                placeholder="Describe what you'd like changed — update hours, add a photo, change text, add a new page, etc."
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#6B8F71] focus:border-transparent outline-none transition-shadow text-sm font-serif resize-vertical mb-4"
              />

              {submitStatus === "error" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-serif mb-4">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleSubmitRequest}
                disabled={submitStatus === "sending" || !request.trim()}
                className="px-8 py-3 rounded-full bg-[#5A7D60] text-white font-medium hover:bg-[#4A6B50] transition-colors text-sm font-serif disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitStatus === "sending" ? "Sending..." : "Submit Request"}
              </button>
            </>
          )}
        </div>
      </div>
      <CrispChat />
    </div>
  );
}
