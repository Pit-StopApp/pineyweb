# Scanner CRM — Deployment Guide

This document is a single-prompt replication guide. Attach it to a Claude chat with your ideal customer profile filled in and say "build this." Every file path, env var, and gotcha is documented.

---

## 1. What This System Does

The Scanner CRM finds local businesses in a geographic area using Google Places, filters out chains and businesses that don't match your criteria, enriches the qualifying prospects with email addresses using multiple channels (Facebook scraping, Apollo, Prospeo, PDL), sends personalized cold outreach emails via Resend, and tracks every interaction in a built-in CRM — all from a single admin dashboard. You click "Run Until Cap," it scans cities one by one expanding outward from a home base, finds prospects, emails them, and stops when your daily cap is hit. The next day, pick up where you left off.

---

## 2. Ideal Customer Profile (ICP) — TEMPLATE

Fill this out before building. Every customization decision flows from these answers. Copy this section and replace the examples with your actual targets.

```
Business type being targeted:
  Example: "Local businesses without a website"
  Your answer: _____

Geographic area:
  Example: "Texas, expanding outward from Longview, TX"
  Your answer: _____

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
  Your keywords: _____

Place types for Google Nearby Search:
  Example: "car_repair, beauty_salon, plumber, dentist..."
  Your place types: _____

Chains to exclude:
  Example: "McDonald's, Walmart, Starbucks, State Farm..."
  Your exclusions: _____

Email tone and angle:
  - From name: _____ (e.g. "Dustin at Piney Web Co.")
  - From email: _____ (e.g. "hello@pineyweb.com")
  - Subject line formula: _____ (e.g. "{review_count} reviews and no website yet?")
  - Pitch angle: _____ (e.g. "You're getting great reviews but customers can't find you online")
  - CTA: _____ (e.g. "See what we built for businesses like yours")
  - Unsubscribe URL: _____ (e.g. "https://yourdomain.com/unsubscribe?id={place_id}")
```

---

## 3. Tech Stack

- **Next.js 14** — App framework. All scanner logic runs as API routes on Vercel serverless functions.
- **Supabase** — Postgres database for prospects, queue, and daily tracking. Auth for admin access. Service role key bypasses RLS for server operations.
- **Vercel** — Hosting and deployment. Serverless functions have 60s timeout on Hobby, 300s on Pro.
- **Google Places API (New)** — Finds businesses by keyword and type, detects websites, provides ratings/reviews/phone. Uses `places.googleapis.com/v1/` endpoints.
- **Playwright** — Browser automation for the Facebook scraper. Runs locally, not on Vercel.
- **Apollo.io** — Email enrichment step 1. Searches people database by organization name + city. Free tier: 10,000 credits/month.
- **Prospeo** — Email enrichment step 2. Domain-based email search when Apollo finds an org domain but no direct email. ~$0.01/search.
- **Anthropic Claude API** — AI verification of Facebook page matches before saving email. Uses Sonnet for fast, cheap verification. ~$0.003/verification.
- **Resend** — Sends cold outreach emails. Handles delivery confirmation, bounce, and spam complaint webhooks via svix. Free tier: 3,000 emails/month.
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
| `ANTHROPIC_API_KEY` | Anthropic API key (used for Claude AI match verification in Facebook scraper) |
| `APOLLO_API_KEY` | Apollo.io API key for email enrichment |
| `PROSPEO_API_KEY` | Prospeo API key for domain email search |
| `PDL_API_KEY` | People Data Labs API key (optional, for person-name enrichment) |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `RESEND_WEBHOOK_SECRET_PINEYWEB` | Svix webhook secret from Resend (for delivery/bounce tracking) |
| `CRON_SECRET` | Shared secret for authenticating cron/auto-scan calls |
| `NEXT_PUBLIC_APP_URL` | Full app URL for internal API calls (e.g. `https://yourdomain.com`) |
| `PINEYWEB_URL` | Base URL for outreach API calls from Facebook scraper (default: `https://pineyweb.com`) |
| `FACEBOOK_STATE_FILE` | Path to saved Facebook session cookies (default: `scripts/fb-session.json`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key for analytics |

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
| email_source | TEXT | Where the email came from: "Apollo", "Prospeo", "PDL", "Facebook" |
| facebook_url | TEXT | URL of matched Facebook page (set by Facebook scraper) |
| rating | NUMERIC | Google star rating (1-5) |
| review_count | INTEGER | Number of Google reviews |
| priority_tier | INTEGER | 1 = high priority, 2 = standard |
| outreach_status | TEXT | new, contacted, follow_up, closed_won, closed_lost, lost |
| follow_up_date | DATE | Next follow-up date (set manually) |
| notes | TEXT | Free-text notes about the prospect |
| contact_method | TEXT | Email, Phone, facebook_message, Both |
| emailed_at | TIMESTAMP | Set immediately when email sent. **Source of truth for dedup.** |
| email_delivered | BOOLEAN | Set true by Resend delivery webhook |
| email_bounced | BOOLEAN | Set true by Resend bounce webhook |
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
- `src/app/api/admin/scanner/route.ts` — Main scan endpoint. Keyword search, type search, website detection, chain exclusion, priority tiering, auto-save to CRM.
- `src/app/admin/scanner/page.tsx` — Scanner UI page for manual single-city scans.

### Enrichment
- `src/lib/email-enrichment.ts` — Shared module: Apollo people search → Apollo org search → Prospeo domain search. Returns `{ email, source }`.
- `src/app/api/admin/enrich/route.ts` — Bulk enrichment endpoint. Accepts prospect IDs, runs enrichment in batches of 5.
- `scripts/facebook-scraper.ts` — **Primary enrichment tool.** Playwright-based Facebook scraper that finds business Facebook pages, extracts emails, verifies matches with Claude AI, and saves to Supabase. Runs locally.
- `scripts/session-reports/master-report.csv` — Consolidated CSV of all Facebook scraper sessions (gitignored).

### Outreach
- `src/app/api/admin/outreach/route.ts` — Cold email sender with case-insensitive dedup. Sets `emailed_at` immediately on send.
- `src/lib/emails/cold-outreach.ts` — HTML email template with `{{variable}}` placeholders.
- `src/app/api/webhooks/resend/route.ts` — Resend webhook handler for delivery confirmation, bounces, and spam complaints.

### CRM
- `src/app/admin/prospects/page.tsx` — Prospects CRM page. Table with sortable columns, status filters, search, pagination, notes modal, bulk enrichment, bulk outreach.
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
5. **Deduplicate by place_id** — all results from all passes are merged and deduplicated in memory. Already-existing CRM prospects are skipped.
6. **Exclude chains** — exact name match against a hardcoded set of 78 national chains (fast food, retail, gas stations, banks, etc.).
7. **Check for websites** — each remaining prospect gets a Google Places Details API call. Businesses WITH a website are filtered out (they already have what we're selling). Non-operational businesses are also skipped.
8. **Skip zero-review listings** — businesses with 0 reviews are likely inactive or fake.
9. **Assign priority tier** — Tier 1 (high): 5-50 reviews (established but small). Tier 2 (standard): 50+ reviews.
10. **Auto-save to CRM** — all prospects are upserted by `place_id` with `ignoreDuplicates: true`. This preserves existing outreach status, notes, and follow-up dates if the city is re-scanned.

---

## 8. Email Enrichment

### Overview

Email enrichment runs through multiple channels. The **Facebook scraper** is the primary method (~50% hit rate). API-based enrichment (Apollo/Prospeo/PDL) supplements it for businesses not found on Facebook (~1.5-9.5% hit rate).

### Channel 1: Facebook Scraper (Primary — ~50% hit rate)

**File:** `scripts/facebook-scraper.ts`

The Facebook scraper is a Playwright-based browser automation tool that searches Facebook for each prospect's business page, extracts email addresses from the page, verifies the match using Claude AI, and saves results to Supabase.

#### How It Works

1. **Fetch prospects** — queries Supabase for all prospects where `email IS NULL`, `phone IS NOT NULL`, `review_count >= 5`, `facebook_url IS NULL`, and not already marked as "No Facebook presence" or "Facebook found, no email listed"
2. **Shuffle and iterate** — randomizes order to avoid geographic clustering patterns
3. **Search Facebook** — navigates to `facebook.com/search/pages/?q={business name} {city} TX`, scans results for fuzzy name matches
4. **Retry with simplified name** — if no match found, strips suffix words (LLC, Inc, DDS, MD, city name) and retries with first 2-3 meaningful words
5. **Check for dead business** — before extracting email, checks for:
   - "Permanently Closed" text
   - Most recent post date older than 24 months
   - No posts found at all
   - Relative year indicators ("2y" = 2 years ago)
6. **Check for website** — detects full URLs and bare domain patterns for website builders (business.site, linktr.ee, squarespace.com, wix.com, weebly.com, etc.). Businesses with websites are marked `outreach_status: "lost"` and skipped
7. **Extract email** — scans main page text, mailto links, and contact info page. Sanitizes Facebook UI noise (EmailMessenger, MobileEmail, Comment as...) before extraction. Progressive trimming handles concatenated text (e.g. `email@example.comHighlights` → `email@example.com`)
8. **Verify match with Claude AI** — if phone was not confirmed, calls Claude Sonnet to verify the Facebook page matches the prospect. Confidence >= 7/10 required to save. Phone-confirmed matches skip verification to save API credits
9. **Save to Supabase** — saves email, email_source: "Facebook", and facebook_url
10. **Send outreach** — calls `/api/admin/outreach` to send cold email automatically for verified matches
11. **Follow page** — clicks the Follow button on the business's Facebook page after saving email
12. **Browse naturally** — scrolls through the page for 30-90 seconds between prospects

#### Human-Like Behavior

The scraper implements extensive anti-detection measures:
- **Hover before click** — moves mouse to element, pauses 500-1000ms, then clicks
- **Mistype and correct** — 30% chance of typing wrong character then backspacing
- **Natural scrolling** — large 400-800px scrolls with 2-5 second pauses, mouse moves to visible content
- **Photo pauses** — 30% chance of pausing 2-4 seconds on visible photos
- **Focus loss** — after finding email, minimizes browser for 20-40 seconds (simulates writing down email)
- **About tab exploration** — 30% chance of clicking About tab instead of navigating directly to contact URL
- **Linger on no-email pages** — stays 3-5 extra seconds when no email found
- **Scroll to top** — 40% chance of scrolling back to top before leaving a page
- **Feed breaks** — every 8-12 prospects, browses the Piney Web Co. Facebook page for 15-25 seconds
- **Extended breaks** — every 15-20 prospects, pauses 3-7 minutes
- **Randomized viewport** — 1280-1480 x 800-1000px

#### Session Management

- Cookies saved to `scripts/fb-session.json` (gitignored)
- On startup, validates saved session by navigating to facebook.com and checking for logged-in elements
- If session expired, opens login page and auto-detects login completion (no keypress needed)
- Detects logged-in state by checking for `[aria-label="Facebook"]`, `[role="navigation"]`, `[aria-label="Your profile"]`, `[data-pagelet="Stories"]`

#### Master CSV Report

All results are saved to `scripts/session-reports/master-report.csv` with columns:
`session_date`, `session_id`, `prospect_name`, `facebook_page_found`, `match_type` (exact/fuzzy/no_match), `phone_confirmed`, `email_found`, `email_sent`, `facebook_url`, `city`, `notes`, `match_verified`, `verification_reason`

Reports are saved in three places: normal completion, SIGINT (Ctrl+C), and auto-save every 25 prospects.

#### Progress Tracking

Logs a progress line every 10 prospects:
```
[Progress] 30/1000 | Emails found: 14 | Saved: 13 | Sent: 12 | Skipped: 2 | No Facebook: 8 | No email: 5 | Hit rate: 46.7%
```

SIGINT handler prints full session summary before exiting.

### Channel 2: Apollo/Prospeo (API-based — ~1.5% hit rate)

**File:** `src/lib/email-enrichment.ts`

The enrichment module runs a three-step waterfall:

1. **Apollo People Search** — POST to `api.apollo.io/v1/mixed_people/search` with organization name + city + state. If Apollo has a person with an email at that org, returns it immediately. Source: "Apollo".
2. **Apollo Organization Search** — POST to `api.apollo.io/v1/organizations/search` with org name + city. Gets the organization's `primary_domain` if it exists.
3. **Prospeo Domain Search** — POST to `api.prospeo.io/domain-search` with the domain from step 2. Finds verified emails on that domain. Source: "Prospeo".

If all three steps fail, returns `{ email: null, source: null }`.

### Channel 3: People Data Labs (Optional — ~9.5% for person-named businesses)

**File:** `scripts/pdl-test.ts`

PDL person enrichment works for businesses named after people (law offices, CPAs, realtors, chiropractors). Searches by person name + location. Not effective for generic business names.

### Validation

All returned emails are validated with `isValidEmail()` — must be a string containing both `@` and `.`. The Facebook scraper uses progressive trimming to clean concatenated text before validation.

### Hit Rate Summary

| Method | Expected Hit Rate | Cost | Notes |
|--------|-------------------|------|-------|
| Facebook scraper | ~50% | ~$0 (free) + ~$0.003/verification (Claude API) | Primary method. Requires local machine with Facebook account |
| Apollo/Prospeo API | ~1.5% | ~$0 (free tier) | 10,000 Apollo credits/month free. Prospeo ~$0.01/search |
| PDL person enrichment | ~9.5% | Free tier limited | Only for person-named businesses |

### Bulk Enrichment (API-based)

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

Outreach is triggered automatically by the Facebook scraper for verified matches, and manually via the "Send Cold Outreach" button on the admin prospects page for API-enriched prospects.

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
- `email.bounced` — sets `email_delivered: false`, `email_bounced: true`, `notes: "Email bounced"`
- `email.complained` — sets `email_spam: true`, auto-pauses sending (`daily_cap = 0`), sends admin alert

---

## 10. CRM — Prospects Page

### Columns Displayed

Business Name, City, Phone, FB (Facebook link icon), Priority (T1/T2 badge), Status (pill badge with color), Notes (preview), Actions (cycle status, notes modal, set follow-up date).

### Notes Modal

The Notes column shows a preview of the first 20 characters. Clicking the preview or the notes icon in the Actions column opens a centered modal with the business name as title, a pre-filled textarea for editing, and Save/Cancel buttons. Save calls PATCH to `/api/admin/prospects` and shows a brief "Saved" confirmation before closing.

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

## 12. Cost Breakdown

### Per-City Scan Costs

| Service | Cost per city | Notes |
|---------|--------------|-------|
| Google Places API | ~$2.80-$3.65 | 43 text searches + 28 nearby searches + 30-80 detail lookups |
| Apollo | $0 | Free tier: 10,000 credits/month |
| Prospeo | ~$0-$0.50 | ~$0.01/search, only called when Apollo finds a domain |
| **Total per city** | **~$2.80-$4.15** | |

### Facebook Scraper Costs

| Service | Cost | Notes |
|---------|------|-------|
| Facebook scraping | $0 | Uses personal Facebook account, no API costs |
| Claude AI verification | ~$0.003/prospect | Only called when phone not confirmed (~60% of matches) |
| Outreach emails (Resend) | $0 | Free tier: 3,000/month |
| **Total per 1000 prospects** | **~$1.80** | Verification only |

### Monthly Running Costs (Typical)

| Service | Monthly cost | Notes |
|---------|-------------|-------|
| Vercel | $0 | Hobby plan |
| Supabase | $0 | Free tier |
| Apollo | $0 | Free tier (10,000 credits) |
| Resend | $0 | Free tier (3,000 emails) |
| Google Places | $50-$200 | Depends on number of cities scanned |
| Claude API | $5-$15 | Match verification |
| **Total** | **$55-$215** | Primarily Google Places API |

---

## 13. Customizing For A New Client

Step-by-step checklist:

- [ ] **Fill out ICP** — complete section 2 above with the client's target market, qualification criteria, and email angle
- [ ] **Update keyword list** — edit `KEYWORDS` array in `src/app/api/admin/scanner/route.ts` with industry-specific search terms
- [ ] **Update place types** — edit `PLACE_TYPES` array in the same file with relevant Google place type codes
- [ ] **Update chain exclusion list** — edit `CHAINS` set in the same file. Remove irrelevant chains, add industry-specific ones
- [ ] **Update website filter** — in `checkWebsites()`, decide: keep businesses WITHOUT websites (default), WITH websites, or all
- [ ] **Update priority tiering** — adjust review count thresholds in `checkWebsites()` if targeting different business sizes
- [ ] **Update email template** — edit `src/lib/emails/cold-outreach.ts` with new copy, from address, subject line, CTA, unsubscribe URL
- [ ] **Update outreach route** — edit `src/app/api/admin/outreach/route.ts` for new `from` address and subject line formula
- [ ] **Set up Supabase project** — create new project, run all migrations in `supabase/migrations/` (015 through 021)
- [ ] **Set up RLS policies** — run migration 019 for queue table access
- [ ] **Set up Resend domain** — add client's domain, configure SPF/DKIM/DMARC DNS records, create webhook endpoint for delivery + bounce + spam tracking
- [ ] **Seed cities** — edit `CITIES` array in `src/app/api/admin/seed-queue/route.ts` for target geography, update home base coordinates
- [ ] **Add all env vars to Vercel** — every variable from section 4
- [ ] **Set Google Cloud billing alerts** — set a budget alert at $10/day before running any scans
- [ ] **Test scan on 1 city** — run a single city scan from the scanner page, verify prospects look correct
- [ ] **Test enrichment on 10 prospects** — run "Find Emails" and verify results
- [ ] **Test outreach on 5 prospects** — send to a small batch, verify emails arrive, check delivery webhook fires
- [ ] **Set daily cap** — start conservative (10-25/day), increase after monitoring delivery rates
- [ ] **Enable cron (optional)** — add auto-scan to `vercel.json` only when confident the system is working correctly

### Facebook Scraper Setup

- [ ] **Install Playwright** — `npm install playwright` and `npx playwright install chromium`
- [ ] **Set env vars locally** — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `PINEYWEB_URL` in `.env.local`
- [ ] **First run** — `npx tsx scripts/facebook-scraper.ts` — browser opens, log into Facebook manually, session auto-detects and saves
- [ ] **Update personal profile markers** — edit `PERSONAL_PROFILE_MARKERS` array in `facebook-scraper.ts` with your Facebook profile URL fragments to prevent scraping your own profile
- [ ] **Update feed break URL** — edit `feedBreak()` to point to your own Facebook page URL for between-prospect breaks
- [ ] **Update text sanitization** — edit `sanitizePageText()` to strip your own "Comment as" name from page text
- [ ] **Review master CSV** — check `scripts/session-reports/master-report.csv` after each run to audit match quality
- [ ] **Monitor verification results** — check `match_verified` and `verification_reason` columns for false positives/negatives

---

## 14. Known Limitations & Gotchas

### Facebook Scraper Limitations

- **Requires a real Facebook account.** The scraper logs into Facebook as a real user. Using a fake or bot account risks permanent ban. Use a legitimate account that you're willing to use for business purposes.

- **Requires residential IP.** Facebook detects and blocks datacenter IPs. The scraper must run from a residential internet connection (home, mobile hotspot). VPNs and cloud servers will trigger login challenges.

- **Runs locally only — cannot be deployed to Vercel or any cloud service.** Playwright browser automation requires a local machine with a display (or headless mode, which Facebook detects). Currently runs on a MacBook.

- **Session must be maintained.** Facebook sessions expire after days/weeks. The scraper validates sessions on startup and re-prompts for login if expired, but you must be present to log in.

- **Rate limited by human-like timing.** Each prospect takes 1-3 minutes including browsing, scrolling, and verification. A session of 100 prospects takes ~2-4 hours. The scraper runs until all prospects are processed or manually stopped with Ctrl+C.

- **Facebook page structure changes without notice.** Selectors for Follow buttons, About tabs, and contact info may break when Facebook updates their UI. Monitor for extraction failures.

- **Claude AI verification costs money.** Each verification call costs ~$0.003. Phone-confirmed matches skip verification. Budget ~$1.80 per 1000 prospects.

### General System Limitations

- **`emailed_at` must be set immediately on send, not on webhook delivery.** If you wait for the Resend delivery webhook to set `emailed_at`, the next scan run can re-email the same prospect before the webhook fires. Set it at send time. The webhook sets `email_delivered` as a secondary confirmation.

- **Email dedup is case-insensitive.** "John@Example.com" and "john@example.com" are the same address. All dedup comparisons lowercase emails. The `emailed_at` update uses `ilike` for case-insensitive matching in Supabase.

- **Supabase JS client defaults to LIMIT 1000.** If you query prospects without `.range()` or `.limit()`, you silently get only the first 1000 rows. The prospects API route uses a `.range()` loop to fetch all rows. Always do this for any query that might return more than 1000 results.

- **Google Places API costs ~$2.80-$3.65 per city scan.** At 200+ cities, a full scan costs $550-$730. Set Google Cloud billing alerts before running.

- **Apollo/Prospeo only work for businesses with domains.** If a business doesn't have a website (which is the whole point of our scanner), it probably doesn't have a domain in Apollo's database either. This is why the Facebook scraper is the primary enrichment method.

- **Government and utility entities slip through.** Filter business names containing: "tax collector", "tax office", "police department", "sheriff", "fire department", "city of ", "county clerk", "county tax", "department of public safety", "courthouse", "ISD" (as whole word). Use word boundary matching.

- **Cron is disabled by default.** This prevents runaway API costs. The "Run Until Cap" button gives you full control. Only enable cron (`vercel.json`) after the system is tested.

- **Vercel serverless functions timeout at 60 seconds (Hobby) or 300 seconds (Pro).** The scanner batches 5 keywords per API call to stay within limits.

- **Chain exclusion uses exact name match.** "McDonald's" is excluded but "McDonald's Restaurant" or "McDonald's #12345" are not. The chain list needs periodic updates.

- **Places API returns max 20 results per search.** In large cities, many businesses are missed. The 43 keywords + 28 types approach partially compensates by catching businesses from different angles.

- **The browser tab must stay open during "Run Until Cap."** If the user navigates away, the loop stops.

- **Always validate enriched emails before saving.** API responses can return boolean `true` or other non-string values in email fields. The `isValidEmail()` guard checks `typeof === "string"` and contains `@` and `.` before saving.

- **If you send emails outside the platform, backfill `emailed_at`.** Run a SQL UPDATE in Supabase to set `emailed_at = NOW()` on any prospects you've already emailed manually. Otherwise the outreach route will re-email them.
