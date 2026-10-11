// Public endpoint for Flutterwave webhooks (verify_jwt = false; authenticated by the secret hash).
//   charge.completed   -> confirm the charge WITH Flutterwave, then record success/failure (idempotent).
//   transfer.completed -> finish or fail a kitchen payout.
// Anything we cannot or need not handle is answered 200 so Flutterwave stops retrying; transient errors answer 500 so it retries.
import { json, serviceClient } from '../_shared/clients.ts';
import { verifyTransaction, verifyWebhook } from '../_shared/flutterwave.ts';
import { isOrderTxRef, parseTransferEvent } from '../_shared/flutterwave-utils.ts';
import { settleCharge } from '../_shared/flutterwave-settle.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const raw = await req.text();
  if (!(await verifyWebhook(req, raw))) return json({ error: 'forbidden' }, 401);

  let event: { event?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(raw); } catch { return json({ ok: true, note: 'ignored: invalid json' }); }
  const svc = serviceClient();

  try {
    if (event.event === 'charge.completed') {
      const txRef = String(event.data?.tx_ref ?? '');
      const txId = event.data?.id;
      if (!isOrderTxRef(txRef) || !txId) return json({ ok: true, note: 'ignored: not an order payment' });  // e.g. subscription billing

      const { data: pay } = await svc.from('payments').select('checkout_request_id, currency, status').eq('checkout_request_id', txRef).maybeSingle();
      if (!pay) return json({ ok: true, note: 'ignored: unknown tx_ref' });
      if (pay.status === 'SUCCEEDED') return json({ ok: true, note: 'already recorded' });

      // Never trust the webhook body: ask Flutterwave what really happened.
      const v = await verifyTransaction(String(txId));
      if (!v.ok || !v.data) { console.error('verify failed', txRef, v.message); return json({ error: 'verify_unavailable' }, 500); }
      const outcome = await settleCharge(svc, pay as { checkout_request_id: string; currency: string }, v.data);
      return json({ ok: true, outcome });
    }

    if (event.event === 'transfer.completed') {
      const t = parseTransferEvent(event.data);
      if (!t) return json({ ok: true, note: 'ignored: bad transfer payload' });
      if (t.status === 'SUCCESSFUL') {
        const { error } = await svc.rpc('complete_b2c_payout', { p_originator: t.reference, p_receipt: t.id || t.reference, p_amount_minor: t.amountMinor, p_raw: event });
        if (error && !/payout_not_found/.test(error.message)) { console.error('complete payout', error.message); return json({ error: 'processing_failed' }, 500); }
      } else if (t.status === 'FAILED') {
        const { error } = await svc.rpc('fail_b2c_payout', { p_originator: t.reference, p_code: null, p_desc: t.message || 'Transfer failed', p_raw: event });
        if (error) { console.error('fail payout', error.message); return json({ error: 'processing_failed' }, 500); }
      }
      return json({ ok: true });
    }
    return json({ ok: true, note: `ignored: ${event.event ?? 'no event'}` });
  } catch (e) {
    console.error('fw-webhook error:', (e as Error).message);
    return json({ error: 'processing_failed' }, 500);
  }
});
