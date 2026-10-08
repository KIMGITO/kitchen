'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant/get-tenant';
import { fail, ok, type ActionResult } from './result';
import { friendlyError } from '@/lib/errors';

const schema = z.object({
  title: z.string().trim().min(2).max(80),
  subtitle: z.string().trim().max(140).optional(),
  image_url: z.string().url().nullable(),
  product_id: z.string().uuid().nullable(),
  discount: z.number().int().min(1).max(100).nullable(),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function savePromotion(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const discountRaw = String(fd.get('discount') ?? '').trim();
  const parsed = schema.safeParse({
    title: fd.get('title'), subtitle: String(fd.get('subtitle') ?? '') || undefined,
    image_url: String(fd.get('image_url') ?? '') || null, product_id: String(fd.get('product_id') ?? '') || null,
    discount: discountRaw ? Number(discountRaw) : null, ends_on: String(fd.get('ends_on') ?? '') || null,
  });
  if (!parsed.success) return fail('Check the title (2+ characters), the discount (1 to 100) and the end date.');
  const d = parsed.data;
  // End of the chosen day in Nairobi time.
  const endsAt = d.ends_on ? new Date(`${d.ends_on}T23:59:59+03:00`) : null;
  if (endsAt && endsAt.getTime() <= Date.now()) return fail('Choose an end date in the future.');

  const tenant = await getTenant();
  const { error } = await (await createClient()).from('promotions').insert({
    tenant_id: tenant.id, title: d.title, subtitle: d.subtitle ?? null, image_url: d.image_url, product_id: d.product_id,
    discount_percent: d.discount, ends_at: endsAt?.toISOString() ?? null, is_active: true,
  });
  if (error) {
    if (/row-level security/i.test(error.message)) return fail('Promotions are not included in your plan, or you lack permission.');
    return fail(friendlyError(error.message));
  }
  revalidatePath('/dashboard/promotions'); revalidatePath('/');
  return ok('Promotion published. It shows on your storefront now.');
}

export async function setPromotionActive(fd: FormData): Promise<void> {
  const tenant = await getTenant();
  await (await createClient()).from('promotions').update({ is_active: fd.get('active') === 'true' }).eq('id', String(fd.get('id'))).eq('tenant_id', tenant.id);
  revalidatePath('/dashboard/promotions'); revalidatePath('/');
}

export async function deletePromotion(fd: FormData): Promise<void> {
  const tenant = await getTenant();
  await (await createClient()).from('promotions').delete().eq('id', String(fd.get('id'))).eq('tenant_id', tenant.id);
  revalidatePath('/dashboard/promotions'); revalidatePath('/');
}
