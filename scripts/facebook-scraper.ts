import { chromium, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PINEYWEB_URL = process.env.PINEYWEB_URL || "https://pineyweb.com";
const SESSION_FILE = process.env.FACEBOOK_STATE_FILE || "scripts/fb-session.json";

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.includes("@") && v.includes(".");

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`[${ts()}]   Waiting ${Math.round(ms / 1000)}s...`);
  return new Promise(r => setTimeout(r, ms));
}

function fuzzyClean(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(llc|inc|corp|co|ltd|pllc|pc|pa|dba|and)\b/g, "")
    .replace(/[&'''",.\-–—]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(pageName: string, businessName: string): boolean {
  const a = fuzzyClean(pageName);
  const b = fuzzyClean(businessName);
  return a.includes(b) || b.includes(a) || a === b;
}

async function loadOrCreateSession(context: BrowserContext): Promise<void> {
  const sessionPath = path.resolve(SESSION_FILE);

  if (fs.existsSync(sessionPath)) {
    console.log(`[${ts()}] Loading saved Facebook session...`);
    const cookies = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    await context.addCookies(cookies);
    console.log(`[${ts()}] Loaded ${cookies.length} cookies`);
    return;
  }

  console.log(`\n[${ts()}] No saved session found. Opening Facebook for manual login...`);
  console.log(`[${ts()}] Log in to Facebook manually, then press Enter in this terminal.\n`);

  const page = await context.newPage();
  await page.goto("https://www.facebook.com/login");
  await page.waitForURL("**/facebook.com/**", { timeout: 300000 }).catch(() => {});

  // Wait for user to press Enter
  await new Promise<void>(resolve => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });

  const cookies = await context.cookies();
  fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  console.log(`[${ts()}] Saved ${cookies.length} cookies to ${sessionPath}`);
  await page.close();
}

const SYSTEM_EMAIL_DOMAINS = ["facebook.com", "fb.com", "sentry.io", "example.com", "fbcdn.net"];

function extractEmailFromText(text: string): string | null {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (!matches) return null;
  for (const match of matches) {
    if (SYSTEM_EMAIL_DOMAINS.some(d => match.includes(d))) continue;
    if (isValidEmail(match)) return match;
  }
  return null;
}

async function extractEmail(page: Page): Promise<string | null> {
  try {
    // Step 1: Scan the main page content immediately
    console.log(`[${ts()}]   Scanning main page for email...`);
    const mainText = await page.textContent("body") || "";
    const mainEmail = extractEmailFromText(mainText);
    if (mainEmail) {
      console.log(`[${ts()}]   Email found on main page`);
      return mainEmail;
    }

    // Check mailto links on main page
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (href) {
        const raw = href.replace("mailto:", "").split("?")[0];
        const email = extractEmailFromText(raw);
        if (email) {
          console.log(`[${ts()}]   Email found via mailto link`);
          return email;
        }
      }
    }

    // Step 2: Fallback — navigate to contact info page
    const currentUrl = page.url().replace(/\/$/, "");
    const contactUrl = currentUrl.includes("profile.php?id=")
      ? currentUrl + "&sk=about_contact_and_basic_info"
      : currentUrl + "/directory_contact_info";
    console.log(`[${ts()}]   No email on main page, trying: ${contactUrl}`);
    await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    const contactText = await page.textContent("body") || "";
    const contactEmail = extractEmailFromText(contactText);
    if (contactEmail) {
      console.log(`[${ts()}]   Email found on contact info page`);
      return contactEmail;
    }
  } catch (err) {
    console.log(`[${ts()}]   Error extracting email: ${err instanceof Error ? err.message : err}`);
  }
  return null;
}

function phoneDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "").slice(-10);
}

async function confirmPhoneMatch(page: Page, phone: string | null): Promise<boolean> {
  if (!phone) return true;
  try {
    const bodyText = await page.textContent("body") || "";
    const target = phoneDigits(phone);
    if (target.length < 10) return true;
    return bodyText.replace(/[^\d]/g, "").includes(target);
  } catch {
    return true;
  }
}

async function searchFacebook(
  page: Page,
  businessName: string,
  city: string,
  phone: string | null
): Promise<{ url: string | null; email: string | null }> {
  const query = encodeURIComponent(`${businessName} ${city} TX`);
  const searchUrl = `https://www.facebook.com/search/pages/?q=${query}`;

  console.log(`[${ts()}]   Searching Facebook: "${businessName} ${city} TX"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  if (page.url().includes("/login")) {
    console.log(`[${ts()}]   Session expired — redirected to login`);
    return { url: null, email: null };
  }

  // Collect all links that look like Facebook page links
  const allLinks = await page.locator("a[href]").all();
  const candidates: { text: string; href: string }[] = [];

  for (const link of allLinks) {
    const href = await link.getAttribute("href").catch(() => null);
    const text = await link.textContent().catch(() => null);
    if (!href || !text) continue;
    if (!href.includes("facebook.com/")) continue;
    if (href.includes("/search/") || href.includes("/login") || href.includes("/help") || href.includes("/policies")) continue;
    if (text.trim().length < 3) continue;
    candidates.push({ text: text.trim(), href });
  }

  console.log(`[${ts()}]   Found ${candidates.length} candidate page links`);

  for (const { text, href } of candidates) {
    if (fuzzyMatch(text, businessName)) {
      console.log(`[${ts()}]   Matched: "${text}"`);

      await page.goto(href, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2000);

      const phoneOk = await confirmPhoneMatch(page, phone);
      if (phoneOk) {
        console.log(`[${ts()}]   Phone confirmed`);
      } else {
        console.log(`[${ts()}]   Phone mismatch but name/city match, proceeding`);
      }

      const email = await extractEmail(page);
      return { url: page.url(), email };
    }
  }

  console.log(`[${ts()}]   No matching Facebook page found`);
  return { url: null, email: null };
}

async function sendOutreach(prospect: {
  place_id: string;
  business_name: string;
  email: string;
  city: string;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  priority_tier: number;
}): Promise<boolean> {
  try {
    const res = await fetch(`${PINEYWEB_URL}/api/admin/outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospects: [{
          place_id: prospect.place_id,
          business_name: prospect.business_name,
          email: prospect.email,
          email_source: "Facebook",
          address: "",
          city: prospect.city,
          phone: prospect.phone,
          rating: prospect.rating,
          review_count: prospect.review_count || 0,
          priority_tier: prospect.priority_tier,
        }],
      }),
    });
    const data = await res.json();
    if (data.sent > 0) {
      console.log(`[${ts()}]   Outreach sent successfully`);
      return true;
    } else {
      console.log(`[${ts()}]   Outreach skipped (dedup or error): ${JSON.stringify(data)}`);
      return false;
    }
  } catch (err) {
    console.log(`[${ts()}]   Outreach failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main() {
  console.log(`[${ts()}] Facebook Scraper starting...\n`);

  const { data: prospects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, place_id, business_name, phone, city, rating, review_count, priority_tier")
    .is("email", null)
    .not("phone", "is", null)
    .gte("review_count", 5)
    .not("notes", "ilike", "%No Facebook presence%")
    .not("notes", "ilike", "%Facebook found, no email listed%")
    .order("priority_tier", { ascending: true })
    .order("rating", { ascending: false })
    .limit(5);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!prospects || prospects.length === 0) { console.log("No prospects found"); return; }

  console.log(`[${ts()}] Loaded ${prospects.length} prospects\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  await loadOrCreateSession(context);
  const page = await context.newPage();

  let hits = 0;
  let emailsSent = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    console.log(`\n[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} (${p.city}) — T${p.priority_tier}, ${p.rating}★, ${p.review_count} reviews`);

    try {
      const { url, email } = await searchFacebook(page, p.business_name, p.city, p.phone);

      if (email) {
        hits++;
        console.log(`[${ts()}]   ✓ EMAIL FOUND: ${email}`);
        console.log(`[${ts()}]   Facebook page: ${url}`);

        // Save email to database
        const { error: updateErr } = await supabase
          .from("pineyweb_prospects")
          .update({ email, email_source: "Facebook" })
          .eq("place_id", p.place_id);

        if (updateErr) {
          console.log(`[${ts()}]   DB save failed: ${updateErr.message}`);
        } else {
          console.log(`[${ts()}]   Saved to database`);

          // Send cold outreach immediately
          const sent = await sendOutreach({ ...p, email });
          if (sent) {
            emailsSent++;
            // emailed_at is set by the outreach route on successful send
          }
        }
      } else if (url) {
        console.log(`[${ts()}]   ✗ Page found but no email: ${url}`);
        await supabase
          .from("pineyweb_prospects")
          .update({ notes: "Facebook found, no email listed", contact_method: "facebook_message" })
          .eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: Facebook found, no email listed`);
      } else {
        console.log(`[${ts()}]   ✗ No Facebook page found`);
        await supabase
          .from("pineyweb_prospects")
          .update({ notes: "No Facebook presence", contact_method: "phone" })
          .eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: No Facebook presence`);
      }
    } catch (err) {
      console.log(`[${ts()}]   ✗ Error: ${err instanceof Error ? err.message : err}`);
    }

    // Random delay 45-90 seconds between searches
    if (i < prospects.length - 1) {
      await randomDelay(45000, 90000);
    }
  }

  // Save session cookies
  const cookies = await context.cookies();
  fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(cookies, null, 2));
  console.log(`\n[${ts()}] Session cookies saved.`);

  await browser.close();

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${prospects.length}`);
  console.log(`Emails found: ${hits}`);
  console.log(`Outreach sent: ${emailsSent}`);
  console.log(`Hit rate: ${prospects.length > 0 ? ((hits / prospects.length) * 100).toFixed(1) : 0}%`);
}

main();
