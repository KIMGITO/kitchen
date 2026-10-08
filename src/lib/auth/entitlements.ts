import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';

export interface Entitlements {
  hasFeature(key: string): boolean;
  /** null = unlimited, 0 = not on plan */
  getLimit(key: string): number | null;
}

/** Cached per request. The database re-enforces sensitive features in RLS/RPC. */
export const getEntitlements = cache(async (): Promise<Entitlements> => {
  const tenant = await getTenant();
  const supabase = await createClient();
  const { data } = await supabase.rpc('tenant_entitlements', { p_tenant: tenant.id });
  const rows = (data ?? []) as { feature_key: string; kind: 'flag' | 'limit'; enabled: boolean; limit_value: number | null }[];
  const byKey = new Map(rows.map((r) => [r.feature_key, r]));
  return {
    hasFeature: (key) => byKey.get(key)?.enabled === true,
    getLimit: (key) => {
      const r = byKey.get(key);
      if (!r || !r.enabled) return 0;
      return r.limit_value;
    },
  };
});
