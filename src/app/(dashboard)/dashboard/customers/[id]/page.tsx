import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMoney } from '@/lib/commerce/money';
import { deleteAddress } from '@/lib/actions/account';
import { saveCustomerNotes, setCustomerStatus } from '@/lib/actions/kitchen';
import type { OrderStatus } from '@/lib/commerce/order-state';

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { perms } = await requirePermission('customers.view');
  const [{ id }, tenant] = await Promise.all([params, getTenant()]);
  const supabase = await createClient();
  const { data: c } = await supabase.from('kitchen_customers').select('id, full_name, phone, email, status, created_at').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!c) notFound();
  const [{ data: orders }, { data: addresses }, { data: notes }, { data: stat }] = await Promise.all([
    supabase.from('orders').select('id, order_number, status, total_minor, created_at').eq('tenant_id', tenant.id).eq('kitchen_customer_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('customer_addresses').select('id, label, address_line, area').eq('tenant_id', tenant.id).eq('kitchen_customer_id', id).is('deleted_at', null),
    supabase.rpc('customer_staff_notes', { p_customer: id }),
    supabase.from('customer_stats').select('paid_orders, total_spent_minor').eq('tenant_id', tenant.id).eq('kitchen_customer_id', id).maybeSingle(),
  ]);
  const manage = perms.can('customers.manage');

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-h1 text-ink-muted">{c.full_name}</h1>
        <p className="text-body text-ink-soft">{[c.phone, c.email].filter(Boolean).join(' • ')} • Customer since {new Date(c.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</p>
        <p className="mt-1 text-body">{stat?.paid_orders ?? 0} paid orders • {formatMoney(stat?.total_spent_minor ?? 0, tenant.currency)} spent</p>
      </div>

      {manage ? (
        <form action={setCustomerStatus} className="flex items-center gap-3">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value={c.status === 'active' ? 'blocked' : 'active'} />
          <div className="flex items-center gap-3">
            <span className="text-body text-ink-muted">Account is <strong>{c.status}</strong>.</span>
            <Button type="submit" size="sm" variant="outline">{c.status === 'active' ? 'Block customer' : 'Unblock customer'}</Button>
          </div>
        </form>
      ) : null}

      {manage ? (
        <section aria-labelledby="n-h">
          <h2 id="n-h" className="mb-2 text-h2 text-ink-muted">Private notes</h2>
          <ActionForm action={saveCustomerNotes} submitLabel="Save notes">
            <input type="hidden" name="id" value={c.id} />
            <textarea name="notes" rows={3} defaultValue={(notes as string | null) ?? ''} aria-label="Private notes" className="field-input rounded-md border border-line bg-surface px-3.5 py-3 text-body text-ink-muted resize-y" />
          </ActionForm>
        </section>
      ) : null}

      <section aria-labelledby="a-h">
        <h2 id="a-h" className="mb-2 text-h2 text-ink-muted">Addresses</h2>
        {(addresses ?? []).length === 0 ? <p className="text-body text-ink-soft">No saved addresses.</p> : (
          <ul className="divide-y divide-line">
            {(addresses ?? []).map((a: { id: string; label: string | null; address_line: string; area: string | null }) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  {a.label ? <strong className="text-label text-ink-muted">{a.label}: </strong> : null}
                  <span className="text-body text-ink-muted">{a.address_line}</span>
                  {a.area ? <span className="text-caption text-ink-soft">, {a.area}</span> : null}
                </div>
                <form action={deleteAddress}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button type="submit" size="sm" variant="ghost">Remove</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="o-h">
        <h2 id="o-h" className="mb-2 text-h2 text-ink-muted">Orders</h2>
        {(orders ?? []).length === 0 ? <p className="text-body text-ink-soft">No orders yet.</p> : (
          <ul className="divide-y divide-line">
            {(orders ?? []).map((o: { id: string; order_number: number; status: OrderStatus; total_minor: number; created_at: string }) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <span className="text-label text-ink-muted">#{o.order_number}</span>
                  <span className="text-caption text-ink-soft">{new Date(o.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</span>
                </div>
                <span className="flex items-center gap-3">
                  <StatusBadge status={o.status} />
                  <span className="text-price">{formatMoney(o.total_minor, tenant.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
