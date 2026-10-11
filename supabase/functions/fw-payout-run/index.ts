// Scheduled. Needs the service-role key as the bearer token (see README: Scheduling).
//   POST {}              -> pay every kitchen whose balance reached min_payout_minor
//   POST { "flush": true } -> Friday flush: pay every kitchen with at least payout_flush_floor_minor
// Does nothing unless platform_settings.auto_payouts_enabled is true, and only pays kitchens with an APPROVED payout account.
import { json, serviceClient } from '../_shared/clients.ts';
import { sendTransfer, type BegunPayout } from '../_shared/flutterwave-payout.ts';

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return json({ error: 'forbidden' }, 403);
  const { flush } = await req.json().catch(() => ({}));
  const svc = serviceClient();
  const { data: created, error } = await svc.rpc('run_auto_payouts', { p_flush: flush === true });
  if (error) { console.error('run_auto_payouts', error.message); return json({ error: 'failed' }, 500); }

  let sent = 0; let failed = 0;
  for (const row of (created ?? []) as { o_payout_id: string; o_tenant_id: string; o_amount_minor: number }[]) {
    const { data: begun, error: bErr } = await svc.rpc('begin_fw_payout', { p_payout: row.o_payout_id });
    if (bErr || !begun?.[0]) { failed++; console.error('begin_fw_payout', row.o_payout_id, bErr?.message); continue; }
    const b = begun[0] as BegunPayout & { account_name: string };
    const r = await sendTransfer(svc, row.o_payout_id, b, b.account_name);
    if (r.ok) sent++; else failed++;
  }
  return json({ created: created?.length ?? 0, sent, failed });
});
