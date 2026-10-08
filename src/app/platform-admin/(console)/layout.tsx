import type { ReactNode } from 'react';
import Link from 'next/link';
import { requirePlatform } from '@/lib/auth/platform';
import { LogoutButton } from '@/components/account/LogoutButton';
import { NavLink } from '@/components/ui/primitives/NavLink';
import { Icon } from '@/components/ui/primitives/Icon';

export const metadata = { title: 'Codensons admin', robots: { index: false, follow: false } };
const NAV = [['/', 'Overview'], ['/kitchens', 'Kitchens'], ['/finance', 'Finance'], ['/plans', 'Plans'], ['/users', 'Users'], ['/system', 'System']] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const role = await requirePlatform();
  return (
    <div className="page-shell min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4">
          <Icon name="shield" size={18} className="text-brand" />
          <span className="text-h3 text-ink-muted">Codensons</span>
          <span className="ml-auto text-caption text-ink-soft">{role}{role === 'support' ? ' (read-only)' : ''}</span>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {NAV.map(([h, l]) => <NavLink key={h} href={h} alwaysActive={h === '/'}>{l}</NavLink>)}
        </nav>
        <div className="hidden px-5 py-4 md:block"><LogoutButton redirectTo="/login" /></div>
      </aside>
      <div className="min-w-0 p-4 sm:p-8">{children}</div>
    </div>
  );
}
