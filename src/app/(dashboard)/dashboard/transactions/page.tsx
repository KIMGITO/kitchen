import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/commerce/money';
import { Badge } from '@/components/ui/primitives/Badge';

export default async function Transactions() {
  const { perms } = await requirePermission('finance.view');
  const tenant = await getTenant();
  const supabase = await createClient();
  const { data: payouts, error: payoutErr } = await supabase.from('payouts')
    .select('id, amount_minor, status, method, created_at, sent_at, note').eq('tenant_id', tenant.id)
    .in('status', ['pending', 'processing', 'completed', 'failed', 'refunded']).order('created_at', { ascending: false }).limit(50);

  const rows = (payouts ?? []) as { id: string; amount_minor: number; status: string; method: string; created_at: string; sent_at: string | null; note: string | null }[];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1 text-ink-muted">Transactions</h1>
      {payoutErr ? <p role="alert" className="text-danger">Could not load transactions.</p> : null}

      <section aria-labelledby="payouts-h">
        <h2 id="payouts-h" className="mb-3 text-h2 text-ink-muted">Payouts</h2>
        {rows.length === 0 ? <p className="text-body text-ink-muted/70">No payouts yet.</p> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
            <table className="w-full text-left text-body">
              <caption className="sr-only">Payouts</caption>
              <thead className="border-b border-line text-label text-ink-muted/70">
                <tr>
                  <th scope="col" className="p-3">Amount</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">Method</th>
                  <th scope="col" className="p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell table-cell--right">{formatMoney(p.amount_minor, tenant.currency)}</td>
                    <td className="table-cell"><Badge tone="surface" className="capitalize">{p.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="table-cell">{p.method.replace(/_/g, ' ')}</td>
                    <td className="table-cell text-ink-muted/70">{new Date(p.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</td>
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
