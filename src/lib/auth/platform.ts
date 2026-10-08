import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUser } from './session';

export type PlatformRole = 'owner' | 'admin' | 'support';

export const getPlatformRole = cache(async (): Promise<PlatformRole | null> => {
  const user = await getUser();
  if (!user) return null;
  const { data } = await (await createClient()).from('platform_staff').select('role').eq('user_id', user.id).maybeSingle();
  return (data?.role as PlatformRole | undefined) ?? null;
});

/** Guard for every admin page. `write` pages additionally require owner/admin (support is read-only). */
export async function requirePlatform(write = false): Promise<PlatformRole> {
  const role = await getPlatformRole();
  if (!role) redirect('/login');
  if (write && role === 'support') redirect('/');
  return role;
}
