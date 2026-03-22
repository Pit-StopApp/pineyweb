import { createClient } from "@supabase/supabase-js";

const PDL_API_KEY = process.env.PDL_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PDL_API_KEY) { console.error("Missing PDL_API_KEY"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Fetch first 50 prospects: no email, has phone, review_count >= 5
  const { data: prospects, error } = await supabase
    .from("pineyweb_prospects")
    .select("id, business_name, phone, city, review_count, priority_tier")
    .is("email", null)
    .not("phone", "is", null)
    .gte("review_count", 5)
    .order("priority_tier", { ascending: true })
    .limit(50);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!prospects || prospects.length === 0) { console.log("No prospects found"); return; }

  console.log(`Testing PDL phone enrichment on ${prospects.length} prospects...\n`);

  let hits = 0;
  let tested = 0;

  for (const p of prospects) {
    const phone = (p.phone || "").replace(/[^\d+]/g, "");
    if (!phone) { continue; }

    tested++;
    const url = `https://api.peopledatalabs.com/v5/person/enrich?phone=${encodeURIComponent(phone)}&api_key=${PDL_API_KEY}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 200 && data?.data) {
        // Check for work_email, personal_emails, or emails
        const workEmail = data.data.work_email;
        const personalEmails = data.data.personal_emails || [];
        const allEmails = [workEmail, ...personalEmails].filter(Boolean);

        if (allEmails.length > 0) {
          hits++;
          console.log(`✓ ${p.business_name} (${p.city}) | ${p.phone} → ${allEmails.join(", ")}`);
        } else {
          console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → none`);
        }
      } else if (res.status === 404) {
        console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → none`);
      } else {
        console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → error ${res.status}: ${data?.error?.message || JSON.stringify(data?.status)}`);
      }
    } catch (err) {
      console.log(`✗ ${p.business_name} (${p.city}) | ${p.phone} → fetch error: ${err}`);
    }

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Results ===`);
  console.log(`Tested: ${tested}`);
  console.log(`Hits: ${hits}`);
  console.log(`Hit rate: ${tested > 0 ? ((hits / tested) * 100).toFixed(1) : 0}%`);
}

main();
