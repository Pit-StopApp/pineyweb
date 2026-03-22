"use client";

import Image from "next/image";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const [showPendingBanner, setShowPendingBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkPending = async () => {
      if (searchParams.get("pending") === "1") {
        setShowPendingBanner(true);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("pineyweb_clients").select("status").eq("user_id", session.user.id).single();
      if (data?.status === "pending") setShowPendingBanner(true);
    };
    checkPending();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-white">
      {showPendingBanner && !dismissed && <PendingBanner onDismiss={() => setDismissed(true)} />}
      <Navbar />
      <Hero />
      <WhyPineyWeb />
      <Pricing />
      <OutreachScanner />
      <Portfolio />
      <IntakeForm />
      <Footer />
    </div>
  );
}

/* ─── Pending Activation Banner ─────────────────────────────────────────── */
function PendingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative z-[60] flex items-center justify-between px-4 md:px-8 py-3 text-white text-sm" style={{ backgroundColor: "#8B5E3C" }}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="flex-shrink-0">&#9888;&#65039;</span>
        <span className="truncate">Your account is pending activation. Enter your order confirmation number to unlock your client dashboard.</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        <a href="/activate" className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-white/40 hover:bg-white/10 transition-colors whitespace-nowrap">
          Activate Now
        </a>
        <button onClick={onDismiss} className="p-1 hover:opacity-70 transition-opacity" aria-label="Dismiss">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Navbar ────────────────────────────────────────────────────────────── */
function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const links = [
    { href: "#pricing", label: "Pricing" },
    { href: "#portfolio", label: "Portfolio" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <nav className="sticky top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="text-xl font-bold text-pine-800">
          Piney Web Co.
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-gray-600 hover:text-pine-700 transition-colors"
            >
              {l.label}
            </a>
          ))}
          {user ? (
            <>
              <a href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-pine-700 transition-colors">
                Dashboard
              </a>
              <button
                onClick={signOut}
                className="text-sm font-medium text-gray-600 hover:text-pine-700 transition-colors"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="text-sm font-medium text-gray-600 hover:text-pine-700 transition-colors">
                Login
              </a>
              <a href="/signup" className="text-sm font-medium px-5 py-2 rounded-full bg-pine-700 text-white hover:bg-pine-800 transition-colors">
                Sign Up
              </a>
            </>
          )}
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-gray-600"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block text-sm font-medium text-gray-600 hover:text-pine-700"
            >
              {l.label}
            </a>
          ))}
          {user ? (
            <>
              <a href="/dashboard" onClick={() => setOpen(false)} className="block text-sm font-medium text-gray-600 hover:text-pine-700">Dashboard</a>
              <button onClick={() => { signOut(); setOpen(false); }} className="block text-sm font-medium text-gray-600 hover:text-pine-700 text-left">Log Out</button>
            </>
          ) : (
            <>
              <a href="/login" className="block text-sm font-medium text-gray-600 hover:text-pine-700">Login</a>
              <a href="/signup" className="block text-sm font-medium text-pine-700">Sign Up</a>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="pt-16 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-8 flex justify-center">
          <Image
            src="/transparentPINEYWEB.png"
            alt="Piney Web Co."
            width={280}
            height={280}
            className="rounded-2xl"
            priority
            unoptimized
          />
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl leading-tight mb-10">
          <span className="font-bold text-sage-700">Your customers are searching.</span>
          <br />
          <span className="italic text-leather-600">Are you there?</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10 -mt-4">
          We build websites designed to be found, trusted, and convert visitors into paying customers — not just look good.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#contact"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-pine-700 text-white font-medium hover:bg-pine-800 transition-colors text-base"
          >
            Start Your Project
          </a>
          <a
            href="#portfolio"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full border-2 border-gray-200 text-gray-700 font-medium hover:border-pine-300 hover:text-pine-700 transition-colors text-base"
          >
            See Our Work
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─── Why Piney Web Co. ─────────────────────────────────────────────────── */
function WhyPineyWeb() {
  const capabilities = [
    "Contact Forms & Quote Requests",
    "Google Maps & Directions",
    "Online Booking & Scheduling",
    "Photo Galleries & Service Showcases",
    "Customer Review Integrations",
    "Payment Collection & Invoicing",
    "Email Automation",
    "Online Stores & Inventory",
    "SEO Setup",
    "Google Business Profile Optimization",
  ];

  return (
    <section className="py-20 px-6 bg-[#FAF8F5]">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sage-600 mb-4">
          WHY PINEY WEB CO.
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
          We&apos;re Not a Template Shop.
        </h2>
        <p className="text-gray-700 leading-relaxed mb-6">
          Most web design companies hand you a Wix template, slap your logo on
          it, and call it a day. We build real websites — custom coded, fast, and
          built to last.
        </p>
        <p className="text-gray-700 leading-relaxed mb-12">
          We know local businesses because we work alongside them every day.
          When we build your site, we&apos;re not outsourcing it overseas or running
          it through a drag-and-drop builder. We&apos;re writing real code, built
          specifically for your business. And when you grow — when you need
          online ordering, a booking system, or a customer portal — we can build
          that too. No switching providers. No starting over. Just call us.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-12 gap-y-4">
          {capabilities.map((item) => (
            <div key={item} className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-sage-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm text-gray-800">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ───────────────────────────────────────────────────────────── */
function Pricing() {
  const tiers = [
    {
      name: "One-Time",
      price: "$799",
      period: "one-time",
      desc: "We design and build your site, then hand it off. You own the code and hosting.",
      features: [
        "Custom multi-page website",
        "Mobile responsive design",
        "Contact form integration",
        "Basic SEO setup",
        "Google Business Profile setup",
        "Source code delivered to you",
        "30 days of post-launch support",
      ],
      cta: "Get Started",
      recommended: false,
    },
    {
      name: "Managed",
      price: "$399",
      priceSetup: "$99/mo",
      period: "setup",
      desc: "We build, host, and manage your site month-to-month. Cancel anytime.",
      features: [
        "Everything in One-Time",
        "Managed hosting & SSL",
        "Monthly content updates",
        "Ongoing SEO optimization",
        "Analytics & monthly reports",
        "Priority support",
        "Security patches & backups",
      ],
      cta: "Start Today",
      recommended: true,
    },
  ];

  const enhancements = [
    { name: "Booking Calendar", price: "$250" },
    { name: "Photo Gallery", price: "$100" },
    { name: "Google Reviews Widget", price: "$75" },
    { name: "Email Newsletter Signup", price: "$100" },
    { name: "Basic E-commerce", price: "$400" },
    { name: "Logo Design", price: "$150" },
    { name: "SEO Setup", price: "$150" },
    { name: "Custom Form", price: "$100" },
  ];

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, Honest Pricing
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            No hidden fees. No long-term contracts. Just quality web services at
            prices that make sense for local businesses.
          </p>
        </div>

        {/* Two tier cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`rounded-xl p-8 border-2 flex flex-col ${
                t.recommended
                  ? "border-pine-600 bg-pine-50 relative"
                  : "border-gray-100 bg-white"
              }`}
            >
              {t.recommended && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-pine-700 text-white text-xs font-bold px-4 py-1 rounded-full">
                  Recommended
                </span>
              )}
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {t.name}
              </h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-900">
                  {t.price}
                </span>
                <span className="text-gray-500 text-sm ml-1">{t.period}</span>
                {t.priceSetup && (
                  <span className="text-gray-500 text-sm ml-2">
                    + {t.priceSetup}
                  </span>
                )}
              </div>
              <p className="text-gray-600 text-sm mb-6">{t.desc}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="w-5 h-5 text-pine-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={`text-center py-3 rounded-full font-medium transition-colors ${
                  t.recommended
                    ? "bg-pine-700 text-white hover:bg-pine-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {t.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Optional Enhancements */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">
            Optional Enhancements
          </h3>
          <p className="text-gray-500 text-sm text-center mb-8">
            Add any of these to either tier
          </p>
          <div className="grid sm:grid-cols-2 gap-x-12 gap-y-4">
            {enhancements.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0"
              >
                <span className="text-sm text-gray-700">{e.name}</span>
                <span className="text-sm font-semibold text-gray-900 ml-4 flex-shrink-0">
                  {e.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Outreach Scanner ──────────────────────────────────────────────────── */
function OutreachScanner() {
  const features = [
    "Custom-configured scanner built around your business type and ideal customer",
    "Automated personalized cold emails sent daily",
    "Prospective phone numbers compiled for cold calling",
    "Bulk SMS outreach available (requires business verification)",
    "Full prospect CRM — track who was contacted, who replied, who's interested",
    "Daily activity summary sent to your inbox",
  ];

  const plans = [
    { name: "Starter", volume: "25 outreaches/day", price: "$799", period: "/mo" },
    { name: "Growth", volume: "50 outreaches/day", price: "$1,299", period: "/mo" },
    { name: "Agency", volume: "100 outreaches/day", price: "$2,499", period: "/mo" },
  ];

  return (
    <section className="py-20 px-6" style={{ backgroundColor: "#FAF8F5" }}>
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl p-10 md:p-14" style={{ backgroundColor: "#fef9f1", borderLeft: "4px solid #4A7C59" }}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: "#8B5E3C" }}>
            Premium Add-On
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Custom Tailored Outreach Scanner
          </h2>
          <p className="text-lg italic mb-6" style={{ color: "#4A7C59" }}>
            Your ideal customers, found and contacted automatically — every single day.
          </p>
          <p className="text-gray-700 leading-relaxed mb-10 max-w-3xl">
            Automatically finds your ideal customers in your local area and reaches out to them on your behalf — every single day, on autopilot. All you have to do is reply to interested leads.
          </p>

          {/* What's included */}
          <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-gray-900 mb-5">
            What&apos;s Included
          </h3>
          <div className="grid sm:grid-cols-2 gap-x-12 gap-y-4 mb-12">
            {features.map((f) => (
              <div key={f} className="flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#4A7C59" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-gray-700">{f}</span>
              </div>
            ))}
          </div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {plans.map((p) => (
              <div key={p.name} className="rounded-xl border p-6 text-center" style={{ backgroundColor: "#fff", borderColor: "#e7e2da" }}>
                <h4 className="text-lg font-bold text-gray-900 mb-1">{p.name}</h4>
                <p className="text-sm mb-4" style={{ color: "#4A7C59" }}>{p.volume}</p>
                <div className="mb-2">
                  <span className="text-3xl font-bold text-gray-900">{p.price}</span>
                  <span className="text-gray-500 text-sm">{p.period}</span>
                </div>
                <p className="text-xs text-gray-500">Starting at</p>
              </div>
            ))}
          </div>

          <p className="text-sm italic text-center mb-10" style={{ color: "#717971" }}>
            Actual pricing depends on your industry, target audience, and geographic coverage. Every scanner is custom built for your business.
          </p>

          <div className="text-center">
            <a
              href="#contact"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full text-white font-medium hover:opacity-90 transition-opacity text-base"
              style={{ backgroundColor: "#4A7C59" }}
            >
              Get Started
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Portfolio ──────────────────────────────────────────────────────────── */
function Portfolio() {
  const projects = [
    {
      name: "PitStop",
      desc: "On-demand auto parts delivery marketplace connecting customers, vendors, and drivers across East Texas.",
      image: "",
      video: "https://www.youtube.com/embed/zbmlKLecixk?si=PBdqf-m_7CMaP4L7",
      url: "https://orderpitstop.com",
      tags: ["Marketplace", "Next.js", "East Texas"],
      bg: "#0a0f1e",
    },
    {
      name: "Sip Society",
      desc: "Mobile bartending LLC serving East Texas events, weddings, and private parties.",
      image: "/sipsociety.png",
      url: "https://sipsociety.social",
      tags: ["Local Business", "Mobile Bar", "East Texas"],
      bg: "#000000",
    },
  ];

  return (
    <section id="portfolio" className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our Work
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Real projects for real businesses. Take a look at what we&apos;ve built.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {projects.map((p) => (
            <div
              key={p.name}
              className="group rounded-xl overflow-hidden hover:shadow-lg transition-all"
              style={{ backgroundColor: p.bg }}
            >
              <div className="relative overflow-hidden">
                {p.video ? (
                  <iframe
                    width="100%"
                    style={{ aspectRatio: "16/9", borderRadius: "8px 8px 0 0" }}
                    src={p.video}
                    title={`${p.name} Demo`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : (
                  <div className="h-[200px] relative">
                    <Image
                      src={p.image}
                      alt={p.name}
                      fill
                      unoptimized
                      className="object-contain group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                )}
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 text-gray-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <h3 className="text-xl font-semibold text-white mb-1">
                  {p.name}
                </h3>
                <p className="text-gray-400 text-sm mb-3">{p.desc}</p>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-pine-400 hover:text-pine-300 transition-colors"
                >
                  View Site
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Quick Inquiry Form ─────────────────────────────────────────────────── */
function IntakeForm() {
  const [form, setForm] = useState({ name: "", business: "", phone: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY,
          subject: `New inquiry from ${form.name} — ${form.business || "No business name"}`,
          from_name: form.name,
          name: form.name,
          business_name: form.business,
          phone: form.phone,
          email: form.email,
          message: form.message,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("success");
        setForm({ name: "", business: "", phone: "", email: "", message: "" });
      } else {
        setErrorMsg(data.message || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  };

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm";

  return (
    <section id="contact" className="py-20 px-6">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Get In Touch
          </h2>
          <p className="text-gray-600">
            Tell us about your business and we&apos;ll get back to you within 24 hours.
          </p>
        </div>

        {status === "success" ? (
          <div className="bg-pine-50 border border-pine-200 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-2xl font-bold text-pine-800 mb-2">Thank you!</h3>
            <p className="text-pine-700">
              We&apos;ve received your message and will be in touch within 24 hours.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-8 space-y-5 shadow-sm">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" value={form.name} onChange={set("name")} placeholder="John Smith" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                <input type="text" value={form.business} onChange={set("business")} placeholder="Your Business Name" className={inputClass} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 555-0123" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={form.email} onChange={set("email")} placeholder="you@business.com" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea rows={4} value={form.message} onChange={set("message")} placeholder="Tell us about your project or ask us anything..." className={`${inputClass} resize-vertical`} />
            </div>

            {status === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={status === "sending" || !form.name.trim() || !form.email.trim()}
              className="w-full py-3.5 rounded-full bg-pine-700 text-white font-medium hover:bg-pine-800 transition-colors text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending" ? "Sending..." : "Send Message"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="py-16 px-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <h3 className="text-xl font-bold mb-4" style={{ color: '#4A7C59' }}>
              Piney Web Co.
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#3D2B1F' }}>
              Professional web design for local businesses nationwide. Built to
              bring customers to you.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: '#4A7C59' }}>
              Quick Links
            </h4>
            <ul className="space-y-2 text-sm" style={{ color: '#3D2B1F' }}>
              <li>
                <a href="#pricing" className="hover:opacity-70 transition-opacity">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#portfolio" className="hover:opacity-70 transition-opacity">
                  Portfolio
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:opacity-70 transition-opacity">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: '#4A7C59' }}>
              Contact
            </h4>
            <ul className="space-y-2 text-sm" style={{ color: '#3D2B1F' }}>
              <li>Longview, TX</li>
              <li>
                <a
                  href="mailto:hello@pineyweb.com"
                  className="hover:opacity-70 transition-opacity"
                >
                  hello@pineyweb.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4" style={{ borderTop: '1px solid #D4C9B8' }}>
          <p className="text-sm" style={{ color: '#3D2B1F', opacity: 0.6 }}>
            &copy; {new Date().getFullYear()} Piney Web Co. All rights reserved.
          </p>
          <p className="text-sm italic" style={{ color: '#3D2B1F', opacity: 0.6 }}>
            Your customers are searching. Are you there?
          </p>
        </div>
      </div>
    </footer>
  );
}
