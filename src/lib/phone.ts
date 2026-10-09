/** Kenyan mobile numbers. Everything the app stores or sends is E.164: +254 followed by 9 digits starting 7 or 1. */
const E164 = /^\+254[17]\d{8}$/;

/** Accepts 0712345678, 712345678, 254712345678, +254 712 345 678 ... and returns +254712345678, or null. */
export function normalizeKePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  let n: string | null = null;
  if (/^0[17]\d{8}$/.test(digits)) n = '254' + digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) n = '254' + digits;
  else if (/^254[17]\d{8}$/.test(digits)) n = digits;
  return n ? `+${n}` : null;
}

export const isKePhone = (v: string | null | undefined): v is string => !!v && E164.test(v);

/** The 9 digits shown after the fixed "+254" prefix. */
export function kePhoneLocal(e164: string | null | undefined): string {
  const n = normalizeKePhone(e164 ?? '');
  return n ? n.slice(4) : '';
}

/** Clean what a person types or pastes into the 9-digit box (drops +254 / 254 / leading 0, non-digits, extra digits). */
export function sanitizeLocalDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('254')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 9);
}

export function formatKePhone(e164: string): string {
  const l = kePhoneLocal(e164);
  return l ? `+254 ${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}` : e164;
}

export const PHONE_ERROR = 'Enter a valid Kenyan mobile number, e.g. +254 712 345 678.';
