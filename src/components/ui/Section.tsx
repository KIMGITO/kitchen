import type { ReactNode } from 'react';
import { cn } from './cn';

export function Section({ tone = 'plain', className, children, ...rest }:
  { tone?: 'plain' | 'alt' | 'tint' | 'brand'; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const tones = {
    plain: 'bg-surface-alt text-ink-muted',
    alt: 'bg-surface text-ink-muted',
    tint: 'bg-tint text-ink-muted',
    brand: 'bg-brand text-brand-contrast',
  } as const;
  return (
    <section className={cn(tones[tone], className)} {...rest}>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 md:py-16">{children}</div>
    </section>
  );
}
