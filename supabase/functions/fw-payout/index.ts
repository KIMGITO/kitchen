// POST { payout_id } with a platform admin's JWT. Sends the payout to the kitchen's APPROVED M-Pesa number via Flutterwave Transfers.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { sendTransfer, type BegunPayout } from '../_shared/flutterwave-payout.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (req.method !== 'POST' || !auth) return json({ error: 'forbidden' }, 403, corsHeaders);
  const { payout_id } = await req.json().catch(() => ({}));
  if (!payout_id) return json({ error: 'invalid_request' }, 400, corsHeaders);
  const { data: u } = await userClient(auth).auth.getUser();
  if (!u.user) return json({ error: 'not_authenticated' }, 401, corsHeaders);

  const svc = serviceClient();
  // Verifies the caller is a platform owner/admin, then marks the payout `processing` atomically.
  const { data: begun, error } = await svc.rpc('begin_b2c_payout', { p_payout: payout_id, p_admin: u.user.id });
  if (error || !begun?.[0]) {
    const code = (error?.message ?? '').split(':')[0];
    const msg: Record<string, string> = {
      permission_denied: 'Only platform owners and admins can send payouts.', payout_not_pending: 'This payout was already sent or is no longer pending.',
      no_payout_account: 'This kitchen has no approved payout number.',
    };
    return json({ error: code || 'failed', message: msg[code] ?? 'Could not start the payout.' }, 409, corsHeaders);
  }
  const p = begun[0] as BegunPayout;
  if (Number(p.amount_minor) % 100 !== 0) {
    await svc.rpc('fail_b2c_initiation', { p_payout: payout_id, p_desc: 'amount_not_whole_shillings' });
    return json({ error: 'amount_not_whole_shillings' }, 409, corsHeaders);
  }
  const { data: name } = await svc.rpc('payout_account_name', { p_tenant: p.tenant_id });
  const r = await sendTransfer(svc, payout_id, p, String(name ?? 'Kitchen'));
  if (r.ok) return json({ ok: true, message: 'Payout sent to Flutterwave. It completes when the transfer is confirmed.' }, 200, corsHeaders);
  return json({ error: r.kind === 'rejected' ? 'transfer_rejected' : 'transfer_unknown', message: r.message }, 502, corsHeaders);
});
