// Public endpoint called by Safaricom (deploy with --no-verify-jwt; see supabase/config.toml).
// Safaricom does not sign callbacks, so we defend in depth:
//   1. shared secret in the URL we gave Daraja  2. checkoutRequestId must match a payment we created
//   3. amount must equal the order total        4. replays are no-ops (unique event key + idempotent RPC)
// Always answer 200 {ResultCode:0} so Safaricom stops retrying; problems are logged, not leaked.
import { json, serviceClient } from '../_shared/clients.ts';
import { parseStkCallback, timingSafeEqual } from '../_shared/mpesa-utils.ts';

const ACK = { ResultCode: 0, ResultDesc: 'Accepted' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secrets = [Deno.env.get('MPESA_CALLBACK_SECRET'), Deno.env.get('MPESA_CALLBACK_SECRET_PREVIOUS')].filter((v): v is string => !!v);
  const provided = new URL(req.url).searchParams.get('s') ?? '';
  if (!secrets.some((x) => timingSafeEqual(provided, x))) return json({ error: 'forbidden' }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return json(ACK); }

  const parsed = parseStkCallback(body);
  if (!parsed.ok) { console.error('callback rejected:', parsed.reason); return json(ACK); }

  const svc = serviceClient();
  try {
    if (parsed.kind === 'success') {
      const { error } = await svc.rpc('record_payment_success', {
        p_checkout_request_id: parsed.checkoutRequestId, p_receipt: parsed.receipt,
        p_amount_minor: parsed.amountMinor, p_raw: body,
      });
      if (error) console.error('record_payment_success failed:', error.message);
    } else {
      const { error } = await svc.rpc('record_payment_failure', {
        p_checkout_request_id: parsed.checkoutRequestId, p_status: parsed.status,
        p_result_code: parsed.resultCode, p_result_desc: parsed.resultDesc, p_raw: body,
      });
      if (error) console.error('record_payment_failure failed:', error.message);
    }
  } catch (e) {
    console.error('callback processing error:', (e as Error).message);
  }
  return json(ACK);
});
