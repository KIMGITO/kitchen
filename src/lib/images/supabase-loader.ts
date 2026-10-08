import { publicEnv } from '@/lib/env';

/**
 * next/image custom loader. With Supabase image transformations enabled, requests a resized WebP from
 * the render endpoint; otherwise serves the (already client-compressed, content-hashed) original.
 */
export default function supabaseLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (!publicEnv.supabaseTransforms || !src.includes('/storage/v1/object/public/')) return src;
  const url = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  return `${url}?width=${width}&quality=${quality ?? 75}&resize=contain`;
}
