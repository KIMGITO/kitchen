// POST { order_id } or { payment_id } with a platform admin's JWT. Refunds a Flutterwave payment through Flutterwave.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { refundTransaction } from '../_shared/flutterwave.ts';

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
      receipt_missing: 'This payment has no reference yet. Refund it manually.', refund_in_progress: 'A refund for this payment is already in progress or done.',
      nothing_to_refund: 'Nothing to refund.',
    };
    return json({ error: code || 'failed', message: msg[code] ?? 'Could not start the refund.' }, 409, corsHeaders);
  }
  const r = begun[0] as { refund_id: string; amount_minor: number };
  const { data: refund } = await svc.from('refunds').select('payment_id').eq('id', r.refund_id).maybeSingle();
  const { data: pay } = await svc.from('payments').select('provider, provider_tx_id').eq('id', refund?.payment_id).maybeSingle();
  if (pay?.provider !== 'flutterwave' || !pay.provider_tx_id) {
    await svc.rpc('fail_refund_initiation', { p_refund: r.refund_id, p_desc: 'not_a_flutterwave_payment' });
    return json({ error: 'wrong_provider', message: 'This payment was not made through Flutterwave. Use the M-Pesa refund instead, or refund manually.' }, 409, corsHeaders);
  }
  await svc.rpc('mark_refund_provider', { p_refund: r.refund_id, p_method: 'flutterwave' });

  try {
    const fw = await refundTransaction(pay.provider_tx_id, Number(r.amount_minor));
    if (!fw.ok) {
      await svc.rpc('fail_refund_initiation', { p_refund: r.refund_id, p_desc: fw.message });
      return json({ error: 'refund_rejected', message: `Flutterwave rejected the refund: ${fw.message}. You can refund manually instead.` }, 502, corsHeaders);
    }
    const ref = `fwr_${fw.data?.id ?? r.refund_id}`;
    await svc.rpc('attach_reversal_response', { p_refund: r.refund_id, p_originator: ref, p_conversation: String(fw.data?.id ?? '') });
    // Flutterwave refunds can finish instantly or take a while. When it reports completed we finish now; otherwise the
    // refund stays "processing" and an admin confirms it from the Flutterwave dashboard (same as a pending reversal).
    if (String(fw.data?.status ?? '').toLowerCase() === 'completed') {
      await svc.rpc('complete_refund', { p_originator: ref, p_reference: ref, p_raw: { source: 'flutterwave', response: fw.data } });
      return json({ ok: true, message: 'Refund completed.' }, 200, corsHeaders);
    }
    return json({ ok: true, message: 'Refund requested. Flutterwave is processing it; confirm it in the dashboard when it completes.' }, 200, corsHeaders);
  } catch (e) {
    console.error('refund ambiguous failure:', (e as Error).message);
    return json({ error: 'refund_unknown', message: 'We could not confirm Flutterwave received the refund. Check the Flutterwave dashboard before trying again.' }, 502, corsHeaders);
  }
});
