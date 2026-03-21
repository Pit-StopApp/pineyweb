# Scanner System — Complete Architecture

## 1. Overview

The Piney Web Co. Outreach Scanner is an automated lead generation system that finds local businesses without websites, enriches them with contact information, and sends personalized cold outreach emails — all on autopilot.

**What it does:**
1. Scans cities for local businesses using Google Places API
2. Filters out chains, businesses with websites, and zero-review listings
3. Enriches prospects with email addresses using Claude AI web search
4. Sends personalized cold emails via Resend
5. Tracks delivery, responses, and spam complaints in a prospect CRM

**Who it's for:** Piney Web Co. uses this internally to find potential clients (businesses without websites). The system is also offered as a premium service ("Outreach Scanner") for clients who want automated lead generation for their own businesses.

**Business model:** Three tiers — Starter (25/day, $799/mo), Growth (50/day, $1,299/mo), Agency (100/day, $2,499/mo). Each scanner is custom-configured per client with industry-specific keywords, place types, and email templates.

---

## 2. Tech Stack

| Service | Purpose | Auth |
|---------|---------|------|
| **Google Places API (New)** | Business discovery, geocoding, website detection | `X-Goog-Api-Key` header, `X-Goog-FieldMask` for field selection |
| **Anthropic API** | AI reasoning pass for non-obvious business types | `x-api-key` header, `anthropic-version: 2023-06-01` |
| **Apollo.io** | Email enrichment — people search + organization search | `X-Api-Key` header |
| **Prospeo** | Email enrichment fallback — domain-based email search | `X-KEY` header |
| **Resend** | Cold outreach email delivery + delivery/spam webhooks | `RESEND_API_KEY` |
| **Supabase** | Prospect CRM storage, queue management, daily tracking | Service role key bypasses RLS |
| **Next.js API Routes** | All scanner endpoints run as Vercel serverless functions | |
| **Vercel Cron** | Not currently used for scanner (removed). Scanner triggered manually via "Run Until Cap" button | |

### Google Places API (New) — Endpoints Used

```
POST https://places.googleapis.com/v1/places:searchText
  Headers: X-Goog-Api-Key, X-Goog-FieldMask, Content-Type: application/json
  Body: { textQuery: "restaurant near Longview, TX" }

POST https://places.googleapis.com/v1/places:searchNearby
  Headers: X-Goog-Api-Key, X-Goog-FieldMask, Content-Type: application/json
  Body: { includedTypes: ["restaurant"], locationRestriction: { circle: { center: { latitude, longitude }, radius } } }

GET https://places.googleapis.com/v1/places/{placeId}
  Headers: X-Goog-Api-Key, X-Goog-FieldMask
```

**Field masks used:**
- Search: `places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.websiteUri,places.location,places.types`
- Details: `id,displayName,formattedAddress,nationalPhoneNumber,rating,userRatingCount,businessStatus,websiteUri,location,types`
- Geocode fallback: `location`

### Apollo.io + Prospeo — Email Enrichment

Three-step enrichment flow (defined in `src/lib/email-enrichment.ts`):

**Step 1 — Apollo People Search:**
```
POST https://api.apollo.io/v1/mixed_people/search
  Headers: X-Api-Key, Content-Type: application/json
  Body: { q_organization_name, q_organization_city, q_organization_state_code: "TX", page: 1, per_page: 1 }
```
Returns person with email if found in Apollo's database.

**Step 2 — Apollo Organization Search:**
```
POST https://api.apollo.io/v1/organizations/search
  Headers: X-Api-Key, Content-Type: application/json
  Body: { q_organization_name, q_organization_city, page: 1, per_page: 1 }
```
Returns organization with `primary_domain` if found.

**Step 3 — Prospeo Domain Search (fallback):**
```
POST https://api.prospeo.io/domain-search
  Headers: X-KEY, Content-Type: application/json
  Body: { domain: "example.com", limit: 1 }
```
Uses the domain from Apollo org search to find a verified email via Prospeo.

Returns: `{ email: "found@email.com", source: "Apollo" | "Prospeo" }` or `{ email: null, source: null }`

---

## 3. Database Schema

### pineyweb_prospects

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| place_id | TEXT | Google Place ID (**unique constraint**) |
| business_name | TEXT | Business name from Google |
| address | TEXT | Full formatted address |
| city | TEXT | City extracted from address |
| phone | TEXT | Phone number from Google |
| email | TEXT | Email found via enrichment |
| email_source | TEXT | Where email was found (Facebook, Yelp, BBB, etc.) |
| rating | NUMERIC | Google star rating |
| review_count | INTEGER | Number of Google reviews |
| priority_tier | INTEGER | 1 (high: 5-50 reviews) or 2 (standard: 50+) |
| outreach_status | TEXT | new, contacted, follow_up, closed_won, closed_lost |
| follow_up_date | DATE | Next follow-up date |
| notes | TEXT | Manual outreach notes |
| contact_method | TEXT | Email, Phone, Both |
| emailed_at | TIMESTAMP | Set immediately when email sent successfully |
| email_delivered | BOOLEAN | Set true by Resend delivery webhook |
| email_spam | BOOLEAN | Set true by Resend spam complaint webhook |

**RLS:** Service role has full access. Anon key is restricted.

**Upsert strategy:** `onConflict: "place_id", ignoreDuplicates: true` — preserves existing outreach status, notes, and follow-up dates when re-scanning a city.

### pineyweb_scanner_queue

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| city | TEXT | City name |
| state | TEXT | Always "TX" |
| lat | NUMERIC | Latitude |
| lng | NUMERIC | Longitude |
| distance_from_longview_miles | NUMERIC | Haversine distance from Longview, TX |
| population | INTEGER | City population estimate |
| status | TEXT | pending, scanning, complete, error |
| prospects_found | INTEGER | Total prospects saved |
| emails_found | INTEGER | Prospects with emails |
| emails_sent | INTEGER | Outreach emails sent |
| last_scanned_at | TIMESTAMP | When scan completed |

**RLS policies:**
```sql
CREATE POLICY "Admin can read scanner_queue"
ON public.pineyweb_scanner_queue FOR ALL
TO authenticated USING (true);
```

### pineyweb_daily_send_tracker

| Column | Type | Description |
|--------|------|-------------|
| date | DATE | Primary key (one row per day) |
| emails_sent | INTEGER | Emails sent today |
| daily_cap | INTEGER | Max emails per day (0 = paused) |

**RLS policies:**
```sql
CREATE POLICY "Admin can read daily_send_tracker"
ON public.pineyweb_daily_send_tracker FOR ALL
TO authenticated USING (true);
```

---

## 4. API Routes

### POST /api/admin/scanner

Main scan endpoint. Runs one batch of searches at a time.

**Request:**
```json
{
  "city": "Longview",
  "state": "TX",
  "batch": 0,
  "mode": "keywords" | "types" | "ai"
}
```

**Response:**
```json
{
  "results": [{ "place_id": "...", "business_name": "...", "email": "...", ... }],
  "stats": { "raw": 45, "chains_removed": 8, "has_website": 12, "new_prospects": 6, "emails_found": 2, "tier_1": 4, "tier_2": 2 },
  "done": false,
  "nextBatch": 1,
  "debug": ["..."]
}
```

**Batch size:** 5 keywords or 5 place types per call. For keywords mode, `batch=0` processes keywords 0-4, `batch=1` processes 5-9, etc. Returns `done: true` when all keywords/types exhausted.

### POST /api/admin/outreach

Cold email sender with deduplication.

**Request:**
```json
{
  "prospects": [{ "place_id": "...", "business_name": "...", "email": "...", "review_count": 23, ... }]
}
```

**Response:**
```json
{ "sent": 5, "failed": 1, "skipped": 2, "errors": ["..."] }
```

**Dedup logic:**
1. Queries all prospects with `emailed_at IS NOT NULL` to build a set of already-emailed addresses
2. Deduplicates within the incoming batch (first occurrence wins)
3. On successful send, sets `emailed_at` on ALL prospects sharing that email via `.eq("email", prospect.email)`

**Rate limit:** 200ms delay between sends. Max 50 per call.

### POST /api/admin/enrich

Email enrichment via Claude AI web search.

**Request:**
```json
{ "prospect_ids": ["uuid1", "uuid2", ...] }
```

**Response:**
```json
{ "enriched": 3, "failed": 2, "skipped": 1, "total": 6 }
```

**Process:** Batches of 5 in parallel, 500ms delay between batches. Uses Claude claude-sonnet-4-20250514 with web search to check Facebook, Yelp, BBB, Google Business, Instagram, Nextdoor, and chamber of commerce directories.

### GET /api/admin/queue-stats

Returns current queue and daily tracker data. Uses service role key.

**Response:**
```json
{
  "queue": [{ "id": "...", "city": "Longview", "status": "complete", ... }],
  "emailsToday": 12,
  "dailyCap": 50
}
```

### POST /api/admin/seed-queue

Seeds the scanner queue with 200+ Texas cities. Only runs if queue is empty.

**Response:**
```json
{ "seeded": 207 }
```

Cities are sorted by Haversine distance from Longview, TX (lat: 32.5007, lng: -94.7405). Closest cities are scanned first.

### GET /api/admin/cron-trigger

Admin-authenticated proxy to auto-scan. Verifies user session + admin role, then calls auto-scan with server-side `CRON_SECRET`.

**Auth:** Requires `Authorization: Bearer <supabase_access_token>` header. Validates user is authenticated and has `role = 'admin'` in pineyweb_clients.

### GET /api/cron/auto-scan

Scans exactly 1 city per invocation. Secured by `CRON_SECRET` Bearer token.

**Response (success):**
```json
{
  "current_city": "Marshall",
  "prospects_found": 8,
  "emails_found": 3,
  "emails_sent": 2,
  "emails_sent_today": 14,
  "daily_cap": 50,
  "cap_reached": false
}
```

**Response (stopped):**
```json
{ "message": "Daily cap of 50 reached.", "sent_today": 50 }
{ "message": "Sending paused (daily_cap = 0).", "sent_today": 12 }
{ "message": "All cities scanned. Queue exhausted." }
```

### POST /api/admin/send-run-summary

Sends one branded summary email after a "Run Until Cap" session.

**Request:**
```json
{
  "cities_scanned": 5,
  "emails_sent": 23,
  "daily_cap": 50,
  "results": [{ "city": "Marshall", "prospects": 8, "emails_found": 3, "emails_sent": 2 }]
}
```

**Auth:** Admin session required.

### POST /api/webhooks/resend

Delivery tracking webhook with svix signature verification.

**Events handled:**
- `email.delivered` — Sets `email_delivered: true`, `outreach_status: "contacted"`, `emailed_at` on matching prospect
- `email.complained` — Sets `email_spam: true`, pauses automation (`daily_cap = 0`), sends admin alert email

---

## 5. Scanner Pipeline — Step by Step

### Step 1: Geocoding

```
City name → hardcoded TX_COORDS lookup table → lat/lng
```

10 cities have hardcoded coordinates (Longview, Tyler, Nacogdoches, Marshall, Kilgore, Henderson, Lufkin, Texarkana, Jacksonville, Shreveport). All others fall back to a Google Places text search to extract coordinates.

### Step 2: Keyword Searches (43 keywords)

```
"restaurant", "cafe", "bar", "food truck",
"auto shop", "mechanic", "tire shop", "body shop",
"hair salon", "barbershop", "nail salon", "spa",
"plumber", "electrician", "HVAC", "roofer", "painter", "landscaping",
"dentist", "chiropractor", "optometrist", "veterinarian",
"real estate", "insurance agent", "accountant", "lawyer",
"gym", "martial arts", "dance studio", "daycare", "tutoring",
"florist", "photography", "catering", "event venue",
"feed store", "farm supply", "equipment dealer", "welding shop",
"oilfield supply", "trucking company", "towing service"
```

Each keyword is searched as `"{keyword} near {city}, TX"` via Places Text Search API. Batched 5 keywords per API call to avoid serverless timeouts.

### Step 3: Place Type Searches (28 types)

```
"restaurant", "cafe", "bar", "beauty_salon", "hair_care", "spa",
"car_repair", "plumber", "electrician", "locksmith", "painter", "roofing_contractor",
"doctor", "dentist", "veterinary_care", "physiotherapist",
"real_estate_agency", "lawyer", "accounting", "insurance_agency",
"gym", "school", "florist", "photographer",
"hardware_store", "general_contractor", "storage", "moving_company"
```

Uses Places Nearby Search API with `includedTypes` parameter and a 25-mile radius (40,234 meters). Falls back to text search on error.

### Step 4: AI Reasoning Pass (Optional)

Uses Claude claude-sonnet-4-6 with web search to suggest 8 additional business types specific to the local economy that keyword search might miss. Focuses on trades, industrial suppliers, and family businesses.

### Step 5: Deduplication by place_id

All results from keyword, type, and AI passes are deduplicated by Google Place ID in memory using a `Set`. Already-existing prospects in the CRM are also skipped.

### Step 6: Website Detection

Each unique result gets a Places Details API call. Businesses **with** a `websiteUri` are filtered out — they already have a website and aren't prospects. Non-operational businesses (permanently closed, etc.) are also skipped.

### Step 7: Chain Exclusion

Exact name match against a hardcoded set of 78 chain businesses:

**Fast food (19):** McDonald's, Subway, Domino's, Pizza Hut, KFC, Taco Bell, Burger King, Wendy's, Chick-fil-A, Sonic, Whataburger, Starbucks, Dunkin, Dairy Queen, Jack in the Box, Popeyes, Raising Cane's, Wingstop, Slim Chickens

**Retail (16):** Walmart, Walgreens, CVS, Dollar General, Dollar Tree, Family Dollar, 7-Eleven, Circle K, Hobby Lobby, Michaels, Tuesday Morning, Burlington, Ross, TJ Maxx, Marshalls, Bealls

**Gas/Auto (12):** Shell, Exxon, Chevron, Marathon, O'Reilly, AutoZone, NAPA, Advance Auto, Christian Brothers, Take 5 Oil Change, Valvoline, Mavis

**Finance/Insurance (14):** H&R Block, Edward Jones, State Farm, Allstate, RE/MAX, Keller Williams, Century 21, Chase, Wells Fargo, Bank of America, Regions Bank, Truist, US Bank, Citizens National Bank

**Utilities (8):** AEP, SWEPCO, Oncor, Entergy, AT&T, Spectrum, Suddenlink, CenterPoint

**Medical chains (4):** DaVita, Concentra, AFC Urgent Care, CareNow

### Step 8: Priority Tiering

- **Tier 1 (high priority):** 5-50 reviews — established enough to be real, small enough to need help
- **Tier 2 (standard):** 50+ reviews — larger businesses, still valid prospects
- **Skipped:** 0 reviews — likely inactive or fake listings

### Step 9: Email Enrichment

For each prospect that passes all filters, the enrichment module (`src/lib/email-enrichment.ts`) tries:

1. **Apollo People Search** — searches Apollo's database for people at the organization by name + city
2. **Apollo Organization Search** — if no person email found, looks up the organization to get its `primary_domain`
3. **Prospeo Domain Search** — if a domain was found, queries Prospeo for verified emails on that domain

Runs in parallel batches of 5 with 500ms delay. Returns `email` + `email_source` (either `"Apollo"` or `"Prospeo"`).

### Step 10: Auto-Save to CRM

All filtered prospects are auto-saved via upsert with `ignoreDuplicates: true` on `place_id`. This preserves any existing outreach status, notes, or follow-up dates from previous scans.

### Step 11: Cold Outreach

Prospects with emails are sent personalized cold emails. Dedup logic:
1. Query all `emailed_at IS NOT NULL` prospects to build a set of already-emailed addresses
2. Deduplicate within the batch (first occurrence wins)
3. On successful send, set `emailed_at` on ALL prospects sharing that email via `.eq("email", prospect.email)`

---

## 6. Email System

### Template Location

`src/lib/emails/cold-outreach.ts` — exports `COLD_OUTREACH_HTML` as a string constant.

### Variable Substitution

```typescript
COLD_OUTREACH_HTML
  .replace(/\{\{firstName\}\}/g, firstName)      // "Rusty" (strips "The/A/An" prefix)
  .replace(/\{\{businessName\}\}/g, businessName) // "The Rusty Hammer"
  .replace(/\{\{reviewCount\}\}/g, reviewCount)   // "23"
  .replace(/\{\{portfolioUrl\}\}/g, url)          // "https://pineyweb.com#work"
  .replace(/\{\{unsubscribeUrl\}\}/g, url)        // "https://pineyweb.com/unsubscribe?id={place_id}"
```

### firstName Extraction

```typescript
function getFirstName(businessName: string): string {
  const cleaned = businessName
    .replace(/^the\s+/i, "")
    .replace(/^a\s+/i, "")
    .replace(/^an\s+/i, "");
  return cleaned.split(" ")[0];
}
```

Examples: "The Rusty Hammer" -> "Rusty", "A&M Auto" -> "A&M", "Deb's Downtown Cafe" -> "Deb's"

### Subject Line

```
{review_count} reviews and no website yet?
```

### From Address

```
Dustin Hartman <hello@pineyweb.com>
```

### Deduplication Logic

1. Before sending: query all prospects with `emailed_at IS NOT NULL`, build set of already-emailed addresses
2. Within batch: track seen emails, skip duplicates (first occurrence wins)
3. On send success: update `emailed_at` on ALL rows matching that email address (handles multi-location businesses)

### Delivery Webhook Tracking

Resend fires webhooks to `POST /api/webhooks/resend`:
- `email.delivered` -> sets `email_delivered: true`, `outreach_status: "contacted"`
- `email.complained` -> sets `email_spam: true`, pauses automation (`daily_cap = 0`), sends admin alert

Webhook verification uses svix with `RESEND_WEBHOOK_SECRET_PINEYWEB`.

---

## 7. Automation Queue

### City Seeding

`POST /api/admin/seed-queue` inserts 207 Texas cities with pre-computed coordinates and populations. Cities are sorted by Haversine distance from Longview, TX.

**Haversine formula (miles):**
```typescript
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Daily Cap Enforcement

- `pineyweb_daily_send_tracker` has one row per day: `date`, `emails_sent`, `daily_cap`
- `daily_cap = 0` pauses all automation
- Cap is checked at the start of every auto-scan invocation
- Cap can be set from the `/admin/queue` page via "Set Cap" button
- "Pause Automation" button sets cap to 0

### Run Until Cap — Browser Loop

The `/admin/queue` page has a "Run Until Cap" button that loops from the browser:

```
1. Call GET /api/admin/cron-trigger (admin-authed proxy)
2. cron-trigger verifies admin session, calls auto-scan with CRON_SECRET
3. auto-scan scans 1 city, returns result
4. Queue page updates stats cards + table via fetchQueueStats()
5. Check: cap_reached? queue exhausted? user clicked Stop?
6. If no: wait 2 seconds, go to step 1
7. If yes: send summary email via POST /api/admin/send-run-summary
```

Stats cards poll every 5 seconds via `useEffect` + `setInterval` while `isRunning` is true.

Safety limit: 50 iterations max per run.

### Cron Schedule

The auto-scan cron has been removed from `vercel.json`. Scanner runs are triggered manually via the "Run Until Cap" button. Only `payment-check` runs on cron (1pm UTC daily).

---

## 8. Customization Guide — Replicating for a New Client

### Step 1: Keywords and Place Types

Edit the `KEYWORDS` and `PLACE_TYPES` arrays in `src/app/api/admin/scanner/route.ts`.

**For a home services company targeting homeowners:**
```typescript
const KEYWORDS = [
  "new home construction", "home builder", "custom home",
  "home renovation", "kitchen remodel", "bathroom remodel",
  "real estate closing", "title company", "mortgage lender",
  "moving company", "interior designer", "home inspector",
  // ... industry-specific terms
];
```

**For a property management company:**
```typescript
const KEYWORDS = [
  "apartment complex", "rental property", "property management",
  "real estate investor", "commercial real estate",
  // ... industry-specific terms
];
```

### Step 2: Chain Exclusions

Update the `CHAINS` set with chains relevant to the client's industry. Remove irrelevant chains (e.g., fast food for a B2B client) and add industry-specific chains to exclude.

### Step 3: Target Audience Filters

Modify the `checkWebsites` function:
- **Businesses without websites** (current): `if (detail.website) { skip; }` — keeps businesses without websites
- **Businesses with websites** (reverse): `if (!detail.website) { skip; }` — for clients selling services TO businesses that already have websites
- **All businesses:** Remove the website check entirely

### Step 4: Priority Tiering

Adjust review count thresholds in `checkWebsites`:
```typescript
// Current: Tier 1 = 5-50 reviews, Tier 2 = 50+
const tier = (reviewCount >= 5 && reviewCount <= 50) ? 1 : 2;

// For targeting larger businesses:
const tier = (reviewCount >= 50 && reviewCount <= 200) ? 1 : 2;
```

### Step 5: Email Template

Copy and customize `src/lib/emails/cold-outreach.ts`:
- Replace company name, from address, signature
- Update the pitch copy for the client's industry
- Change CTA button text and link
- Update unsubscribe URL to the client's domain

### Step 6: Resend Domain Setup

1. Add client's domain to Resend
2. Configure DNS records (SPF, DKIM, DMARC)
3. Set up webhook endpoint for delivery tracking
4. Update `from` address in outreach route

### Step 7: Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=       # Client's Supabase project
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Client's anon key
SUPABASE_SERVICE_ROLE_KEY=      # Client's service role key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY= # Google API key with Places API enabled
ANTHROPIC_API_KEY=              # Anthropic API key for AI reasoning pass
APOLLO_API_KEY=                 # Apollo.io API key for email enrichment
PROSPEO_API_KEY=                # Prospeo API key for domain email search
RESEND_API_KEY=                 # Resend API key
RESEND_WEBHOOK_SECRET_PINEYWEB= # Svix webhook secret from Resend
CRON_SECRET=                    # Shared secret for cron auth
NEXT_PUBLIC_APP_URL=            # App URL for internal API calls
```

### Step 8: Database Setup

Run all migrations in `supabase/migrations/` numbered 015-020:
- `015_emailed_at.sql` — adds emailed_at column
- `016_email_source.sql` — adds email_source column
- `017_delivery_tracking.sql` — adds email_delivered, email_spam columns
- `018_scanner_automation.sql` — creates scanner_queue and daily_send_tracker tables
- `019_queue_rls.sql` — RLS policies for queue tables
- `020_dedup_emailed_prospects.sql` — backfills duplicate email cleanup

---

## 9. Cost Breakdown

### Google Places API (New)

| Operation | Cost | Per City Estimate |
|-----------|------|-------------------|
| Text Search | $0.032 per request | ~43 keyword searches = $1.38 |
| Nearby Search | $0.032 per request | ~28 type searches = $0.90 |
| Place Details (Basic) | $0.017 per request | ~30-80 detail lookups = $0.51-$1.36 |
| **Total per city** | | **~$2.79-$3.64** |

### Apollo.io + Prospeo — Email Enrichment

| Service | Cost | Notes |
|---------|------|-------|
| Apollo People Search | Free tier: 10,000 credits/mo | 1 credit per search |
| Apollo Org Search | Free tier: included | 1 credit per search |
| Prospeo Domain Search | ~$0.01 per search | Only called when Apollo finds a domain but no direct email |
| **Per prospect** | | **~$0.00-$0.01** (free via Apollo, $0.01 if Prospeo fallback used) |

### Resend

| Volume | Cost |
|--------|------|
| 0-3,000 emails/mo | Free |
| 3,001-50,000 emails/mo | $20/mo |
| 50,001-100,000 emails/mo | $45/mo |

### Estimated Monthly Cost by Tier

| Tier | Emails/day | Cities/mo | Google Places | Enrichment | Resend | Total |
|------|-----------|-----------|---------------|------------|--------|-------|
| Starter (25/day) | 750/mo | ~15-20 | ~$55-$73 | ~$0-$5 | Free | **~$55-$78/mo** |
| Growth (50/day) | 1,500/mo | ~30-40 | ~$110-$146 | ~$0-$10 | $20 | **~$130-$176/mo** |
| Agency (100/day) | 3,000/mo | ~60-80 | ~$220-$291 | ~$0-$20 | $20 | **~$240-$331/mo** |

---

## 10. Known Limitations

### Email Hit Rate
Email enrichment via Claude web search finds public emails for roughly 2-5% of ultra-local businesses. Most small businesses (plumbers, hair salons, etc.) don't have email addresses published on public directories. This means scanning 100 businesses might yield 2-5 usable email addresses.

### Google Places API (New) Field Names
The Places API (New) uses different field names than the legacy API:
- `displayName.text` instead of `name`
- `formattedAddress` instead of `formatted_address`
- `nationalPhoneNumber` instead of `formatted_phone_number`
- `userRatingCount` instead of `user_ratings_total`
- `websiteUri` instead of `website`
- `businessStatus` instead of `business_status`

Field masks use `places.` prefix in search results but no prefix in detail responses.

### Vercel Serverless Timeout
Vercel serverless functions have a 60-second timeout on the Hobby plan (300s on Pro). The scanner batches 5 keywords/types per call to stay within limits. The "Run Until Cap" loop runs from the browser, making one API call per city to avoid timeout issues entirely.

### Browser-Based Loop
The "Run Until Cap" loop requires the browser tab to stay open. If the user closes the tab or navigates away, the loop stops. Stats may be slightly out of sync until the next `fetchQueueStats()` call.

### Places API Result Limits
Google Places Text Search and Nearby Search return a maximum of 20 results per request. For popular categories in large cities, this means some businesses are missed. The multi-keyword approach (43 keywords + 28 types) partially compensates by catching businesses from different angles.

### Chain Matching
Chain exclusion uses exact name matching. Variations like "McDonald's Restaurant" or "Subway #12345" won't be caught. The chain list needs periodic updates as new chains enter the market.

### Rate Limits
- Google Places API: 600 requests per minute (default)
- Apollo.io: 10,000 credits/mo on free tier, rate limited per minute
- Prospeo: rate limited per plan
- Resend: 10 emails per second on free tier
- Scanner enforces 200ms delay between outreach emails and 500ms between enrichment batches
