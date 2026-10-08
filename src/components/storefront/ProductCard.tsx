import Link from 'next/link';
import Image from 'next/image';
import { formatMoney } from '@/lib/commerce/money';
import { Card } from '@/components/ui/primitives/Card';
import { Badge, StatusBadge } from '@/components/ui/primitives/Badge';

export interface ProductCardData {
  slug: string; name: string; description: string | null; image_url: string | null;
  price_minor: number; prep_minutes: number | null; calories: number | null; is_available: boolean;
  category_name?: string | null;
}

/** Rating is intentionally absent: shown only once real review data exists. */
export function ProductCard({ product, currency }: { product: ProductCardData; currency: string }) {
  const meta = [product.prep_minutes ? `${product.prep_minutes} min` : null, product.calories ? `${product.calories} cal` : null]
    .filter(Boolean).join(' • ');
  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      <div className="relative aspect-[4/3] w-full bg-line/30">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} fill sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw" className="object-cover object-top" />
        ) : null}
        {!product.is_available ? (
          <Badge tone="surface" className="absolute left-3 top-3">Sold out</Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-h3 text-ink-muted">{product.name}</h3>
        {product.category_name ? <p className="text-caption text-ink-muted/60">{product.category_name}</p> : null}
        {meta ? <p className="text-caption text-ink-muted/60">{meta}</p> : null}
        <div className="mt-auto pt-3 flex items-center justify-between">
          <p className="text-price text-ink-muted">{formatMoney(product.price_minor, currency)}</p>
          {!product.is_available ? <Badge tone="surface">Sold out</Badge> : null}
        </div>
      </div>
    </Card>
  );
}
