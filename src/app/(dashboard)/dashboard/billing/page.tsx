import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { getSubscriptionHealth } from '@/lib/auth/subscription';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { BillingPanel } from '@/components/dashboard/BillingPanel';
import type { SubscriptionHealth } from '@/lib/auth/subscription';

export const metadata: Metadata = { title: 'Billing', robots: { index: false, follow: false } };

interface PlanRow {
  key: string; name: string; description: string | null;
  price_monthly_minor: number; price_yearly_minor: number;
  features: string[] | null; is_public: boolean; staff_limit: number | null;
}

export default async function BillingPage() {
  await requirePermission('settings.manage');
  const tenant = await getTenant();
  const supabase = await createClient();
  const [{ data: plans }, health] = await Promise.all([
    supabase.from('plans').select('key, name, description, price_monthly_minor, price_yearly_minor, features, is_public, staff_limit').order('price_monthly_minor'),
    getSubscriptionHealth(),
  ]);

  const publicPlans = (plans ?? []) as PlanRow[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h1">Billing &amp; subscription</h1>
        <p className="mt-1 text-body text-ink-soft">One subscription covers this kitchen only. To run another kitchen, subscribe separately from that kitchen&apos;s account.</p>
      </div>
      <BillingPanel currency={tenant.currency} health={health} plans={publicPlans} />
    </div>
  );
}

export type { SubscriptionHealth, PlanRow };
