'use client';

import { useSyncExternalStore } from 'react';
import {
  DEVICE_BREAKPOINTS,
  getDeviceInfoFromWidth,
  type DeviceInfo,
} from '@/lib/device';

function getWidthSnapshot(): number {
  if (typeof window === 'undefined') return DEVICE_BREAKPOINTS.desktopMin;
  return window.innerWidth;
}

function subscribe(onChange: () => void): () => void {
  const mobileQuery = window.matchMedia(`(max-width: ${DEVICE_BREAKPOINTS.mobileMax}px)`);
  const desktopQuery = window.matchMedia(`(min-width: ${DEVICE_BREAKPOINTS.desktopMin}px)`);
  window.addEventListener('resize', onChange);
  mobileQuery.addEventListener?.('change', onChange);
  desktopQuery.addEventListener?.('change', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    mobileQuery.removeEventListener?.('change', onChange);
    desktopQuery.removeEventListener?.('change', onChange);
  };
}

/**
 * Reactive device info for Client Components. SSR-safe (hydrates as desktop,
 * then corrects on mount — pass `initial` from `getServerDevice()` to avoid flicker).
 *
 * @example
 * 'use client';
 * import { useDevice } from '@/hooks/use-device';
 *
 * export function Hero() {
 *   const { isMobile, isTablet, isDesktop, type } = useDevice();
 *   if (isMobile) return <MobileHero />;
 *   if (isTablet) return <TabletHero />;
 *   return <DesktopHero />;
 * }
 */
export function useDevice(initial?: DeviceInfo): DeviceInfo {
  const width = useSyncExternalStore(
    subscribe,
    getWidthSnapshot,
    () => initial ? widthForType(initial.type) : DEVICE_BREAKPOINTS.desktopMin,
  );
  return getDeviceInfoFromWidth(width);
}

function widthForType(type: DeviceInfo['type']): number {
  switch (type) {
    case 'mobile': return DEVICE_BREAKPOINTS.mobileMax;
    case 'tablet': return DEVICE_BREAKPOINTS.tabletMin;
    default: return DEVICE_BREAKPOINTS.desktopMin;
  }
}

/** Convenience shorthands: `const isMobile = useIsMobile()`. */
export function useIsMobile(): boolean {
  return useDevice().isMobile;
}

export function useIsTablet(): boolean {
  return useDevice().isTablet;
}

export function useIsDesktop(): boolean {
  return useDevice().isDesktop;
}
