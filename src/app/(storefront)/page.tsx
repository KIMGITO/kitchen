import Link from 'next/link';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/primitives/Icon';
import { Hero } from '@/components/storefront/Hero';
import { TrustStrip } from '@/components/storefront/TrustStrip';
import { SectionHeader } from '@/components/storefront/SectionHeader';
import { CategoryTile } from '@/components/storefront/CategoryTile';
import { PromoCarousel, type PromoItem } from '@/components/storefront/PromoCarousel';
import { ProductCard, type ProductCardData } from '@/components/storefront/ProductCard';

type PromoRow = { id: string; title: string; subtitle: string | null; image_url: string | null; product_id: string | null; discount_percent: number | null; ends_at: string | null };

export default async function StorefrontHome() {
  const tenant = await getActiveTenant();
  const supabase = await createClient();
  const [{ data: categories }, { data: products }, { data: promoRows }] = await Promise.all([
    supabase.from('categories').select('slug, name, image_url').eq('tenant_id', tenant.id).order('sort_order').limit(12),
    supabase.from('products').select('slug, name, description, image_url, price_minor, prep_minutes, calories, is_available')
      .eq('tenant_id', tenant.id).eq('is_available', true).order('sort_order').limit(8),
    // RLS only returns promotions that are active, inside their dates, and allowed by the kitchen's plan.
    supabase.from('promotions').select('id, title, subtitle, image_url, product_id, discount_percent, ends_at')
      .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(6),
  ]);

  const promos = (promoRows ?? []) as PromoRow[];
  const productIds = promos.map((p) => p.product_id).filter((v): v is string => !!v);
  const { data: promoProducts } = productIds.length
    ? await supabase.from('products').select('id, slug').eq('tenant_id', tenant.id).in('id', productIds)
    : { data: [] as { id: string; slug: string }[] };
  const slugById = new Map((promoProducts ?? []).map((p: { id: string; slug: string }) => [p.id, p.slug]));
  const promoItems: PromoItem[] = promos.map((p) => ({
    id: p.id, title: p.title, subtitle: p.subtitle, image_url: p.image_url, discount_percent: p.discount_percent, ends_at: p.ends_at,
    href: p.product_id && slugById.get(p.product_id) ? `/item/${slugById.get(p.product_id)}` : '/menu',
  }));

  return (
    <>
      <Hero tenant={tenant} />
      <TrustStrip tenant={tenant} />

      {promoItems.length > 0 ? (
        <Section id="offers">
          <SectionHeader eyebrow="Special offers" title="Deals you'll love" href="/menu" linkLabel="Full menu" />
          <div className="mt-6"><PromoCarousel items={promoItems} /></div>
        </Section>
      ) : null}

      {categories && categories.length > 0 ? (
        <Section tone="tint">
          <SectionHeader eyebrow="Browse" title={`What's on at ${tenant.name}`} />
          <ul className="snap-row reveal mt-6 -mx-4 px-4 sm:mx-0 sm:px-0">
            {categories.map((c: { slug: string; name: string; image_url: string | null }) => (
              <li key={c.slug}><CategoryTile slug={c.slug} name={c.name} imageUrl={c.image_url} /></li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section>
        <SectionHeader eyebrow="Popular right now" title="Fresh from the kitchen" href="/menu" linkLabel="See the whole menu" />
        {products && products.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(products as ProductCardData[]).map((p) => <li key={p.slug} className="reveal"><ProductCard product={p} currency={tenant.currency} /></li>)}
          </ul>
        ) : (
          <div className="mt-6"><EmptyState title="No menu items yet" description="This kitchen is still setting up its menu. Check back soon." /></div>
        )}
      </Section>

      {products && products.length > 0 ? (
        <Section tone="brand" className="relative overflow-hidden">
          <div aria-hidden className="animate-blob absolute -right-16 -top-16 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="reveal relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div><h2 className="text-h1">Hungry? Your order is a few taps away.</h2><p className="mt-2 text-body-lg text-brand-contrast/90">Pay with M-Pesa and track it live.</p></div>
            <Link href="/menu" className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-pill bg-accent px-7 text-body-lg font-medium text-accent-contrast shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised active:scale-95">
              Order now <Icon name="arrow-right" size={20} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Section>
      ) : null}
    </>
  );
}
