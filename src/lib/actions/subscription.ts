'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { fail, ok, type ActionResult } from './result';
import { friendlyError } from '@/lib/errors';
import { termDays } from '@/lib/subscription/duration';

const termSchema = z.object({
  term: z.enum(['month', 'year', 'custom']).default('month'),
  days: z.coerce.number().int().positive().max(367).optional(),
});

/** Renew (or first activate) the current plan for another term. */
export async function renewSubscription(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = termSchema.safeParse({ term: fd.get('term') ?? 'month', days: fd.get('days') ?? undefined });
  if (!parsed.success) return fail('Choose a billing term.');
  const tenant = await getTenant();
  const supabase = await createClient();
  const { error } = await supabase.rpc('renew_subscription', {
    p_tenant: tenant.id, p_term: parsed.data.term, p_days: parsed.data.days ?? null,
  });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/billing');
  revalidatePath('/dashboard');
  const days = termDays(parsed.data.term, parsed.data.days);
  return ok(`Subscription renewed for ${days} days.`);
}

/** Switch plan now, keeping all remaining paid time. */
export async function changePlan(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const plan = String(fd.get('plan') ?? '');
  if (!plan) return fail('Choose a plan.');
  const tenant = await getTenant();
  const supabase = await createClient();
  const { error } = await supabase.rpc('change_plan', { p_tenant: tenant.id, p_plan: plan });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/billing');
  revalidatePath('/dashboard');
  return ok('Plan updated. Your remaining time is unchanged.');
}

/** Suspend the kitchen's own subscription (self-service pause). */
export async function suspendSubscription(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const reason = String(fd.get('reason') ?? '').trim() || null;
  const tenant = await getTenant();
  const supabase = await createClient();
  const { error } = await supabase.rpc('suspend_subscription', { p_tenant: tenant.id, p_reason: reason });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/billing');
  revalidatePath('/dashboard');
  return ok('Subscription suspended. The back office is now read-only.');
}

/** Reactivate a suspended subscription. */
export async function reactivateSubscription(_: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const tenant = await getTenant();
  const supabase = await createClient();
  const { error } = await supabase.rpc('reactivate_subscription', { p_tenant: tenant.id });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/billing');
  revalidatePath('/dashboard');
  return ok('Subscription reactivated.');
}
