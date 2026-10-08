import type { MetadataRoute } from 'next';
import { getTenantOptional } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenant = await getTenantOptional();
  if (!tenant || tenant.status !== 'active' || !tenant.primary_hostname) return [];
  const base = `https://${tenant.primary_hostname}`;
  const supabase = await createClient();
  const { data } = await supabase.from('products').select('slug, updated_at').eq('tenant_id', tenant.id).limit(5000);
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/menu`, changeFrequency: 'daily', priority: 0.9 },
    ...((data ?? []) as { slug: string; updated_at: string }[]).map((p) => ({ url: `${base}/item/${p.slug}`, lastModified: p.updated_at })),
  ];
}
