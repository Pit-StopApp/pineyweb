"use client";

import Link from "next/link";

export default function Suspended() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#F5F0E8", fontFamily: "'Lora', serif" }}>
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <span className="material-symbols-outlined text-5xl" style={{ color: "#ba1a1a" }}>warning</span>
        </div>
        <h1 className="text-3xl font-bold mb-4" style={{ color: "#4A7C59" }}>Your account has been suspended.</h1>
        <p className="text-base leading-relaxed mb-8" style={{ color: "#414942" }}>
          We were unable to process your most recent payment. Please update your payment method to restore access to your website.
        </p>
        <a
          href="https://billing.stripe.com/p/login/bJe7sKgT82UMfO7aHHa3u00"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-full py-3.5 rounded-md font-bold text-white text-center transition-all active:scale-95 mb-4"
          style={{ backgroundColor: "#4A7C59" }}
        >
          Update Payment Method
        </a>
        <a href="mailto:hello@pineyweb.com" className="text-sm font-medium underline underline-offset-4" style={{ color: "#805533" }}>
          Contact us
        </a>
        <div className="mt-12">
          <Link href="/" className="text-xs" style={{ color: "rgba(65,73,66,0.5)" }}>pineyweb.com</Link>
        </div>
      </div>
    </div>
  );
}
