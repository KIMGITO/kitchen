'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { BUCKET_FOR_KIND, ImageError, MAX_INPUT_MB, checkInputFile, type ImageKind, type PreparedImage } from '@/lib/images/compress';
import { DEFAULT_ASPECTS, formatBytes, type Aspect } from '@/lib/images/crop-math';
import { Button } from './Button';
import { ImageEditor } from './ImageEditor';
import { Icon } from './primitives/Icon';
import { cn } from './cn';
import { toast } from '@/stores/toast';

interface Props {
  tenantId: string;
  kind: ImageKind;
  /** Sub-folder under {tenant_id}/, e.g. "products/<product_id>" */
  folder: string;
  label: string;
  currentUrl?: string | null;
  /** Override the crop shapes offered in the editor. */
  aspects?: Aspect[];
  onUploaded: (publicUrl: string, path: string) => void;
  onRemove?: () => void;
}

/**
 * The one image uploader for the whole app: pick or drop a photo, crop / zoom / rotate it, then it is resized,
 * converted to WebP, EXIF-stripped and capped at 2 MB (avatars 1 MB) before upload. Storage RLS re-checks tenant
 * and permission server-side.
 */
export function ImageUploader({ tenantId, kind, folder, label, currentUrl, aspects, onUploaded, onRemove }: Props) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'idle' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const aspect = (aspects ?? DEFAULT_ASPECTS[kind])[0]?.value ?? 1;
  const busy = step === 'uploading';

  function pick(f: File | undefined | null) {
    if (!f || busy) return;
    setError(null);
    try { checkInputFile(f); setFile(f); } catch (e) { setError(e instanceof ImageError ? e.message : 'Could not use that file.'); }
  }

  async function upload(img: PreparedImage) {
    setStep('uploading'); setError(null);
    try {
      const bucket = BUCKET_FOR_KIND[kind];
      const path = `${tenantId}/${folder}/${img.hash}.webp`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, img.blob, { contentType: img.mime, cacheControl: '31536000', upsert: false });
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
      toast.success(`Image uploaded (${formatBytes(img.bytes)}).`);
      setFile(null);
    } catch {
      setError('Upload failed. Check your connection and try again.');
      toast.error('Image upload failed.');
    } finally { setStep('idle'); }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-ink">{label}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        className={cn('flex flex-col gap-3 rounded-lg border-2 border-dashed p-3 transition-colors sm:flex-row sm:items-center sm:gap-4',
          over ? 'border-accent bg-accent-soft' : 'border-line bg-surface', busy && 'opacity-80')}
      >
        <button type="button" onClick={() => preview && setZoomOpen(true)} disabled={!preview} aria-label={preview ? 'View image full size' : undefined}
          style={{ aspectRatio: String(Math.min(2, Math.max(0.6, aspect))) }}
          className="group relative w-full max-w-44 shrink-0 overflow-hidden rounded-md bg-line/40 sm:w-36 enabled:cursor-zoom-in">
          {preview ? <Image src={preview} alt="" fill sizes="176px" className="object-cover transition-transform duration-300 group-hover:scale-105" />
            : <span className="absolute inset-0 grid place-items-center text-ink-soft"><Icon name="image" size={32} /></span>}
          {busy ? <span className="absolute inset-0 grid place-items-center bg-ink/40"><span className="size-7 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden /></span> : null}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" loading={busy} loadingText="Uploading…" autoLoading={false} onClick={() => document.getElementById(inputId)?.click()}>
              <Icon name="upload" size={16} />{preview ? 'Replace image' : 'Choose image'}
            </Button>
            {preview && onRemove ? <Button type="button" variant="ghost" size="sm" disabled={busy} autoLoading={false} onClick={() => { setPreview(null); onRemove(); }}><Icon name="trash" size={16} />Remove</Button> : null}
          </div>
          {busy ? (
            <div role="progressbar" aria-label="Uploading image" className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-line">
              <div className="h-full w-1/3 animate-[uploadSlide_1.1s_ease-in-out_infinite] rounded-full bg-accent" />
            </div>
          ) : null}
          <p className="text-caption text-ink-soft">Drop a photo here or choose one. You can crop, zoom and rotate it first. JPG, PNG or WebP up to {MAX_INPUT_MB} MB; the saved image is always 2 MB or less.</p>
        </div>
      </div>
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}

      {file ? <ImageEditor file={file} kind={kind} aspects={aspects} onCancel={() => !busy && setFile(null)} onConfirm={upload} /> : null}
      {zoomOpen && preview ? <Lightbox src={preview} onClose={() => setZoomOpen(false)} /> : null}
    </div>
  );
}

/** Full-size view; click the image to toggle 2x zoom (scroll to look around). */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label="Image preview" className="m-auto max-h-[92vh] w-[min(94vw,60rem)] rounded-xl border border-line bg-surface p-2 shadow-raised backdrop:bg-ink/70 backdrop:backdrop-blur-sm">
      <button type="button" onClick={onClose} aria-label="Close preview" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-surface/90 shadow-card hover:bg-accent-soft"><Icon name="x" size={18} /></button>
      <div className={cn('max-h-[86vh] overflow-auto rounded-md', zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" onClick={() => setZoomed((z) => !z)} className={cn('mx-auto block transition-[width] duration-300', zoomed ? 'w-[200%] max-w-none' : 'max-h-[84vh] w-auto max-w-full')} />
      </div>
    </dialog>
  );
}
