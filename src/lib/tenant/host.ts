import { ADMIN_SUBDOMAIN } from '@/lib/env';

export type HostKind =
  | { kind: 'platform' }                     // example.com  -> marketing / kitchen onboarding
  | { kind: 'admin' }                        // admin.example.com
  | { kind: 'tenant'; hostname: string };    // {slug}.example.com or a verified custom domain

/** Pure function so it can be unit-tested and reused by middleware. */
export function classifyHost(rawHost: string, rootDomain: string): HostKind {
  const host = rawHost.toLowerCase().split(':')[0] ?? '';
  if (host === rootDomain || host === `www.${rootDomain}`) return { kind: 'platform' };
  if (host === `${ADMIN_SUBDOMAIN}.${rootDomain}`) return { kind: 'admin' };
  return { kind: 'tenant', hostname: host };
}

/** Header set ONLY by middleware after it classifies the request host. */
export const TENANT_HOST_HEADER = 'x-tenant-hostname';
