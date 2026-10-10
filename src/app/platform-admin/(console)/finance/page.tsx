import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMoney } from '@/lib/commerce/money';
import { cancelPayout, completePayout, failPayoutManual, refundOrder, refundViaMpesa, resolvePaymentRefund, reviewPayoutAccount, sendPayoutB2C, setCommission, setPaymentReceipt } from '@/lib/actions/admin';
import type { OrderStatus } from '@/lib/commerce/order-state';

const m = (n: number) => formatMoney(n);
type Named<T> = T & { tenants: { name: string } | null };
const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

export default async function Finance() {
  const role = await requirePlatform(); const write = role !== 'support';
  const supabase = await createClient();
  const [{ data: rules }, { data: balances }, { data: payouts }, { data: refundOrders }, { data: refundPays }, { data: refunds }, { data: receipts }, { data: accounts }, { data: payments }, { count: failedDeliveries }] = await Promise.all([
    supabase.from('commission_rules').select('id, enabled, percent_bps, fixed_minor').eq('scope', 'platform').order('effective_from', { ascending: false }).limit(1),
    supabase.from('kitchen_balances').select('tenant_id, gross_sales_minor, commission_minor, outstanding_minor').order('outstanding_minor', { ascending: false }).limit(50),
    supabase.from('payouts').select('id, amount_minor, status, method, created_at, sent_at, note, failure_reason, destination_msisdn, tenants(name)').in('status', ['pending', 'processing', 'failed']).order('created_at', { ascending: false }).limit(40),
    supabase.from('orders').select('id, order_number, total_minor, status, tenants(name)').in('status', ['CANCELLED', 'REJECTED']).not('paid_at', 'is', null).order('created_at', { ascending: false }).limit(25),
    supabase.from('payments').select('id, amount_minor, msisdn, provider_receipt, result_desc, tenants(name)').eq('needs_refund', true).order('created_at').limit(25),
    supabase.from('refunds').select('id, status, method, amount_minor, failure_reason, created_at, order_id, tenants(name)').in('status', ['processing', 'failed']).order('created_at', { ascending: false }).limit(20),
    supabase.from('payments').select('id, amount_minor, msisdn, completed_at, tenants(name)').eq('receipt_pending', true).order('completed_at').limit(25),
    supabase.from('payout_accounts').select('id, msisdn, account_name, created_at, tenants(name)').eq('status', 'pending_review').order('created_at'),
    supabase.from('payments').select('id, status, amount_minor, provider_receipt, created_at, tenants(name)').order('created_at', { ascending: false }).limit(20),
    supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  const ids = (balances ?? []).map((b: { tenant_id: string }) => b.tenant_id);
  const { data: names } = ids.length ? await supabase.from('tenants').select('id, name').in('id', ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n: { id: string; name: string }) => [n.id, n.name]));
  const cur = rules?.[0];
  const hasRefundWork = (refundOrders ?? []).length + (refundPays ?? []).length > 0;

  return (
    <div className="flex max-w-5xl flex-col gap-12">
      <h1 className="text-h1">Finance</h1>
      {(failedDeliveries ?? 0) > 0 ? <p role="status" className="rounded-md bg-accent-soft border border-accent/50 p-3 text-body">{failedDeliveries} email/SMS notifications failed to send. Check your email and SMS provider settings.</p> : null}

      <section aria-labelledby="c-h" className="flex flex-col gap-3"><h2 id="c-h" className="text-h2">Platform commission</h2>
        <p className="text-body">Currently: <strong>{cur?.enabled ? `${cur.percent_bps / 100}% + ${m(cur.fixed_minor)} per order` : 'OFF'}</strong>. Kitchen overrides and plan rules take priority.</p>
        {write ? <ActionForm action={setCommission} submitLabel="Save commission" className="grid items-end gap-3 sm:grid-cols-[6rem_8rem_auto_auto]"><input type="hidden" name="scope" value="platform" />
          <Input label="Percent" name="percent" inputMode="decimal" defaultValue={String((cur?.percent_bps ?? 1000) / 100)} /><Input label="Fixed (KSh)" name="fixed" inputMode="numeric" defaultValue={String((cur?.fixed_minor ?? 0) / 100)} />
          <label className="flex h-11 items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={cur?.enabled ?? true} className="size-4 accent-brand" />Commission on</label></ActionForm> : null}
        <p className="text-caption text-ink-soft">Applies to orders paid from now on. Past orders keep the commission they were charged.</p></section>

      {(accounts ?? []).length > 0 ? (
        <section aria-labelledby="pa-h" className="flex flex-col gap-3"><h2 id="pa-h" className="text-h2">Payout numbers to review</h2>
          <p className="text-body text-ink-soft">Check with the kitchen owner that the number and name are theirs before approving.</p>
          {((accounts ?? []) as unknown as Named<{ id: string; msisdn: string; account_name: string; created_at: string }>[]).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"><span><strong>{a.tenants?.name}</strong> • {a.msisdn} • {a.account_name} <span className="text-caption text-ink-soft">requested {when(a.created_at)}</span></span>
              {write ? <div className="flex gap-2"><form action={reviewPayoutAccount}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="approve" value="true" /><Button type="submit" size="sm">Approve</Button></form>
                <form action={reviewPayoutAccount}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="approve" value="false" /><Button type="submit" size="sm" variant="outline">Reject</Button></form></div> : null}</div>))}</section>) : null}

      <section aria-labelledby="p-h" className="flex flex-col gap-3"><h2 id="p-h" className="text-h2">Payouts in progress</h2>
        {(payouts ?? []).length === 0 ? <p className="text-body text-ink-soft">Nothing pending. Create a payout from a kitchen&apos;s page.</p> : null}
        {((payouts ?? []) as unknown as Named<{ id: string; amount_minor: number; status: string; method: string; created_at: string; sent_at: string | null; note: string | null; failure_reason: string | null; destination_msisdn: string | null }>[]).map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <p><strong>{p.tenants?.name}</strong> • {m(p.amount_minor)} • {p.method === 'mpesa_b2c' ? 'M-Pesa B2C' : p.method} • <span className="capitalize">{p.status}</span>{p.note ? <span className="text-caption text-ink-soft"> • {p.note}</span> : null}</p>
            {p.status === 'failed' ? <p className="text-caption text-danger">Failed: {p.failure_reason ?? 'unknown reason'}. The balance is available again; create a new payout.</p> : null}
            {p.status === 'processing' ? <p className="text-caption text-ink-soft">Sent to ****{p.destination_msisdn?.slice(-4)} {p.sent_at ? when(p.sent_at) : ''}. It completes when Safaricom confirms. If it stays here for over an hour, check your M-Pesa statement: enter the receipt below if it was paid, or mark it failed if not.</p> : null}
            {write && p.status === 'pending' && p.method === 'mpesa_b2c' ? (
              <div className="flex flex-wrap items-center gap-2"><ActionForm action={sendPayoutB2C} submitLabel="Send via M-Pesa" className="flex items-center gap-2"><input type="hidden" name="id" value={p.id} /></ActionForm>
                <form action={cancelPayout}><input type="hidden" name="id" value={p.id} /><Button type="submit" variant="ghost" size="sm">Cancel</Button></form></div>) : null}
            {write && (p.status === 'pending' && p.method !== 'mpesa_b2c' || p.status === 'processing') ? (
              <div className="flex flex-wrap items-end gap-3"><ActionForm action={completePayout} submitLabel="Mark completed" className="flex items-end gap-2"><input type="hidden" name="id" value={p.id} /><Input label="Reference" name="reference" required minLength={3} placeholder="M-Pesa code" /></ActionForm>
                {p.status === 'processing' ? <ActionForm action={failPayoutManual} submitLabel="Mark failed" variant="outline" className="flex items-end gap-2"><input type="hidden" name="id" value={p.id} /><Input label="Reason" name="reason" /></ActionForm>
                  : <form action={cancelPayout}><input type="hidden" name="id" value={p.id} /><Button type="submit" variant="ghost" size="sm">Cancel</Button></form>}</div>) : null}
          </div>))}</section>

      <section aria-labelledby="r-h" className="flex flex-col gap-3"><h2 id="r-h" className="text-h2">Refunds</h2>
        <p className="text-body text-ink-soft">&ldquo;Refund via M-Pesa&rdquo; reverses the customer&apos;s payment through Daraja and finishes the order automatically when Safaricom confirms. If a reversal is rejected, record a manual refund instead.</p>
        {!hasRefundWork && (refunds ?? []).length === 0 ? <p className="text-body text-ink-soft">Nothing to refund.</p> : null}
        {((refunds ?? []) as unknown as Named<{ id: string; status: string; method: string; amount_minor: number; failure_reason: string | null; created_at: string }>[]).map((r) => (
          <p key={r.id} className={`rounded-lg border p-3 text-body ${r.status === 'failed' ? 'border-danger/30' : 'border-line'}`}>{r.tenants?.name} • {m(r.amount_minor)} • reversal <strong>{r.status}</strong> {r.failure_reason ? `(${r.failure_reason})` : ''} <span className="text-caption text-ink-soft">{when(r.created_at)}</span></p>))}
        {((refundOrders ?? []) as unknown as Named<{ id: string; order_number: number; total_minor: number; status: OrderStatus }>[]).map((o) => (
          <div key={o.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"><p>{o.tenants?.name} • order #{o.order_number} • {m(o.total_minor)} <StatusBadge status={o.status} /></p>
            {write ? <div className="flex flex-wrap items-end gap-3"><ActionForm action={refundViaMpesa} submitLabel="Refund via M-Pesa" className="flex items-end gap-2"><input type="hidden" name="order" value={o.id} /></ActionForm>
              <ActionForm action={refundOrder} submitLabel="Record manual refund" variant="outline" className="flex items-end gap-2"><input type="hidden" name="id" value={o.id} /><Input label="Reference" name="reference" required minLength={3} /></ActionForm></div> : null}</div>))}
        {((refundPays ?? []) as unknown as Named<{ id: string; amount_minor: number; msisdn: string; provider_receipt: string | null; result_desc: string | null }>[]).map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface p-4"><p>{p.tenants?.name} • {m(p.amount_minor)} from {p.msisdn} • receipt {p.provider_receipt ?? 'n/a'} <span className="text-caption text-danger">{p.result_desc === 'amount_mismatch' ? 'Amount did not match' : 'Paid after the order closed'}</span></p>
            {write ? <div className="flex flex-wrap items-end gap-3">{p.provider_receipt ? <ActionForm action={refundViaMpesa} submitLabel="Refund via M-Pesa" className="flex items-end gap-2"><input type="hidden" name="payment" value={p.id} /></ActionForm> : null}
              <ActionForm action={resolvePaymentRefund} submitLabel="Record manual refund" variant="outline" className="flex items-end gap-2"><input type="hidden" name="id" value={p.id} /><Input label="Reference" name="reference" required minLength={3} /></ActionForm></div> : null}</div>))}</section>

      {(receipts ?? []).length > 0 ? (
        <section aria-labelledby="rc-h" className="flex flex-col gap-3"><h2 id="rc-h" className="text-h2">Payments missing a receipt</h2>
          <p className="text-body text-ink-soft">These were confirmed by asking Daraja because the callback never arrived. The order was processed. A late callback fills the receipt in automatically; otherwise copy it from your M-Pesa statement (needed for reversals).</p>
          {((receipts ?? []) as unknown as Named<{ id: string; amount_minor: number; msisdn: string; completed_at: string }>[]).map((p) => (
            <div key={p.id} className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-surface p-4"><span>{p.tenants?.name} • {m(p.amount_minor)} from {p.msisdn} • {when(p.completed_at)}</span>
              {write ? <ActionForm action={setPaymentReceipt} submitLabel="Save receipt" className="flex items-end gap-2"><input type="hidden" name="id" value={p.id} /><Input label="M-Pesa receipt" name="receipt" required minLength={8} /></ActionForm> : null}</div>))}</section>) : null}

      <section aria-labelledby="b-h"><h2 id="b-h" className="mb-3 text-h2">Kitchen balances</h2>
        {(balances ?? []).length === 0 ? <p className="text-body text-ink-soft">No sales yet.</p> : (
          <div className="overflow-x-auto rounded-lg bg-surface shadow-card"><table className="w-full text-left"><caption className="sr-only">Kitchen balances</caption>
            <thead className="border-b border-line text-label text-ink-soft"><tr><th scope="col" className="p-3">Kitchen</th><th scope="col" className="p-3 text-right">Gross sales</th><th scope="col" className="p-3 text-right">Commission</th><th scope="col" className="p-3 text-right">Outstanding</th></tr></thead>
            <tbody>{((balances ?? []) as unknown as { tenant_id: string; gross_sales_minor: number; commission_minor: number; outstanding_minor: number }[]).map((b) => (
              <tr key={b.tenant_id} className="border-b border-line last:border-0"><td className="p-3">{nameOf.get(b.tenant_id)}</td><td className="p-3 text-right">{m(b.gross_sales_minor)}</td><td className="p-3 text-right">{m(b.commission_minor)}</td><td className="p-3 text-right ">{m(b.outstanding_minor)}</td></tr>))}</tbody></table></div>)}</section>

      <section aria-labelledby="pay-h"><h2 id="pay-h" className="mb-3 text-h2">Recent payments</h2>
        {(payments ?? []).length === 0 ? <p className="text-body text-ink-soft">No payments yet.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface px-4">{((payments ?? []) as unknown as Named<{ id: string; status: string; amount_minor: number; provider_receipt: string | null; created_at: string }>[]).map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{p.tenants?.name} • {m(p.amount_minor)} • <span className="capitalize">{p.status.toLowerCase().replace(/_/g, ' ')}</span></span><span className="text-caption text-ink-soft">{p.provider_receipt ?? '—'} • {when(p.created_at)}</span></li>))}</ul>)}</section>
    </div>
  );
}
