// Public endpoint for Daraja's asynchronous Result and QueueTimeOut callbacks (B2C payouts and Reversal refunds).
// ?s=<secret>&kind=b2c|reversal[&t=timeout]. Always answers 200 so Safaricom stops retrying.
import { json, serviceClient } from '../_shared/clients.ts';
import { parseDarajaResult, timingSafeEqual } from '../_shared/mpesa-utils.ts';

const ACK = { ResultCode: 0, ResultDesc: 'Accepted' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = new URL(req.url);
  const secret = Deno.env.get('MPESA_CALLBACK_SECRET') ?? '';
  if (!secret || !timingSafeEqual(url.searchParams.get('s') ?? '', secret)) return json({ error: 'forbidden' }, 403);
  const kind = url.searchParams.get('kind');
  if (kind !== 'b2c' && kind !== 'reversal') return json(ACK);

  let body: unknown;
  try { body = await req.json(); } catch { return json(ACK); }
  if (url.searchParams.get('t') === 'timeout') {
    // The request is still queued at Safaricom; the final Result may arrive later. Leave state unchanged for admin review.
    console.warn(`${kind} queue timeout`, JSON.stringify(body).slice(0, 500));
    return json(ACK);
  }
  const r = parseDarajaResult(body);
  if (!r.ok) { console.error(`${kind} result rejected:`, r.reason); return json(ACK); }

  const svc = serviceClient();
  try {
    let err;
    if (kind === 'b2c') {
      ({ error: err } = r.success
        ? await svc.rpc('complete_b2c_payout', { p_originator: r.originatorId, p_receipt: r.receipt, p_amount_minor: r.amountMinor, p_raw: body })
        : await svc.rpc('fail_b2c_payout', { p_originator: r.originatorId, p_code: r.resultCode, p_desc: r.resultDesc, p_raw: body }));
    } else {
      ({ error: err } = r.success
        ? await svc.rpc('complete_refund', { p_originator: r.originatorId, p_reference: r.receipt, p_raw: body })
        : await svc.rpc('fail_refund', { p_originator: r.originatorId, p_code: r.resultCode, p_desc: r.resultDesc, p_raw: body }));
    }
    if (err) console.error(`${kind} result processing failed:`, err.message);
  } catch (e) { console.error(`${kind} result error:`, (e as Error).message); }
  return json(ACK);
});
