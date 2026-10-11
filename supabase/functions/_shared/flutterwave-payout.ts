// Sends one kitchen payout through Flutterwave Transfers. Mirrors the Daraja B2C behaviour:
//   definite rejection  -> payout marked failed (nothing was sent);
//   network error       -> payout stays `processing` and is NEVER retried automatically (could pay twice).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createMpesaTransfer } from './flutterwave.ts';

export interface BegunPayout { originator_id: string; msisdn: string; amount_minor: number; tenant_id: string }
export type SendResult = { ok: true } | { ok: false; kind: 'rejected' | 'unknown'; message: string };

export async function sendTransfer(svc: SupabaseClient, payoutId: string, p: BegunPayout, accountName: string): Promise<SendResult> {
  try {
    const r = await createMpesaTransfer({ msisdn: p.msisdn, amountMinor: Number(p.amount_minor), reference: p.originator_id, beneficiaryName: accountName });
    if (!r.ok) {
      await svc.rpc('fail_b2c_initiation', { p_payout: payoutId, p_desc: r.message });
      return { ok: false, kind: 'rejected', message: r.message };
    }
    if (r.data?.id) await svc.rpc('attach_b2c_response', { p_payout: payoutId, p_conversation_id: String(r.data.id) });
    return { ok: true };
  } catch (e) {
    console.error('transfer ambiguous failure:', (e as Error).message);
    return { ok: false, kind: 'unknown', message: 'We could not confirm that Flutterwave received the transfer. Check the Flutterwave dashboard before resolving this payout manually.' };
  }
}
