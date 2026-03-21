import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

const TX_COORDS: Record<string, { lat: number; lng: number }> = {
  longview: { lat: 32.5007, lng: -94.7405 }, tyler: { lat: 32.3513, lng: -95.3011 },
  nacogdoches: { lat: 31.6035, lng: -94.6552 }, marshall: { lat: 32.5449, lng: -94.3674 },
  kilgore: { lat: 32.3885, lng: -94.8769 }, henderson: { lat: 32.1532, lng: -94.7996 },
  lufkin: { lat: 31.3382, lng: -94.7291 }, texarkana: { lat: 33.4251, lng: -94.0477 },
  jacksonville: { lat: 31.9638, lng: -95.2702 }, shreveport: { lat: 32.5252, lng: -93.7502 },
};

const KEYWORDS = [
  "restaurant", "cafe", "bar", "food truck",
  "auto shop", "mechanic", "tire shop", "body shop",
  "hair salon", "barbershop", "nail salon", "spa",
  "plumber", "electrician", "HVAC", "roofer", "painter", "landscaping",
  "dentist", "chiropractor", "optometrist", "veterinarian",
  "real estate", "insurance agent", "accountant", "lawyer",
  "gym", "martial arts", "dance studio", "daycare", "tutoring",
  "florist", "photography", "catering", "event venue",
  "feed store", "farm supply", "equipment dealer", "welding shop",
  "oilfield supply", "trucking company", "towing service",
];

const PLACE_TYPES = [
  "restaurant", "cafe", "bar", "beauty_salon", "hair_care", "spa",
  "car_repair", "plumber", "electrician", "locksmith", "painter", "roofing_contractor",
  "doctor", "dentist", "veterinary_care", "physiotherapist",
  "real_estate_agency", "lawyer", "accounting", "insurance_agency",
  "gym", "school", "florist", "photographer",
  "hardware_store", "general_contractor", "storage", "moving_company",
];

const CHAINS = new Set([
  "McDonald's", "Subway", "Walmart", "Walgreens", "CVS", "Dollar General",
  "Dollar Tree", "Family Dollar", "Domino's", "Pizza Hut", "KFC", "Taco Bell",
  "Burger King", "Wendy's", "Chick-fil-A", "Sonic", "Whataburger", "Starbucks",
  "Dunkin", "7-Eleven", "Circle K", "Shell", "Exxon", "Chevron", "Marathon",
  "O'Reilly", "AutoZone", "NAPA", "Advance Auto", "H&R Block", "Edward Jones",
  "State Farm", "Allstate", "RE/MAX", "Keller Williams", "Century 21",
]);

function isChain(name: string): boolean {
  return CHAINS.has(name.trim());
}

export async function POST(request: NextRequest) {
  try {
    const { city, state = "TX", batch = 0, mode = "keywords" } = await request.json();
    if (!city) return NextResponse.json({ error: "city required" }, { status: 400 });

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    const supabase = getSupabase();
    const cityState = `${city}, ${state}`;
    const radiusMeters = 40234; // ~25 miles

    // Geocode
    const cityKey = city.toLowerCase().trim();
    let location = TX_COORDS[cityKey] || null;
    if (!location) {
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(cityState)}&key=${apiKey}`);
      const geoData = await geoRes.json();
      if (geoData.results?.[0]) location = geoData.results[0].geometry?.location;
    }
    if (!location) return NextResponse.json({ error: `Could not geocode "${cityState}"` }, { status: 400 });

    // Get existing place_ids
    const { data: existing } = await supabase.from("pineyweb_prospects").select("place_id");
    const existingIds = new Set((existing || []).map((r: { place_id: string }) => r.place_id));

    const seenPlaceIds = new Set<string>();
    const rawResults: { place_id: string; name: string }[] = [];
    const stats = { raw: 0, chains_removed: 0, has_website: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0 };

    const BATCH_SIZE = 5;

    if (mode === "keywords") {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, KEYWORDS.length);
      if (start >= KEYWORDS.length) return NextResponse.json({ results: [], stats, done: true, debug: [] });

      const debug: string[] = [];
      debug.push(`Batch ${batch}: keywords ${start}-${end - 1} of ${KEYWORDS.length}`);
      debug.push(`Location: ${location.lat}, ${location.lng} | City: ${cityState}`);

      for (let i = start; i < end; i++) {
        const q = encodeURIComponent(`${KEYWORDS[i]} near ${cityState}`);
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${apiKey}`;
        debug.push(`[${KEYWORDS[i]}] URL: ${url.replace(apiKey, "KEY")}`);
        try {
          const res = await fetch(url);
          const data = await res.json();
          debug.push(`[${KEYWORDS[i]}] Status: ${data.status}, Results: ${data.results?.length ?? 0}${data.error_message ? `, Error: ${data.error_message}` : ""}`);
          if (data.results?.length > 0 && i === start) {
            debug.push(`[${KEYWORDS[i]}] Sample: ${data.results.slice(0, 3).map((p: { name: string }) => p.name).join(", ")}`);
          }
          for (const p of data.results || []) {
            stats.raw++;
            if (!p.place_id || seenPlaceIds.has(p.place_id)) continue;
            seenPlaceIds.add(p.place_id);
            if (isChain(p.name)) { stats.chains_removed++; continue; }
            if (existingIds.has(p.place_id)) { stats.already_in_crm++; continue; }
            rawResults.push({ place_id: p.place_id, name: p.name });
          }
        } catch (err) {
          debug.push(`[${KEYWORDS[i]}] ERROR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      debug.push(`Raw results before website check: ${rawResults.length}`);
      const done = end >= KEYWORDS.length;
      const results = await checkWebsites(rawResults, apiKey, cityState, stats);
      debug.push(`After website check: ${results.length} prospects (${stats.has_website} had websites)`);
      return NextResponse.json({ results, stats, done, nextBatch: done ? null : batch + 1, currentKeyword: KEYWORDS[Math.min(end, KEYWORDS.length - 1)], debug });
    }

    if (mode === "types") {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, PLACE_TYPES.length);
      if (start >= PLACE_TYPES.length) return NextResponse.json({ results: [], stats, done: true });

      for (let i = start; i < end; i++) {
        try {
          const res = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=${radiusMeters}&type=${PLACE_TYPES[i]}&key=${apiKey}`);
          const data = await res.json();
          if (data.status === "REQUEST_DENIED") {
            // Fallback to text search
            const q = encodeURIComponent(`${PLACE_TYPES[i]} near ${cityState}`);
            const res2 = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${apiKey}`);
            const data2 = await res2.json();
            for (const p of data2.results || []) {
              stats.raw++;
              if (!p.place_id || seenPlaceIds.has(p.place_id)) continue;
              seenPlaceIds.add(p.place_id);
              if (isChain(p.name)) { stats.chains_removed++; continue; }
              if (existingIds.has(p.place_id)) { stats.already_in_crm++; continue; }
              rawResults.push({ place_id: p.place_id, name: p.name });
            }
            continue;
          }
          for (const p of data.results || []) {
            stats.raw++;
            if (!p.place_id || seenPlaceIds.has(p.place_id)) continue;
            seenPlaceIds.add(p.place_id);
            if (isChain(p.name)) { stats.chains_removed++; continue; }
            if (existingIds.has(p.place_id)) { stats.already_in_crm++; continue; }
            rawResults.push({ place_id: p.place_id, name: p.name });
          }
        } catch { /* continue */ }
      }
      const done = end >= PLACE_TYPES.length;
      const results = await checkWebsites(rawResults, apiKey, cityState, stats);
      return NextResponse.json({ results, stats, done, nextBatch: done ? null : batch + 1 });
    }

    if (mode === "ai") {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return NextResponse.json({ results: [], stats, done: true });

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 400,
          messages: [{ role: "user", content: `Based on the local economy of ${cityState}, what 8 additional business types would exist here that keyword search might miss? Focus on trades, industrial suppliers, family businesses with NO website. Return JSON array of search term strings only.` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const aiData = await aiRes.json();
      const aiText = aiData.content?.map((b: { text?: string }) => b.text).filter(Boolean).join("") || "";
      let terms: string[] = [];
      try { const m = aiText.match(/\[[\s\S]*\]/); if (m) terms = JSON.parse(m[0]); } catch { /* skip */ }

      for (const term of terms.slice(0, 8)) {
        try {
          const q = encodeURIComponent(`${term} near ${cityState}`);
          const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${apiKey}`);
          const data = await res.json();
          for (const p of data.results || []) {
            stats.raw++;
            if (!p.place_id || seenPlaceIds.has(p.place_id)) continue;
            seenPlaceIds.add(p.place_id);
            if (isChain(p.name)) { stats.chains_removed++; continue; }
            if (existingIds.has(p.place_id)) { stats.already_in_crm++; continue; }
            rawResults.push({ place_id: p.place_id, name: p.name });
          }
        } catch { /* continue */ }
      }
      const results = await checkWebsites(rawResults, apiKey, cityState, stats);
      return NextResponse.json({ results, stats, done: true });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function checkWebsites(
  rawResults: { place_id: string; name: string }[],
  apiKey: string,
  cityState: string,
  stats: { has_website: number; new_prospects: number; tier_1: number; tier_2: number },
) {
  const results: { place_id: string; business_name: string; address: string; city: string; phone: string | null; rating: number | null; review_count: number | null; priority_tier: 1 | 2 }[] = [];

  for (const r of rawResults) {
    try {
      const detailRes = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${r.place_id}&fields=name,website,formatted_phone_number,formatted_address,rating,user_ratings_total&key=${apiKey}`);
      const detail = await detailRes.json();
      const result = detail.result;
      if (!result) continue;

      if (result.website) { stats.has_website++; continue; }

      const reviewCount = result.user_ratings_total || 0;
      const tier = reviewCount < 50 ? 1 : 2;
      if (tier === 1) stats.tier_1++; else stats.tier_2++;
      stats.new_prospects++;

      const addressParts = (result.formatted_address || "").split(",");
      const city = addressParts.length >= 2 ? addressParts[1]?.trim() : cityState.split(",")[0];

      results.push({
        place_id: r.place_id,
        business_name: result.name || r.name,
        address: result.formatted_address || "",
        city,
        phone: result.formatted_phone_number || null,
        rating: result.rating || null,
        review_count: reviewCount,
        priority_tier: tier as 1 | 2,
      });
    } catch { /* skip */ }
  }

  return results;
}
