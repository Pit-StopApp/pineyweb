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
  try {
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
  } catch (err) {
    console.log(`[${ts()}]   Browse interrupted: ${err instanceof Error ? err.message : err}`);
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
  // Use regex with word boundaries to extract email from surrounding text
  const regex = /\b[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const matches = text.match(regex);
  if (!matches) return null;
  return matches.find(e =>
    !e.includes("@facebook.com") &&
    !e.includes("@fb.com") &&
    !e.includes("@sentry") &&
    e.length < 100
  ) || null;
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

    // Validate session — check if actually logged in
    console.log(`[${ts()}] Validating session...`);
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

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

  // Open login page and wait for auto-detection
  console.log(`[${ts()}] Opening Facebook for manual login...`);
  console.log(`[${ts()}] Log in manually — session will be saved automatically once logged in.\n`);
  await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForLoggedIn(page);
  await saveCookies(context);
}

// --- Website detection ---
const IGNORED_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "messenger.com", "whatsapp.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "google.com", "apple.com", "play.google.com"];

function extractWebsiteUrl(text: string): string | null {
  // Match full URLs (http/https)
  const urlMatches = text.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s)"]*/g) || [];

  // Also match bare domain patterns for common website builders and link services
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

    // Look for post dates — Facebook renders dates in many formats
    // Recent relative timestamps mean the business is active
    const recentIndicators = /\b(\d+[hm]\b|\d+\s*min(ute)?s?\b|just now|yesterday|\d+d\b|\d+w\b|\d+\s*hr)/i;
    if (recentIndicators.test(bodyText)) {
      return { inactive: false, reason: null };
    }

    // Relative year indicators — "1y", "2y" etc. mean old posts
    const yearRelative = bodyText.match(/\b(\d+)y\b/);
    if (yearRelative) {
      const years = parseInt(yearRelative[1]);
      if (years >= 2) {
        console.log(`[${ts()}]   Business appears inactive — most recent post ~${years} years ago`);
        return { inactive: true, reason: `Inactive — last Facebook post: ~${years} years ago` };
      }
      return { inactive: false, reason: null };
    }

    // Parse absolute dates aggressively
    const MONTH_MAP: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    // Match: "January 15, 2024", "Aug 29, 2019", "March 2023", "December 1 2020"
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
          // Try native Date parse first
          let parsed = new Date(dateStr);
          // If that fails, manually parse "Month Year" format
          if (isNaN(parsed.getTime())) {
            const parts = dateStr.trim().split(/[\s,]+/);
            const monthStr = parts.find(p => MONTH_MAP[p.toLowerCase()] !== undefined);
            const yearStr = parts.find(p => /^\d{4}$/.test(p));
            if (monthStr && yearStr) {
              parsed = new Date(parseInt(yearStr), MONTH_MAP[monthStr.toLowerCase()], 15);
            }
          }
          if (!isNaN(parsed.getTime()) && (!mostRecent || parsed > mostRecent)) {
            mostRecent = parsed;
          }
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

// --- AI match verification ---
async function verifyMatch(
  prospectName: string,
  prospectCity: string,
  prospectPhone: string | null,
  facebookPageName: string,
  facebookPhone: string | null,
  facebookCity: string | null
): Promise<{ verified: boolean; confidence: number; reason: string }> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `We were searching for a business called "${prospectName}" in ${prospectCity}, TX.\nWe found a Facebook page called "${facebookPageName}"${facebookCity ? ` located in ${facebookCity}` : ""}.\nProspect phone: ${prospectPhone || "unknown"}\nFacebook phone: ${facebookPhone || "unknown"}\n\nIs this the same business? Reply ONLY with valid JSON: {"verified": true/false, "confidence": 1-10, "reason": "brief explanation"}`,
        }],
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
      if (hasPhotos && Math.random() < 0.3) {
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

  const page = await context.newPage();
  await loadOrCreateSession(context, page);

  // Human settling in after opening browser
  await page.waitForTimeout(Math.floor(Math.random() * 4000) + 3000);

  let tested = 0;
  let emailsFound = 0;
  let emailsSaved = 0;
  let outreachSent = 0;
  let skipped = 0; // inactive + has website
  let noFacebook = 0;
  let noEmail = 0;
  const total = prospects.length;

  // --- Session report (master CSV) ---
  type SessionRow = {
    session_date: string;
    session_id: string;
    prospect_name: string;
    facebook_page_found: string;
    match_type: string;
    phone_confirmed: string;
    email_found: string;
    email_sent: string;
    facebook_url: string;
    city: string;
    notes: string;
    match_verified: string;
    verification_reason: string;
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
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  function rowToCsv(r: SessionRow): string {
    return [r.session_date, r.session_id, r.prospect_name, r.facebook_page_found, r.match_type, r.phone_confirmed, r.email_found, r.email_sent, r.facebook_url, r.city, r.notes, r.match_verified, r.verification_reason]
      .map(csvEscape)
      .join(",");
  }

  // Consolidate any old individual report-*.csv files into master
  function consolidateOldReports() {
    const files = fs.readdirSync(reportsDir).filter(f => f.startsWith("report-") && f.endsWith(".csv"));
    if (files.length === 0) return;
    console.log(`[${ts()}] Consolidating ${files.length} old report file(s) into master...`);

    for (const file of files) {
      const filePath = path.join(reportsDir, file);
      const content = fs.readFileSync(filePath, "utf-8").trim();
      const lines = content.split("\n").slice(1); // skip header
      if (lines.length === 0) { fs.unlinkSync(filePath); continue; }

      // Derive session_date and session_id from filename: report-2026-03-22T14-30-00.csv
      const tsMatch = file.match(/report-(.+)\.csv$/);
      const oldTs = tsMatch ? tsMatch[1].replace(/-/g, (m, offset: number) => offset <= 9 ? "-" : ":").replace(/T(\d+):(\d+):(\d+)$/, "T$1:$2:$3") : sessionDate;
      // Reconstruct a valid ISO date from the filename
      const parts = file.replace("report-", "").replace(".csv", "").split("T");
      const datePart = parts[0]; // 2026-03-22
      const timePart = parts[1] ? parts[1].replace(/-/g, ":") : "00:00:00"; // 14:30:00
      const oldSessionDate = `${datePart}T${timePart}.000Z`;
      const oldSessionId = `session-${parts.join("T").replace(/:/g, "-")}`;

      // Append old rows with session columns prepended
      const augmentedLines = lines.map(line => `${csvEscape(oldSessionDate)},${csvEscape(oldSessionId)},${line}`);

      if (fs.existsSync(masterPath)) {
        fs.appendFileSync(masterPath, augmentedLines.join("\n") + "\n");
      } else {
        fs.writeFileSync(masterPath, CSV_HEADER + "\n" + augmentedLines.join("\n") + "\n");
      }

      fs.unlinkSync(filePath);
      console.log(`[${ts()}]   Merged ${lines.length} rows from ${file}`);
    }
  }

  consolidateOldReports();

  function saveReport() {
    if (sessionRows.length === 0) return;
    const newLines = sessionRows.map(rowToCsv).join("\n") + "\n";

    if (fs.existsSync(masterPath)) {
      fs.appendFileSync(masterPath, newLines);
    } else {
      fs.writeFileSync(masterPath, CSV_HEADER + "\n" + newLines);
    }
    console.log(`[${ts()}] Report saved: ${masterPath} (${sessionRows.length} new rows, session: ${sessionId})`);
    sessionRows.length = 0; // clear so we don't double-write on next save
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
      let matchVerified = "";
      let verificationReason = "";

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

        // Verify match — skip if phone already confirmed (high confidence)
        let verified = true;
        let confidence = 10;
        let reason = "phone confirmed";

        if (!phoneConfirmed) {
          console.log(`[${ts()}]   Verifying match with Claude AI...`);
          const verification = await verifyMatch(p.business_name, p.city, p.phone, matchedPageName, null, null);
          verified = verification.verified;
          confidence = verification.confidence;
          reason = verification.reason;

          if (verified && confidence >= 7) {
            console.log(`[${ts()}]   ✓ Verified (confidence: ${confidence}/10) — saving email`);
          } else {
            console.log(`[${ts()}]   ✗ Unverified (confidence: ${confidence}/10): ${reason} — skipping`);
          }
        }

        matchVerified = String(verified && confidence >= 7);
        verificationReason = reason;

        if (verified && confidence >= 7) {
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
            emailsSaved++;
            console.log(`[${ts()}]   ✓ Email saved to CRM`);
            const sent = await sendOutreach({ ...p, email });
            if (sent) { outreachSent++; emailSentThisRow = true; }

            // Follow the business page after saving email
            try {
              const followBtn = page.locator('[aria-label="Follow"], [aria-label="Like"], [aria-label="Like Page"]').first();
              const followVisible = await followBtn.isVisible().catch(() => false);
              if (followVisible) {
                const btnText = await followBtn.textContent().catch(() => "") || "";
                const alreadyFollowing = /following|liked/i.test(btnText);
                if (!alreadyFollowing) {
                  const el = await followBtn.elementHandle();
                  if (el) {
                    await el.hover();
                    await page.waitForTimeout(Math.floor(Math.random() * 500) + 500);
                    await el.click();
                    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
                    console.log(`[${ts()}]   👍 Followed ${p.business_name} page`);
                  }
                }
              }
            } catch { /* skip silently */ }
          }
        } else {
          // Unverified — mark for review, don't save email
          await supabase
            .from("pineyweb_prospects")
            .update({ notes: "Facebook match unverified — needs review", facebook_url: url })
            .eq("place_id", p.place_id);
          rowNotes = `unverified: ${reason}`;
        }
        if (!phoneConfirmed && verified && confidence >= 7) rowNotes = rowNotes ? `${rowNotes}, phone mismatch` : "phone mismatch";
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
        session_date: sessionDate,
        session_id: sessionId,
        prospect_name: p.business_name,
        facebook_page_found: matchedPageName,
        match_type: matchType,
        phone_confirmed: String(phoneConfirmed),
        email_found: email || "",
        email_sent: String(emailSentThisRow),
        facebook_url: url || "",
        city: p.city,
        notes: rowNotes,
        match_verified: matchVerified,
        verification_reason: verificationReason,
      });

      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    } catch (err) {
      console.log(`[${ts()}]   ✗ Error: ${err instanceof Error ? err.message : err}`);
      sessionRows.push({
        session_date: sessionDate,
        session_id: sessionId,
        prospect_name: p.business_name,
        facebook_page_found: "",
        match_type: "no_match",
        phone_confirmed: "false",
        email_found: "",
        email_sent: "false",
        facebook_url: "",
        city: p.city,
        notes: `error: ${err instanceof Error ? err.message : err}`,
        match_verified: "",
        verification_reason: "",
      });
      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    }

    // Browse current page naturally between searches
    if (i < prospects.length - 1) {
      try {
        await browsePageNaturally(page, p.business_name);
      } catch (browseErr) {
        console.log(`[${ts()}]   Browse error (non-fatal): ${browseErr instanceof Error ? browseErr.message : browseErr}`);
      }
    }
  }

  try {
    const cookies = await context.cookies();
    fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(cookies, null, 2));
    console.log(`\n[${ts()}] Session cookies saved.`);
  } catch (err) {
    console.log(`[${ts()}] Could not save session cookies: ${err instanceof Error ? err.message : err}`);
  }

  try {
    await browser.close();
  } catch { /* browser may already be closed */ }

  saveReport();

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Emails found: ${emailsFound}`);
  console.log(`Emails saved to CRM: ${emailsSaved}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`No Facebook: ${noFacebook}`);
  console.log(`No email: ${noEmail}`);
  console.log(`Hit rate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
}

main();
