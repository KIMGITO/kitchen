'use client';
import { cn } from './cn';

/** Circular loader used inside buttons and inline status messages. Decorative — the parent button announces busy state. */
export function Spinner({ className }: { className?: string; label?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin',
        className,
      )}
    />
  );
}
