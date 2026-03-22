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

// --- Natural page browsing — active mouse + scroll for a duration ---
async function browsePageNaturally(page: Page, businessName: string, durationMs?: number) {
  const browseTime = durationMs ?? (Math.floor(Math.random() * 60000) + 30000); // 30-90s default
  console.log(`[${ts()}]   Browsing ${businessName}'s page... (${Math.round(browseTime / 1000)}s)`);
  const start = Date.now();

  while (Date.now() - start < browseTime) {
    // Scroll down through posts
    const scrollAmount = Math.floor(Math.random() * 250) + 80;
    await page.mouse.wheel(0, scrollAmount);
    await page.waitForTimeout(Math.floor(Math.random() * 500) + 300);

    // Move mouse to a visible element — posts, photos, business name, like button
    const targets = [
      'img[src*="fbcdn"]', 'img[src*="scontent"]',         // photos
      '[role="article"]', '[data-ad-preview="message"]',    // posts
      'h1', 'h2',                                           // page name / headings
      '[aria-label="Like"]', '[aria-label="Share"]',        // action buttons (hover only)
    ];
    const targetSelector = targets[Math.floor(Math.random() * targets.length)];
    const targetEl = page.locator(targetSelector).first();
    const isTargetVisible = await targetEl.isVisible().catch(() => false);

    if (isTargetVisible) {
      const box = await targetEl.boundingBox().catch(() => null);
      if (box) {
        // Move to element with slight offset for realism
        const offsetX = Math.floor(Math.random() * Math.min(box.width, 100));
        const offsetY = Math.floor(Math.random() * Math.min(box.height, 40));
        await page.mouse.move(box.x + offsetX, box.y + offsetY);

        // Pause longer on images (2-4s), shorter on text (3-8s range overall)
        const isImage = targetSelector.includes("img");
        const pauseMs = isImage
          ? Math.floor(Math.random() * 2000) + 2000   // 2-4s on photos
          : Math.floor(Math.random() * 5000) + 3000;  // 3-8s on text/posts
        await page.waitForTimeout(Math.min(pauseMs, browseTime - (Date.now() - start)));
      }
    } else {
      // No target found — move mouse to random position and short pause
      await page.mouse.move(
        Math.floor(Math.random() * 1000) + 150,
        Math.floor(Math.random() * 500) + 150
      );
      await page.waitForTimeout(Math.floor(Math.random() * 1500) + 1000);
    }

    // 25% chance scroll back up slightly
    if (Math.random() < 0.25) {
      await page.mouse.wheel(0, -(Math.floor(Math.random() * 120) + 40));
      await page.mouse.move(
        Math.floor(Math.random() * 1000) + 150,
        Math.floor(Math.random() * 500) + 150
      );
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
    }

    // Move mouse between scrolls so it's never stationary too long
    await page.mouse.move(
      Math.floor(Math.random() * 1100) + 100,
      Math.floor(Math.random() * 600) + 100
    );
    await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
  }
}

async function humanScroll(page: Page) {
  const scrolls = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.wheel(0, Math.floor(Math.random() * 300) + 100);
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
    // 25% chance of scrolling back up slightly
    if (Math.random() < 0.25) {
      await page.mouse.wheel(0, -(Math.floor(Math.random() * 100) + 50));
      await page.waitForTimeout(Math.floor(Math.random() * 500) + 300);
    }
  }
}

async function humanClick(page: Page, selector: string) {
  const element = await page.$(selector);
  if (element) {
    await element.hover();
    await page.waitForTimeout(Math.floor(Math.random() * 500) + 500);
    await element.click();
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
  await humanClick(page, selector);
  await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i], { delay: Math.floor(Math.random() * 70) + 80 });
    // 30% chance of mistype on any character except last 3
    if (i < text.length - 3 && Math.random() < 0.3) {
      const wrongChars = "abcdefghijklmnopqrstuvwxyz";
      await page.keyboard.type(wrongChars[Math.floor(Math.random() * wrongChars.length)]);
      await page.waitForTimeout(Math.floor(Math.random() * 300) + 200);
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(Math.floor(Math.random() * 200) + 100);
    }
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
    await humanScroll(page);
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

    // 30% of the time click the About tab naturally instead of navigating directly
    const aboutTab = page.locator('a[href*="/about"]').first();
    const useAboutTab = Math.random() < 0.3 && await aboutTab.isVisible().catch(() => false);

    if (useAboutTab) {
      console.log(`[${ts()}]   Clicking About tab to explore...`);
      await aboutTab.hover().catch(() => {});
      await page.waitForTimeout(Math.floor(Math.random() * 500) + 500);
      await aboutTab.click().catch(() => {});
      await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
      await humanScroll(page);
    } else {
      const contactUrl = currentUrl.replace(/\/$/, "") + "/directory_contact_info";
      console.log(`[${ts()}]   No email on main page, trying: ${contactUrl}`);
      // Before navigating to contact info
      await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
      await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    }
    // Human reads contact info page
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
    await humanScroll(page);

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

    // Linger when no email found — human double-checking
    const lingerMs = Math.floor(Math.random() * 2000) + 3000; // 3-5s
    console.log(`[${ts()}]   No email found — lingering ${Math.round(lingerMs / 1000)}s`);
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

    // Check for "Permanently Closed"
    if (/permanently\s+closed/i.test(bodyText)) {
      console.log(`[${ts()}]   Business appears inactive — Permanently Closed`);
      return { inactive: true, reason: "Permanently closed per Facebook" };
    }

    // Look for post dates — Facebook renders dates in various formats
    // Common patterns: "January 15, 2024", "Jan 15", "March 2023", timestamps like "1h", "2d", "3w"
    const recentIndicators = /\b(\d+[hm]\b|\d+\s*min|just now|yesterday|\d+d\b|\d+w\b)/i;
    if (recentIndicators.test(bodyText)) {
      // Recent activity found — not inactive
      return { inactive: false, reason: null };
    }

    // Try to find absolute dates in post timestamps
    const datePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi;
    const dateMatches = bodyText.match(datePattern);

    if (dateMatches && dateMatches.length > 0) {
      // Parse all found dates and find the most recent one
      let mostRecent: Date | null = null;
      for (const dateStr of dateMatches) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime()) && (!mostRecent || parsed > mostRecent)) {
          mostRecent = parsed;
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
    }

    // No posts found at all — treat as inactive
    // Check if we're actually on a page with content (not an error page)
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
  url: string | null;
  email: string | null;
  website: string | null;
  inactive: boolean;
  inactiveReason: string | null;
  matchType: "exact" | "fuzzy" | "no_match";
  phoneConfirmed: boolean;
  matchedPageName: string;
};

async function tryMatchCandidates(
  page: Page,
  candidates: { text: string; href: string }[],
  matchName: string,
  city: string,
  phone: string | null
): Promise<SearchResult> {
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

      // Pause on images if visible — as if looking at photos
      const hasPhotos = await page.locator('img[src*="fbcdn"], img[src*="scontent"]').first().isVisible().catch(() => false);
      if (hasPhotos) {
        const photoDelay = Math.floor(Math.random() * 2000) + 2000; // 2-4s
        console.log(`[${ts()}]   Photos visible — pausing ${Math.round(photoDelay / 1000)}s`);
        await page.waitForTimeout(photoDelay);
      }

      // Before scrolling
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
      await humanScroll(page);
      // After scrolling, before extracting
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
      await randomMouseMove(page);

      if (isRedirectedToPersonalProfile(page.url())) {
        console.log(`[${ts()}]   Redirected to personal profile — skipping`);
        return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
      }

      const phoneOk = await confirmPhoneMatch(page, phone);
      if (phoneOk) {
        console.log(`[${ts()}]   Phone confirmed`);
      } else {
        console.log(`[${ts()}]   Phone mismatch but name/city match, proceeding`);
      }

      // Determine match type: exact if cleaned names are equal, fuzzy otherwise
      const cleanedPage = fuzzyClean(text, city);
      const cleanedBiz = fuzzyClean(matchName, city);
      const matchType: "exact" | "fuzzy" = cleanedPage === cleanedBiz ? "exact" : "fuzzy";

      // Check if business is inactive before extracting email
      const { inactive, reason: inactiveReason } = await checkBusinessInactive(page);
      if (inactive) {
        return { url: page.url(), email: null, website: null, inactive: true, inactiveReason, matchType, phoneConfirmed: phoneOk, matchedPageName: text };
      }

      const { email, website } = await extractEmailFromPage(page);

      // 40% chance scroll back to top before leaving — one last look
      if (Math.random() < 0.4) {
        console.log(`[${ts()}]   Scrolling back to top before leaving`);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
      }

      return { url: page.url(), email, website, inactive: false, inactiveReason: null, matchType, phoneConfirmed: phoneOk, matchedPageName: text };
    }
  }

  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
}

// --- Main search function ---
async function searchFacebook(
  page: Page,
  businessName: string,
  city: string,
  phone: string | null
): Promise<SearchResult> {
  const humanQuery = humanizeQuery(businessName, city);
  const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(humanQuery)}`;

  // Before navigating to search
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
  console.log(`[${ts()}]   Searching Facebook: "${humanQuery}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Human reads the page after it loads
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
  await humanScroll(page);
  await randomMouseMove(page);

  if (page.url().includes("/login")) {
    console.log(`[${ts()}]   Session expired — redirected to login`);
    return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
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
    await humanScroll(page);
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
  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
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

  // Filter client-side for precise exclusion
  const filtered = rawProspects.filter(p =>
    !p.facebook_url &&
    p.notes !== "No Facebook presence" &&
    p.notes !== "Facebook found, no email listed"
  );

  if (filtered.length === 0) { console.log("All prospects already searched"); return; }

  const prospects = shuffleArray(filtered);

  console.log(`[${ts()}] Loaded ${prospects.length} prospects (from ${rawProspects.length} query results)\n`);

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

  let tested = 0;
  let emailsFound = 0;
  let outreachSent = 0;
  let skipped = 0; // inactive + has website
  let noFacebook = 0;
  let noEmail = 0;
  const total = prospects.length;

  // --- Session report ---
  type SessionRow = {
    prospect_name: string;
    facebook_page_found: string;
    match_type: string;
    phone_confirmed: string;
    email_found: string;
    email_sent: string;
    facebook_url: string;
    city: string;
    notes: string;
  };
  const sessionRows: SessionRow[] = [];
  const reportsDir = path.resolve("scripts/session-reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `report-${reportTimestamp}.csv`);

  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  function saveReport() {
    if (sessionRows.length === 0) return;
    const header = "prospect_name,facebook_page_found,match_type,phone_confirmed,email_found,email_sent,facebook_url,city,notes";
    const lines = sessionRows.map(r =>
      [r.prospect_name, r.facebook_page_found, r.match_type, r.phone_confirmed, r.email_found, r.email_sent, r.facebook_url, r.city, r.notes]
        .map(csvEscape)
        .join(",")
    );
    fs.writeFileSync(reportPath, header + "\n" + lines.join("\n") + "\n");
    console.log(`[${ts()}] Report saved: ${reportPath} (${sessionRows.length} rows)`);
  }

  function logProgress() {
    const hitRate = tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0";
    console.log(`\n[Progress] ${tested}/${total} | Emails found: ${emailsFound} | Sent: ${outreachSent} | Skipped: ${skipped} | No Facebook: ${noFacebook} | No email: ${noEmail} | Hit rate: ${hitRate}%`);
  }

  process.on("SIGINT", () => {
    console.log("\n[Interrupted]");
    saveReport();
    console.log("=== Session Summary ===");
    console.log(`Tested: ${tested}`);
    console.log(`Emails found: ${emailsFound}`);
    console.log(`Outreach sent: ${outreachSent}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`No Facebook: ${noFacebook}`);
    console.log(`No email: ${noEmail}`);
    console.log(`Hit rate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
    process.exit(0);
  });

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
      const result = await searchFacebook(page, p.business_name, p.city, p.phone);
      const { url, email, website, inactive, inactiveReason, matchType, phoneConfirmed, matchedPageName } = result;
      let rowNotes = "";
      let emailSentThisRow = false;

      // Dead business detection — skip outreach entirely
      if (inactive && url) {
        console.log(`[${ts()}]   Business appears inactive — skipping outreach`);
        await supabase
          .from("pineyweb_prospects")
          .update({
            notes: inactiveReason,
            outreach_status: "lost",
            facebook_url: url,
          })
          .eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: ${inactiveReason}`);
        skipped++;
        rowNotes = inactiveReason || "inactive";
      } else if (website) {
        // If a website is found (not facebook/instagram), skip outreach
        console.log(`[${ts()}]   Website found on Facebook page — skipping outreach`);
        await supabase
          .from("pineyweb_prospects")
          .update({
            notes: `Has website - found on Facebook: ${website}`,
            outreach_status: "lost",
            facebook_url: url || undefined,
          })
          .eq("place_id", p.place_id);
        skipped++;
        rowNotes = `website found: ${website}`;
      } else if (email) {
        emailsFound++;
        console.log(`[${ts()}]   ✓ EMAIL FOUND: ${email}`);
        console.log(`[${ts()}]   Facebook page: ${url}`);

        // Lose focus — human switches away to write down the email
        const focusLossMs = Math.floor(Math.random() * 20000) + 20000; // 20-40s
        console.log(`[${ts()}]   Switching away for ${Math.round(focusLossMs / 1000)}s (writing down email)...`);
        await page.keyboard.press("Meta+M");
        await page.waitForTimeout(focusLossMs);
        await page.bringToFront();

        const { error: updateErr } = await supabase
          .from("pineyweb_prospects")
          .update({ email, email_source: "Facebook", facebook_url: url })
          .eq("place_id", p.place_id);

        if (updateErr) {
          console.log(`[${ts()}]   DB save failed: ${updateErr.message}`);
          rowNotes = "db save failed";
        } else {
          console.log(`[${ts()}]   Saved to database`);
          const sent = await sendOutreach({ ...p, email });
          if (sent) { outreachSent++; emailSentThisRow = true; }
        }
        if (!phoneConfirmed) rowNotes = rowNotes ? `${rowNotes}, phone mismatch` : "phone mismatch";
      } else if (url) {
        noEmail++;
        console.log(`[${ts()}]   ✗ Page found but no email: ${url}`);
        await supabase
          .from("pineyweb_prospects")
          .update({ notes: "Facebook found, no email listed", contact_method: "facebook_message", facebook_url: url })
          .eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: Facebook found, no email listed`);
        rowNotes = "no email on page";
      } else {
        noFacebook++;
        console.log(`[${ts()}]   ✗ No Facebook page found`);
        await supabase
          .from("pineyweb_prospects")
          .update({ notes: "No Facebook presence", contact_method: "phone" })
          .eq("place_id", p.place_id);
        console.log(`[${ts()}]   Marked: No Facebook presence`);
      }

      sessionRows.push({
        prospect_name: p.business_name,
        facebook_page_found: matchedPageName,
        match_type: matchType,
        phone_confirmed: String(phoneConfirmed),
        email_found: email || "",
        email_sent: String(emailSentThisRow),
        facebook_url: url || "",
        city: p.city,
        notes: rowNotes,
      });

      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    } catch (err) {
      console.log(`[${ts()}]   ✗ Error: ${err instanceof Error ? err.message : err}`);
      sessionRows.push({
        prospect_name: p.business_name,
        facebook_page_found: "",
        match_type: "no_match",
        phone_confirmed: "false",
        email_found: "",
        email_sent: "false",
        facebook_url: "",
        city: p.city,
        notes: `error: ${err instanceof Error ? err.message : err}`,
      });
      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    }

    // Browse current page naturally between searches
    if (i < prospects.length - 1) {
      await browsePageNaturally(page, p.business_name);
    }
  }

  const cookies = await context.cookies();
  fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(cookies, null, 2));
  console.log(`\n[${ts()}] Session cookies saved.`);

  await browser.close();

  saveReport();

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Emails found: ${emailsFound}`);
  console.log(`Outreach sent: ${outreachSent}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`No Facebook: ${noFacebook}`);
  console.log(`No email: ${noEmail}`);
  console.log(`Hit rate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
}

main();
