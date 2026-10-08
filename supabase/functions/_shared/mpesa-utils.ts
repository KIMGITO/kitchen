// Pure helpers (no Deno/Node APIs) so they can be unit-tested with vitest.

/** Accepts 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizeMsisdn(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let n: string;
  if (/^0[17]\d{8}$/.test(digits)) n = '254' + digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) n = '254' + digits;
  else if (/^254[17]\d{8}$/.test(digits)) n = digits;
  else return null;
  return n;
}

/** Daraja timestamp: YYYYMMDDHHmmss in the server's clock (UTC is fine for the password). */
export function darajaTimestamp(d = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

/** Minor units (cents) -> whole shillings for Daraja. Returns null if not a whole, positive amount. */
export function minorToWholeShillings(minor: number): number | null {
  return Number.isInteger(minor) && minor >= 100 && minor % 100 === 0 ? minor / 100 : null;
}

export type ParsedCallback =
  | { ok: true; kind: 'success'; checkoutRequestId: string; merchantRequestId: string; amountMinor: number; receipt: string; phone: string | null }
  | { ok: true; kind: 'failure'; checkoutRequestId: string; merchantRequestId: string; resultCode: number; resultDesc: string; status: 'CANCELLED_BY_USER' | 'TIMEOUT' | 'FAILED' }
  | { ok: false; reason: string };

/** Maps Daraja result codes. 1032 = cancelled by user, 1037 = timeout (no response from user). */
export function failureStatus(code: number): 'CANCELLED_BY_USER' | 'TIMEOUT' | 'FAILED' {
  if (code === 1032) return 'CANCELLED_BY_USER';
  if (code === 1037) return 'TIMEOUT';
  return 'FAILED';
}

/** Parses the Daraja STK callback body defensively; the payload is untrusted input. */
export function parseStkCallback(body: unknown): ParsedCallback {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback;
  if (!cb || typeof cb !== 'object') return { ok: false, reason: 'missing stkCallback' };
  const checkoutRequestId = typeof cb.CheckoutRequestID === 'string' ? cb.CheckoutRequestID : '';
  const merchantRequestId = typeof cb.MerchantRequestID === 'string' ? cb.MerchantRequestID : '';
  const resultCode = Number(cb.ResultCode);
  if (!checkoutRequestId || !Number.isFinite(resultCode)) return { ok: false, reason: 'missing ids or result code' };

  if (resultCode !== 0) {
    return { ok: true, kind: 'failure', checkoutRequestId, merchantRequestId, resultCode,
      resultDesc: String(cb.ResultDesc ?? 'Payment failed').slice(0, 300), status: failureStatus(resultCode) };
  }
  const items = ((cb.CallbackMetadata as { Item?: { Name: string; Value?: unknown }[] } | undefined)?.Item) ?? [];
  const get = (name: string) => items.find((i) => i?.Name === name)?.Value;
  const amount = Number(get('Amount'));
  const receipt = String(get('MpesaReceiptNumber') ?? '');
  if (!Number.isFinite(amount) || amount <= 0 || !receipt) return { ok: false, reason: 'success callback missing amount or receipt' };
  const phone = get('PhoneNumber');
  return { ok: true, kind: 'success', checkoutRequestId, merchantRequestId,
    amountMinor: Math.round(amount * 100), receipt, phone: phone == null ? null : String(phone) };
}

/** Constant-time string comparison for the callback secret. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type ParsedResult =
  | { ok: true; originatorId: string; conversationId: string; resultCode: number; resultDesc: string; success: boolean; receipt: string | null; amountMinor: number | null }
  | { ok: false; reason: string };

/**
 * Parses the asynchronous Result payload used by B2C and Reversal:
 * { Result: { ResultCode, ResultDesc, OriginatorConversationID, ConversationID, TransactionID,
 *             ResultParameters: { ResultParameter: [{Key, Value}, ...] } } }
 * ResultParameter can be a single object instead of an array. Input is untrusted.
 */
export function parseDarajaResult(body: unknown): ParsedResult {
  const r = (body as { Result?: Record<string, unknown> } | null)?.Result;
  if (!r || typeof r !== 'object') return { ok: false, reason: 'missing Result' };
  const originatorId = typeof r.OriginatorConversationID === 'string' ? r.OriginatorConversationID : '';
  const resultCode = Number(r.ResultCode);
  if (!originatorId || !Number.isFinite(resultCode)) return { ok: false, reason: 'missing originator id or result code' };

  const raw = (r.ResultParameters as { ResultParameter?: unknown } | undefined)?.ResultParameter;
  const params = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { Key?: string; Value?: unknown }[];
  const get = (k: string) => params.find((p) => p?.Key === k)?.Value;
  const amount = Number(get('TransactionAmount'));
  const receiptParam = get('TransactionReceipt');
  const txId = typeof r.TransactionID === 'string' && r.TransactionID ? r.TransactionID : null;
  return {
    ok: true, originatorId, conversationId: String(r.ConversationID ?? ''), resultCode,
    resultDesc: String(r.ResultDesc ?? '').slice(0, 300), success: resultCode === 0,
    receipt: receiptParam ? String(receiptParam) : txId,
    amountMinor: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
  };
}

/** Kenyan number -> E.164 (+2547XXXXXXXX) for SMS providers. */
export function toE164(input: string): string | null {
  const n = normalizeMsisdn(input);
  return n ? `+${n}` : null;
}

export function resendPayload(from: string, to: string, subject: string, text: string) {
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#161A17">${
    text.split('\n').map((l) => `<p style="margin:0 0 12px">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join('')}</div>`;
  return { from, to: [to], subject, text, html };
}

/** Africa's Talking messaging form body. */
export function atSmsBody(username: string, to: string, message: string, senderId?: string): URLSearchParams {
  const p = new URLSearchParams({ username, to, message });
  if (senderId) p.set('from', senderId);
  return p;
}
/** AT statusCode 100 Processed, 101 Sent, 102 Queued are successes. */
export function atSmsOk(json: unknown): { ok: boolean; error?: string } {
  const rec = (json as { SMSMessageData?: { Recipients?: { statusCode?: number; status?: string }[]; Message?: string } })?.SMSMessageData?.Recipients?.[0];
  if (rec && [100, 101, 102].includes(Number(rec.statusCode))) return { ok: true };
  return { ok: false, error: rec?.status ?? (json as { SMSMessageData?: { Message?: string } })?.SMSMessageData?.Message ?? 'sms_failed' };
}
