import { createClient } from "@supabase/supabase-js";

const PDL_API_KEY = process.env.PDL_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PDL_API_KEY) { console.error("Missing PDL_API_KEY"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env vars"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Professional suffixes/titles that indicate a person's name is in the business name
const PERSON_INDICATORS = [
  "law office", "law offices", "law firm", "attorney", "attorneys",
  "realtor", "realty", "real estate",
  "cpa", "accounting",
  "md", "dds", "dvm", "dc", "do", "pa", "np",
  "dr.", "dr ",
  "insurance agency", "insurance",
  "chiropractic", "dental", "dentistry",
  "counseling", "therapy", "consulting",
];

// Common first names to help identify "Firstname Lastname" patterns
const COMMON_FIRST = new Set([
  "james", "john", "robert", "michael", "david", "william", "richard", "joseph", "thomas", "charles",
  "christopher", "daniel", "matthew", "anthony", "mark", "donald", "steven", "paul", "andrew", "joshua",
  "kenneth", "kevin", "brian", "george", "timothy", "ronald", "edward", "jason", "jeffrey", "ryan",
  "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin", "scott", "brandon",
  "benjamin", "samuel", "raymond", "gregory", "frank", "patrick", "jack", "dennis", "jerry", "tyler",
  "mary", "patricia", "jennifer", "linda", "barbara", "elizabeth", "susan", "jessica", "sarah", "karen",
  "lisa", "nancy", "betty", "margaret", "sandra", "ashley", "dorothy", "kimberly", "emily", "donna",
  "michelle", "carol", "amanda", "melissa", "deborah", "stephanie", "rebecca", "sharon", "laura", "cynthia",
  "kathleen", "amy", "angela", "shirley", "anna", "brenda", "pamela", "emma", "nicole", "helen",
  "samantha", "katherine", "christine", "debra", "rachel", "carolyn", "janet", "catherine", "maria", "heather",
  "diane", "ruth", "julie", "olivia", "joyce", "virginia", "victoria", "kelly", "lauren", "christina",
  "joan", "evelyn", "judith", "megan", "andrea", "cheryl", "hannah", "jacqueline", "martha", "gloria",
  "teresa", "ann", "sara", "madison", "frances", "kathryn", "janice", "jean", "abigail", "alice",
  "bobby", "billy", "jimmy", "tommy", "johnny", "joe", "mike", "bob", "jim", "tom", "bill", "dan",
  "rick", "randy", "tony", "terry", "wayne", "roy", "eugene", "russell", "bobby", "harry", "fred",
  "albert", "carl", "arthur", "lawrence", "dylan", "jesse", "jordan", "bryan", "billy", "bruce",
  "ralph", "roy", "louis", "russell", "vincent", "philip", "curtis", "travis", "dustin", "dale",
  "cody", "chad", "clint", "clay", "curt", "daryl", "deb", "dwayne", "earl", "ed", "ernie",
]);

// Words that are definitely NOT person names
const NON_NAME_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "at", "by", "for", "to", "on", "with", "from",
  "auto", "tire", "body", "shop", "salon", "barber", "nail", "spa", "gym", "cafe", "bar",
  "restaurant", "grill", "pizza", "bbq", "feed", "store", "supply", "service", "services",
  "repair", "parts", "center", "inc", "llc", "co", "corp", "ltd", "enterprise", "enterprises",
  "east", "west", "north", "south", "texas", "tx", "longview", "tyler", "marshall",
  "plumbing", "electric", "electrical", "heating", "cooling", "hvac", "roofing", "painting",
  "construction", "building", "landscaping", "lawn", "tree", "pest", "cleaning",
  "animal", "pet", "vet", "veterinary", "medical", "health", "care", "clinic", "hospital",
  "church", "baptist", "methodist", "first", "second", "third", "new", "old", "big", "little",
  "county", "city", "state", "national", "american", "united", "tri",
  "mobile", "express", "quick", "fast", "best", "elite", "premier", "pro", "quality", "custom",
]);

interface Prospect {
  id: string;
  place_id: string;
  business_name: string;
  phone: string | null;
  city: string;
  rating: number | null;
  review_count: number | null;
}

function extractPersonName(businessName: string): string | null {
  const name = businessName.trim();
  const lower = name.toLowerCase();

  // Check for professional indicators — extract the name portion
  for (const indicator of PERSON_INDICATORS) {
    const idx = lower.indexOf(indicator);
    if (idx !== -1) {
      // Name could be before or after the indicator
      const before = name.substring(0, idx).trim().replace(/[,\-–—'s]+$/i, "").trim();
      const after = name.substring(idx + indicator.length).trim().replace(/^[,\-–—]+/, "").trim();

      // Check if the before part looks like a name (2-3 capitalized words)
      const candidate = before || after;
      const words = candidate.split(/\s+/).filter(w => w.length > 1);
      if (words.length >= 2 && words.length <= 4) {
        const allCapped = words.every(w => /^[A-Z]/.test(w) && !NON_NAME_WORDS.has(w.toLowerCase()));
        if (allCapped) return words.join(" ");
      }
    }
  }

  // Check for "Firstname Lastname" pattern (exactly 2-3 words, all capitalized, first word is a known first name)
  const words = name.split(/\s+/).filter(w => w.length > 1);
  if (words.length >= 2 && words.length <= 3) {
    const allCapped = words.every(w => /^[A-Z]/.test(w));
    const firstIsName = COMMON_FIRST.has(words[0].toLowerCase());
    const noNonNames = words.every(w => !NON_NAME_WORDS.has(w.toLowerCase()));
    if (allCapped && firstIsName && noNonNames) {
      return words.join(" ");
    }
  }

  // Check for possessive pattern: "Bob's ..." or "Martinez's ..."
  const possMatch = name.match(/^([A-Z][a-z]+(?:'s)?)\s/);
  if (possMatch && possMatch[1].endsWith("'s")) {
    // Just a first name — not enough for PDL
    return null;
  }

  return null;
}

async function main() {
  // Fetch ALL qualifying prospects (paginate past 1000 limit)
  const allProspects: Prospect[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("pineyweb_prospects")
      .select("id, place_id, business_name, phone, city, rating, review_count")
      .is("email", null)
      .not("phone", "is", null)
      .gte("review_count", 5)
      .range(offset, offset + PAGE - 1);

    if (error) { console.error("Supabase error:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allProspects.push(...(data as Prospect[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`Loaded ${allProspects.length} prospects (no email, has phone, reviews >= 5)`);

  // Filter to those with person names
  const withNames: { prospect: Prospect; extractedName: string }[] = [];
  for (const p of allProspects) {
    const extracted = extractPersonName(p.business_name);
    if (extracted) {
      withNames.push({ prospect: p, extractedName: extracted });
    }
  }

  console.log(`Found ${withNames.length} prospects with person names in business_name`);
  const toTest = withNames.slice(100, 190);
  console.log(`Skipping first 100 (already tested). Testing next ${toTest.length} prospects...\n`);

  let hits = 0;
  let tested = 0;

  for (const { prospect: p, extractedName } of toTest) {
    tested++;
    const location = `${p.city}, Texas`;
    const url = `https://api.peopledatalabs.com/v5/person/enrich?name=${encodeURIComponent(extractedName)}&location=${encodeURIComponent(location)}&api_key=${PDL_API_KEY}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 200 && data?.data) {
        const emails: string[] = [];
        if (data.data.work_email) emails.push(data.data.work_email);
        if (Array.isArray(data.data.personal_emails)) {
          for (const e of data.data.personal_emails) {
            if (typeof e === "string") emails.push(e);
          }
        }
        if (data.data.recommended_personal_email) emails.push(data.data.recommended_personal_email);

        const unique = Array.from(new Set(emails.filter(Boolean)));
        if (unique.length > 0) {
          hits++;
          const foundEmail = unique[0];
          // Save to database
          const { error: updateErr } = await supabase
            .from("pineyweb_prospects")
            .update({ email: foundEmail, email_source: "PDL" })
            .eq("place_id", p.place_id);
          const saved = updateErr ? `(save failed: ${updateErr.message})` : "(saved)";
          console.log(`✓ ${p.business_name} (${p.city}) | name: "${extractedName}" → ${foundEmail} ${saved}`);
        } else {
          console.log(`✗ ${p.business_name} (${p.city}) | name: "${extractedName}" → none`);
        }
      } else if (res.status === 404) {
        console.log(`✗ ${p.business_name} (${p.city}) | name: "${extractedName}" → none`);
      } else {
        const msg = data?.error?.message || data?.message || `status ${res.status}`;
        console.log(`✗ ${p.business_name} (${p.city}) | name: "${extractedName}" → error: ${msg}`);
      }
    } catch (err) {
      console.log(`✗ ${p.business_name} (${p.city}) | name: "${extractedName}" → fetch error: ${err}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Results ===`);
  console.log(`Total prospects with person names: ${withNames.length}`);
  console.log(`Tested: ${tested}`);
  console.log(`Hits: ${hits}`);
  console.log(`Hit rate: ${tested > 0 ? ((hits / tested) * 100).toFixed(1) : 0}%`);
}

main();
