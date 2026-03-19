"use client";

import Image from "next/image";
import { useState } from "react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Services />
      <Pricing />
      <Portfolio />
      <IntakeForm />
      <Footer />
    </div>
  );
}

/* ─── Navbar ────────────────────────────────────────────────────────────── */
function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#services", label: "Services" },
    { href: "#pricing", label: "Pricing" },
    { href: "#portfolio", label: "Portfolio" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="font-serif text-xl font-bold text-pine-800">
          Piney Web Co.
        </a>

        {/* Desktop links */}
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
          <a
            href="#contact"
            className="text-sm font-medium px-5 py-2 rounded-full bg-pine-700 text-white hover:bg-pine-800 transition-colors"
          >
            Get Started
          </a>
        </div>

        {/* Mobile hamburger */}
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

      {/* Mobile menu */}
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
          <a
            href="#contact"
            onClick={() => setOpen(false)}
            className="block text-sm font-medium text-pine-700"
          >
            Get Started
          </a>
        </div>
      )}
    </nav>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo.png"
            alt="Piney Web Co."
            width={280}
            height={280}
            className="rounded-2xl"
            priority
          />
        </div>
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Websites Built for{" "}
          <span className="text-pine-700">East Texas</span> Businesses
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          Your customers are already searching online. We build fast, modern
          websites that make sure they find you first — not your competition.
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

/* ─── Services ──────────────────────────────────────────────────────────── */
function Services() {
  const services = [
    {
      icon: "🎨",
      title: "Custom Web Design",
      desc: "Unique designs tailored to your brand — no cookie-cutter templates. Mobile-first so your site looks great on every device.",
    },
    {
      icon: "🔍",
      title: "Local SEO",
      desc: "Get found on Google when locals search for your services. Google Business Profile optimization, local keywords, and schema markup.",
    },
    {
      icon: "⚡",
      title: "Fast & Reliable Hosting",
      desc: "Lightning-fast load times on modern infrastructure. SSL certificates, daily backups, and 99.9% uptime guaranteed.",
    },
    {
      icon: "🛠️",
      title: "Ongoing Support",
      desc: "We don't disappear after launch. Content updates, security patches, and performance monitoring — all included.",
    },
    {
      icon: "📱",
      title: "Social Media Integration",
      desc: "Connect your website to your social accounts, embed feeds, and make it easy for customers to share your content.",
    },
    {
      icon: "📊",
      title: "Analytics & Reporting",
      desc: "Know exactly how your site is performing. Monthly reports on traffic, search rankings, and customer engagement.",
    },
  ];

  return (
    <section id="services" className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything Your Business Needs Online
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            From design to deployment to ongoing support — we handle it all so
            you can focus on running your business.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((s) => (
            <div
              key={s.title}
              className="bg-white rounded-xl p-8 border border-gray-100 hover:border-pine-200 hover:shadow-lg transition-all"
            >
              <div className="text-3xl mb-4">{s.icon}</div>
              <h3 className="font-serif text-xl font-semibold text-gray-900 mb-2">
                {s.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ───────────────────────────────────────────────────────────── */
function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "$499",
      period: "one-time",
      desc: "Perfect for new businesses that need a professional online presence fast.",
      features: [
        "Single-page website",
        "Mobile responsive design",
        "Contact form",
        "Google Business Profile setup",
        "Basic SEO setup",
        "1 month free support",
      ],
      cta: "Get Started",
      popular: false,
    },
    {
      name: "Professional",
      price: "$999",
      period: "one-time",
      desc: "For established businesses ready to dominate their local market online.",
      features: [
        "Up to 5 pages",
        "Custom design",
        "Local SEO optimization",
        "Social media integration",
        "Analytics dashboard",
        "3 months free support",
        "Content writing assistance",
      ],
      cta: "Most Popular",
      popular: true,
    },
    {
      name: "Growth",
      price: "$149",
      period: "/month",
      desc: "Ongoing partnership for businesses that want continuous growth and support.",
      features: [
        "Everything in Professional",
        "Monthly content updates",
        "SEO monitoring & adjustments",
        "Priority support",
        "Monthly performance reports",
        "Social media posting (4/mo)",
        "Hosting included",
      ],
      cta: "Start Growing",
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, Honest Pricing
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            No hidden fees. No long-term contracts. Just quality web services at
            prices that make sense for East Texas businesses.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl p-8 border-2 flex flex-col ${
                p.popular
                  ? "border-pine-600 bg-pine-50 relative"
                  : "border-gray-100 bg-white"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-pine-700 text-white text-xs font-bold px-4 py-1 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="font-serif text-2xl font-bold text-gray-900 mb-1">
                {p.name}
              </h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-900">
                  {p.price}
                </span>
                <span className="text-gray-500 text-sm ml-1">{p.period}</span>
              </div>
              <p className="text-gray-600 text-sm mb-6">{p.desc}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {p.features.map((f) => (
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
                  p.popular
                    ? "bg-pine-700 text-white hover:bg-pine-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {p.cta}
              </a>
            </div>
          ))}
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
      image: "/pitstop.png",
      url: "https://orderpitstop.com",
      tags: ["Next.js", "Full-Stack", "Marketplace"],
    },
    {
      name: "Sip Society",
      desc: "Social platform for craft beverage enthusiasts — discover, review, and share your favorite drinks.",
      image: "/sipsociety.png",
      url: "https://sipsociety.social",
      tags: ["Web App", "Social", "Community"],
    },
  ];

  return (
    <section id="portfolio" className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our Work
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Real projects for real businesses. Take a look at what we&apos;ve built.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {projects.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-pine-200 hover:shadow-lg transition-all"
            >
              <div className="aspect-video bg-gray-100 relative overflow-hidden">
                <Image
                  src={p.image}
                  alt={p.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-pine-50 text-pine-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <h3 className="font-serif text-xl font-semibold text-gray-900 mb-1 group-hover:text-pine-700 transition-colors">
                  {p.name}
                </h3>
                <p className="text-gray-600 text-sm">{p.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Intake Form ───────────────────────────────────────────────────────── */
function IntakeForm() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contact" className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Start Your Project
          </h2>
          <p className="text-gray-600">
            Tell us about your business and we&apos;ll get back to you within 24
            hours with a free consultation.
          </p>
        </div>

        {submitted ? (
          <div className="bg-pine-50 border border-pine-200 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="font-serif text-2xl font-bold text-pine-800 mb-2">
              Thank you!
            </h3>
            <p className="text-pine-700">
              We&apos;ve received your project details and will be in touch within 24
              hours.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-gray-100 p-8 space-y-6 shadow-sm"
          >
            {/* Row: Owner Name + Business Name */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner Name *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                  placeholder="Dustin Hartman"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                  placeholder="Your Business Name"
                />
              </div>
            </div>

            {/* Row: Email + Phone */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                  placeholder="you@business.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                  placeholder="(903) 555-0123"
                />
              </div>
            </div>

            {/* Business Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Address
              </label>
              <input
                type="text"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                placeholder="123 Main St, Longview, TX 75601"
              />
            </div>

            {/* Business Hours */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Hours
              </label>
              <input
                type="text"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                placeholder="Mon-Fri 8am-5pm, Sat 9am-1pm"
              />
            </div>

            {/* Website + Industry */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Website (if any)
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Industry / Type of Business *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                  placeholder="Auto repair, restaurant, etc."
                />
              </div>
            </div>

            {/* Color Preferences */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color Preferences
              </label>
              <input
                type="text"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm"
                placeholder="Blue and white, match my logo, no preference, etc."
              />
            </div>

            {/* What do you need */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What do you need? *
              </label>
              <select
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm bg-white"
              >
                <option value="">Select one...</option>
                <option value="new">New website from scratch</option>
                <option value="redesign">Redesign existing website</option>
                <option value="seo">SEO / get found on Google</option>
                <option value="maintenance">Website maintenance</option>
                <option value="other">Something else</option>
              </select>
            </div>

            {/* Project Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tell us about your project
              </label>
              <textarea
                rows={4}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-pine-500 focus:border-transparent outline-none transition-shadow text-sm resize-vertical"
                placeholder="What does your business do? What are your goals for the website? Any specific features you need?"
              />
            </div>

            {/* File Uploads */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo Upload
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pine-50 file:text-pine-700 hover:file:bg-pine-100 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo Uploads
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pine-50 file:text-pine-700 hover:file:bg-pine-100 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-pine-700 text-white font-medium hover:bg-pine-800 transition-colors text-base"
            >
              Submit Project Inquiry
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <h3 className="font-serif text-xl font-bold text-white mb-4">
              Piney Web Co.
            </h3>
            <p className="text-sm leading-relaxed text-gray-400">
              Professional web design and digital marketing for East Texas small
              businesses. Based in Longview, serving the entire piney woods
              region.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">
              Quick Links
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#services" className="hover:text-pine-400 transition-colors">
                  Services
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-pine-400 transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#portfolio" className="hover:text-pine-400 transition-colors">
                  Portfolio
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-pine-400 transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">
              Contact
            </h4>
            <ul className="space-y-2 text-sm">
              <li>Longview, TX</li>
              <li>
                <a
                  href="mailto:hello@pineyweb.com"
                  className="hover:text-pine-400 transition-colors"
                >
                  hello@pineyweb.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Piney Web Co. All rights reserved.
          </p>
          <p className="text-sm font-serif italic text-gray-400">
            Your customers are searching. Are you there?
          </p>
        </div>
      </div>
    </footer>
  );
}
