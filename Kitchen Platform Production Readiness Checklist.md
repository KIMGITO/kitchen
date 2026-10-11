# Kitchen Platform: Production Readiness Checklist

_Repo: KIMGITO/kitchen (Next.js 15 + Supabase, multi-tenant food ordering with M-Pesa). Status as of 10 October 2026._

## Before you read

**Updated 10 October 2026 — local checks now pass.** In this environment the code-level checks were re-run and all three pass: `npm run typecheck` (exit 0), `npm test` (59 tests, 7 files, all green), and `npm run build` (compiled successfully, 38 static pages generated, `.next/BUILD_ID` written). The build did need many Google Fonts retries because this sandbox's connection to `fonts.googleapis.com` is slow/unreliable (`Client network socket disconnected before secure TLS connection was established`), but it completed. On Vercel or a normal CI machine with a stable connection this is a non-issue.

**What still cannot be checked here:** nothing has been run against a real Supabase project, Daraja (M-Pesa), Africa's Talking, Resend, or Google Cloud console, and no real browser pass has been done. Every item that depends on those is marked **Manual** below — it is not verified until you run it yourself.

### How to read the status column

- **Verified** — confirmed by a command run or by reading the code in this repo.
- **Code-ready** — the wiring exists in the repo; only the external console/secret/deploy step is left.
- **Manual** — requires a live Supabase/Daraja/browser/console run; not verifiable here.
- **Missing** — confirmed absent from the repo; work is required.

## 1. Must do before any real customer

1. **Make sure the production build passes.** Run `npm ci && npm run typecheck && npm test && npm run build` on a machine with internet access. Recent edits had left type errors that were fixed; confirm nothing else slipped in. **(Verified 10 Oct 2026 in this environment: typecheck exit 0, 59/59 tests pass, `next build` succeeds — see the Tick-off table. Only re-confirm on a normal network where Google Fonts is fast.)**
2. **Run all migrations in order (001 to 019) on a fresh Supabase project**, then run the four SQL test files in `supabase/tests`. Migrations 018 and 019 and their new triggers have only been syntax-checked, never executed.
3. **Run the M-Pesa flows against the Daraja sandbox end to end.** This is the biggest risk.
   - Flows: STK push, the callback, missed-callback recovery, B2C payouts, and reversal refunds.
   - Check: the callback secret, the exact result codes, and amounts.
   - Known gap: there is no status-query fallback for stuck payouts and refunds. An admin has to resolve those by hand from the M-Pesa statement.
4. **Set every secret.**
   - Edge Function secrets: Daraja keys, callback secret, Africa's Talking, Resend.
   - Vercel environment variables: the values listed in `.env.example`.
   - `PLATFORM_OWNER_EMAIL` must be set before the first deploy, so only the owner can claim `/setup`.
   - The Africa's Talking API key goes in as `AT_API_KEY`, with `AT_USERNAME` and `AT_SENDER_ID`.
5. **Set up Google sign-in** in Google Cloud and in Supabase, and add `https://*.yourdomain.com/auth/callback` (plus each custom tenant domain) to the redirect list. The README has the steps.
6. **Wildcard domain and TLS.** Set up `*.yourdomain.com`, and make sure `NEXT_PUBLIC_ROOT_DOMAIN` equals `platform_settings.root_domain`.
7. **Deploy the Edge Functions and schedule the cron jobs** (`payment-reconcile` and `notification-dispatch`). Without them, stuck payments and queued messages pile up silently.
8. **Check behaviour in a real browser.**
   - Content-Security-Policy: open the console and look for blocked requests.
   - Layout: check the new design on a phone-sized screen.
   - Uploads: try the image editor with a large phone photo.
   - Notifications: try mark read, delete and bulk actions.
9. **Revoke every GitHub token that was pasted into chat**, and use a fresh token with only the access you need.

## 2. Should do before launch

- **Automated checks on every change.** There was no `.github/workflows` folder. **Added 10 Oct 2026:** `.github/workflows/ci.yml` runs `npm ci` → typecheck → test → build on every pull request and push to `main`.
- **Error and uptime monitoring.** Add Sentry (or similar) and a health check. Alert on failed callbacks, payouts stuck in `processing`, and failed message deliveries.
- **End-to-end tests.** There are none yet. At minimum, cover: place order, pay, kitchen accepts, customer sees the result.
- **Database backups.** Turn on Supabase point-in-time recovery, because this database holds a payments ledger.
- **Supabase region.** Confirm it is close to Kenya. Distance was a main reason the app felt slow.
- **Supabase Auth settings.** Minimum password length 8, require letters and digits, keep email confirmation on, and enable CAPTCHA for sign-ups.
- **Password reset.** ✅ **Built (10 Oct 2026):** `/forgot-password` (calls `supabase.auth.resetPasswordForEmail`) and `/reset-password` (validates with the shared `checkPassword`, calls `auth.updateUser`). "Forgot password?" links are wired into the customer, staff and platform-admin login forms; `/auth/callback` handles `flow=recovery`. Verified with typecheck, unit tests and `next build`. Still needs a live Supabase email run to confirm end-to-end. **Legal pages below are still missing.**
- **Legal pages.** Privacy policy, terms, and handling of data requests under Kenya's Data Protection Act.
- **Instant messages.** Add a Database Webhook on `notification_deliveries` so SMS and email go out immediately instead of waiting up to a minute for the cron job.

## 3. Soon after launch

- **Speed:** cache the tenant lookup and the public menu, and paginate the menu.
- **Customer email opt-out** per kitchen (currently missing).
- **Housekeeping:** purge old rows in `payment_events`, `audit_logs`, `rate_limits` and `notification_deliveries`. Delete the stale remote branches on GitHub — as of 10 Oct 2026 only `performance` and `security-hardening` remain besides `main` (`design-refresh` and `storefront-redesign` are already gone).
- **Features:** reviews and ratings, promo codes at checkout, order scheduling, and a reports page.
- **Accessibility:** a pass with a screen reader and keyboard only, plus Swahili support.

## 4. Suggested order of work

1. ~~Build and migrations on a staging Supabase project (items 1 and 2 above).~~ **Item 1 (build/typecheck/test) is done — verified 10 Oct 2026.** Start with **item 2**: apply migrations 001–019 + `supabase/tests/*.sql` to a fresh staging Supabase and confirm clean execution.
2. Daraja sandbox run (item 3), plus secrets and Google sign-in (items 4 and 5).
3. Build the missing pieces flagged above: CI workflow (item 10), monitoring (item 11), ~~password reset~~ (item 15 — password reset done 10 Oct 2026; **legal pages remain**), then add the instant-message webhook (item 16).
4. A small pilot with one kitchen and real money: a few small orders you can refund.
5. Open to other kitchens.

### Ready-to-use next commands

```bash
# Local gates (all pass as of 10 Oct 2026)
npm ci && npm run typecheck && npm test && npm run build

# Item 2 — fresh staging DB
supabase link --project-ref <staging-ref>
supabase db push                       # applies 001–019
psql "$STAGING_DB_URL" -f supabase/tests/isolation_and_money.sql   # then the other 3 test files

# Item 4 — secrets (never commit real values)
supabase secrets set --env-file supabase/functions/.env

# Item 7 — deploy functions + schedule cron (see README)
supabase functions deploy
```

## 5. Tick-off table

Statuses verified against the repo on 10 October 2026. "Verified" = proven by a command run or by reading the code here; "Code-ready" = wiring exists, only the external step remains; "Manual" = needs a live Supabase/Daraja/browser/console run; "Missing" = absent from the repo, work required.

| #   | Item                                                      | Priority | Status     | Notes |
| --- | --------------------------------------------------------- | -------- | ---------- | ----- |
| 1   | Production build passes                                   | Must     | ✅ Verified | `tsc --noEmit` exit 0; `vitest run` 59/59 pass; `next build` succeeded (38 static pages, `.next/BUILD_ID` written). Slow Google Fonts retries in this sandbox only. |
| 2   | Migrations 001–019 and SQL tests run clean                | Must     | ⬜ Manual   | Needs a fresh staging Supabase. 001–019 + `supabase/tests/*.sql` present; 018/019 never executed. |
| 3   | M-Pesa flows verified on Daraja sandbox                   | Must     | ⬜ Manual   | Needs Daraja sandbox. STK/callback/B2C/refund functions exist. Known gap: no status-query fallback for stuck payouts/refunds. |
| 4   | All secrets set (Edge Functions and Vercel)               | Must     | 🔧 Code-ready | `PLATFORM_OWNER_EMAIL` is wired in `src/lib/actions/platform.ts` (guards `/setup`); documented in `.env.example` and `supabase/functions/.env.example`. Setting the real values is a deploy step. |
| 5   | Google sign-in configured                                 | Must     | 🔧 Code-ready | `GoogleButton.tsx` + `auth/callback/route.ts` implemented (customers only). README §"Google sign-in" has the console steps. Google Cloud + Supabase config is manual. |
| 6   | Wildcard domain and TLS                                   | Must     | ⬜ Manual   | Needs DNS + `NEXT_PUBLIC_ROOT_DOMAIN` = `platform_settings.root_domain`. Env var documented; TLS/DNS is infra. |
| 7   | Edge Functions deployed, cron scheduled                   | Must     | ⬜ Manual   | Functions + `config.toml` present (8 functions). Deploy + `payment-reconcile`/`notification-dispatch` cron is a Supabase step. |
| 8   | Browser check: CSP, mobile layout, uploads, notifications | Must     | 🔧 Code-ready | CSP + HSTS + security headers set in `next.config.mjs`. Console/mobile/upload/notification pass is manual. |
| 9   | Pasted GitHub tokens revoked                              | Must     | ⬜ Manual   | Do this in GitHub settings; cannot be verified from the repo. |
| 10  | Automated checks on pull requests                         | Should   | 🔧 Code-ready | **Added 10 Oct 2026:** `.github/workflows/ci.yml` runs typecheck + test + build on PRs and pushes to `main`. Will go green on the first run. |
| 11  | Error and uptime monitoring                               | Should   | ❌ Missing | No Sentry/monitoring/health-check wiring found. |
| 12  | End-to-end tests                                          | Should   | ❌ Missing | Only unit tests in `tests/`. No e2e (order → pay → accept → customer sees result). |
| 13  | Backups (point-in-time recovery)                          | Should   | ⬜ Manual   | Supabase project setting; cannot be checked from the repo. |
| 14  | Supabase region and Auth settings                         | Should   | ⬜ Manual   | Dashboard settings (region near Kenya; password policy, email confirm, CAPTCHA). |
| 15  | Password reset, legal pages                               | Should   | 🔧 Partial | Password reset **built** (forgot/reset pages, callback `flow=recovery`, login links; typecheck+tests+build pass). Legal pages (privacy/terms) still missing. |
| 16  | Instant message webhook                                   | Should   | ⬜ Manual   | Add a Supabase Database Webhook on `notification_deliveries` to fire SMS/email immediately instead of via cron. |
| 17  | Subscription lifecycle & auth hardening                   | Should   | 🔧 Code-ready | **Built 10 Oct 2026:** one-subscription-per-kitchen (enforced in DB), self-service billing page (monthly=30d, yearly=367d, custom 1–367d), plan switch keeps remaining time, `subscription_health` view computes active/expiring/expired/suspended/past_due, expired/suspended = read-only with banner, forced logout on expired session (middleware + `useSessionGuard` + checkout re-auth). Migrations 020/021 + typecheck/tests/build pass. Live apply + payment capture still manual. |

**Legend:** ✅ Verified · 🔧 Code-ready · ⬜ Manual (needs live run) · ❌ Missing (work required)
