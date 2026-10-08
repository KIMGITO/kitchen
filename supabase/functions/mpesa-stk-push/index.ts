// POST { order_id, phone, idempotency_key }  with the customer's JWT.
// 1. Verify the order is the caller's (via RLS). 2. begin_payment (atomic, idempotent). 3. Daraja STK push.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { stkPush } from '../_shared/daraja.ts';
import { minorToWholeShillings, normalizeMsisdn } from '../_shared/mpesa-utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'not_authenticated' }, 401, corsHeaders);

  let input: { order_id?: string; phone?: string; idempotency_key?: string };
  try { input = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, corsHeaders); }
  const { order_id, phone, idempotency_key } = input;
  if (!order_id || !phone || !idempotency_key || idempotency_key.length < 8 || idempotency_key.length > 80) {
    return json({ error: 'invalid_request' }, 400, corsHeaders);
  }
  const msisdn = normalizeMsisdn(phone);
  if (!msisdn) return json({ error: 'invalid_phone', message: 'Enter a Safaricom number like 0712 345 678.' }, 400, corsHeaders);

  // Who is calling? Never trust a user id from the body.
  const caller = userClient(auth);
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'not_authenticated' }, 401, corsHeaders);

  // RLS: the caller can only see their own orders.
  const { data: order } = await caller.from('orders').select('id').eq('id', order_id).maybeSingle();
  if (!order) return json({ error: 'order_not_found' }, 404, corsHeaders);

  const svc = serviceClient();
  const { data: begun, error: beginErr } = await svc.rpc('begin_payment', {
    p_order: order_id, p_user: userData.user.id, p_msisdn: msisdn, p_idempotency_key: idempotency_key,
  });
  if (beginErr || !begun?.[0]) {
    const code = (beginErr?.message ?? '').split(':')[0];
    const friendly: Record<string, string> = {
      payment_in_progress: 'A payment prompt is already open on your phone. Finish it or wait a minute and try again.',
      too_many_attempts: 'Too many payment attempts for this order. Place a new order.',
      order_not_payable: 'This order can no longer be paid.',
      amount_not_whole_shillings: 'This order total cannot be paid with M-Pesa.',
      rate_limited: 'Too many payment attempts. Wait a few minutes and try again.',
    };
    return json({ error: code || 'payment_start_failed', message: friendly[code] ?? 'We could not start the payment.' }, 409, corsHeaders);
  }
  const pay = begun[0] as { pay_id: string; pay_amount_minor: number; pay_order_number: number };

  const shillings = minorToWholeShillings(Number(pay.pay_amount_minor));
  if (!shillings) {
    await svc.rpc('fail_payment_initiation', { p_payment: pay.pay_id, p_desc: 'amount_not_whole_shillings' });
    return json({ error: 'amount_not_whole_shillings' }, 409, corsHeaders);
  }

  const base = Deno.env.get('MPESA_CALLBACK_BASE_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  const callbackUrl = `${base}/mpesa-callback?s=${encodeURIComponent(Deno.env.get('MPESA_CALLBACK_SECRET') ?? '')}`;

  try {
    const { httpOk, json: resp } = await stkPush({
      amountShillings: shillings, msisdn, accountReference: `ORD${pay.pay_order_number}`,
      description: 'Food order', callbackUrl,
    });
    if (!httpOk || resp.ResponseCode !== '0' || !resp.CheckoutRequestID) {
      await svc.rpc('fail_payment_initiation', { p_payment: pay.pay_id, p_desc: String(resp.errorMessage ?? resp.ResponseDescription ?? 'stk_rejected') });
      return json({ error: 'stk_rejected', message: 'M-Pesa could not send the prompt. Check the number and try again.' }, 502, corsHeaders);
    }
    await svc.rpc('attach_stk_response', {
      p_payment: pay.pay_id, p_merchant_request_id: resp.MerchantRequestID, p_checkout_request_id: resp.CheckoutRequestID,
    });
    return json({ ok: true, payment_id: pay.pay_id, message: 'Check your phone and enter your M-Pesa PIN.' }, 200, corsHeaders);
  } catch (e) {
    await svc.rpc('fail_payment_initiation', { p_payment: pay.pay_id, p_desc: `exception: ${(e as Error).message}` });
    return json({ error: 'stk_unavailable', message: 'M-Pesa is not reachable right now. Try again shortly.' }, 502, corsHeaders);
  }
});
