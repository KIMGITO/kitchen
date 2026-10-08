import Image from 'next/image';
import Link from 'next/link';
import { BLUR_DATA_URL } from '@/lib/images/blur';
import { Icon } from '@/components/ui/primitives/Icon';

export interface PromoItem {
  id: string; title: string; subtitle: string | null; image_url: string | null;
  discount_percent: number | null; ends_at: string | null; href: string;
}

function endsLabel(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'Ends today';
  return days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`;
}

/**
 * Swipeable "image ads". The photo is drawn twice: heavily blurred as the card background, and sharp on the right,
 * fading into the blur so any photo shape looks intentional.
 */
export function PromoCarousel({ items }: { items: PromoItem[] }) {
  return (
    <ul className="snap-row -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Current offers">
      {items.map((p) => {
        const ends = endsLabel(p.ends_at);
        return (
          <li key={p.id} className="reveal w-[88%] sm:w-[26rem] lg:w-[31rem]">
            <Link href={p.href} className="group relative isolate flex aspect-[16/9] min-h-[11.5rem] overflow-hidden rounded-xl bg-brand text-brand-contrast shadow-card ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:shadow-raised">
              {p.image_url ? (
                <>
                  <Image src={p.image_url} alt="" fill sizes="32rem" quality={20} aria-hidden className="-z-20 scale-125 object-cover blur-2xl saturate-150" />
                  <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-brand via-brand/85 to-brand/10" />
                  <div aria-hidden className="absolute inset-y-0 right-0 -z-10 w-3/5 [mask-image:linear-gradient(to_right,transparent,black_40%)]">
                    <Image src={p.image_url} alt="" fill sizes="20rem" placeholder="blur" blurDataURL={BLUR_DATA_URL} className="object-cover transition-transform duration-700 group-hover:scale-110" />
                  </div>
                </>
              ) : (
                <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-brand to-brand/80">
                  <div className="animate-blob absolute -right-10 -top-10 size-56 rounded-full bg-accent/30 blur-3xl" />
                </div>
              )}
              <div className="relative flex max-w-[62%] flex-col justify-center gap-2 p-5">
                {p.discount_percent ? <span className="animate-pop inline-flex w-fit rounded-pill bg-accent px-3 py-1 text-label font-semibold text-accent-contrast">{p.discount_percent}% off</span> : null}
                <h3 className="text-h2 leading-tight">{p.title}</h3>
                {p.subtitle ? <p className="line-clamp-2 text-caption text-brand-contrast/90">{p.subtitle}</p> : null}
                {ends ? <p className="inline-flex items-center gap-1 text-caption text-brand-contrast/80"><Icon name="clock" size={14} />{ends}</p> : null}
                <span className="mt-1 inline-flex items-center gap-1 text-label">Order now <Icon name="arrow-right" size={16} className="transition-transform group-hover:translate-x-1" /></span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
