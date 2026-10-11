// POST { order_id } with the customer's JWT. Asks Flutterwave for the real result of this order's latest checkout and records it.
// Safety net for a delayed or missing webhook (and what makes local development work without one). Idempotent.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { verifyByReference } from '../_shared/flutterwave.ts';
import { settleCharge } from '../_shared/flutterwave-settle.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (req.method !== 'POST' || !auth) return json({ error: 'forbidden' }, 403, corsHeaders);
  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return json({ error: 'invalid_request' }, 400, corsHeaders);

  const caller = userClient(auth);
  const { data: order } = await caller.from('orders').select('id').eq('id', order_id).maybeSingle();   // RLS: own orders only
  if (!order) return json({ error: 'order_not_found' }, 404, corsHeaders);

  const svc = serviceClient();
  const { data: pay } = await svc.from('payments').select('checkout_request_id, currency, status, provider')
    .eq('order_id', order_id).eq('provider', 'flutterwave').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!pay?.checkout_request_id) return json({ ok: true, status: 'none' }, 200, corsHeaders);
  if (pay.status !== 'STK_SENT' && pay.status !== 'INITIATED') return json({ ok: true, status: pay.status }, 200, corsHeaders);

  try {
    const v = await verifyByReference(pay.checkout_request_id);
    if (!v.ok || !v.data) return json({ ok: true, status: 'pending' }, 200, corsHeaders);   // not attempted yet / not found
    const outcome = await settleCharge(svc, pay as { checkout_request_id: string; currency: string }, v.data);
    return json({ ok: true, status: outcome }, 200, corsHeaders);
  } catch (e) {
    console.error('fw-verify:', (e as Error).message);
    return json({ ok: true, status: 'pending' }, 200, corsHeaders);
  }
});
