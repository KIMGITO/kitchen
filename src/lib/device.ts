/** Device breakpoints (px). Aligned with Tailwind md/lg so JS matches your `md:` classes. */
export const DEVICE_BREAKPOINTS = {
  /** <= mobileMax => mobile */
  mobileMax: 767,
  /** tabletMin..tabletMax => tablet/pad */
  tabletMin: 768,
  tabletMax: 1023,
  /** >= desktopMin => laptop/desktop */
  desktopMin: 1024,
} as const;

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  /** Laptops + desktops (>= 1024px). */
  isDesktop: boolean;
  /** Pads + phones. Handy for "show bottom tab bar" style logic. */
  isTouchDevice: boolean;
}

/**
 * Pure width -> device mapping. Works on server + client.
 * SSR-safe (no window access).
 *
 * @example
 * getDeviceTypeFromWidth(390) // 'mobile'
 * getDeviceTypeFromWidth(820) // 'tablet'
 * getDeviceTypeFromWidth(1440) // 'desktop'
 */
export function getDeviceTypeFromWidth(width: number): DeviceType {
  if (!Number.isFinite(width) || width < 0) return 'desktop';
  if (width <= DEVICE_BREAKPOINTS.mobileMax) return 'mobile';
  if (width <= DEVICE_BREAKPOINTS.tabletMax) return 'tablet';
  return 'desktop';
}

/** Build the full `isMobile / isTablet / isDesktop` info object from a width. */
export function getDeviceInfoFromWidth(width: number): DeviceInfo {
  const type = getDeviceTypeFromWidth(width);
  return {
    type,
    isMobile: type === 'mobile',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop',
    isTouchDevice: type !== 'desktop',
  };
}

const MOBILE_UA = /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini|mobile safari|fennec|windows phone|kindle.*mobile/i;
const TABLET_UA = /ipad|android(?!.*mobile)|tablet|kindle|silk|playbook|nexus\s*[79]|xoom|sch-i800/i;

/**
 * Guess device from a User-Agent string (for Server Components / middleware).
 * Pure + SSR-safe. Returns 'desktop' when UA is missing/unknown.
 *
 * Note: iPadOS 13+ reports as "Macintosh" desktop Safari — width/matchMedia
 * on the client is the source of truth; treat this as a best-effort initial guess.
 */
export function getDeviceTypeFromUserAgent(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return 'desktop';
  if (TABLET_UA.test(userAgent)) return 'tablet';
  if (MOBILE_UA.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** Build the full info object from a User-Agent string. */
export function getDeviceInfoFromUserAgent(userAgent: string | null | undefined): DeviceInfo {
  const type = getDeviceTypeFromUserAgent(userAgent);
  return {
    type,
    isMobile: type === 'mobile',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop',
    isTouchDevice: type !== 'desktop',
  };
}

/** Shorthands so you can `import { isMobileUA } from '@/lib/device'` anywhere. */
export function isMobileUA(userAgent: string | null | undefined): boolean {
  return getDeviceTypeFromUserAgent(userAgent) === 'mobile';
}

export function isTabletUA(userAgent: string | null | undefined): boolean {
  return getDeviceTypeFromUserAgent(userAgent) === 'tablet';
}

export function isDesktopUA(userAgent: string | null | undefined): boolean {
  return getDeviceTypeFromUserAgent(userAgent) === 'desktop';
}

/**
 * Server helper for Next.js App Router Server Components / layouts.
 * Reads the `user-agent` request header — no `window` needed.
 *
 * @example
 * // app/page.tsx (Server Component)
 * import { getServerDevice } from '@/lib/device';
 * export default async function Page() {
 *   const { isMobile } = await getServerDevice();
 *   return isMobile ? <MobileHero /> : <DesktopHero />;
 * }
 */
export async function getServerDevice(): Promise<DeviceInfo> {
  const { headers } = await import('next/headers');
  const ua = (await headers()).get('user-agent');
  return getDeviceInfoFromUserAgent(ua);
}
