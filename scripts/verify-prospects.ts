/**
 * Prospect Verification — Website Check
 *
 * Visits each undelivered prospect's Facebook page anonymously,
 * checks for a website, marks as 'lost' if found. Verification only —
 * does not send emails or modify any field except outreach_status.
 *
 * Usage: npx tsx scripts/verify-prospects.ts
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";

chromium.use(StealthPlugin());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

// ============================================================================
// POPUP DISMISSAL
// ============================================================================

async function dismissPopup(page: Page): Promise<void> {
  try {
    const hasLoginForm = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[name="email"], input[type="email"], input[placeholder*="email" i], input[placeholder*="phone" i]');
      for (const input of inputs) {
        if (input.closest('[role="dialog"], [aria-modal="true"]')) return true;
      }
      const buttons = document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button');
      for (const btn of buttons) {
        if (/^log\s*in$/i.test(btn.textContent?.trim() || "")) return true;
      }
      return false;
    }).catch(() => false);

    if (hasLoginForm) {
      const closeBtn = page.locator('[aria-label="Close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(500);
        return;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      return;
    }

    const dialogClose = page.locator('[role="dialog"] [aria-label="Close"], [aria-modal="true"] [aria-label="Close"]').first();
    if (await dialogClose.isVisible().catch(() => false)) {
      await dialogClose.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  } catch { /* non-blocking */ }
}

// ============================================================================
// WEBSITE DETECTION
// ============================================================================

const EXCLUDED_DOMAINS = ["facebook.com", "fb.com", "instagram.com", "messenger.com", "meta.com", "wa.me", "whatsapp.com", "linkedin.com"];

function findWebsite(text: string): string | null {
  const patterns = /\bwww\.\S+|https?:\/\/\S+|\S+\.(com|net|org|io|co|biz)\b/gi;
  const matches = text.match(patterns);
  if (!matches) return null;
  for (const m of matches) {
    const domain = m.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    if (!EXCLUDED_DOMAINS.some(d => domain.includes(d))) return m;
  }
  return null;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`[${ts()}] Prospect Verification — Website Check\n`);

  // Fetch undelivered prospects with email and facebook_url
  const { data: prospects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, place_id, business_name, city, facebook_url")
    .not("email", "is", null)
    .eq("email_delivered", false)
    .eq("outreach_status", "new")
    .not("facebook_url", "is", null);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!prospects?.length) { console.log("No prospects to verify"); return; }

  console.log(`[${ts()}] Found ${prospects.length} undelivered prospects to verify\n`);

  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  let hasWebsite = 0, safe = 0, failed = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    const page = await context.newPage();

    try {
      await page.goto(p.facebook_url, { waitUntil: "domcontentloaded", timeout: 15000 });
      try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch { /* timeout ok */ }
      await dismissPopup(page);

      // Scroll down to load lazy content
      await page.evaluate(() => window.scrollBy({ top: 500, behavior: "smooth" }));
      await page.waitForTimeout(2000);

      const pageText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      const website = findWebsite(pageText);

      if (website) {
        hasWebsite++;
        console.log(`[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} — HAS WEBSITE: ${website} — marking lost`);
        await supabase.from("pineyweb_prospects").update({ outreach_status: "lost" }).eq("id", p.id);
      } else {
        safe++;
        console.log(`[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} — no website found — safe to contact`);
      }
    } catch (err) {
      failed++;
      console.log(`[${ts()}] [${i + 1}/${prospects.length}] ${p.business_name} — FAILED: ${err instanceof Error ? err.message : err}`);
    }

    await page.close();

    // 2-3 second pause between prospects
    if (i < prospects.length - 1) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    }
  }

  try { await browser.close(); } catch { /* ignore */ }

  console.log(`\n=== Verification Summary ===`);
  console.log(`Total checked: ${prospects.length}`);
  console.log(`Has website (marked lost): ${hasWebsite}`);
  console.log(`Safe to contact: ${safe}`);
  console.log(`Could not load page: ${failed}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
