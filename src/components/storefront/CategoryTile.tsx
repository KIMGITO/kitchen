import Image from 'next/image';
import Link from 'next/link';
import { BLUR_DATA_URL } from '@/lib/images/blur';

export function CategoryTile({ slug, name, imageUrl }: { slug: string; name: string; imageUrl: string | null }) {
  return (
    <Link href={`/menu#${slug}`} className="group flex w-24 flex-col items-center gap-2 text-center sm:w-28">
      <span className="relative size-20 overflow-hidden rounded-full bg-line/40 ring-2 ring-line transition duration-300 group-hover:scale-105 group-hover:ring-brand sm:size-24">
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill sizes="96px" placeholder="blur" blurDataURL={BLUR_DATA_URL} className="object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <span className="grid size-full place-items-center bg-brand-soft font-display text-h2 text-brand">{name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="text-label text-ink">{name}</span>
    </Link>
  );
}
