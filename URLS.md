# URL Access Guide

Every area of Codensons is reached through the **hostname**, never through an
internal path prefix. `src/middleware.ts` classifies the request host and
rewrites it to the correct app area:

| Host | Area |
|---|---|
| `localhost` (root domain) | Platform marketing / onboarding |
| `admin.localhost` | Platform admin console |
| any other host (`{slug}.localhost`, custom domain) | That kitchen (tenant) |

The internal prefixes `/platform/*` and `/platform-admin/*` are **blocked by
middleware on every host** — requesting them directly always returns 404.

> **Local dev:** modern browsers resolve `*.localhost` automatically, so no
> `/etc/hosts` changes are needed. Start the server once with `npm run dev`
> (default port 3000) and open the URLs below.

---

## 1. Platform site — `http://localhost:3000`

Public marketing site and kitchen onboarding.

| URL | Page |
|---|---|
| `/` | Landing page (plans, "Open your kitchen") |
| `/start` | Register a new kitchen (sign-up wizard) |
| `/setup` | **One-time** first-run setup — create the platform owner (see below) |

**Admin roles** (row in `platform_staff`):

| Role | Access |
|---|---|
| `owner` | Everything, incl. managing platform staff |
| `admin` | Everything except managing staff |
| `support` | Read-only (write pages redirect away) |

---

## 2. Platform admin — `http://admin.localhost:3000`

The SaaS admin console. Guarded by `requirePlatform()` — you must be signed in
as a platform admin, otherwise you are redirected to the login page.

| URL | Page |
|---|---|
| `/login` | Admin sign-in |
| `/` | Overview dashboard |
| `/kitchens` | All kitchens (approve / suspend) |
| `/kitchens/{id}` | Kitchen detail |
| `/finance` | Commissions, payouts, transactions |
| `/plans` | Subscription plans |
| `/users` | Platform users |
| `/system` | System / health |

> Roles: `owner` and `support` can sign in; `support` is read-only.

### Creating the first admin account (first-run setup)

The platform **owner** is created through the one-time setup page — no manual SQL needed:

1. Open **`http://localhost:3000/setup`** (root host only).
2. Create the first account (or sign in if you already have one).
3. Click **Make me the platform owner** — this grants `owner` in `platform_staff`
   and closes the setup page permanently.
4. Sign in at `http://admin.localhost:3000/login` with the same email.

How it stays safe:

- The claim is enforced in the database (`claim_platform_ownership()` in
  `supabase/migrations/017_platform_setup.sql`) with an advisory lock — it is
  impossible to create a second bootstrap owner, even with concurrent requests.
- Optional guard: set `PLATFORM_OWNER_EMAIL=you@example.com` in `.env` before
  step 3 to pin ownership to that email (any other email is refused).
- Once completed, `/setup` just shows "already completed". Additional admins are
  granted with the same SQL insert (the admin console **Users** tab only *lists*
  staff — there is no grant-roles UI yet), or by the owner once such a UI exists.

Fallback (manual SQL, e.g. if the app is unreachable): Supabase Dashboard →
SQL Editor:

```sql
insert into platform_staff (user_id, role)
select id, 'owner'
from auth.users
where email = 'you@example.com';
```

---

## 3. Kitchen storefront (customer-facing) — `http://{slug}.localhost:3000`

The public storefront for one kitchen. `{slug}` is the kitchen's web address
chosen during `/start` (e.g. `my-kitchen.localhost:3000`). The tenant is
resolved from the hostname server-side — the browser never supplies a tenant id.

| URL | Page |
|---|---|
| `/` | Storefront home |
| `/menu` | Full menu |
| `/item/{slug}` | Menu item detail (add to cart) |
| `/cart` | Cart |
| `/checkout` | Checkout (pickup / delivery, M-Pesa) |
| `/login` | Customer sign-in |
| `/register` | Customer sign-up |
| `/account` | Customer profile |
| `/account/orders` | Order history |
| `/orders/{id}` | Live order tracking |

---

## 4. Kitchen back office (staff) — `http://{slug}.localhost:3000/...`

Same host as the storefront — staff areas live on the tenant hostname too.
Guarded: unauthenticated visits to `/dashboard/*` redirect to
`/staff-login?next=...`, and users with no permissions are sent home.

| URL | Page |
|---|---|
| `/staff-login` | Staff sign-in (owner / kitchen staff) |
| `/dashboard` | Back-office overview |
| `/dashboard/orders` | Live orders |
| `/dashboard/menu` | Menu management |
| `/dashboard/menu/new` | Add menu item |
| `/dashboard/menu/{id}` | Edit menu item |
| `/dashboard/menu/categories` | Categories |
| `/dashboard/customers` | Customers |
| `/dashboard/customers/{id}` | Customer detail |
| `/dashboard/staff` | Team & roles |
| `/dashboard/transactions` | Transactions |
| `/dashboard/settings` | Kitchen settings (theme, fees, SEO) |
| `/dashboard/forbidden` | 403 page (no permission) |
| `/invite/{token}` | Accept a team invitation |

---

## Quick test matrix

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/                     # 200  platform
curl -s -o /dev/null -w '%{http_code}\n' http://admin.localhost:3000/login          # 200  admin login
curl -s -o /dev/null -w '%{http_code}\n' http://my-kitchen.localhost:3000/staff-login  # 200  kitchen staff login
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/platform-admin/login # 404  internal prefix blocked
```

## Troubleshooting

- **404 on `/login` at plain `localhost`** — expected. Customer/staff routes
  only exist on tenant hosts (`{slug}.localhost`); the root domain serves
  `/platform/*`.
- **404 on `/platform/...` or `/platform-admin/...`** — expected on every host.
  Always use the hostnames in the table above.
- **Redirect to `/staff-login`** — you hit a kitchen back-office page without
  a staff session.
- **Redirect to `/login` in the admin console** — you are not signed in as a
  platform admin.
- **404 on a `{slug}.localhost` storefront** — either the slug isn't registered
  yet (register one at `http://localhost:3000/start`), or the kitchen's status
  isn't `active` (approve it in the admin console). Unknown / inactive tenants
  hit `notFound()` by design.
