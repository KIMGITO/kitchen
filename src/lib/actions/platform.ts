'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from './result';
import { describeError } from '@/lib/errors';

/** Registers a kitchen for the signed-in user. Status starts as pending_approval. */
export async function registerKitchen(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = z.object({ slug: z.string().trim().toLowerCase(), name: z.string().trim().min(2).max(80) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail('Enter a kitchen name and a web address.');
  const { data, error } = await (await createClient()).rpc('register_kitchen', { p_slug: p.data.slug, p_name: p.data.name });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return fail('That web address is taken. Try another.');
    // Unknown failures (missing table/RPC/migration) surface their real message so
    // the operator sees the cause on the page rather than a generic dead end.
    return fail(describeError(error.message, 'We could not create your kitchen. Try again.'));
  }
  return ok('Kitchen created.', { id: String(data), slug: p.data.slug });
}

/**
 * First-run setup: the signed-in user claims ownership of the platform (role `owner`).
 * The database closes the claim permanently once any `platform_staff` row exists.
 * Optional guard: when PLATFORM_OWNER_EMAIL is set, only that email may claim.
 */
export async function claimPlatformOwnership(_: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return fail('Sign in first, then claim ownership.');
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail && (user.email ?? '').toLowerCase() !== ownerEmail) {
    return fail('Only the configured platform owner email can claim ownership. Set PLATFORM_OWNER_EMAIL to this email, or unset it to allow the first account.');
  }
  const { error } = await supabase.rpc('claim_platform_ownership');
  if (error) {
    const m = error.message ?? '';
    if (/claim_platform_ownership|platform_setup_required/.test(m)) {
      return fail('Database migration 017_platform_setup.sql is not applied yet. Run supabase db push (or paste the file into the Supabase SQL Editor) and reload.');
    }
    return fail(describeError(m, 'We could not claim ownership. Try again.'));
  }
  return ok('You are now the platform owner.', { email: user.email ?? '' });
}
