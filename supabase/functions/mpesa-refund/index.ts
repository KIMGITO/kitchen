// POST { order_id } or { payment_id } with a platform admin's JWT. Reverses the customer's M-Pesa payment via Daraja.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { reversal } from '../_shared/daraja.ts';
import { minorToWholeShillings } from '../_shared/mpesa-utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (req.method !== 'POST' || !auth) return json({ error: 'forbidden' }, 403, corsHeaders);
  const { order_id, payment_id } = await req.json().catch(() => ({}));
  if (!order_id && !payment_id) return json({ error: 'invalid_request' }, 400, corsHeaders);

  const { data: u } = await userClient(auth).auth.getUser();
  if (!u.user) return json({ error: 'not_authenticated' }, 401, corsHeaders);

  const svc = serviceClient();
  const { data: begun, error } = await svc.rpc('begin_refund', { p_order: order_id ?? null, p_payment: payment_id ?? null, p_admin: u.user.id });
  if (error || !begun?.[0]) {
    const code = (error?.message ?? '').split(':')[0];
    const msg: Record<string, string> = {
      permission_denied: 'Only platform owners and admins can refund.', order_not_refundable: 'This order cannot be refunded.',
      receipt_missing: 'This payment has no M-Pesa receipt yet. Enter the receipt first, or refund manually.',
      refund_in_progress: 'A refund for this payment is already in progress or done.', nothing_to_refund: 'Nothing to refund.',
    };
    return json({ error: code || 'failed', message: msg[code] ?? 'Could not start the refund.' }, 409, corsHeaders);
  }
  const r = begun[0] as { refund_id: string; receipt: string; amount_minor: number };
  const shillings = minorToWholeShillings(Number(r.amount_minor));
  if (!shillings) { await svc.rpc('fail_refund_initiation', { p_refund: r.refund_id, p_desc: 'amount_not_whole_shillings' }); return json({ error: 'amount_not_whole_shillings' }, 409, corsHeaders); }

  try {
    const { httpOk, json: resp } = await reversal({ receipt: r.receipt, amountShillings: shillings, remarks: 'Order refund' });
    if (!httpOk || String(resp.ResponseCode) !== '0' || !resp.OriginatorConversationID) {
      await svc.rpc('fail_refund_initiation', { p_refund: r.refund_id, p_desc: String(resp.errorMessage ?? resp.ResponseDescription ?? 'reversal_rejected') });
      return json({ error: 'reversal_rejected', message: `M-Pesa rejected the reversal: ${resp.errorMessage ?? resp.ResponseDescription ?? 'unknown reason'}. You can refund manually instead.` }, 502, corsHeaders);
    }
    await svc.rpc('attach_reversal_response', { p_refund: r.refund_id, p_originator: String(resp.OriginatorConversationID), p_conversation: String(resp.ConversationID ?? '') });
    return json({ ok: true, message: 'Reversal requested. The order is marked refunded when M-Pesa confirms.' }, 200, corsHeaders);
  } catch (e) {
    console.error('reversal ambiguous failure:', (e as Error).message);
    return json({ error: 'reversal_unknown', message: 'We could not confirm M-Pesa received the reversal. Check M-Pesa before trying again.' }, 502, corsHeaders);
  }
});
