// Scheduled (every minute). Needs the service-role key as the bearer token (see README: Scheduling).
//  - STK payments with no callback after 90s: ask Daraja for the real result.
//  - Close the payment window on unpaid orders (30 min).
//  - Prune old rate-limit counters.
import { json, serviceClient } from '../_shared/clients.ts';
import { stkQuery } from '../_shared/daraja.ts';
import { failureStatus } from '../_shared/mpesa-utils.ts';

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  if (req.headers.get('Authorization') !== expected) return json({ error: 'forbidden' }, 403);

  const svc = serviceClient();
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { data: stuck } = await svc.from('payments').select('id, checkout_request_id, amount_minor, created_at')
    .eq('status', 'STK_SENT').not('checkout_request_id', 'is', null).lt('created_at', cutoff).limit(25);

  let resolved = 0;
  for (const p of stuck ?? []) {
    try {
      const { json: q } = await stkQuery(p.checkout_request_id!);
      const code = q?.ResultCode === undefined ? NaN : Number(q.ResultCode);
      if (code === 0) {
        // The callback never arrived but Daraja confirms success for a CheckoutRequestID WE created.
        // Query responses carry no receipt/amount: record the payment with receipt_pending (no fake receipt).
        // A late genuine callback fills the receipt in automatically; otherwise an admin enters it from the M-Pesa statement.
        await svc.rpc('record_payment_success', {
          p_checkout_request_id: p.checkout_request_id, p_receipt: null,
          p_amount_minor: p.amount_minor, p_raw: { source: 'stkpushquery', response: q },
        });
        resolved++;
      } else if (Number.isFinite(code)) {
        await svc.rpc('record_payment_failure', {
          p_checkout_request_id: p.checkout_request_id, p_status: failureStatus(code),
          p_result_code: code, p_result_desc: String(q.ResultDesc ?? 'Payment failed'), p_raw: q,
        });
        resolved++;
      } else if (Date.now() - new Date(p.created_at).getTime() > 5 * 60_000) {
        await svc.rpc('record_payment_failure', {
          p_checkout_request_id: p.checkout_request_id, p_status: 'TIMEOUT', p_result_code: 1037,
          p_result_desc: 'No response from customer', p_raw: q ?? {},
        });
        resolved++;
      }
    } catch (e) { console.error(`reconcile ${p.id}:`, (e as Error).message); }
  }
  const { data: expired } = await svc.rpc('expire_stale_orders', { p_minutes: 30 });
  const { data: pruned } = await svc.rpc('prune_rate_limits');
  return json({ checked: stuck?.length ?? 0, resolved, expired_orders: expired ?? 0, pruned_rate_limits: pruned ?? 0 });
});
