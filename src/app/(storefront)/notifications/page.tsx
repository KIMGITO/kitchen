import { redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { getKitchenCustomer, getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { NotificationCenter, type NotificationRow } from '@/components/ui/NotificationCenter';

export const metadata = { title: 'Notifications', robots: { index: false } };

export default async function NotificationsPage() {
  const tenant = await getActiveTenant();
  if (!(await getUser())) redirect('/login?next=/notifications');
  if (!(await getKitchenCustomer())) redirect('/register?next=/notifications');
  const { data } = await (await createClient()).from('notifications')
    .select('id, title, body, kind, data, read_at, created_at, audience')
    .eq('tenant_id', tenant.id).eq('audience', 'customer').order('created_at', { ascending: false }).limit(31);
  const rows = (data ?? []) as NotificationRow[];
  return (
    <Section><div className="mx-auto max-w-2xl">
      <h1 className="text-h1">Notifications</h1>
      <p className="mb-6 mt-1 text-body text-ink-soft">Receipts and updates from {tenant.name}.</p>
      <NotificationCenter tenantId={tenant.id} audience="customer" initial={rows.slice(0, 30)} hasMoreInitial={rows.length > 30} />
    </div></Section>
  );
}
