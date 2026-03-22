import { chromium, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_FILE = process.env.FACEBOOK_STATE_FILE || "scripts/fb-session.json";

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.includes("@") && v.includes(".");

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`  Waiting ${Math.round(ms / 1000)}s...`);
  return new Promise(r => setTimeout(r, ms));
}

function fuzzyMatch(pageName: string, businessName: string): boolean {
  const clean = (s: string) =>
    s.toLowerCase()
      .replace(/\b(llc|inc|corp|co|ltd|pllc|pc|pa|dba)\b/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const a = clean(pageName);
  const b = clean(businessName);
  return a.includes(b) || b.includes(a) || a === b;
}

async function loadOrCreateSession(context: BrowserContext): Promise<void> {
  const sessionPath = path.resolve(SESSION_FILE);

  if (fs.existsSync(sessionPath)) {
    console.log("Loading saved Facebook session...");
    const cookies = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    await context.addCookies(cookies);
    console.log(`Loaded ${cookies.length} cookies`);
    return;
  }

  console.log("\nNo saved session found. Opening Facebook for manual login...");
  console.log("Log in to Facebook manually, then press Enter in this terminal.\n");

  const page = await context.newPage();
  await page.goto("https://www.facebook.com/login");
  await page.waitForURL("https://www.facebook.com/", { timeout: 300000 }).catch(() => {
    // User might land on a different URL after login
  });

  // Wait for user to press Enter
  await new Promise<void>(resolve => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });

  // Save cookies
  const cookies = await context.cookies();
  fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  console.log(`Saved ${cookies.length} cookies to ${sessionPath}`);
  await page.close();
}

async function extractEmailFromAbout(page: Page): Promise<string | null> {
  try {
    // Navigate to the About section
    const currentUrl = page.url();
    const aboutUrl = currentUrl.replace(/\/$/, "") + "/about";
    await page.goto(aboutUrl, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    // Get all text content from the page
    const bodyText = await page.textContent("body") || "";

    // Look for email patterns in the page text
    const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g;
    const matches = bodyText.match(emailPattern);
    if (matches) {
      for (const match of matches) {
        // Skip Facebook's own emails
        if (match.includes("facebook.com") || match.includes("fb.com")) continue;
        if (isValidEmail(match)) return match;
      }
    }

    // Also try to find email in specific About section elements
    const aboutSections = await page.locator('[role="main"] span, [role="main"] a[href^="mailto:"]').all();
    for (const el of aboutSections) {
      const text = await el.textContent().catch(() => null);
      if (text) {
        const elMatches = text.match(emailPattern);
        if (elMatches) {
          for (const m of elMatches) {
            if (!m.includes("facebook.com") && !m.includes("fb.com") && isValidEmail(m)) return m;
          }
        }
      }
      // Check mailto links
      const href = await el.getAttribute("href").catch(() => null);
      if (href?.startsWith("mailto:")) {
        const email = href.replace("mailto:", "").split("?")[0];
        if (isValidEmail(email)) return email;
      }
    }
  } catch (err) {
    console.log(`  Error extracting email: ${err instanceof Error ? err.message : err}`);
  }

  return null;
}

async function confirmPhoneMatch(page: Page, phone: string | null): Promise<boolean> {
  if (!phone) return true; // No phone to confirm against
  try {
    const bodyText = await page.textContent("body") || "";
    const cleanPhone = phone.replace(/[^\d]/g, "");
    const pagePhones = bodyText.replace(/[^\d\s]/g, " ").match(/\d{10,}/g) || [];
    return pagePhones.some(p => p.includes(cleanPhone) || cleanPhone.includes(p));
  } catch {
    return true; // Don't block on errors
  }
}

async function searchFacebook(
  page: Page,
  businessName: string,
  city: string,
  state: string,
  phone: string | null
): Promise<{ url: string | null; email: string | null }> {
  const query = encodeURIComponent(`${businessName} ${city} ${state}`);
  const searchUrl = `https://www.facebook.com/search/pages/?q=${query}`;

  console.log(`  Navigating to search...`);
  await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check if we're blocked or need login
  if (page.url().includes("/login")) {
    console.log(`  Redirected to login — session expired`);
    return { url: null, email: null };
  }

  // Look for search results
  const resultLinks = await page.locator('a[role="presentation"], a[href*="facebook.com/"]').all();
  console.log(`  Found ${resultLinks.length} links on page`);

  for (const link of resultLinks) {
    const text = await link.textContent().catch(() => null);
    const href = await link.getAttribute("href").catch(() => null);

    if (!text || !href) continue;
    if (!href.includes("facebook.com/")) continue;
    // Skip non-page links
    if (href.includes("/search/") || href.includes("/login") || href.includes("/help")) continue;

    if (fuzzyMatch(text, businessName)) {
      console.log(`  Matched: "${text}" → ${href}`);

      // Navigate to the page
      await page.goto(href, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);

      // Confirm phone match
      const phoneOk = await confirmPhoneMatch(page, phone);
      if (!phoneOk) {
        console.log(`  Phone mismatch — skipping`);
        continue;
      }

      // Extract email from About
      const email = await extractEmailFromAbout(page);
      return { url: href, email };
    }
  }

  console.log(`  No matching page found`);
  return { url: null, email: null };
}

async function main() {
  // Fetch prospects
  const { data: prospects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, place_id, business_name, phone, city, rating, review_count, priority_tier")
    .is("email", null)
    .not("phone", "is", null)
    .gte("review_count", 5)
    .order("priority_tier", { ascending: true })
    .order("rating", { ascending: false })
    .limit(10);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!prospects || prospects.length === 0) { console.log("No prospects found"); return; }

  console.log(`Facebook Scraper — ${prospects.length} prospects to search\n`);

  // Launch browser (non-headless)
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  // Load or create session
  await loadOrCreateSession(context);

  const page = await context.newPage();
  let hits = 0;
  let tested = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    tested++;

    console.log(`\n[${tested}/${prospects.length}] ${p.business_name} (${p.city}) — T${p.priority_tier}, ${p.rating}★, ${p.review_count} reviews`);

    try {
      const { url, email } = await searchFacebook(page, p.business_name, p.city, "TX", p.phone);

      if (email) {
        hits++;
        console.log(`  ✓ EMAIL FOUND: ${email}`);
        console.log(`    Facebook: ${url}`);

        // Save to database
        const { error: updateErr } = await supabase
          .from("pineyweb_prospects")
          .update({ email, email_source: "Facebook" })
          .eq("place_id", p.place_id);

        if (updateErr) {
          console.log(`    Save failed: ${updateErr.message}`);
        } else {
          console.log(`    Saved to database`);
        }
      } else if (url) {
        console.log(`  ✗ Page found but no email: ${url}`);
      } else {
        console.log(`  ✗ No Facebook page found`);
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
    }

    // Break every 25 searches (10-15 min)
    if (tested > 0 && tested % 25 === 0) {
      const breakMin = Math.floor(Math.random() * 6) + 10;
      console.log(`\n--- Taking a ${breakMin} minute break ---`);
      await new Promise(r => setTimeout(r, breakMin * 60 * 1000));
    }

    // Random delay between searches (2-4 minutes)
    if (i < prospects.length - 1) {
      await randomDelay(120000, 240000);
    }
  }

  // Save session cookies after run
  const cookies = await context.cookies();
  fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(cookies, null, 2));
  console.log(`\nSession cookies saved.`);

  await browser.close();

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Hits: ${hits}`);
  console.log(`Hit rate: ${tested > 0 ? ((hits / tested) * 100).toFixed(1) : 0}%`);
}

main();
