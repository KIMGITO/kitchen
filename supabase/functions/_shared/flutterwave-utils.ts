// Pure helpers (no Deno APIs) so they can be unit-tested with Vitest.

/** Minor units (cents) -> Flutterwave major units: 125050 -> 1250.5 */
export const toMajor = (minor: number): number => Math.round(minor) / 100;
/** Flutterwave major units -> minor units, rounding away float noise: 1250.5 -> 125050 */
export const toMinor = (major: number | string): number => Math.round(Number(major) * 100);

/** One unique tx_ref per payment attempt. The webhook looks the payment up by this value. */
export const buildTxRef = (paymentId: string): string => `fw_${paymentId}`;
export const isOrderTxRef = (txRef: string | undefined | null): boolean => !!txRef && txRef.startsWith('fw_');

export interface VerifiedCharge {
  id: number | string;
  tx_ref: string;
  flw_ref?: string | null;
  amount: number | string;
  currency: string;
  status: string;
  processor_response?: string | null;
}

export type ChargeVerdict =
  | { kind: 'success'; amountMinor: number; receipt: string; txId: string }
  | { kind: 'failed'; status: 'FAILED' | 'CANCELLED_BY_USER'; reason: string }
  | { kind: 'pending' }
  | { kind: 'mismatch'; reason: string };

/**
 * Decide what a VERIFIED Flutterwave transaction means for OUR payment.
 * Never trust the webhook body alone: the reference and currency must match what we created.
 * (The amount is compared inside record_payment_success, which flags any difference for refund instead of silently accepting it.)
 */
export function judgeCharge(v: VerifiedCharge, expected: { txRef: string; currency: string }): ChargeVerdict {
  if (v.tx_ref !== expected.txRef) return { kind: 'mismatch', reason: 'tx_ref_mismatch' };
  if (String(v.currency).toUpperCase() !== expected.currency.trim().toUpperCase()) return { kind: 'mismatch', reason: 'currency_mismatch' };
  const s = String(v.status).toLowerCase();
  if (s === 'successful' || s === 'success') {
    return { kind: 'success', amountMinor: toMinor(v.amount), receipt: String(v.flw_ref || v.id), txId: String(v.id) };
  }
  if (s === 'failed') return { kind: 'failed', status: 'FAILED', reason: v.processor_response || 'The payment was declined.' };
  if (s === 'cancelled') return { kind: 'failed', status: 'CANCELLED_BY_USER', reason: 'The payment was cancelled.' };
  return { kind: 'pending' };
}

export interface TransferEvent { reference: string; status: 'SUCCESSFUL' | 'FAILED' | 'OTHER'; id: string; amountMinor: number | null; message: string }

/** Normalise a Flutterwave transfer status (from the single-transfer GET) to what it means for our payout. */
export function judgeTransferStatus(status: string | undefined | null): 'successful' | 'failed' | 'pending' {
  const s = String(status ?? '').toUpperCase();
  if (s === 'SUCCESSFUL' || s === 'SUCCESS') return 'successful';
  if (s === 'FAILED' || s === 'FAILURE') return 'failed';
  return 'pending';
}

/** Parse the data object of a `transfer.completed` webhook. */
export function parseTransferEvent(d: Record<string, unknown> | undefined): TransferEvent | null {
  if (!d || typeof d.reference !== 'string') return null;
  const st = String(d.status ?? '').toUpperCase();
  return {
    reference: d.reference,
    status: st === 'SUCCESSFUL' ? 'SUCCESSFUL' : st === 'FAILED' ? 'FAILED' : 'OTHER',
    id: String(d.id ?? ''),
    amountMinor: d.amount === undefined || d.amount === null ? null : toMinor(d.amount as number),
    message: String(d.complete_message ?? d.narration ?? ''),
  };
}
