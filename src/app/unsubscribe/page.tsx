"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function Unsubscribe() {
  return <Suspense><UnsubscribeInner /></Suspense>;
}

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) { setError("Invalid unsubscribe link."); return; }

    fetch("/api/admin/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, outreach_status: "closed_lost", notes: "Unsubscribed from cold outreach" }),
    })
      .then(() => setDone(true))
      .catch(() => setError("Something went wrong. Please contact hello@pineyweb.com."));
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#F5F0E8", fontFamily: "'Lora', serif" }}>
      <div className="w-full max-w-md text-center">
        <Link href="/" className="text-2xl font-bold" style={{ color: "#316342" }}>Piney Web Co.</Link>
        {error ? (
          <p className="mt-8 text-sm" style={{ color: "#ba1a1a" }}>{error}</p>
        ) : done ? (
          <>
            <h1 className="text-2xl font-bold mt-8 mb-4" style={{ color: "#1d1c17" }}>You&apos;ve been removed.</h1>
            <p className="text-sm leading-relaxed" style={{ color: "#414942" }}>You&apos;ve been removed from our outreach list. We won&apos;t contact you again.</p>
          </>
        ) : (
          <p className="mt-8 text-sm" style={{ color: "#414942" }}>Processing...</p>
        )}
      </div>
    </div>
  );
}
