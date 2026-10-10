import type { MetadataRoute } from 'next';
import { getTenantOptional } from '@/lib/tenant/get-tenant';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const tenant = await getTenantOptional();
  if (!tenant || tenant.status !== 'active') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/account', '/notifications', '/cart', '/login', '/register', '/auth'] },
    sitemap: `https://${tenant.primary_hostname}/sitemap.xml`,
  };
}
