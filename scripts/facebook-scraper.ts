import { chromium, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PINEYWEB_URL = process.env.PINEYWEB_URL || "https://pineyweb.com";
const SESSION_FILE = process.env.FACEBOOK_STATE_FILE || "scripts/fb-session.json";
const PERSONAL_PROFILE_MARKERS = ["dustin.hartman", "dustinhartman", "hitmanhartman"];
const DAILY_EMAIL_CAP = 200;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

// --- Randomized delay helper — never the same number twice ---
let lastDelay = 0;
function randMs(min: number, max: number): number {
  let ms = Math.floor(Math.random() * (max - min + 1)) + min;
  while (ms === lastDelay && max - min > 200) ms = Math.floor(Math.random() * (max - min + 1)) + min;
  lastDelay = ms;
  return ms;
}

// --- Smooth scroll via evaluate (no instant jumps) ---
async function smoothScroll(page: Page, amount: number) {
  await page.evaluate((px) => window.scrollBy({ top: px, behavior: "smooth" }), amount);
  await page.waitForTimeout(randMs(400, 800));
}

// --- Natural page browsing — photo viewing + post scrolling ---
async function browsePageNaturally(page: Page, businessName: string) {
  try {
    const scrollCount = randMs(3, 5);
    console.log(`[${ts()}]   Browsing ${businessName}'s page...`);

    // View photos: 3-6 photos, 1.5-4s each, 10-15% chance of 5-9s pause
    const photos = await page.locator('img[src*="fbcdn"], img[src*="scontent"]').all();
    const photosToView = Math.min(photos.length, randMs(3, 6));
    for (let p = 0; p < photosToView; p++) {
      const box = await photos[p].boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(box.x + randMs(5, Math.min(box.width, 150)), box.y + randMs(5, Math.min(box.height, 80)));
        if (Math.random() < 0.125) {
          await page.waitForTimeout(randMs(5000, 9000)); // 10-15% long pause
        } else {
          await page.waitForTimeout(randMs(1500, 4000)); // 1.5-4s normal
        }
      }
    }

    // Scroll through posts
    for (let i = 0; i < scrollCount; i++) {
      await smoothScroll(page, randMs(350, 700));
      await page.waitForTimeout(randMs(1000, 3000));

      // Move mouse to something visible
      await page.mouse.move(randMs(200, 1000), randMs(200, 500));
      await page.waitForTimeout(randMs(800, 2000));
    }

    // Pause at bottom
    await page.waitForTimeout(randMs(1500, 3000));
  } catch (err) {
    console.log(`[${ts()}]   Browse interrupted: ${err instanceof Error ? err.message : err}`);
  }
}

async function humanScroll(page: Page) {
  const scrolls = randMs(2, 4);
  for (let i = 0; i < scrolls; i++) {
    await smoothScroll(page, randMs(200, 500));
    await page.waitForTimeout(randMs(800, 2000));
    await page.mouse.move(randMs(150, 1000), randMs(150, 600));
    await page.waitForTimeout(randMs(300, 800));
  }
}

async function humanClick(page: Page, selector: string) {
  const element = await page.$(selector);
  if (element) {
    await element.hover();
    await page.waitForTimeout(randMs(500, 1000));
    await element.click();
  }
}

async function randomMouseMove(page: Page) {
  const moves = randMs(2, 4);
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(randMs(100, 1200), randMs(100, 700));
    await page.waitForTimeout(randMs(300, 700));
  }
}

async function humanType(page: Page, selector: string, text: string) {
  await humanClick(page, selector);
  await page.waitForTimeout(randMs(500, 1200));
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i], { delay: randMs(80, 150) });
    if (i < text.length - 3 && Math.random() < 0.3) {
      const wrongChars = "abcdefghijklmnopqrstuvwxyz";
      await page.keyboard.type(wrongChars[Math.floor(Math.random() * wrongChars.length)]);
      await page.waitForTimeout(randMs(200, 500));
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(randMs(100, 300));
    }
  }
  await page.waitForTimeout(randMs(1000, 2500));
}

async function feedBreak(page: Page) {
  try {
    console.log(`[${ts()}]   Taking a human break — browsing Piney Web Co. page...`);
    await page.goto("https://www.facebook.com/profile.php?id=61578657544468", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(randMs(2000, 4000));
    const scrolls = randMs(2, 4);
    for (let i = 0; i < scrolls; i++) {
      await smoothScroll(page, randMs(200, 500));
      await page.waitForTimeout(randMs(1500, 3500));
      await page.mouse.move(randMs(200, 900), randMs(200, 500));
      await page.waitForTimeout(randMs(800, 2000));
    }
    await page.waitForTimeout(randMs(10000, 25000));
  } catch {
    console.log(`[${ts()}]   Feed break skipped — page closed`);
  }
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
  const regex = /[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex);
  if (!matches) return null;

  for (const match of matches) {
    const emailRegex = /^[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    let email = match;
    while (email.length > 0) {
      if (emailRegex.test(email)) {
        if (!email.includes("@facebook.com") &&
            !email.includes("@fb.com") &&
            !email.includes("@sentry") &&
            email.length < 100) {
          return email;
        }
        break;
      }
      email = email.slice(0, -1);
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
  let cleaned = s.toLowerCase().replace(/&/g, " and ").replace(/_/g, " ").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
  if (city) cleaned = cleaned.replace(new RegExp(`\\b${city.toLowerCase()}\\b`, "g"), "").replace(/\s+/g, " ").trim();
  return cleaned;
}

function fuzzyMatch(pageName: string, businessName: string, city?: string): boolean {
  const a = fuzzyClean(pageName, city);
  const b = fuzzyClean(businessName, city);
  const aWords = a.split(" ").filter(w => w.length > 1);
  const bWords = b.split(" ").filter(w => w.length > 1);
  const aUniqueWords = new Set(aWords.filter(w => !GENERIC_WORDS.has(w)));
  const bUniqueWords = bWords.filter(w => !GENERIC_WORDS.has(w));
  const hasUniqueOverlap = bUniqueWords.some(w => aUniqueWords.has(w));
  if (!hasUniqueOverlap) return false;
  const aClean = aWords.filter(w => !GENERIC_WORDS.has(w)).join(" ");
  const bClean = bUniqueWords.join(" ");
  if (aClean.includes(bClean) || bClean.includes(aClean) || aClean === bClean) return true;
  if (bUniqueWords.length === 0) return false;
  const overlap = bUniqueWords.filter(w => aUniqueWords.has(w)).length;
  return overlap / bUniqueWords.length >= 0.5;
}

function humanizeQuery(businessName: string, city: string): string {
  return `${businessName} ${city} TX`.replace(/&/g, "and").replace(/_/g, " ").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
}

// --- Session management ---
async function waitForLoggedIn(page: Page): Promise<void> {
  console.log(`[${ts()}] Waiting for login...`);
  await page.waitForFunction(() => {
    const hasNav = document.querySelector('[aria-label="Facebook"]') !== null
      || document.querySelector('[role="navigation"]') !== null
      || document.querySelector('[aria-label="Your profile"]') !== null
      || document.querySelector('[data-pagelet="Stories"]') !== null;
    const notLogin = !window.location.pathname.includes("/login");
    return hasNav && notLogin;
  }, { timeout: 300000 });
  console.log(`[${ts()}] Login detected.`);
}

async function saveCookies(context: BrowserContext): Promise<void> {
  const sessionPath = path.resolve(SESSION_FILE);
  const cookies = await context.cookies();
  fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  console.log(`[${ts()}] Saved ${cookies.length} cookies to ${sessionPath}`);
}

async function loadOrCreateSession(context: BrowserContext, page: Page): Promise<void> {
  const sessionPath = path.resolve(SESSION_FILE);

  if (fs.existsSync(sessionPath)) {
    console.log(`[${ts()}] Loading saved Facebook session...`);
    const cookies = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    await context.addCookies(cookies);
    console.log(`[${ts()}] Loaded ${cookies.length} cookies`);

    console.log(`[${ts()}] Validating session...`);
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(randMs(2500, 4000));

    const isLoggedIn = await page.evaluate(() => {
      const hasNav = document.querySelector('[aria-label="Facebook"]') !== null
        || document.querySelector('[role="navigation"]') !== null
        || document.querySelector('[aria-label="Your profile"]') !== null;
      const notLogin = !window.location.pathname.includes("/login");
      return hasNav && notLogin;
    });

    if (isLoggedIn) {
      console.log(`[${ts()}] Session valid — logged in.`);
      return;
    }
    console.log(`[${ts()}] Session expired — need to log in again.`);
  } else {
    console.log(`\n[${ts()}] No saved session found.`);
  }

  console.log(`[${ts()}] Opening Facebook for manual login...`);
  console.log(`[${ts()}] Log in manually — session will be saved automatically once logged in.\n`);
  await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForLoggedIn(page);
  await saveCookies(context);
}

// --- Website detection ---
const IGNORED_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "messenger.com", "whatsapp.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "google.com", "apple.com", "play.google.com"];

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

function sanitizePageText(text: string): string {
  return text
    .replace(/Comment as Piney Web Co\.?/gi, "")
    .replace(/Comment as Dustin Hartman\.?/gi, "")
    .replace(/[^\s]*@facebook\.com[^\s]*/g, "")
    .replace(/EmailMessenger/gi, " ")
    .replace(/MobileEmail/gi, " ")
    .replace(/EmailEmail/gi, " ");
}

// --- Email extraction ---
async function extractEmailFromPage(page: Page): Promise<{ email: string | null; website: string | null }> {
  try {
    if (isRedirectedToPersonalProfile(page.url())) {
      console.log(`[${ts()}]   Redirected to personal profile — skipping`);
      return { email: null, website: null };
    }

    console.log(`[${ts()}]   Scanning main page for email and website...`);
    const rawMainText = await page.textContent("body") || "";
    const mainText = sanitizePageText(rawMainText);
    const website = extractWebsiteUrl(mainText);
    if (website) console.log(`[${ts()}]   Website detected: ${website}`);

    const mainEmail = extractCleanEmail(mainText);
    if (mainEmail) {
      console.log(`[${ts()}]   Email found on main page`);
      return { email: mainEmail, website };
    }

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

    const currentUrl = page.url();
    if (currentUrl.includes("profile.php?id=")) {
      console.log(`[${ts()}]   Profile-style page — scrolling to load lazy content`);
      for (let s = 0; s < 3; s++) {
        await smoothScroll(page, randMs(400, 600));
        await page.waitForTimeout(randMs(2000, 3500));
        const scrolledText = sanitizePageText(await page.textContent("body") || "");
        const scrolledEmail = extractCleanEmail(scrolledText);
        if (scrolledEmail) {
          console.log(`[${ts()}]   Email found after scroll ${s + 1}`);
          return { email: scrolledEmail, website: website || extractWebsiteUrl(scrolledText) };
        }
      }
      return { email: null, website };
    }

    // 30% of the time click the About tab naturally
    const aboutTab = page.locator('a[href*="/about"]').first();
    const useAboutTab = Math.random() < 0.3 && await aboutTab.isVisible().catch(() => false);

    if (useAboutTab) {
      console.log(`[${ts()}]   Clicking About tab to explore...`);
      await aboutTab.hover().catch(() => {});
      await page.waitForTimeout(randMs(600, 1200));
      await aboutTab.click().catch(() => {});
      await page.waitForTimeout(randMs(2000, 4000));
      await humanScroll(page);
    } else {
      const contactUrl = currentUrl.replace(/\/$/, "") + "/directory_contact_info";
      console.log(`[${ts()}]   No email on main page, trying: ${contactUrl}`);
      await page.waitForTimeout(randMs(1200, 2500));
      await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    }
    await page.waitForTimeout(randMs(2000, 4000));
    await humanScroll(page);

    if (isRedirectedToPersonalProfile(page.url())) {
      console.log(`[${ts()}]   Redirected to personal profile — skipping`);
      return { email: null, website };
    }

    const contactText = sanitizePageText(await page.textContent("body") || "");
    const contactWebsite = website || extractWebsiteUrl(contactText);
    if (contactWebsite && !website) console.log(`[${ts()}]   Website detected on contact page: ${contactWebsite}`);

    const contactEmail = extractCleanEmail(contactText);
    if (contactEmail) {
      console.log(`[${ts()}]   Email found on contact info page`);
      return { email: contactEmail, website: contactWebsite };
    }

    // Linger when no email found — human double-checking
    const lingerMs = randMs(3000, 5000);
    console.log(`[${ts()}]   No email found — lingering ${Math.round(lingerMs / 1000)}s`);
    await page.mouse.move(randMs(200, 800), randMs(200, 500));
    await page.waitForTimeout(lingerMs);

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

// --- Dead business detection ---
const INACTIVE_MONTHS = 24;

async function checkBusinessInactive(page: Page): Promise<{ inactive: boolean; reason: string | null }> {
  try {
    const bodyText = await page.textContent("body") || "";

    if (/permanently\s+closed/i.test(bodyText)) {
      console.log(`[${ts()}]   Business appears inactive — Permanently Closed`);
      return { inactive: true, reason: "Permanently closed per Facebook" };
    }

    const recentIndicators = /\b(\d+[hm]\b|\d+\s*min(ute)?s?\b|just now|yesterday|\d+d\b|\d+w\b|\d+\s*hr)/i;
    if (recentIndicators.test(bodyText)) return { inactive: false, reason: null };

    const yearRelative = bodyText.match(/\b(\d+)y\b/);
    if (yearRelative) {
      const years = parseInt(yearRelative[1]);
      if (years >= 2) {
        console.log(`[${ts()}]   Business appears inactive — most recent post ~${years} years ago`);
        return { inactive: true, reason: `Inactive — last Facebook post: ~${years} years ago` };
      }
      return { inactive: false, reason: null };
    }

    const MONTH_MAP: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    const datePatterns = [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi,
    ];

    let mostRecent: Date | null = null;
    for (const pattern of datePatterns) {
      const matches = bodyText.match(pattern);
      if (matches) {
        for (const dateStr of matches) {
          let parsed = new Date(dateStr);
          if (isNaN(parsed.getTime())) {
            const parts = dateStr.trim().split(/[\s,]+/);
            const monthStr = parts.find(p => MONTH_MAP[p.toLowerCase()] !== undefined);
            const yearStr = parts.find(p => /^\d{4}$/.test(p));
            if (monthStr && yearStr) parsed = new Date(parseInt(yearStr), MONTH_MAP[monthStr.toLowerCase()], 15);
          }
          if (!isNaN(parsed.getTime()) && (!mostRecent || parsed > mostRecent)) mostRecent = parsed;
        }
      }
    }

    if (mostRecent) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - INACTIVE_MONTHS);
      if (mostRecent < cutoff) {
        const dateLabel = mostRecent.toLocaleDateString("en-US", { year: "numeric", month: "long" });
        console.log(`[${ts()}]   Business appears inactive — last post: ${dateLabel}`);
        return { inactive: true, reason: `Inactive — last Facebook post: ${dateLabel}` };
      }
      return { inactive: false, reason: null };
    }

    const hasPageContent = await page.locator('[role="main"]').count() > 0;
    if (hasPageContent) {
      console.log(`[${ts()}]   Business appears inactive — no posts found`);
      return { inactive: true, reason: "Inactive — no Facebook posts found" };
    }

    return { inactive: false, reason: null };
  } catch (err) {
    console.log(`[${ts()}]   Error checking activity: ${err instanceof Error ? err.message : err}`);
    return { inactive: false, reason: null };
  }
}

// --- AI match verification ---
async function verifyMatch(
  prospectName: string, prospectCity: string, prospectPhone: string | null,
  facebookPageName: string, facebookPhone: string | null, facebookCity: string | null
): Promise<{ verified: boolean; confidence: number; reason: string }> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 100,
        messages: [{ role: "user", content: `We were searching for a business called "${prospectName}" in ${prospectCity}, TX.\nWe found a Facebook page called "${facebookPageName}"${facebookCity ? ` located in ${facebookCity}` : ""}.\nProspect phone: ${prospectPhone || "unknown"}\nFacebook phone: ${facebookPhone || "unknown"}\n\nIs this the same business? Reply ONLY with valid JSON: {"verified": true/false, "confidence": 1-10, "reason": "brief explanation"}` }],
      }),
    });
    const data = await response.json();
    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.log(`[${ts()}]   Verification API returned unexpected response: ${JSON.stringify(data)}`);
      return { verified: true, confidence: 6, reason: "API error — defaulting to save" };
    }
    const text = data.content[0].text.trim();
    return JSON.parse(text);
  } catch (err) {
    console.log(`[${ts()}]   Verification API error: ${err instanceof Error ? err.message : err}`);
    return { verified: true, confidence: 5, reason: "verification failed — defaulting to save" };
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
type SearchResult = {
  url: string | null; email: string | null; website: string | null;
  inactive: boolean; inactiveReason: string | null;
  matchType: "exact" | "fuzzy" | "no_match"; phoneConfirmed: boolean; matchedPageName: string;
};

async function tryMatchCandidates(
  page: Page, candidates: { text: string; href: string }[],
  matchName: string, city: string, phone: string | null
): Promise<SearchResult> {
  for (const { text } of candidates.slice(0, 5)) {
    const isMatch = fuzzyMatch(text, matchName, city);
    console.log(`[${ts()}]   Candidate: "${text}" → ${isMatch ? "MATCH" : "no match"} (vs "${matchName}")`);
  }

  for (const { text, href } of candidates) {
    if (fuzzyMatch(text, matchName, city)) {
      console.log(`[${ts()}]   Matched: "${text}"`);

      await page.waitForTimeout(randMs(1200, 2500));
      await page.goto(href, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(randMs(2000, 4000));

      // Photo viewing on business page
      const hasPhotos = await page.locator('img[src*="fbcdn"], img[src*="scontent"]').first().isVisible().catch(() => false);
      if (hasPhotos && Math.random() < 0.3) {
        const photoDelay = randMs(1500, 4000);
        console.log(`[${ts()}]   Photos visible — pausing ${Math.round(photoDelay / 1000)}s`);
        const photoBox = await page.locator('img[src*="fbcdn"], img[src*="scontent"]').first().boundingBox().catch(() => null);
        if (photoBox) await page.mouse.move(photoBox.x + randMs(10, 100), photoBox.y + randMs(10, 60));
        await page.waitForTimeout(photoDelay);
      }

      await page.waitForTimeout(randMs(800, 1500));
      await humanScroll(page);
      await page.waitForTimeout(randMs(800, 1500));
      await randomMouseMove(page);

      if (isRedirectedToPersonalProfile(page.url())) {
        console.log(`[${ts()}]   Redirected to personal profile — skipping`);
        return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
      }

      const phoneOk = await confirmPhoneMatch(page, phone);
      if (phoneOk) console.log(`[${ts()}]   Phone confirmed`);
      else console.log(`[${ts()}]   Phone mismatch but name/city match, proceeding`);

      const cleanedPage = fuzzyClean(text, city);
      const cleanedBiz = fuzzyClean(matchName, city);
      const matchType: "exact" | "fuzzy" = cleanedPage === cleanedBiz ? "exact" : "fuzzy";

      const { inactive, reason: inactiveReason } = await checkBusinessInactive(page);
      if (inactive) return { url: page.url(), email: null, website: null, inactive: true, inactiveReason, matchType, phoneConfirmed: phoneOk, matchedPageName: text };

      const { email, website } = await extractEmailFromPage(page);

      // 40% chance scroll back to top before leaving
      if (Math.random() < 0.4) {
        console.log(`[${ts()}]   Scrolling back to top before leaving`);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await page.waitForTimeout(randMs(1000, 2000));
      }

      return { url: page.url(), email, website, inactive: false, inactiveReason: null, matchType, phoneConfirmed: phoneOk, matchedPageName: text };
    }
  }

  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
}

// --- Main search function ---
async function searchFacebook(page: Page, businessName: string, city: string, phone: string | null): Promise<SearchResult> {
  const humanQuery = humanizeQuery(businessName, city);
  const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(humanQuery)}`;

  await page.waitForTimeout(randMs(1200, 2500));
  console.log(`[${ts()}]   Searching Facebook: "${humanQuery}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(randMs(2000, 4000));
  await humanScroll(page);
  await randomMouseMove(page);

  if (page.url().includes("/login")) {
    console.log(`[${ts()}]   Session expired — redirected to login`);
    return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
  }

  await page.waitForTimeout(randMs(2000, 3500));
  const candidates = await collectCandidates(page);
  console.log(`[${ts()}]   Found ${candidates.length} candidate page links`);

  if (candidates.length > 0) {
    const result = await tryMatchCandidates(page, candidates, businessName, city, phone);
    if (result.url) return result;
  }

  // Retry with simplified name
  const SUFFIX_WORDS = new Set(["llc", "inc", "co", "corp", "ltd", "pllc", "pc", "pa", "dba", "tx", "texas", "dds", "md", "jr", "sr", "ii", "iii"]);
  const cityLower = city.toLowerCase();
  const meaningfulWords = businessName.split(/\s+/).filter(w => {
    const lower = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
    return lower.length > 0 && !SUFFIX_WORDS.has(lower) && lower !== cityLower;
  });
  const simplifiedName = meaningfulWords.slice(0, Math.min(3, meaningfulWords.length)).join(" ");
  if (meaningfulWords.length >= 2) {
    const retryDelay = randMs(8000, 15000);
    console.log(`[${ts()}]   ${candidates.length === 0 ? "Zero results" : "No match"}. Waiting ${Math.round(retryDelay / 1000)}s before retry with: "${simplifiedName}"`);
    await page.waitForTimeout(retryDelay);

    const retryUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(simplifiedName)}`;
    console.log(`[${ts()}]   Retry searching: "${simplifiedName}"`);
    await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(randMs(2000, 4000));
    await humanScroll(page);
    await randomMouseMove(page);
    await page.waitForTimeout(randMs(2000, 3500));

    const retryCandidates = await collectCandidates(page);
    console.log(`[${ts()}]   Retry found ${retryCandidates.length} candidate page links`);
    if (retryCandidates.length > 0) {
      const retryResult = await tryMatchCandidates(page, retryCandidates, simplifiedName, city, phone);
      if (retryResult.url) return retryResult;
    }
  }

  console.log(`[${ts()}]   No matching Facebook page found`);
  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
}

// --- Outreach ---
async function sendOutreach(prospect: {
  place_id: string; business_name: string; email: string; city: string;
  phone: string | null; rating: number | null; review_count: number | null; priority_tier: number;
}): Promise<boolean> {
  try {
    const res = await fetch(`${PINEYWEB_URL}/api/admin/outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospects: [{ place_id: prospect.place_id, business_name: prospect.business_name, email: prospect.email, email_source: "Facebook", address: "", city: prospect.city, phone: prospect.phone, rating: prospect.rating, review_count: prospect.review_count || 0, priority_tier: prospect.priority_tier }] }),
    });
    const data = await res.json();
    if (data.sent > 0) { console.log(`[${ts()}]   Outreach sent successfully`); return true; }
    else { console.log(`[${ts()}]   Outreach skipped (dedup or error): ${JSON.stringify(data)}`); return false; }
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
    .select("*")
    .is("email", null)
    .not("phone", "is", null)
    .gte("review_count", 5)
    .or("facebook_url.is.null,facebook_url.eq.")
    .or("notes.is.null,notes.neq.No Facebook presence")
    .order("priority_tier", { ascending: true })
    .order("rating", { ascending: false });

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!rawProspects || rawProspects.length === 0) { console.log("No prospects found"); return; }

  const filtered = rawProspects.filter(p =>
    !p.facebook_url && p.notes !== "No Facebook presence" && p.notes !== "Facebook found, no email listed"
  );
  if (filtered.length === 0) { console.log("All prospects already searched"); return; }

  const prospects = shuffleArray(filtered);
  console.log(`[${ts()}] Loaded ${prospects.length} prospects (from ${rawProspects.length} query results)\n`);

  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
  const vpWidth = randMs(1280, 1480);
  const vpHeight = randMs(800, 1000);
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: vpWidth, height: vpHeight },
  });
  console.log(`[${ts()}] Viewport: ${vpWidth}x${vpHeight}`);

  const page = await context.newPage();
  await loadOrCreateSession(context, page);

  // Human settling in
  await page.waitForTimeout(randMs(3000, 6000));

  let tested = 0;
  let emailsFound = 0;
  let emailsSaved = 0;
  let outreachSent = 0;
  let skipped = 0;
  let noFacebook = 0;
  let noEmail = 0;
  const total = prospects.length;

  // --- Session report (master CSV) ---
  type SessionRow = {
    session_date: string; session_id: string; prospect_name: string; facebook_page_found: string;
    match_type: string; phone_confirmed: string; email_found: string; email_sent: string;
    facebook_url: string; city: string; notes: string; match_verified: string; verification_reason: string;
  };
  const sessionRows: SessionRow[] = [];
  const reportsDir = path.resolve("scripts/session-reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const masterPath = path.join(reportsDir, "master-report.csv");
  const sessionStart = new Date();
  const sessionDate = sessionStart.toISOString();
  const sessionId = `session-${sessionStart.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const CSV_HEADER = "session_date,session_id,prospect_name,facebook_page_found,match_type,phone_confirmed,email_found,email_sent,facebook_url,city,notes,match_verified,verification_reason";

  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) return `"${val.replace(/"/g, '""')}"`;
    return val;
  }
  function rowToCsv(r: SessionRow): string {
    return [r.session_date, r.session_id, r.prospect_name, r.facebook_page_found, r.match_type, r.phone_confirmed, r.email_found, r.email_sent, r.facebook_url, r.city, r.notes, r.match_verified, r.verification_reason].map(csvEscape).join(",");
  }

  // Consolidate old reports
  function consolidateOldReports() {
    const files = fs.readdirSync(reportsDir).filter(f => f.startsWith("report-") && f.endsWith(".csv"));
    if (files.length === 0) return;
    console.log(`[${ts()}] Consolidating ${files.length} old report file(s) into master...`);
    for (const file of files) {
      const filePath = path.join(reportsDir, file);
      const content = fs.readFileSync(filePath, "utf-8").trim();
      const lines = content.split("\n").slice(1);
      if (lines.length === 0) { fs.unlinkSync(filePath); continue; }
      const parts = file.replace("report-", "").replace(".csv", "").split("T");
      const datePart = parts[0];
      const timePart = parts[1] ? parts[1].replace(/-/g, ":") : "00:00:00";
      const oldSessionDate = `${datePart}T${timePart}.000Z`;
      const oldSessionId = `session-${parts.join("T").replace(/:/g, "-")}`;
      const augmentedLines = lines.map(line => `${csvEscape(oldSessionDate)},${csvEscape(oldSessionId)},${line}`);
      if (fs.existsSync(masterPath)) fs.appendFileSync(masterPath, augmentedLines.join("\n") + "\n");
      else fs.writeFileSync(masterPath, CSV_HEADER + "\n" + augmentedLines.join("\n") + "\n");
      fs.unlinkSync(filePath);
      console.log(`[${ts()}]   Merged ${lines.length} rows from ${file}`);
    }
  }
  consolidateOldReports();

  function saveReport() {
    if (sessionRows.length === 0) return;
    const newLines = sessionRows.map(rowToCsv).join("\n") + "\n";
    if (fs.existsSync(masterPath)) fs.appendFileSync(masterPath, newLines);
    else fs.writeFileSync(masterPath, CSV_HEADER + "\n" + newLines);
    console.log(`[${ts()}] Report saved: ${masterPath} (${sessionRows.length} new rows, session: ${sessionId})`);
    sessionRows.length = 0;
  }

  function logProgress() {
    const hitRate = tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0";
    console.log(`\n[Progress] ${tested}/${total} | Emails found: ${emailsFound} | Saved: ${emailsSaved} | Sent: ${outreachSent} | Skipped: ${skipped} | No Facebook: ${noFacebook} | No email: ${noEmail} | Hit rate: ${hitRate}%`);
  }

  process.on("SIGINT", () => {
    console.log("\n[Interrupted]");
    saveReport();
    console.log("=== Session Summary ===");
    console.log(`Tested: ${tested}`);
    console.log(`Emails found: ${emailsFound}`);
    console.log(`Emails saved to CRM: ${emailsSaved}`);
    console.log(`Outreach sent: ${outreachSent}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`No Facebook: ${noFacebook}`);
    console.log(`No email: ${noEmail}`);
    console.log(`Hit rate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
    process.exit(0);
  });

  // Natural break schedule: every 15-30 prospects, take 3-7 min break
  let nextBreakAt = randMs(15, 30);
  let prospectsSinceBreak = 0;

  for (let i = 0; i < prospects.length; i++) {
    // Daily email cap check
    if (emailsFound >= DAILY_EMAIL_CAP) {
      console.log(`\n[${ts()}] Daily email cap reached (${DAILY_EMAIL_CAP}). Stopping gracefully.`);
      break;
    }

    // Natural break
    prospectsSinceBreak++;
    if (prospectsSinceBreak >= nextBreakAt && i > 0) {
      const breakMinutes = randMs(3, 7);
      const breakMs = breakMinutes * 60000;
      console.log(`\n[${ts()}] Taking a break — resuming in ${breakMinutes} minutes`);
      saveReport();
      await page.waitForTimeout(breakMs);
      // Occasional feed visit after break
      if (Math.random() < 0.5) await feedBreak(page);
      prospectsSinceBreak = 0;
      nextBreakAt = randMs(15, 30);
    }

    const p = prospects[i];
    console.log(`\n[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} (${p.city}) — T${p.priority_tier}, ${p.rating}★, ${p.review_count} reviews`);

    try {
      const result = await searchFacebook(page, p.business_name, p.city, p.phone);
      const { url, email, website, inactive, inactiveReason, matchType, phoneConfirmed, matchedPageName } = result;
      let rowNotes = "";
      let emailSentThisRow = false;
      let matchVerified = "";
      let verificationReason = "";

      if (inactive && url) {
        console.log(`[${ts()}]   Business appears inactive — skipping outreach`);
        await supabase.from("pineyweb_prospects").update({ notes: inactiveReason, outreach_status: "lost", facebook_url: url }).eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: ${inactiveReason}`);
        skipped++;
        rowNotes = inactiveReason || "inactive";
      } else if (website) {
        console.log(`[${ts()}]   Website found on Facebook page — skipping outreach`);
        await supabase.from("pineyweb_prospects").update({ notes: `Has website - found on Facebook: ${website}`, outreach_status: "lost", facebook_url: url || undefined }).eq("place_id", p.place_id);
        skipped++;
        rowNotes = `website found: ${website}`;
      } else if (email) {
        emailsFound++;
        console.log(`[${ts()}]   ✓ EMAIL FOUND: ${email}`);
        console.log(`[${ts()}]   Facebook page: ${url}`);

        // Verify match — skip if phone already confirmed
        let verified = true;
        let confidence = 10;
        let reason = "phone confirmed";

        if (!phoneConfirmed) {
          console.log(`[${ts()}]   Verifying match with Claude AI...`);
          const verification = await verifyMatch(p.business_name, p.city, p.phone, matchedPageName, null, null);
          verified = verification.verified;
          confidence = verification.confidence;
          reason = verification.reason;
          if (verified && confidence >= 7) console.log(`[${ts()}]   ✓ Verified (confidence: ${confidence}/10) — saving email`);
          else console.log(`[${ts()}]   ✗ Unverified (confidence: ${confidence}/10): ${reason} — skipping`);
        }

        matchVerified = String(verified && confidence >= 7);
        verificationReason = reason;

        if (verified && confidence >= 7) {
          // Pause as if writing email down (2-4s) then unfocus simulation (3-8s)
          console.log(`[${ts()}]   Writing down email...`);
          await page.mouse.move(randMs(300, 800), randMs(200, 400));
          await page.waitForTimeout(randMs(2000, 4000));
          const unfocusMs = randMs(3000, 8000);
          console.log(`[${ts()}]   Switching away for ${Math.round(unfocusMs / 1000)}s...`);
          await page.keyboard.press("Meta+M");
          await page.waitForTimeout(unfocusMs);
          await page.bringToFront();

          const { error: updateErr } = await supabase.from("pineyweb_prospects").update({ email, email_source: "Facebook", facebook_url: url }).eq("place_id", p.place_id);

          if (updateErr) {
            console.log(`[${ts()}]   DB save failed: ${updateErr.message}`);
            rowNotes = "db save failed";
          } else {
            emailsSaved++;
            console.log(`[${ts()}]   ✓ Email saved to CRM`);
            const sent = await sendOutreach({ ...p, email });
            if (sent) { outreachSent++; emailSentThisRow = true; }

            // Follow the business page
            try {
              const followBtn = page.locator('[aria-label="Follow"], [aria-label="Like"], [aria-label="Like Page"]').first();
              const followVisible = await followBtn.isVisible().catch(() => false);
              if (followVisible) {
                const btnText = await followBtn.textContent().catch(() => "") || "";
                if (!/following|liked/i.test(btnText)) {
                  const el = await followBtn.elementHandle();
                  if (el) {
                    await el.hover();
                    await page.waitForTimeout(randMs(600, 1200));
                    await el.click();
                    await page.waitForTimeout(randMs(1000, 2000));
                    console.log(`[${ts()}]   👍 Followed ${p.business_name} page`);
                  }
                }
              }
            } catch { /* skip silently */ }
          }
        } else {
          await supabase.from("pineyweb_prospects").update({ notes: "Facebook match unverified — needs review", facebook_url: url }).eq("place_id", p.place_id);
          rowNotes = `unverified: ${reason}`;
        }
        if (!phoneConfirmed && verified && confidence >= 7) rowNotes = rowNotes ? `${rowNotes}, phone mismatch` : "phone mismatch";
      } else if (url) {
        noEmail++;
        console.log(`[${ts()}]   ✗ Page found but no email: ${url}`);
        await supabase.from("pineyweb_prospects").update({ notes: "Facebook found, no email listed", contact_method: "facebook_message", facebook_url: url }).eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: Facebook found, no email listed`);
        rowNotes = "no email on page";
      } else {
        noFacebook++;
        console.log(`[${ts()}]   ✗ No Facebook page found`);
        await supabase.from("pineyweb_prospects").update({ notes: "No Facebook presence", contact_method: "phone" }).eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: No Facebook presence`);
      }

      sessionRows.push({
        session_date: sessionDate, session_id: sessionId, prospect_name: p.business_name,
        facebook_page_found: matchedPageName, match_type: matchType, phone_confirmed: String(phoneConfirmed),
        email_found: email || "", email_sent: String(emailSentThisRow), facebook_url: url || "",
        city: p.city, notes: rowNotes, match_verified: matchVerified, verification_reason: verificationReason,
      });

      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    } catch (err) {
      console.log(`[${ts()}]   ✗ Error: ${err instanceof Error ? err.message : err}`);
      sessionRows.push({
        session_date: sessionDate, session_id: sessionId, prospect_name: p.business_name,
        facebook_page_found: "", match_type: "no_match", phone_confirmed: "false",
        email_found: "", email_sent: "false", facebook_url: "", city: p.city,
        notes: `error: ${err instanceof Error ? err.message : err}`, match_verified: "", verification_reason: "",
      });
      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    }
  }

  try {
    const cookies = await context.cookies();
    fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(cookies, null, 2));
    console.log(`\n[${ts()}] Session cookies saved.`);
  } catch (err) {
    console.log(`[${ts()}] Could not save session cookies: ${err instanceof Error ? err.message : err}`);
  }

  try { await browser.close(); } catch { /* browser may already be closed */ }

  saveReport();

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Emails found: ${emailsFound}`);
  console.log(`Emails saved to CRM: ${emailsSaved}`);
  console.log(`Outreach sent: ${outreachSent}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`No Facebook: ${noFacebook}`);
  console.log(`No email: ${noEmail}`);
  console.log(`Hit rate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
}

main();
