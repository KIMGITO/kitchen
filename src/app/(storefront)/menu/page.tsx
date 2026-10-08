import type { Metadata } from 'next';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard, type ProductCardData } from '@/components/storefront/ProductCard';

export const metadata: Metadata = { title: 'Menu', alternates: { canonical: '/menu' } };

type Row = ProductCardData & { category_id: string | null };

export default async function MenuPage() {
  const tenant = await getActiveTenant();
  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('id, slug, name, description').eq('tenant_id', tenant.id).order('sort_order'),
    supabase.from('products')
      .select('category_id, slug, name, description, image_url, price_minor, prep_minutes, calories, is_available')
      .eq('tenant_id', tenant.id).order('sort_order').limit(500),
  ]);
  const rows = (products ?? []) as Row[];
  if (rows.length === 0) {
    return <Section><EmptyState title="No menu items yet" description="This kitchen hasn't published its menu." /></Section>;
  }
  const cats = (categories ?? []) as { id: string; slug: string; name: string; description: string | null }[];
  const uncategorised = rows.filter((r) => !r.category_id || !cats.some((c) => c.id === r.category_id));

  return (
    <Section>
      <h1 className="text-h1">Menu</h1>
      {cats.length > 1 ? (
        <nav aria-label="Menu categories" className="sticky top-16 z-20 -mx-4 mt-4 overflow-x-auto bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            {cats.map((c) => (<li key={c.id}><a href={`#${c.slug}`} className="inline-flex h-10 items-center whitespace-nowrap rounded-pill border border-line px-4 text-label hover:bg-surface-alt">{c.name}</a></li>))}
          </ul>
        </nav>
      ) : null}
      {[...cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, items: rows.filter((r) => r.category_id === c.id) })),
        { id: 'other', slug: 'other', name: 'More', items: uncategorised }]
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.id} id={g.slug} className="mt-10 scroll-mt-32" aria-labelledby={`h-${g.slug}`}>
            <h2 id={`h-${g.slug}`} className="text-h2">{g.name}</h2>
            <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((p) => (<li key={p.slug}><ProductCard product={p} currency={tenant.currency} /></li>))}
            </ul>
          </section>
        ))}
    </Section>
  );
}
