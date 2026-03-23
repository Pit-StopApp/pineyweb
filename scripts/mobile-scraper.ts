/**
 * Mobile Touch-Based Facebook Scraper
 *
 * Clean, fast, mobile-first scraper using iPhone 13 viewport with
 * touch events only. Built from scratch — no imports from facebook-scraper.ts.
 *
 * Usage: npx tsx scripts/mobile-scraper.ts
 *
 * NOT IMPLEMENTED (Playwright mobile limitations):
 * - Address bar tap/type: Playwright cannot interact with the browser chrome
 *   (address bar). Search uses page.goto() with URL instead. Typing behavior
 *   applies to Facebook's search bar when needed.
 * - True iOS Safari rendering: Playwright uses Chromium with mobile emulation,
 *   not actual Safari. Stealth plugin compensates for most fingerprint differences.
 * - Native iOS haptic feedback simulation.
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
const SESSION_FILE = process.env.FACEBOOK_STATE_FILE || "scripts/fb-session.json";
const TEST_MODE = true; // true = no proxy, 5 prospects | false = full proxy, unlimited
const DAILY_EMAIL_CAP = 200;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Proxy config — rotating residential, same credentials every request
const PROXY_CONFIG = (!TEST_MODE && process.env.WEBSHARE_HOST) ? {
  server: `http://${process.env.WEBSHARE_HOST}:${process.env.WEBSHARE_PORT}`,
  username: process.env.WEBSHARE_USERNAME || "",
  password: process.env.WEBSHARE_PASSWORD || "",
} : null;

if (!TEST_MODE && !PROXY_CONFIG) { console.error("Missing WEBSHARE_HOST/PORT/USERNAME/PASSWORD"); process.exit(1); }

function ts(): string { return new Date().toLocaleTimeString(); }

// ============================================================================
// NO-REPEAT RANDOM
// ============================================================================

const lastVals: Record<string, number> = {};
function rand(min: number, max: number, key = "d"): number {
  if (max <= min) return min;
  let v = min + Math.random() * (max - min);
  const prev = lastVals[key];
  if (prev !== undefined && Math.abs(v - prev) < (max - min) * 0.05) v = min + Math.random() * (max - min);
  lastVals[key] = v;
  return v;
}
function randInt(min: number, max: number, key = "d"): number { return Math.round(rand(min, max, key)); }

// ============================================================================
// TOUCH PRIMITIVES
// ============================================================================

async function touchDelay(page: Page, min: number, max: number) {
  await page.waitForTimeout(randInt(min, max, "delay"));
}

async function tap(page: Page, x: number, y: number) {
  await touchDelay(page, 50, 150); // Finger has physical delay before touching screen
  await page.touchscreen.tap(x, y);
}

async function tapElement(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first();
  const box = await el.boundingBox().catch(() => null);
  if (!box) return false;
  const x = box.x + randInt(5, Math.max(6, box.width - 5), "tapX");
  const y = box.y + randInt(5, Math.max(6, box.height - 5), "tapY");
  await tap(page, x, y);
  return true;
}

async function swipe(page: Page, distance: number) {
  const startX = randInt(160, 230, "swStartX");
  const startY = randInt(600, 700, "swStartY");
  const driftX = randInt(3, 8, "swDrift") * (Math.random() < 0.5 ? 1 : -1);
  const endX = startX + driftX;
  const endY = startY - Math.abs(distance);
  const duration = randInt(300, 600, "swDur");
  const steps = Math.max(5, Math.round(duration / 16)); // ~60fps

  await page.touchscreen.tap(startX, startY); // Touch down approximation
  // Playwright doesn't have native swipe — simulate with mouse wheel or evaluate
  await page.evaluate(([d]) => {
    window.scrollBy({ top: d, behavior: "smooth" });
  }, [Math.abs(distance)]);
  await page.waitForTimeout(duration);
}

async function typeText(page: Page, text: string) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isComplex = /[^a-zA-Z\s]/.test(ch);
    const delay = isComplex ? randInt(100, 180, "typeD") : randInt(65, 130, "typeD");
    await page.keyboard.type(ch, { delay });

    // 10-15% single typo, 2-4% double typo
    if (i < text.length - 2) {
      const roll = Math.random();
      const wrong = "abcdefghijklmnopqrstuvwxyz";
      if (roll < rand(0.02, 0.04, "dTypo")) {
        await page.keyboard.type(wrong[Math.floor(Math.random() * 26)], { delay: randInt(50, 90, "t1") });
        await page.keyboard.type(wrong[Math.floor(Math.random() * 26)], { delay: randInt(50, 90, "t2") });
        await touchDelay(page, 50, 150);
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(randInt(60, 90, "bk1"));
        await page.keyboard.press("Backspace");
        await touchDelay(page, 80, 200);
      } else if (roll < rand(0.10, 0.15, "sTypo")) {
        await page.keyboard.type(wrong[Math.floor(Math.random() * 26)], { delay: randInt(50, 90, "t") });
        await touchDelay(page, 50, 150);
        await page.keyboard.press("Backspace");
        await touchDelay(page, 80, 200);
      }
    }
  }
}

// ============================================================================
// POPUP DISMISSAL
// ============================================================================

async function dismissPopup(page: Page): Promise<void> {
  try {
    const hasLoginForm = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[name="email"], input[type="email"], input[placeholder*="email" i], input[placeholder*="phone" i]');
      for (const input of inputs) {
        const dialog = input.closest('[role="dialog"], [aria-modal="true"]');
        if (dialog) return true;
      }
      const buttons = document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button');
      for (const btn of buttons) {
        if (/^log\s*in$/i.test(btn.textContent?.trim() || "")) return true;
      }
      return false;
    }).catch(() => false);

    if (hasLoginForm) {
      if (await tapElement(page, '[aria-label="Close"]')) {
        await page.waitForTimeout(500);
        console.log(`[${ts()}]   Dismissed popup`);
        return;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      return;
    }

    // Fallback: any close button on a dialog
    const closeOnDialog = page.locator('[role="dialog"] [aria-label="Close"], [aria-modal="true"] [aria-label="Close"]').first();
    if (await closeOnDialog.isVisible().catch(() => false)) {
      await tapElement(page, '[role="dialog"] [aria-label="Close"], [aria-modal="true"] [aria-label="Close"]');
      await page.waitForTimeout(500);
      console.log(`[${ts()}]   Dismissed dialog`);
    }
  } catch { /* non-blocking */ }
}

// ============================================================================
// BUSINESS LOGIC
// ============================================================================

const META_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "messenger.com", "whatsapp.com", "meta.com", "wa.me"];
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}(?=[^a-zA-Z]|$)/g;
const EMAIL_BLACKLIST = /example|sentry|domain|@facebook|@meta|@fb\.com|noreply|no-reply|test@|@test\./i;
const GENERIC_WORDS = new Set(["the","a","an","and","of","in","at","for","to","on","or","llc","inc","co","corp","ltd","pllc","pc","pa","dba","tx","texas","my","our","your","services","service","shop","salon","auto","repair"]);
const SUFFIX = new Set(["llc","inc","co","corp","ltd","pllc","pc","pa","dba","tx","texas","dds","md","jr","sr","ii","iii","the","a","an","and","of"]);

function sanitize(text: string): string {
  return text.replace(/Comment as.*?\./gi, "").replace(/[^\s]*@facebook\.com[^\s]*/g, "")
    .replace(/EmailMessenger/gi, " ").replace(/MobileEmail/gi, " ").replace(/EmailEmail/gi, " ");
}

function findEmail(text: string): string | null {
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;
  for (const e of matches) {
    if (e.length > 100 || EMAIL_BLACKLIST.test(e)) continue;
    return e;
  }
  return null;
}

function findWebsite(text: string): string | null {
  const patterns = /\bwww\.\S+|https?:\/\/\S+|\S+\.(com|net|org|io|co|biz)\b/gi;
  const matches = text.match(patterns);
  if (!matches) return null;
  for (const m of matches) {
    const domain = m.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    if (!META_DOMAINS.some(d => domain.includes(d))) return m;
  }
  return null;
}

function cleanName(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
}

function simplifyName(name: string, city: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9&\s]/g, " ").replace(/\s+/g, " ").trim();
  const cityLower = city.toLowerCase();
  const words = cleaned.split(/\s+/).filter(w => {
    const l = w.toLowerCase();
    return l.length > 1 && !SUFFIX.has(l) && l !== cityLower;
  });
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

function matchScore(candidate: string, prospect: string, city?: string): number {
  let a = cleanName(candidate), b = cleanName(prospect);
  if (city) { const c = city.toLowerCase(); a = a.replace(new RegExp(`\\b${c}\\b`, "g"), "").trim(); b = b.replace(new RegExp(`\\b${c}\\b`, "g"), "").trim(); }
  if (a === b) return 100;
  const aW = a.split(" ").filter(w => w.length > 1 && !GENERIC_WORDS.has(w));
  const bW = b.split(" ").filter(w => w.length > 1 && !GENERIC_WORDS.has(w));
  if (bW.length === 0) return 0;
  const overlap = bW.filter(w => new Set(aW).has(w));
  let score = (overlap.length / bW.length) * 100;
  const aJ = aW.join(" "), bJ = bW.join(" ");
  if (aJ.includes(bJ) || bJ.includes(aJ)) score = Math.max(score, 90);
  return Math.round(score);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`[${ts()}] Mobile Facebook Scraper starting...`);
  if (TEST_MODE) console.log(`[${ts()}] TEST MODE — direct connection, 5 prospects\n`);
  else console.log(`[${ts()}] Proxy: ${PROXY_CONFIG!.server}\n`);

  // Load prospects
  const allProspects: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("pineyweb_prospects")
      .select("*").is("email", null).not("phone", "is", null).gte("review_count", 5)
      .or("facebook_found.is.null,facebook_found.neq.false")
      .order("priority_tier", { ascending: true }).order("rating", { ascending: false })
      .range(from, from + 999);
    if (error) { console.error("Supabase error:", error.message); process.exit(1); }
    if (!data?.length) break;
    allProspects.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  if (!allProspects.length) { console.log("No prospects to process"); return; }

  // Shuffle
  for (let i = allProspects.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allProspects[i], allProspects[j]] = [allProspects[j], allProspects[i]]; }

  const limit = TEST_MODE ? Math.min(5, allProspects.length) : allProspects.length;
  console.log(`[${ts()}] Loaded ${allProspects.length} prospects, processing ${limit}\n`);

  // Launch browser — mobile viewport
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const launchOpts: any = { headless: false, args: ["--disable-blink-features=AutomationControlled"] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxOpts: any = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  };
  if (PROXY_CONFIG) {
    ctxOpts.proxy = { server: PROXY_CONFIG.server, username: PROXY_CONFIG.username, password: PROXY_CONFIG.password };
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  // Load session
  const sessionPath = path.resolve(SESSION_FILE);
  if (fs.existsSync(sessionPath)) {
    const cookies = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    await context.addCookies(cookies);
    console.log(`[${ts()}] Loaded ${cookies.length} session cookies`);
  }

  // Verify logged in
  await page.goto("https://m.facebook.com/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
  if (page.url().includes("/login")) {
    console.log(`[${ts()}] Session expired — please run login script`);
    await browser.close();
    return;
  }
  console.log(`[${ts()}] Session valid — logged in\n`);

  // Random idle
  await touchDelay(page, 1000, 3000);

  let tested = 0, emailsFound = 0, emailsSaved = 0, outreachSent = 0;
  let skippedWebsite = 0, skippedInactive = 0, noFacebook = 0, noEmail = 0;
  let nextBreakAt = randInt(20, 40, "brk");
  let sinceLast = 0;

  for (let i = 0; i < limit; i++) {
    if (emailsFound >= DAILY_EMAIL_CAP) {
      console.log(`\n[${ts()}] Daily cap (${DAILY_EMAIL_CAP}) reached.`);
      break;
    }

    // Break
    sinceLast++;
    if (sinceLast >= nextBreakAt && i > 0) {
      const breakMin = randInt(2, 4, "brkMin");
      if (Math.random() < 0.6) {
        console.log(`\n[${ts()}] Break — scrolling feed for ${breakMin}min`);
        await page.goto("https://m.facebook.com/", { waitUntil: "domcontentloaded", timeout: 10000 });
        const breakEnd = Date.now() + breakMin * 60000;
        while (Date.now() < breakEnd) {
          await swipe(page, randInt(300, 600, "feedSwipe"));
          await page.waitForTimeout(randInt(1000, 4000, "feedPause"));
        }
      } else {
        console.log(`\n[${ts()}] Break — idle for ${breakMin}min`);
        await page.waitForTimeout(breakMin * 60000);
      }
      sinceLast = 0;
      nextBreakAt = randInt(20, 40, "nextBrk");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = allProspects[i] as any;
    console.log(`\n[${ts()}] [${i + 1}/${limit}] ${p.business_name} (${p.city}) — T${p.priority_tier}, ${p.rating}★`);

    try {
      // Step 1 — Search
      const query = `${p.business_name} ${p.city} TX`.replace(/&/g, "and").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
      const searchUrl = `https://m.facebook.com/search/pages/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await touchDelay(page, 2000, 4000);
      await dismissPopup(page);

      if (page.url().includes("/login")) {
        console.log(`[${ts()}]   Session lost — stopping`);
        break;
      }

      // Step 2 — Scan results
      const scanResults = async (): Promise<{ href: string; name: string } | null> => {
        const links = await page.locator("a[href]").all();
        for (const link of links) {
          const href = await link.getAttribute("href").catch(() => null);
          const text = (await link.textContent().catch(() => null) || "").trim();
          if (!href || !text || text.length < 3) continue;
          if (!href.includes("facebook.com/") && !href.startsWith("/")) continue;
          if (href.includes("/search") || href.includes("/login") || href.includes("/help")) continue;
          if (/Unread|Mark as read|followed you|reacted to|likes your/i.test(text)) continue;
          const score = matchScore(text, p.business_name, p.city);
          if (score >= 75) {
            const fullHref = href.startsWith("/") ? `https://m.facebook.com${href}` : href;
            console.log(`[${ts()}]   Match: "${text}" (${score}%) → ${fullHref}`);
            return { href: fullHref, name: text };
          }
        }
        return null;
      };

      let match = await scanResults();
      if (!match) {
        // Swipe once for more results
        await swipe(page, randInt(400, 600, "resSwipe"));
        await touchDelay(page, 1500, 2500);
        match = await scanResults();
      }
      if (!match) {
        // Retry with simplified name
        const simplified = simplifyName(p.business_name, p.city);
        if (simplified && simplified.toLowerCase() !== p.business_name.trim().toLowerCase()) {
          console.log(`[${ts()}]   Retrying: "${simplified}"`);
          const retryUrl = `https://m.facebook.com/search/pages/?q=${encodeURIComponent(simplified + " " + p.city + " TX")}`;
          await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await touchDelay(page, 2000, 3500);
          await dismissPopup(page);
          match = await scanResults();
        }
      }
      if (!match) {
        noFacebook++;
        await supabase.from("pineyweb_prospects").update({ notes: "No Facebook presence", facebook_found: false }).eq("place_id", p.place_id);
        tested++;
        continue;
      }

      // Step 3 — Navigate to business page
      await page.goto(match.href, { waitUntil: "domcontentloaded", timeout: 8000 });
      await touchDelay(page, 1500, 3000);
      await dismissPopup(page);

      // Website check — immediate broad scan
      const pageText1 = sanitize(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
      const website = findWebsite(pageText1);
      if (website) {
        console.log(`[${ts()}]   Has website (${website}) — skipping`);
        await supabase.from("pineyweb_prospects").update({ notes: `Has website: ${website}`, outreach_status: "lost", facebook_url: match.href }).eq("place_id", p.place_id);
        skippedWebsite++;
        tested++;
        continue;
      }

      // Step 4 — Activity check
      await swipe(page, randInt(400, 700, "actSwipe"));
      await touchDelay(page, 1500, 2500);
      const pageText2 = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      const recentPost = /\b(\d+[hm]\b|\d+\s*min|just now|yesterday|\d+d\b|\d+w\b)/i.test(pageText2);
      const oldPost = pageText2.match(/\b(\d+)y\b/);
      if (oldPost && parseInt(oldPost[1]) >= 2) {
        console.log(`[${ts()}]   Inactive (~${oldPost[1]}y) — skipping`);
        await supabase.from("pineyweb_prospects").update({ notes: `Inactive — ~${oldPost[1]} years`, outreach_status: "lost", facebook_url: match.href }).eq("place_id", p.place_id);
        skippedInactive++;
        tested++;
        continue;
      }
      if (!recentPost && !oldPost) {
        // No date indicators at all — check if page has any content
        if (pageText2.length < 300) {
          console.log(`[${ts()}]   Inactive (no posts) — skipping`);
          await supabase.from("pineyweb_prospects").update({ notes: "Inactive — no posts", outreach_status: "lost", facebook_url: match.href }).eq("place_id", p.place_id);
          skippedInactive++;
          tested++;
          continue;
        }
      }

      // Step 5 — Email extraction
      // Swipe toward About/Contact
      await swipe(page, randInt(300, 500, "emailSwipe"));
      await touchDelay(page, 1500, 2500);
      const pageText3 = sanitize(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
      let email = findEmail(pageText3);

      if (!email) {
        // Try About tab
        const aboutTapped = await tapElement(page, 'a[href*="/about"], a[href*="about"]');
        if (aboutTapped) {
          await touchDelay(page, 1500, 3000);
          await dismissPopup(page);
          const aboutText = sanitize(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
          email = findEmail(aboutText);
        }
      }

      if (!email) {
        // Try contact info URL
        const contactUrl = match.href.replace(/\/$/, "") + "/about_contact_and_basic_info";
        try {
          await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 8000 });
          await touchDelay(page, 1500, 2500);
          await dismissPopup(page);
          const contactText = sanitize(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
          email = findEmail(contactText);
        } catch { /* contact page failed */ }
      }

      if (email) {
        emailsFound++;
        console.log(`[${ts()}]   ✓ EMAIL: ${email}`);
        const { error: saveErr } = await supabase.from("pineyweb_prospects").update({ email, email_source: "Facebook", facebook_url: match.href }).eq("place_id", p.place_id);
        if (!saveErr) {
          emailsSaved++;
          // Send outreach
          try {
            const res = await fetch(`${PINEYWEB_URL}/api/admin/outreach`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prospects: [{ place_id: p.place_id, business_name: p.business_name, email, email_source: "Facebook", address: "", city: p.city, phone: p.phone, rating: p.rating, review_count: p.review_count || 0, priority_tier: p.priority_tier }] }),
            });
            const d = await res.json();
            if (d.sent > 0) { outreachSent++; console.log(`[${ts()}]   Outreach sent`); }
          } catch { /* non-blocking */ }
        }
      } else {
        noEmail++;
        await supabase.from("pineyweb_prospects").update({ notes: "Facebook found, no email listed", contact_method: "facebook_message", facebook_url: match.href }).eq("place_id", p.place_id);
        console.log(`[${ts()}]   No email found`);
      }

      tested++;
    } catch (err) {
      console.log(`[${ts()}]   Error: ${err instanceof Error ? err.message : err}`);
      tested++;
    }

    // Between prospects
    await touchDelay(page, 2000, 4000);

    // Progress
    if ((i + 1) % 10 === 0) {
      const rate = tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0";
      console.log(`\n[Progress] ${tested}/${limit} | Emails: ${emailsFound} | Saved: ${emailsSaved} | Sent: ${outreachSent} | Website: ${skippedWebsite} | Inactive: ${skippedInactive} | No FB: ${noFacebook} | No email: ${noEmail} | Rate: ${rate}%\n`);
    }
  }

  // Save cookies
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(cookies, null, 2));
    console.log(`[${ts()}] Session saved`);
  } catch { /* ignore */ }

  try { await browser.close(); } catch { /* ignore */ }

  // Final report
  const rate = tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0";
  console.log(`\n=== Mobile Scraper Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Emails found: ${emailsFound}`);
  console.log(`Emails saved: ${emailsSaved}`);
  console.log(`Outreach sent: ${outreachSent}`);
  console.log(`Skipped (website): ${skippedWebsite}`);
  console.log(`Skipped (inactive): ${skippedInactive}`);
  console.log(`No Facebook: ${noFacebook}`);
  console.log(`No email: ${noEmail}`);
  console.log(`Hit rate: ${rate}%`);

  // Save CSV report
  const reportsDir = path.resolve("scripts/session-reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportFile = path.join(reportsDir, `mobile-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.csv`);
  const csv = `metric,value\ntested,${tested}\nemails_found,${emailsFound}\nemails_saved,${emailsSaved}\noutreach_sent,${outreachSent}\nskipped_website,${skippedWebsite}\nskipped_inactive,${skippedInactive}\nno_facebook,${noFacebook}\nno_email,${noEmail}\nhit_rate,${rate}%\n`;
  fs.writeFileSync(reportFile, csv);
  console.log(`Report: ${reportFile}`);
}

process.on("SIGINT", () => { console.log("\n[Interrupted]"); process.exit(0); });
main().catch(err => { console.error("Fatal:", err); process.exit(1); });
