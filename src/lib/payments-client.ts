import { createClient } from '@/lib/supabase/client';

export interface PayResult { ok: boolean; message: string; /** Flutterwave hosted payment page, when one was created. */ link?: string }

/** Starts a Flutterwave hosted checkout (M-Pesa or card) with the customer's JWT. A new idempotency key = a deliberate new attempt. */
export async function startPayment(orderId: string, phone: string): Promise<PayResult> {
  const { data, error } = await createClient().functions.invoke('fw-checkout-init', {
    body: { order_id: orderId, phone, idempotency_key: crypto.randomUUID() },
  });
  if (!error && data?.ok && data.link) return { ok: true, message: data.message ?? 'Opening the secure payment page.', link: String(data.link) };
  let message = 'We could not start the payment. Try again.';
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    const body = ctx ? await ctx.json() : data;
    if (body?.message) message = String(body.message);
  } catch { /* keep default */ }
  return { ok: false, message };
}

/** Asks the server to confirm this order's payment with Flutterwave (covers a slow or missing webhook). */
export async function verifyPayment(orderId: string): Promise<void> {
  await createClient().functions.invoke('fw-verify', { body: { order_id: orderId } });
}
