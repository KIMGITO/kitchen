import Image from 'next/image';
import Link from 'next/link';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard, type ProductCardData } from '@/components/storefront/ProductCard';

export default async function StorefrontHome() {
  const tenant = await getActiveTenant();
  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('slug, name, image_url').eq('tenant_id', tenant.id).order('sort_order').limit(8),
    supabase.from('products').select('slug, name, description, image_url, price_minor, prep_minutes, calories, is_available')
      .eq('tenant_id', tenant.id).eq('is_available', true).order('sort_order').limit(6),
  ]);

  return (
    <>
      <Section tone="brand" className="relative overflow-hidden">
        {tenant.cover_url ? (
          <Image src={tenant.cover_url} alt="" fill priority sizes="100vw" className="object-cover object-top opacity-30" />
        ) : null}
        <div className="relative max-w-2xl px-4">
          <h1 className="text-display">{tenant.name}</h1>
          {tenant.description ? <p className="mt-4 max-w-xl text-body-lg opacity-90">{tenant.description}</p> : null}
          <Link href="/menu" className="mt-8 inline-flex h-12 items-center rounded-pill bg-accent px-8 text-body-lg font-semibold text-accent-contrast hover:bg-accent/90 transition-all shadow-sm">
            View menu
          </Link>
        </div>
      </Section>

      {categories && categories.length > 0 ? (
        <Section tone="tint">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-h2 text-ink-muted">Browse the menu</h2>
            <p className="text-body-lg text-ink-muted/70">Popular categories at {tenant.name}</p>
          </div>
          <ul className="mt-6 flex flex-wrap gap-3">
            {categories.map((c: { slug: string; name: string }) => (
              <li key={c.slug}>
                <Link href={`/menu#${c.slug}`} className="inline-flex h-11 items-center rounded-pill bg-surface border border-line/60 px-5 text-label shadow-sm hover:border-brand/40 hover:bg-brand/5 hover:text-ink-muted transition-all">{c.name}</Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section>
        <div className="flex items-center justify-between">
          <h2 className="text-h2 text-ink-muted">Popular right now</h2>
          <p className="text-body-lg text-ink-muted/70">What's selling well this week</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products && products.length > 0 ? (
            (products as ProductCardData[]).map((p) => <li key={p.slug}><ProductCard product={p} currency={tenant.currency} /></li>)
          ) : (
            <div className="mt-6"><EmptyState title="No menu items yet" description="This kitchen is still setting up its menu. Check back soon." /></div>
          )}
        </div>
      </Section>
    </>
  );
}
