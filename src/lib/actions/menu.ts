'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { fail, ok, type ActionResult } from './result';
import { friendlyError } from '@/lib/errors';
import { shillingsToMinor, slugify } from '@/lib/money-input';

const uuid = z.string().uuid();
const intOrNull = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Number(s); return Number.isInteger(n) && n > 0 ? n : NaN; };

const productSchema = z.object({
  id: uuid, name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional(),
  category_id: uuid.nullable(), image_url: z.string().url().nullable(),
});

export async function saveProduct(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const price = shillingsToMinor(fd.get('price'));
  if (price === null) return fail('Enter the price in whole shillings, for example 450.');
  const prep = intOrNull(fd.get('prep_minutes')); const cal = intOrNull(fd.get('calories'));
  if (Number.isNaN(prep) || Number.isNaN(cal)) return fail('Preparation time and calories must be whole numbers.');
  const parsed = productSchema.safeParse({
    id: fd.get('id'), name: fd.get('name'), description: fd.get('description') || undefined,
    category_id: fd.get('category_id') || null, image_url: fd.get('image_url') || null,
  });
  if (!parsed.success) return fail('Check the name and category, then try again.');
  const tenant = await getTenant();
  const supabase = await createClient();
  const slug = slugify(String(fd.get('slug') || parsed.data.name)) || 'item';

  const { data: existing } = await supabase.from('products').select('id').eq('id', parsed.data.id).eq('tenant_id', tenant.id).maybeSingle();
  const row = { name: parsed.data.name, slug, description: parsed.data.description ?? null, category_id: parsed.data.category_id,
    image_url: parsed.data.image_url, price_minor: price, prep_minutes: prep, calories: cal, is_available: fd.get('is_available') === 'on' };
  const { error } = existing
    ? await supabase.from('products').update(row).eq('id', parsed.data.id).eq('tenant_id', tenant.id)
    : await supabase.from('products').insert({ ...row, id: parsed.data.id, tenant_id: tenant.id });
  if (error) {
    if (!existing && /row-level security/i.test(error.message)) return fail('You cannot add more products on your current plan, or you lack permission.');
    return fail(friendlyError(error.message));
  }
  revalidatePath('/dashboard/menu');
  return ok(existing ? 'Item saved.' : 'Item created. Open it from the menu list to add options.', { id: parsed.data.id });
}

export async function setAvailability(fd: FormData): Promise<void> {
  const tenant = await getTenant();
  const supabase = await createClient();
  await supabase.from('products').update({ is_available: fd.get('available') === 'true' }).eq('id', String(fd.get('id'))).eq('tenant_id', tenant.id);
  revalidatePath('/dashboard/menu');
}

export async function deleteProduct(fd: FormData): Promise<void> {
  const tenant = await getTenant();
  const supabase = await createClient();
  await supabase.from('products').update({ deleted_at: new Date().toISOString(), is_available: false }).eq('id', String(fd.get('id'))).eq('tenant_id', tenant.id);
  revalidatePath('/dashboard/menu');
}

export async function saveCategory(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = String(fd.get('name') ?? '').trim();
  if (!name) return fail('Enter a category name.');
  const tenant = await getTenant(); const supabase = await createClient();
  const { error } = await supabase.from('categories').insert({
    tenant_id: tenant.id, name, slug: slugify(name) || 'category', sort_order: Number(fd.get('sort_order') ?? 0) || 0,
  });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/menu/categories');
  return ok('Category added.');
}

export async function deleteCategory(fd: FormData): Promise<void> {
  const tenant = await getTenant(); const supabase = await createClient();
  await supabase.from('categories').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', String(fd.get('id'))).eq('tenant_id', tenant.id);
  revalidatePath('/dashboard/menu/categories');
}

export async function addOptionGroup(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const productId = uuid.safeParse(fd.get('product_id')); const name = String(fd.get('name') ?? '').trim();
  const min = Number(fd.get('min_select') ?? 0); const max = Number(fd.get('max_select') ?? 1);
  if (!productId.success || !name) return fail('Enter a name for the option group.');
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max < min) return fail('Maximum choices must be at least 1 and not less than the minimum.');
  const tenant = await getTenant(); const supabase = await createClient();
  const { error } = await supabase.from('product_option_groups').insert({ tenant_id: tenant.id, product_id: productId.data, name, min_select: min, max_select: max });
  if (error) return fail(friendlyError(error.message));
  revalidatePath(`/dashboard/menu/${productId.data}`);
  return ok('Option group added.');
}

export async function addOption(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const groupId = uuid.safeParse(fd.get('group_id')); const name = String(fd.get('name') ?? '').trim();
  const delta = shillingsToMinor(fd.get('price') || '0');
  if (!groupId.success || !name || delta === null) return fail('Enter an option name and an extra price in whole shillings (0 if free).');
  const tenant = await getTenant(); const supabase = await createClient();
  const { error } = await supabase.from('product_options').insert({ tenant_id: tenant.id, group_id: groupId.data, name, price_delta_minor: delta });
  if (error) return fail(friendlyError(error.message));
  revalidatePath('/dashboard/menu', 'layout');
  return ok('Option added.');
}

export async function deleteOptionRow(fd: FormData): Promise<void> {
  const tenant = await getTenant(); const supabase = await createClient();
  const table = fd.get('kind') === 'group' ? 'product_option_groups' : 'product_options';
  await supabase.from(table).delete().eq('id', String(fd.get('id'))).eq('tenant_id', tenant.id);
  revalidatePath('/dashboard/menu', 'layout');
}
