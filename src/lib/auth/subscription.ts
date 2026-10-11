import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { computeStatus, isActiveStatus, type ComputedStatus } from '@/lib/subscription/duration';

export interface SubscriptionHealth {
  planKey: string | null;
  status: ComputedStatus;
  /** True when the kitchen may still place/mutate. False = read-only. */
  canAct: boolean;
  periodEnd: string | null;
  daysRemaining: number;
  durationDays: number | null;
  suspendedReason: string | null;
  autoRenew: boolean;
}

const READ_ONLY: ComputedStatus[] = ['expired', 'suspended', 'cancelled', 'past_due'];

/** Current subscription health for the active tenant, cached per request. */
export const getSubscriptionHealth = cache(async (): Promise<SubscriptionHealth> => {
  const tenant = await getTenant();
  const supabase = await createClient();
  const { data } = await supabase
    .from('subscription_health')
    .select('plan_key, status, current_period_end, duration_days, suspended_reason, auto_renew, computed_status, days_remaining')
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  const row = data as {
    plan_key: string | null; status: string; current_period_end: string | null;
    duration_days: number | null; suspended_reason: string | null; auto_renew: boolean;
    computed_status: ComputedStatus; days_remaining: number;
  } | null;

  // Fall back to the pure helper if the view isn't present (pre-migration).
  const computed = row?.computed_status
    ?? computeStatus(row ? { status: row.status, current_period_end: row.current_period_end } : null, new Date());

  return {
    planKey: row?.plan_key ?? null,
    status: computed,
    canAct: isActiveStatus(computed) && !READ_ONLY.includes(computed),
    periodEnd: row?.current_period_end ?? null,
    daysRemaining: row?.days_remaining ?? 0,
    durationDays: row?.duration_days ?? null,
    suspendedReason: row?.suspended_reason ?? null,
    autoRenew: row?.auto_renew ?? true,
  };
});

/** Short human label for the subscription status shown in the dashboard banner. */
export function statusLabel(status: ComputedStatus): string {
  switch (status) {
    case 'active': return 'Active';
    case 'expiring_soon': return 'Active — expires soon';
    case 'trialing': return 'Free trial';
    case 'past_due': return 'Payment past due';
    case 'expired': return 'Expired';
    case 'suspended': return 'Suspended';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}
