// POST { payout_id } with a platform admin's JWT. Sends the payout to the kitchen's APPROVED payout number via Daraja B2C.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { b2cPayment } from '../_shared/daraja.ts';
import { minorToWholeShillings } from '../_shared/mpesa-utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (req.method !== 'POST' || !auth) return json({ error: 'forbidden' }, 403, corsHeaders);
  const { payout_id } = await req.json().catch(() => ({}));
  if (!payout_id) return json({ error: 'invalid_request' }, 400, corsHeaders);

  const { data: u } = await userClient(auth).auth.getUser();
  if (!u.user) return json({ error: 'not_authenticated' }, 401, corsHeaders);

  const svc = serviceClient();
  // begin_b2c_payout verifies the caller is a platform owner/admin, then marks the payout `processing` atomically.
  const { data: begun, error } = await svc.rpc('begin_b2c_payout', { p_payout: payout_id, p_admin: u.user.id });
  if (error || !begun?.[0]) {
    const code = (error?.message ?? '').split(':')[0];
    const msg: Record<string, string> = {
      permission_denied: 'Only platform owners and admins can send payouts.', payout_not_pending: 'This payout was already sent or is no longer pending.',
      no_payout_account: 'This kitchen has no approved payout number.',
    };
    return json({ error: code || 'failed', message: msg[code] ?? 'Could not start the payout.' }, 409, corsHeaders);
  }
  const p = begun[0] as { originator_id: string; msisdn: string; amount_minor: number };
  const shillings = minorToWholeShillings(Number(p.amount_minor));
  if (!shillings) { await svc.rpc('fail_b2c_initiation', { p_payout: payout_id, p_desc: 'amount_not_whole_shillings' }); return json({ error: 'amount_not_whole_shillings' }, 409, corsHeaders); }

  try {
    const { httpOk, json: resp } = await b2cPayment({ originatorId: p.originator_id, msisdn: p.msisdn, amountShillings: shillings, remarks: 'Kitchen payout' });
    if (!httpOk || String(resp.ResponseCode) !== '0') {
      // Definitive rejection from Daraja: nothing was sent.
      await svc.rpc('fail_b2c_initiation', { p_payout: payout_id, p_desc: String(resp.errorMessage ?? resp.ResponseDescription ?? 'b2c_rejected') });
      return json({ error: 'b2c_rejected', message: String(resp.errorMessage ?? resp.ResponseDescription ?? 'M-Pesa rejected the payout request.') }, 502, corsHeaders);
    }
    if (resp.ConversationID) await svc.rpc('attach_b2c_response', { p_payout: payout_id, p_conversation_id: String(resp.ConversationID) });
    return json({ ok: true, message: 'Payout sent to M-Pesa. It completes when Safaricom confirms.' }, 200, corsHeaders);
  } catch (e) {
    // Ambiguous (network error after sending?): leave `processing` and do NOT retry automatically, to avoid paying twice.
    console.error('b2c ambiguous failure:', (e as Error).message);
    return json({ error: 'b2c_unknown', message: 'We could not confirm that M-Pesa received the request. Check M-Pesa before resolving this payout manually.' }, 502, corsHeaders);
  }
});
