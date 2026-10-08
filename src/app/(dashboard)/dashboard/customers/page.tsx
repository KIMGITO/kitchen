import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pager, pageOf, range, PAGE_SIZE } from '@/components/ui/Pager';
import { formatMoney } from '@/lib/commerce/money';

export default async function Customers({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requirePermission('customers.view');
  const [tenant, { page: raw, q }] = await Promise.all([getTenant(), searchParams]);
  const page = pageOf(raw); const [from, to] = range(page);
  const supabase = await createClient();
  let query = supabase.from('kitchen_customers').select('id, full_name, phone, email, status, created_at').eq('tenant_id', tenant.id);
  if (q) query = query.ilike('full_name', `%${q.replace(/[%_]/g, '')}%`);
  const { data } = await query.order('created_at', { ascending: false }).range(from, to + 1);
  const rows = data ?? [];
  const ids = rows.slice(0, PAGE_SIZE).map((r: { id: string }) => r.id);
  const { data: stats } = ids.length ? await supabase.from('customer_stats').select('kitchen_customer_id, paid_orders, total_spent_minor, last_order_at').eq('tenant_id', tenant.id).in('kitchen_customer_id', ids) : { data: [] };
  const byId = new Map((stats ?? []).map((s: { kitchen_customer_id: string; paid_orders: number; total_spent_minor: number; last_order_at: string | null }) => [s.kitchen_customer_id, s]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-ink-muted">Customers</h1>
      <form className="flex max-w-sm gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search by name</label>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg></span>
          <input id="q" name="q" defaultValue={q} placeholder="Search by name" className="field-input h-11 w-full pl-10 pr-3 rounded-md border border-line bg-surface text-body text-ink-muted placeholder:text-ink-soft" />
        </div>
        <button className="inline-flex h-11 items-center rounded-pill bg-brand px-5 text-label text-brand-contrast hover:bg-brand/90 transition-colors shadow-sm">Search</button>
      </form>

      {rows.length === 0 ? <EmptyState title={q ? 'No matching customers' : 'No customers yet'} description="Customers appear here after they create an account on your storefront." /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full text-left text-body">
            <caption className="sr-only">Customers</caption>
            <thead className="border-b border-line text-label text-ink-soft">
              <tr>
                <th scope="col" className="p-3">Name</th>
                <th scope="col" className="p-3">Contact</th>
                <th scope="col" className="p-3">Orders</th>
                <th scope="col" className="p-3 text-right">Spent</th>
                <th scope="col" className="p-3">Last order</th>
                <th scope="col" className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((c: { id: string; full_name: string; phone: string | null; email: string | null; status: string }) => {
                const s = byId.get(c.id);
                return (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell"><Link href={`/dashboard/customers/${c.id}`} className="text-label underline text-ink-muted">{c.full_name}</Link></td>
                    <td className="table-cell text-ink-soft">{c.phone ?? c.email ?? '—'}</td>
                    <td className="table-cell">{s?.paid_orders ?? 0}</td>
                    <td className="table-cell table-cell--right">{formatMoney(s?.total_spent_minor ?? 0, tenant.currency)}</td>
                    <td className="table-cell text-ink-soft">{s?.last_order_at ? new Date(s.last_order_at).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : '—'}</td>
                    <td className="table-cell capitalize">{c.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath={`/dashboard/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`} />
    </div>
  );
}
