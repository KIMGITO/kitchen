import { describe, expect, it } from 'vitest';
import {
  failureStatus, minorToWholeShillings, normalizeMsisdn, parseStkCallback, stkPassword, timingSafeEqual,
} from '../supabase/functions/_shared/mpesa-utils';

describe('normalizeMsisdn', () => {
  it.each([
    ['0712345678', '254712345678'], ['0112345678', '254112345678'], ['712345678', '254712345678'],
    ['+254 712 345 678', '254712345678'], ['254708374149', '254708374149'],
  ])('%s -> %s', (i, o) => expect(normalizeMsisdn(i)).toBe(o));
  it.each(['', '12345', '0212345678', '2547123', 'abc', '254812345678'])('rejects %s', (i) => expect(normalizeMsisdn(i)).toBeNull());
});

describe('money', () => {
  it('converts only whole positive shillings', () => {
    expect(minorToWholeShillings(120000)).toBe(1200);
    expect(minorToWholeShillings(12050)).toBeNull();
    expect(minorToWholeShillings(0)).toBeNull();
    expect(minorToWholeShillings(50)).toBeNull();
  });
});

describe('stkPassword', () => {
  it('is base64(shortcode+passkey+timestamp)', () => {
    expect(stkPassword('174379', 'key', '20260101000000')).toBe(btoa('174379key20260101000000'));
  });
});

const success = {
  Body: { stkCallback: { MerchantRequestID: 'm-1', CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'ok',
    CallbackMetadata: { Item: [
      { Name: 'Amount', Value: 1200 }, { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
      { Name: 'TransactionDate', Value: 20260101101010 }, { Name: 'PhoneNumber', Value: 254708374149 } ] } } },
};

describe('parseStkCallback', () => {
  it('parses success and converts shillings to minor units', () => {
    expect(parseStkCallback(success)).toMatchObject({ ok: true, kind: 'success', checkoutRequestId: 'ws_CO_1', amountMinor: 120000, receipt: 'NLJ7RT61SV' });
  });
  it('parses user cancellation (1032) and timeout (1037)', () => {
    const f = (c: number) => ({ Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'c', ResultCode: c, ResultDesc: 'x' } } });
    expect(parseStkCallback(f(1032))).toMatchObject({ kind: 'failure', status: 'CANCELLED_BY_USER' });
    expect(parseStkCallback(f(1037))).toMatchObject({ kind: 'failure', status: 'TIMEOUT' });
    expect(failureStatus(1)).toBe('FAILED');
  });
  it('rejects malformed or incomplete payloads', () => {
    expect(parseStkCallback(null).ok).toBe(false);
    expect(parseStkCallback({}).ok).toBe(false);
    const noReceipt = structuredClone(success);
    noReceipt.Body.stkCallback.CallbackMetadata.Item = [{ Name: 'Amount', Value: 5 }];
    expect(parseStkCallback(noReceipt).ok).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares', () => { expect(timingSafeEqual('abc', 'abc')).toBe(true); expect(timingSafeEqual('abc', 'abd')).toBe(false); expect(timingSafeEqual('a', 'ab')).toBe(false); });
});

import { atSmsBody, atSmsOk, parseDarajaResult, resendPayload, toE164 } from '../supabase/functions/_shared/mpesa-utils';

describe('parseDarajaResult (B2C / Reversal)', () => {
  const success = { Result: { ResultType: 0, ResultCode: 0, ResultDesc: 'The service request is processed successfully.',
    OriginatorConversationID: '10571-7910404-1', ConversationID: 'AG_2019', TransactionID: 'NLJ41HAY6Q',
    ResultParameters: { ResultParameter: [{ Key: 'TransactionReceipt', Value: 'NLJ41HAY6Q' }, { Key: 'TransactionAmount', Value: 500 }] } } };
  it('parses success with receipt and amount in minor units', () => {
    expect(parseDarajaResult(success)).toMatchObject({ ok: true, success: true, originatorId: '10571-7910404-1', receipt: 'NLJ41HAY6Q', amountMinor: 50000 });
  });
  it('handles a single (non-array) ResultParameter and falls back to TransactionID', () => {
    const one = structuredClone(success) as any;
    one.Result.ResultParameters.ResultParameter = { Key: 'TransactionAmount', Value: 10 };
    expect(parseDarajaResult(one)).toMatchObject({ ok: true, receipt: 'NLJ41HAY6Q', amountMinor: 1000 });
  });
  it('parses failures', () => {
    const f = { Result: { ResultCode: 2001, ResultDesc: 'The initiator information is invalid.', OriginatorConversationID: 'o1', ConversationID: 'c1' } };
    expect(parseDarajaResult(f)).toMatchObject({ ok: true, success: false, resultCode: 2001, receipt: null });
  });
  it('rejects malformed payloads', () => {
    expect(parseDarajaResult({}).ok).toBe(false);
    expect(parseDarajaResult({ Result: { ResultCode: 0 } }).ok).toBe(false);
    expect(parseDarajaResult(null).ok).toBe(false);
  });
});

describe('messaging payloads', () => {
  it('formats E.164', () => { expect(toE164('0712 345 678')).toBe('+254712345678'); expect(toE164('123')).toBeNull(); });
  it('escapes HTML in email bodies and links URLs', () => {
    const p = resendPayload('Shop <a@b.co>', 'x@y.co', 'S', 'Hi <script>\nTrack: https://k.example.com/orders/1');
    expect(p.html).not.toContain('<script>');
    expect(p.html).toContain('<a href="https://k.example.com/orders/1">');
    expect(p.to).toEqual(['x@y.co']);
  });
  it('builds the Africa\'s Talking body and reads status codes', () => {
    expect(atSmsBody('u', '+254712345678', 'hello', 'SHOP').get('from')).toBe('SHOP');
    expect(atSmsBody('u', '+254712345678', 'hello').has('from')).toBe(false);
    expect(atSmsOk({ SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success' }] } }).ok).toBe(true);
    expect(atSmsOk({ SMSMessageData: { Recipients: [{ statusCode: 403, status: 'InvalidPhoneNumber' }] } })).toEqual({ ok: false, error: 'InvalidPhoneNumber' });
  });
});
