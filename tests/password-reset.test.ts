import { describe, expect, it } from 'vitest';
import { safePath, buildResetRedirect } from '@/lib/auth/reset';

describe('password recovery redirect helpers', () => {
  it('only allows same-site relative paths', () => {
    expect(safePath('/login', '/')).toBe('/login');
    expect(safePath('/staff-login', '/')).toBe('/staff-login');
    expect(safePath('/platform-admin/login?x=1', '/')).toBe('/platform-admin/login?x=1');
  });

  it('falls back for unsafe or empty paths', () => {
    expect(safePath(null, '/login')).toBe('/login');
    expect(safePath(undefined, '/login')).toBe('/login');
    expect(safePath('', '/login')).toBe('/login');
    expect(safePath('https://evil.com', '/login')).toBe('/login');
    expect(safePath('//evil.com', '/login')).toBe('/login');
    expect(safePath('javascript:alert(1)', '/login')).toBe('/login');
  });

  it('points the recovery email at the callback, then the reset page carrying the return target', () => {
    const url = buildResetRedirect('https://mamas-kitchen.co.ke', '/login');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://mamas-kitchen.co.ke');
    expect(parsed.pathname).toBe('/auth/callback');
    expect(parsed.searchParams.get('flow')).toBe('recovery');
    // `next` is itself a relative path (kept same-site) that lands on the reset page.
    expect(parsed.searchParams.get('next')).toBe('/reset-password?return=%2Flogin');
    const nextPath = parsed.searchParams.get('next')!;
    expect(nextPath.startsWith('/') && !nextPath.startsWith('//')).toBe(true);
  });

  it('carries the correct return target for staff and platform admins', () => {
    const staff = new URL(buildResetRedirect('https://admin.example.com', '/staff-login')).searchParams.get('next')!;
    expect(staff).toBe('/reset-password?return=%2Fstaff-login');
    const admin = new URL(buildResetRedirect('https://admin.example.com', '/platform-admin/login')).searchParams.get('next')!;
    expect(admin).toBe('/reset-password?return=%2Fplatform-admin%2Flogin');
  });

  it('defaults an unsafe/absent return target to /login', () => {
    const url = new URL(buildResetRedirect('https://x.test', 'https://evil.com'));
    expect(url.searchParams.get('next')).toBe('/reset-password?return=%2Flogin');
  });
});
