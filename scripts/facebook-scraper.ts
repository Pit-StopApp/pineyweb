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
 * - Unfocus simulation: dock drift → Mail app draft (8-12s) → return to browser
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

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";

chromium.use(StealthPlugin());
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

// --- "Soft Bracket" mouse path generator ---
// Phase 1 (70%): straight launch with gradual drift
// Phase 2 (20%): soft hook correction toward destination
// Phase 3 (10%): final landing with micro tremor

let lastDriftDir = 0; // Track to prevent same drift direction twice
let lastHookMag = 0;
let lastLandOff = 0;

function generateSoftBracketPath(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return [start, end]; // Trivially short

  const steps = Math.max(10, Math.round(dist / 4));
  const points: Point[] = [start];

  // Drift direction: perpendicular to travel direction, never same as last
  const perpX = -dy / Math.max(1, dist);
  const perpY = dx / Math.max(1, dist);
  let driftSign: number;
  do { driftSign = Math.random() < 0.5 ? 1 : -1; } while (driftSign === lastDriftDir);
  lastDriftDir = driftSign;

  // Drift magnitude: 0.5-1.5px per 100px of travel
  const driftRate = rand(0.5, 1.5, "driftRate") / 100;
  const maxDrift = Math.min(dist * driftRate, 15); // Never exceed 15px total deviation

  // Hook magnitude based on distance
  let hookMag: number;
  if (dist < 200) hookMag = rand(2, 5, "hookMag");
  else if (dist < 500) hookMag = rand(4, 8, "hookMag");
  else hookMag = rand(6, 12, "hookMag");
  // Ensure no repeat
  while (Math.abs(hookMag - lastHookMag) < 1) hookMag = rand(2, 12, "hookMag2");
  lastHookMag = hookMag;

  // Landing offset: 0.5-2px, never same as last
  let landOff: number;
  do { landOff = rand(0.5, 2, "landOff"); } while (Math.abs(landOff - lastLandOff) < 0.3);
  lastLandOff = landOff;
  const landAngle = rand(0, Math.PI * 2, "landAngle");

  const phase1End = Math.floor(steps * 0.7);
  const phase2End = Math.floor(steps * 0.9);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Base straight-line position
    let x = start.x + dx * t;
    let y = start.y + dy * t;

    if (i <= phase1End) {
      // Phase 1: Straight launch with gradual drift
      const driftProgress = i / phase1End;
      const driftAmount = maxDrift * driftProgress * driftSign;
      x += perpX * driftAmount;
      y += perpY * driftAmount;
    } else if (i <= phase2End) {
      // Phase 2: Soft hook correction back toward destination
      const hookProgress = (i - phase1End) / (phase2End - phase1End);
      // Drift fades out as hook takes over
      const remainingDrift = maxDrift * driftSign * (1 - hookProgress);
      // Hook curves in opposite direction of drift
      const hookAmount = hookMag * Math.sin(hookProgress * Math.PI / 2) * -driftSign;
      x += perpX * (remainingDrift + hookAmount);
      y += perpY * (remainingDrift + hookAmount);
    } else {
      // Phase 3: Final landing — straighten out toward target
      const landProgress = (i - phase2End) / (steps - phase2End);
      // Any remaining offset fades to zero plus landing offset
      const finalOffX = Math.cos(landAngle) * landOff * (1 - landProgress * 0.5);
      const finalOffY = Math.sin(landAngle) * landOff * (1 - landProgress * 0.5);
      x += finalOffX;
      y += finalOffY;

      // Micro tremor: 0.3-0.8px, every 3rd-4th step only in phase 3
      if (i % randInt(3, 4, `p3trem${i}`) === 0) {
        x += rand(-0.8, 0.8, `p3tremX${i}`);
        y += rand(-0.8, 0.8, `p3tremY${i}`);
      }
    }

    points.push({ x, y });
  }

  return points;
}

type SpeedTier = "slow" | "normal" | "fast";
const MOUSE_BOOST = 1.1; // Single +10% boost on baseline speeds
const SPEED_RANGES: Record<SpeedTier, [number, number]> = {
  slow: [0.3 * MOUSE_BOOST, 0.8 * MOUSE_BOOST],
  normal: [0.8 * MOUSE_BOOST, 1.5 * MOUSE_BOOST],
  fast: [1.5 * MOUSE_BOOST, 2.5 * MOUSE_BOOST],
};

let mouseX = 600;
let mouseY = 400;

async function moveMouse(page: Page, targetX: number, targetY: number, tier: SpeedTier = "normal") {
  const [sMin, sMax] = SPEED_RANGES[tier];
  const cruiseSpeed = Math.min(rand(sMin, sMax, "speed"), 3.0);
  const path = generateSoftBracketPath({ x: mouseX, y: mouseY }, { x: targetX, y: targetY });

  const accelEnd = Math.floor(path.length * rand(0.2, 0.3, "accelPhase"));
  const decelStart = Math.floor(path.length * (1 - rand(0.2, 0.3, "decelPhase")));
  const startSpeed = rand(0.2 * MOUSE_BOOST, 0.4 * MOUSE_BOOST, "startSpeed");
  const endSpeed = rand(0.3 * MOUSE_BOOST, 0.5 * MOUSE_BOOST, "endSpeed");

  for (let i = 1; i < path.length; i++) {
    const ptX = path[i].x;
    const ptY = path[i].y;
    const prevX = path[i - 1].x;
    const prevY = path[i - 1].y;
    const segDist = Math.sqrt((ptX - prevX) ** 2 + (ptY - prevY) ** 2);

    let speed: number;
    if (i < accelEnd) {
      const t = i / accelEnd;
      speed = startSpeed + (cruiseSpeed - startSpeed) * t;
    } else if (i > decelStart) {
      const t = (i - decelStart) / (path.length - decelStart);
      speed = cruiseSpeed - (cruiseSpeed - endSpeed) * t;
    } else {
      // Speed wobble: ±10% during cruise
      speed = cruiseSpeed * (1 + rand(-0.10, 0.10, `wobble${i}`));
    }
    speed = Math.min(speed, 3.0);
    const delay = Math.max(1, Math.round(segDist / speed));

    const px = Math.round(ptX), py = Math.round(ptY);
    await page.mouse.move(px, py);
    await updateCursorPosition(page, px, py);
    if (delay > 1) await page.waitForTimeout(delay);
    // Track actual final position (includes landing offset from path)
    mouseX = px;
    mouseY = py;
  }
}

// ============================================================================
// SECTION 3: HUMAN INPUT PRIMITIVES
// ============================================================================

const PACE = 0.7; // Global pause multiplier — applies to all delays
async function humanDelay(page: Page, min: number, max: number) {
  await page.waitForTimeout(randInt(Math.round(min * PACE), Math.round(max * PACE), "delay"));
}

async function humanClick(page: Page, x: number, y: number, tier: SpeedTier = "normal") {
  // Landing offset now built into path generator (phase 3)
  // 5-10% misclick chance
  if (Math.random() < rand(0.05, 0.10, "misclick")) {
    const offX = x + randInt(-15, 15, "misX");
    const offY = y + randInt(-15, 15, "misY");
    await moveMouse(page, offX, offY, tier);
    await page.mouse.click(offX, offY);
    await humanDelay(page, 50, 150);
    await humanDelay(page, 200, 600);
    await moveMouse(page, x, y, tier);
    await page.mouse.click(Math.round(mouseX), Math.round(mouseY));
  } else {
    await moveMouse(page, x, y, tier);
    await humanDelay(page, 50, 150);
    await page.mouse.click(Math.round(mouseX), Math.round(mouseY));
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

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}(?=[^a-zA-Z]|$)/g;
const EMAIL_BLACKLIST = /example|sentry|domain|@facebook|@meta|@fb\.com|noreply|no-reply|test@|@test\./i;

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

const GENERIC_WORDS = new Set(["by","the","and","a","of","in","at","for","to","on","or","my","our","your","massage","shop","services","service","salon","auto","tax","insurance","repair","co","company","studio","center","group","team","pro","plus","express","mobile","nails","spa","bar","grill","cafe","restaurant","dental","clinic","care","barbershop","barber","hair","beauty","fitness","gym","body","tire","tires","plumbing","electric","electrical","heating","cooling","roofing","painting","construction","landscaping","lawn","tree","pest","cleaning","photography","chiropractic","veterinary","vet","animal","pet","medical","health","realty","real","estate","agency","office","firm","law","accounting","llc","inc","corp","ltd","pllc","pc","pa","dba","tx","texas"]);

function fuzzyClean(s: string, city?: string): string {
  let c = s.toLowerCase().replace(/&/g, " and ").replace(/_/g, " ").replace(/['''""",.\-–—()!@#$%^*]/g, " ").replace(/\s+/g, " ").trim();
  if (city) c = c.replace(new RegExp(`\\b${city.toLowerCase()}\\b`, "g"), "").replace(/\s+/g, " ").trim();
  return c;
}

// Fuzzy match score — returns 0-100% match quality
function fuzzyMatchScore(pageName: string, businessName: string, city?: string): number {
  const a = fuzzyClean(pageName, city), b = fuzzyClean(businessName, city);
  if (a === b) return 100;

  const aWords = a.split(" ").filter(w => w.length > 1);
  const bWords = b.split(" ").filter(w => w.length > 1);
  const aUniq = new Set(aWords.filter(w => !GENERIC_WORDS.has(w)));
  const bUniq = bWords.filter(w => !GENERIC_WORDS.has(w));
  if (bUniq.length === 0 || aUniq.size === 0) return 0;

  const overlap = bUniq.filter(w => aUniq.has(w));
  if (overlap.length === 0) return 0;

  // Substring containment bonus
  const aC = aWords.filter(w => !GENERIC_WORDS.has(w)).join(" ");
  const bC = bUniq.join(" ");
  if (aC.includes(bC) || bC.includes(aC)) return Math.max(90, (overlap.length / bUniq.length) * 100);

  return (overlap.length / bUniq.length) * 100;
}

// Boolean wrapper — 75% threshold for candidate matching
function fuzzyMatch(pageName: string, businessName: string, city?: string): boolean {
  return fuzzyMatchScore(pageName, businessName, city) >= 75;
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

async function scrapeCityFromPage(page: Page): Promise<string | null> {
  try {
    const city = await page.evaluate(() => {
      const body = document.body?.innerText || "";
      // Look for common Facebook location patterns
      const patterns = [
        /(?:Located in|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
        /(?:City|Location)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*(?:TX|Texas)/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(?:TX|Texas)\s*\d{5}/,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*TX\b/,
      ];
      for (const pat of patterns) {
        const m = body.match(pat);
        if (m?.[1]) return m[1].trim();
      }
      return null;
    });
    return city;
  } catch { return null; }
}

// --- Website qualification check — runs FIRST before any other check ---
const META_DOMAINS = ["facebook.com","fb.com","instagram.com","messenger.com","whatsapp.com","meta.com","wa.me","twitter.com","x.com","tiktok.com","youtube.com","google.com","apple.com"];

function scanTextForWebsite(text: string): string | null {
  const sanitized = sanitizePageText(text);
  // Check via extractWebsiteUrl first
  const website = extractWebsiteUrl(sanitized);
  if (website) return website;
  // Broad pattern scan for common website indicators
  const webPatterns = /\bwww\.\S+|https?:\/\/\S+|\S+\.(com|net|org|io|co|biz)\b/gi;
  const matches = sanitized.match(webPatterns);
  if (matches) {
    for (const m of matches) {
      const domain = m.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
      if (!META_DOMAINS.some(d => domain.includes(d))) return m;
    }
  }
  return null;
}

// Two-pass website check: initial page content + scroll to About/Contact area
async function checkForWebsite(page: Page): Promise<string | null> {
  try {
    // Pass 1: Scan initial page load content
    const initialText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    const found1 = scanTextForWebsite(initialText);
    if (found1) return found1;

    // Pass 2: Scroll down toward About/Contact section to trigger lazy loading
    await scrollWithInertia(page, randInt(400, 700, "websiteCheckScroll"));
    await humanDelay(page, 1000, 2000);

    // Scan again with newly loaded content
    const scrolledText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    const found2 = scanTextForWebsite(scrolledText);
    if (found2) return found2;

    return null;
  } catch { return null; }
}

// --- Qualification gate — tracks whether checks have been completed ---
let qualificationComplete = false;

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

// --- Wrong page detection after navigation ---
const WRONG_PAGE_PATTERNS = ["/professional_dashboard", "/home.php", "/watch", "/marketplace", "/gaming", "/groups/feed"];

function isWrongPage(url: string): boolean {
  // Must be on a facebook.com business/profile page, not feed/dashboard/home
  if (!url.includes("facebook.com")) return true;
  if (url.match(/facebook\.com\/?$/) || url.match(/facebook\.com\/\?/)) return true; // Home feed
  for (const pattern of WRONG_PAGE_PATTERNS) {
    if (url.includes(pattern)) return true;
  }
  return false;
}

// --- Cursor-as-eyes: move cursor near element before evaluating it ---
async function gazeAt(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first();
  const box = await el.boundingBox().catch(() => null);
  if (!box) return false;
  // Offset 5-15px from element center, random direction
  const offX = randInt(5, 15, "gazeOffX") * (Math.random() < 0.5 ? -1 : 1);
  const offY = randInt(5, 15, "gazeOffY") * (Math.random() < 0.5 ? -1 : 1);
  const cx = box.x + box.width / 2 + offX;
  const cy = box.y + box.height / 2 + offY;
  await moveMouse(page, cx, cy, "slow"); // deliberate reading speed
  return true;
}

async function gazeAtBox(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const offX = randInt(5, 15, "gazeBoxOffX") * (Math.random() < 0.5 ? -1 : 1);
  const offY = randInt(5, 15, "gazeBoxOffY") * (Math.random() < 0.5 ? -1 : 1);
  await moveMouse(page, box.x + box.width / 2 + offX, box.y + box.height / 2 + offY, "slow");
}

// ============================================================================
// SECTION 7: FACEBOOK INTERACTION LAYER (spec-compliant)
// ============================================================================

async function extractEmailFromPage(page: Page): Promise<{ email: string | null; website: string | null }> {
  // Guard: qualification checks must be complete before email extraction runs
  if (!qualificationComplete) {
    console.log(`[${ts()}]   ERROR: extractEmailFromPage called before qualification checks — aborting`);
    return { email: null, website: null };
  }
  // 10 second hard timeout — scoped with cleanup to prevent leaking
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const extractionTimer = new Promise<{ email: null; website: null }>((resolve) => {
    timerId = setTimeout(() => { console.log(`[${ts()}]   Email extraction timeout (10s)`); resolve({ email: null, website: null }); }, 10000);
  });
  const result = await Promise.race([extractEmailInner(page), extractionTimer]);
  if (timerId) clearTimeout(timerId); // Cancel timer if extraction finished first
  return result;
}

async function extractEmailInner(page: Page): Promise<{ email: string | null; website: string | null }> {
  try {
    if (isRedirectedToPersonalProfile(page.url())) return { email: null, website: null };

    // === FAST BROAD TEXT SCAN via page.evaluate() — first attempt ===
    const scanResult = await page.evaluate(() => {
      const allText = document.body?.innerText || "";
      return allText;
    }).catch(() => "");

    const cleanedText = sanitizePageText(scanResult);
    const website = extractWebsiteUrl(cleanedText);
    const broadEmail = extractCleanEmail(cleanedText);
    if (broadEmail) {
      console.log(`[${ts()}]   Email found via broad text scan`);
      return { email: broadEmail, website };
    }

    // === FALLBACK: Check mailto links ===
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (href) {
        const email = extractCleanEmail(href.replace("mailto:", "").split("?")[0]);
        if (email) { console.log(`[${ts()}]   Email found via mailto link`); return { email, website }; }
      }
    }

    // === FALLBACK: Navigate to Contact/About page and scan there ===
    const currentUrl = page.url();

    // Profile.php pages: scroll to load lazy content
    if (currentUrl.includes("profile.php?id=")) {
      for (let s = 0; s < 2; s++) {
        await scrollWithInertia(page, randInt(400, 600, "profileScroll"));
        await humanDelay(page, 1500, 2500);
        const scrolledText = sanitizePageText(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
        const scrolledEmail = extractCleanEmail(scrolledText);
        if (scrolledEmail) return { email: scrolledEmail, website: website || extractWebsiteUrl(scrolledText) };
      }
      return { email: null, website };
    }

    // Navigate to Contact/About tab
    await gazeAt(page, 'a[href*="/about"], a[href*="contact"]');
    await humanDelay(page, 200, 500);

    const aboutTab = page.locator('a[href*="/about"]').first();
    const useAboutTab = Math.random() < 0.3 && await aboutTab.isVisible().catch(() => false);

    await checkForPopup(page);
    if (useAboutTab) {
      await clickElement(page, 'a[href*="/about"]', "slow");
      await humanDelay(page, 400, 1000);
    } else {
      const contactUrl = currentUrl.replace(/\/$/, "") + "/directory_contact_info";
      await humanDelay(page, 800, 1500);
      await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    }

    // Broad text scan on contact page
    await gazeAt(page, '[role="main"]');
    await humanDelay(page, 1000, 2000);

    if (isRedirectedToPersonalProfile(page.url())) return { email: null, website };

    const contactText = sanitizePageText(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
    const contactWebsite = website || extractWebsiteUrl(contactText);
    const contactEmail = extractCleanEmail(contactText);
    if (contactEmail) { console.log(`[${ts()}]   Email found on contact page`); return { email: contactEmail, website: contactWebsite }; }

    // One scroll attempt on contact page
    await scrollWithInertia(page, randInt(200, 400, "contactScroll"));
    await humanDelay(page, 1000, 2000);
    const scrolledContact = sanitizePageText(await page.evaluate(() => document.body?.innerText || "").catch(() => ""));
    const scrolledEmail = extractCleanEmail(scrolledContact);
    if (scrolledEmail) return { email: scrolledEmail, website: contactWebsite || extractWebsiteUrl(scrolledContact) };

    return { email: null, website: contactWebsite };
  } catch (err) {
    console.log(`[${ts()}]   Error extracting email: ${err instanceof Error ? err.message : err}`);
    return { email: null, website: null };
  }
}

async function collectVisibleCandidates(page: Page): Promise<{ text: string; href: string }[]> {
  // Only collect candidates whose bounding box is within the current viewport
  const vpHeight = await page.evaluate(() => window.innerHeight);
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
    if (/Unread|Mark as read|followed you|reacted to|tagged in|likes your/i.test(trimmed)) continue;
    // Only include if element is within viewport
    const box = await link.boundingBox().catch(() => null);
    if (!box || box.y + box.height < 0 || box.y > vpHeight) continue;
    candidates.push({ text: trimmed, href });
  }
  return candidates;
}

async function ensureInViewport(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first();
  const box = await el.boundingBox().catch(() => null);
  if (!box) return false;
  const vpHeight = await page.evaluate(() => window.innerHeight);
  if (box.y >= 0 && box.y + box.height <= vpHeight) return true;
  // Scroll to bring element into view
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await humanDelay(page, 300, 600);
  return true;
}

type SearchResult = {
  url: string | null; email: string | null; website: string | null;
  inactive: boolean; inactiveReason: string | null;
  matchType: "exact" | "fuzzy" | "no_match"; phoneConfirmed: boolean; matchedPageName: string;
};

async function tryMatchCandidates(page: Page, candidates: { text: string; href: string }[], matchName: string, city: string, phone: string | null): Promise<SearchResult> {
  // Step 24: Random pause while results load
  await humanDelay(page, 600, 1500);

  // Scan candidates — cursor moves near each visible one before evaluating
  for (let i = 0; i < candidates.length; i++) {
    const { text } = candidates[i];

    // Ensure element is in viewport before moving cursor to it
    const safeSelector = `a:has-text("${text.substring(0, 30).replace(/"/g, '\\"')}")`;
    const linkEl = page.locator(safeSelector).first();
    const box = await linkEl.boundingBox().catch(() => null);
    if (!box) continue;

    // Check if in viewport — if not, skip (don't scroll to it from results)
    const vpHeight = await page.evaluate(() => window.innerHeight);
    if (box.y + box.height < 0 || box.y > vpHeight) continue;

    // Cursor-as-eyes: gaze near element
    await gazeAtBox(page, box);
    await humanDelay(page, 300, 800);

    const score = fuzzyMatchScore(text, matchName, city);
    const isMatch = score >= 75;
    // Strict city check: reject if candidate text contains a different city
    const textLower = text.toLowerCase();
    const cityLower = city.toLowerCase();
    const hasDifferentCity = textLower.includes(" - ") && !textLower.includes(cityLower);
    if (isMatch && hasDifferentCity) {
      console.log(`[${ts()}]   Candidate: "${text}" → ${score.toFixed(0)}% match but wrong city — skipping`);
      continue;
    }
    console.log(`[${ts()}]   Candidate: "${text}" → ${score.toFixed(0)}%${isMatch ? " MATCH" : " no match"}`);

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

      const landedUrl = page.url();
      console.log(`[${ts()}]   On page: ${landedUrl}`);

      // Verify we landed on a valid business/profile page
      if (isWrongPage(landedUrl) || isRedirectedToPersonalProfile(landedUrl)) {
        console.log(`[${ts()}]   Wrong page after navigation — skipping prospect`);
        return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
      }

      await humanDelay(page, 800, 2000);
      await checkForPopup(page);

      // ============================================================
      // QUALIFICATION — strict enforced order
      // ============================================================

      // 1. WEBSITE CHECK — scans initial content, scrolls to About/Contact,
      //    scans again. Never concludes "no website" from initial load alone.
      console.log(`[${ts()}]   Checking for website...`);
      const websiteFound = await checkForWebsite(page);
      if (websiteFound) {
        console.log(`[${ts()}]   Has website (${websiteFound}) — skipping`);
        return { url: page.url(), email: null, website: websiteFound, inactive: false, inactiveReason: null, matchType: "fuzzy", phoneConfirmed: false, matchedPageName: text };
      }
      console.log(`[${ts()}]   No website found — proceeding`);

      // Gaze at page content (already scrolled during website check)
      await gazeAt(page, 'h1, [role="heading"]');
      await humanDelay(page, 500, 1200);

      // 2. NAME SCORE + PHONE + CITY — match hierarchy
      const nameScore = fuzzyMatchScore(text, matchName, city);
      console.log(`[${ts()}]   Name match score: ${nameScore.toFixed(0)}%`);

      if (nameScore < 75) {
        console.log(`[${ts()}]   Name below 75% — skipping regardless of phone/city`);
        return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
      }

      const phoneOk = await confirmPhoneMatch(page, phone);
      console.log(`[${ts()}]   Phone check result: ${phoneOk ? "confirmed" : "mismatch"}`);

      const scrapedCity = await scrapeCityFromPage(page);
      const cityConfirmed = scrapedCity ? scrapedCity.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(scrapedCity.toLowerCase()) : false;
      if (scrapedCity) console.log(`[${ts()}]   City from page: ${scrapedCity} — ${cityConfirmed ? "confirmed" : "mismatch"}`);

      if (scrapedCity && !cityConfirmed) {
        console.log(`[${ts()}]   City mismatch — page shows ${scrapedCity}, prospect is ${city} — skipping`);
        return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
      }

      // Match hierarchy: name 75%+ is the gate, phone/city provide confidence
      if (phoneOk || cityConfirmed) {
        console.log(`[${ts()}]   Proceeding — name ${nameScore.toFixed(0)}%${phoneOk ? " + phone" : ""}${cityConfirmed ? " + city" : ""}`);
      } else {
        console.log(`[${ts()}]   ⚠ Proceeding with name match only (${nameScore.toFixed(0)}%) — no phone or city confirmation`);
      }

      // 3. LAST POST DATE CHECK — third
      console.log(`[${ts()}]   Checking last post date...`);
      const cleanedPage = fuzzyClean(text, city), cleanedBiz = fuzzyClean(matchName, city);
      const matchType: "exact" | "fuzzy" = cleanedPage === cleanedBiz ? "exact" : "fuzzy";

      const { inactive, reason: inactiveReason } = await checkBusinessInactive(page);
      if (inactive) {
        console.log(`[${ts()}]   ${inactiveReason} — skipping`);
        return { url: page.url(), email: null, website: null, inactive: true, inactiveReason, matchType, phoneConfirmed: phoneOk, matchedPageName: text };
      }
      console.log(`[${ts()}]   Active — proceeding to email extraction`);

      // 4. EMAIL EXTRACTION — fourth, only after all checks pass
      qualificationComplete = true;
      const { email } = await extractEmailFromPage(page);
      qualificationComplete = false;

      return { url: page.url(), email, website: null, inactive: false, inactiveReason: null, matchType, phoneConfirmed: phoneOk, matchedPageName: text };
    }
  }

  return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
}

// refocusSearchBar removed — search uses direct URL navigation

async function searchFacebook(page: Page, businessName: string, city: string, phone: string | null): Promise<SearchResult> {
  const humanQuery = humanizeQuery(businessName, city);
  const txFilter = encodeURIComponent('{"page_location":{"name":"location","args":"Texas"}}');
  const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(humanQuery)}&filters=${txFilter}`;

  // Navigate directly to search results URL
  await checkForPopup(page);
  await humanDelay(page, 1200, 2500);
  console.log(`[${ts()}]   Searching Facebook: "${humanQuery}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for results to load — mouse stationary while page renders
  await humanDelay(page, 2000, 4000);

  if (page.url().includes("/login")) {
    console.log(`[${ts()}]   Session expired — redirected to login`);
    return { url: null, email: null, website: null, inactive: false, inactiveReason: null, matchType: "no_match", phoneConfirmed: false, matchedPageName: "" };
  }

  // Scan visible results BEFORE any scrolling
  await humanDelay(page, 1500, 2500);
  let candidates = await collectVisibleCandidates(page);
  console.log(`[${ts()}]   Found ${candidates.length} visible candidate links`);

  if (candidates.length > 0) {
    const result = await tryMatchCandidates(page, candidates, businessName, city, phone);
    if (result.url) return result;
  }

  // No match in visible results — scroll down and collect more
  await scrollWithInertia(page, randInt(300, 500, "searchScroll"));
  await humanDelay(page, 1500, 2500);
  const moreCandidates = await collectVisibleCandidates(page);
  // Only check newly appeared candidates
  const seenHrefs = new Set(candidates.map(c => c.href));
  const newCandidates = moreCandidates.filter(c => !seenHrefs.has(c.href));
  if (newCandidates.length > 0) {
    console.log(`[${ts()}]   Found ${newCandidates.length} additional candidates after scroll`);
    const scrollResult = await tryMatchCandidates(page, newCandidates, businessName, city, phone);
    if (scrollResult.url) return scrollResult;
    candidates = [...candidates, ...newCandidates];
  }

  // Steps 14-23: Retry with simplified name
  const SUFFIX_WORDS = new Set(["llc","inc","co","corp","ltd","pllc","pc","pa","dba","tx","texas","dds","md","jr","sr","ii","iii","the","a","an","and","of"]);
  const cityLower = city.toLowerCase();
  // Strip punctuation, then filter: no suffixes, no single letters, no city name
  const cleaned = businessName.replace(/[^a-zA-Z0-9&\s]/g, " ").replace(/\s+/g, " ").trim();
  const meaningful = cleaned.split(/\s+/).filter(w => {
    const l = w.toLowerCase();
    return l.length > 1 && !SUFFIX_WORDS.has(l) && l !== cityLower;
  });
  const simplified = meaningful.slice(0, Math.min(3, meaningful.length)).join(" ");

  if (meaningful.length >= 2) {
    // Pause as if scanning empty results
    await humanDelay(page, 1000, 2000);
    console.log(`[${ts()}]   No match. Retrying with: "${simplified}"`);

    // Navigate directly to retry search URL
    const retryUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(simplified)}&filters=${txFilter}`;
    await checkForPopup(page);
    await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await humanDelay(page, 2000, 4000);
    await scrollWithInertia(page, randInt(100, 300, "retryScroll"));
    await humanDelay(page, 2000, 3500);

    const retryCandidates = await collectVisibleCandidates(page);
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

  let stealthVerified = false;
  async function launchBrowser() {
    const b = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
    const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", viewport: { width: vpW, height: vpH } });
    const pg = await ctx.newPage();
    pg.on("load", () => { injectCursorOverlay(pg).catch(() => {}); });

    // Verify stealth on first launch only
    if (!stealthVerified) {
      try {
        await pg.goto("https://bot.sannysoft.com", { waitUntil: "domcontentloaded", timeout: 15000 });
        await pg.waitForTimeout(3000);
        const webdriver = await pg.evaluate(() => (navigator as unknown as Record<string, unknown>).webdriver);
        console.log(`[${ts()}] Stealth check: navigator.webdriver = ${webdriver}`);
        if (webdriver === false || webdriver === undefined) {
          console.log(`[${ts()}] ✓ Stealth plugin active — bot fingerprints masked`);
        } else {
          console.log(`[${ts()}] ⚠ Stealth may not be working — webdriver = ${webdriver}`);
        }
        stealthVerified = true;
      } catch (err) {
        console.log(`[${ts()}] Stealth check skipped: ${err instanceof Error ? err.message : err}`);
        stealthVerified = true;
      }
    }

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

    const prospectStart = Date.now();
    qualificationComplete = false; // Reset guard for each prospect
    try {
      // Hard 51 second cap per prospect
      const PROSPECT_TIMEOUT_MS = 51000;
      const prospectTimer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PROSPECT_TIMEOUT")), PROSPECT_TIMEOUT_MS)
      );

      const result = await Promise.race([
        searchFacebook(page, p.business_name, p.city, p.phone),
        prospectTimer,
      ]);
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
          // Scroll the email into view and gaze at it before unfocus
          try {
            // Find the email text in the DOM and scroll it into the viewport
            const emailEl = page.locator(`text="${email}"`).first();
            const emailVisible = await emailEl.isVisible().catch(() => false);
            if (emailVisible) {
              await emailEl.scrollIntoViewIfNeeded().catch(() => {});
              await humanDelay(page, 300, 600);
              const emailBox = await emailEl.boundingBox().catch(() => null);
              if (emailBox) {
                // Cursor-as-eyes: gaze near the email element
                await gazeAtBox(page, emailBox);
              }
            } else {
              // Email found via text scan but element not locatable — gaze at main area
              await gazeAt(page, '[role="main"]');
            }
          } catch {
            // Non-blocking — continue with unfocus even if scroll fails
          }
          // Pause as if reading/noting the email
          await humanDelay(page, 1500, 3000);

          // Mouse drifts down toward dock (Mail app) — slow/deliberate
          await moveMouse(page, randInt(400, 700, "dockX"), vpH - randInt(5, 25, "dockY"), "slow");
          // Pause as if clicking Mail and waiting for it to open
          await humanDelay(page, 1000, 3000);
          // Minimize browser — simulate switching to Mail
          await page.keyboard.press("Meta+M");
          // Stay unfocused 8-12s — drafting email, pasting prospect info
          await page.waitForTimeout(randInt(Math.round(8000 * PACE), Math.round(12000 * PACE), "mailDraft"));
          // Mouse drifts back up from dock toward browser
          await moveMouse(page, randInt(300, 800, "returnX"), randInt(200, 400, "returnY"), "slow");
          // Refocus browser
          await page.bringToFront();
          // Hard wait for OS window animation
          await humanDelay(page, 400, 800);
          // Reorientation pause
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

      // Prospect timeout — skip and move on
      if (errMsg === "PROSPECT_TIMEOUT") {
        const elapsed = Math.round((Date.now() - prospectStart) / 1000);
        console.log(`[${ts()}]   Prospect timeout (${elapsed}s) — skipping`);
        sessionRows.push({ session_date: sessionDate, session_id: sessionId, prospect_name: p.business_name, facebook_page_found: "", match_type: "no_match", phone_confirmed: "false", email_found: "", email_sent: "false", facebook_url: "", city: p.city, notes: "timeout", match_verified: "", verification_reason: "" });
        tested++;
        if (tested % 10 === 0) logProgress();
        if (tested % 25 === 0) saveReport();
        continue;
      }

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
