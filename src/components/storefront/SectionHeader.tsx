import Link from 'next/link';
import { Icon } from '@/components/ui/primitives/Icon';

export function SectionHeader({ eyebrow, title, href, linkLabel }: { eyebrow?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="reveal flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="flex items-center gap-2 text-eyebrow uppercase text-ink-soft"><span aria-hidden className="h-1 w-6 rounded-full bg-accent" />{eyebrow}</p> : null}
        <h2 className="mt-1 text-h2 text-ink">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-label text-brand">
          <span className="group-hover:underline">{linkLabel ?? 'See all'}</span>
          <Icon name="arrow-right" size={16} className="transition-transform group-hover:translate-x-1" />
        </Link>
      ) : null}
    </div>
  );
}
