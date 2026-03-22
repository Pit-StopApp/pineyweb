import { createClient } from "@supabase/supabase-js";

const PDL_API_KEY = process.env.PDL_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PDL_API_KEY) { console.error("Missing PDL_API_KEY"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: prospects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, business_name, phone, city, rating, review_count, priority_tier")
    .is("email", null)
    .not("phone", "is", null)
    .eq("priority_tier", 1)
    .order("rating", { ascending: false })
    .limit(100);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!prospects || prospects.length === 0) { console.log("No prospects found"); return; }

  console.log(`Testing PDL Company Enrichment on ${prospects.length} prospects (Tier 1, by rating DESC)...\n`);

  let hits = 0;
  let tested = 0;

  for (const p of prospects) {
    const phone = (p.phone || "").replace(/[^\d+]/g, "");
    if (!phone) continue;

    tested++;
    const url = `https://api.peopledatalabs.com/v5/person/enrich?phone=${encodeURIComponent(phone)}&api_key=${PDL_API_KEY}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 200 && data) {
        // Company enrichment returns emails at top level or nested
        const emails: string[] = [];
        if (data.email) emails.push(data.email);
        if (data.primary_email) emails.push(data.primary_email);
        if (Array.isArray(data.emails)) {
          for (const e of data.emails) {
            if (typeof e === "string") emails.push(e);
            else if (e?.email) emails.push(e.email);
          }
        }
        // Also check founded_email, contact_email
        if (data.contact_email) emails.push(data.contact_email);

        const unique = [...new Set(emails.filter(Boolean))];
        if (unique.length > 0) {
          hits++;
          console.log(`✓ ${p.business_name} (${p.city}) | ${p.phone} → ${unique.join(", ")}`);
        } else {
          console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → none`);
        }
      } else if (res.status === 404) {
        console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → none`);
      } else {
        const msg = data?.error?.message || data?.message || JSON.stringify(data?.status);
        console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → error ${res.status}: ${msg}`);
      }
    } catch (err) {
      console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → fetch error: ${err}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Hits: ${hits}`);
  console.log(`Hit rate: ${tested > 0 ? ((hits / tested) * 100).toFixed(1) : 0}%`);
}

main();
