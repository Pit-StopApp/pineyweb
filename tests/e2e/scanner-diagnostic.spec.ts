import { test, expect } from "@playwright/test";

test.describe("scanner diagnostic", () => {
  test("keyword batch 0 response inspection", async ({ request }) => {
    console.log("=== Scanner API Diagnostic ===");

    const res = await request.post("/api/admin/scanner", {
      data: { city: "Longview", state: "TX", mode: "keywords", batch: 0 },
    });

    console.log("Scanner API status:", res.status());
    const body = await res.json();

    console.log("Stats:", JSON.stringify(body.stats, null, 2));
    console.log("Results count:", body.results?.length ?? 0);
    console.log("Done:", body.done);
    console.log("Current keyword:", body.currentKeyword);

    if (body.debug) {
      console.log("--- Debug log ---");
      for (const line of body.debug) {
        console.log("  ", line);
      }
    }

    if (body.error) {
      console.error("API Error:", body.error);
    }

    if (body.results?.length > 0) {
      console.log("First 3 results:");
      for (const r of body.results.slice(0, 3)) {
        console.log(`  ${r.business_name} | ${r.address} | T${r.priority_tier} | reviews: ${r.review_count}`);
      }
    } else {
      console.log("No results returned — check debug log above for filtering details");
    }
  });

  test("direct Google Places API (New) call", async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.log("No API key in env — skipping direct API test");
      test.skip();
      return;
    }

    console.log("=== Direct Google Places API (New) Diagnostic ===");

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.websiteUri",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ textQuery: "restaurant near Longview, TX" }),
    });

    console.log("HTTP status:", res.status);
    const data = await res.json();

    if (data.error) {
      console.error("API Error:", JSON.stringify(data.error, null, 2));
      expect(data.error, `Google Places API error: ${data.error.message}`).toBeUndefined();
      return;
    }

    const places = data.places || [];
    console.log("Result count:", places.length);

    if (places.length > 0) {
      console.log("First 5 raw results (before any filtering):");
      for (const p of places.slice(0, 5)) {
        console.log(`  "${p.displayName?.text}" | ${p.formattedAddress} | rating: ${p.rating} | reviews: ${p.userRatingCount} | status: ${p.businessStatus} | website: ${p.websiteUri || "NONE"}`);
      }

      const chains = new Set(["McDonald's", "Subway", "Walmart", "Burger King", "Wendy's", "Chick-fil-A", "Sonic", "Whataburger", "Starbucks", "Domino's", "Pizza Hut", "KFC", "Taco Bell"]);
      let chainCount = 0;
      let noWebsite = 0;
      for (const p of places) {
        if (chains.has(p.displayName?.text?.trim())) chainCount++;
        if (!p.websiteUri) noWebsite++;
      }
      console.log(`Chain filter would remove: ${chainCount} of ${places.length}`);
      console.log(`No website: ${noWebsite} of ${places.length}`);
      console.log(`Potential prospects (no website, not chain): ${noWebsite - chainCount}`);
    } else {
      console.log("Zero results from Places API");
    }
  });
});
