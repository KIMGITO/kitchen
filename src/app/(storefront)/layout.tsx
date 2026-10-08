import type { ReactNode } from 'react';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { getUser } from '@/lib/auth/session';
import { CustomerHeader } from '@/components/storefront/CustomerHeader';
import { BottomTabBar } from '@/components/storefront/BottomTabBar';
import { OpeningHours } from '@/components/storefront/OpeningHours';

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const [tenant, user] = await Promise.all([getActiveTenant(), getUser()]);
  return (
    <>
      <CustomerHeader tenant={tenant} signedIn={!!user} />
      <main id="main" className="pb-16 md:pb-0">{children}</main>
      <footer className="border-t border-line bg-surface-alt">
        <div className="mx-auto max-w-6xl px-4 py-8 text-caption text-ink-soft sm:px-6">
          <p className="text-label text-ink">{tenant.name}</p>
          {tenant.address_text ? <p>{tenant.address_text}</p> : null}
          {tenant.contact_phone ? <p>{tenant.contact_phone}</p> : null}
          <OpeningHours hours={tenant.opening_hours} />
        </div>
      </footer>
      <BottomTabBar />
    </>
  );
}
