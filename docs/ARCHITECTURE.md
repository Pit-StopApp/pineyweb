# Piney Web Co. — Architecture

## Stack
- Next.js 14, TypeScript, Tailwind CSS
- Supabase (auth, database)
- Stripe (payments, webhooks)
- Resend (transactional email)
- React Email (templates)
- Crisp (live chat)

## Database Tables

### pineyweb_clients
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to auth.users |
| full_name | TEXT | Client name |
| business_name | TEXT | Business name |
| email | TEXT | Contact email |
| status | TEXT | pending, active, in_progress, live |
| tier | TEXT | Managed, One-Time |
| site_url | TEXT | Client's live website URL |
| role | TEXT | client, admin |
| created_at | TIMESTAMP | Sign-up date |

### pineyweb_orders
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| confirmation_number | TEXT | Unique, format PW-XXXX-X |
| user_id | UUID | FK to auth.users (linked on activation) |
| email | TEXT | Customer email from Stripe |
| tier | TEXT | managed, one_time |
| addons | TEXT[] | Array of addon product names |
| status | TEXT | pending, active |
| site_url | TEXT | Optional |
| business_name | TEXT | Optional |
| created_at | TIMESTAMP | Order date |

### pineyweb_site_content
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | FK to pineyweb_clients |
| content_type | TEXT | image, text, color |
| content_key | TEXT | e.g. hero_headline, color_primary |
| content_value | TEXT | The content value |
| updated_at | TIMESTAMP | Last modified |

## Row Level Security (RLS)

All three tables have RLS enabled:
- **pineyweb_clients**: users can SELECT/UPDATE/INSERT own record (by user_id). Admin users (role='admin') can SELECT/UPDATE all records. Service role has full access.
- **pineyweb_orders**: users can SELECT own orders (by user_id). Service role has full access (webhook inserts, activation updates).
- **pineyweb_site_content**: users can SELECT/INSERT/UPDATE/DELETE rows where client_id matches their pineyweb_clients.id. Service role has full access.

Client-side (anon key) is restricted to own data. Server-side (service role key) bypasses RLS for webhooks, admin operations, and email flows.

## Email Templates (Resend hosted templates)

Templates are hosted in Resend, not rendered in code. Each `resend.emails.send()` call uses `template_id` + `variables`.

| Template | Resend ID | Variables |
|----------|-----------|-----------|
| Email Verification | `fd770b43-793f-4158-a0d2-12482c6aedcb` | firstName, confirmationUrl |
| Order Confirmation | `3aa394e5-f6d0-42e4-88ff-6596b6ee787b` | firstName, confirmationNumber |
| Account Activated | `3c081e26-96b0-4f06-8349-6158e5e6c955` | firstName |
| Build Started | `2b02c5c5-9ac7-4858-9957-b4ec350f2629` | firstName |
| Site Live | `39e01065-57e9-46d9-8d05-86f1f6bd4d8b` | firstName, siteUrl |
| Handoff | `d1fa68d9-098a-4101-b21b-a22c84df4003` | firstName, siteUrl |
| Client Payment Failed | `211e1b65-cbe5-40c9-8f99-061a9a4f2e85` | firstName, billingPortalUrl |
| Admin Payment Failed | `e441704a-6b97-4462-9815-c7a4e9687bdf` | clientName, clientEmail, amount, failedDate, attemptNumber |

## API Routes

### POST /api/webhooks/stripe
Handles three Stripe events:
- **checkout.session.completed** — Creates order, generates confirmation number, sends OrderConfirmation email.
- **invoice.paid** — Creates order from invoice line items, generates confirmation number, sends OrderConfirmation email. Sets `stripe_customer_id` on the matching `pineyweb_clients` row (by email) so the billing page can fetch Stripe data. If managed tier detected, creates a $99/mo subscription with 30-day trial (starts 30 days after invoice payment).
- **invoice.payment_failed** — Sends payment failed email to client (with billing portal link) and alert to admin (with client details and attempt count). After 3 failed attempts, sets client status to `suspended` and `suspended_at` to current timestamp. Suspended clients are redirected to `/dashboard/suspended` with a payment update CTA.

### POST /api/webhooks/resend
Resend webhook handler with svix signature verification (`RESEND_WEBHOOK_SECRET_PINEYWEB`). Listens for:
- **email.delivered** — Sets `email_delivered: true` on matching prospect by email
- **email.complained** — Sets `email_spam: true`, pauses automation (daily_cap=0), sends admin alert
Prospects CRM shows ✅ for delivered, ⚠️ for spam complaints next to status badge.

### GET /api/cron/auto-scan
Daily cron (8am UTC via Vercel Cron). Automated scanning pipeline:
1. Checks daily send cap from `pineyweb_daily_send_tracker` — stops if reached or paused (cap=0)
2. Gets next 3 unscanned cities from `pineyweb_scanner_queue` (closest to Longview first)
3. Runs keyword + type searches for each city via `/api/admin/scanner`
4. Sends cold outreach to new prospects with emails (up to remaining daily cap)
5. Updates queue status, daily tracker, sends summary email to admin

### pineyweb_scanner_queue
Tracks 200+ Texas cities sorted by distance from Longview. Columns: city, lat/lng, distance, population, status (pending/scanning/complete/error), prospects_found, emails_found, emails_sent, last_scanned_at.

### pineyweb_daily_send_tracker
One row per day: date, emails_sent, daily_cap. daily_cap=0 pauses automation. Set via /admin/queue page.

### GET /api/cron/payment-check
Daily cron job (9am UTC via Vercel Cron). Finds clients suspended exactly 10 days ago (by `suspended_at`). Sends admin alert email for each, noting per Terms of Service they may now consider permanent termination. Secured by `CRON_SECRET` Bearer token.

### POST /api/activate
Validates confirmation number, activates client account, sends AccountActivated email.

### POST /api/admin/send-email
Admin-only. Sends BuildStarted or SiteLive email to a client. Verifies admin role. Updates client status.

### POST /api/admin/outreach
Cold email outreach via Resend. Accepts single prospect or array (max 50). Uses template `c61d6c30-11af-4c99-b9ef-2e6c74af25ea` with variables + tags containing full prospect metadata. 200ms delay between sends. Does NOT save to CRM or mark as contacted at send time — waits for delivery confirmation via Resend webhook. Returns { sent, failed, errors }.

### POST /api/admin/enrich
Accepts `{ prospect_ids: string[] }`. For each prospect with no email, uses Claude (claude-sonnet-4-20250514) with web search to find public business emails from Facebook, Yelp, BBB, Google Business, Instagram, Nextdoor, chamber of commerce directories. Runs in batches of 5 with 500ms delay. Updates pineyweb_prospects with email + email_source. Returns { enriched, failed, skipped, total }.

### Delivery-First CRM Flow
1. Scanner finds prospects → auto-saved to pineyweb_prospects (upsert with ignoreDuplicates to preserve existing outreach status)
2. "Find Emails" on Prospects page enriches all prospects without emails
3. "Send Cold Outreach" fires outreach API for all prospects with email + no emailed_at
4. Outreach API sends via Resend with inline HTML
4. Resend webhook fires `email.delivered` → saves prospect to CRM with status='contacted'
5. If prospect already in CRM, updates delivery status only
6. Spam complaints (`email.complained`) set `email_spam: true`

### Email Enrichment Pipeline
After website detection filters prospects, the scanner enriches each with email lookup:
- Uses Claude (claude-sonnet-4-6) with web search to find public business emails
- Checks Facebook, Yelp, BBB, Google Business, Instagram, and other public listings
- Runs in parallel batches of 5 with 500ms delay between batches
- Returns email + email_source (e.g. "Facebook", "Yelp", "BBB")
- Fields: `email` (string|null), `email_source` (string|null) on each prospect

## Pages

### Public (continued)
- `/unsubscribe` — Accepts `?id=` param, marks prospect as closed_lost with note "Unsubscribed from cold outreach"

### Public
- `/` — Landing page
- `/privacy` — Privacy Policy (rendered from docs/privacy-policy.md)
- `/terms` — Terms of Service (rendered from docs/terms-of-service.md)
- `/login` — Auth
- `/signup` — Registration
- `/activate` — Account activation with confirmation number
- `/forgot-password` — Email input, sends reset link via Resend template
- `/reset-password` — New password form, validates recovery session

### Client Dashboard (protected)
- `/dashboard` — Home with site preview, status grid
- `/dashboard/onboarding` — 3-step intake form for new clients (pending/active status):
  - Step 1 (Your Business): business_name, tagline, phone, email, address, hours, services_offered, service_area, business_description
  - Step 2 (Your Style): logo toggle + upload to Supabase Storage, brand colors toggle + color pickers (primary_color, accent_color), admired_websites, styles_to_avoid
  - Step 3 (Your Accounts): domain toggle (→ Namecheap), logins toggle (→ Supabase), payments toggle (→ Stripe), extra_notes
  - All data saved to pineyweb_site_content with content_type='onboarding'
  - On completion: sets pineyweb_clients.status='in_progress', redirects to /dashboard
  - /dashboard/edit redirects to /dashboard/onboarding if status is pending or active
- `/dashboard/edit` — Edit site content with 3 tabs (available when status is in_progress or live):
  - **Text**: business_name, tagline, about_text, phone, email, address, hours
  - **Images**: logo_url, hero_image_url, gallery_image_1-3_url (uploaded to Supabase Storage `pineyweb-assets/{client_id}/`)
  - **Colors**: primary_color, secondary_color, background_color (color picker)
  - Save Draft: upserts to pineyweb_site_content
  - Publish: saves + POSTs to client's deploy_hook_url from pineyweb_clients
  - Info banner directs users to Crisp chat for larger changes
  - Help modal: auto-shows on first visit (localStorage `piney_edit_modal_seen`), explains tabs + save/publish flow. ? button in header re-opens it anytime.
- `/dashboard/billing` — Billing & Payments page (Stitch design):
  - Current Plan card: tier from DB, $99/mo managed or $799 one-time, next billing date
  - Payment Method card: fetched from Stripe via stripe_customer_id, shows brand/last4/expiry
  - "Manage Payment Method" links to Stripe customer portal
  - Invoice History: fetched from stripe.invoices.list, shows date/description/amount/status/PDF download
  - Security note about Stripe
  - Footer: privacy, terms, contact links
  - API: POST /api/billing fetches Stripe payment method + invoices server-side
- `/dashboard/settings` — Account settings:
  - Account Info: edit full name (inline), email (triggers Supabase confirmation), password (current + new + confirm)
  - Notifications: 3 toggles (project_updates, billing, announcements) saved to pineyweb_clients
  - Security: last login timestamp, sign out all other devices
  - Danger Zone: delete account (type DELETE to confirm) → deletes site_content, clients, orders, auth user

### Admin (admin role only)
- `/admin/clients` — Client management dashboard with nav links to Scanner and Prospects
- `/admin/scanner` — Prospect scanner: multi-pass pipeline (keywords → place types → AI reasoning), website detection via Places Details, chain exclusion, priority tiering (T1: no website + <50 reviews, T2: no website + ≥50 reviews). Batched execution to avoid timeouts. "Save to CRM" per result.
  - API: POST /api/admin/scanner — accepts { city, state, batch, mode: 'keywords'|'types'|'ai' }
- `/admin/prospects` — Saved prospect CRM: outreach tracking with status badges (new/contacted/follow_up/closed_won/closed_lost), follow-up dates, inline notes, contact method logging
  - API: GET/POST/PATCH /api/admin/prospects

### pineyweb_prospects table
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| place_id | TEXT | Google Place ID (unique) |
| business_name | TEXT | Business name |
| address | TEXT | Full address |
| city | TEXT | City |
| phone | TEXT | Phone number |
| rating | NUMERIC | Google rating |
| review_count | INTEGER | Number of reviews |
| priority_tier | INTEGER | 1 (high) or 2 (standard) |
| outreach_status | TEXT | new, contacted, follow_up, closed_won, closed_lost |
| follow_up_date | DATE | Next follow-up |
| notes | TEXT | Outreach notes |
| contact_method | TEXT | Email, Phone, Both |

## Email Confirmation Flow (Custom via Resend)
Supabase's built-in email confirmation is disabled. Instead:
1. User signs up → `supabase.auth.signUp()` creates unconfirmed user
2. Signup page immediately POSTs to `/api/auth/send-confirmation` with email + firstName
3. API route calls `supabase.auth.admin.generateLink({ type: 'signup' })` to get a confirmation URL
4. Sends email via Resend template `fd770b43-793f-4158-a0d2-12482c6aedcb` with `{ firstName, confirmationUrl }`
5. User clicks link → Supabase confirms email → redirects to `/dashboard`
6. Signup page shows "Check your email" message (no auto-redirect to dashboard)

## Order Flow
1. Client purchases via Stripe checkout
2. Webhook creates order + sends confirmation email
3. Client signs up at pineyweb.com/signup → receives email confirmation link
4. Client confirms email → accesses dashboard
5. Client enters confirmation number at /activate
6. Account activated, client accesses full dashboard
7. Admin sends "Build Started" email when work begins
8. Admin sends "Site Live" email when site launches
9. For one-time clients: admin sends "Handoff" email confirming project completion

## Collaborator Model
During the build, Piney Web Co. is added as a collaborator/team member on the client's accounts:
- **Supabase**: Client invites info@pineyweb.com as team member on their project
- **Stripe**: Client invites info@pineyweb.com as Administrator
- **Vercel**: Piney Web Co. manages deployment during build

On handoff (one-time clients only): Admin opens handoff modal in `/admin/clients` which requires:
1. Client's GitHub username (for repo transfer)
2. Client's Vercel username (for project transfer)
3. Checklist completion: GitHub repo transferred, Vercel project transferred, Namecheap domain sharing removed, Stripe removed (if applicable), Supabase removed (if applicable)
4. All checks must pass before "Send Handoff Email" button activates

One-time clients are guided to create GitHub and Vercel accounts during onboarding Step 3.

## E2E Tests (Playwright)

Run: `npm run test:e2e` or `npm run test:e2e:ui`

Test suites in `tests/e2e/`:
- **auth.spec.ts** — Auth gates: unauthenticated redirects, non-admin gate, admin access
- **webhook.spec.ts** — Stripe invoice.paid webhook → order creation, confirmation number format, stripe_customer_id population
- **activation.spec.ts** — /activate flow: confirmation number lookup, account activation, redirect
- **admin.spec.ts** — Admin panel: table rendering, search, Send Build Started/Site Live status updates
- **dashboard.spec.ts** — Client dashboard: pending redirect, onboarding Step 1 save, billing page load
- **legal.spec.ts** — Public pages: /privacy and /terms headings and back links

Config: `playwright.config.ts` — Chromium only, 30s timeout, screenshot on failure, retry once on CI.

Env vars for tests in `.env.test.local` (gitignored): `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_CLIENT_EMAIL`, `TEST_CLIENT_PASSWORD`, `TEST_BASE_URL`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_PINEYWEB`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET_PINEYWEB
RESEND_API_KEY
NEXT_PUBLIC_WEB3FORMS_KEY
NEXT_PUBLIC_DEPLOY_HOOK_URL
```
