'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { ActionForm } from '@/components/ui/ActionForm';
import { formatMoney } from '@/lib/commerce/money';
import { changePlan, reactivateSubscription, renewSubscription, suspendSubscription } from '@/lib/actions/subscription';
import { MONTH_DAYS, YEAR_DAYS } from '@/lib/subscription/duration';
import type { SubscriptionHealth } from '@/lib/auth/subscription';

type Term = 'month' | 'year' | 'custom';

interface Plan {
  key: string; name: string; description: string | null;
  price_monthly_minor: number; price_yearly_minor: number;
  features: string[] | null; staff_limit: number | null;
}

function priceFor(plan: Plan, term: Term, customDays: number, currency: string): string {
  if (term === 'month') return `${formatMoney(plan.price_monthly_minor, currency)} / month`;
  if (term === 'year') return `${formatMoney(plan.price_yearly_minor, currency)} / year`;
  const perDay = plan.price_monthly_minor / MONTH_DAYS;
  return `${formatMoney(Math.round(perDay * customDays), currency)} / ${customDays} days`;
}

export function BillingPanel({ currency, health, plans }: { currency: string; health: SubscriptionHealth; plans: Plan[] }) {
  const [term, setTerm] = useState<Term>('month');
  const [customDays, setCustomDays] = useState(180);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-line bg-surface p-5" aria-labelledby="sub-h">
        <h2 id="sub-h" className="text-h3">Current subscription</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <div><dt className="text-caption text-ink-soft">Plan</dt><dd className="text-body">{health.planKey ?? 'No plan'}</dd></div>
          <div><dt className="text-caption text-ink-soft">Status</dt><dd className="text-body capitalize">{health.status.replace(/_/g, ' ')}</dd></div>
          <div><dt className="text-caption text-ink-soft">Period end</dt><dd className="text-body">{health.periodEnd ? new Date(health.periodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</dd></div>
          <div><dt className="text-caption text-ink-soft">Days remaining</dt><dd className="text-body">{health.canAct ? health.daysRemaining : '0 (read-only)'}</dd></div>
        </dl>
        {health.suspendedReason ? <p className="mt-2 text-caption text-danger">Suspended reason: {health.suspendedReason}</p> : null}
      </section>

      <section aria-labelledby="renew-h" className="flex flex-col gap-4">
        <h2 id="renew-h" className="text-h3">Renew subscription</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Billing term">
          {(['month', 'year', 'custom'] as Term[]).map((t) => (
            <button key={t} type="button" onClick={() => setTerm(t)} aria-pressed={term === t}
              className={`rounded-pill border px-4 py-2 text-label capitalize transition-colors ${term === t ? 'border-brand bg-brand text-brand-contrast' : 'border-line text-ink-muted hover:border-accent'}`}>
              {t === 'month' ? 'Monthly (30 days)' : t === 'year' ? `Yearly (${YEAR_DAYS} days)` : 'Custom length'}
            </button>
          ))}
        </div>
        {term === 'custom' ? (
          <div className="max-w-xs">
            <Input label="Custom length (days)" type="number" min={1} max={367} value={customDays} onChange={(e) => setCustomDays(Number(e.target.value))} hint="1–367 days, priced from the monthly rate." />
          </div>
        ) : null}
        <ActionForm action={renewSubscription} submitLabel={`Renew for ${term === 'custom' ? `${customDays} days` : term === 'month' ? `${MONTH_DAYS} days` : `${YEAR_DAYS} days`}`} pendingLabel="Renewing…" className="max-w-md">
          <input type="hidden" name="term" value={term} />
          {term === 'custom' ? <input type="hidden" name="days" value={customDays} /> : null}
        </ActionForm>
      </section>
      <section aria-labelledby="plans-h" className="flex flex-col gap-4">
        <h2 id="plans-h" className="text-h3">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const current = health.planKey === plan.key;
            return (
              <div key={plan.key} className={`flex flex-col gap-3 rounded-lg border p-5 ${current ? 'border-brand bg-brand/5' : 'border-line bg-surface'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-h3">{plan.name}</h3>
                  {current ? <span className="rounded-full bg-brand px-2.5 py-0.5 text-caption text-brand-contrast">Current</span> : null}
                </div>
                {plan.description ? <p className="text-caption text-ink-soft">{plan.description}</p> : null}
                <p className="text-body-lg">{priceFor(plan, term, customDays, currency)}</p>
                {plan.features?.length ? (
                  <ul className="flex flex-col gap-1 text-caption text-ink-soft">{plan.features.map((f) => <li key={f}>• {f}</li>)}</ul>
                ) : null}
                {!current ? (
                  <ActionForm action={changePlan} submitLabel="Switch to this plan" pendingLabel="Switching…" variant="outline">
                    <input type="hidden" name="plan" value={plan.key} />
                  </ActionForm>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="pause-h" className="flex flex-col gap-4">
        <h2 id="pause-h" className="text-h3">Pause</h2>
        {health.status === 'suspended' ? (
          <ActionForm action={reactivateSubscription} submitLabel="Reactivate subscription" pendingLabel="Reactivating…" className="max-w-md" />
        ) : (
          <ActionForm action={suspendSubscription} submitLabel="Suspend subscription" pendingLabel="Suspending…" variant="outline" className="max-w-md">
            <Input label="Reason (optional)" name="reason" maxLength={200} placeholder="e.g. seasonal break" />
          </ActionForm>
        )}
        <p className="text-caption text-ink-soft">Suspending makes the back office read-only but keeps your data and remaining time.</p>
      </section>
    </div>
  );
}
