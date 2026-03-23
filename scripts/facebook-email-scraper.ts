/**
 * Phase 2 — Facebook Email Scraper with Rotating Residential Proxies
 *
 * Reads Facebook page candidates from pineyweb_prospect_facebook_candidates
 * (populated by Phase 1: scripts/google-search.ts), visits each page via
 * Playwright with Webshare rotating proxies, extracts emails, saves to
 * pineyweb_prospects.
 *
 * Usage: npx tsx scripts/facebook-email-scraper.ts
 *
 * Requires in .env.local:
 *   WEBSHARE_HOST, WEBSHARE_PORT, WEBSHARE_USERNAME, WEBSHARE_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY (for Claude verification)
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

chromium.use(StealthPlugin());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PINEYWEB_URL = process.env.PINEYWEB_URL || "https://pineyweb.com";
const TEST_MODE = true; // true = no proxy, 5 prospects only | false = full proxy, unlimited

// Webshare rotating residential proxy — same credentials, different IP every request
const PROXY_CONFIG = (!TEST_MODE && process.env.WEBSHARE_HOST) ? {
  server: `http://${process.env.WEBSHARE_HOST}:${process.env.WEBSHARE_PORT}`,
  username: process.env.WEBSHARE_USERNAME || "",
  password: process.env.WEBSHARE_PASSWORD || "",
} : null;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }
if (!TEST_MODE && !PROXY_CONFIG) { console.error("Missing WEBSHARE_HOST/PORT/USERNAME/PASSWORD"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

// ============================================================================
// EMAIL / WEBSITE EXTRACTION (shared logic from facebook-scraper)
// ============================================================================

const IGNORED_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "messenger.com", "whatsapp.com", "meta.com", "wa.me", "twitter.com", "x.com", "tiktok.com", "youtube.com", "google.com", "apple.com"];
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}(?=[^a-zA-Z]|$)/g;
const EMAIL_BLACKLIST = /example|sentry|domain|@facebook|@meta|@fb\.com|noreply|no-reply|test@|@test\./i;

function sanitizePageText(text: string): string {
  return text.replace(/Comment as Piney Web Co\.?/gi, "").replace(/Comment as Dustin Hartman\.?/gi, "")
    .replace(/[^\s]*@facebook\.com[^\s]*/g, "").replace(/EmailMessenger/gi, " ")
    .replace(/MobileEmail/gi, " ").replace(/EmailEmail/gi, " ");
}

function extractCleanEmail(text: string): string | null {
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;
  for (const email of matches) {
    if (email.length > 100) continue;
    if (EMAIL_BLACKLIST.test(email)) continue;
    return email;
  }
  return null;
}

function extractWebsiteUrl(text: string): string | null {
  const urlMatches = text.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s)"]*/g) || [];
  const bareDomainPatterns = /\b([a-zA-Z0-9-]+\.(business\.site|linktr\.ee|squarespace\.com|wix\.com|weebly\.com|godaddysites\.com|wordpress\.com|carrd\.co|bio\.link|beacons\.ai|taplink\.cc))\b/gi;
  const bareMatches = text.match(bareDomainPatterns) || [];
  const allMatches = [...urlMatches, ...bareMatches.map(m => m.startsWith("http") ? m : `https://${m}`)];
  for (const u of allMatches) {
    const domain = u.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    if (IGNORED_DOMAINS.some(d => domain.includes(d))) continue;
    return u;
  }
  return null;
}

// ============================================================================
// FACEBOOK POPUP DISMISSAL
// ============================================================================

async function dismissFacebookPopup(page: Page): Promise<void> {
  try {
    // Detect login/signup popup by form elements, not text content
    const hasLoginForm = await page.evaluate(() => {
      // Check for email/phone input field in any modal
      const inputs = document.querySelectorAll('input[name="email"], input[type="email"], input[placeholder*="email" i], input[placeholder*="phone" i]');
      for (const input of inputs) {
        const dialog = input.closest('[role="dialog"], [aria-modal="true"]');
        if (dialog) return true;
      }
      // Check for "Log In" button in any modal
      const buttons = document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button');
      for (const btn of buttons) {
        if (/^log\s*in$/i.test(btn.textContent?.trim() || "")) return true;
      }
      return false;
    }).catch(() => false);

    if (hasLoginForm) {
      // Click the visible close button
      const closeBtn = page.locator('[aria-label="Close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(500);
        console.log(`[${ts()}]   Dismissed login popup (Close button)`);
        return;
      }
      // Fallback: Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      console.log(`[${ts()}]   Dismissed login popup (Escape)`);
      return;
    }

    // Also check for any visible [aria-label="Close"] on a dialog
    const closeOnDialog = page.locator('[role="dialog"] [aria-label="Close"], [aria-modal="true"] [aria-label="Close"]').first();
    if (await closeOnDialog.isVisible().catch(() => false)) {
      await closeOnDialog.click().catch(() => {});
      await page.waitForTimeout(500);
      console.log(`[${ts()}]   Dismissed popup (dialog close button)`);
    }
  } catch { /* non-blocking */ }
}

// ============================================================================
// PAGE EXTRACTION
// ============================================================================

async function scanPageText(page: Page, label: string): Promise<{ text: string; email: string | null; website: string | null }> {
  const rawText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  const cleaned = sanitizePageText(rawText);
  console.log(`[${ts()}]   ${label}: ${cleaned.length} chars extracted`);
  if (cleaned.length < 500) console.log(`[${ts()}]   ⚠ Low content — page may not be fully loaded`);
  const website = extractWebsiteUrl(cleaned);
  const email = extractCleanEmail(cleaned);
  return { text: cleaned, email, website };
}

async function extractFromFacebookPage(page: Page): Promise<{ email: string | null; website: string | null }> {
  try {
    const baseUrl = page.url();

    // Step 1: Wait for full page content after popup dismissal
    try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch { /* timeout ok */ }

    // Step 2: Scan initial page content
    const initial = await scanPageText(page, "Initial scan");
    if (initial.email) return { email: initial.email, website: initial.website };

    // Check mailto links
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (href) {
        const mailtoEmail = extractCleanEmail(href.replace("mailto:", "").split("?")[0]);
        if (mailtoEmail) { console.log(`[${ts()}]   Email found via mailto`); return { email: mailtoEmail, website: initial.website }; }
      }
    }

    // Step 3: Scroll down to trigger lazy loading of About/Contact section
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: "smooth" }));
    await page.waitForTimeout(2000);
    const scrolled = await scanPageText(page, "After scroll");
    if (scrolled.email) return { email: scrolled.email, website: scrolled.website || initial.website };

    // Step 4: Navigate to /about page and scan
    if (!baseUrl.includes("profile.php?id=")) {
      const aboutUrl = baseUrl.replace(/\/$/, "") + "/about";
      try {
        await page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(1500);
        await dismissFacebookPopup(page);
        const aboutScan = await scanPageText(page, "About page");
        if (aboutScan.email) return { email: aboutScan.email, website: aboutScan.website || initial.website };
      } catch { /* about page failed */ }

      // Step 5: Try /about_contact_and_basic_info
      const contactUrl = baseUrl.replace(/\/$/, "") + "/about_contact_and_basic_info";
      try {
        await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(1500);
        await dismissFacebookPopup(page);
        const contactScan = await scanPageText(page, "Contact page");
        if (contactScan.email) return { email: contactScan.email, website: contactScan.website || initial.website };
      } catch { /* contact page failed */ }
    }

    return { email: null, website: initial.website };
  } catch (err) {
    console.log(`[${ts()}]   Extraction error: ${err instanceof Error ? err.message : err}`);
    return { email: null, website: null };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`[${ts()}] Phase 2 — Facebook Email Scraper with Rotating Proxies\n`);

  // Fetch prospects that have candidates but no email yet
  // Query: has facebook_url set (from Phase 1) + email is null
  console.log(`[${ts()}] Querying prospects with facebook_url but no email...`);
  const { data: prospects, error, count } = await supabase
    .from("pineyweb_prospects")
    .select("id, place_id, business_name, city, phone, rating, review_count, priority_tier", { count: "exact" })
    .is("email", null)
    .not("facebook_url", "is", null)
    .order("priority_tier", { ascending: true })
    .order("rating", { ascending: false });

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  console.log(`[${ts()}] Query returned ${count ?? prospects?.length ?? 0} rows`);
  if (!prospects?.length) { console.log("No prospects to process"); return; }

  console.log(`[${ts()}] Loaded ${prospects.length} prospects with Facebook URLs\n`);

  if (TEST_MODE) console.log(`[${ts()}] TEST MODE — no proxy, direct connection`);
  else console.log(`[${ts()}] Proxy: ${PROXY_CONFIG!.server} (rotating residential — new IP every request)`);

  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });

  let emailsFound = 0, emailsSaved = 0, skipped = 0, errors = 0, websiteSkipped = 0;

  // Session report
  const reportsDir = path.resolve("scripts/session-reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const masterPath = path.join(reportsDir, "master-report.csv");
  const sessionDate = new Date().toISOString();
  const sessionId = `phase2-${sessionDate.replace(/[:.]/g, "-").slice(0, 19)}`;

  const limit = TEST_MODE ? Math.min(5, prospects.length) : prospects.length;
  console.log(`[${ts()}] ${TEST_MODE ? "TEST MODE — processing 5 prospects only" : `Processing all ${limit} prospects`}\n`);

  for (let i = 0; i < limit; i++) {
    const p = prospects[i];

    // Get all candidates for this prospect, ordered by rank
    const { data: candidates } = await supabase
      .from("pineyweb_prospect_facebook_candidates")
      .select("facebook_url, match_score, rank")
      .eq("prospect_id", p.id)
      .order("rank", { ascending: true });

    if (!candidates?.length) { skipped++; continue; }

    // Only try rank 1 candidate — best match from Phase 1
    const candidate = candidates[0];
    let foundEmail = false;

    {
      let context: BrowserContext | null = null;
      try {
        const proxyLabel = PROXY_CONFIG ? "via proxy" : "direct";
        console.log(`[${ts()}] [${i + 1}/${limit}] ${p.business_name} (${p.city}) — score ${candidate.match_score}% — ${proxyLabel}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contextOpts: any = {
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1366, height: 768 },
        };
        if (PROXY_CONFIG) {
          contextOpts.proxy = {
            server: PROXY_CONFIG.server,
            username: PROXY_CONFIG.username,
            password: PROXY_CONFIG.password,
          };
        }
        context = await browser.newContext(contextOpts);

        const page = await context.newPage();

        // Anonymous — no cookies, no login, fresh context
        // Navigate to candidate URL
        await page.goto(candidate.facebook_url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);

        // Navigation successful

        // Check for login wall
        if (page.url().includes("/login")) {
          console.log(`[${ts()}]   Login wall — skipping candidate`);
          await context.close();
          continue;
        }

        // Dismiss Facebook signup/login popup if present
        await dismissFacebookPopup(page);

        // Extract email and website
        const { email, website } = await extractFromFacebookPage(page);

        if (website) {
          console.log(`[${ts()}]   Has website (${website}) — skipping`);
          await supabase.from("pineyweb_prospects").update({
            notes: `Has website: ${website}`,
            outreach_status: "lost",
            facebook_url: candidate.facebook_url,
          }).eq("id", p.id);
          websiteSkipped++;
          foundEmail = true; // Stop trying other candidates
        } else if (email) {
          emailsFound++;
          console.log(`[${ts()}]   ✓ EMAIL FOUND: ${email}`);

          const { error: updateErr } = await supabase.from("pineyweb_prospects").update({
            email,
            email_source: "Facebook",
            facebook_url: candidate.facebook_url,
          }).eq("place_id", p.place_id);

          if (!updateErr) {
            emailsSaved++;
            console.log(`[${ts()}]   ✓ Email saved to CRM`);

            // Send outreach
            try {
              const outRes = await fetch(`${PINEYWEB_URL}/api/admin/outreach`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prospects: [{ place_id: p.place_id, business_name: p.business_name, email, email_source: "Facebook", address: "", city: p.city, phone: p.phone, rating: p.rating, review_count: p.review_count || 0, priority_tier: p.priority_tier }] }),
              });
              const outData = await outRes.json();
              if (outData.sent > 0) console.log(`[${ts()}]   Outreach sent`);
            } catch { /* non-blocking */ }
          }
          foundEmail = true;
        } else {
          console.log(`[${ts()}]   No email on this candidate`);
        }

        await context.close();
        context = null;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isProxyFailure = errMsg.includes("ERR_PROXY") || errMsg.includes("ECONNREFUSED") || errMsg.includes("ETIMEDOUT") || errMsg.includes("net::ERR");

        if (isProxyFailure) {
          console.log(`[${ts()}]   Proxy/network error — ${errMsg.substring(0, 80)}`);
          errors++;
        } else {
          console.log(`[${ts()}]   Error: ${errMsg.substring(0, 120)}`);
          errors++;
        }

        if (context) { try { await context.close(); } catch { /* ignore */ } }
      }
    }
    if (!foundEmail) skipped++;

    // Progress every 50
    if ((i + 1) % 50 === 0) {
      console.log(`\n[${ts()}] [Progress] ${i + 1}/${limit} | Emails: ${emailsFound} | Saved: ${emailsSaved} | Website skipped: ${websiteSkipped} | Skipped: ${skipped} | Errors: ${errors}\n`);
    }
  }

  try { await browser.close(); } catch { /* ignore */ }

  console.log(`\n=== Phase 2 Results ===`);
  console.log(`Prospects processed: ${prospects.length}`);
  console.log(`Emails found: ${emailsFound}`);
  console.log(`Emails saved: ${emailsSaved}`);
  console.log(`Website skipped: ${websiteSkipped}`);
  console.log(`No email found: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
