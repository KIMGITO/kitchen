import { describe, expect, it } from 'vitest';
import { friendlyError, describeError } from '@/lib/errors';

describe('friendlyError', () => {
  it('maps known database error codes to plain language', () => {
    expect(friendlyError('not_authenticated')).toBe('Your session has expired. Log in again.');
    expect(friendlyError('setup_completed: setup already done')).toBe('Platform setup is already completed — the platform already has an owner.');
    expect(friendlyError('permission denied for table plans')).toBe("You don't have permission to do that.");
  });

  it('falls back to a generic message for anything it does not recognise', () => {
    expect(friendlyError('relation "public.plans" does not exist')).toBe('Something went wrong. Try again.');
    expect(friendlyError('', 'custom fallback')).toBe('custom fallback');
    expect(friendlyError(null)).toBe('Something went wrong. Try again.');
  });
});

describe('describeError', () => {
  it('keeps the friendly wording for known codes', () => {
    expect(describeError('permission_denied: rls')).toBe("You don't have permission to do that.");
    expect(describeError('setup_completed')).toBe('Platform setup is already completed — the platform already has an owner.');
  });

  it('shows the RAW message for unknown errors so the real cause is visible on the page', () => {
    // This is the point of describeError: after a database reset these are exactly
    // the messages an operator needs to see, and friendlyError hid them.
    expect(describeError('relation "public.plans" does not exist')).toBe('relation "public.plans" does not exist');
    expect(describeError('function public.platform_setup_required() does not exist')).toBe('function public.platform_setup_required() does not exist');
  });

  it('uses the caller-supplied fallback only when there is no message at all', () => {
    expect(describeError(null, 'Try again.')).toBe('Try again.');
    expect(describeError('   ', 'Try again.')).toBe('Try again.');
    expect(describeError(undefined, 'Try again.')).toBe('Try again.');
  });

  it('trims surrounding whitespace', () => {
    expect(describeError('  boom  ')).toBe('boom');
  });
});
