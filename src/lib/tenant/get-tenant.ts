import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTheme } from '@/theme/resolve';
import type { Tenant } from './types';
import { TENANT_HOST_HEADER } from './host';


/**
 * Resolves the active tenant from the hostname that MIDDLEWARE validated and set.
 * The browser never supplies a tenant id. Cached per request.
 */
export const getTenantOptional = cache(async (): Promise<Tenant | null> => {
  const hostname = (await headers()).get(TENANT_HOST_HEADER);
  if (!hostname) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('resolve_tenant', { p_hostname: hostname }).maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown> & { theme_overrides: unknown };
  return { ...(row as unknown as Omit<Tenant, 'theme'>), theme: resolveTheme(row.theme_overrides) };
});

export async function getTenant(): Promise<Tenant> {
  const tenant = await getTenantOptional();
  if (!tenant) notFound();
  return tenant;
}

/** Storefront pages are only available for active kitchens. */
export async function getActiveTenant(): Promise<Tenant> {
  const tenant = await getTenant();
  if (tenant.status !== 'active') notFound();
  return tenant;
}
