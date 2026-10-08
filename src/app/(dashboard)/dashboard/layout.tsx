import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenant } from '@/lib/tenant/get-tenant';
import { getPermissions, getUser } from '@/lib/auth/session';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { LogoutButton } from '@/components/account/LogoutButton';
import { NavLink } from '@/components/ui/primitives/NavLink';
import { Icon } from '@/components/ui/primitives/Icon';

export const metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

const NAV = [
  { href: '/dashboard', label: 'Overview', perm: null },
  { href: '/dashboard/orders', label: 'Orders', perm: 'orders.view' },
  { href: '/dashboard/menu', label: 'Menu', perm: 'menu.view' },
  { href: '/dashboard/customers', label: 'Customers', perm: 'customers.view' },
  { href: '/dashboard/transactions', label: 'Transactions', perm: 'finance.view' },
  { href: '/dashboard/staff', label: 'Staff', perm: 'staff.view' },
  { href: '/dashboard/settings', label: 'Settings', perm: 'settings.manage' },
] as const;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [tenant, user] = await Promise.all([getTenant(), getUser()]);
  if (!user) redirect('/staff-login?next=/dashboard');
  const perms = await getPermissions();
  if (perms.toArray().length === 0) redirect('/');

  return (
    <div className="page-shell min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <span className="flex items-center gap-2 text-h3 text-ink-muted">
            <Icon name="settings" size={18} className="text-brand" />
            {tenant.name}
          </span>
          {perms.can('orders.view') ? <NotificationBell tenantId={tenant.id} audience="kitchen" /> : null}
        </div>
        {tenant.status !== 'active' ? <p className="mx-3 mb-2 rounded-md bg-accent/20 px-3 py-2 text-caption text-accent-contrast">Your storefront is {tenant.status === 'pending_approval' ? 'waiting for approval' : 'not live'}. Customers cannot see it yet.</p> : null}
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.filter((n) => n.perm === null || perms.can(n.perm)).map((n) => (
            <NavLink key={n.href} href={n.href}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="hidden px-5 py-4 md:block"><LogoutButton redirectTo="/staff-login" /></div>
      </aside>
      <div className="min-w-0 p-4 sm:p-8">{children}</div>
    </div>
  );
}
