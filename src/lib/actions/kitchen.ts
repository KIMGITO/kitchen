'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { fail, ok, type ActionResult } from './result';
import { friendlyError } from '@/lib/errors';
import { shillingsToMinor } from '@/lib/money-input';
import { sendEmail } from '@/lib/email';
import { checkContrast, overridesSchema, resolveTheme } from '@/theme/resolve';
import { OVERRIDABLE_COLORS, FONT_KEYS } from '@/theme/theme';

// ---------- customers ----------
export async function setCustomerStatus(fd: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('set_customer_status', { p_customer: String(fd.get('id')), p_status: fd.get('status') === 'blocked' ? 'blocked' : 'active' });
  revalidatePath('/dashboard/customers', 'layout');
}
export async function saveCustomerNotes(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { error } = await (await createClient()).rpc('set_customer_notes', { p_customer: String(fd.get('id')), p_notes: String(fd.get('notes') ?? '').slice(0, 2000) });
  return error ? fail(friendlyError(error.message)) : ok('Notes saved.');
}

// ---------- staff ----------
export async function inviteStaff(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email: z.string().email(), role: z.enum(['manager', 'cashier', 'worker', 'kitchen_admin']) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail('Enter a valid email address and choose a role.');
  const tenant = await getTenant();
  const { data: token, error } = await (await createClient()).rpc('invite_staff', { p_tenant: tenant.id, p_email: parsed.data.email, p_role: parsed.data.role });
  if (error || !token) return fail(friendlyError(error?.message));
  const h = await headers(); const host = tenant.primary_hostname ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.includes('.localhost') ? 'http' : 'https');
  revalidatePath('/dashboard/staff');
  const link = `${proto}://${host}/invite/${token}`;
  const roleLabel = parsed.data.role.replace('_', ' ');
  const emailed = await sendEmail(parsed.data.email, `You're invited to join ${tenant.name}`,
    `You have been invited to join ${tenant.name} as ${roleLabel}.\n\nAccept the invitation: ${link}\n\nThis link works once and expires in 7 days. If you were not expecting this, ignore this email.`);
  // If email is not configured or fails, fall back to showing the single-use link to the admin.
  return emailed
    ? ok(`Invitation emailed to ${parsed.data.email}. It expires in 7 days.`)
    : ok(`We could not send the email, so share this link with ${parsed.data.email} yourself: ${link}`);
}
export async function updateStaff(fd: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('update_staff_member', { p_member: String(fd.get('member')), p_role: String(fd.get('role')), p_active: fd.get('active') === 'true' });
  revalidatePath('/dashboard/staff');
}
export async function revokeInvitation(fd: FormData): Promise<void> {
  await (await createClient()).rpc('revoke_invitation', { p_invitation: String(fd.get('id')) });
  revalidatePath('/dashboard/staff');
}

// ---------- settings ----------
export async function saveGeneral(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500), contact_email: z.string().trim().email().or(z.literal('')),
    contact_phone: z.string().trim().max(30), address_text: z.string().trim().max(200) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail('Check the kitchen name (at least 2 characters) and the email address.');
  const tenant = await getTenant();
  const { error } = await (await createClient()).from('tenants').update({
    name: p.data.name, description: p.data.description || null, contact_email: p.data.contact_email || null,
    contact_phone: p.data.contact_phone || null, address_text: p.data.address_text || null }).eq('id', tenant.id);
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/', 'layout'); return ok('Saved.');
}
export async function saveOrdering(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const fee = shillingsToMinor(fd.get('delivery_fee')); const min = shillingsToMinor(fd.get('min_order'));
  if (fee === null || min === null) return fail('Enter fees in whole shillings, for example 150.');
  const pickup = fd.get('pickup') === 'on'; const delivery = fd.get('delivery') === 'on';
  if (!pickup && !delivery) return fail('Turn on pickup, delivery, or both.');
  const tenant = await getTenant();
  const { error } = await (await createClient()).from('tenants').update({ delivery_fee_minor: fee, min_order_minor: min, pickup_enabled: pickup, delivery_enabled: delivery }).eq('id', tenant.id);
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/', 'layout'); return ok('Saved.');
}
export async function saveSeo(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const title = String(fd.get('seo_title') ?? '').trim().slice(0, 70); const desc = String(fd.get('seo_description') ?? '').trim().slice(0, 160);
  const tenant = await getTenant();
  const { error } = await (await createClient()).from('tenants').update({ seo_title: title || null, seo_description: desc || null }).eq('id', tenant.id);
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/', 'layout'); return ok('Saved.');
}
export async function saveHours(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const hours: Record<string, { open: string; close: string } | null> = {};
  for (const d of days) {
    if (fd.get(`${d}_closed`) === 'on') { hours[d] = null; continue; }
    const open = String(fd.get(`${d}_open`) ?? ''); const close = String(fd.get(`${d}_close`) ?? '');
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) return fail('Enter opening and closing times for each open day.');
    hours[d] = { open, close };
  }
  const tenant = await getTenant();
  const { error } = await (await createClient()).from('tenants').update({ opening_hours: hours }).eq('id', tenant.id);
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/', 'layout'); return ok('Opening hours saved.');
}
export async function saveTheme(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (fd.get('reset') === '1') {
    const tenant = await getTenant();
    const { error } = await (await createClient()).from('tenant_themes').upsert({ tenant_id: tenant.id, overrides: {} });
    if (error) return fail(friendlyError(error.message));
    revalidatePath('/', 'layout'); return ok('Branding reset to the default look.');
  }
  const colors: Record<string, string> = {};
  for (const k of OVERRIDABLE_COLORS) { const v = String(fd.get(`color_${k}`) ?? ''); if (/^#[0-9a-fA-F]{6}$/.test(v)) colors[k] = v; }
  const fonts = { display: String(fd.get('font_display')), body: String(fd.get('font_body')) };
  const parsed = overridesSchema.safeParse({ colors, fonts });
  if (!parsed.success || !FONT_KEYS.includes(fonts.display as never) || !FONT_KEYS.includes(fonts.body as never)) return fail('Choose valid colours and fonts.');
  // resolveTheme silently falls back on bad contrast, so validate the raw pairs here and tell the user.
  const merged = { ...resolveTheme({}).colors, ...(parsed.data.colors ?? {}) };
  const direct = checkContrast(merged as ReturnType<typeof resolveTheme>['colors']);
  if (direct.length > 0) return fail(`${direct.join('. ')}. Pick a lighter or darker colour.`);
  const tenant = await getTenant();
  const { error } = await (await createClient()).from('tenant_themes').upsert({ tenant_id: tenant.id, overrides: parsed.data });
  if (error) return fail(/row-level security/i.test(error.message) ? 'Custom branding is not included in your plan.' : friendlyError(error.message));
  revalidatePath('/', 'layout'); return ok('Branding saved.');
}

// ---------- notifications + payout account ----------
export async function saveNotificationSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const tenant = await getTenant();
  const phone = String(fd.get('kitchen_alert_phone') ?? '').trim();
  const { error } = await (await createClient()).from('tenant_notification_settings').upsert({
    tenant_id: tenant.id, customer_email: fd.get('customer_email') === 'on', customer_sms: fd.get('customer_sms') === 'on',
    kitchen_email: fd.get('kitchen_email') === 'on', kitchen_sms: fd.get('kitchen_sms') === 'on', kitchen_alert_phone: phone || null,
  });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/settings'); return ok('Notification settings saved.');
}

export async function requestPayoutAccount(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = String(fd.get('account_name') ?? '').trim();
  if (name.length < 2) return fail('Enter the name registered on the M-Pesa number.');
  const tenant = await getTenant();
  const { error } = await (await createClient()).rpc('request_payout_account', { p_tenant: tenant.id, p_msisdn: String(fd.get('msisdn') ?? ''), p_name: name });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/settings');
  return ok('Request sent. The platform team will review it before payouts go to this number.');
}
