import { notFound } from 'next/navigation';
import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { formatMoney } from '@/lib/commerce/money';
import { changeSubscription, createPayout, postAdjustment, setCommission } from '@/lib/actions/admin';

export default async function KitchenDetail({ params }: { params: Promise<{ id: string }> }) {
  const role = await requirePlatform();
  const { id } = await params; const supabase = await createClient();
  const { data: t } = await supabase.from('tenants').select('id, name, slug, status, created_at, contact_email, contact_phone, currency').eq('id', id).maybeSingle();
  if (!t) notFound();
  const { data: acct } = await supabase.from('payout_accounts').select('msisdn, account_name').eq('tenant_id', id).eq('status', 'approved').maybeSingle();
  const [{ data: subs }, { data: plans }, { data: bal }, { data: rule }, { data: dom }, { count: orders }] = await Promise.all([
    supabase.from('subscriptions').select('plan_key, status, current_period_end').eq('tenant_id', id).order('created_at', { ascending: false }).limit(1),
    supabase.from('plans').select('key, name').order('sort_order'),
    supabase.from('kitchen_balances').select('*').eq('tenant_id', id).maybeSingle(),
    supabase.from('commission_rules').select('enabled, percent_bps, fixed_minor, effective_from').eq('scope', 'tenant').eq('tenant_id', id).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('tenant_domains').select('hostname').eq('tenant_id', id).eq('is_primary', true).maybeSingle(),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', id).not('paid_at', 'is', null),
  ]);
  const m = (n: number) => formatMoney(n, t.currency); const sub = subs?.[0]; const write = role !== 'support';

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className="text-h1 text-ink-muted">{t.name}</h1>
        <p className="text-body text-ink-soft">{dom?.hostname} • {t.status.replace('_', ' ')} • {t.contact_email ?? 'no email'} • {orders ?? 0} paid orders</p>
      </div>

      <section aria-labelledby="bal-h">
        <h2 id="bal-h" className="mb-2 text-h2 text-ink-muted">Balance</h2>
        <dl className="grid max-w-md grid-cols-2 gap-x-8 gap-y-1 rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="row-span-2"><dt>Gross sales</dt><dd className="text-right text-ink-muted">{m(bal?.gross_sales_minor ?? 0)}</dd></div>
          <div className="row-span-2"><dt>Commission</dt><dd className="text-right text-ink-muted">{m(bal?.commission_minor ?? 0)}</dd></div>
          <div className="row-span-2"><dt>Refunds</dt><dd className="text-right text-ink-muted">{m(bal?.refunds_minor ?? 0)}</dd></div>
          <div className="row-span-2"><dt>Paid out</dt><dd className="text-right text-ink-muted">{m(bal?.paid_out_minor ?? 0)}</dd></div>
          <div className="col-span-2"><dt className="font-semibold text-ink-muted">Outstanding</dt><dd className="text-right font-semibold text-ink-muted">{m(bal?.outstanding_minor ?? 0)}</dd></div>
        </dl>
      </section>

      {write ? (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="sub-h" className="flex flex-col gap-3">
            <h2 id="sub-h" className="text-h2 text-ink-muted">Subscription{sub ? ` - ${sub.plan_key} (${sub.status})` : ''}</h2>
            <ActionForm action={changeSubscription} submitLabel="Save subscription" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1.5"><span className="text-label text-ink-muted">Plan</span>
                <select name="plan" defaultValue={sub?.plan_key ?? ''} className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted">
                  {(plans ?? []).map((pl: { key: string; name: string }) => <option key={pl.key} value={pl.key}>{pl.name}</option>)}
                </select></label>
              <Input label="Status" name="status" defaultValue={sub?.status ?? 'active'} />
            </ActionForm>
          </section>
          <section aria-labelledby="com-h" className="flex flex-col gap-3">
            <h2 id="com-h" className="text-h2 text-ink-muted">Commission</h2>
            <p className="text-body text-ink-soft">Current: {rule ? `${(rule.percent_bps / 100).toFixed(2)}% + ${m(rule.fixed_minor)}` : 'platform default'}.</p>
            <ActionForm action={setCommission} submitLabel="Save commission" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
              <input type="hidden" name="scope" value="tenant" /><input type="hidden" name="tenant" value={id} />
              <Input label="Percent" name="percent" inputMode="decimal" defaultValue={rule ? String(rule.percent_bps / 100) : ''} />
              <Input label="Fixed fee (KSh)" name="fixed" inputMode="numeric" defaultValue={rule ? String(rule.fixed_minor / 100) : ''} />
              <label className="flex h-11 items-center gap-2 text-body text-ink-muted"><input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} className="size-4 accent-brand" />Enabled</label>
            </ActionForm>
          </section>
          <section aria-labelledby="pay-h" className="flex flex-col gap-3">
            <h2 id="pay-h" className="text-h2 text-ink-muted">Payouts{acct ? ` - approved number ****${acct.msisdn.slice(-4)}` : ''}</h2>
            <ActionForm action={createPayout} submitLabel="Create payout" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="tenant" value={id} />
              <Input label="Amount (KSh)" name="amount" inputMode="numeric" required />
              <Input label="Note" name="note" />
            </ActionForm>
            <ActionForm action={postAdjustment} submitLabel="Post adjustment" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="tenant" value={id} />
              <Input label="Amount (KSh, minus to deduct)" name="amount" inputMode="numeric" required />
              <Input label="Reason" name="reason" required />
            </ActionForm>
          </section>
        </div>
      ) : <p className="text-body text-ink-soft">Read-only access.</p>}
    </div>
  );
}
