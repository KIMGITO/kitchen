import Link from 'next/link';
import Image from 'next/image';
import { formatMoney } from '@/lib/commerce/money';
import { cn } from '@/components/ui/cn';
import { BLUR_DATA_URL } from '@/lib/images/blur';
import { Card } from '@/components/ui/primitives/Card';
import { Badge } from '@/components/ui/primitives/Badge';
import { Icon } from '@/components/ui/primitives/Icon';

export interface ProductCardData {
  slug: string; name: string; description: string | null; image_url: string | null;
  price_minor: number; prep_minutes: number | null; calories: number | null; is_available: boolean;
  category_name?: string | null;
}

/** Whole card is one link to the item. The amber "+" is the Add affordance (amber is reserved for purchase actions). */
export function ProductCard({ product, currency }: { product: ProductCardData; currency: string }) {
  const meta = [product.prep_minutes ? `${product.prep_minutes} min` : null, product.calories ? `${product.calories} cal` : null].filter(Boolean).join(' • ');
  return (
    <Link href={`/item/${product.slug}`} className="group block h-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <Card className="flex h-full flex-col overflow-hidden transition duration-300 group-hover:-translate-y-1 group-hover:shadow-raised">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-line/30">
          {product.image_url ? (
            <Image src={product.image_url} alt={product.name} fill sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
              placeholder="blur" blurDataURL={BLUR_DATA_URL}
              className={cn('object-cover transition-transform duration-700 group-hover:scale-110', !product.is_available && 'grayscale')} />
          ) : (
            <span className="grid size-full place-items-center text-ink-soft"><Icon name="menu-book" size={36} /></span>
          )}
          <span className="absolute bottom-3 left-3 rounded-pill bg-surface/90 px-3 py-1 text-price text-ink shadow-card backdrop-blur">{formatMoney(product.price_minor, currency)}</span>
          {product.is_available ? (
            <span aria-hidden className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-accent text-accent-contrast shadow-card transition duration-300 group-hover:rotate-90 group-hover:scale-110">
              <Icon name="plus" size={20} />
            </span>
          ) : <Badge tone="surface" className="absolute right-3 top-3">Sold out</Badge>}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="text-h3 text-ink">{product.name}</h3>
          {product.description ? <p className="line-clamp-2 text-caption text-ink-soft">{product.description}</p> : null}
          {meta ? <p className="mt-auto pt-2 text-caption text-ink-soft">{meta}</p> : null}
        </div>
      </Card>
    </Link>
  );
}
