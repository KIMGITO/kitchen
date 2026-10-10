'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** Amber bar across the top while a link navigation is loading. Starts on link click, completes when the route changes. */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<'idle' | 'start' | 'run' | 'done'>('idle');
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // hash-only / same page
      setPhase('start');
      requestAnimationFrame(() => setPhase('run'));
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setPhase('idle'), 15000);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    setPhase((p) => (p === 'start' || p === 'run' ? 'done' : p));
    const t = setTimeout(() => setPhase((p) => (p === 'done' ? 'idle' : p)), 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  if (phase === 'idle') return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-1">
      <div className="h-full bg-accent shadow-[0_0_10px_rgb(var(--color-accent)/0.7)]"
        style={{
          width: phase === 'start' ? '0%' : phase === 'run' ? '85%' : '100%',
          opacity: phase === 'done' ? 0 : 1,
          transition: phase === 'run' ? 'width 8s cubic-bezier(0.08, 0.6, 0.2, 1)' : phase === 'done' ? 'width 0.2s ease-out, opacity 0.3s 0.15s' : 'none',
        }} />
    </div>
  );
}
