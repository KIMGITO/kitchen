import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Professional type scale — Inter (body/UI) + Plus Jakarta Sans (headings/prices).
 *
 * - Hero (H1): `font-heading text-5xl leading-[1.2]`
 * - Section (H2): `font-heading text-3xl leading-[1.3]`
 * - Dish card (H3): `font-heading text-xl leading-[1.4]`
 * - Body / description: `font-sans text-base leading-[1.5]`
 * - Price & action labels: `font-sans text-15px leading-[1.2]`
 * - Captions: `font-sans text-xs leading-[1.4]`
 *
 * These are fixed spec utilities (exact px via Tailwind scale) for marketing /
 * menu surfaces. The tenant theme scale (`text-h1`, `text-body`, `text-price` …)
 * stays responsive (mobile -> desktop) — see docs/typography-and-themes.md.
 */

type As = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';

interface TypeProps {
  as?: As;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Hero title — Plus Jakarta Sans 48px Bold, lh 1.2. */
export function HeroTitle({ as = 'h1', id, className, children }: TypeProps) {
  const Tag = as;
  return <Tag id={id} className={cn('font-heading text-5xl leading-[1.2] tracking-tight text-ink', className)}>{children}</Tag>;
}

/** Section title — Plus Jakarta Sans 32px SemiBold, lh 1.3. */
export function SectionTitle({ as = 'h2', id, className, children }: TypeProps) {
  const Tag = as;
  return <Tag id={id} className={cn('font-heading text-3xl leading-[1.3] tracking-tight text-ink', className)}>{children}</Tag>;
}

/** Dish card title — Plus Jakarta Sans 20px Medium, lh 1.4. */
export function DishTitle({ as = 'h3', id, className, children }: TypeProps) {
  const Tag = as;
  return <Tag id={id} className={cn('font-heading text-xl leading-[1.4] text-ink', className)}>{children}</Tag>;
}

/** Body / food description — Inter 16px Regular, lh 1.5. */
export function BodyText({ as = 'p', id, className, children }: TypeProps) {
  const Tag = as;
  return <Tag id={id} className={cn('font-sans text-base leading-[1.5] text-ink-soft', className)}>{children}</Tag>;
}

/** Price & action UI label — Inter 15px SemiBold, lh 1.2. */
export function PriceLabel({ as = 'span', id, className, children }: TypeProps) {
  const Tag = as;
  return <Tag id={id} className={cn('font-sans text-15px leading-[1.2] text-ink', className)}>{children}</Tag>;
}

/** Caption / small text — Inter 12px Regular, lh 1.4. */
export function Caption({ as = 'span', id, className, children }: TypeProps) {
  const Tag = as;
  return <Tag id={id} className={cn('font-sans text-xs leading-[1.4] text-ink-soft', className)}>{children}</Tag>;
}
