import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { NotificationCenter, type NotificationRow } from '@/components/ui/NotificationCenter';

export default async function DashboardNotifications() {
  await requirePermission('orders.view');
  const tenant = await getTenant();
  const { data } = await (await createClient()).from('notifications')
    .select('id, title, body, kind, data, read_at, created_at, audience')
    .eq('tenant_id', tenant.id).eq('audience', 'kitchen').order('created_at', { ascending: false }).limit(31);
  const rows = (data ?? []) as NotificationRow[];
  return (
    <div className="max-w-3xl">
      <h1 className="text-h1">Notifications</h1>
      <p className="mb-6 mt-1 text-body text-ink-soft">New orders and payments. Alerts are shared by your whole team: marking one read or deleting it applies to everyone.</p>
      <NotificationCenter tenantId={tenant.id} audience="kitchen" initial={rows.slice(0, 30)} hasMoreInitial={rows.length > 30} />
    </div>
  );
}
