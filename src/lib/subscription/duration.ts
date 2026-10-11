/**
 * Subscription period maths. Pure and dependency-free so it runs on the server
 * and can be unit-tested without a database.
 *
 * Duration conventions (locked in):
 *   - month = 30 days
 *   - year  = 30 * 12 + 7 = 367 days
 *   - custom = an explicit number of days (e.g. 180 for "6 months"), always
 *     priced relative to the plan's base monthly price.
 */

export const MONTH_DAYS = 30;
export const YEAR_DAYS = MONTH_DAYS * 12 + 7; // 367

export type TermKind = 'month' | 'year' | 'custom';

/** Number of days a term covers. `custom` requires an explicit day count. */
export function termDays(kind: TermKind, customDays?: number): number {
  if (kind === 'month') return MONTH_DAYS;
  if (kind === 'year') return YEAR_DAYS;
  // Custom: fall back to a month if the caller didn't supply a sane value.
  if (customDays && Number.isInteger(customDays) && customDays > 0 && customDays <= YEAR_DAYS) return customDays;
  return MONTH_DAYS;
}

/**
 * Adds a term to a base date. When the kitchen still has paid time remaining,
 * renewing extends from the current expiry (never "wastes" unused days); once
 * it has lapsed, the term starts today.
 *
 * @param from      the reference date (usually `current_period_end`, or today when null)
 * @param now       "today" — injected so the function is deterministic in tests
 * @param kind      month | year | custom
 * @param customDays explicit day count for `custom`
 */
export function addPeriod(from: Date | null, now: Date, kind: TermKind, customDays?: number): Date {
  const days = termDays(kind, customDays);
  const start = from && from.getTime() > now.getTime() ? from : now;
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return end;
}

/** Whole days from `now` until `end`. Negative once the date has passed. */
export function daysUntil(end: Date | null, now: Date): number {
  if (!end) return 0;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Term price in minor units, pro-rated from the plan's monthly price and
 * rounded to the nearest whole shilling. A year keeps its 367-day convention;
 * custom terms scale linearly against a 30-day month.
 */
export function priceForTerm(baseMinor: number, kind: TermKind, customDays?: number): number {
  const days = termDays(kind, customDays);
  return Math.round((baseMinor * days) / MONTH_DAYS / 100) * 100;
}

export type ComputedStatus = 'trialing' | 'active' | 'expiring_soon' | 'past_due' | 'expired' | 'suspended' | 'cancelled';

export interface HealthInput {
  status: string;
  current_period_end: string | null;
}

/**
 * Derives the *effective* status for display and gating. The stored `status` is
 * the source of truth for terminal states (suspended/cancelled/past_due);
 * otherwise `current_period_end` decides whether the kitchen is still live.
 */
export function computeStatus(sub: HealthInput | null, now: Date): ComputedStatus {
  if (!sub) return 'expired';
  if (sub.status === 'suspended') return 'suspended';
  if (sub.status === 'cancelled') return 'cancelled';
  if (sub.status === 'past_due') return 'past_due';
  const remaining = daysUntil(sub.current_period_end ? new Date(sub.current_period_end) : null, now);
  if (remaining <= 0) return 'expired';
  if (sub.status === 'trialing') return 'trialing';
  if (remaining <= 7) return 'expiring_soon';
  return 'active';
}

/** Whether the kitchen may still *act* (place/mutate). Read-only otherwise. */
export function isActiveStatus(status: ComputedStatus): boolean {
  return status === 'active' || status === 'expiring_soon' || status === 'trialing';
}
