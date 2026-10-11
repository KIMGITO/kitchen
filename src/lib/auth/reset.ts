/**
 * Password-recovery helpers. Pure and environment-free so they can run in the
 * browser client and be unit-tested without a DOM or Supabase connection.
 */

/** Only same-site relative paths are safe as post-auth targets. */
export function safePath(p: string | null | undefined, fallback: string): string {
  return p && p.startsWith('/') && !p.startsWith('//') ? p : fallback;
}

/**
 * Builds the `redirectTo` for a password-recovery email.
 *
 * The link points at our `/auth/callback` (which exchanges the recovery code for
 * a session), then lands on `/reset-password` carrying the page to return to once
 * the new password is set. `flow=recovery` tells the callback to skip the Google /
 * customer-onboarding checks and send the user straight to the reset page.
 */
export function buildResetRedirect(origin: string, returnTo?: string): string {
  const ret = safePath(returnTo, '/login');
  const next = `/reset-password?return=${encodeURIComponent(ret)}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}&flow=recovery`;
}
