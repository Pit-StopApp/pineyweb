import { chromium, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PINEYWEB_URL = process.env.PINEYWEB_URL || "https://pineyweb.com";
const SESSION_FILE = process.env.FACEBOOK_STATE_FILE || "scripts/fb-session.json";
const PERSONAL_PROFILE_MARKERS = ["dustin.hartman", "dustinhartman", "hitmanhartman"];

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`[${ts()}]   Waiting ${Math.round(ms / 1000)}s...`);
  return new Promise(r => setTimeout(r, ms));
}

async function randomScroll(page: Page) {
  const scrolls = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.wheel(0, Math.floor(Math.random() * 300) + 100);
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
  }
}

async function randomMouseMove(page: Page) {
  const moves = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(
      Math.floor(Math.random() * 1200) + 100,
      Math.floor(Math.random() * 700) + 100
    );
    await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
  }
}

async function humanType(page: Page, selector: string, text: string) {
  // Before clicking search bar
  await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 70) + 80 });
  }
  // After finishing typing, human reviews query before pressing Enter
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
}

async function feedBreak(page: Page) {
  console.log(`[${ts()}]   Taking a human break — checking feed`);
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  const waitTime = Math.floor(Math.random() * 10000) + 10000; // 10-20s
  const scrollCount = Math.floor(waitTime / 3000);
  for (let i = 0; i < scrollCount; i++) {
    await randomScroll(page);
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1500);
  }
  await randomMouseMove(page);
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isRedirectedToPersonalProfile(url: string): boolean {
  const lower = url.toLowerCase();
  return PERSONAL_PROFILE_MARKERS.some(m => lower.includes(m));
}

// --- Clean email extraction ---
function extractCleanEmail(text: string): string | null {
  // Split text into words and find the one that looks like an email
  const words = text.split(/[\s,;|<>()[\]{}'"]+/);
  for (const word of words) {
    const clean = word.trim();
    if (/^[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) {
      if (!clean.includes('@facebook.com') &&
          !clean.includes('@fb.com') &&
          !clean.includes('@sentry') &&
          clean.length < 100) {
        return clean;
      }
    }
  }
  return null;
}

// --- Fuzzy matching with unique word requirement ---
const GENERIC_WORDS = new Set([
  "by", "the", "and", "a", "of", "in", "at", "for", "to", "on", "or", "my", "our", "your",
  "massage", "shop", "services", "service", "salon", "auto", "tax", "insurance", "repair",
  "co", "company", "studio", "center", "group", "team", "pro", "plus", "express", "mobile",
  "nails", "spa", "bar", "grill", "cafe", "restaurant", "dental", "clinic", "care",
  "barbershop", "barber", "hair", "beauty", "fitness", "gym", "body", "tire", "tires",
  "plumbing", "electric", "electrical", "heating", "cooling", "roofing", "painting",
  "construction", "landscaping", "lawn", "tree", "pest", "cleaning", "photography",
  "chiropractic", "veterinary", "vet", "animal", "pet", "medical", "health",
  "realty", "real", "estate", "agency", "office", "firm", "law", "accounting",
  "llc", "inc", "corp", "ltd", "pllc", "pc", "pa", "dba", "tx", "texas",
]);

function fuzzyClean(s: string, city?: string): string {
  let cleaned = s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/_/g, " ")
    .replace(/['''""",.\-–—()!@#$%^*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (city) {
    cleaned = cleaned.replace(new RegExp(`\\b${city.toLowerCase()}\\b`, "g"), "").replace(/\s+/g, " ").trim();
  }
  return cleaned;
}

function fuzzyMatch(pageName: string, businessName: string, city?: string): boolean {
  const a = fuzzyClean(pageName, city);
  const b = fuzzyClean(businessName, city);

  // Remove generic words for the unique-word check
  const aWords = a.split(" ").filter(w => w.length > 1);
  const bWords = b.split(" ").filter(w => w.length > 1);
  const aUniqueWords = new Set(aWords.filter(w => !GENERIC_WORDS.has(w)));
  const bUniqueWords = bWords.filter(w => !GENERIC_WORDS.has(w));

  // Must have at least one unique (non-generic) word match
  const hasUniqueOverlap = bUniqueWords.some(w => aUniqueWords.has(w));
  if (!hasUniqueOverlap) return false;

  // Exact or substring match (after cleaning)
  const aClean = aWords.filter(w => !GENERIC_WORDS.has(w)).join(" ");
  const bClean = bUniqueWords.join(" ");
  if (aClean.includes(bClean) || bClean.includes(aClean) || aClean === bClean) return true;

  // Word overlap — if 50% of unique prospect words appear in page name
  if (bUniqueWords.length === 0) return false;
  const overlap = bUniqueWords.filter(w => aUniqueWords.has(w)).length;
  return overlap / bUniqueWords.length >= 0.5;
}

// --- Humanize search query ---
function humanizeQuery(businessName: string, city: string): string {
  return `${businessName} ${city} TX`
    .replace(/&/g, "and")
    .replace(/_/g, " ")
    .replace(/['''""",.\-–—()!@#$%^*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Session management ---
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

// --- Website detection ---
const IGNORED_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "messenger.com", "whatsapp.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "google.com", "apple.com", "play.google.com"];

function extractWebsiteUrl(text: string): string | null {
  const urlMatches = text.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s)"]*/g);
  if (!urlMatches) return null;
  for (const u of urlMatches) {
    const domain = u.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    if (IGNORED_DOMAINS.some(d => domain.includes(d))) continue;
    return u;
  }
  return null;
}

// --- Email extraction ---
async function extractEmailFromPage(page: Page): Promise<{ email: string | null; website: string | null }> {
  try {
    if (isRedirectedToPersonalProfile(page.url())) {
      console.log(`[${ts()}]   Redirected to personal profile — skipping`);
      return { email: null, website: null };
    }

    // Step 1: Scan the main page content
    console.log(`[${ts()}]   Scanning main page for email and website...`);
    const mainText = await page.textContent("body") || "";
    const website = extractWebsiteUrl(mainText);
    if (website) console.log(`[${ts()}]   Website detected: ${website}`);

    const mainEmail = extractCleanEmail(mainText);
    if (mainEmail) {
      console.log(`[${ts()}]   Email found on main page`);
      return { email: mainEmail, website };
    }

    // Check mailto links on main page
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (href) {
        const raw = href.replace("mailto:", "").split("?")[0];
        const email = extractCleanEmail(raw);
        if (email) {
          console.log(`[${ts()}]   Email found via mailto link`);
          return { email, website };
        }
      }
    }

    // Step 2: Only navigate to contact info for vanity URL pages (NOT profile.php)
    const currentUrl = page.url();
    if (currentUrl.includes("profile.php?id=")) {
      console.log(`[${ts()}]   Profile-style page — skipping contact info navigation`);
      return { email: null, website };
    }

    const contactUrl = currentUrl.replace(/\/$/, "") + "/directory_contact_info";
    console.log(`[${ts()}]   No email on main page, trying: ${contactUrl}`);
    // Before navigating to contact info
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
    await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Human reads contact info page
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
    await randomScroll(page);

    if (isRedirectedToPersonalProfile(page.url())) {
      console.log(`[${ts()}]   Redirected to personal profile — skipping`);
      return { email: null, website };
    }

    const contactText = await page.textContent("body") || "";
    // Check contact page for website too if not found on main page
    const contactWebsite = website || extractWebsiteUrl(contactText);
    if (contactWebsite && !website) console.log(`[${ts()}]   Website detected on contact page: ${contactWebsite}`);

    const contactEmail = extractCleanEmail(contactText);
    if (contactEmail) {
      console.log(`[${ts()}]   Email found on contact info page`);
      return { email: contactEmail, website: contactWebsite };
    }

    return { email: null, website: contactWebsite };
  } catch (err) {
    console.log(`[${ts()}]   Error extracting email: ${err instanceof Error ? err.message : err}`);
  }
  return { email: null, website: null };
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

// --- Collect candidates from current search results page ---
async function collectCandidates(page: Page): Promise<{ text: string; href: string }[]> {
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

  return candidates;
}

// --- Try to match and extract from candidates ---
async function tryMatchCandidates(
  page: Page,
  candidates: { text: string; href: string }[],
  matchName: string,
  city: string,
  phone: string | null
): Promise<{ url: string | null; email: string | null; website: string | null }> {
  // Log top candidates for debugging
  for (const { text } of candidates.slice(0, 5)) {
    const isMatch = fuzzyMatch(text, matchName, city);
    console.log(`[${ts()}]   Candidate: "${text}" → ${isMatch ? "MATCH" : "no match"} (vs "${matchName}")`);
  }

  for (const { text, href } of candidates) {
    if (fuzzyMatch(text, matchName, city)) {
      console.log(`[${ts()}]   Matched: "${text}"`);

      // Before clicking result
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
      await page.goto(href, { waitUntil: "domcontentloaded", timeout: 15000 });
      // Human reads the business page
      await page.waitForTimeout(Math.floor(Math.random() * 3000) + 2000);
      // Before scrolling
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
      await randomScroll(page);
      // After scrolling, before extracting
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
      await randomMouseMove(page);

      if (isRedirectedToPersonalProfile(page.url())) {
        console.log(`[${ts()}]   Redirected to personal profile — skipping`);
        return { url: null, email: null, website: null };
      }

      const phoneOk = await confirmPhoneMatch(page, phone);
      if (phoneOk) {
        console.log(`[${ts()}]   Phone confirmed`);
      } else {
        console.log(`[${ts()}]   Phone mismatch but name/city match, proceeding`);
      }

      const { email, website } = await extractEmailFromPage(page);
      return { url: page.url(), email, website };
    }
  }

  return { url: null, email: null, website: null };
}

// --- Main search function ---
async function searchFacebook(
  page: Page,
  businessName: string,
  city: string,
  phone: string | null
): Promise<{ url: string | null; email: string | null; website: string | null }> {
  const humanQuery = humanizeQuery(businessName, city);
  const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(humanQuery)}`;

  // Before navigating to search
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
  console.log(`[${ts()}]   Searching Facebook: "${humanQuery}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Human reads the page after it loads
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
  await randomScroll(page);
  await randomMouseMove(page);

  if (page.url().includes("/login")) {
    console.log(`[${ts()}]   Session expired — redirected to login`);
    return { url: null, email: null, website: null };
  }

  // Human scans search results
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
  const candidates = await collectCandidates(page);
  console.log(`[${ts()}]   Found ${candidates.length} candidate page links`);

  if (candidates.length > 0) {
    const result = await tryMatchCandidates(page, candidates, businessName, city, phone);
    if (result.url) return result;
  }

  // Retry with simplified name (first 2-3 words, no city, no TX)
  const words = businessName.split(/\s+/);
  const simplifiedName = words.slice(0, Math.min(3, words.length)).join(" ");
  if (simplifiedName.split(/\s+/).length >= 2) {
    const retryDelay = Math.floor(Math.random() * 10000) + 15000;
    console.log(`[${ts()}]   ${candidates.length === 0 ? "Zero results" : "No match"}. Waiting ${Math.round(retryDelay / 1000)}s before retry with: "${simplifiedName}"`);
    await page.waitForTimeout(retryDelay);

    const retryUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(simplifiedName)}`;
    console.log(`[${ts()}]   Retry searching: "${simplifiedName}"`);
    await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    // Human reads retry results
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
    await randomScroll(page);
    await randomMouseMove(page);
    // Human scans retry results
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);

    const retryCandidates = await collectCandidates(page);
    console.log(`[${ts()}]   Retry found ${retryCandidates.length} candidate page links`);
    if (retryCandidates.length > 0) {
      const retryResult = await tryMatchCandidates(page, retryCandidates, simplifiedName, city, phone);
      if (retryResult.url) return retryResult;
    }
  }

  console.log(`[${ts()}]   No matching Facebook page found`);
  return { url: null, email: null, website: null };
}

// --- Outreach ---
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

// --- Main ---
async function main() {
  console.log(`[${ts()}] Facebook Scraper starting...\n`);

  const { data: rawProspects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, place_id, business_name, phone, city, rating, review_count, priority_tier, notes, facebook_url")
    .is("email", null)
    .not("phone", "is", null)
    .gte("review_count", 5)
    .is("facebook_url", null)
    .neq("notes", "No Facebook presence")
    .neq("notes", "Facebook found, no email listed")
    .order("priority_tier", { ascending: true })
    .order("rating", { ascending: false });

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!rawProspects || rawProspects.length === 0) { console.log("No prospects found"); return; }

  const prospects = shuffleArray(rawProspects);

  console.log(`[${ts()}] Loaded ${prospects.length} prospects\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const vpWidth = Math.floor(Math.random() * 200) + 1280;
  const vpHeight = Math.floor(Math.random() * 200) + 800;
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: vpWidth, height: vpHeight },
  });
  console.log(`[${ts()}] Viewport: ${vpWidth}x${vpHeight}`);

  await loadOrCreateSession(context);
  const page = await context.newPage();

  // Human settling in after opening browser
  await page.waitForTimeout(Math.floor(Math.random() * 4000) + 3000);

  let hits = 0;
  let emailsSent = 0;
  const feedBreakInterval = Math.floor(Math.random() * 5) + 8; // every 8-12 prospects
  const extendedBreakInterval = Math.floor(Math.random() * 6) + 15; // every 15-20 prospects

  for (let i = 0; i < prospects.length; i++) {
    // Occasional feed visit
    if (i > 0 && i % feedBreakInterval === 0) {
      await feedBreak(page);
    }

    // Extended break
    if (i > 0 && i % extendedBreakInterval === 0) {
      const breakMs = Math.floor(Math.random() * 240000) + 180000; // 3-7 min
      console.log(`[${ts()}]   Taking extended break to avoid detection (${Math.round(breakMs / 60000)}min)...`);
      await page.waitForTimeout(breakMs);
    }
    const p = prospects[i];
    console.log(`\n[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} (${p.city}) — T${p.priority_tier}, ${p.rating}★, ${p.review_count} reviews`);

    try {
      const { url, email, website } = await searchFacebook(page, p.business_name, p.city, p.phone);

      // If a website is found (not facebook/instagram), skip outreach
      if (website) {
        console.log(`[${ts()}]   Website found on Facebook page — skipping outreach`);
        await supabase
          .from("pineyweb_prospects")
          .update({
            notes: `Has website - found on Facebook: ${website}`,
            outreach_status: "lost",
            facebook_url: url || undefined,
          })
          .eq("place_id", p.place_id);
        continue;
      }

      if (email) {
        hits++;
        console.log(`[${ts()}]   ✓ EMAIL FOUND: ${email}`);
        console.log(`[${ts()}]   Facebook page: ${url}`);

        // Tiny pause before saving — feels natural
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 500);

        const { error: updateErr } = await supabase
          .from("pineyweb_prospects")
          .update({ email, email_source: "Facebook", facebook_url: url })
          .eq("place_id", p.place_id);

        if (updateErr) {
          console.log(`[${ts()}]   DB save failed: ${updateErr.message}`);
        } else {
          console.log(`[${ts()}]   Saved to database`);
          const sent = await sendOutreach({ ...p, email });
          if (sent) emailsSent++;
        }
      } else if (url) {
        console.log(`[${ts()}]   ✗ Page found but no email: ${url}`);
        await supabase
          .from("pineyweb_prospects")
          .update({ notes: "Facebook found, no email listed", contact_method: "facebook_message", facebook_url: url })
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

    // Random delay 31-57 seconds between searches
    if (i < prospects.length - 1) {
      await randomDelay(31000, 57000);
    }
  }

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
