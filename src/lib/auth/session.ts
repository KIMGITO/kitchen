import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { PermissionSet, type Permission } from './permissions';

/** Verified user (validated against the Auth server, not just the cookie). */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/** The signed-in user's customer account for the CURRENT kitchen, or null. */
export const getKitchenCustomer = cache(async () => {
  const [user, tenant] = await Promise.all([getUser(), getTenant()]);
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('kitchen_customers')
    .select('id, full_name, phone, email, status')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle();
  return data;
});

/** Staff permissions in the CURRENT kitchen. Empty when not a member. */
export const getPermissions = cache(async (): Promise<PermissionSet> => {
  const [user, tenant] = await Promise.all([getUser(), getTenant()]);
  if (!user) return PermissionSet.from([]);
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_permissions', { p_tenant: tenant.id });
  return PermissionSet.from(data as string[] | null);
});

/** Server-side guard for dashboard pages and actions. */
export async function requirePermission(permission: Permission) {
  const user = await getUser();
  if (!user) redirect('/staff-login?next=/dashboard');
  const perms = await getPermissions();
  if (!perms.can(permission)) redirect('/dashboard/forbidden');
  return { user, perms };
}
