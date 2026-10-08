import { notFound, redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { getKitchenCustomer, getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh';
import { OrderTimeline } from '@/components/storefront/OrderTimeline';
import { OrderActions } from '@/components/checkout/OrderActions';
import { formatMoney } from '@/lib/commerce/money';
import type { OrderStatus } from '@/lib/commerce/order-state';

export const metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pay?: string }> }) {
  const [{ id }, { pay }, tenant] = await Promise.all([params, searchParams, getActiveTenant()]);
  if (!(await getUser())) redirect(`/login?next=/orders/${id}`);
  const customer = await getKitchenCustomer();
  if (!customer) notFound();

  const supabase = await createClient();
  // RLS limits this to the signed-in customer's own orders; the tenant filter keeps it scoped to this kitchen.
  const { data: order } = await supabase.from('orders')
    .select('id, order_number, status, fulfilment, total_minor, subtotal_minor, delivery_fee_minor, contact_phone, created_at, order_items(id, product_name, quantity, line_total_minor, order_item_options(option_name))')
    .eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!order) notFound();
  const status = order.status as OrderStatus;
  const { data: lastPay } = await supabase.from('payments').select('status, result_desc').eq('order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();

  return (
    <Section>
      <RealtimeRefresh table="orders" filter={`id=eq.${id}`} channel={`order:${id}`} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h1">Order #{order.order_number}</h1><StatusBadge status={status} />
        </div>
        {status === 'PAYMENT_FAILED' && lastPay?.result_desc ? <p className="text-body text-ink-soft">M-Pesa said: {lastPay.result_desc}</p> : null}
        <OrderActions orderId={id} status={status} defaultPhone={order.contact_phone}
          initialNotice={pay === 'retry' ? 'Your order is saved, but we could not send the M-Pesa prompt. Send it again below.' : undefined} />
        <OrderTimeline status={status} />
        {status === 'READY' ? <p role="status" className="rounded-lg bg-success/10 p-4 text-body">Your order is ready{order.fulfilment === 'pickup' ? ' for pickup.' : ' and will be on its way.'}</p> : null}
        <ul className="divide-y divide-line rounded-lg border border-line px-4">
          {(order.order_items as { id: string; product_name: string; quantity: number; line_total_minor: number; order_item_options: { option_name: string }[] }[]).map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3"><div><p>{i.quantity} × {i.product_name}</p>
              {i.order_item_options.length ? <p className="text-caption text-ink-soft">{i.order_item_options.map((o) => o.option_name).join(', ')}</p> : null}</div>
              <span>{formatMoney(i.line_total_minor, tenant.currency)}</span></li>))}
          <li className="flex justify-between py-3 text-price"><span>Total</span><span>{formatMoney(order.total_minor, tenant.currency)}</span></li>
        </ul>
      </div>
    </Section>
  );
}
