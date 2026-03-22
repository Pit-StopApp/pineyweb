import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

interface PlaceResult {
  business_name: string;
  address: string;
  city: string;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  has_website: boolean;
}

async function searchPlaces(keyword: string, lat: number, lng: number, radius: number): Promise<PlaceResult[]> {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: keyword,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radius * 1609.34 },
      },
      maxResultCount: 20,
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.places || []).map((p: Record<string, unknown>) => ({
    business_name: (p.displayName as Record<string, string>)?.text || "",
    address: (p.formattedAddress as string) || "",
    city: ((p.formattedAddress as string) || "").split(",")[1]?.trim() || "",
    phone: (p.nationalPhoneNumber as string) || null,
    rating: (p.rating as number) || null,
    review_count: (p.userRatingCount as number) || null,
    has_website: !!(p.websiteUri as string),
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { client_id, city, radius = 25, max_results = 100, keywords = [], business_types = [] } = body;

    if (!city) return NextResponse.json({ error: "city is required" }, { status: 400 });

    // Geocode the city
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${GOOGLE_API_KEY}`
    );
    const geoData = await geoRes.json();
    if (!geoData.results?.[0]) return NextResponse.json({ error: "Could not geocode city" }, { status: 400 });

    const { lat, lng } = geoData.results[0].geometry.location;

    // Search for each keyword
    const searchTerms = keywords.length > 0 ? keywords : business_types;
    if (searchTerms.length === 0) return NextResponse.json({ error: "keywords or business_types required" }, { status: 400 });

    const allResults: PlaceResult[] = [];
    const seen = new Set<string>();

    for (const term of searchTerms) {
      const query = `${term} near ${city}`;
      const results = await searchPlaces(query, lat, lng, radius);
      for (const r of results) {
        const key = `${r.business_name}|${r.address}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(r);
        }
      }
      if (allResults.length >= max_results) break;
      // Small delay between searches
      await new Promise(r => setTimeout(r, 200));
    }

    const trimmed = allResults.slice(0, max_results);

    // Update scanner client record if client_id provided
    if (client_id) {
      await supabase
        .from("pineyweb_scanner_clients")
        .update({
          last_run_at: new Date().toISOString(),
          total_leads: trimmed.length,
        })
        .eq("client_id", client_id);
    }

    return NextResponse.json({
      results: trimmed,
      total: trimmed.length,
      city,
      radius,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
