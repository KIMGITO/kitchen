'use client';
import { useToastStore } from '@/stores/toast';
import { Icon } from './primitives/Icon';
import { cn } from './cn';

/** Live-region toasts. Sits above the mobile tab bar. Errors are announced assertively. */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn('pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-lg border-l-4 bg-ink p-3 pr-2 text-brand-contrast shadow-raised',
            t.tone === 'success' && 'border-accent', t.tone === 'error' && 'border-danger', t.tone === 'info' && 'border-brand-soft')}>
          <Icon name={t.tone === 'error' ? 'alert-triangle' : t.tone === 'success' ? 'check' : 'info-circle'} size={20} className={t.tone === 'success' ? 'mt-0.5 text-accent' : 'mt-0.5'} />
          <p className="flex-1 text-body">{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10"><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  );
}
