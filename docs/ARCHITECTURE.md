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

## Email Templates (Resend hosted templates)

Templates are hosted in Resend, not rendered in code. Each `resend.emails.send()` call uses `template_id` + `variables`.

| Template | Resend ID | Variables |
|----------|-----------|-----------|
| Email Verification | `fd770b43-793f-4158-a0d2-12482c6aedcb` | firstName, confirmationUrl |
| Order Confirmation | `3aa394e5-f6d0-42e4-88ff-6596b6ee787b` | firstName, confirmationNumber |
| Account Activated | `3c081e26-96b0-4f06-8349-6158e5e6c955` | firstName |
| Build Started | `2b02c5c5-9ac7-4858-9957-b4ec350f2629` | firstName |
| Site Live | `39e01065-57e9-46d9-8d05-86f1f6bd4d8b` | firstName, siteUrl |
| Handoff | `d1fa68d9-098a-4101-b21b-a22c84df4003` | firstName, domain, vercelEmail, vercelPassword, namecheapEmail, namecheapPassword, googleEmail, googlePassword |

## API Routes

### POST /api/webhooks/stripe
Handles two Stripe events:
- **checkout.session.completed** — Creates order, generates confirmation number, sends OrderConfirmation email.
- **invoice.paid** — Creates order from invoice line items, generates confirmation number, sends OrderConfirmation email. If managed tier detected, creates a $99/mo subscription with 30-day trial (starts 30 days after invoice payment).

### POST /api/activate
Validates confirmation number, activates client account, sends AccountActivated email.

### POST /api/admin/send-email
Admin-only. Sends BuildStarted or SiteLive email to a client. Verifies admin role. Updates client status.

## Pages

### Public
- `/` — Landing page
- `/privacy` — Privacy Policy (rendered from docs/privacy-policy.md)
- `/terms` — Terms of Service (rendered from docs/terms-of-service.md)
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
