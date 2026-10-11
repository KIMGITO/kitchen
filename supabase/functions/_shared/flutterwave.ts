// Flutterwave v3 client for Edge Functions (Deno). Plain fetch, no npm dependencies.
import { toMajor } from './flutterwave-utils.ts';
import { timingSafeEqual } from './mpesa-utils.ts';
import type { VerifiedCharge } from './flutterwave-utils.ts';

export const FW_BASE = 'https://api.flutterwave.com/v3';

function secretKey(): string {
  const key = Deno.env.get('FLUTTERWAVE_SECRET_KEY') ?? '';
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY is not set');
  return key;
}

export interface FwResult<T = unknown> { ok: boolean; status: string; message: string; data: T | null; http: number }

/** Call the Flutterwave API. Never logs the key. A network failure THROWS (callers treat that as "outcome unknown"). */
export async function fwFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<FwResult<T>> {
  const res = await fetch(`${FW_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(25_000),
  });
  let j: { status?: string; message?: string; data?: T } = {};
  try { j = await res.json(); } catch { /* non-JSON upstream body */ }
  return {
    ok: res.ok && j.status === 'success', status: String(j.status ?? (res.ok ? 'success' : 'error')),
    message: String(j.message ?? `Flutterwave error (HTTP ${res.status})`), data: (j.data ?? null) as T | null, http: res.status,
  };
}

/** Authoritative status of a charge, straight from Flutterwave (by transaction id). */
export const verifyTransaction = (id: string | number) => fwFetch<VerifiedCharge>(`/transactions/${encodeURIComponent(String(id))}/verify`);
/** Same, by OUR reference: works even if the webhook never delivered the transaction id. */
export const verifyByReference = (txRef: string) => fwFetch<VerifiedCharge>(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);

export const createPaymentLink = (body: Record<string, unknown>) => fwFetch<{ link?: string }>('/payments', { method: 'POST', body });

/** Real status of a transfer we started, by the transfer id Flutterwave returned (stored in payouts.conversation_id). */
export const getTransfer = (id: string | number) =>
  fwFetch<{ id?: number | string; status?: string; amount?: number; reference?: string; complete_message?: string; narration?: string }>(`/transfers/${encodeURIComponent(String(id))}`);

/** Refund (full when `amountMinor` equals the payment). Asynchronous on Flutterwave's side. */
export const refundTransaction = (txId: string | number, amountMinor: number) =>
  fwFetch<{ id?: number; status?: string; amount_refunded?: number }>(`/transactions/${encodeURIComponent(String(txId))}/refund`, {
    method: 'POST', body: { amount: toMajor(amountMinor) },
  });

/** Payout to an M-Pesa wallet. `reference` must be unique: we use the payout's originator id so the webhook can find it. */
export const createMpesaTransfer = (p: { msisdn: string; amountMinor: number; reference: string; beneficiaryName: string }) =>
  fwFetch<{ id?: number; status?: string }>('/transfers', {
    method: 'POST',
    body: {
      account_bank: 'MPS', account_number: p.msisdn, amount: toMajor(p.amountMinor), currency: 'KES',
      narration: 'Kitchen payout', reference: p.reference, beneficiary_name: p.beneficiaryName,
      sender: Deno.env.get('FLUTTERWAVE_SENDER_NAME') ?? 'Codensons', debit_currency: 'KES',
    },
  });

/**
 * Webhook authenticity. v3 sends the dashboard "secret hash" verbatim in `verif-hash`;
 * the newer scheme sends base64(HMAC-SHA256(raw body, secret hash)) in `flutterwave-signature`. Either is accepted.
 */
export async function verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('FLUTTERWAVE_SECRET_HASH') ?? '';
  if (!secret) return false;
  const plain = req.headers.get('verif-hash');
  if (plain) return timingSafeEqual(plain, secret);
  const sig = req.headers.get('flutterwave-signature');
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return timingSafeEqual(sig, btoa(String.fromCharCode(...mac)));
}
