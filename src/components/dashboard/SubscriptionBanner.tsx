'use client';
import Link from 'next/link';
import { useSessionGuard } from '@/lib/auth/session-guard';
import type { SubscriptionHealth } from '@/lib/auth/subscription';

const tone: Record<string, string> = {
  active: 'bg-success/10 border-success/40 text-ink',
  expiring_soon: 'bg-accent-soft border-accent/60 text-ink',
  trialing: 'bg-brand-soft border-brand/40 text-ink',
  past_due: 'bg-danger/10 border-danger/40 text-ink',
  expired: 'bg-danger/10 border-danger/40 text-ink',
  suspended: 'bg-danger/10 border-danger/40 text-ink',
  cancelled: 'bg-ink-muted/10 border-line text-ink',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Dashboard subscription banner. Doubles as the client-side session guard: if the
 * session has expired, the user is signed out and bounced to the staff login.
 * When the subscription isn't active, the banner explains that the account is
 * read-only and links to billing to renew/settle.
 */
export function SubscriptionBanner({ health }: { health: SubscriptionHealth }) {
  useSessionGuard('/staff-login');

  const { status, canAct, periodEnd, daysRemaining, suspendedReason } = health;
  const planName = health.planKey ? health.planKey.charAt(0).toUpperCase() + health.planKey.slice(1) : '—';

  const headline = (() => {
    switch (status) {
      case 'active': return `${planName} plan · active`;
      case 'trialing': return `${planName} plan · free trial`;
      case 'expiring_soon': return `${planName} plan · expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
      case 'expired': return `${planName} plan · expired`;
      case 'past_due': return `${planName} plan · payment past due`;
      case 'suspended': return `${planName} plan · suspended`;
      case 'cancelled': return `${planName} plan · cancelled`;
      default: return `${planName} plan`;
    }
  })();

  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-caption ${tone[status] ?? tone.cancelled}`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink">{headline}{status === 'active' || status === 'trialing' ? ` · renews / ends ${formatDate(periodEnd)}` : ''}</span>
        <Link href="/dashboard/billing" className="underline">Manage billing</Link>
      </div>
      {!canAct ? (
        <p className="mt-1 text-ink-soft">
          {status === 'suspended' && suspendedReason ? `Suspended: ${suspendedReason}. ` : ''}
          Your subscription is not active, so the back office is <strong>read-only</strong> — you can view everything but can&apos;t take new orders or make changes until you renew.{' '}
          <Link href="/dashboard/billing" className="underline">Renew now</Link>.
        </p>
      ) : null}
    </div>
  );
}
