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

function isChain(name: string): boolean { return CHAINS.has(name.trim()); }

const SEARCH_FIELDS = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.websiteUri,places.location,places.types";
const DETAIL_FIELDS = "id,displayName,formattedAddress,nationalPhoneNumber,rating,userRatingCount,businessStatus,websiteUri,location,types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlace(p: any): { id: string; name: string; address: string; phone: string | null; rating: number | null; reviewCount: number; website: string | null; status: string | null } {
  return {
    id: p.id || "",
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    phone: p.nationalPhoneNumber || null,
    rating: p.rating || null,
    reviewCount: p.userRatingCount || 0,
    website: p.websiteUri || null,
    status: p.businessStatus || null,
  };
}

async function textSearch(query: string, apiKey: string, debug?: string[]): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": SEARCH_FIELDS, "Content-Type": "application/json" },
    body: JSON.stringify({ textQuery: query }),
  });
  const data = await res.json();
  if (debug) {
    debug.push(`  → HTTP ${res.status} | data.places: ${data.places?.length ?? "undefined"} | data.results: ${data.results?.length ?? "undefined"} | data.error: ${data.error?.message ?? "none"}`);
    if (data.places?.[0]) debug.push(`  → First: id=${data.places[0].id}, name="${data.places[0].displayName?.text}", website=${data.places[0].websiteUri ?? "NONE"}`);
  }
  return (data.places || []).map((p: { id: string; displayName?: { text: string } }) => ({ id: p.id, name: p.displayName?.text || "" }));
}

async function nearbySearch(type: string, lat: number, lng: number, radius: number, apiKey: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": SEARCH_FIELDS, "Content-Type": "application/json" },
    body: JSON.stringify({ includedTypes: [type], locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
  });
  const data = await res.json();
  return (data.places || []).map((p: { id: string; displayName?: { text: string } }) => ({ id: p.id, name: p.displayName?.text || "" }));
}

async function getPlaceDetails(placeId: string, apiKey: string) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAIL_FIELDS },
  });
  const data = await res.json();
  return mapPlace(data);
}

export async function POST(request: NextRequest) {
  try {
    console.log("[Scanner] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY present:", !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
    console.log("[Scanner] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY length:", process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.length);
    console.log("[Scanner] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY first 6:", process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.substring(0, 6));
    console.log("[Scanner] GOOGLE_API_KEY present:", !!process.env.GOOGLE_API_KEY);
    console.log("[Scanner] GOOGLE_API_KEY length:", process.env.GOOGLE_API_KEY?.length);

    const { city, state = "TX", batch = 0, mode = "keywords" } = await request.json();
    if (!city) return NextResponse.json({ error: "city required" }, { status: 400 });

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
    const supabase = getSupabase();
    const cityState = `${city}, ${state}`;
    const radiusMeters = 40234;

    // Geocode via hardcoded table, fallback to text search
    const cityKey = city.toLowerCase().trim();
    let location = TX_COORDS[cityKey] || null;
    if (!location) {
      const places = await textSearch(cityState, apiKey);
      if (places.length > 0) {
        const rawRes = await fetch(`https://places.googleapis.com/v1/places/${places[0].id}`, {
          headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location" },
        });
        const rawData = await rawRes.json();
        if (rawData.location) location = { lat: rawData.location.latitude, lng: rawData.location.longitude };
      }
    }
    if (!location) return NextResponse.json({ error: `Could not geocode "${cityState}"` }, { status: 400 });

    // Existing place_ids
    const { data: existing } = await supabase.from("pineyweb_prospects").select("place_id");
    const existingIds = new Set((existing || []).map((r: { place_id: string }) => r.place_id));

    const seenPlaceIds = new Set<string>();
    const rawResults: { place_id: string; name: string }[] = [];
    const stats = { raw: 0, chains_removed: 0, has_website: 0, zero_reviews_skipped: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0 };

    const BATCH_SIZE = 5;

    const processPlaces = (places: { id: string; name: string }[]) => {
      for (const p of places) {
        stats.raw++;
        if (!p.id || seenPlaceIds.has(p.id)) continue;
        seenPlaceIds.add(p.id);
        if (isChain(p.name)) { stats.chains_removed++; continue; }
        if (existingIds.has(p.id)) { stats.already_in_crm++; continue; }
        rawResults.push({ place_id: p.id, name: p.name });
      }
    };

    if (mode === "keywords") {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, KEYWORDS.length);
      if (start >= KEYWORDS.length) return NextResponse.json({ results: [], stats, done: true, debug: [] });

      const debug: string[] = [];
      debug.push(`API Key: present=${!!apiKey}, length=${apiKey?.length}, first6=${apiKey?.substring(0, 6)}`);
      debug.push(`Batch ${batch}: keywords ${start}-${end - 1} of ${KEYWORDS.length}`);
      debug.push(`Location: ${location.lat}, ${location.lng} | City: ${cityState}`);
      debug.push(`Using Places API (New) — places.googleapis.com/v1/`);

      for (let i = start; i < end; i++) {
        const query = `${KEYWORDS[i]} near ${cityState}`;
        debug.push(`[${KEYWORDS[i]}] Query: "${query}"`);
        try {
          const places = await textSearch(query, apiKey, debug);
          debug.push(`[${KEYWORDS[i]}] Mapped results: ${places.length}`);
          if (places.length > 0 && i === start) {
            debug.push(`[${KEYWORDS[i]}] Sample: ${places.slice(0, 3).map(p => p.name).join(", ")}`);
          }
          processPlaces(places);
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
          const places = await nearbySearch(PLACE_TYPES[i], location.lat, location.lng, radiusMeters, apiKey);
          processPlaces(places);
        } catch {
          // Fallback to text search
          try {
            const places = await textSearch(`${PLACE_TYPES[i]} near ${cityState}`, apiKey);
            processPlaces(places);
          } catch { /* skip */ }
        }
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
          const places = await textSearch(`${term} near ${cityState}`, apiKey);
          processPlaces(places);
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
  stats: { has_website: number; zero_reviews_skipped: number; new_prospects: number; tier_1: number; tier_2: number },
) {
  const results: { place_id: string; business_name: string; address: string; city: string; phone: string | null; rating: number | null; review_count: number | null; priority_tier: 1 | 2 }[] = [];

  for (const r of rawResults) {
    try {
      const detail = await getPlaceDetails(r.place_id, apiKey);
      if (!detail.id) continue;
      if (detail.status && detail.status !== "OPERATIONAL") continue;
      if (detail.website) { stats.has_website++; continue; }

      const reviewCount = detail.reviewCount;
      // Skip 0-review businesses (likely inactive or shell companies)
      if (reviewCount === 0) { stats.zero_reviews_skipped++; continue; }
      // Tier 1: 5-50 reviews (established but small), Tier 2: >50 or <5
      const tier = (reviewCount >= 5 && reviewCount <= 50) ? 1 : 2;
      if (tier === 1) stats.tier_1++; else stats.tier_2++;
      stats.new_prospects++;

      const addressParts = (detail.address || "").split(",");
      const city = addressParts.length >= 2 ? addressParts[1]?.trim() : cityState.split(",")[0];

      results.push({
        place_id: r.place_id,
        business_name: detail.name || r.name,
        address: detail.address,
        city,
        phone: detail.phone,
        rating: detail.rating,
        review_count: reviewCount,
        priority_tier: tier as 1 | 2,
      });
    } catch { /* skip */ }
  }

  return results;
}
