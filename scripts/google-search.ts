/**
 * Google Custom Search — Facebook URL Discovery
 *
 * Finds Facebook page URLs for all prospects using Google CSE
 * restricted to facebook.com. No browser, no Playwright — pure API.
 *
 * Usage: npx tsx scripts/google-search.ts
 *
 * Requires in .env.local:
 *   GOOGLE_CUSTOM_SEARCH_KEY
 *   GOOGLE_CSE_ID
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_KEY = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
const CSE_ID = process.env.GOOGLE_CSE_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }
if (!GOOGLE_KEY || !CSE_ID) { console.error("Missing GOOGLE_CUSTOM_SEARCH_KEY or GOOGLE_CSE_ID"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ts(): string { return new Date().toLocaleTimeString(); }

// ============================================================================
// FUZZY SCORING
// ============================================================================

const GENERIC = new Set(["the","a","an","and","of","in","at","for","to","on","or","llc","inc","co","corp","ltd","pllc","pc","pa","dba","tx","texas"]);
const SUFFIX = new Set(["llc","inc","co","corp","ltd","pllc","pc","pa","dba","tx","texas","dds","md","jr","sr","ii","iii"]);

function cleanName(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['''""",.\-–—()!@#$%^*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function scoreMatch(resultTitle: string, prospectName: string, prospectCity: string): number {
  const a = cleanName(resultTitle);
  const b = cleanName(prospectName);
  if (a === b) return 100;

  const aWords = a.split(" ").filter(w => w.length > 1 && !GENERIC.has(w));
  const bWords = b.split(" ").filter(w => w.length > 1 && !GENERIC.has(w));
  if (bWords.length === 0) return 0;

  const aSet = new Set(aWords);
  const overlap = bWords.filter(w => aSet.has(w));
  let score = (overlap.length / bWords.length) * 100;

  // Bonus: substring containment
  const aJoined = aWords.join(" ");
  const bJoined = bWords.join(" ");
  if (aJoined.includes(bJoined) || bJoined.includes(aJoined)) score = Math.max(score, 90);

  // Bonus: city appears in result
  if (a.includes(prospectCity.toLowerCase())) score = Math.min(100, score + 5);

  return Math.round(score);
}

function extractFacebookUrl(link: string): string | null {
  if (!link.includes("facebook.com")) return null;
  // Clean tracking params, keep the base URL
  try {
    const url = new URL(link);
    const clean = `${url.origin}${url.pathname}`.replace(/\/$/, "");
    // Skip search/help/policy pages
    if (clean.includes("/search") || clean.includes("/help") || clean.includes("/policies")) return null;
    return clean;
  } catch { return link; }
}

// ============================================================================
// GOOGLE CUSTOM SEARCH API
// ============================================================================

interface SearchResult { title: string; link: string; snippet: string; }

async function googleSearch(query: string): Promise<SearchResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_KEY}&cx=${CSE_ID}&num=5`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${errText.substring(0, 200)}`);
  }
  const data = await res.json();
  return (data.items || []).map((item: { title: string; link: string; snippet?: string }) => ({
    title: item.title || "",
    link: item.link || "",
    snippet: item.snippet || "",
  }));
}

function scoreBestResult(results: SearchResult[], prospectName: string, city: string): { url: string | null; score: number; title: string } {
  let bestUrl: string | null = null;
  let bestScore = 0;
  let bestTitle = "";

  for (const r of results) {
    const fbUrl = extractFacebookUrl(r.link);
    if (!fbUrl) continue;
    const titleScore = scoreMatch(r.title, prospectName, city);
    const snippetScore = scoreMatch(r.snippet, prospectName, city);
    const score = Math.max(titleScore, snippetScore);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = fbUrl;
      bestTitle = r.title;
    }
  }

  return { url: bestUrl, score: bestScore, title: bestTitle };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`[${ts()}] Google Search — Facebook URL Discovery\n`);

  // Fetch all prospects needing facebook_url
  const allProspects: { id: string; place_id: string; business_name: string; city: string }[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("pineyweb_prospects")
      .select("id, place_id, business_name, city")
      .is("facebook_url", null)
      .not("business_name", "is", null)
      .range(from, from + PAGE - 1);
    if (error) { console.error("Supabase error:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allProspects.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[${ts()}] Found ${allProspects.length} prospects without facebook_url\n`);
  if (allProspects.length === 0) return;

  let found = 0, foundExact = 0, foundSimplified = 0, notFound = 0, errors = 0;
  let totalQueries = 0;

  const BATCH_SIZE = 10;

  for (let i = 0; i < allProspects.length; i++) {
    const p = allProspects[i];

    try {
      // Call 1: Exact match
      const exactQuery = `${p.business_name} ${p.city} TX`;
      totalQueries++;
      const exactResults = await googleSearch(exactQuery);
      const exact = scoreBestResult(exactResults, p.business_name, p.city);

      // Call 2: Simplified fallback
      const simplified = simplifyName(p.business_name, p.city);
      let simp = { url: null as string | null, score: 0, title: "" };
      if (simplified && simplified !== p.business_name.trim()) {
        const simpQuery = `${simplified} ${p.city} TX`;
        totalQueries++;
        const simpResults = await googleSearch(simpQuery);
        simp = scoreBestResult(simpResults, p.business_name, p.city);
      }

      // Pick the best result
      const best = exact.score >= simp.score ? exact : simp;
      const method = exact.score >= simp.score ? "exact" : "simplified";

      if (best.url && best.score >= 60) {
        found++;
        if (method === "exact") foundExact++; else foundSimplified++;
        await supabase.from("pineyweb_prospects").update({
          facebook_url: best.url,
          facebook_found: true,
          facebook_match_score: best.score,
          facebook_search_method: method,
        }).eq("id", p.id);
      } else {
        notFound++;
        await supabase.from("pineyweb_prospects").update({
          facebook_found: false,
          facebook_match_score: best.score || 0,
        }).eq("id", p.id);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Retry once after 2 seconds
      try {
        await new Promise(r => setTimeout(r, 2000));
        totalQueries++;
        const retryQuery = `${p.business_name} ${p.city} TX`;
        const retryResults = await googleSearch(retryQuery);
        const retry = scoreBestResult(retryResults, p.business_name, p.city);
        if (retry.url && retry.score >= 60) {
          found++; foundExact++;
          await supabase.from("pineyweb_prospects").update({
            facebook_url: retry.url, facebook_found: true,
            facebook_match_score: retry.score, facebook_search_method: "exact",
          }).eq("id", p.id);
        } else {
          notFound++;
          await supabase.from("pineyweb_prospects").update({ facebook_found: false }).eq("id", p.id);
        }
      } catch {
        errors++;
        console.log(`[${ts()}]   Error (${p.business_name}): ${errMsg}`);
        await supabase.from("pineyweb_prospects").update({ facebook_found: null }).eq("id", p.id).catch(() => {});
      }
    }

    // Rate limiting: pause 1s every 10 prospects
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // Progress logging every 100 prospects
    if ((i + 1) % 100 === 0 || i === allProspects.length - 1) {
      const cost = (totalQueries * 0.005).toFixed(2);
      console.log(`[${ts()}] [${i + 1}/${allProspects.length}] Found: ${found} (${foundExact} exact, ${foundSimplified} simplified) | Not found: ${notFound} | Errors: ${errors} | Queries: ${totalQueries} (~$${cost})`);
    }
  }

  // Final report
  const totalCost = (totalQueries * 0.005).toFixed(2);
  console.log(`\n=== Session Report ===`);
  console.log(`Total prospects: ${allProspects.length}`);
  console.log(`Facebook found: ${found} (${foundExact} exact, ${foundSimplified} simplified)`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total API queries: ${totalQueries}`);
  console.log(`Estimated cost: $${totalCost}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
