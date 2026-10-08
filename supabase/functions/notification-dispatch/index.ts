// Scheduled every minute (or triggered by a Database Webhook on notification_deliveries inserts).
// Sends queued email (Resend) and SMS (Africa's Talking). Retries with backoff up to 5 attempts.
import { json, serviceClient } from '../_shared/clients.ts';
import { sendEmail, sendSms } from '../_shared/messaging.ts';

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return json({ error: 'forbidden' }, 403);
  const svc = serviceClient();
  const { data: batch, error } = await svc.rpc('claim_deliveries', { p_limit: 25 });
  if (error) { console.error('claim failed:', error.message); return json({ error: 'claim_failed' }, 500); }

  let sent = 0; let failed = 0;
  for (const d of (batch ?? []) as { id: string; channel: 'email' | 'sms'; to_address: string; subject: string | null; body: string }[]) {
    try {
      const r = d.channel === 'email' ? await sendEmail(d.to_address, d.subject ?? 'Update', d.body) : await sendSms(d.to_address, d.body);
      await svc.rpc('complete_delivery', { p_id: d.id, p_ok: r.ok, p_error: r.error ?? null });
      r.ok ? sent++ : failed++;
    } catch (e) {
      await svc.rpc('complete_delivery', { p_id: d.id, p_ok: false, p_error: (e as Error).message });
      failed++;
    }
  }
  return json({ claimed: batch?.length ?? 0, sent, failed });
});
