import Link from 'next/link';
import Image from 'next/image';
import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Pager, pageOf, range, PAGE_SIZE } from '@/components/ui/Pager';
import { formatMoney } from '@/lib/commerce/money';
import { deleteProduct, setAvailability } from '@/lib/actions/menu';

export default async function MenuManager({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { perms } = await requirePermission('menu.view');
  const [tenant, { page: raw }] = await Promise.all([getTenant(), searchParams]);
  const page = pageOf(raw); const [from, to] = range(page);
  const supabase = await createClient();
  const { data } = await supabase.from('products').select('id, name, price_minor, is_available, image_url, categories(name)')
    .eq('tenant_id', tenant.id).is('deleted_at', null).order('created_at', { ascending: false }).range(from, to + 1);
  const rows = (data ?? []) as unknown as { id: string; name: string; price_minor: number; is_available: boolean; image_url: string | null; categories: { name: string } | null }[];
  const canManage = perms.can('menu.manage');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-ink-muted">Menu</h1>
        {canManage ? <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/menu/categories" className="inline-flex h-11 items-center rounded-pill border border-line/60 bg-surface px-5 text-label text-ink-muted hover:border-brand/40 hover:text-ink transition-colors">Categories</Link>
          <Link href="/dashboard/menu/new" className="inline-flex h-11 items-center rounded-pill bg-brand px-5 text-label text-brand-contrast hover:bg-brand/90 transition-colors shadow-sm">Add item</Link>
        </div> : null}
      </div>

      {rows.length === 0 ? <EmptyState title="No menu items yet" description="Add your first item so customers can order."
        action={canManage ? <Link href="/dashboard/menu/new" className="inline-flex h-11 items-center rounded-pill bg-brand px-6 text-label text-brand-contrast transition-colors hover:bg-brand/90">Add item</Link> : undefined} /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full text-left text-body">
            <caption className="sr-only">Menu items</caption>
            <thead className="border-b border-line text-label text-ink-soft">
              <tr>
                <th scope="col" className="p-3">Item</th>
                <th scope="col" className="p-3">Category</th>
                <th scope="col" className="p-3">Price</th>
                <th scope="col" className="p-3">Availability</th>
                <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-surface">
                        {p.image_url ? <Image src={p.image_url} alt="" fill sizes="48px" className="object-cover object-top" /> : null}
                      </div>
                      <Link href={`/dashboard/menu/${p.id}`} className="text-label underline text-ink-muted">{p.name}</Link>
                    </div>
                  </td>
                  <td className="table-cell text-ink-soft">{p.categories?.name ?? '—'}</td>
                  <td className="table-cell">{formatMoney(p.price_minor, tenant.currency)}</td>
                  <td className="table-cell">{canManage ? (
                    <form action={setAvailability}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="available" value={String(!p.is_available)} />
                      <Button type="submit" size="sm" variant={p.is_available ? 'outline' : 'primary'}>{p.is_available ? 'Mark sold out' : 'Back in stock'}</Button>
                    </form>
                  ) : (p.is_available ? 'Available' : 'Sold out')}</td>
                  <td className="table-cell">{canManage ? (
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" size="sm" variant="ghost">Delete</Button>
                    </form>
                  ) : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/dashboard/menu" />
    </div>
  );
}
