import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { getKitchenCustomer, getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pager, pageOf, range, PAGE_SIZE } from '@/components/ui/Pager';
import { formatMoney } from '@/lib/commerce/money';
import type { OrderStatus } from '@/lib/commerce/order-state';

export const metadata = { title: 'Your orders', robots: { index: false } };

export default async function OrderHistory({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [tenant, { page: rawPage }] = await Promise.all([getActiveTenant(), searchParams]);
  if (!(await getUser())) redirect('/login?next=/account/orders');
  const customer = await getKitchenCustomer();
  if (!customer) redirect('/register');
  const page = pageOf(rawPage); const [from, to] = range(page);
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('id, order_number, status, total_minor, created_at')
    .eq('tenant_id', tenant.id).eq('kitchen_customer_id', customer.id).order('created_at', { ascending: false }).range(from, to + 1);
  const rows = data ?? []; const hasMore = rows.length > PAGE_SIZE; const shown = rows.slice(0, PAGE_SIZE);

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-h1">Your orders</h1>
        <div className="mt-6">
          {shown.length === 0 ? <EmptyState title="No orders yet" description={`Your orders from ${tenant.name} will show up here.`}
            action={<Link href="/menu" className="inline-flex h-11 items-center rounded-pill bg-brand px-6 text-label text-brand-contrast">Browse menu</Link>} /> : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {shown.map((o: { id: string; order_number: number; status: OrderStatus; total_minor: number; created_at: string }) => (
                <li key={o.id}><Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-alt">
                  <span><span className="text-label">Order #{o.order_number}</span><br /><span className="text-caption text-ink-soft">{new Date(o.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</span></span>
                  <span className="flex items-center gap-3"><StatusBadge status={o.status} /><span className="text-price">{formatMoney(o.total_minor, tenant.currency)}</span></span>
                </Link></li>))}
            </ul>)}
          <Pager page={page} hasMore={hasMore} basePath="/account/orders" />
        </div>
      </div>
    </Section>
  );
}
