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

  test("direct Google Places API call", async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.log("No GOOGLE_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in env — skipping direct API test");
      test.skip();
      return;
    }

    console.log("=== Direct Google Places API Diagnostic ===");
    const query = encodeURIComponent("restaurant near Longview, TX");
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;
    console.log("URL:", url.replace(apiKey, "REDACTED"));

    const res = await fetch(url);
    const data = await res.json();

    console.log("HTTP status:", res.status);
    console.log("API status:", data.status);
    console.log("Result count:", data.results?.length ?? 0);

    if (data.error_message) {
      console.error("Error message:", data.error_message);
    }

    if (data.status === "REQUEST_DENIED") {
      console.error("REQUEST_DENIED — API key may have restrictions blocking server-side calls");
      expect(data.status, "Google Places API returned REQUEST_DENIED — check API key restrictions").not.toBe("REQUEST_DENIED");
    }

    if (data.status === "INVALID_REQUEST") {
      console.error("INVALID_REQUEST — malformed query or missing parameters");
      expect(data.status, "Google Places API returned INVALID_REQUEST").not.toBe("INVALID_REQUEST");
    }

    if (data.results?.length > 0) {
      console.log("First 5 raw results (before any filtering):");
      for (const r of data.results.slice(0, 5)) {
        console.log(`  "${r.name}" | ${r.formatted_address} | rating: ${r.rating} | reviews: ${r.user_ratings_total} | status: ${r.business_status}`);
      }

      // Check how many would survive chain filter
      const chains = new Set(["McDonald's", "Subway", "Walmart", "Burger King", "Wendy's", "Chick-fil-A", "Sonic", "Whataburger", "Starbucks", "Domino's", "Pizza Hut", "KFC", "Taco Bell"]);
      let chainCount = 0;
      for (const r of data.results) {
        if (chains.has(r.name?.trim())) chainCount++;
      }
      console.log(`Chain filter would remove: ${chainCount} of ${data.results.length}`);
      console.log(`Remaining after chain filter: ${data.results.length - chainCount}`);
    } else {
      console.log("Zero results from Places API — geocoding may have failed or no results for this query");
    }
  });
});
