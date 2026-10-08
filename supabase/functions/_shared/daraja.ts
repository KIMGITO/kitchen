import { darajaTimestamp, stkPassword } from './mpesa-utils.ts';

/** MPESA_ENV=sandbox (default) | production. Sandbox needs no real money or Safaricom approval. */
const env = () => (Deno.env.get('MPESA_ENV') ?? 'sandbox').toLowerCase();
export const baseUrl = () => (env() === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

export async function getAccessToken(): Promise<string> {
  const basic = btoa(`${required('MPESA_CONSUMER_KEY')}:${required('MPESA_CONSUMER_SECRET')}`);
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Daraja auth returned no token');
  return json.access_token as string;
}

export interface StkRequest { amountShillings: number; msisdn: string; accountReference: string; description: string; callbackUrl: string }

export async function stkPush(r: StkRequest) {
  const shortcode = required('MPESA_SHORTCODE');
  const timestamp = darajaTimestamp();
  const body = {
    BusinessShortCode: shortcode,
    Password: stkPassword(shortcode, required('MPESA_PASSKEY'), timestamp),
    Timestamp: timestamp,
    // Paybill = CustomerPayBillOnline, Till = CustomerBuyGoodsOnline.
    TransactionType: Deno.env.get('MPESA_TRANSACTION_TYPE') ?? 'CustomerPayBillOnline',
    Amount: r.amountShillings,
    PartyA: r.msisdn,
    PartyB: Deno.env.get('MPESA_PARTY_B') ?? shortcode,
    PhoneNumber: r.msisdn,
    CallBackURL: r.callbackUrl,
    AccountReference: r.accountReference.slice(0, 12),
    TransactionDesc: r.description.slice(0, 13),
  };
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, json };
}

export async function stkQuery(checkoutRequestId: string) {
  const shortcode = required('MPESA_SHORTCODE');
  const timestamp = darajaTimestamp();
  const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode, Password: stkPassword(shortcode, required('MPESA_PASSKEY'), timestamp),
      Timestamp: timestamp, CheckoutRequestID: checkoutRequestId,
    }),
  });
  return { httpOk: res.ok, json: await res.json().catch(() => ({})) };
}

// ---------- B2C payouts and reversals (initiator-based APIs) ----------
const initiator = () => ({ name: required('MPESA_INITIATOR_NAME'), credential: required('MPESA_SECURITY_CREDENTIAL') });

export function resultUrl(kind: 'b2c' | 'reversal', timeout = false): string {
  const base = Deno.env.get('MPESA_CALLBACK_BASE_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  const s = encodeURIComponent(Deno.env.get('MPESA_CALLBACK_SECRET') ?? '');
  return `${base}/mpesa-result?s=${s}&kind=${kind}${timeout ? '&t=timeout' : ''}`;
}

export async function b2cPayment(r: { originatorId: string; msisdn: string; amountShillings: number; remarks: string }) {
  const i = initiator();
  const res = await fetch(`${baseUrl()}/mpesa/b2c/v3/paymentrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      OriginatorConversationID: r.originatorId, InitiatorName: i.name, SecurityCredential: i.credential,
      CommandID: 'BusinessPayment', Amount: r.amountShillings, PartyA: required('MPESA_B2C_SHORTCODE'), PartyB: r.msisdn,
      Remarks: r.remarks.slice(0, 100), QueueTimeOutURL: resultUrl('b2c', true), ResultURL: resultUrl('b2c'), Occasion: 'Payout',
    }),
  });
  return { httpOk: res.ok, json: await res.json().catch(() => ({})) };
}

/** Reverses a customer payment (C2B). ReceiverParty is the shortcode/till that RECEIVED the money. */
export async function reversal(r: { receipt: string; amountShillings: number; remarks: string }) {
  const i = initiator();
  const receiver = Deno.env.get('MPESA_REVERSAL_RECEIVER') ?? Deno.env.get('MPESA_PARTY_B') ?? required('MPESA_SHORTCODE');
  const res = await fetch(`${baseUrl()}/mpesa/reversal/v1/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Initiator: i.name, SecurityCredential: i.credential, CommandID: 'TransactionReversal', TransactionID: r.receipt,
      Amount: r.amountShillings, ReceiverParty: receiver, RecieverIdentifierType: '11',   // sic: Daraja's spelling
      ResultURL: resultUrl('reversal'), QueueTimeOutURL: resultUrl('reversal', true), Remarks: r.remarks.slice(0, 100), Occasion: 'Refund',
    }),
  });
  return { httpOk: res.ok, json: await res.json().catch(() => ({})) };
}
