import { createClient } from "@supabase/supabase-js";

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!APIFY_API_KEY) { console.error("Missing APIFY_API_KEY"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.includes("@") && v.includes(".");

async function runApifyActor(searchQuery: string): Promise<string[]> {
  // Start the actor run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/runs?token=${APIFY_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [],
        searchQueries: [searchQuery],
        maxPages: 1,
        maxPagesPerQuery: 1,
      }),
    }
  );

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Apify start failed (${startRes.status}): ${err}`);
  }

  const runData = await startRes.json();
  const runId = runData?.data?.id;
  if (!runId) throw new Error("No run ID returned");

  // Poll for completion (max 120 seconds)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`
    );
    const statusData = await statusRes.json();
    const status = statusData?.data?.status;

    if (status === "SUCCEEDED") {
      // Fetch results from default dataset
      const datasetId = statusData?.data?.defaultDatasetId;
      if (!datasetId) return [];

      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`
      );
      const items = await itemsRes.json();

      // Extract emails from results
      const emails: string[] = [];
      for (const item of items) {
        if (isValidEmail(item.email)) emails.push(item.email);
        if (isValidEmail(item.emails?.[0])) emails.push(item.emails[0]);
        // Check info/about fields for email patterns
        const text = [item.about, item.info, item.description, item.categories]
          .filter(Boolean)
          .join(" ");
        const emailMatches = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g);
        if (emailMatches) {
          for (const m of emailMatches) {
            if (isValidEmail(m)) emails.push(m);
          }
        }
      }
      return Array.from(new Set(emails));
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${status}`);
    }
  }

  throw new Error("Apify run timed out after 120s");
}

async function main() {
  const { data: prospects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, place_id, business_name, phone, city, rating, review_count")
    .is("email", null)
    .not("phone", "is", null)
    .gte("review_count", 5)
    .eq("priority_tier", 1)
    .order("rating", { ascending: false })
    .limit(20);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!prospects || prospects.length === 0) { console.log("No prospects found"); return; }

  console.log(`Testing Apify Facebook Pages Scraper on ${prospects.length} prospects...\n`);

  let hits = 0;
  let tested = 0;

  for (const p of prospects) {
    tested++;
    const query = `${p.business_name} ${p.city} TX`;
    console.log(`[${tested}/${prospects.length}] Searching: "${query}"...`);

    try {
      const emails = await runApifyActor(query);

      if (emails.length > 0) {
        hits++;
        console.log(`  ✓ ${p.business_name} (${p.city}) → ${emails.join(", ")}`);
      } else {
        console.log(`  ✗ ${p.business_name} (${p.city}) → none`);
      }
    } catch (err) {
      console.log(`  ✗ ${p.business_name} (${p.city}) → error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Hits: ${hits}`);
  console.log(`Hit rate: ${tested > 0 ? ((hits / tested) * 100).toFixed(1) : 0}%`);
}

main();
