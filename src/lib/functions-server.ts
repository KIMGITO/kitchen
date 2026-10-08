import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/actions/result';

/** Calls an Edge Function as the signed-in user (their JWT), returning a friendly ActionResult. */
export async function invokeAsUser(name: string, body: Record<string, unknown>): Promise<ActionResult> {
  const { data, error } = await (await createClient()).functions.invoke(name, { body });
  if (!error && data?.ok) return ok(data.message);
  let message = 'Something went wrong. Try again.';
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    const b = ctx ? await ctx.json() : data;
    if (b?.message) message = String(b.message);
  } catch { /* keep default */ }
  return fail(message);
}
