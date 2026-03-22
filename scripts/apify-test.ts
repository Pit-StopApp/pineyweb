const APIFY_API_KEY = process.env.APIFY_API_KEY;
if (!APIFY_API_KEY) { console.error("Missing APIFY_API_KEY"); process.exit(1); }

async function main() {
  const query = "Carl Miller Farms Brookshire TX";
  console.log(`Searching Apify for: "${query}"\n`);

  // Start actor run
  console.log("Starting actor run...");
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/runs?token=${APIFY_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [],
        searchQueries: [query],
        maxPages: 1,
        maxPagesPerQuery: 1,
      }),
    }
  );

  console.log(`Start response status: ${startRes.status}`);
  const runData = await startRes.json();
  console.log("\n=== START RESPONSE ===");
  console.log(JSON.stringify(runData, null, 2));

  const runId = runData?.data?.id;
  if (!runId) { console.error("No run ID"); return; }
  console.log(`\nRun ID: ${runId}`);

  // Poll for completion
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`
    );
    const statusData = await statusRes.json();
    const status = statusData?.data?.status;
    console.log(`Poll ${i + 1}: status = ${status}`);

    if (status === "SUCCEEDED") {
      const datasetId = statusData?.data?.defaultDatasetId;
      console.log(`\nDataset ID: ${datasetId}`);

      if (!datasetId) { console.log("No dataset ID"); return; }

      // Fetch raw dataset items
      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`
      );
      const items = await itemsRes.json();

      console.log(`\n=== RAW DATASET ITEMS (${Array.isArray(items) ? items.length : "not array"} items) ===`);
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      console.log(`\n=== RUN STATUS DATA ===`);
      console.log(JSON.stringify(statusData, null, 2));
      return;
    }
  }

  console.log("Timed out after 120s");
}

main();
