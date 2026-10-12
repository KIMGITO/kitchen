import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUser } from './session';

export type PlatformRole = 'owner' | 'admin' | 'support';

/** Why access was refused — surfaced to the user instead of a silent redirect loop. */
export type PlatformAccessDenied = 'not_signed_in' | 'not_platform_staff' | 'read_only';

/**
 * Resolves the signed-in user's platform role.
 *
 * Returns the authenticated user separately from the role so callers can tell
 * "not signed in" apart from "signed in but not platform staff" — these used to be
 * indistinguishable (both were `null`), so a failed guard bounced the user back to
 * the login page with no explanation.
 */
export const getPlatformAccess = cache(async (): Promise<{ signedIn: boolean; role: PlatformRole | null; reason?: string }> => {
  const user = await getUser();
  if (!user) return { signedIn: false, role: null };
  const { data, error } = await (await createClient()).from('platform_staff').select('role').eq('user_id', user.id).maybeSingle();
  if (error) return { signedIn: true, role: null, reason: error.message };
  return { signedIn: true, role: (data?.role as PlatformRole | undefined) ?? null };
});

export const getPlatformRole = cache(async (): Promise<PlatformRole | null> => {
  const access = await getPlatformAccess();
  return access.role;
});

/**
 * Guard for every admin page. `write` pages additionally require owner/admin (support is read-only).
 *
 * Every refusal redirects to `/login?error=<reason>` so the login page can explain
 * what happened. A bare `redirect('/login')` produced an infinite-looking loop:
 * sign in -> console -> refused -> back to login, with nothing to act on.
 */
export async function requirePlatform(write = false): Promise<PlatformRole> {
  const access = await getPlatformAccess();
  if (!access.signedIn) redirect('/login?error=not_signed_in');
  if (!access.role) redirect('/login?error=not_platform_staff');
  if (write && access.role === 'support') redirect('/login?error=read_only');
  return access.role;
}
