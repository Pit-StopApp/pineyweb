# Scanner CRM — Deployment Guide

This document is a single-prompt replication guide. Attach it to a Claude chat with your ideal customer profile filled in and say "build this." Every file path, env var, and gotcha is documented.

---

## 1. What This System Does

The Scanner CRM finds local businesses in a geographic area using Google Places, filters out chains and businesses that don't match your criteria, enriches the qualifying prospects with email addresses using Apollo and Prospeo, sends personalized cold outreach emails via Resend, and tracks every interaction in a built-in CRM — all from a single admin dashboard. You click "Run Until Cap," it scans cities one by one expanding outward from a home base, finds prospects, emails them, and stops when your daily cap is hit. The next day, pick up where you left off.

---

## 2. Ideal Customer Profile (ICP) — FILL THIS IN

Fill this out before building. Every customization decision flows from these answers.

```
Business type being targeted:
  Example: "Local businesses without a website"

Geographic area:
  Example: "East Texas, expanding outward from Longview, TX"

What qualifies a lead:
  - Minimum Google review count: _____ (default: 5)
  - Review count range for high priority: _____ to _____ (default: 5-50)
  - Must have phone number: yes/no (default: yes)
  - Must NOT have website: yes/no (default: yes)

What disqualifies a lead:
  - Has a website: yes/no
  - Is a national chain: yes/no
  - Is a government entity: yes/no
  - Has zero reviews: yes/no

Keywords that describe the ideal customer (used for Google search):
  Example: "plumber, electrician, hair salon, auto shop, restaurant..."

Place types for Google Nearby Search:
  Example: "car_repair, beauty_salon, plumber, dentist..."

Chains to exclude:
  Example: "McDonald's, Walmart, Starbucks, State Farm..."

Email tone and angle:
  - From name: _____
  - From email: _____
  - Subject line formula: _____
  - Pitch angle: _____
  - CTA: _____
  - Unsubscribe URL: _____
```

---

## 3. Tech Stack

- **Next.js 14** — App framework. All scanner logic runs as API routes on Vercel serverless functions.
- **Supabase** — Postgres database for prospects, queue, and daily tracking. Auth for admin access. Service role key bypasses RLS for server operations.
- **Vercel** — Hosting and deployment. Serverless functions have 60s timeout on Hobby, 300s on Pro.
- **Google Places API (New)** — Finds businesses by keyword and type, detects websites, provides ratings/reviews/phone. Uses `places.googleapis.com/v1/` endpoints.
- **Apollo.io** — Email enrichment step 1. Searches people database by organization name + city. Free tier: 10,000 credits/month.
- **Prospeo** — Email enrichment step 2. Domain-based email search when Apollo finds an org domain but no direct email. ~$0.01/search.
- **Resend** — Sends cold outreach emails. Handles delivery confirmation and spam complaint webhooks via svix. Free tier: 3,000 emails/month.
- **People Data Labs (optional)** — Alternative enrichment for person-named businesses (lawyers, CPAs, realtors). ~9.5% hit rate on name+location lookups. Free tier limited.

---

## 4. Environment Variables

Every env var the system needs. All go in `.env.local` for development and Vercel Environment Variables for production.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud API key with Places API (New) enabled |
| `ANTHROPIC_API_KEY` | Anthropic API key (used for AI reasoning pass in scanner) |
| `APOLLO_API_KEY` | Apollo.io API key for email enrichment |
| `PROSPEO_API_KEY` | Prospeo API key for domain email search |
| `PDL_API_KEY` | People Data Labs API key (optional, for person-name enrichment) |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `RESEND_WEBHOOK_SECRET_PINEYWEB` | Svix webhook secret from Resend (for delivery tracking) |
| `CRON_SECRET` | Shared secret for authenticating cron/auto-scan calls |
| `NEXT_PUBLIC_APP_URL` | Full app URL for internal API calls (e.g. `https://yourdomain.com`) |
| `APIFY_API_KEY` | Apify API key (optional, tested but 0% hit rate on Facebook scraping) |

---

## 5. Database Tables

### prospects (e.g. `pineyweb_prospects`)

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Auto-generated primary key |
| place_id | TEXT | Google Place ID, **unique constraint** — prevents duplicate businesses |
| business_name | TEXT | Business name from Google Places |
| address | TEXT | Full formatted address |
| city | TEXT | City name extracted from address |
| phone | TEXT | Phone number from Google |
| email | TEXT | Email found via enrichment (null if not found) |
| email_source | TEXT | Where the email came from: "Apollo", "Prospeo", "PDL" |
| rating | NUMERIC | Google star rating (1-5) |
| review_count | INTEGER | Number of Google reviews |
| priority_tier | INTEGER | 1 = high priority, 2 = standard |
| outreach_status | TEXT | new, contacted, follow_up, closed_won, closed_lost |
| follow_up_date | DATE | Next follow-up date (set manually) |
| notes | TEXT | Free-text notes about the prospect |
| contact_method | TEXT | Email, Phone, Both |
| emailed_at | TIMESTAMP | Set immediately when email sent. **Source of truth for dedup.** |
| email_delivered | BOOLEAN | Set true by Resend delivery webhook |
| email_spam | BOOLEAN | Set true by Resend spam complaint webhook |
| created_at | TIMESTAMP | When prospect was first saved |
| updated_at | TIMESTAMP | Last modification |

### scanner_queue (e.g. `pineyweb_scanner_queue`)

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| city | TEXT | City name |
| state | TEXT | State abbreviation |
| lat | NUMERIC | Latitude |
| lng | NUMERIC | Longitude |
| distance_from_longview_miles | NUMERIC | Haversine distance from home base |
| population | INTEGER | City population estimate |
| status | TEXT | pending, scanning, complete, error |
| prospects_found | INTEGER | Prospects saved from this city |
| emails_found | INTEGER | Prospects with emails from this city |
| emails_sent | INTEGER | Emails sent for this city |
| last_scanned_at | TIMESTAMP | When scan completed |

### daily_send_tracker (e.g. `pineyweb_daily_send_tracker`)

| Column | Type | Purpose |
|--------|------|---------|
| date | DATE | Primary key, one row per day |
| emails_sent | INTEGER | Total emails sent today |
| daily_cap | INTEGER | Max emails allowed today. 0 = paused. |

---

## 6. File Structure

### Scanner
- `src/app/api/admin/scanner/route.ts` — Main scan endpoint. Keyword search, type search, AI reasoning pass, website detection, chain exclusion, priority tiering, auto-save to CRM.
- `src/app/admin/scanner/page.tsx` — Scanner UI page for manual single-city scans.

### Enrichment
- `src/lib/email-enrichment.ts` — Shared module: Apollo people search → Apollo org search → Prospeo domain search. Returns `{ email, source }`.
- `src/app/api/admin/enrich/route.ts` — Bulk enrichment endpoint. Accepts prospect IDs, runs enrichment in batches of 5.
- `scripts/pdl-test.ts` — Standalone PDL person enrichment test script (name + location lookup).

### Outreach
- `src/app/api/admin/outreach/route.ts` — Cold email sender with case-insensitive dedup. Sets `emailed_at` immediately on send.
- `src/lib/emails/cold-outreach.ts` — HTML email template with `{{variable}}` placeholders.
- `src/app/api/webhooks/resend/route.ts` — Resend webhook handler for delivery confirmation and spam complaints.

### CRM
- `src/app/admin/prospects/page.tsx` — Prospects CRM page. Table with sortable columns, status filters, search, pagination, inline notes, bulk enrichment, bulk outreach.
- `src/app/api/admin/prospects/route.ts` — GET/POST/PATCH for prospect CRUD. Paginates past Supabase 1000-row default limit.

### Automation
- `src/app/api/cron/auto-scan/route.ts` — Scans exactly 1 city per call. Keyword batches → type batches → outreach → mark complete.
- `src/app/api/admin/cron-trigger/route.ts` — Admin-authenticated proxy. Verifies session + admin role, calls auto-scan with server-side `CRON_SECRET`.
- `src/app/api/admin/queue-stats/route.ts` — Returns queue data and daily tracker for the queue page.
- `src/app/api/admin/seed-queue/route.ts` — Seeds 200+ cities with coordinates and populations, sorted by distance from home base.
- `src/app/api/admin/send-run-summary/route.ts` — Sends one summary email after a "Run Until Cap" session ends.
- `src/app/admin/queue/page.tsx` — Queue management page. Stats cards, progress bar, "Run Until Cap" button, daily cap controls.

---

## 7. How The Scanner Works — Step by Step

1. **User triggers a scan** — either clicking "Scan" on the scanner page for a single city, or clicking "Run Until Cap" on the queue page to process cities automatically.
2. **Geocode the city** — looks up lat/lng from a hardcoded coordinate table. If not found, falls back to a Google Places text search to get coordinates.
3. **Run keyword searches** — for each of 43 keywords (e.g. "plumber near Marshall, TX"), calls Google Places Text Search API. Processes 5 keywords per batch to stay within serverless timeout.
4. **Run place type searches** — for each of 28 Google place types (e.g. "car_repair"), calls Google Places Nearby Search API within a 25-mile radius. Falls back to text search on error.
5. **Optional AI pass** — Claude suggests 8 additional business types specific to the local economy that keyword search might miss.
6. **Deduplicate by place_id** — all results from all passes are merged and deduplicated in memory. Already-existing CRM prospects are skipped.
7. **Exclude chains** — exact name match against a hardcoded set of 78 national chains (fast food, retail, gas stations, banks, etc.).
8. **Check for websites** — each remaining prospect gets a Google Places Details API call. Businesses WITH a website are filtered out (they already have what we're selling). Non-operational businesses are also skipped.
9. **Skip zero-review listings** — businesses with 0 reviews are likely inactive or fake.
10. **Assign priority tier** — Tier 1 (high): 5-50 reviews (established but small). Tier 2 (standard): 50+ reviews.
11. **Enrich with emails** — for each qualifying prospect, try Apollo people search → Apollo org search → Prospeo domain search. Validate that returned values are actual email addresses (contain `@` and `.`).
12. **Auto-save to CRM** — all prospects are upserted by `place_id` with `ignoreDuplicates: true`. This preserves existing outreach status, notes, and follow-up dates if the city is re-scanned.
13. **Send cold outreach** — prospects with emails are sent personalized emails. Dedup ensures no email address is contacted twice.

---

## 8. Email Enrichment

### How It Works

The enrichment module (`src/lib/email-enrichment.ts`) runs a three-step waterfall:

1. **Apollo People Search** — POST to `api.apollo.io/v1/mixed_people/search` with organization name + city + state. If Apollo has a person with an email at that org, returns it immediately. Source: "Apollo".
2. **Apollo Organization Search** — POST to `api.apollo.io/v1/organizations/search` with org name + city. Gets the organization's `primary_domain` if it exists.
3. **Prospeo Domain Search** — POST to `api.prospeo.io/domain-search` with the domain from step 2. Finds verified emails on that domain. Source: "Prospeo".

If all three steps fail, returns `{ email: null, source: null }`.

### Validation

All returned emails are validated with `isValidEmail()` — must be a string containing both `@` and `.`. This prevents boolean `true` or other non-email API response values from being saved to the database.

### Hit Rate Expectations

| Prospect Type | Expected Hit Rate | Why |
|---------------|-------------------|-----|
| Person-named businesses (law offices, CPAs, realtors, chiropractors) | ~9.5% via PDL person enrichment | PDL has good coverage of professionals by name + location |
| Generic business names via Apollo/Prospeo | ~1.5% | Most small local businesses don't have domains in Apollo's database |
| Ultra-local trades (plumbers, electricians, welders) | ~0-2% | Rarely have online presence beyond Google Business |
| Facebook page scraping via Apify | ~0% | Tested, not viable. Local businesses rarely expose email on Facebook. |

### Bulk Enrichment

The enrich API route (`/api/admin/enrich`) accepts an array of prospect IDs. It processes them in parallel batches of 5 with 500ms delay between batches. The prospects page has a "Find Emails" button that triggers this for all prospects without email.

---

## 9. Cold Outreach

### How Emails Are Sent

The outreach route (`/api/admin/outreach`) accepts up to 50 prospects per call. For each prospect:
1. Extract `firstName` from business name — strips leading "The", "A", "An" then takes first word
2. Substitute `{{variables}}` into the HTML template
3. Send via Resend from configured `from` address
4. On success: immediately set `emailed_at` on ALL prospects sharing that email (case-insensitive via `ilike`)
5. 200ms delay between sends

### Deduplication — Critical

Email dedup prevents the same address from being contacted twice. This is the most important piece of the system for protecting domain reputation.

- **Case-insensitive**: all emails are lowercased before comparison
- **Global dedup**: before sending, query ALL prospects where `emailed_at IS NOT NULL`, build a Set of already-emailed addresses
- **Batch dedup**: within the same send batch, track seen emails and skip duplicates (first occurrence wins)
- **`emailed_at` is the source of truth** — not the Resend webhook. Set immediately on successful send, not on delivery confirmation.
- **Multi-location handling**: `emailed_at` is set using `ilike` on the email column, so ALL prospects sharing that email get marked — catches the same business at multiple locations.
- **Manual sends**: if emails are sent outside the platform (Resend dashboard, manually), backfill `emailed_at` in Supabase before running outreach again.

### Customizing The Template

Edit `src/lib/emails/cold-outreach.ts`. The template is a raw HTML string with these variables:

| Variable | Example Value | Notes |
|----------|---------------|-------|
| `{{firstName}}` | Rusty | First word of business name after stripping articles |
| `{{businessName}}` | The Rusty Hammer | Full business name |
| `{{reviewCount}}` | 23 | Google review count |
| `{{portfolioUrl}}` | https://yourdomain.com#work | Link to your portfolio/work |
| `{{unsubscribeUrl}}` | https://yourdomain.com/unsubscribe?id={place_id} | One-click unsubscribe |

Also update in `src/app/api/admin/outreach/route.ts`:
- `from` address (e.g. `"Your Name <hello@yourdomain.com>"`)
- Subject line formula (currently: `{review_count} reviews and no website yet?`)

### Delivery Tracking

Resend fires webhooks to `POST /api/webhooks/resend`:
- `email.delivered` — sets `email_delivered: true` and `outreach_status: "contacted"`
- `email.complained` — sets `email_spam: true`, auto-pauses sending (`daily_cap = 0`), sends admin alert

---

## 10. CRM — Prospects Page

### Columns Displayed

Business Name, City, Phone, Priority (T1/T2 badge), Status (pill badge with color), Notes (preview), Actions (cycle status, notes editor, set follow-up date).

### Notes

The Notes column shows a preview of the first 20 characters of any saved notes. Clicking the preview or the notes icon in the Actions column opens an inline text area below the row. Notes are saved to the `notes` column in `pineyweb_prospects` via PATCH to `/api/admin/prospects` on blur. The prospect `id` is used to update the correct record. Full note text is visible on hover via title attribute.

### Filtering

Status filter pills at the top: All, New, Contacted, Follow Up, Won, Lost. Clicking a filter re-fetches from the API with `?status=` query param — server-side filtering.

### Search

Text input above filters. Client-side filtering on business name or city. Updates in real time as you type.

### Sorting

Clickable column headers: Business Name, City, Priority, Status, Notes. Click to sort ascending, click again for descending. Arrow indicator (↑/↓) shows active sort. Default: priority_tier ascending.

### Pagination

Client-side pagination on the filtered+sorted list. Page size selector: 10, 25, 50, 100. Default: 25. Ellipsis pagination for large result sets (1 ... 4 5 6 ... 99).

### Important: Supabase 1000-Row Limit

The Supabase JS client defaults to `LIMIT 1000`. The prospects API route uses a `.range()` loop to fetch all rows in 1000-row pages. Without this, you silently lose data beyond row 1000.

---

## 11. Automation Queue

### How Cities Get Seeded

`POST /api/admin/seed-queue` inserts 200+ cities with pre-computed lat/lng coordinates and population estimates. Cities are sorted by Haversine distance from the home base (default: Longview, TX). Closest cities are scanned first. Only runs if the queue is empty.

To customize for a different geography: edit the `CITIES` array in `src/app/api/admin/seed-queue/route.ts` and update the `LONGVIEW` constant to your client's home base coordinates.

### Daily Cap

One row per day in `daily_send_tracker`. Controls how many emails can be sent per day.
- Set via the Queue page "Set Cap" input
- `daily_cap = 0` pauses all automation
- "Pause Automation" button sets cap to 0
- Cap is checked at the start of every auto-scan call

### Manual Trigger — "Run Until Cap"

The Queue page has a "Run Until Cap" button that loops from the browser:
1. Calls `/api/admin/cron-trigger` (verifies admin session, proxies to auto-scan with server-side `CRON_SECRET`)
2. Auto-scan processes 1 city: keyword batches → type batches → enrichment → outreach → mark complete
3. Queue page refreshes stats and table
4. If cap not reached and queue not exhausted: wait 2 seconds, repeat
5. When done: sends one summary email via `/api/admin/send-run-summary`
6. "Stop" button appears during run to cancel the loop
7. Safety limit: 50 cities per run

The browser tab must stay open. If closed, the loop stops.

### Why Cron Is Disabled By Default

The auto-scan cron is removed from `vercel.json` by default. This prevents:
- Runaway Google Places API costs if the queue has hundreds of cities
- Unexpected email sends before the template is reviewed
- Burning through Apollo/Prospeo credits before the system is tested

Enable it only after: testing scan on 1 city, reviewing prospects, testing enrichment, testing outreach on a small batch, and setting appropriate daily cap.

To re-enable: add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/auto-scan", "schedule": "0 13 * * *" }
  ]
}
```

---

## 12. Customizing For A New Client

Step-by-step checklist:

- [ ] **Fill out ICP** — complete section 2 above with the client's target market, qualification criteria, and email angle
- [ ] **Update keyword list** — edit `KEYWORDS` array in `src/app/api/admin/scanner/route.ts` with industry-specific search terms
- [ ] **Update place types** — edit `PLACE_TYPES` array in the same file with relevant Google place type codes
- [ ] **Update chain exclusion list** — edit `CHAINS` set in the same file. Remove irrelevant chains, add industry-specific ones
- [ ] **Update website filter** — in `checkWebsites()`, decide: keep businesses WITHOUT websites (default), WITH websites, or all
- [ ] **Update priority tiering** — adjust review count thresholds in `checkWebsites()` if targeting different business sizes
- [ ] **Update email template** — edit `src/lib/emails/cold-outreach.ts` with new copy, from address, subject line, CTA, unsubscribe URL
- [ ] **Update outreach route** — edit `src/app/api/admin/outreach/route.ts` for new `from` address and subject line formula
- [ ] **Set up Supabase project** — create new project, run all migrations in `supabase/migrations/` (015 through 020)
- [ ] **Set up RLS policies** — run migration 019 for queue table access
- [ ] **Set up Resend domain** — add client's domain, configure SPF/DKIM/DMARC DNS records, create webhook endpoint
- [ ] **Seed cities** — edit `CITIES` array in `src/app/api/admin/seed-queue/route.ts` for target geography, update home base coordinates
- [ ] **Add all env vars to Vercel** — every variable from section 4
- [ ] **Set Google Cloud billing alerts** — set a budget alert at $10/day before running any scans
- [ ] **Test scan on 1 city** — run a single city scan from the scanner page, verify prospects look correct
- [ ] **Test enrichment on 10 prospects** — run "Find Emails" and verify results
- [ ] **Test outreach on 5 prospects** — send to a small batch, verify emails arrive, check delivery webhook fires
- [ ] **Set daily cap** — start conservative (10-25/day), increase after monitoring delivery rates
- [ ] **Enable cron (optional)** — add auto-scan to `vercel.json` only when confident the system is working correctly

---

## 13. Known Limitations & Gotchas

- **Email hit rate is low for generic businesses.** Apollo/Prospeo find emails for ~1.5% of small local businesses. PDL person enrichment works at ~9.5% but only for businesses with a person's name (law offices, CPAs, realtors). Facebook scraping via Apify returned 0%. Most plumbers and hair salons simply don't have findable email addresses.

- **`emailed_at` must be set immediately on send, not on webhook delivery.** If you wait for the Resend delivery webhook to set `emailed_at`, the next scan run can re-email the same prospect before the webhook fires. Set it at send time. The webhook sets `email_delivered` as a secondary confirmation.

- **Email dedup is case-insensitive.** "John@Example.com" and "john@example.com" are the same address. All dedup comparisons lowercase emails. The `emailed_at` update uses `ilike` for case-insensitive matching in Supabase.

- **Supabase JS client defaults to LIMIT 1000.** If you query prospects without `.range()` or `.limit()`, you silently get only the first 1000 rows. The prospects API route uses a `.range()` loop to fetch all rows. Always do this for any query that might return more than 1000 results.

- **Google Places API costs ~$2.80-$3.65 per city scan.** That's 43 text searches + 28 nearby searches + 30-80 detail lookups. At 200+ cities, a full scan costs $550-$730. Set Google Cloud billing alerts before running.

- **Apollo/Prospeo only work for businesses with domains.** If a business doesn't have a website (which is the whole point of our scanner), it probably doesn't have a domain in Apollo's database either. The enrichment is most useful for businesses that have SOME online presence (Facebook, Yelp listing) but no website.

- **Government and utility entities slip through.** Filter business names containing: "tax collector", "tax office", "police department", "sheriff", "fire department", "city of ", "county clerk", "county tax", "department of public safety", "courthouse", "ISD" (as whole word). Be careful with "ISD" — substring matching catches "Wisdom" (contains "isd"). Use word boundary matching.

- **Cron is disabled by default.** This prevents runaway API costs. The "Run Until Cap" button gives you full control. Only enable cron (`vercel.json`) after the system is tested and you've set appropriate daily caps and billing alerts.

- **Vercel serverless functions timeout at 60 seconds (Hobby) or 300 seconds (Pro).** The scanner batches 5 keywords per API call to stay within limits. The "Run Until Cap" loop avoids this entirely by making one API call per city from the browser.

- **Chain exclusion uses exact name match.** "McDonald's" is excluded but "McDonald's Restaurant" or "McDonald's #12345" are not. The chain list needs periodic updates.

- **Google Places API (New) uses different field names than legacy.** `displayName.text` not `name`, `formattedAddress` not `formatted_address`, `userRatingCount` not `user_ratings_total`, `websiteUri` not `website`. Field masks use `places.` prefix in search but no prefix in detail calls.

- **Places API returns max 20 results per search.** In large cities, many businesses are missed. The 43 keywords + 28 types approach partially compensates by catching businesses from different angles.

- **The browser tab must stay open during "Run Until Cap."** If the user navigates away, the loop stops. Stats poll every 5 seconds while running.

- **Always validate enriched emails before saving.** API responses can return boolean `true` or other non-string values in email fields. The `isValidEmail()` guard checks `typeof === "string"` and contains `@` and `.` before saving.

- **If you send emails outside the platform, backfill `emailed_at`.** Run a SQL UPDATE in Supabase to set `emailed_at = NOW()` on any prospects you've already emailed manually. Otherwise the outreach route will re-email them.

- **Google Cloud Enterprise pricing vs SKU pricing.** The Places API (New) pricing depends on whether your Google Cloud account is on the default "Pay as you go" or "Enterprise" tier. Enterprise customers may see different per-request costs. Check your Cloud Console billing page.
