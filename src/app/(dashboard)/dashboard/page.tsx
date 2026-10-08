import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/commerce/money';

export default async function DashboardHome() {
  const { perms } = await requirePermission('orders.view');
  const tenant = await getTenant();
  const supabase = await createClient();
  const count = async (status: string) => (await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', status)).count ?? 0;
  const [received, preparing, ready] = await Promise.all([count('RECEIVED'), count('PREPARING'), count('READY')]);
  const { data: bal } = perms.can('finance.view')
    ? await supabase.from('kitchen_balances').select('outstanding_minor').eq('tenant_id', tenant.id).maybeSingle() : { data: null };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">Overview</h1>
      {received + preparing + ready === 0
        ? <EmptyState title="No live orders" description="New paid orders appear here as soon as they arrive." />
        : <p className="text-body-lg">{received} new, {preparing} preparing, {ready} ready. <Link href="/dashboard/orders" className="underline">Open the order board</Link></p>}
      {bal ? <p className="text-body">Balance owed to you: <strong>{formatMoney(bal.outstanding_minor, tenant.currency)}</strong> (<Link href="/dashboard/transactions" className="underline">details</Link>)</p> : null}
    </div>
  );
}
