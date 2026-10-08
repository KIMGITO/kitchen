import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh';
import { OrderBoard, type BoardOrder } from '@/components/kitchen/OrderBoard';
import { formatMoney } from '@/lib/commerce/money';
import type { OrderStatus } from '@/lib/commerce/order-state';

const SELECT = 'id, order_number, status, fulfilment, total_minor, contact_name, contact_phone, customer_notes, created_at, order_items(id, product_name, quantity, notes, order_item_options(option_name))';

export default async function OrdersPage() {
  const { perms } = await requirePermission('orders.view');
  const tenant = await getTenant();
  const supabase = await createClient();
  const [{ data: live, error }, { data: recent }] = await Promise.all([
    supabase.from('orders').select(SELECT).eq('tenant_id', tenant.id).in('status', ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY']).order('created_at').limit(200),
    supabase.from('orders').select('id, order_number, status, total_minor, contact_name, created_at').eq('tenant_id', tenant.id)
      .in('status', ['COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED']).order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <RealtimeRefresh table="orders" filter={`tenant_id=eq.${tenant.id}`} channel={`kitchen-orders:${tenant.id}`} />
      <h1 className="text-h1 text-ink-muted">Orders</h1>
      {error ? <p role="alert" className="text-danger">Could not load orders. Refresh to try again.</p>
        : (live ?? []).length === 0 ? <EmptyState title="No live orders" description="Paid orders appear here the moment they arrive." />
        : <OrderBoard orders={(live ?? []) as unknown as BoardOrder[]} permissions={perms.toArray()} currency={tenant.currency} />}

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-h2 text-ink-muted">Recently finished</h2>
        {(recent ?? []).length === 0 ? <p className="text-body text-ink-muted/70">No finished orders yet.</p> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
            <table className="w-full text-left text-body">
              <caption className="sr-only">Recently finished orders</caption>
              <thead className="border-b border-line text-label text-ink-muted/70">
                <tr>
                  <th scope="col" className="p-3">Order</th>
                  <th scope="col" className="p-3">Customer</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(recent ?? []).map((o: { id: string; order_number: number; status: OrderStatus; total_minor: number; contact_name: string }) => (
                  <tr key={o.id} className="table-row">
                    <td className="table-cell">#{o.order_number}</td>
                    <td className="table-cell">{o.contact_name}</td>
                    <td className="table-cell"><StatusBadge status={o.status} /></td>
                    <td className="table-cell table-cell--right">{formatMoney(o.total_minor, tenant.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
