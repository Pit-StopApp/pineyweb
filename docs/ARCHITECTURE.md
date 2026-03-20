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

## Email Templates (src/emails/)
- **OrderConfirmation** — Sent after Stripe checkout. Shows confirmation number.
- **AccountActivated** — Sent when client activates via /activate.
- **BuildStarted** — Sent by admin when build begins.
- **SiteLive** — Sent by admin when site goes live.
- **Handoff** — Credentials handoff with account details.

## API Routes

### POST /api/webhooks/stripe
Stripe webhook for `checkout.session.completed`. Creates order, generates confirmation number, sends OrderConfirmation email.

### POST /api/activate
Validates confirmation number, activates client account, sends AccountActivated email.

### POST /api/admin/send-email
Admin-only. Sends BuildStarted or SiteLive email to a client. Verifies admin role. Updates client status.

## Pages

### Public
- `/` — Landing page
- `/login` — Auth
- `/signup` — Registration
- `/activate` — Account activation with confirmation number

### Client Dashboard (protected)
- `/dashboard` — Home with site preview, status grid
- `/dashboard/edit` — Edit site content (images, text, colors)
- `/dashboard/billing` — Plan, payment, invoices

### Admin (admin role only)
- `/admin/clients` — Client management table with email actions

## Order Flow
1. Client purchases via Stripe checkout
2. Webhook creates order + sends confirmation email
3. Client signs up at pineyweb.com/signup
4. Client enters confirmation number at /activate
5. Account activated, client accesses dashboard
6. Admin sends "Build Started" email when work begins
7. Admin sends "Site Live" email when site launches

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
