import { describe, expect, it } from 'vitest';
import { SHARED_PATHS, isSharedPath } from '@/lib/tenant/paths';
import { classifyHost } from '@/lib/tenant/host';

describe('isSharedPath', () => {
  it('matches the shared auth routes exactly', () => {
    expect(isSharedPath('/forgot-password')).toBe(true);
    expect(isSharedPath('/reset-password')).toBe(true);
    expect(isSharedPath('/auth/callback')).toBe(true);
  });

  it('matches children of a shared route', () => {
    expect(isSharedPath('/auth/callback')).toBe(true);
    expect(isSharedPath('/auth')).toBe(true);
  });

  it('does not match similar-looking paths', () => {
    expect(isSharedPath('/forgot-password-x')).toBe(false);
    expect(isSharedPath('/reset')).toBe(false);
    expect(isSharedPath('/login')).toBe(false);
    expect(isSharedPath('/platform-admin/login')).toBe(false);
    expect(isSharedPath('/')).toBe(false);
    expect(isSharedPath('')).toBe(false);
  });

  it('every shared path starts with a slash and has no trailing slash', () => {
    for (const p of SHARED_PATHS) {
      expect(p.startsWith('/')).toBe(true);
      expect(p.endsWith('/')).toBe(false);
    }
  });
});

describe('classifyHost', () => {
  const root = 'example.com';

  it('routes the apex, www and admin hosts', () => {
    expect(classifyHost('example.com', root)).toEqual({ kind: 'platform' });
    expect(classifyHost('www.example.com', root)).toEqual({ kind: 'platform' });
    expect(classifyHost('admin.example.com', root)).toEqual({ kind: 'admin' });
  });

  it('treats any other subdomain as a tenant', () => {
    expect(classifyHost('mamas-kitchen.example.com', root)).toEqual({ kind: 'tenant', hostname: 'mamas-kitchen.example.com' });
  });

  it('ignores the port and is case-insensitive', () => {
    expect(classifyHost('EXAMPLE.COM:3000', root)).toEqual({ kind: 'platform' });
    expect(classifyHost('admin.example.com:443', root)).toEqual({ kind: 'admin' });
  });

  it('does not let a crafted hostname impersonate the admin area', () => {
    // A kitchen slug may not be used to reach the platform admin console.
    expect(classifyHost('admin.example.com.evil.test', root)).toEqual({ kind: 'tenant', hostname: 'admin.example.com.evil.test' });
    expect(classifyHost('xadmin.example.com', root)).toEqual({ kind: 'tenant', hostname: 'xadmin.example.com' });
  });

  it('serves loopback and bare IPs as the platform area', () => {
    expect(classifyHost('localhost:3000', root)).toEqual({ kind: 'platform' });
    expect(classifyHost('127.0.0.1', root)).toEqual({ kind: 'platform' });
    expect(classifyHost('192.168.1.20:3000', root)).toEqual({ kind: 'platform' });
  });

  it('maps wildcard-DNS dev hosts', () => {
    expect(classifyHost('1.2.3.4.nip.io', root)).toEqual({ kind: 'platform' });
    expect(classifyHost('admin.1.2.3.4.nip.io', root)).toEqual({ kind: 'admin' });
    expect(classifyHost('mamas.1.2.3.4.nip.io', root)).toEqual({ kind: 'tenant', hostname: 'mamas.example.com' });
  });
});
