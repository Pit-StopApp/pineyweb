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
 *   WEBSHARE_API_KEY
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
const WEBSHARE_API_KEY = process.env.WEBSHARE_API_KEY;
const PINEYWEB_URL = process.env.PINEYWEB_URL || "https://pineyweb.com";

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }
if (!WEBSHARE_API_KEY) { console.error("Missing WEBSHARE_API_KEY"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

// ============================================================================
// WEBSHARE PROXY MANAGEMENT
// ============================================================================

interface WebshareProxy {
  proxy_address: string;
  port: number;
  username: string;
  password: string;
}

let proxyConfig: WebshareProxy | null = null;

async function fetchProxyConfig(): Promise<void> {
  console.log(`[${ts()}] Fetching proxy config from Webshare...`);

  // Try rotating residential proxy list first
  const res = await fetch("https://proxy.webshare.io/api/v2/proxy/list/?mode=rotating&page_size=25", {
    headers: { "Authorization": `Token ${WEBSHARE_API_KEY}` },
  });

  if (res.ok) {
    const data = await res.json();
    const results = data.results || [];

    if (results.length > 0) {
      // Rotating mode returns proxy endpoints — use the first one
      // Each request through this endpoint gets a different IP automatically
      const p = results[0];
      proxyConfig = {
        proxy_address: p.proxy_address as string,
        port: p.port as number,
        username: p.username as string,
        password: p.password as string,
      };
      console.log(`[${ts()}] Rotating proxy: ${proxyConfig.proxy_address}:${proxyConfig.port} (${results.length} endpoints available)`);
      return;
    }
  }

  // Fallback: try the proxy config endpoint for residential rotating gateway
  const cfgRes = await fetch("https://proxy.webshare.io/api/v2/proxy/config/", {
    headers: { "Authorization": `Token ${WEBSHARE_API_KEY}` },
  });

  if (cfgRes.ok) {
    const cfg = await cfgRes.json();
    if (cfg.proxy_address && cfg.port) {
      proxyConfig = {
        proxy_address: cfg.proxy_address,
        port: cfg.port,
        username: cfg.username || "",
        password: cfg.password || "",
      };
      console.log(`[${ts()}] Rotating gateway: ${proxyConfig.proxy_address}:${proxyConfig.port}`);
      return;
    }
  }

  // Last fallback: direct mode
  console.log(`[${ts()}] Rotating not available — falling back to direct proxies`);
  const directRes = await fetch("https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page_size=25", {
    headers: { "Authorization": `Token ${WEBSHARE_API_KEY}` },
  });
  if (!directRes.ok) throw new Error(`Webshare API ${directRes.status}`);
  const directData = await directRes.json();
  const directProxies = directData.results || [];
  if (directProxies.length === 0) throw new Error("No proxies available from Webshare");

  // Pick a random direct proxy
  const picked = directProxies[Math.floor(Math.random() * directProxies.length)];
  proxyConfig = {
    proxy_address: picked.proxy_address as string,
    port: picked.port as number,
    username: picked.username as string,
    password: picked.password as string,
  };
  console.log(`[${ts()}] Direct proxy fallback: ${proxyConfig.proxy_address}:${proxyConfig.port} (${directProxies.length} available)`);
}

function getProxy(): WebshareProxy {
  if (!proxyConfig) throw new Error("Proxy not configured — call fetchProxyConfig first");
  return proxyConfig;
}

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
// PAGE EXTRACTION
// ============================================================================

async function extractFromFacebookPage(page: Page): Promise<{ email: string | null; website: string | null }> {
  try {
    // Broad text scan of entire page
    const rawText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    const cleaned = sanitizePageText(rawText);

    const website = extractWebsiteUrl(cleaned);
    const email = extractCleanEmail(cleaned);
    if (email) return { email, website };

    // Check mailto links
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (href) {
        const mailtoEmail = extractCleanEmail(href.replace("mailto:", "").split("?")[0]);
        if (mailtoEmail) return { email: mailtoEmail, website };
      }
    }

    // Scroll to load lazy content and scan again
    await page.evaluate(() => window.scrollBy({ top: 500, behavior: "smooth" }));
    await page.waitForTimeout(2000);
    const scrolledText = sanitizePageText(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
    const scrolledEmail = extractCleanEmail(scrolledText);
    if (scrolledEmail) return { email: scrolledEmail, website: website || extractWebsiteUrl(scrolledText) };

    // Try contact info page
    const currentUrl = page.url();
    if (!currentUrl.includes("profile.php?id=")) {
      const contactUrl = currentUrl.replace(/\/$/, "") + "/about_contact_and_basic_info";
      try {
        await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(2000);
        const contactText = sanitizePageText(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
        const contactEmail = extractCleanEmail(contactText);
        if (contactEmail) return { email: contactEmail, website: website || extractWebsiteUrl(contactText) };
      } catch { /* contact page failed — move on */ }
    }

    return { email: null, website };
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

  // Fetch proxy config
  await fetchProxyConfig();

  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });

  let emailsFound = 0, emailsSaved = 0, skipped = 0, errors = 0, websiteSkipped = 0;
  let consecutiveFailures = 0;

  // Session report
  const reportsDir = path.resolve("scripts/session-reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const masterPath = path.join(reportsDir, "master-report.csv");
  const sessionDate = new Date().toISOString();
  const sessionId = `phase2-${sessionDate.replace(/[:.]/g, "-").slice(0, 19)}`;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];

    // Get all candidates for this prospect, ordered by rank
    const { data: candidates } = await supabase
      .from("pineyweb_prospect_facebook_candidates")
      .select("facebook_url, match_score, rank")
      .eq("prospect_id", p.id)
      .order("rank", { ascending: true });

    if (!candidates?.length) { skipped++; continue; }

    let foundEmail = false;

    for (const candidate of candidates) {
      if (foundEmail) break;

      // Get a proxy
      let proxy: WebshareProxy;
      try {
        proxy = await getProxy();
      } catch {
        console.log(`[${ts()}]   No proxies available — skipping prospect`);
        errors++;
        break;
      }

      let context: BrowserContext | null = null;
      try {
        console.log(`[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} (${p.city}) — rank ${candidate.rank}, score ${candidate.match_score}% — via ${proxy.proxy_address}`);

        context = await browser.newContext({
          proxy: {
            server: `http://${proxy.proxy_address}:${proxy.port}`,
            username: proxy.username,
            password: proxy.password,
          },
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1366, height: 768 },
        });

        const page = await context.newPage();

        // Anonymous — no cookies, no login, fresh context via proxy
        // Navigate to candidate URL
        await page.goto(candidate.facebook_url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);

        consecutiveFailures = 0; // Reset on successful navigation

        // Check for login wall
        if (page.url().includes("/login")) {
          console.log(`[${ts()}]   Login wall — skipping candidate`);
          await context.close();
          continue;
        }

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
          consecutiveFailures++;
          console.log(`[${ts()}]   Proxy failed — ${errMsg.substring(0, 80)}`);

          if (consecutiveFailures >= 3) {
            console.log(`[${ts()}]   3 consecutive failures — refreshing proxy config`);
            try { await fetchProxyConfig(); } catch { /* continue with current */ }
            consecutiveFailures = 0;
          }
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
      console.log(`\n[${ts()}] [Progress] ${i + 1}/${prospects.length} | Emails: ${emailsFound} | Saved: ${emailsSaved} | Website skipped: ${websiteSkipped} | Skipped: ${skipped} | Errors: ${errors}\n`);
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
