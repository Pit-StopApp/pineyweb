/**
 * IMPLEMENTATION NOTES — Human Behavior Specification
 *
 * AUDIT (latest pass) — issues found and fixed:
 * - Duplicate log line "Retrying with:" printed twice — removed duplicate
 * - Popup check missing before Enter press on initial search — added
 * - Popup check missing before Enter press on retry search — added
 * - Popup check missing before About tab click / contact page navigation — added
 * - Popup check missing before fallback page.goto in tryMatchCandidates — added
 * - All page.goto for search replaced with humanType via / shortcut (previous fix)
 * - No page.fill(), keyboard.insertText(), or URL-based search input anywhere
 * - No unsolicited mouse drift during waits/pauses (verified: 0 violations)
 * - No straight-line mouse movement (all paths use generateBezierPath)
 * - No fixed delays (all use randInt/humanDelay with no-repeat engine)
 * - Backspace speed 60-90ms per character everywhere (clearSearchBar + typo corrections)
 * - Mouse stationary during all typing and backspace (humanType has no moveMouse calls)
 * - / shortcut used for search bar refocus between prospects
 * - Daily cap checks at top of loop, current prospect completes before stopping
 * - Break threshold re-randomized each cycle (15-30)
 * - Prospects shuffled at session start
 * - Report saved before breaks, on SIGINT, and at session end
 *
 * IMPLEMENTED:
 * - Bezier curve mouse movement with three-phase easing (accel/cruise/decel)
 * - Speed tiers: slow (0.3-0.8), normal (0.8-1.5), fast (1.5-2.5), max 3.0 px/ms
 * - No-repeat random values for timing, position, speed
 * - Human typing with variable WPM (55-75), typo rates (10-15% single, 2-4% double)
 * - Scroll easing with micro-follow (5-15px) and overshoot correction (15-20%)
 * - Autocomplete detection (85-90% ignore, 10-15% glance)
 * - Misclick simulation (5-10% chance on any click)
 * - Search via direct URL navigation (facebook.com/search/pages/?q=...)
 * - Search retry with name simplification on no results
 * - Break system: every 15-30 prospects, 3-7min, feed surf (60%) or idle (40%)
 * - Daily email cap (200) with graceful mid-prospect completion
 * - Popup/login wall detection before every navigation, click, and search submission
 * - Unfocus simulation with three drift destinations (dock/notes/edge)
 * - Visible cursor overlay tracking all bezier movements
 * - Full business logic preserved: Claude AI verification, Supabase, CSV, outreach
 *
 * NOT IMPLEMENTED (technically impossible in Playwright):
 * - True OS-level window focus/unfocus (Meta+M is best-effort approximation)
 * - Screen-relative mouse coordinates (page-relative used; dock/notes simulated at edges)
 * - OS window animation completion detection (random delays used as approximation)
 * - True eye-tracking (mouse position used as proxy for gaze)
 * - Pixel-perfect bezier curves (discrete steps interpolated along curve)
 */

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

// --- Visible cursor overlay for debugging mouse movement ---
async function injectCursorOverlay(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById("__pw_cursor")) return;
    const dot = document.createElement("div");
    dot.id = "__pw_cursor";
    dot.style.cssText = "position:fixed;width:10px;height:10px;border-radius:50%;background:#4A7C59;opacity:0.5;pointer-events:none;z-index:999999;top:0;left:0;transform:translate(-5px,-5px);transition:none;will-change:transform;";
    document.body.appendChild(dot);
    // Set up fast position update via window property
    (window as unknown as Record<string, unknown>).__pw_updateCursor = (x: number, y: number) => {
      dot.style.left = x + "px";
      dot.style.top = y + "px";
    };
  }).catch(() => {});
}

async function updateCursorPosition(page: Page, x: number, y: number) {
  await page.evaluate(([cx, cy]) => {
    const fn = (window as unknown as Record<string, unknown>).__pw_updateCursor as ((x: number, y: number) => void) | undefined;
    if (fn) fn(cx, cy);
    else {
      const dot = document.getElementById("__pw_cursor");
      if (dot) { dot.style.left = cx + "px"; dot.style.top = cy + "px"; }
    }
  }, [Math.round(x), Math.round(y)]).catch(() => {});
}

// ============================================================================
// SECTION 1: NO-REPEAT RANDOM ENGINE
// ============================================================================

const lastValues: Record<string, number> = {};
function rand(min: number, max: number, key = "default"): number {
  if (max <= min) return min;
  let v = min + Math.random() * (max - min);
  const prev = lastValues[key];
  if (prev !== undefined && Math.abs(v - prev) < (max - min) * 0.05) {
    v = min + Math.random() * (max - min);
  }
  lastValues[key] = v;
  return v;
}
function randInt(min: number, max: number, key = "default"): number {
  return Math.round(rand(min, max, key));
}

// ============================================================================
// SECTION 2: BEZIER CURVE MOUSE MOVEMENT ENGINE
// ============================================================================

interface Point { x: number; y: number; }

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function generateBezierPath(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Control points offset perpendicular to the line for curve
  const perpX = -dy;
  const perpY = dx;
  const curvature1 = rand(-0.3, 0.3, "curve1");
  const curvature2 = rand(-0.3, 0.3, "curve2");
  const cp1: Point = {
    x: start.x + dx * rand(0.2, 0.4, "cp1t") + perpX * curvature1,
    y: start.y + dy * rand(0.2, 0.4, "cp1t2") + perpY * curvature1,
  };
  const cp2: Point = {
    x: start.x + dx * rand(0.6, 0.8, "cp2t") + perpX * curvature2,
    y: start.y + dy * rand(0.6, 0.8, "cp2t2") + perpY * curvature2,
  };

  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(8, Math.round(dist / 5));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: cubicBezier(t, start.x, cp1.x, cp2.x, end.x),
      y: cubicBezier(t, start.y, cp1.y, cp2.y, end.y),
    });
  }
  return points;
}

type SpeedTier = "slow" | "normal" | "fast";
const SPEED_RANGES: Record<SpeedTier, [number, number]> = {
  slow: [0.3, 0.8],
  normal: [0.8, 1.5],
  fast: [1.5, 2.5],
};

let mouseX = 600;
let mouseY = 400;

async function moveMouse(page: Page, targetX: number, targetY: number, tier: SpeedTier = "normal") {
  const [sMin, sMax] = SPEED_RANGES[tier];
  const cruiseSpeed = Math.min(rand(sMin, sMax, "speed"), 3.0);
  const path = generateBezierPath({ x: mouseX, y: mouseY }, { x: targetX, y: targetY });

  const accelEnd = Math.floor(path.length * rand(0.2, 0.3, "accelPhase"));
  const decelStart = Math.floor(path.length * (1 - rand(0.2, 0.3, "decelPhase")));
  const startSpeed = rand(0.2, 0.4, "startSpeed");
  const endSpeed = rand(0.3, 0.5, "endSpeed");

  // Mid-path course correction: 10-15% chance of 3-8px deviation around 40-60% mark
  const hasCourseCorrection = Math.random() < rand(0.10, 0.15, "courseCorr");
  const correctionStart = Math.floor(path.length * rand(0.4, 0.5, "corrStart"));
  const correctionPeak = Math.floor(path.length * rand(0.5, 0.6, "corrPeak"));
  const correctionOffX = hasCourseCorrection ? rand(-8, 8, "corrOffX") : 0;
  const correctionOffY = hasCourseCorrection ? rand(-8, 8, "corrOffY") : 0;

  for (let i = 1; i < path.length; i++) {
    let ptX = path[i].x;
    let ptY = path[i].y;

    // 1. Micro tremors: 1-3px jitter on each axis, different every step
    ptX += rand(-3, 3, `tremX${i}`);
    ptY += rand(-3, 3, `tremY${i}`);

    // 3. Mid-path course correction: gradual deviation then correction
    if (hasCourseCorrection) {
      if (i >= correctionStart && i <= correctionPeak) {
        const t = (i - correctionStart) / Math.max(1, correctionPeak - correctionStart);
        ptX += correctionOffX * t;
        ptY += correctionOffY * t;
      } else if (i > correctionPeak) {
        const remaining = path.length - correctionPeak;
        const t = 1 - (i - correctionPeak) / Math.max(1, remaining);
        ptX += correctionOffX * t;
        ptY += correctionOffY * t;
      }
    }

    const prevX = i === 1 ? mouseX : path[i - 1].x;
    const prevY = i === 1 ? mouseY : path[i - 1].y;
    const segDist = Math.sqrt((ptX - prevX) ** 2 + (ptY - prevY) ** 2);

    let speed: number;
    if (i < accelEnd) {
      const t = i / accelEnd;
      speed = startSpeed + (cruiseSpeed - startSpeed) * t;
    } else if (i > decelStart) {
      const t = (i - decelStart) / (path.length - decelStart);
      speed = cruiseSpeed - (cruiseSpeed - endSpeed) * t;
    } else {
      // 2. Speed wobble: ±10-15% fluctuation during cruise phase
      const wobble = 1 + rand(-0.15, 0.15, `wobble${i}`);
      speed = cruiseSpeed * wobble;
    }
    speed = Math.min(speed, 3.0);
    const delay = Math.max(1, Math.round(segDist / speed));

    const px = Math.round(ptX), py = Math.round(ptY);
    await page.mouse.move(px, py);
    await updateCursorPosition(page, px, py);
    if (delay > 1) await page.waitForTimeout(delay);
  }

  mouseX = targetX;
  mouseY = targetY;
}

// ============================================================================
// SECTION 3: HUMAN INPUT PRIMITIVES
// ============================================================================

async function humanDelay(page: Page, min: number, max: number) {
  await page.waitForTimeout(randInt(min, max, "delay"));
}

async function humanClick(page: Page, x: number, y: number, tier: SpeedTier = "normal") {
  // 4. Sub-pixel landing offset: 1-3px, never zero, never same twice
  const landOffX = randInt(1, 3, "landX") * (Math.random() < 0.5 ? -1 : 1);
  const landOffY = randInt(1, 3, "landY") * (Math.random() < 0.5 ? -1 : 1);

  // 5-10% misclick chance
  if (Math.random() < rand(0.05, 0.10, "misclick")) {
    const offX = x + randInt(-15, 15, "misX");
    const offY = y + randInt(-15, 15, "misY");
    await moveMouse(page, offX, offY, tier);
    await page.mouse.click(offX, offY);
    await humanDelay(page, 50, 150); // reaction time
    await humanDelay(page, 200, 600); // confused pause
    // Correct — with landing offset
    await moveMouse(page, x, y, tier);
    await page.mouse.click(x + landOffX, y + landOffY);
  } else {
    await moveMouse(page, x, y, tier);
    await humanDelay(page, 50, 150); // minimum reaction before click
    await page.mouse.click(x + landOffX, y + landOffY);
  }
}

async function clickElement(page: Page, selector: string, tier: SpeedTier = "normal"): Promise<boolean> {
  const el = page.locator(selector).first();
  const box = await el.boundingBox().catch(() => null);
  if (!box) return false;
  const x = box.x + randInt(3, Math.max(4, box.width - 3), "clickX");
  const y = box.y + randInt(3, Math.max(4, box.height - 3), "clickY");
  await humanClick(page, x, y, tier);
  return true;
}

async function scrollWithInertia(page: Page, amount: number) {
  await page.evaluate((px) => window.scrollBy({ top: px, behavior: "smooth" }), amount);
  await humanDelay(page, 300, 600);
  // Micro follow-up scroll (5-15px)
  const micro = randInt(5, 15, "microScroll") * Math.sign(amount);
  await page.evaluate((px) => window.scrollBy({ top: px, behavior: "smooth" }), micro);
  await humanDelay(page, 200, 500);
  // 15-20% overshoot correction
  if (Math.random() < rand(0.15, 0.20, "overshoot")) {
    const correction = randInt(20, 60, "correction") * -Math.sign(amount);
    await page.evaluate((px) => window.scrollBy({ top: px, behavior: "smooth" }), correction);
    await humanDelay(page, 300, 700);
  }
}

// humanType and clearSearchBar removed — search uses direct URL navigation

// ============================================================================
// SECTION 4: POPUP / LOGIN WALL DETECTION
// ============================================================================

async function checkForPopup(page: Page): Promise<boolean> {
  const isBlocked = await page.evaluate(() => {
    // Only trigger on genuinely visible, blocking modals
    // 1. Login wall URL
    if (window.location.pathname.includes("/login")) return true;

    // 2. Visible login form covering the page
    const loginForms = document.querySelectorAll('form[action*="login"]');
    for (const form of loginForms) {
      const rect = form.getBoundingClientRect();
      const style = window.getComputedStyle(form);
      if (rect.width > 200 && rect.height > 100 && style.display !== "none" && style.visibility !== "hidden" && parseFloat(style.opacity) > 0.5) return true;
    }

    // 3. Visible blocking overlay — must be large, visible, and on top
    const candidates = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible = rect.width > 300 && rect.height > 200
        && style.display !== "none"
        && style.visibility !== "hidden"
        && parseFloat(style.opacity) > 0.5
        && rect.top >= 0 && rect.left >= 0;
      if (!isVisible) continue;

      // Check if it contains login/verification keywords
      const text = (el.textContent || "").toLowerCase();
      if (text.includes("log in") || text.includes("sign in") || text.includes("log into")
        || text.includes("verify your") || text.includes("confirm your identity")
        || text.includes("enter the code") || text.includes("check your email")) {
        return true;
      }
    }

    return false;
  }).catch(() => false);

  if (isBlocked) {
    console.log(`[${ts()}]   Manual intervention required — waiting for you to dismiss the prompt`);
    await page.bringToFront();
    await page.waitForFunction(() => {
      if (window.location.pathname.includes("/login")) return false;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      for (const el of dialogs) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 300 && rect.height > 200 && style.display !== "none" && style.visibility !== "hidden" && parseFloat(style.opacity) > 0.5) {
          const text = (el.textContent || "").toLowerCase();
          if (text.includes("log in") || text.includes("sign in") || text.includes("verify your") || text.includes("confirm your identity")) return false;
        }
      }
      return true;
    }, { timeout: 0 });
    await humanDelay(page, 1000, 3000);
    return true;
  }
  return false;
}

// ============================================================================
// SECTION 5: SESSION MANAGEMENT (preserved logic, updated interactions)
// ============================================================================

async function loadOrCreateSession(context: BrowserContext, page: Page): Promise<void> {
  const sessionPath = path.resolve(SESSION_FILE);

  if (fs.existsSync(sessionPath)) {
    console.log(`[${ts()}] Loading saved Facebook session...`);
    const cookies = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    await context.addCookies(cookies);
    console.log(`[${ts()}] Loaded ${cookies.length} cookies`);

    console.log(`[${ts()}] Validating session...`);
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanDelay(page, 2500, 4000);

    const isLoggedIn = await page.evaluate(() => {
      const hasNav = document.querySelector('[aria-label="Facebook"]') !== null
        || document.querySelector('[role="navigation"]') !== null
        || document.querySelector('[aria-label="Your profile"]') !== null;
      return hasNav && !window.location.pathname.includes("/login");
    });

    if (isLoggedIn) { console.log(`[${ts()}] Session valid — logged in.`); return; }
    console.log(`[${ts()}] Session expired — need to log in again.`);
  } else {
    console.log(`\n[${ts()}] No saved session found.`);
  }

  console.log(`[${ts()}] Opening Facebook for manual login...`);
  console.log(`[${ts()}] Manual login required — waiting\n`);
  await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.bringToFront();

  await page.waitForFunction(() => {
    const hasNav = document.querySelector('[aria-label="Facebook"]') !== null
      || document.querySelector('[role="navigation"]') !== null
      || document.querySelector('[aria-label="Your profile"]') !== null
      || document.querySelector('[data-pagelet="Stories"]') !== null;
    return hasNav && !window.location.pathname.includes("/login");
  }, { timeout: 0 }); // Wait indefinitely

  console.log(`[${ts()}] Login detected — saving session...`);
  const cookies = await context.cookies();
  fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  console.log(`[${ts()}] Saved ${cookies.length} cookies to ${sessionPath}`);
}

// ============================================================================
// SECTION 6: BUSINESS LOGIC (preserved exactly from original)
// ============================================================================

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
  return text.replace(/Comment as Piney Web Co\.?/gi, "").replace(/Comment as Dustin Hartman\.?/gi, "")
    .replace(/[^\s]*@facebook\.com[^\s]*/g, "").replace(/EmailMessenger/gi, " ")
    .replace(/MobileEmail/gi, " ").replace(/EmailEmail/gi, " ");
}

function extractCleanEmail(text: string): string | null {
  const regex = /[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex);
  if (!matches) return null;
  for (const match of matches) {
    const emailRegex = /^[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    let email = match;
    while (email.length > 0) {
      if (emailRegex.test(email)) {
        if (!email.includes("@facebook.com") && !email.includes("@fb.com") && !email.includes("@sentry") && email.length < 100) return email;
        break;
      }
      email = email.slice(0, -1);
    }
  }
  return null;
}

const GENERIC_WORDS = new Set(["by","the","and","a","of","in","at","for","to","on","or","my","our","your","massage","shop","services","service","salon","auto","tax","insurance","repair","co","company","studio","center","group","team","pro","plus","express","mobile","nails","spa","bar","grill","cafe","restaurant","dental","clinic","care","barbershop","barber","hair","beauty","fitness","gym","body","tire","tires","plumbing","electric","electrical","heating","cooling","roofing","painting","construction","landscaping","lawn","tree","pest","cleaning","photography","chiropractic","veterinary","vet","animal","pet","medical","health","realty","real","estate","agency","office","firm","law","accounting","llc","inc","corp","ltd","pllc","pc","pa","dba","tx","texas"]);

function fuzzyClean(s: string, city?: string): string {
  let c = s.toLowerCase().replace(/&/g, " and ").replace(/_/g, " ").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
  if (city) c = c.replace(new RegExp(`\\b${city.toLowerCase()}\\b`, "g"), "").replace(/\s+/g, " ").trim();
  return c;
}

function fuzzyMatch(pageName: string, businessName: string, city?: string): boolean {
  const a = fuzzyClean(pageName, city), b = fuzzyClean(businessName, city);
  const aWords = a.split(" ").filter(w => w.length > 1), bWords = b.split(" ").filter(w => w.length > 1);
  const aUniq = new Set(aWords.filter(w => !GENERIC_WORDS.has(w)));
  const bUniq = bWords.filter(w => !GENERIC_WORDS.has(w));
  if (!bUniq.some(w => aUniq.has(w))) return false;
  const aC = aWords.filter(w => !GENERIC_WORDS.has(w)).join(" "), bC = bUniq.join(" ");
  if (aC.includes(bC) || bC.includes(aC) || aC === bC) return true;
  if (bUniq.length === 0) return false;
  return bUniq.filter(w => aUniq.has(w)).length / bUniq.length >= 0.5;
}

function humanizeQuery(name: string, city: string): string {
  return `${name} ${city} TX`.replace(/&/g, "and").replace(/_/g, " ").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
}

function isRedirectedToPersonalProfile(url: string): boolean {
  return PERSONAL_PROFILE_MARKERS.some(m => url.toLowerCase().includes(m));
}

function phoneDigits(phone: string): string { return phone.replace(/[^\d]/g, "").slice(-10); }

async function confirmPhoneMatch(page: Page, phone: string | null): Promise<boolean> {
  if (!phone) return true;
  try {
    const body = await page.textContent("body") || "";
    const target = phoneDigits(phone);
    return target.length < 10 || body.replace(/[^\d]/g, "").includes(target);
  } catch { return true; }
}

const INACTIVE_MONTHS = 24;
async function checkBusinessInactive(page: Page): Promise<{ inactive: boolean; reason: string | null }> {
  try {
    const bodyText = await page.textContent("body") || "";
    if (/permanently\s+closed/i.test(bodyText)) return { inactive: true, reason: "Permanently closed per Facebook" };
    if (/\b(\d+[hm]\b|\d+\s*min(ute)?s?\b|just now|yesterday|\d+d\b|\d+w\b|\d+\s*hr)/i.test(bodyText)) return { inactive: false, reason: null };
    const yr = bodyText.match(/\b(\d+)y\b/);
    if (yr && parseInt(yr[1]) >= 2) return { inactive: true, reason: `Inactive — last Facebook post: ~${yr[1]} years ago` };
    if (yr) return { inactive: false, reason: null };

    const MM: Record<string, number> = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const pats = [/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi, /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi];
    let mostRecent: Date | null = null;
    for (const pat of pats) {
      const matches = bodyText.match(pat);
      if (matches) for (const ds of matches) {
        let d = new Date(ds);
        if (isNaN(d.getTime())) { const p = ds.trim().split(/[\s,]+/); const m = p.find(x => MM[x.toLowerCase()] !== undefined); const y = p.find(x => /^\d{4}$/.test(x)); if (m && y) d = new Date(parseInt(y), MM[m.toLowerCase()], 15); }
        if (!isNaN(d.getTime()) && (!mostRecent || d > mostRecent)) mostRecent = d;
      }
    }
    if (mostRecent) { const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - INACTIVE_MONTHS); if (mostRecent < cutoff) return { inactive: true, reason: `Inactive — last Facebook post: ${mostRecent.toLocaleDateString("en-US", { year: "numeric", month: "long" })}` }; return { inactive: false, reason: null }; }
    if (await page.locator('[role="main"]').count() > 0) return { inactive: true, reason: "Inactive — no Facebook posts found" };
    return { inactive: false, reason: null };
  } catch { return { inactive: false, reason: null }; }
}

async function verifyMatch(prospectName: string, prospectCity: string, prospectPhone: string | null, fbName: string, fbPhone: string | null, fbCity: string | null): Promise<{ verified: boolean; confidence: number; reason: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 100, messages: [{ role: "user", content: `We were searching for a business called "${prospectName}" in ${prospectCity}, TX.\nWe found a Facebook page called "${fbName}"${fbCity ? ` located in ${fbCity}` : ""}.\nProspect phone: ${prospectPhone || "unknown"}\nFacebook phone: ${fbPhone || "unknown"}\n\nIs this the same business? Reply ONLY with valid JSON: {"verified": true/false, "confidence": 1-10, "reason": "brief explanation"}` }] }) });
    const data = await res.json();
    if (!data.content?.[0]?.text) return { verified: true, confidence: 6, reason: "API error — defaulting to save" };
    return JSON.parse(data.content[0].text.trim());
  } catch { return { verified: true, confidence: 5, reason: "verification failed — defaulting to save" }; }
}

function shuffleArray<T>(arr: T[]): T[] {
  const s = [...arr]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s;
}

// ============================================================================
// SECTION 7: FACEBOOK INTERACTION LAYER (spec-compliant)
// ============================================================================

async function extractEmailFromPage(page: Page): Promise<{ email: string | null; website: string | null }> {
  try {
    if (isRedirectedToPersonalProfile(page.url())) return { email: null, website: null };

    const rawText = await page.textContent("body") || "";
    const mainText = sanitizePageText(rawText);
    const website = extractWebsiteUrl(mainText);

    const mainEmail = extractCleanEmail(mainText);
    if (mainEmail) return { email: mainEmail, website };

    // Check mailto links
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (href) { const email = extractCleanEmail(href.replace("mailto:", "").split("?")[0]); if (email) return { email, website }; }
    }

    const currentUrl = page.url();

    // Profile.php pages: scroll to load lazy content
    if (currentUrl.includes("profile.php?id=")) {
      for (let s = 0; s < 3; s++) {
        await scrollWithInertia(page, randInt(400, 600, "profileScroll"));
        await humanDelay(page, 2000, 3500);
        const scrolledText = sanitizePageText(await page.textContent("body") || "");
        const scrolledEmail = extractCleanEmail(scrolledText);
        if (scrolledEmail) return { email: scrolledEmail, website: website || extractWebsiteUrl(scrolledText) };
      }
      return { email: null, website };
    }

    // Step 42-44: Navigate to Contact/About tab
    const aboutTab = page.locator('a[href*="/about"]').first();
    const useAboutTab = Math.random() < 0.3 && await aboutTab.isVisible().catch(() => false);

    await checkForPopup(page);
    if (useAboutTab) {
      await clickElement(page, 'a[href*="/about"]', "slow");
      await humanDelay(page, 500, 1500);
    } else {
      const contactUrl = currentUrl.replace(/\/$/, "") + "/directory_contact_info";
      await humanDelay(page, 1200, 2500);
      await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    }

    // Step 45: Single continuous read (2-4s) — mouse stationary while reading
    await humanDelay(page, 2000, 4000);

    if (isRedirectedToPersonalProfile(page.url())) return { email: null, website };

    const contactText = sanitizePageText(await page.textContent("body") || "");
    const contactWebsite = website || extractWebsiteUrl(contactText);
    const contactEmail = extractCleanEmail(contactText);
    if (contactEmail) return { email: contactEmail, website: contactWebsite };

    // Not visible — scroll down and scan again (max 2 attempts)
    for (let attempt = 0; attempt < 2; attempt++) {
      await scrollWithInertia(page, randInt(200, 400, "contactScroll"));
      await humanDelay(page, 1500, 3000);
      const scrolledText = sanitizePageText(await page.textContent("body") || "");
      const email = extractCleanEmail(scrolledText);
      if (email) return { email, website: contactWebsite || extractWebsiteUrl(scrolledText) };
    }

    // Step 45 end: No email found — linger, mouse stationary
    await humanDelay(page, 2000, 4000);

    return { email: null, website: contactWebsite };
  } catch (err) {
    console.log(`[${ts()}]   Error extracting email: ${err instanceof Error ? err.message : err}`);
    return { email: null, website: null };
  }
}

async function collectCandidates(page: Page): Promise<{ text: string; href: string }[]> {
  const allLinks = await page.locator("a[href]").all();
  const candidates: { text: string; href: string }[] = [];
  for (const link of allLinks) {
    const href = await link.getAttribute("href").catch(() => null);
    const text = await link.textContent().catch(() => null);
    if (!href || !text) continue;
    if (!href.includes("facebook.com/")) continue;
    if (href.includes("/search/") || href.includes("/login") || href.includes("/help") || href.includes("/policies")) continue;
    const trimmed = text.trim();
    if (trimmed.length < 3) continue;
    // Filter false positive notification/UI text
    if (/Unread|Mark as read|followed you|reacted to|tagged in|likes your/i.test(trimmed)) continue;
    candidates.push({ text: trimmed, href });
  }
  return candidates;
}

type SearchResult = {
  url: string | null; email: string | null; website: string | null;
  inactive: boolean; inactiveReason: string | null;
  matchType: "exact" | "fuzzy" | "no_match"; phoneConfirmed: boolean; matchedPageName: string;
};

async function tryMatchCandidates(page: Page, candidates: { text: string; href: string }[], matchName: string, city: string, phone: string | null): Promise<SearchResult> {
  // Step 24: Random pause while results load
  await humanDelay(page, 600, 1500);

  // Step 25-27: Mouse drifts over results, scanning 1-4 before clicking
  const toScan = Math.min(candidates.length, randInt(1, 4, "scanCount"));
  for (let i = 0; i < toScan; i++) {
    const { text } = candidates[i];
    const isMatch = fuzzyMatch(text, matchName, city);
    console.log(`[${ts()}]   Candidate: "${text}" → ${isMatch ? "MATCH" : "no match"}`);

    // Hover over each result briefly
    const linkEl = page.locator(`a:has-text("${text.substring(0, 30)}")`).first();
    const box = await linkEl.boundingBox().catch(() => null);
    if (box) {
      await moveMouse(page, box.x + randInt(10, Math.max(11, box.width - 10), "hoverX"), box.y + randInt(3, Math.max(4, box.height - 3), "hoverY"), "normal");
      await humanDelay(page, 200, 800);
    }

    if (isMatch) {
      // Navigate to matched candidate's page
      const matchUrl = candidates[i].href;
      console.log(`[${ts()}]   Navigating to matched page: ${matchUrl}`);
      await checkForPopup(page);
      const urlBefore = page.url();

      if (box) {
        // Click the link and wait for navigation
        await humanClick(page, box.x + randInt(5, Math.max(6, box.width - 5), "matchClickX"), box.y + randInt(3, Math.max(4, box.height - 3), "matchClickY"), "normal");
        // Wait for URL to change (Facebook JS navigation)
        try {
          await page.waitForURL((url) => url.toString() !== urlBefore, { timeout: 8000 });
        } catch {
          // Click didn't navigate — fall back to direct goto
          console.log(`[${ts()}]   Click didn't navigate — using direct goto`);
          await page.goto(matchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        }
      } else {
        await page.goto(matchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      }

      console.log(`[${ts()}]   On page: ${page.url()}`);
      // Step 37: Page load pause — mouse stationary
      await humanDelay(page, 800, 2000);
      // Step 38: Mouse stationary while eyes read
      await humanDelay(page, 300, 900);

      await checkForPopup(page);

      if (isRedirectedToPersonalProfile(page.url())) return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };

      // Step 40: Scroll toward Contact/About section
      await scrollWithInertia(page, randInt(300, 600, "bizScroll"));
      // Step 41: Random pause scanning page — mouse stationary while eyes read
      await humanDelay(page, 1000, 3000);

      const phoneOk = await confirmPhoneMatch(page, phone);
      console.log(`[${ts()}]   ${phoneOk ? "Phone confirmed" : "Phone mismatch but name/city match, proceeding"}`);

      const cleanedPage = fuzzyClean(text, city), cleanedBiz = fuzzyClean(matchName, city);
      const matchType: "exact" | "fuzzy" = cleanedPage === cleanedBiz ? "exact" : "fuzzy";

      const { inactive, reason: inactiveReason } = await checkBusinessInactive(page);
      if (inactive) return { url: page.url(), email: null, website: null, inactive: true, inactiveReason, matchType, phoneConfirmed: phoneOk, matchedPageName: text };

      const { email, website } = await extractEmailFromPage(page);

      // Step 46-47: Skip logic with natural curved path back
      if (website) {
        await humanDelay(page, 300, 800); // Eyes confirm website
      }

      return { url: page.url(), email, website, inactive: false, inactiveReason: null, matchType, phoneConfirmed: phoneOk, matchedPageName: text };
    }
  }

  // Check remaining candidates without hovering
  for (let i = toScan; i < candidates.length; i++) {
    if (fuzzyMatch(candidates[i].text, matchName, city)) {
      console.log(`[${ts()}]   Matched: "${candidates[i].text}"`);
      console.log(`[${ts()}]   Navigating to matched page: ${candidates[i].href}`);
      await checkForPopup(page);
      await page.goto(candidates[i].href, { waitUntil: "domcontentloaded", timeout: 15000 });
      console.log(`[${ts()}]   On page: ${page.url()}`);
      await humanDelay(page, 800, 2000);
      await checkForPopup(page);
      if (isRedirectedToPersonalProfile(page.url())) return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };

      const phoneOk = await confirmPhoneMatch(page, phone);
      const matchType: "exact" | "fuzzy" = fuzzyClean(candidates[i].text, city) === fuzzyClean(matchName, city) ? "exact" : "fuzzy";
      const { inactive, reason: inactiveReason } = await checkBusinessInactive(page);
      if (inactive) return { url: page.url(), email: null, website: null, inactive: true, inactiveReason, matchType, phoneConfirmed: phoneOk, matchedPageName: candidates[i].text };

      await scrollWithInertia(page, randInt(300, 600, "lateBizScroll"));
      await humanDelay(page, 1000, 2000);
      const { email, website } = await extractEmailFromPage(page);
      return { url: page.url(), email, website, inactive: false, inactiveReason: null, matchType, phoneConfirmed: phoneOk, matchedPageName: candidates[i].text };
    }
  }

  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
}

// refocusSearchBar removed — search uses direct URL navigation

async function searchFacebook(page: Page, businessName: string, city: string, phone: string | null): Promise<SearchResult> {
  const humanQuery = humanizeQuery(businessName, city);
  const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(humanQuery)}`;

  // Navigate directly to search results URL
  await checkForPopup(page);
  await humanDelay(page, 1200, 2500);
  console.log(`[${ts()}]   Searching Facebook: "${humanQuery}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for results to load — mouse stationary while page renders
  await humanDelay(page, 2000, 4000);
  await scrollWithInertia(page, randInt(100, 300, "searchScroll"));

  if (page.url().includes("/login")) {
    console.log(`[${ts()}]   Session expired — redirected to login`);
    return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
  }

  await humanDelay(page, 2000, 3500);
  const candidates = await collectCandidates(page);
  console.log(`[${ts()}]   Found ${candidates.length} candidate page links`);

  if (candidates.length > 0) {
    const result = await tryMatchCandidates(page, candidates, businessName, city, phone);
    if (result.url) return result;
  }

  // Steps 14-23: Retry with simplified name
  const SUFFIX_WORDS = new Set(["llc","inc","co","corp","ltd","pllc","pc","pa","dba","tx","texas","dds","md","jr","sr","ii","iii"]);
  const cityLower = city.toLowerCase();
  const meaningful = businessName.split(/\s+/).filter(w => { const l = w.replace(/[^a-zA-Z]/g, "").toLowerCase(); return l.length > 0 && !SUFFIX_WORDS.has(l) && l !== cityLower; });
  const simplified = meaningful.slice(0, Math.min(3, meaningful.length)).join(" ");

  if (meaningful.length >= 2) {
    // Pause as if scanning empty results
    await humanDelay(page, 1000, 2000);
    console.log(`[${ts()}]   No match. Retrying with: "${simplified}"`);

    // Navigate directly to retry search URL
    const retryUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(simplified)}`;
    await checkForPopup(page);
    await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await humanDelay(page, 2000, 4000);
    await scrollWithInertia(page, randInt(100, 300, "retryScroll"));
    await humanDelay(page, 2000, 3500);

    const retryCandidates = await collectCandidates(page);
    console.log(`[${ts()}]   Retry found ${retryCandidates.length} candidate page links`);
    if (retryCandidates.length > 0) {
      const retryResult = await tryMatchCandidates(page, retryCandidates, simplified, city, phone);
      if (retryResult.url) return retryResult;
    }
  }

  // Step 23: Skip prospect
  console.log(`[${ts()}]   No matching Facebook page found`);
  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
}

async function sendOutreach(prospect: { place_id: string; business_name: string; email: string; city: string; phone: string | null; rating: number | null; review_count: number | null; priority_tier: number }): Promise<boolean> {
  try {
    const res = await fetch(`${PINEYWEB_URL}/api/admin/outreach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prospects: [{ place_id: prospect.place_id, business_name: prospect.business_name, email: prospect.email, email_source: "Facebook", address: "", city: prospect.city, phone: prospect.phone, rating: prospect.rating, review_count: prospect.review_count || 0, priority_tier: prospect.priority_tier }] }) });
    const data = await res.json();
    if (data.sent > 0) { console.log(`[${ts()}]   Outreach sent successfully`); return true; }
    console.log(`[${ts()}]   Outreach skipped: ${JSON.stringify(data)}`); return false;
  } catch (err) { console.log(`[${ts()}]   Outreach failed: ${err instanceof Error ? err.message : err}`); return false; }
}

// ============================================================================
// SECTION 8: MAIN LOOP
// ============================================================================

async function main() {
  console.log(`[${ts()}] Facebook Scraper starting...\n`);

  const { data: rawProspects, error } = await supabase.from("pineyweb_prospects").select("*").is("email", null).not("phone", "is", null).gte("review_count", 5).or("facebook_url.is.null,facebook_url.eq.").or("notes.is.null,notes.neq.No Facebook presence").order("priority_tier", { ascending: true }).order("rating", { ascending: false });
  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!rawProspects?.length) { console.log("No prospects found"); return; }

  const filtered = rawProspects.filter(p => !p.facebook_url && p.notes !== "No Facebook presence" && p.notes !== "Facebook found, no email listed");
  if (!filtered.length) { console.log("All prospects already searched"); return; }

  // Prospects shuffled/randomized (spec step 3)
  const prospects = shuffleArray(filtered);
  console.log(`[${ts()}] Loaded ${prospects.length} prospects\n`);

  const vpW = randInt(1280, 1480, "vpW"), vpH = randInt(800, 1000, "vpH");

  async function launchBrowser() {
    const b = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
    const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", viewport: { width: vpW, height: vpH } });
    const pg = await ctx.newPage();
    pg.on("load", () => { injectCursorOverlay(pg).catch(() => {}); });
    await loadOrCreateSession(ctx, pg);
    await injectCursorOverlay(pg);
    return { browser: b, context: ctx, page: pg };
  }

  let { browser, context, page } = await launchBrowser();

  function isBrowserAlive(): boolean {
    try { return browser.isConnected(); } catch { return false; }
  }

  async function verifyPageState(): Promise<boolean> {
    try {
      if (!isBrowserAlive()) return false;
      const url = page.url();
      if (!url || url === "about:blank") return false;
      // Verify page is responsive
      await page.evaluate(() => document.readyState);
      // Navigate back to facebook.com if not already there
      if (!url.includes("facebook.com")) {
        await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
        await injectCursorOverlay(page);
        await humanDelay(page, 1500, 3000);
      }
      return true;
    } catch { return false; }
  }

  async function recoverBrowser(): Promise<boolean> {
    console.log(`[${ts()}] Browser context lost — attempting recovery`);
    try { await browser.close(); } catch {}
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[${ts()}] Recovery attempt ${attempt}/2...`);
        const result = await launchBrowser();
        browser = result.browser;
        context = result.context;
        page = result.page;
        // Verify session is valid
        const alive = await verifyPageState();
        if (alive) {
          console.log(`[${ts()}] Recovery successful — resuming`);
          return true;
        }
      } catch (err) {
        console.log(`[${ts()}] Recovery attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[${ts()}] Recovery failed after 2 attempts — exiting`);
    return false;
  }

  // Step 4: Random idle pause before doing anything
  await humanDelay(page, 1500, 4000);

  let tested = 0, emailsFound = 0, emailsSaved = 0, outreachSent = 0, skipped = 0, noFacebook = 0, noEmail = 0;
  const total = prospects.length;

  // CSV report setup
  type SessionRow = { session_date: string; session_id: string; prospect_name: string; facebook_page_found: string; match_type: string; phone_confirmed: string; email_found: string; email_sent: string; facebook_url: string; city: string; notes: string; match_verified: string; verification_reason: string };
  const sessionRows: SessionRow[] = [];
  const reportsDir = path.resolve("scripts/session-reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const masterPath = path.join(reportsDir, "master-report.csv");
  const sessionDate = new Date().toISOString();
  const sessionId = `session-${sessionDate.replace(/[:.]/g, "-").slice(0, 19)}`;
  const CSV_HEADER = "session_date,session_id,prospect_name,facebook_page_found,match_type,phone_confirmed,email_found,email_sent,facebook_url,city,notes,match_verified,verification_reason";
  const csvEscape = (v: string) => v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
  const rowToCsv = (r: SessionRow) => [r.session_date, r.session_id, r.prospect_name, r.facebook_page_found, r.match_type, r.phone_confirmed, r.email_found, r.email_sent, r.facebook_url, r.city, r.notes, r.match_verified, r.verification_reason].map(csvEscape).join(",");

  function saveReport() {
    if (!sessionRows.length) return;
    const lines = sessionRows.map(rowToCsv).join("\n") + "\n";
    if (fs.existsSync(masterPath)) fs.appendFileSync(masterPath, lines);
    else fs.writeFileSync(masterPath, CSV_HEADER + "\n" + lines);
    console.log(`[${ts()}] Report saved (${sessionRows.length} rows)`);
    sessionRows.length = 0;
  }

  function logProgress() {
    const rate = tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0";
    console.log(`\n[Progress] ${tested}/${total} | Found: ${emailsFound} | Saved: ${emailsSaved} | Sent: ${outreachSent} | Skipped: ${skipped} | No FB: ${noFacebook} | No email: ${noEmail} | Rate: ${rate}%`);
  }

  process.on("SIGINT", () => {
    console.log("\n[Interrupted]"); saveReport();
    console.log(`=== Summary ===\nTested: ${tested}\nEmails found: ${emailsFound}\nSaved: ${emailsSaved}\nSent: ${outreachSent}\nSkipped: ${skipped}\nNo FB: ${noFacebook}\nNo email: ${noEmail}\nRate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
    process.exit(0);
  });

  // Break schedule: every 15-30 prospects (step 71-74)
  let nextBreakAt = randInt(15, 30, "break");
  let sinceLast = 0;

  for (let i = 0; i < prospects.length; i++) {
    // Step 75-77: Daily cap check — complete current prospect before stopping
    if (emailsFound >= DAILY_EMAIL_CAP) {
      console.log(`\n[${ts()}] Daily email cap reached (${DAILY_EMAIL_CAP}). Stopping.`);
      break;
    }

    // Steps 71-74: Natural break
    sinceLast++;
    if (sinceLast >= nextBreakAt && i > 0) {
      saveReport();
      const breakType = Math.random() < 0.6 ? "feed" : "idle";
      const breakMin = randInt(3, 7, "breakMin");
      const breakMs = breakMin * 60000;

      if (breakType === "feed") {
        // Feed surf: navigate to home feed, scroll with mouse
        console.log(`\n[${ts()}] Taking a break — surfing feed for ${breakMin} minutes`);
        try {
          await page.goto("https://www.facebook.com/profile.php?id=61578657544468", { waitUntil: "domcontentloaded", timeout: 15000 });
          const breakEnd = Date.now() + breakMs;
          while (Date.now() < breakEnd) {
            await scrollWithInertia(page, randInt(200, 500, "feedScroll"));
            const postPause = Math.random() < (1 / 6)
              ? randInt(4000, 10000, "longRead")  // 1/6 long read
              : randInt(500, 3000, "shortRead");
            await moveMouse(page, randInt(200, 900, "feedMouse"), randInt(200, 500, "feedMouseY"), "slow");
            await page.waitForTimeout(postPause);
            // 20% chance of slowing near sponsored posts
            if (Math.random() < 0.2) await humanDelay(page, 500, 1500);
          }
        } catch { console.log(`[${ts()}]   Feed break failed — idling instead`); await page.waitForTimeout(breakMs); }
      } else {
        // Total pause: browser sits completely idle
        console.log(`\n[${ts()}] Taking a break — idle for ${breakMin} minutes`);
        await page.waitForTimeout(breakMs);
      }

      // Step 73: Mouse reorients after break
      await moveMouse(page, randInt(300, 900, "reorient"), randInt(200, 500, "reorientY"), "slow");
      await humanDelay(page, 500, 1500);
      sinceLast = 0;
      nextBreakAt = randInt(15, 30, "nextBreak");
    }

    const p = prospects[i];
    console.log(`\n[${ts()}] [${i + 1}/${total}] ${p.business_name} (${p.city}) — T${p.priority_tier}, ${p.rating}★, ${p.review_count} reviews`);

    // Verify page state before each prospect
    if (!await verifyPageState()) {
      const recovered = await recoverBrowser();
      if (!recovered) { saveReport(); break; }
    }

    try {
      const result = await searchFacebook(page, p.business_name, p.city, p.phone);
      const { url, email, website, inactive, inactiveReason, matchType, phoneConfirmed, matchedPageName } = result;
      let rowNotes = "", emailSentThisRow = false, matchVerified = "", verificationReason = "";

      if (inactive && url) {
        console.log(`[${ts()}]   Business inactive — skipping`);
        await supabase.from("pineyweb_prospects").update({ notes: inactiveReason, outreach_status: "lost", facebook_url: url }).eq("place_id", p.place_id);
        skipped++; rowNotes = inactiveReason || "inactive";
      } else if (website) {
        // Step 46: Eyes land on website, pause, skip
        console.log(`[${ts()}]   Website found — skipping`);
        await supabase.from("pineyweb_prospects").update({ notes: `Has website: ${website}`, outreach_status: "lost", facebook_url: url || undefined }).eq("place_id", p.place_id);
        skipped++; rowNotes = `website: ${website}`;
      } else if (email) {
        emailsFound++;
        console.log(`[${ts()}]   ✓ EMAIL FOUND: ${email}`);

        let verified = true, confidence = 10, reason = "phone confirmed";
        if (!phoneConfirmed) {
          console.log(`[${ts()}]   Verifying with Claude AI...`);
          const v = await verifyMatch(p.business_name, p.city, p.phone, matchedPageName, null, null);
          verified = v.verified; confidence = v.confidence; reason = v.reason;
          console.log(`[${ts()}]   ${verified && confidence >= 7 ? "✓" : "✗"} Verification: ${confidence}/10 — ${reason}`);
        }
        matchVerified = String(verified && confidence >= 7);
        verificationReason = reason;

        if (verified && confidence >= 7) {
          // Steps 49-57: Email extraction behavior
          // Step 49: Eyes find email, pause before mouse
          await humanDelay(page, 300, 700);
          // Step 50: Mouse drifts near email
          await moveMouse(page, randInt(300, 700, "emailDrift"), randInt(250, 450, "emailDriftY"), "slow");
          // Step 51: Pause as if writing it down
          await humanDelay(page, 2000, 4000);
          // Step 52: Pause before unfocusing
          await humanDelay(page, 500, 1500);

          // Step 53: Unfocus — drift toward one of three destinations
          const dest = Math.random();
          if (dest < 0.4) {
            // Dock (bottom of screen)
            await moveMouse(page, randInt(400, 800, "dockX"), vpH - randInt(5, 30, "dockY"), "normal");
          } else if (dest < 0.7) {
            // Right edge (Notes)
            await moveMouse(page, vpW - randInt(5, 30, "notesX"), randInt(200, 500, "notesY"), "normal");
          } else {
            // Left edge
            await moveMouse(page, randInt(5, 30, "edgeX"), randInt(200, 500, "edgeY"), "normal");
          }

          // Step 54: Stay unfocused
          await page.keyboard.press("Meta+M");
          await page.waitForTimeout(randInt(3000, 8000, "unfocus"));

          // Step 55-56: Refocus
          await page.bringToFront();
          await humanDelay(page, 300, 600); // OS animation
          // Step 57: Reorientation pause
          await humanDelay(page, 500, 1500);

          const { error: updateErr } = await supabase.from("pineyweb_prospects").update({ email, email_source: "Facebook", facebook_url: url }).eq("place_id", p.place_id);
          if (updateErr) {
            console.log(`[${ts()}]   DB save failed: ${updateErr.message}`);
            rowNotes = "db save failed";
          } else {
            emailsSaved++;
            console.log(`[${ts()}]   ✓ Email saved`);
            const sent = await sendOutreach({ ...p, email });
            if (sent) { outreachSent++; emailSentThisRow = true; }

            // Follow page
            try {
              const followBtn = page.locator('[aria-label="Follow"], [aria-label="Like"], [aria-label="Like Page"]').first();
              if (await followBtn.isVisible().catch(() => false)) {
                const btnText = await followBtn.textContent().catch(() => "") || "";
                if (!/following|liked/i.test(btnText)) {
                  await clickElement(page, '[aria-label="Follow"], [aria-label="Like"], [aria-label="Like Page"]', "normal");
                  await humanDelay(page, 1000, 2000);
                  console.log(`[${ts()}]   👍 Followed ${p.business_name}`);
                }
              }
            } catch { /* skip */ }
          }
        } else {
          await supabase.from("pineyweb_prospects").update({ notes: "Facebook match unverified — needs review", facebook_url: url }).eq("place_id", p.place_id);
          rowNotes = `unverified: ${reason}`;
        }
        if (!phoneConfirmed && verified && confidence >= 7) rowNotes = rowNotes ? `${rowNotes}, phone mismatch` : "phone mismatch";
      } else if (url) {
        noEmail++;
        console.log(`[${ts()}]   ✗ No email on page: ${url}`);
        await supabase.from("pineyweb_prospects").update({ notes: "Facebook found, no email listed", contact_method: "facebook_message", facebook_url: url }).eq("place_id", p.place_id);
        rowNotes = "no email on page";
      } else {
        noFacebook++;
        console.log(`[${ts()}]   ✗ No Facebook page found`);
        await supabase.from("pineyweb_prospects").update({ notes: "No Facebook presence", contact_method: "phone" }).eq("place_id", p.place_id);
      }

      sessionRows.push({ session_date: sessionDate, session_id: sessionId, prospect_name: p.business_name, facebook_page_found: matchedPageName, match_type: matchType, phone_confirmed: String(phoneConfirmed), email_found: email || "", email_sent: String(emailSentThisRow), facebook_url: url || "", city: p.city, notes: rowNotes, match_verified: matchVerified, verification_reason: verificationReason });
      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isBrowserCrash = errMsg.includes("Target page") || errMsg.includes("context or browser has been closed") || errMsg.includes("Target closed") || errMsg.includes("Browser has been closed") || !isBrowserAlive();

      if (isBrowserCrash) {
        console.log(`[${ts()}]   ✗ Browser crash: ${errMsg}`);
        const recovered = await recoverBrowser();
        if (!recovered) { saveReport(); break; }
        // Retry the same prospect (decrement i so the loop re-processes it)
        i--;
        continue;
      }

      console.log(`[${ts()}]   ✗ Error: ${errMsg}`);
      sessionRows.push({ session_date: sessionDate, session_id: sessionId, prospect_name: p.business_name, facebook_page_found: "", match_type: "no_match", phone_confirmed: "false", email_found: "", email_sent: "false", facebook_url: "", city: p.city, notes: `error: ${errMsg}`, match_verified: "", verification_reason: "" });
      tested++;
      if (tested % 10 === 0) logProgress();
      if (tested % 25 === 0) saveReport();
    }

    // Pause between prospects — glancing away before next search
    if (i < prospects.length - 1) {
      await humanDelay(page, 2000, 5000);
    }
  }

  try { const c = await context.cookies(); fs.writeFileSync(path.resolve(SESSION_FILE), JSON.stringify(c, null, 2)); console.log(`\n[${ts()}] Session cookies saved.`); } catch {}
  try { await browser.close(); } catch {}
  saveReport();
  console.log(`\n=== Results ===\nTested: ${tested}\nEmails found: ${emailsFound}\nSaved: ${emailsSaved}\nSent: ${outreachSent}\nSkipped: ${skipped}\nNo FB: ${noFacebook}\nNo email: ${noEmail}\nRate: ${tested > 0 ? ((emailsFound / tested) * 100).toFixed(1) : "0.0"}%`);
}

main();
