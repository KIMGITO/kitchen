'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/commerce/money';
import { friendlyError } from '@/lib/errors';
import { staffActions, type OrderStatus } from '@/lib/commerce/order-state';

export interface BoardOrder {
  id: string; order_number: number; status: OrderStatus; fulfilment: string; total_minor: number; contact_name: string;
  contact_phone: string; customer_notes: string | null; created_at: string;
  order_items: { id: string; product_name: string; quantity: number; notes: string | null; order_item_options: { option_name: string }[] }[];
}
const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'RECEIVED', title: 'New' }, { status: 'ACCEPTED', title: 'Accepted' }, { status: 'PREPARING', title: 'Preparing' }, { status: 'READY', title: 'Ready' },
];
const ACTION_LABEL: Partial<Record<OrderStatus, { label: string; variant: 'primary' | 'outline' | 'danger' }>> = {
  ACCEPTED: { label: 'Accept', variant: 'primary' }, REJECTED: { label: 'Decline', variant: 'outline' }, PREPARING: { label: 'Start preparing', variant: 'primary' },
  READY: { label: 'Mark ready', variant: 'primary' }, COMPLETED: { label: 'Complete', variant: 'primary' }, CANCELLED: { label: 'Cancel', variant: 'danger' },
};

export function OrderBoard({ orders, permissions, currency }: { orders: BoardOrder[]; permissions: string[]; currency: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const can = (p: string) => permissions.includes(p);

  async function move(order: BoardOrder, to: OrderStatus) {
    if ((to === 'CANCELLED' || to === 'REJECTED') && !confirm(`${to === 'REJECTED' ? 'Decline' : 'Cancel'} order #${order.order_number}? The customer will be notified and a refund will be arranged.`)) return;
    setBusyId(`${order.id}:${to}`); setError(null);
    const { error: err } = await createClient().rpc('transition_order', { p_order: order.id, p_to: to });
    if (err) { setBusyId(null); setError(friendlyError(err.message)); return; }
    // Stay busy until the server has re-rendered, so there is no dead moment after the click.
    startTransition(() => { router.refresh(); setBusyId(null); });
  }

  return (
    <div>
      {error ? <p role="alert" className="mb-4 rounded-md bg-danger/10 p-3 text-danger">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`} className="flex flex-col gap-3">
              <h2 id={`col-${col.status}`} className="text-h3">{col.title} <span className="text-ink-soft">({list.length})</span></h2>
              {list.length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-caption text-ink-soft">Nothing here.</p> : null}
              {list.map((o) => (
                <article key={o.id} className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card">
                  <header className="flex items-start justify-between gap-2">
                    <div><p className="text-h3">#{o.order_number}</p><p className="text-caption text-ink-soft">{o.contact_name} • <a href={`tel:${o.contact_phone}`} className="underline">{o.contact_phone}</a></p></div>
                    <div className="text-right"><p className="text-price">{formatMoney(o.total_minor, currency)}</p>
                      <p className="text-caption capitalize text-ink-soft">{o.fulfilment} • {new Date(o.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p></div>
                  </header>
                  <ul className="flex flex-col gap-1 text-body">
                    {o.order_items.map((i) => (<li key={i.id}><strong>{i.quantity}×</strong> {i.product_name}
                      {i.order_item_options.length ? <span className="text-caption text-ink-soft"> ({i.order_item_options.map((x) => x.option_name).join(', ')})</span> : null}
                      {i.notes ? <span className="block text-caption text-ink-soft">Note: {i.notes}</span> : null}</li>))}
                  </ul>
                  {o.customer_notes ? <p className="rounded-md bg-tint-alt border border-line p-2 text-caption">Customer note: {o.customer_notes}</p> : null}
                  <footer className="flex flex-wrap gap-2">
                    {staffActions(o.status, can as never).map((to) => (
                      <Button key={to} type="button" size="sm" variant={ACTION_LABEL[to]?.variant ?? 'outline'} loading={busyId === `${o.id}:${to}`} loadingText="Working…" autoLoading={false} onClick={() => move(o, to)}>{ACTION_LABEL[to]?.label ?? to}</Button>))}
                  </footer>
                </article>))}
            </section>);
        })}
      </div>
    </div>
  );
}
