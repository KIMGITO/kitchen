/**
 * Client-side image pipeline: orient -> resize -> WebP -> content hash.
 * Redrawing on a canvas drops all EXIF metadata, including GPS coordinates.
 */
export type ImageKind = 'logo' | 'profile' | 'cover' | 'product' | 'promo' | 'avatar';

interface Preset { maxEdge: number; quality: number; maxBytes: number }
export const IMAGE_PRESETS: Record<ImageKind, Preset> = {
  logo:    { maxEdge: 512,  quality: 0.9,  maxBytes: 200 * 1024 },
  profile: { maxEdge: 800,  quality: 0.82, maxBytes: 250 * 1024 },
  avatar:  { maxEdge: 512,  quality: 0.8,  maxBytes: 150 * 1024 },
  product: { maxEdge: 1600, quality: 0.8,  maxBytes: 300 * 1024 },
  promo:   { maxEdge: 1800, quality: 0.8,  maxBytes: 400 * 1024 },
  cover:   { maxEdge: 2400, quality: 0.78, maxBytes: 500 * 1024 },
};

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export interface PreparedImage { blob: Blob; hash: string; width: number; height: number; bytes: number; mime: 'image/webp' }

export class ImageError extends Error {}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('Could not process this image.'))), 'image/webp', quality));
}

/** Hard ceiling for what is stored: 2 MB (avatars 1 MB). Matches the storage bucket limits. */
export const hardMaxBytes = (kind: ImageKind) => (kind === 'avatar' ? 1 : 2) * 1024 * 1024;
export const MAX_INPUT_MB = 15;

/** Validates a picked file before opening the editor. */
export function checkInputFile(file: File): void {
  if (!ACCEPTED.includes(file.type)) throw new ImageError('Use a JPG, PNG or WebP image.');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError(`This image is larger than ${MAX_INPUT_MB} MB. Choose a smaller one.`);
}

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  checkInputFile(file);
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new ImageError('This image could not be opened. Try another file.'); }
}

/** Canvas -> WebP under the kind's size budget. Quality steps down first, then dimensions, until it fits the hard cap. */
export async function encodeCanvas(source: HTMLCanvasElement, kind: ImageKind): Promise<PreparedImage> {
  const preset = IMAGE_PRESETS[kind];
  const cap = hardMaxBytes(kind);
  let canvas = source;
  let quality = preset.quality;
  let blob = await toBlob(canvas, quality);
  while (blob.size > preset.maxBytes && quality > 0.6) { quality -= 0.08; blob = await toBlob(canvas, quality); }
  for (let i = 0; blob.size > cap && i < 10; i++) {
    if (quality > 0.5) quality -= 0.08;
    else {
      const smaller = document.createElement('canvas');
      smaller.width = Math.round(canvas.width * 0.85); smaller.height = Math.round(canvas.height * 0.85);
      smaller.getContext('2d')?.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      canvas = smaller;
    }
    blob = await toBlob(canvas, quality);
  }
  if (blob.size > cap) throw new ImageError(`Could not shrink this image under ${cap / 1024 / 1024} MB. Try a simpler photo.`);
  return { blob, hash: await sha256Hex(blob), width: canvas.width, height: canvas.height, bytes: blob.size, mime: 'image/webp' };
}

/** Straight resize without cropping (kept for callers that do not need the editor). */
export async function prepareImage(file: File, kind: ImageKind): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, IMAGE_PRESETS[kind].maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Your browser cannot process images.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return encodeCanvas(canvas, kind);
}

export const BUCKET_FOR_KIND: Record<ImageKind, string> = {
  logo: 'kitchen-branding', profile: 'kitchen-branding', cover: 'kitchen-branding',
  product: 'product-images', promo: 'promo-images', avatar: 'customer-avatars',
};
