import { cn } from '../cn';
import { StatusBadge } from '../StatusBadge';
import type { OrderStatus } from '@/lib/commerce/order-state';

/** A generic pill/badge with a tone variant. */
export interface BadgeProps {
  tone?: 'ghost' | 'surface' | 'brand' | 'accent' | 'success' | 'danger' | 'promo';
  className?: string;
  children: React.ReactNode;
}

function toneClass(tone: BadgeProps['tone']): string {
  switch (tone) {
    case 'brand': return 'bg-brand/15 text-brand';
    case 'accent': return 'bg-accent/15 text-accent';
    case 'success': return 'bg-success/15 text-success';
    case 'danger': return 'bg-danger/15 text-danger';
    case 'promo': return 'bg-promo/15 text-promo';
    case 'surface':
    case undefined: return 'bg-surface text-ink-muted';
    case 'ghost':
    default: return 'border border-line/60 text-ink-muted';
  }
}

export function Badge({ tone = 'surface', className, children }: BadgeProps) {
  return <span className={cn('pill', toneClass(tone), className)}>{children}</span>;
}

/** Re-export for drop-in parity with the old helper. */
export { StatusBadge };
export type { OrderStatus };
