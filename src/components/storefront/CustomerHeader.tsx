import Link from 'next/link';
import Image from 'next/image';
import type { Tenant } from '@/lib/tenant/types';
import { CartLink } from './CartLink';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { Icon } from '@/components/ui/primitives/Icon';

export function CustomerHeader({ tenant, signedIn }: { tenant: Tenant; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-h3 text-ink-muted">
          {tenant.logo_url ? <Image src={tenant.logo_url} alt="" width={32} height={32} className="size-8 rounded-md object-cover" /> : null}
          <span>{tenant.name}</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
          <Link href="/menu" className="rounded-pill px-3 py-2 text-label text-ink-muted hover:bg-ink/5 transition-colors">Menu</Link>
          <CartLink tenantId={tenant.id} />
          {signedIn ? <NotificationBell tenantId={tenant.id} audience="customer" /> : null}
          <Link href={signedIn ? '/account' : '/login'}
            className="rounded-pill border border-line/60 px-4 py-2 text-label text-ink-muted hover:bg-ink/5 hover:border-brand/40 transition-colors">
            {signedIn ? 'Account' : 'Log in'}
          </Link>
        </nav>
      </div>
    </header>
  );
}
