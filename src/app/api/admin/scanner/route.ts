import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findBusinessEmail } from "@/lib/email-enrichment";
import { getScannerConfig, isSipSocietyDisqualified } from "@/lib/scanner-configs";

function getSupabase() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

const SEARCH_FIELDS = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.websiteUri,places.location,places.types";
const DETAIL_FIELDS = "id,displayName,formattedAddress,nationalPhoneNumber,rating,userRatingCount,businessStatus,websiteUri,location,types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlace(p: any) {
  return {
    id: (p.id || "") as string,
    name: (p.displayName?.text || "") as string,
    address: (p.formattedAddress || "") as string,
    phone: (p.nationalPhoneNumber || null) as string | null,
    rating: (p.rating || null) as number | null,
    reviewCount: (p.userRatingCount || 0) as number,
    website: (p.websiteUri || null) as string | null,
    status: (p.businessStatus || null) as string | null,
    types: (p.types || []) as string[],
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
    debug.push(`  → HTTP ${res.status} | places: ${data.places?.length ?? 0} | error: ${data.error?.message ?? "none"}`);
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
    const body = await request.json();
    const { city, state = "TX", batch = 0, mode = "keywords", client_slug = "piney-web" } = body;
    if (!city) return NextResponse.json({ error: "city required" }, { status: 400 });

    const config = getScannerConfig(client_slug);
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
    const supabase = getSupabase();
    const cityState = `${city}, ${state}`;

    // Geocode
    const cityKey = city.toLowerCase().trim();
    let location = config.coords[cityKey] || null;
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

    // Existing place_ids in this client's table
    const { data: existing } = await supabase.from(config.prospectsTable).select("place_id");
    const existingIds = new Set((existing || []).map((r: { place_id: string }) => r.place_id));

    const seenPlaceIds = new Set<string>();
    const rawResults: { place_id: string; name: string }[] = [];
    const stats = { raw: 0, chains_removed: 0, disqualified: 0, has_website: 0, no_website: 0, zero_reviews_skipped: 0, already_in_crm: 0, new_prospects: 0, tier_1: 0, tier_2: 0, emails_found: 0 };

    const BATCH_SIZE = 5;
    const KEYWORDS = config.keywords;
    const PLACE_TYPES = config.placeTypes;

    const processPlaces = (places: { id: string; name: string }[]) => {
      for (const p of places) {
        stats.raw++;
        if (!p.id || seenPlaceIds.has(p.id)) continue;
        seenPlaceIds.add(p.id);
        if (config.chains.has(p.name.trim())) { stats.chains_removed++; continue; }
        if (existingIds.has(p.id)) { stats.already_in_crm++; continue; }
        // Client-specific name disqualification
        if (client_slug === "sip-society" && isSipSocietyDisqualified(p.name)) { stats.disqualified++; continue; }
        rawResults.push({ place_id: p.id, name: p.name });
        // Hard cap for cost control
        if (rawResults.length >= config.maxResultsPerRun) break;
      }
    };

    if (mode === "keywords") {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, KEYWORDS.length);
      if (start >= KEYWORDS.length) return NextResponse.json({ results: [], stats, done: true, debug: [] });

      const debug: string[] = [];
      debug.push(`Client: ${config.name} (${client_slug})`);
      debug.push(`Batch ${batch}: keywords ${start}-${end - 1} of ${KEYWORDS.length}`);

      for (let i = start; i < end; i++) {
        if (rawResults.length >= config.maxResultsPerRun) break;
        const query = `${KEYWORDS[i]} near ${cityState}`;
        debug.push(`[${KEYWORDS[i]}] Query: "${query}"`);
        try {
          const places = await textSearch(query, apiKey, debug);
          processPlaces(places);
        } catch (err) {
          debug.push(`[${KEYWORDS[i]}] ERROR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const done = end >= KEYWORDS.length || rawResults.length >= config.maxResultsPerRun;
      const results = await checkWebsites(rawResults, apiKey, cityState, stats, config.prospectsTable, config);
      return NextResponse.json({ results, stats, done, nextBatch: done ? null : batch + 1, currentKeyword: KEYWORDS[Math.min(end, KEYWORDS.length - 1)], debug });
    }

    if (mode === "types") {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, PLACE_TYPES.length);
      if (start >= PLACE_TYPES.length) return NextResponse.json({ results: [], stats, done: true });

      for (let i = start; i < end; i++) {
        if (rawResults.length >= config.maxResultsPerRun) break;
        try {
          const places = await nearbySearch(PLACE_TYPES[i], location.lat, location.lng, config.radiusMeters, apiKey);
          processPlaces(places);
        } catch {
          try {
            const places = await textSearch(`${PLACE_TYPES[i]} near ${cityState}`, apiKey);
            processPlaces(places);
          } catch { /* skip */ }
        }
      }
      const done = end >= PLACE_TYPES.length || rawResults.length >= config.maxResultsPerRun;
      const results = await checkWebsites(rawResults, apiKey, cityState, stats, config.prospectsTable, config);
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
          messages: [{ role: "user", content: `Based on the local economy of ${cityState}, what 8 additional business types would exist here that keyword search might miss? Focus on ${config.requireWebsite ? "established event venues, wedding vendors, and hospitality businesses" : "trades, industrial suppliers, family businesses with NO website"}. Return JSON array of search term strings only.` }],
        }),
      });
      const aiData = await aiRes.json();
      const aiText = aiData.content?.map((b: { text?: string }) => b.text).filter(Boolean).join("") || "";
      let terms: string[] = [];
      try { const m = aiText.match(/\[[\s\S]*\]/); if (m) terms = JSON.parse(m[0]); } catch { /* skip */ }

      for (const term of terms.slice(0, 8)) {
        if (rawResults.length >= config.maxResultsPerRun) break;
        try {
          const places = await textSearch(`${term} near ${cityState}`, apiKey);
          processPlaces(places);
        } catch { /* continue */ }
      }
      const results = await checkWebsites(rawResults, apiKey, cityState, stats, config.prospectsTable, config);
      return NextResponse.json({ results, stats, done: true });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

interface ProspectResult {
  place_id: string; business_name: string; address: string; city: string;
  phone: string | null; email: string | null; email_source: string | null;
  rating: number | null; review_count: number | null; priority_tier: 1 | 2;
  website_url?: string | null; google_maps_url?: string | null; google_place_types?: string[];
}

async function checkWebsites(
  rawResults: { place_id: string; name: string }[],
  apiKey: string,
  cityState: string,
  stats: { has_website: number; no_website: number; zero_reviews_skipped: number; new_prospects: number; tier_1: number; tier_2: number; emails_found: number },
  tableName: string,
  config: ReturnType<typeof getScannerConfig>,
) {
  const prospects: ProspectResult[] = [];

  for (const r of rawResults) {
    try {
      const detail = await getPlaceDetails(r.place_id, apiKey);
      if (!detail.id) continue;
      if (detail.status && detail.status !== "OPERATIONAL") continue;

      // Website filter — inverted for clients that require websites
      if (config.requireWebsite) {
        if (!detail.website) { stats.no_website++; continue; } // Skip businesses WITHOUT websites
      } else {
        if (detail.website) { stats.has_website++; continue; } // Skip businesses WITH websites
      }

      const reviewCount = detail.reviewCount;
      if (reviewCount === 0) { stats.zero_reviews_skipped++; continue; }
      const tier = (reviewCount >= 5 && reviewCount <= 50) ? 1 : 2;
      if (tier === 1) stats.tier_1++; else stats.tier_2++;
      stats.new_prospects++;

      const addressParts = (detail.address || "").split(",");
      const city = addressParts.length >= 2 ? addressParts[1]?.trim() : cityState.split(",")[0];

      const prospect: ProspectResult = {
        place_id: r.place_id,
        business_name: detail.name || r.name,
        address: detail.address,
        city,
        phone: detail.phone,
        email: null,
        email_source: null,
        rating: detail.rating,
        review_count: reviewCount,
        priority_tier: tier as 1 | 2,
      };

      // Store extra fields for clients that need them
      if (config.storeWebsiteUrl) {
        prospect.website_url = detail.website;
        prospect.google_maps_url = `https://www.google.com/maps/place/?q=place_id:${r.place_id}`;
      }
      if (config.storePlaceTypes) {
        prospect.google_place_types = detail.types;
      }

      prospects.push(prospect);
    } catch { /* skip */ }
  }

  // Email enrichment — skip for clients that don't need it
  let enriched: ProspectResult[];
  if (config.skipEmailEnrichment) {
    enriched = prospects;
  } else {
    enriched = [];
    for (let i = 0; i < prospects.length; i += 5) {
      const batch = prospects.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (p) => {
          const { email, source } = await findBusinessEmail(p.business_name, p.address, p.city);
          if (email) stats.emails_found++;
          return { ...p, email, email_source: source };
        })
      );
      enriched.push(...results);
      if (i + 5 < prospects.length) await new Promise(r => setTimeout(r, 500));
    }
  }

  // Auto-save to the correct client's prospects table
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const p of enriched) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = {
        place_id: p.place_id,
        business_name: p.business_name,
        address: p.address,
        city: p.city,
        phone: p.phone,
        email: p.email ?? null,
        email_source: p.email_source ?? null,
        rating: p.rating,
        review_count: p.review_count,
        priority_tier: p.priority_tier,
        outreach_status: "new",
      };
      if (config.storeWebsiteUrl) {
        row.website_url = p.website_url ?? null;
        row.google_maps_url = p.google_maps_url ?? null;
      }
      if (config.storePlaceTypes) {
        row.google_place_types = p.google_place_types ?? [];
      }
      await supabase.from(tableName).upsert(row, { onConflict: "place_id", ignoreDuplicates: true });
    } catch { /* non-blocking */ }
  }

  // Log estimated API cost
  const detailCalls = rawResults.length;
  const estimatedCost = (detailCalls * 0.007).toFixed(2); // ~$0.007 per Place Details call
  console.log(`[Scanner/${config.slug}] ${enriched.length} prospects saved to ${tableName}. ~$${estimatedCost} estimated API cost (${detailCalls} detail calls)`);

  return enriched;
}
