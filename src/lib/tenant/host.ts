import { ADMIN_SUBDOMAIN } from '@/lib/env';

export type HostKind =
  | { kind: 'platform' }                     // example.com  -> marketing / kitchen onboarding
  | { kind: 'admin' }                        // admin.example.com
  | { kind: 'tenant'; hostname: string };    // {slug}.example.com or a verified custom domain

/** Strip port (and brackets) without breaking bare IPv6 like `::1`. */
function baseHostname(rawHost: string): string {
  const lower = rawHost.toLowerCase().trim();
  if (lower.startsWith('[')) {
    const end = lower.indexOf(']');
    if (end > 0) return lower.slice(1, end).replace(/\.$/, '');
    return lower;
  }
  // host:port has exactly one colon. Bare IPv6 has 2+.
  if (lower.split(':').length - 1 === 1) return (lower.split(':')[0] ?? '').replace(/\.$/, '');
  return lower.replace(/\.$/, '');
}

function isIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}

/**
 * nip.io / sslip.io wildcard DNS for LAN dev without /etc/hosts edits.
 *   192.168.100.211.nip.io              -> bare IP (platform)
 *   admin.192.168.100.211.nip.io        -> admin console
 *   myshop.192.168.100.211.nip.io       -> tenant `myshop.<rootDomain>`
 * sslip.io also allows dashes: 192-168-100-211.sslip.io
 */
function parseWildcardDns(host: string): { ip: string; labels: string[] } | null {
  let suffix: '.nip.io' | '.sslip.io' | null = null;
  if (host.endsWith('.nip.io')) suffix = '.nip.io';
  else if (host.endsWith('.sslip.io')) suffix = '.sslip.io';
  else return null;
  const inner = host.slice(0, -suffix.length);
  if (!inner) return null;
  const parts = inner.split('.');
  // Try trailing 4 dot-separated octets: a.b.<ip>
  if (parts.length >= 4) {
    const maybeIp = parts.slice(-4).join('.');
    if (isIPv4(maybeIp)) return { ip: maybeIp, labels: parts.slice(0, -4) };
  }
  // Try trailing dash-separated IP (sslip.io style): myshop.192-168-100-211
  const last = parts[parts.length - 1] ?? '';
  if (/^\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}$/.test(last)) {
    const ip = last.split('-').join('.');
    if (isIPv4(ip)) return { ip, labels: parts.slice(0, -1) };
  }
  return null;
}

/** Pure function so it can be unit-tested and reused by middleware. */
export function classifyHost(rawHost: string, rootDomain: string): HostKind {
  const host = baseHostname(rawHost);
  const root = rootDomain.toLowerCase();
  if (host === root || host === `www.${root}`) return { kind: 'platform' };
  if (host === `${ADMIN_SUBDOMAIN}.${root}`) return { kind: 'admin' };
  if (isLoopback(host)) return { kind: 'platform' };

  // LAN / wildcard-DNS dev hosts (phone on same Wi-Fi, no /etc/hosts needed).
  const wild = parseWildcardDns(host);
  if (wild) {
    if (wild.labels.length === 0 || (wild.labels.length === 1 && wild.labels[0] === 'www')) {
      return { kind: 'platform' };
    }
    if (wild.labels.length === 1 && wild.labels[0] === ADMIN_SUBDOMAIN) {
      return { kind: 'admin' };
    }
    if (wild.labels.length === 1) {
      // Map back to the canonical tenant hostname so resolve_tenant() finds it.
      return { kind: 'tenant', hostname: `${wild.labels[0]}.${root}` };
    }
    return { kind: 'tenant', hostname: host };
  }

  // Bare LAN IP (e.g. http://192.168.100.211:3000) has no tenant mapping,
  // so serve the platform site instead of a confusing 404.
  if (isIPv4(host)) return { kind: 'platform' };

  // `<slug>.<lan-ip>` / `admin.<lan-ip>` for setups using /etc/hosts or a local DNS.
  const ipSuffix = host.split('.').slice(-4).join('.');
  if (isIPv4(ipSuffix)) {
    const labels = host.split('.').slice(0, -4);
    if (labels.length === 0) return { kind: 'platform' };
    if (labels.length === 1 && labels[0] === 'www') return { kind: 'platform' };
    if (labels.length === 1 && labels[0] === ADMIN_SUBDOMAIN) return { kind: 'admin' };
    if (labels.length === 1) return { kind: 'tenant', hostname: `${labels[0]}.${root}` };
  }

  return { kind: 'tenant', hostname: host };
}

/** Header set ONLY by middleware after it classifies the request host. */
export const TENANT_HOST_HEADER = 'x-tenant-hostname';
