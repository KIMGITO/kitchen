import { atSmsBody, atSmsOk, resendPayload, toE164 } from './mpesa-utils.ts';

export interface SendResult { ok: boolean; error?: string }

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const key = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return { ok: false, error: 'email_not_configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendPayload(from, to, subject, text)),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `resend_${res.status}: ${(await res.text().catch(() => '')).slice(0, 150)}` };
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  const key = Deno.env.get('AT_API_KEY'); const username = Deno.env.get('AT_USERNAME');
  if (!key || !username) return { ok: false, error: 'sms_not_configured' };
  const e164 = toE164(to);
  if (!e164) return { ok: false, error: 'invalid_phone' };
  const sandbox = (Deno.env.get('AT_ENV') ?? 'production') === 'sandbox';
  const res = await fetch(`https://api.${sandbox ? 'sandbox.' : ''}africastalking.com/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: key, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: atSmsBody(username, e164, text, Deno.env.get('AT_SENDER_ID') ?? undefined),
  });
  if (!res.ok) return { ok: false, error: `at_${res.status}` };
  return atSmsOk(await res.json().catch(() => ({})));
}
