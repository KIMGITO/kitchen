// Turns a verified Flutterwave transaction into our payment state. Used by the webhook, fw-verify and payment-reconcile
// so all three behave identically (and every path is idempotent via record_payment_success / record_payment_failure).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { judgeCharge, type VerifiedCharge } from './flutterwave-utils.ts';

export interface PaymentRef { checkout_request_id: string; currency: string; status?: string }
export type SettleOutcome = 'success' | 'failed' | 'pending' | 'mismatch';

export async function settleCharge(svc: SupabaseClient, pay: PaymentRef, v: VerifiedCharge): Promise<SettleOutcome> {
  const verdict = judgeCharge(v, { txRef: pay.checkout_request_id, currency: pay.currency });
  if (verdict.kind === 'success') {
    const { error } = await svc.rpc('record_payment_success', {
      p_checkout_request_id: pay.checkout_request_id, p_receipt: verdict.receipt, p_amount_minor: verdict.amountMinor,
      p_raw: { source: 'flutterwave', provider_tx_id: verdict.txId, verified: v },
    });
    if (error) throw new Error(`record_payment_success: ${error.message}`);
    return 'success';
  }
  if (verdict.kind === 'failed') {
    const { error } = await svc.rpc('record_payment_failure', {
      p_checkout_request_id: pay.checkout_request_id, p_status: verdict.status, p_result_code: null,
      p_result_desc: verdict.reason, p_raw: { source: 'flutterwave', verified: v },
    });
    if (error) throw new Error(`record_payment_failure: ${error.message}`);
    return 'failed';
  }
  if (verdict.kind === 'mismatch') {
    console.error('flutterwave verification mismatch', pay.checkout_request_id, verdict.reason);
    return 'mismatch';
  }
  return 'pending';
}
