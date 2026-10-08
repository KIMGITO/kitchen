# Codensons

A multi-tenant food-ordering SaaS. Each **kitchen** is an independent business with its own storefront
(`kitchen-a.example.com`), its own customers, staff, menu, orders and money. All kitchens run on one codebase and
one Supabase database, separated by Postgres Row Level Security (RLS). Customers pay with **M-Pesa**; the platform
receives the money, takes a configurable commission and owes the rest to the kitchen, tracked in an append-only ledger.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres, Auth, RLS, Storage, Realtime, Edge Functions) · Zustand · Tailwind.

---

## 1. Status

| Area | State |
|---|---|
| Database (17 migrations, RLS, RPCs) | Done. Applied to real PostgreSQL 16; **87 behavioural assertions pass** (3 SQL test files) |
| Customer storefront (menu, options, cart, checkout, M-Pesa payment, live order tracking, account, addresses, history) | Built |
| Kitchen back office (order board, menu, customers, transactions, staff, settings, notifications, payout account) | Built |
| Platform admin (approval, subscriptions, commission, payouts, refunds, receipts, plans, users, audit) | Built |
| Email invitations for staff (Resend) | Built; falls back to showing the link if email is not configured |
| Email + SMS notifications (queue + `notification-dispatch`; Resend + Africa's Talking) | Built, **not exercised against the providers** |
| Rate limiting (DB-backed on order, payment, registration, invitation, payout-account actions) | Built and tested |
| M-Pesa collections via **Till** (STK push), missed-callback recovery | Built, **not yet run against Daraja** |
| M-Pesa **B2C payouts** to admin-approved numbers | Built, **not yet run against Daraja** |
| M-Pesa **reversal refunds** (with manual fallback) | Built, **not yet run against Daraja** |

What was and was not verified in this build environment:

- Verified: all migrations apply; SQL tests pass; `tsc` clean; 34 unit tests pass; `next build` compiles every route
  (with only the Google Fonts download mocked, since the sandbox cannot reach Google).
- **Not verified:** a browser session, real Supabase Auth/Storage/Realtime (stubs were used), the Edge Functions on Deno,
  and every call to Daraja, Resend and Africa's Talking. Request shapes follow the published Daraja docs (STK, B2C v3, Reversal);
  the first sandbox run is the real test. Run the checklist in §10.

---

## 2. Run it

```bash
npm install
cp .env.example .env.local            # Supabase URL + anon key + root domain
supabase init --force                 # creates config.toml; then re-add the three [functions.*] blocks from this repo's supabase/config.toml
supabase start
supabase db reset                     # applies supabase/migrations/001..017
npm run dev                           # http://localhost:3000
```

Local hosts (browsers resolve `*.localhost` automatically):

| URL | What it is |
|---|---|
| `localhost:3000` | Platform site: plans + "Open your kitchen" |
| `localhost:3000/setup` | One-time first-run setup: create the platform owner |
| `admin.localhost:3000` | Platform admin console |
| `my-kitchen.localhost:3000` | A kitchen's storefront |
| `my-kitchen.localhost:3000/staff-login` → `/dashboard` | That kitchen's back office |

Access from another device on the same Wi-Fi (phone/tablet):

1. Start dev bound to your LAN: `npm run dev -- -H 0.0.0.0` (then `http://<your-lan-ip>:3000`,
   e.g. `http://192.168.100.211:3000` serves the platform site the same as `localhost:3000`).
2. For a kitchen storefront or the admin console on the phone, use wildcard DNS — no
   `/etc/hosts` edits needed: `http://<slug>.<lan-ip>.nip.io:3000` or
   `http://admin.<lan-ip>.nip.io:3000` (e.g. `http://myshop.192.168.100.211.nip.io:3000`).
   Both devices must be on the same network, and the dev machine's firewall must allow
   inbound TCP on port 3000. A bare `http://<lan-ip>:3000` always shows the platform site
   (it has no tenant mapping); Supabase Auth redirects/callbacks may still point at
   `localhost`, so OAuth/magic-link flows are best completed on the dev machine itself.

Production needs a wildcard DNS record and wildcard TLS for `*.yourdomain.com`, and `NEXT_PUBLIC_ROOT_DOMAIN=yourdomain.com`.
Also update the database copy: `update platform_settings set value = '"yourdomain.com"' where key = 'root_domain';`

First-time bootstrap (creates the platform owner — the admin who approves or blocks kitchens):

1. Open `http://localhost:3000/setup` and create the first account (or sign in if you have one).
2. Click **Make me the platform owner**. The claim is enforced in the database (`claim_platform_ownership()`,
   migration 017) and closes forever once any platform staff row exists — so it can only ever happen once.
   Optional: set `PLATFORM_OWNER_EMAIL=you@example.com` in `.env` first to pin ownership to that email.
3. Open `admin.<root>` and log in with the same email.
4. Register a kitchen at `/start`, then approve it in the admin console (Overview → Approve).

Fallback if the app is unreachable: `insert into platform_staff (user_id, role) values ('<auth.users id>', 'owner');`
(Supabase Dashboard → SQL Editor).

Scripts: `npm run dev | build | typecheck | test`, `npm run db:types` (generate typed DB client).
SQL tests (disposable database only), for each of `isolation_and_money.sql`, `checkout_and_refunds.sql`, `automation.sql`: `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/<file>`.

---

## 3. How the app is organised

```
src/
  theme/            theme.ts = ALL fonts, colours, text styles, radius, shadows (single source of design truth)
                    resolve.ts = validates a kitchen's overrides, contrast guard, emits CSS variables
  middleware.ts     host -> area (platform / admin / tenant); sets a trusted tenant header; refreshes the session
  lib/tenant/       resolve tenant from hostname via RPC (browser never supplies a tenant id)
  lib/auth/         permissions, session helpers, entitlements (hasFeature/getLimit), platform-role guard
  lib/commerce/     order-state.ts (UI mirror of the DB state machine), money formatting
  lib/images/       compress.ts (resize + WebP + EXIF strip + content hash), Supabase image loader
  lib/actions/      server actions (account, menu, kitchen, admin, platform) -> thin, validated, RLS-protected
  stores/cart.ts    the only Zustand store: the guest cart, one list per kitchen
  app/(storefront)  customer site         app/(dashboard)  kitchen back office
  app/platform      platform marketing    app/platform-admin  SaaS admin (reached only on admin.<root>)
supabase/
  migrations/       001..016 (see §6)
  functions/        mpesa-stk-push, mpesa-callback, mpesa-b2c-payout, mpesa-refund, mpesa-result,
                    payment-reconcile, notification-dispatch, _shared
  tests/            behavioural SQL tests (isolation_and_money, checkout_and_refunds, automation)
tests/              vitest unit tests (order states, theme, host routing, M-Pesa parsing)
```

**Host routing.** `classifyHost` maps the request host: root domain → `/platform/*`, `admin.<root>` → `/platform-admin/*`,
anything else → a kitchen (tenant). The internal prefixes cannot be reached by URL on any host. The middleware strips any
client-sent tenant header and sets its own, then server code resolves the kitchen with `resolve_tenant(hostname)`.
Custom domains are just extra rows in `tenant_domains` (a Pro-plan feature in the entitlement model).

**Design system.** Components contain no colours, fonts or text sizes. They use utilities generated from `theme.ts`
(`bg-brand`, `text-h2`, `font-display`). A kitchen can override six colours and two fonts (Advanced plan feature
`custom_theme`); `resolveTheme` drops unknown keys and falls back to defaults if contrast drops below 4.5:1.

**Images.** `ImageUploader` resizes (logo 512px, product 1600px, cover 2400px), converts to WebP, strips EXIF/GPS, steps quality down
to fit a size budget, names the file by its content hash (immutable, cacheable for a year), and uploads to
`{tenant_id}/...` in a bucket. Storage policies check that the first path segment is a kitchen the user may manage; buckets also
enforce size and MIME limits server-side.

---

## 4. People and permissions

| Who | How they sign in | What they can do |
|---|---|---|
| **Customer** | `login`/`register` on a kitchen's host | Order from *that* kitchen, see their own orders/addresses |
| **Kitchen admin / manager / cashier / worker** | `/staff-login` on the kitchen's host | Defined by role → permissions (below) |
| **Platform owner / admin / support** | `admin.<root>/login` | Owner & admin can change things; support is read-only |

**Customers are per kitchen.** A person's login (`auth.users`) can have a separate `kitchen_customers` row for each kitchen; nothing is
shared between kitchens (orders, addresses, notes, loyalty). Logging in on a kitchen where you have no account shows "You don't have a
customer account with this kitchen yet" and offers to create one; nothing is attached silently. Session cookies are host-only, so a
login on kitchen A is not a login on kitchen B.

Role → permission (stored in `role_permissions`, so it is data, not code):

| Permission | Admin | Manager | Cashier | Worker |
|---|:-:|:-:|:-:|:-:|
| orders.view | ✓ | ✓ | ✓ | ✓ |
| orders.accept (accept/decline) | ✓ | ✓ | ✓ | |
| orders.prepare (preparing/ready) | ✓ | ✓ | | ✓ |
| orders.complete | ✓ | ✓ | ✓ | |
| orders.cancel | ✓ | ✓ | | |
| menu.view / menu.manage | ✓ / ✓ | ✓ / ✓ | | view only |
| customers.view / customers.manage | ✓ / ✓ | ✓ / ✓ | view only | |
| payments.view | ✓ | ✓ | ✓ | |
| finance.view (ledger, payouts) | ✓ | ✓ | | |
| reports.view | ✓ | ✓ | | |
| staff.view / staff.manage | ✓ / ✓ | view only | | |
| settings.manage | ✓ | | | |

Plans gate features through `plan_features`: `hasFeature('promotions')`, `getLimit('max_staff')`. Enforcement is in RLS/RPC too
(e.g. product count limit, staff limit, custom theme), not just hidden buttons.

---

## 5. The main flows

### 5.1 Kitchen onboarding
1. Owner signs up at `<root>/start` and enters a kitchen name + web address → `register_kitchen` creates the tenant
   (`pending_approval`), its subdomain row, the owner's `kitchen_admin` membership, a 14-day Basic trial and an empty theme.
2. They log in at `{slug}.<root>/staff-login` (separate session) and set up menu, images and settings. The storefront is not public yet.
3. A platform admin approves it (`set_tenant_status → active`). Suspending hides the storefront immediately.

### 5.2 Customer order and payment
```
Browse menu → item (options) → cart (browser) → checkout (login/register for THIS kitchen)
 → create_order (server recomputes every price, validates options, min order, delivery)  → order PENDING_PAYMENT
 → mpesa-stk-push → phone prompt → customer enters PIN
 → Safaricom calls mpesa-callback → record_payment_success (atomic)
 → order PAID → RECEIVED, ledger sale + commission, notifications → kitchen sees it live
```
- The cart (`stores/cart.ts`) is display-only. The server never trusts its prices.
- Whole shillings only (M-Pesa limit): enforced by DB constraints on prices, option extras and fees.
- The order page updates live (Supabase Realtime) and offers *send a new prompt* / *cancel*.
- Retry rules: at most 5 attempts per order, one open prompt at a time; the same idempotency key returns the same attempt.

### 5.3 Kitchen fulfilment (order board)
`RECEIVED → ACCEPTED → PREPARING → READY → COMPLETED`, or `REJECTED` / `CANCELLED`. Buttons shown depend on the user's permissions;
the database enforces them again in `transition_order`. Every change writes `order_status_history`, an audit entry and a customer notification.

```
PENDING_PAYMENT → PAID* → RECEIVED* → ACCEPTED → PREPARING → READY → COMPLETED
      │  └→ PAYMENT_FAILED → (retry → PENDING_PAYMENT) | EXPIRED* | CANCELLED
      └→ EXPIRED* | CANCELLED (customer)          RECEIVED/ACCEPTED/PREPARING/READY → CANCELLED (staff, orders.cancel)
RECEIVED → REJECTED (staff)        REJECTED | CANCELLED (after payment) → REFUNDED*      (* = system/admin only)
```
Legal moves live in the `order_transitions` table (one definition); `src/lib/commerce/order-state.ts` mirrors it for the UI.

### 5.4 Money: commission, ledger, payouts, refunds
- On payment success the applicable commission rule is resolved (**kitchen override → plan rule → platform default**) and its values are
  **snapshotted on the order**. Changing or switching off commission later never alters past orders.
- Example, 10%: customer pays KSh 1,000 → ledger `sale +1000`, `commission −100` → kitchen net 900.
- The **ledger is append-only** (triggers block update/delete/truncate). Corrections are new entries. Kitchen balance is the
  `kitchen_balances` view = sum of entries: gross sales, commission, refunds, adjustments, paid out, **outstanding**.

**Payouts (B2C or manual)**
```
Kitchen requests a payout number ──► platform admin reviews + approves (one approved number per kitchen)
Admin creates payout (checked against balance minus pending/processing payouts)
   ├─ manual: admin sends money elsewhere → "Mark completed" with a reference
   └─ M-Pesa B2C: "Send via M-Pesa" → payout `processing` → Safaricom result → `completed` (ledger −amount) or `failed` (nothing posted)
```
- B2C only ever pays the **approved** number; the destination is copied onto the payout when it is sent. A kitchen cannot change it without a new
  admin approval, so a hijacked kitchen account cannot redirect money.
- The ledger entry is written only when a payout completes, exactly once (replays and late results are safe).
- If the request to Daraja fails *ambiguously* (network error after sending), the payout stays `processing` and is **never retried automatically**
  (that could pay twice). The admin checks the M-Pesa statement, then marks it completed (with the receipt) or failed.
- B2C pays from your B2C shortcode's utility balance, so keep it funded.

**Refunds (M-Pesa reversal or manual)**
- A paid order that is cancelled/declined shows under *Finance → Refunds*. **Refund via M-Pesa** asks Daraja to reverse the customer's payment (needs the payment's
  M-Pesa receipt); when Safaricom confirms, the order becomes `REFUNDED` and the ledger posts `refund −total` and `commission_reversal +commission`.
- If a reversal is rejected or unavailable, record a **manual refund** with a reference; the result is identical. Only one refund per payment can be active or done.
- A payment that arrives for an expired/cancelled order, or with the wrong amount, is flagged `needs_refund` and never credits the kitchen.

**Missed callbacks**
- If no callback arrives, `payment-reconcile` asks Daraja (STK query). If Daraja says paid, the order proceeds and the payment is saved with
  `receipt_pending` (no invented receipt). A late genuine callback fills the receipt automatically; otherwise an admin enters it from the
  M-Pesa statement (*Finance → Payments missing a receipt*). A receipt is required for an automatic reversal.

### 5.5 Staff
Admin invites an email + role → `invite_staff` returns a single-use token (only its hash is stored, valid 7 days) → the server emails
`{kitchen host}/invite/{token}` through Resend (if email is not configured or fails, the link is shown to the admin to share) →
the invitee signs up or logs in with the invited email → `accept_invitation`.
Roles can be changed and people deactivated; the last active admin cannot be removed; the plan's `max_staff` limit applies.

---

## 6. Data model

Every tenant-owned table has `tenant_id`; children use **composite foreign keys** `(tenant_id, parent_id)`, so a row physically cannot point
at another kitchen's customer, product or order. Money is `bigint` minor units (KSh 450 = 45000) plus a currency code.

| Migration | Contents |
|---|---|
| 001 extensions | `pgcrypto`, `citext`, `pg_trgm`, `private` schema, helpers |
| 002 profiles | `profiles` (global, minimal), `platform_staff`, platform role helpers |
| 003 tenants | `tenants` (kitchen profile, delivery/pickup, fees, SEO, order counter), `tenant_domains`, `tenant_themes`, `platform_settings`, `resolve_tenant()` |
| 004 rbac | `permissions`, `roles`, `role_permissions`, `tenant_members`, `kitchen_customers`, `tenant_invitations`, `has_permission()`, `register_kitchen_customer()` |
| 005 subscriptions | `plans`, `features`, `plan_features`, `subscriptions`, `has_feature()`, `tenant_entitlements()` |
| 006 catalog | `categories`, `products`, `product_option_groups`, `product_options`, `customer_addresses`, `promotions`, `media_assets` |
| 007 orders | `orders` (with commission snapshot), `order_items`, `order_item_options`, `order_status_history`, `order_transitions`, `create_order()`, `transition_order()` |
| 008 payments | `commission_rules` (versioned), `payments`, `payment_events`, `ledger_entries`, `kitchen_balances`, `record_payment_success/failure()` |
| 009 payouts | `payouts`, `create/complete/cancel_payout()`, `post_adjustment()` |
| 010 notifications | `audit_logs`, `notifications`, `register_kitchen()`, `set_tenant_status()`, `invite_staff()`, `accept_invitation()`, `update_staff_member()` |
| 011 storage | buckets with limits + tenant-scoped storage policies |
| 012 rls | RLS on every table, explicit column grants, realtime publication |
| 013 checkout | `begin_payment()`, `attach_stk_response()`, `expire_stale_orders()`, `refund_order()`, `list_staff()`, hardening (revokes) |
| 014 relationships | foreign keys the REST API needs to embed related rows |
| 015 enum values | `payout_status` gains `processing` (separate file: new enum values must commit first) |
| 016 automation | rate limiting (wrappers around order/payment/registration/invite functions), notification settings + delivery queue + enqueue trigger, receipt backfill, payout accounts, B2C payout functions, `refunds` + reversal functions, RLS for the new tables |
| 017 platform setup | `platform_setup_required()`, `claim_platform_ownership()` — one-time first-run claim of the platform owner |

Security rules the schema enforces:

- RLS is on for every table. Orders, payments, ledger, payouts and notifications have **no client write policies**; they change only through RPCs.
- `record_payment_success/failure`, `begin_payment`, `attach_stk_response`, `expire_stale_orders` are **service-role only**.
- Internal helpers (`private.apply_transition`, `private.write_audit`, `private.rate_check`, ...) are not callable through the API.
- B2C, reversal, receipt and delivery-queue functions are service-role only; payout accounts, refunds, deliveries and rate limits have no client write policies.
- `kitchen_customers.staff_notes` is never selectable by the customer (column grants); staff read it through an RPC.
- Audit log and ledger are append-only.

---

## 7. Notifications, delivery and realtime

`notifications` rows are created inside the order-transition function (customer: received, paid, accepted, preparing, ready, completed,
declined, cancelled, payment failed; kitchen: new order, payment received, cancellation). The app shows them in a bell (Realtime).

**Email and SMS.** A trigger turns each notification into rows in `notification_deliveries` according to the kitchen's *Settings → Notifications*:

| Channel | Customers | Kitchen team | Plan |
|---|---|---|---|
| Email (Resend) | order updates (on by default) | new-order email to the kitchen contact email (on by default) | all plans |
| SMS (Africa's Talking) | opt-in per kitchen | opt-in, to an alert phone | needs the `advanced_notifications` feature; capped per kitchen per day (`platform_settings.sms_daily_cap_per_kitchen`, default 200) |

`notification-dispatch` (scheduled every minute) claims queued rows (`FOR UPDATE SKIP LOCKED`, with a lease so a crashed run recovers), sends them, and retries failures up to 5 times with backoff.
Enqueueing is wrapped so a delivery problem can never block an order or payment. Failed deliveries are counted on the admin Finance page.
The platform pays for SMS; for faster delivery than once a minute, add a Database Webhook on `notification_deliveries` inserts that calls the function.
Realtime obeys RLS, so a browser only receives rows it may read.

**Rate limiting.** Fixed-window counters in `rate_limits`, checked inside the database functions (so they apply no matter which client calls them):
create order 8 per 5 min per customer per kitchen · payment attempts 12 per 10 min per user (plus 5 per order) · customer registration 10/hour ·
kitchen registration 3/day · staff invitations 20/hour · payout-number requests 5/day. Exceeding a limit returns "Too many attempts".
Sign-in/sign-up requests go straight to Supabase Auth, so limit those in Supabase: Dashboard → Authentication → Rate Limits, and enable CAPTCHA
(Authentication → Attack Protection) for public sign-up. Cloud-level (IP) throttling for the Next.js app belongs at your host/CDN (e.g. Vercel or Cloudflare rules).

---

## 8. SEO

Per kitchen host: title/description/Open Graph from the kitchen's settings, canonical URL on the primary domain, `Product` JSON-LD from real
menu data, a tenant-scoped `sitemap.xml` and `robots.txt`. Suspended or unapproved kitchens return `noindex` and disallow-all.
Cart, login, account, order and dashboard pages are not indexable.

---

## 9. M-Pesa, email and SMS setup

Nothing secret is in the Next.js app. Payment, payout, refund, email and SMS secrets live in **Supabase secrets** for the Edge Functions
(the only exception: `RESEND_API_KEY`/`EMAIL_FROM` in the app's server env for invitation emails).

1. **Daraja sandbox first.** Create an app at the Daraja developer portal to get the **consumer key/secret**. Sandbox values: shortcode `174379`,
   the sandbox **passkey** from the portal's STK simulator, and the portal's test phone (commonly `254708374149`). Amounts are whole shillings.
2. Fill `supabase/functions/.env` from `supabase/functions/.env.example`, then:
   ```bash
   supabase secrets set --env-file supabase/functions/.env
   ```
3. Deploy:
   ```bash
   supabase functions deploy mpesa-stk-push
   supabase functions deploy mpesa-b2c-payout
   supabase functions deploy mpesa-refund
   supabase functions deploy mpesa-callback --no-verify-jwt
   supabase functions deploy mpesa-result --no-verify-jwt
   supabase functions deploy payment-reconcile --no-verify-jwt
   supabase functions deploy notification-dispatch --no-verify-jwt
   ```
4. **Schedule** (Dashboard → Integrations → Cron → HTTP request, header `Authorization: Bearer <service role key>`), every minute:
   `.../functions/v1/payment-reconcile` and `.../functions/v1/notification-dispatch`.
5. Local testing: Safaricom must reach your callbacks, so expose the functions through a tunnel (ngrok) and set `MPESA_CALLBACK_BASE_URL`.

**Till (production).** Set `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` and `MPESA_PARTY_B=<your till number>`. `MPESA_SHORTCODE` and `MPESA_PASSKEY` must be the
shortcode/passkey Safaricom issued for Lipa na M-Pesa Online on that till (it is used to build the request password). Confirm the exact values with Safaricom at go-live;
documentation varies on whether this is the store/head-office number. The till must be set up to settle to your bank account.

**Security credential (B2C and Reversal).** Safaricom requires the initiator password encrypted with its public certificate. Download the certificate for your environment from the
Daraja portal, then (once):
```bash
openssl x509 -in SandboxCertificate.cer -inform DER -pubkey -noout > pub.pem   # use -inform PEM if the file is PEM
echo -n 'YourInitiatorPassword' | openssl pkeyutl -encrypt -pubin -inkey pub.pem -pkeyopt rsa_padding_mode:pkcs1 | openssl base64 -A
```
Put the output in `MPESA_SECURITY_CREDENTIAL`. (The sandbox portal also has a credential generator.) Production uses the production certificate and the initiator created on your M-Pesa
business portal with B2C and reversal permissions; the sandbox initiator is `testapi` with the portal's test password.

**Email / SMS.** `RESEND_API_KEY` + `EMAIL_FROM` (a verified sending domain). SMS: `AT_API_KEY`, `AT_USERNAME` (`sandbox` in the sandbox, with `AT_ENV=sandbox`).

How the functions protect money:

| Function | Caller | Safeguards |
|---|---|---|
| `mpesa-stk-push` | Logged-in customer | Order must be the caller's (RLS); `begin_payment` re-checks ownership, status, attempts, rate limit, whole-shilling amount, idempotency; amounts come from the DB |
| `mpesa-callback` | Safaricom | Constant-time secret check; checkout id must match a payment we created; amount must equal the order total; replays are no-ops |
| `mpesa-b2c-payout` | Platform owner/admin | JWT verified, role re-checked in the DB, destination from the approved account only, one send per payout |
| `mpesa-refund` | Platform owner/admin | JWT + role check, needs a recorded receipt, one active refund per payment |
| `mpesa-result` | Safaricom | Secret check; results matched by our originator id; completion functions are idempotent |
| `payment-reconcile`, `notification-dispatch` | Scheduler | Service-role bearer required |

Honest limits: Safaricom does not sign callbacks, so the URL secret + matching a known id + amount check is defence in depth, not a signature. A Reversal result is matched by the
originator id Daraja returns when the request is accepted; if the result somehow arrives before we store it, the refund stays `processing` and the admin records it manually.
Reversal availability depends on your M-Pesa account's permissions and Safaricom's rules, which is why a manual refund path always exists.

---

## 10. Pre-launch checklist

- [ ] `supabase db reset`, then run the four SQL test files in `supabase/tests` against the local database (all `PASS`).
- [ ] `npm run build`, `npm run typecheck`, `npm test`.
- [ ] Register a kitchen, approve it, add a category and an item with a photo, open `{slug}.localhost:3000`.
- [ ] Invite a staff member: the email arrives (or the link is shown if email is not set), and accepting it grants the right role.
- [ ] Place an order with the sandbox test phone: prompt → callback → order appears on the board live → ledger shows sale + commission → customer email queued/sent.
- [ ] Stop the callback (wrong secret) and place an order: after ~90 s `payment-reconcile` completes it with *receipt missing*; enter the receipt in admin.
- [ ] Cancel a paid order, then **Refund via M-Pesa**; confirm the order becomes refunded and the balance nets to zero. Also try the manual refund path.
- [ ] Kitchen requests a payout number; admin approves; create a B2C payout; confirm `processing` → `completed` and the ledger payout entry.
- [ ] Register a second kitchen; confirm its staff cannot see the first kitchen's data and a customer of kitchen A is asked to create an account on kitchen B.
- [ ] Turn commission off, place another order, confirm old orders keep their commission.
- [ ] Hammer checkout (more than 8 orders in 5 minutes) and confirm "Too many attempts".
- [ ] Supabase Auth rate limits + CAPTCHA configured; host/CDN IP rate limits configured; `supabase db lint`.

---

## 11. Deliberate deviations from the blueprint

1. No server-side `carts` tables: the cart is client-side per kitchen and prices are recomputed in `create_order`.
2. `theme.ts` rather than `theme.js` (type safety).
3. Ledger has no separate "kitchen payable" entry (it would double count); net payable is the sum of entries.
4. Payout destinations require platform-admin approval (anti-fraud), which the blueprint did not specify.
5. Rate limiting for sign-in is delegated to Supabase Auth, because those requests never pass through this app's code.

## 12. Known gaps

- No Daraja/Resend/Africa's Talking call has been executed yet; expect small fixes on first sandbox runs.
- No reversal/payout *status query* fallback: stuck `processing` payouts and refunds are resolved by an admin from the M-Pesa statement.
- Notifications are transactional only (no marketing sends); customers cannot opt out of order emails per kitchen yet.
- No automated browser/end-to-end tests.
# kitchen
