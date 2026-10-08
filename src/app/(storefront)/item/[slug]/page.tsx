import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { formatMoney } from '@/lib/commerce/money';
import { ProductConfigurator, type OptionGroup } from '@/components/storefront/ProductConfigurator';

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  const tenant = await getActiveTenant();
  const supabase = await createClient();
  const { data: product } = await supabase.from('products')
    .select('id, slug, name, description, image_url, price_minor, prep_minutes, calories, is_available')
    .eq('tenant_id', tenant.id).eq('slug', slug).maybeSingle();
  if (!product) notFound();
  const { data: groups } = await supabase.from('product_option_groups')
    .select('id, name, min_select, max_select, sort_order, product_options(id, name, price_delta_minor, is_available, sort_order)')
    .eq('tenant_id', tenant.id).eq('product_id', product.id).order('sort_order');
  const optionGroups: OptionGroup[] = (groups ?? []).map((g: any) => ({
    id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select,
    options: (g.product_options ?? []).filter((o: any) => o.is_available).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));
  return { tenant, product, optionGroups };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await load(slug);
  return { title: product.name, description: product.description ?? undefined, alternates: { canonical: `/item/${product.slug}` },
    openGraph: product.image_url ? { images: [product.image_url] } : undefined };
}

export default async function ItemPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { tenant, product, optionGroups } = await load(slug);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, description: product.description ?? undefined,
    image: product.image_url ?? undefined,
    offers: { '@type': 'Offer', priceCurrency: tenant.currency, price: (product.price_minor / 100).toFixed(2),
      availability: product.is_available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
  };
  return (
    <Section className="flex flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-surface">
          {product.image_url ? <Image src={product.image_url} alt={product.name} fill priority sizes="(min-width:768px) 50vw, 100vw" className="object-cover object-top" /> : null}
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="text-h1 text-ink-muted">{product.name}</h1>
          <p className="text-price text-ink-muted">{formatMoney(product.price_minor, tenant.currency)}</p>
          {product.description ? <p className="text-body-lg text-ink-muted/70">{product.description}</p> : null}
          <ProductConfigurator tenantId={tenant.id} currency={tenant.currency} groups={optionGroups}
            product={{ id: product.id, name: product.name, image_url: product.image_url, price_minor: product.price_minor, is_available: product.is_available }} />
        </div>
      </div>
    </Section>
  );
}
