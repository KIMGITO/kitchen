import { describe, expect, it } from 'vitest';
import { contrastRatio, resolveTheme, themeToCss } from '@/theme/resolve';
import { defaultTheme } from '@/theme/theme';
import { classifyHost } from '@/lib/tenant/host';

describe('theme', () => {
  it('applies valid overrides', () => {
    expect(resolveTheme({ colors: { brand: '#112233' } }).colors.brand).toBe('#112233');
  });
  it('ignores non-overridable roles and bad values', () => {
    const t = resolveTheme({ colors: { ink: '#ff0000', brand: 'red' } });
    expect(t.colors.ink).toBe(defaultTheme.colors.ink);
    expect(t.colors.brand).toBe(defaultTheme.colors.brand);
  });
  it('falls back to defaults when branding is unreadable', () => {
    const t = resolveTheme({ colors: { brand: '#FFFFFF', brandContrast: '#FFFFFF' } });
    expect(t.colors.brand).toBe(defaultTheme.colors.brand);
  });
  it('emits CSS variables, no raw user strings', () => {
    const css = themeToCss(defaultTheme);
    expect(css).toContain('--color-brand: 11 77 60;');
    expect(css).toContain('--text-display-size');
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});

describe('host classification', () => {
  it('routes platform, admin and tenant hosts', () => {
    expect(classifyHost('example.com', 'example.com')).toEqual({ kind: 'platform' });
    expect(classifyHost('admin.example.com', 'example.com')).toEqual({ kind: 'admin' });
    expect(classifyHost('Kitchen-A.example.com:3000', 'example.com')).toEqual({ kind: 'tenant', hostname: 'kitchen-a.example.com' });
    expect(classifyHost('orders.kitchen-a.com', 'example.com')).toEqual({ kind: 'tenant', hostname: 'orders.kitchen-a.com' });
  });
});
