'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from './result';
import { friendlyError } from '@/lib/errors';
import { shillingsToMinor } from '@/lib/money-input';
import { invokeAsUser } from '@/lib/functions-server';

async function rpc(name: string, args: Record<string, unknown>, message: string, paths: string[] = ['/']): Promise<ActionResult> {
  const { error } = await (await createClient()).rpc(name, args);
  if (error) return fail(friendlyError(error.message));
  paths.forEach((p) => revalidatePath(p)); return ok(message);
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

export async function setTenantStatus(fd: FormData): Promise<void> {
  await rpc('set_tenant_status', { p_tenant: str(fd, 'id'), p_status: str(fd, 'status') }, 'ok', ['/kitchens', '/']);
}
export async function changeSubscription(_: ActionResult | null, fd: FormData) {
  return rpc('change_subscription', { p_tenant: str(fd, 'id'), p_plan: str(fd, 'plan'), p_status: str(fd, 'status') || 'active' }, 'Subscription updated.', ['/kitchens']);
}
export async function setCommission(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const pct = Number(str(fd, 'percent')); const fixed = shillingsToMinor(fd.get('fixed') || '0');
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 || fixed === null) return fail('Enter a percentage from 0 to 100 and a fixed fee in whole shillings.');
  const scope = str(fd, 'scope') as 'platform' | 'plan' | 'tenant';
  return rpc('set_commission_rule', {
    p_scope: scope, p_tenant: scope === 'tenant' ? str(fd, 'tenant') : null, p_plan: scope === 'plan' ? str(fd, 'plan') : null,
    p_enabled: fd.get('enabled') === 'on', p_percent_bps: Math.round(pct * 100), p_fixed_minor: fixed,
  }, 'Commission saved. It applies to orders paid from now on; past orders keep the rate they were charged.', ['/finance', '/kitchens']);
}
export async function createPayout(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const amount = shillingsToMinor(fd.get('amount'));
  if (amount === null || amount < 100) return fail('Enter the payout amount in whole shillings.');
  return rpc('create_payout', { p_tenant: str(fd, 'tenant'), p_amount_minor: amount, p_method: ['manual', 'mpesa_b2c', 'bank'].includes(str(fd, 'method')) ? str(fd, 'method') : 'manual', p_note: str(fd, 'note') || null }, 'Payout created as pending.', ['/finance', '/kitchens']);
}
export async function completePayout(_: ActionResult | null, fd: FormData) {
  if (str(fd, 'reference').trim().length < 3) return fail('Enter the M-Pesa or bank reference for this payout.');
  return rpc('complete_payout', { p_payout: str(fd, 'id'), p_reference: str(fd, 'reference').trim() }, 'Payout marked as completed.', ['/finance', '/kitchens']);
}
export async function cancelPayout(fd: FormData): Promise<void> { await rpc('cancel_payout', { p_payout: str(fd, 'id') }, 'ok', ['/finance', '/kitchens']); }
export async function postAdjustment(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const n = Number(str(fd, 'amount').replace(/,/g, ''));
  if (!Number.isInteger(n) || n === 0) return fail('Enter a non-zero amount in whole shillings. Use a minus sign to deduct.');
  return rpc('post_adjustment', { p_tenant: str(fd, 'tenant'), p_amount_minor: n * 100, p_reason: str(fd, 'reason') }, 'Adjustment posted.', ['/finance', '/kitchens']);
}
export async function refundOrder(_: ActionResult | null, fd: FormData) {
  if (str(fd, 'reference').trim().length < 3) return fail('Enter the reference of the refund you sent to the customer.');
  return rpc('refund_order', { p_order: str(fd, 'id'), p_reference: str(fd, 'reference').trim() }, 'Refund recorded.', ['/finance']);
}
export async function resolvePaymentRefund(_: ActionResult | null, fd: FormData) {
  if (str(fd, 'reference').trim().length < 3) return fail('Enter the reference of the refund you sent to the customer.');
  return rpc('resolve_payment_refund', { p_payment: str(fd, 'id'), p_reference: str(fd, 'reference').trim() }, 'Marked as refunded.', ['/finance']);
}

export async function savePlan(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const key = str(fd, 'plan'); const price = shillingsToMinor(fd.get('price'));
  if (price === null) return fail('Enter the price in whole shillings.');
  const supabase = await createClient();
  const { error } = await supabase.from('plans').update({ price_minor: price, is_active: fd.get('active') === 'on', name: str(fd, 'name') || key }).eq('key', key);
  if (error) return fail(friendlyError(error.message));
  const { data: features } = await supabase.from('features').select('key, kind');
  const rows = (features ?? []).map((f: { key: string; kind: string }) => {
    const raw = str(fd, `limit_${f.key}`).trim();
    return { plan_key: key, feature_key: f.key, enabled: fd.get(`on_${f.key}`) === 'on', limit_value: f.kind === 'limit' && raw !== '' ? Math.max(0, Math.floor(Number(raw)) || 0) : null };
  });
  const { error: fErr } = await supabase.from('plan_features').upsert(rows, { onConflict: 'plan_key,feature_key' });
  if (fErr) return fail(friendlyError(fErr.message));
  revalidatePath('/plans'); return ok('Plan saved. Changes apply to kitchens on this plan immediately.');
}
export async function saveSetting(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const key = str(fd, 'key'); const value = str(fd, 'value').trim();
  if (key !== 'root_domain' || !/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/.test(value)) return fail('Enter a valid domain, for example example.com.');
  const { error } = await (await createClient()).from('platform_settings').update({ value: JSON.stringify(value) as never }).eq('key', key);
  if (error) return fail('Only the platform owner can change this.');
  revalidatePath('/system'); return ok('Saved. New kitchens will use this domain; existing kitchens keep their current address.');
}

export async function sendPayoutB2C(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await invokeAsUser('mpesa-b2c-payout', { payout_id: str(fd, 'id') });
  revalidatePath('/finance'); revalidatePath('/kitchens'); return r;
}
export async function refundViaMpesa(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const body = str(fd, 'order') ? { order_id: str(fd, 'order') } : { payment_id: str(fd, 'payment') };
  const r = await invokeAsUser('mpesa-refund', body);
  revalidatePath('/finance'); return r;
}
export async function failPayoutManual(_: ActionResult | null, fd: FormData) {
  return rpc('fail_payout_manual', { p_payout: str(fd, 'id'), p_reason: str(fd, 'reason') || 'Marked failed by admin' }, 'Payout marked as failed. The balance is available again.', ['/finance']);
}
export async function reviewPayoutAccount(fd: FormData): Promise<void> {
  await rpc('review_payout_account', { p_id: str(fd, 'id'), p_approve: str(fd, 'approve') === 'true' }, 'ok', ['/finance', '/kitchens']);
}
export async function setPaymentReceipt(_: ActionResult | null, fd: FormData) {
  return rpc('set_payment_receipt', { p_payment: str(fd, 'id'), p_receipt: str(fd, 'receipt') }, 'Receipt saved.', ['/finance']);
}
