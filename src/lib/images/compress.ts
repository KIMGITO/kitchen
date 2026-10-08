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

export async function prepareImage(file: File, kind: ImageKind): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) throw new ImageError('Use a JPG, PNG or WebP image.');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('This image is larger than 15 MB. Choose a smaller one.');
  const preset = IMAGE_PRESETS[kind];

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, preset.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Your browser cannot process images.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Step quality down until the file fits the preset budget.
  let quality = preset.quality;
  let blob = await toBlob(canvas, quality);
  while (blob.size > preset.maxBytes && quality > 0.5) {
    quality -= 0.08;
    blob = await toBlob(canvas, quality);
  }
  if (blob.size > preset.maxBytes * 2) throw new ImageError('This image is too detailed to compress enough. Try a simpler photo.');

  return { blob, hash: await sha256Hex(blob), width, height, bytes: blob.size, mime: 'image/webp' };
}

export const BUCKET_FOR_KIND: Record<ImageKind, string> = {
  logo: 'kitchen-branding', profile: 'kitchen-branding', cover: 'kitchen-branding',
  product: 'product-images', promo: 'promo-images', avatar: 'customer-avatars',
};
