import { createClient } from '@/lib/supabase/client';

export interface PayResult { ok: boolean; message: string }

/** Calls the mpesa-stk-push Edge Function with the customer's JWT. A new idempotency key = a deliberate new attempt. */
export async function requestMpesaPayment(orderId: string, phone: string): Promise<PayResult> {
  const { data, error } = await createClient().functions.invoke('mpesa-stk-push', {
    body: { order_id: orderId, phone, idempotency_key: crypto.randomUUID() },
  });
  if (!error && data?.ok) return { ok: true, message: data.message ?? 'Check your phone and enter your M-Pesa PIN.' };
  let message = 'We could not start the payment. Try again.';
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    const body = ctx ? await ctx.json() : data;
    if (body?.message) message = String(body.message);
  } catch { /* keep default */ }
  return { ok: false, message };
}
