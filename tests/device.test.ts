import { describe, expect, it } from 'vitest';
import {
  getDeviceInfoFromUserAgent,
  getDeviceInfoFromWidth,
  getDeviceTypeFromUserAgent,
  getDeviceTypeFromWidth,
  isDesktopUA,
  isMobileUA,
  isTabletUA,
} from '@/lib/device';

describe('getDeviceTypeFromWidth', () => {
  it('maps phone widths to mobile', () => {
    expect(getDeviceTypeFromWidth(320)).toBe('mobile');
    expect(getDeviceTypeFromWidth(390)).toBe('mobile');
    expect(getDeviceTypeFromWidth(767)).toBe('mobile');
  });

  it('maps pad widths to tablet', () => {
    expect(getDeviceTypeFromWidth(768)).toBe('tablet');
    expect(getDeviceTypeFromWidth(820)).toBe('tablet');
    expect(getDeviceTypeFromWidth(1023)).toBe('tablet');
  });

  it('maps laptop/desktop widths to desktop', () => {
    expect(getDeviceTypeFromWidth(1024)).toBe('desktop');
    expect(getDeviceTypeFromWidth(1440)).toBe('desktop');
    expect(getDeviceTypeFromWidth(2560)).toBe('desktop');
  });

  it('falls back to desktop for invalid widths', () => {
    expect(getDeviceTypeFromWidth(NaN)).toBe('desktop');
    expect(getDeviceTypeFromWidth(-1)).toBe('desktop');
  });
});

describe('getDeviceInfoFromWidth', () => {
  it('exposes isMobile / isTablet / isDesktop flags', () => {
    expect(getDeviceInfoFromWidth(390)).toMatchObject({ type: 'mobile', isMobile: true, isTablet: false, isDesktop: false });
    expect(getDeviceInfoFromWidth(800)).toMatchObject({ type: 'tablet', isMobile: false, isTablet: true, isDesktop: false });
    expect(getDeviceInfoFromWidth(1280)).toMatchObject({ type: 'desktop', isMobile: false, isTablet: false, isDesktop: true });
  });
});

describe('getDeviceTypeFromUserAgent', () => {
  it('detects iPhone as mobile', () => {
    expect(
      getDeviceTypeFromUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('mobile');
    expect(isMobileUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe(true);
  });

  it('detects iPad / Android tablet as tablet', () => {
    expect(
      getDeviceTypeFromUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('tablet');
    expect(isTabletUA('Mozilla/5.0 (Linux; Android 13; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe(true);
  });

  it('detects desktop Chrome as desktop and handles missing UA', () => {
    const desktop =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(getDeviceTypeFromUserAgent(desktop)).toBe('desktop');
    expect(isDesktopUA(desktop)).toBe(true);
    expect(getDeviceTypeFromUserAgent(undefined)).toBe('desktop');
    expect(getDeviceTypeFromUserAgent('')).toBe('desktop');
  });

  it('builds full info from UA', () => {
    expect(getDeviceInfoFromUserAgent('iphone')).toMatchObject({ isMobile: true, isDesktop: false });
  });
});
