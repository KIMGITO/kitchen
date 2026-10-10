import type { ImageKind } from './compress';

export interface Aspect { label: string; value: number }

/** Crop shapes offered per kind of image. The first is the default. */
export const DEFAULT_ASPECTS: Record<ImageKind, Aspect[]> = {
  logo: [{ label: 'Square', value: 1 }],
  avatar: [{ label: 'Square', value: 1 }],
  profile: [{ label: 'Portrait 4:5', value: 4 / 5 }, { label: 'Square', value: 1 }],
  product: [{ label: 'Landscape 4:3', value: 4 / 3 }, { label: 'Square', value: 1 }],
  promo: [{ label: 'Wide 16:9', value: 16 / 9 }, { label: 'Landscape 3:2', value: 3 / 2 }],
  cover: [{ label: 'Wide 16:9', value: 16 / 9 }, { label: 'Landscape 3:2', value: 3 / 2 }],
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export interface CropState { quarter: number; zoom: number; ox: number; oy: number }

/** Size of the source after rotating by quarter-turns. */
export function rotatedSize(w: number, h: number, quarter: number) {
  return quarter % 2 === 0 ? { w, h } : { w: h, h: w };
}

/** Scale (viewport units per source pixel) that makes the image just cover the viewport at zoom 1. */
export function coverScale(srcW: number, srcH: number, quarter: number, vw: number, vh: number) {
  const r = rotatedSize(srcW, srcH, quarter);
  return Math.max(vw / r.w, vh / r.h);
}

/** Keeps the image covering the whole viewport: you can never pan into empty space. */
export function clampOffset(st: CropState, srcW: number, srcH: number, vw: number, vh: number) {
  const r = rotatedSize(srcW, srcH, st.quarter);
  const scale = coverScale(srcW, srcH, st.quarter, vw, vh) * st.zoom;
  const maxX = Math.max(0, (r.w * scale - vw) / 2);
  const maxY = Math.max(0, (r.h * scale - vh) / 2);
  return { ox: Math.min(maxX, Math.max(-maxX, st.ox)), oy: Math.min(maxY, Math.max(-maxY, st.oy)) };
}

/** Output pixel size: never upscales past the real source detail, never exceeds the kind's longest edge. */
export function outputSize(maxEdge: number, aspect: number, srcW: number, srcH: number, st: CropState, vw: number, vh: number) {
  const scale = coverScale(srcW, srcH, st.quarter, vw, vh) * st.zoom;
  const sourceVisibleW = vw / scale;
  const maxW = aspect >= 1 ? maxEdge : Math.round(maxEdge * aspect);
  const w = Math.max(64, Math.min(maxW, Math.round(sourceVisibleW)));
  return { w, h: Math.max(64, Math.round(w / aspect)) };
}

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
