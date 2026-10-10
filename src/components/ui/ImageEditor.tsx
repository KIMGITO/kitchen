'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Icon } from './primitives/Icon';
import { cn } from './cn';
import { IMAGE_PRESETS, encodeCanvas, loadBitmap, type ImageKind, type PreparedImage, ImageError } from '@/lib/images/compress';
import { clampOffset, clampZoom, coverScale, formatBytes, outputSize, DEFAULT_ASPECTS, MAX_ZOOM, type Aspect } from '@/lib/images/crop-math';

interface Props {
  file: File; kind: ImageKind; aspects?: Aspect[];
  onCancel: () => void; onConfirm: (img: PreparedImage) => void | Promise<void>;
}

/** Crop / zoom / rotate dialog. Drag to move, wheel or pinch or slider to zoom, arrow keys + - r for keyboard. */
export function ImageEditor({ file, kind, aspects, onCancel, onConfirm }: Props) {
  const options = aspects ?? DEFAULT_ASPECTS[kind];
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspectIdx, setAspectIdx] = useState(0);
  const [st, setSt] = useState({ quarter: 0, zoom: 1, ox: 0, oy: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const aspect = options[aspectIdx]?.value ?? 1;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const distance = () => { const [a, b] = [...pointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let alive = true; let loaded: ImageBitmap | null = null;
    loadBitmap(file).then((b) => { if (alive) { loaded = b; setBmp(b); } else b.close(); })
      .catch((e) => setError(e instanceof ImageError ? e.message : 'This image could not be opened.'));
    return () => { alive = false; loaded?.close(); };
  }, [file]);

  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [aspect]);

  const apply = useCallback((next: Partial<typeof st>) => {
    if (!bmp || !size.w) return;
    setSt((cur) => { const m = { ...cur, ...next }; m.zoom = clampZoom(m.zoom); return { ...m, ...clampOffset(m, bmp.width, bmp.height, size.w, size.h) }; });
  }, [bmp, size.w, size.h]);

  // Re-clamp when the crop shape changes.
  useEffect(() => { apply({}); }, [aspect, size.w, size.h, apply]);

  const paint = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (!bmp) return;
    const k = W / size.w;
    const scale = coverScale(bmp.width, bmp.height, st.quarter, size.w, size.h) * st.zoom;
    ctx.fillStyle = '#E7E4D9'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + st.ox * k, H / 2 + st.oy * k);
    ctx.rotate((st.quarter * Math.PI) / 2);
    ctx.scale(scale * k, scale * k);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    ctx.restore();
  }, [bmp, st, size.w, size.h]);

  useEffect(() => {
    const c = canvas.current; if (!c || !size.w || !bmp) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d'); if (ctx) paint(ctx, c.width, c.height);
  }, [paint, size.w, size.h, bmp]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); apply({ zoom: st.zoom * Math.exp(-e.deltaY * 0.0015) }); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apply, st.zoom]);

  const onPointerDown = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 2) pinch.current = { d: distance() || 1, z: st.zoom }; };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      apply({ zoom: pinch.current.z * (distance() / pinch.current.d) });
    } else if (pointers.current.size === 1) apply({ ox: st.ox + (e.clientX - prev.x), oy: st.oy + (e.clientY - prev.y) });
  };
  const onPointerUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };
  const onKey = (e: React.KeyboardEvent) => {
    const step = 16;
    const map: Record<string, () => void> = {
      ArrowLeft: () => apply({ ox: st.ox + step }), ArrowRight: () => apply({ ox: st.ox - step }),
      ArrowUp: () => apply({ oy: st.oy + step }), ArrowDown: () => apply({ oy: st.oy - step }),
      '+': () => apply({ zoom: st.zoom + 0.15 }), '=': () => apply({ zoom: st.zoom + 0.15 }), '-': () => apply({ zoom: st.zoom - 0.15 }),
      r: () => apply({ quarter: (st.quarter + 1) % 4 }),
    };
    const act = map[e.key];
    if (act) { e.preventDefault(); act(); }
  };

  const out = bmp && size.w ? outputSize(IMAGE_PRESETS[kind].maxEdge, aspect, bmp.width, bmp.height, st, size.w, size.h) : null;

  async function confirm() {
    if (!bmp || !out) return;
    setBusy(true); setError(null);
    try {
      const c = document.createElement('canvas'); c.width = out.w; c.height = out.h;
      const ctx = c.getContext('2d'); if (!ctx) throw new ImageError('Your browser cannot process images.');
      paint(ctx, out.w, out.h);
      await onConfirm(await encodeCanvas(c, kind));
    } catch (e) { setError(e instanceof ImageError ? e.message : 'Could not process this image. Try again.'); setBusy(false); }
  }

  return (
    <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} onClose={() => { if (!busy) onCancel(); }}
      aria-labelledby="img-ed-title"
      className="m-auto w-[min(94vw,46rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-ink/60 backdrop:backdrop-blur-sm">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="img-ed-title" className="text-h2">Adjust photo</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-accent-soft"><Icon name="x" size={18} /></button>
        </div>

        {options.length > 1 ? (
          <div role="radiogroup" aria-label="Crop shape" className="flex flex-wrap gap-2">
            {options.map((o, i) => (
              <button key={o.label} type="button" role="radio" aria-checked={i === aspectIdx} onClick={() => setAspectIdx(i)}
                className={cn('h-9 rounded-pill border px-4 text-label transition-colors', i === aspectIdx ? 'border-accent bg-accent text-accent-contrast' : 'border-line hover:border-accent hover:bg-accent-soft')}>{o.label}</button>
            ))}
          </div>
        ) : null}

        <div className="grid place-items-center rounded-lg bg-ink/5 p-2">
          <div ref={frame} tabIndex={0} role="img" aria-label="Photo preview. Drag to move, scroll or pinch to zoom. Arrow keys move, plus and minus zoom, R rotates."
            onKeyDown={onKey} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            style={{ aspectRatio: String(aspect), width: `min(100%, calc(55vh * ${aspect}))` }}
            className="relative cursor-grab touch-none overflow-hidden rounded-md bg-line outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing">
            {!bmp && !error ? <div className="absolute inset-0 grid place-items-center"><span className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden /></div> : null}
            <canvas ref={canvas} className="absolute inset-0 size-full" />
            <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
              {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border border-white/50 [&:nth-child(3n)]:border-r-0 [&:nth-child(n+7)]:border-b-0" />)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" aria-label="Zoom out" onClick={() => apply({ zoom: st.zoom - 0.25 })} className="grid size-9 place-items-center rounded-full border border-line hover:border-accent hover:bg-accent-soft"><Icon name="zoom-out" size={18} /></button>
          <input type="range" aria-label="Zoom" min={1} max={MAX_ZOOM} step={0.01} value={st.zoom} onChange={(e) => apply({ zoom: Number(e.target.value) })} className="h-2 min-w-32 flex-1 accent-accent" />
          <button type="button" aria-label="Zoom in" onClick={() => apply({ zoom: st.zoom + 0.25 })} className="grid size-9 place-items-center rounded-full border border-line hover:border-accent hover:bg-accent-soft"><Icon name="zoom-in" size={18} /></button>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
          <button type="button" aria-label="Rotate left" onClick={() => apply({ quarter: (st.quarter + 3) % 4 })} className="grid size-9 place-items-center rounded-full border border-line hover:border-accent hover:bg-accent-soft"><Icon name="rotate-left" size={18} /></button>
          <button type="button" aria-label="Rotate right" onClick={() => apply({ quarter: (st.quarter + 1) % 4 })} className="grid size-9 place-items-center rounded-full border border-line hover:border-accent hover:bg-accent-soft"><Icon name="rotate-right" size={18} /></button>
          <button type="button" onClick={() => setSt({ quarter: 0, zoom: 1, ox: 0, oy: 0 })} className="text-label text-ink underline">Reset</button>
        </div>

        <p className="text-caption text-ink-soft" aria-live="polite">
          {out ? `Saved at ${out.w} × ${out.h}px` : 'Loading…'} · compressed to WebP · 2 MB maximum ({formatBytes(file.size)} original)
        </p>
        {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy} autoLoading={false}>Cancel</Button>
          <Button type="button" loading={busy} loadingText="Processing…" autoLoading={false} disabled={!bmp} onClick={confirm}><Icon name="check" size={16} />Use photo</Button>
        </div>
      </div>
    </dialog>
  );
}
