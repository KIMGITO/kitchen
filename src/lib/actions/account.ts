'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { getKitchenCustomer } from '@/lib/auth/session';
import { fail, ok, type ActionResult } from './result';
import { friendlyError } from '@/lib/errors';
import { normalizeKePhone, PHONE_ERROR } from '@/lib/phone';

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
});

export async function updateProfile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({ full_name: fd.get('full_name'), phone: fd.get('phone') ?? undefined });
  if (!parsed.success) return fail('Enter your name (at least 2 letters).');
  const phone = normalizeKePhone(parsed.data.phone);
  if (!phone) return fail(PHONE_ERROR);
  const customer = await getKitchenCustomer();
  if (!customer) return fail(friendlyError('no_customer_account'));
  const supabase = await createClient();
  const { error } = await supabase.from('kitchen_customers')
    .update({ full_name: parsed.data.full_name, phone, marketing_opt_in: fd.get('marketing') === 'on' })
    .eq('id', customer.id);
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/account');
  return ok('Profile saved.');
}

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(), address_line: z.string().trim().min(5).max(200),
  area: z.string().trim().max(80).optional(), instructions: z.string().trim().max(200).optional(),
});

export async function addAddress(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = addressSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail('Enter the street or building (at least 5 characters).');
  const [tenant, customer] = await Promise.all([getTenant(), getKitchenCustomer()]);
  if (!customer) return fail(friendlyError('no_customer_account'));
  const supabase = await createClient();
  const { error } = await supabase.from('customer_addresses').insert({
    tenant_id: tenant.id, kitchen_customer_id: customer.id, ...parsed.data,
    label: parsed.data.label || null, area: parsed.data.area || null, instructions: parsed.data.instructions || null,
  });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/account');
  return ok('Address added.');
}

export async function deleteAddress(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '');
  const supabase = await createClient();
  await supabase.from('customer_addresses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/account');
}
