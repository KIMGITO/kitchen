import { describe, expect, it } from 'vitest';
import { normalizeKePhone, sanitizeLocalDigits, kePhoneLocal, formatKePhone } from '@/lib/phone';
import { checkPassword } from '@/lib/auth/password';

describe('Kenyan phone numbers', () => {
  it('normalises every common format to +254', () => {
    for (const v of ['0712345678', '712345678', '254712345678', '+254712345678', '+254 712 345 678', '0712-345-678']) expect(normalizeKePhone(v)).toBe('+254712345678');
    expect(normalizeKePhone('0112345678')).toBe('+254112345678');
  });
  it('rejects anything else', () => {
    for (const v of ['', '0612345678', '+255712345678', '07123456', '071234567890', 'abc', '+2547123456789']) expect(normalizeKePhone(v)).toBeNull();
  });
  it('cleans pasted input for the 9-digit box', () => {
    expect(sanitizeLocalDigits('+254 712 345 678')).toBe('712345678');
    expect(sanitizeLocalDigits('0712345678')).toBe('712345678');
    expect(sanitizeLocalDigits('7123456789999')).toBe('712345678');
    expect(kePhoneLocal('+254712345678')).toBe('712345678');
    expect(formatKePhone('+254712345678')).toBe('+254 712 345 678');
  });
});

describe('password policy', () => {
  it('accepts a normal strong password', () => expect(checkPassword('kitchen2026', 'kitchen2026', 'me@x.com')).toBeNull());
  it('enforces length, letter+digit, common list, email name and confirmation', () => {
    expect(checkPassword('abc123')).toMatch(/8 characters/);
    expect(checkPassword('abcdefgh')).toMatch(/letter and one number/);
    expect(checkPassword('12345678')).toMatch(/letter and one number/);
    expect(checkPassword('Password123')).toMatch(/too common/);
    expect(checkPassword('johnsmith99', undefined, 'johnsmith@x.com')).toMatch(/email name/);
    expect(checkPassword('kitchen2026', 'kitchen2027')).toMatch(/do not match/);
    expect(checkPassword('a1'.repeat(40))).toMatch(/too long/);
  });
});
