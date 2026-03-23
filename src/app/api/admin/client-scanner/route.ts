import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getScannerConfig, isSipSocietyDisqualified } from "@/lib/scanner-configs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.types";

interface PlaceResult {
  place_id: string;
  business_name: string;
  address: string;
  city: string;
  phone: string | null;
  website_url: string | null;
  google_maps_url: string;
  google_place_types: string[];
  rating: number | null;
  review_count: number;
  priority_tier: 1 | 2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlace(p: any): PlaceResult | null {
  const id = p.id;
  const name = p.displayName?.text || "";
  const address = p.formattedAddress || "";
  if (!id || !name) return null;
  const addressParts = address.split(",");
  return {
    place_id: id,
    business_name: name,
    address,
    city: addressParts.length >= 2 ? addressParts[1]?.trim() : "",
    phone: p.nationalPhoneNumber || null,
    website_url: p.websiteUri || null,
    google_maps_url: `https://www.google.com/maps/place/?q=place_id:${id}`,
    google_place_types: p.types || [],
    rating: p.rating || null,
    review_count: p.userRatingCount || 0,
    priority_tier: (p.userRatingCount >= 5 && p.userRatingCount <= 50) ? 1 : 2,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { client_id, client_slug = "sip-society", city, radius = 50 } = body;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

    if (!city) return NextResponse.json({ error: "city is required" }, { status: 400 });

    const config = getScannerConfig(client_slug);

    // Pick the 3 most relevant keywords
    const keywords = config.keywords.slice(0, 3);

    const seen = new Set<string>();
    const allResults: PlaceResult[] = [];
    let apiCalls = 0;

    for (const keyword of keywords) {
      const query = `${keyword} near ${city}`;
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: { circle: { center: { latitude: config.centerCity.lat, longitude: config.centerCity.lng }, radius: radius * 1609.34 } },
          maxResultCount: 20,
        }),
      });
      apiCalls++;

      if (!res.ok) continue;
      const data = await res.json();

      for (const raw of (data.places || [])) {
        const place = mapPlace(raw);
        if (!place || seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        // Apply filters
        if (place.review_count < config.maxResultsPerRun && place.review_count < 5) continue;
        if (config.requireWebsite && !place.website_url) continue;
        if (!config.requireWebsite && place.website_url) continue;
        if (config.chains.has(place.business_name.trim())) continue;
        if (client_slug === "sip-society" && isSipSocietyDisqualified(place.business_name)) continue;

        allResults.push(place);
        if (allResults.length >= 100) break;
      }

      if (allResults.length >= 100) break;
      await new Promise(r => setTimeout(r, 200));
    }

    const estimatedCost = (apiCalls * 0.032).toFixed(3); // ~$0.032 per Text Search
    console.log(`[ClientScanner/${client_slug}] ${city}: ${allResults.length} results from ${apiCalls} API calls (~$${estimatedCost})`);

    // Update scanner client record
    if (client_id) {
      await supabase
        .from("pineyweb_scanner_clients")
        .update({ last_run_at: new Date().toISOString(), total_leads: allResults.length })
        .eq("id", client_id);
    }

    return NextResponse.json({
      results: allResults,
      total: allResults.length,
      city,
      radius,
      apiCalls,
      estimatedCost: `$${estimatedCost}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
