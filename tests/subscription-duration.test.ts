import { describe, expect, it } from 'vitest';
import {
  MONTH_DAYS,
  YEAR_DAYS,
  termDays,
  addPeriod,
  daysUntil,
  priceForTerm,
  computeStatus,
  isActiveStatus,
} from '@/lib/subscription/duration';

const NOW = new Date('2026-10-10T00:00:00Z');

describe('term durations', () => {
  it('locks month = 30 days and year = 367 days', () => {
    expect(MONTH_DAYS).toBe(30);
    expect(YEAR_DAYS).toBe(367);
    expect(termDays('month')).toBe(30);
    expect(termDays('year')).toBe(367);
  });

  it('uses the explicit day count for custom terms within a year', () => {
    expect(termDays('custom', 180)).toBe(180); // 6 months
    expect(termDays('custom', 7)).toBe(7);
    expect(termDays('custom', 367)).toBe(367);
  });

  it('falls back to a month for an invalid custom value', () => {
    expect(termDays('custom', undefined)).toBe(30);
    expect(termDays('custom', 0)).toBe(30);
    expect(termDays('custom', -5)).toBe(30);
    expect(termDays('custom', 9999)).toBe(30); // capped at a year
    expect(termDays('custom', 30.5)).toBe(30); // not an integer
  });
});

describe('addPeriod', () => {
  it('adds 30 days for a month', () => {
    expect(addPeriod(NOW, NOW, 'month').toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });
  it('adds 367 days for a year', () => {
    expect(addPeriod(NOW, NOW, 'year').toISOString()).toBe('2027-10-12T00:00:00.000Z');
  });
  it('adds the custom day count', () => {
    expect(addPeriod(NOW, NOW, 'custom', 180).toISOString()).toBe('2027-04-08T00:00:00.000Z');
  });
  it('extends from the remaining end date when still active (no time lost)', () => {
    const futureEnd = new Date('2026-12-01T00:00:00Z'); // 52 days left
    expect(addPeriod(futureEnd, NOW, 'month').toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
  it('starts from today when the previous period already lapsed', () => {
    const pastEnd = new Date('2026-09-01T00:00:00Z');
    expect(addPeriod(pastEnd, NOW, 'month').toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });
  it('starts from today when there is no prior end date', () => {
    expect(addPeriod(null, NOW, 'year').toISOString()).toBe('2027-10-12T00:00:00.000Z');
  });
});

describe('daysUntil', () => {
  it('counts whole days ahead', () => {
    expect(daysUntil(new Date('2026-10-20T00:00:00Z'), NOW)).toBe(10);
  });
  it('is zero/negative once passed', () => {
    expect(daysUntil(new Date('2026-10-10T00:00:00Z'), NOW)).toBe(0);
    expect(daysUntil(new Date('2026-10-01T00:00:00Z'), NOW)).toBeLessThan(0);
    expect(daysUntil(null, NOW)).toBe(0);
  });
});

describe('priceForTerm', () => {
  it('pro-rates and rounds to whole shillings (minor units)', () => {
    expect(priceForTerm(100000, 'month')).toBe(100000); // 1000 KES
    expect(priceForTerm(100000, 'custom', 180)).toBe(600000); // 6 * 1000
    expect(priceForTerm(100000, 'year')).toBe(1_223_300); // 1000 * 367/30, rounded
  });
  it('rounds fractional monthly prices to the nearest shilling', () => {
    expect(priceForTerm(123456, 'custom', 7)).toBe(28800); // 1234.56 * 7/30 ≈ 288.06 -> 28800
  });
});

describe('computeStatus', () => {
  it('no subscription reads as expired', () => {
    expect(computeStatus(null, NOW)).toBe('expired');
  });
  it('respects terminal stored statuses first', () => {
    expect(computeStatus({ status: 'suspended', current_period_end: '2027-01-01T00:00:00Z' }, NOW)).toBe('suspended');
    expect(computeStatus({ status: 'cancelled', current_period_end: '2027-01-01T00:00:00Z' }, NOW)).toBe('cancelled');
    expect(computeStatus({ status: 'past_due', current_period_end: '2027-01-01T00:00:00Z' }, NOW)).toBe('past_due');
  });
  it('expires once the period end has passed', () => {
    expect(computeStatus({ status: 'active', current_period_end: '2026-10-01T00:00:00Z' }, NOW)).toBe('expired');
  });
  it('reports trialing while a trial period is still valid', () => {
    expect(computeStatus({ status: 'trialing', current_period_end: '2026-10-20T00:00:00Z' }, NOW)).toBe('trialing');
  });
  it('warns when active but within the last 7 days', () => {
    expect(computeStatus({ status: 'active', current_period_end: '2026-10-15T00:00:00Z' }, NOW)).toBe('expiring_soon');
  });
  it('is active with comfortable time left', () => {
    expect(computeStatus({ status: 'active', current_period_end: '2026-11-15T00:00:00Z' }, NOW)).toBe('active');
  });
});

describe('isActiveStatus (may the kitchen act?)', () => {
  it('allows live states', () => {
    expect(isActiveStatus('active')).toBe(true);
    expect(isActiveStatus('expiring_soon')).toBe(true);
    expect(isActiveStatus('trialing')).toBe(true);
  });
  it('blocks everything else (read-only)', () => {
    for (const s of ['expired', 'suspended', 'cancelled', 'past_due'] as const) expect(isActiveStatus(s)).toBe(false);
  });
});
