// Scheduled (every minute). Needs the service-role key as the bearer token (see README: Scheduling).
//  - STK payments with no callback after 90s: ask Daraja for the real result.
//  - Flutterwave hosted checkouts with no webhook after 3 min: ask Flutterwave by our own reference; close abandoned ones at 30 min.
//  - Payments orphaned in INITIATED (the function died before attaching a response): fail them so the order can be retried.
//  - Flutterwave payouts stuck in `processing` (the transfer.completed webhook never arrived): re-ask Flutterwave by transfer id and
//    complete/fail idempotently. We NEVER re-send a transfer here (that risks paying twice) - only a definite Flutterwave verdict moves it.
//  - Close the payment window on unpaid orders (30 min).
//  - Prune old rate-limit counters.
import { json, serviceClient } from '../_shared/clients.ts';
import { stkQuery } from '../_shared/daraja.ts';
import { failureStatus, timingSafeEqual } from '../_shared/mpesa-utils.ts';
import { verifyByReference, getTransfer } from '../_shared/flutterwave.ts';
import { judgeTransferStatus, toMinor } from '../_shared/flutterwave-utils.ts';
import { settleCharge } from '../_shared/flutterwave-settle.ts';

const serviceKey = () => `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
/** Constant-time bearer check: the scheduler secret must not leak through a comparison side-channel. */
const isScheduler = (req: Request) => timingSafeEqual(req.headers.get('Authorization') ?? '', serviceKey());

Deno.serve(async (req) => {
  if (!isScheduler(req)) return json({ error: 'forbidden' }, 403);

  const svc = serviceClient();
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { data: stuck } = await svc.from('payments').select('id, checkout_request_id, amount_minor, created_at')
    .eq('provider', 'mpesa').eq('status', 'STK_SENT').not('checkout_request_id', 'is', null).lt('created_at', cutoff).limit(25);

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
  // Flutterwave hosted checkouts: if the webhook never arrived, ask Flutterwave by our own reference.
  const fwCutoff = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data: fwStuck } = await svc.from('payments').select('id, checkout_request_id, currency, created_at')
    .eq('provider', 'flutterwave').eq('status', 'STK_SENT').not('checkout_request_id', 'is', null).lt('created_at', fwCutoff).limit(25);
  for (const p of fwStuck ?? []) {
    try {
      const v = await verifyByReference(p.checkout_request_id!);
      if (v.ok && v.data) {
        const outcome = await settleCharge(svc, p as { checkout_request_id: string; currency: string }, v.data);
        if (outcome === 'success' || outcome === 'failed') resolved++;
      } else if (Date.now() - new Date(p.created_at).getTime() > 30 * 60_000) {
        // Never completed on Flutterwave's side: close it so the customer can start again.
        await svc.rpc('record_payment_failure', { p_checkout_request_id: p.checkout_request_id, p_status: 'TIMEOUT', p_result_code: null, p_result_desc: 'Checkout not completed', p_raw: {} });
        resolved++;
      }
    } catch (e) { console.error(`reconcile fw ${p.id}:`, (e as Error).message); }
  }
  // Payments orphaned in INITIATED: begin_payment created the row but the function died before it could attach a response
  // (attach_checkout / attach_stk_response), so nothing ever moved it. Such a row blocks begin_payment's one-active-per-order
  // guard for up to 30 minutes. Fail it (the order stays PENDING_PAYMENT, so the customer can simply pay again).
  // 2 minutes is far beyond any healthy initiation (the provider calls time out well before that), so this never races a live send.
  const orphanCutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: orphans } = await svc.from('payments').select('id, created_at')
    .eq('status', 'INITIATED').lt('created_at', orphanCutoff).limit(25);
  let orphaned = 0;
  for (const p of orphans ?? []) {
    try {
      await svc.rpc('fail_payment_initiation', { p_payment: p.id, p_desc: 'abandoned_initiation' });
      orphaned++;
    } catch (e) { console.error(`reconcile orphan ${p.id}:`, (e as Error).message); }
  }
  // Flutterwave payouts stuck in `processing` after an ambiguous (network) failure, or whose transfer.completed webhook never
  // arrived. Ask Flutterwave for the transfer by the id it returned (stored in conversation_id) and complete/fail idempotently.
  // A transfer with no conversation_id can't be looked up - it stays `processing` for an admin to resolve manually (by design).
  const transferCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: stuckTransfers } = await svc.from('payouts').select('id, originator_conversation_id, conversation_id, created_at')
    .eq('provider', 'flutterwave').eq('status', 'processing').not('conversation_id', 'is', null).lt('created_at', transferCutoff).limit(25);
  let transfersChecked = 0;
  for (const t of stuckTransfers ?? []) {
    try {
      const g = await getTransfer(t.conversation_id!);
      if (!g.ok || !g.data) { console.error(`transfer fetch ${t.id}:`, g.message); continue; }
      const status = judgeTransferStatus(g.data.status);
      if (status === 'successful') {
        const amountMinor = g.data.amount === undefined || g.data.amount === null ? null : toMinor(g.data.amount);
        await svc.rpc('complete_b2c_payout', { p_originator: t.originator_conversation_id!, p_receipt: String(g.data.id ?? t.conversation_id), p_amount_minor: amountMinor, p_raw: { source: 'reconcile_transfer', response: g.data } });
        resolved++; transfersChecked++;
      } else if (status === 'failed') {
        await svc.rpc('fail_b2c_payout', { p_originator: t.originator_conversation_id!, p_code: null, p_desc: g.data.complete_message || g.data.narration || 'Transfer failed', p_raw: { source: 'reconcile_transfer', response: g.data } });
        resolved++; transfersChecked++;
      }
      // status === 'pending': still in flight on Flutterwave's side, leave it `processing` for the next run.
    } catch (e) { console.error(`reconcile transfer ${t.id}:`, (e as Error).message); }
  }
  const { data: expired } = await svc.rpc('expire_stale_orders', { p_minutes: 30 });
  const { data: pruned } = await svc.rpc('prune_rate_limits');
  return json({ checked: (stuck?.length ?? 0) + (fwStuck?.length ?? 0) + (orphans?.length ?? 0) + (stuckTransfers?.length ?? 0), resolved, orphaned, transfers_checked: transfersChecked, expired_orders: expired ?? 0, pruned_rate_limits: pruned ?? 0 });
});
