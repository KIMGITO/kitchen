'use client';
import { useId, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { BUCKET_FOR_KIND, ImageError, prepareImage, type ImageKind } from '@/lib/images/compress';
import { Button } from './Button';

interface Props {
  tenantId: string;
  kind: ImageKind;
  /** Sub-folder under {tenant_id}/, e.g. "products/<product_id>" */
  folder: string;
  label: string;
  currentUrl?: string | null;
  onUploaded: (publicUrl: string, path: string) => void;
}

/**
 * Compresses (resize + WebP + EXIF strip) and uploads to the tenant's folder.
 * Nothing is ever uploaded uncompressed. Storage RLS re-checks tenant + permission server-side.
 */
export function ImageUploader({ tenantId, kind, folder, label, currentUrl, onUploaded }: Props) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null); setBusy(true);
    try {
      const img = await prepareImage(file, kind);
      const bucket = BUCKET_FOR_KIND[kind];
      const path = `${tenantId}/${folder}/${img.hash}.webp`;
      const supabase = createClient();

      const { error: upErr } = await supabase.storage.from(bucket).upload(path, img.blob, {
        contentType: img.mime, cacheControl: '31536000', upsert: false,
      });
      // Same content hash already stored = identical image; treat as success.
      if (upErr && !/already exists|Duplicate/i.test(upErr.message)) throw new Error(upErr.message);

      const { data: user } = await supabase.auth.getUser();
      await supabase.from('media_assets').upsert(
        { tenant_id: tenantId, bucket, path, mime_type: img.mime, bytes: img.bytes, width: img.width, height: img.height, uploaded_by: user.user?.id },
        { onConflict: 'bucket,path', ignoreDuplicates: true },
      );

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      setPreview(data.publicUrl);
      onUploaded(data.publicUrl, path);
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'Upload failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-ink">{label}</span>
      <div className="flex items-center gap-4">
        <div className="relative size-24 overflow-hidden rounded-md bg-surface-alt">
          {preview ? <Image src={preview} alt="" fill sizes="96px" className="object-cover" /> : null}
        </div>
        <div className="flex flex-col gap-1">
          <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
          <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => document.getElementById(inputId)?.click()}>
            {preview ? 'Replace image' : 'Upload image'}
          </Button>
          <p className="text-caption text-ink-soft">JPG, PNG or WebP. Resized and compressed before upload.</p>
        </div>
      </div>
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
    </div>
  );
}
