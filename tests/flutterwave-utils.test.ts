import { describe, expect, it } from 'vitest';
import { buildTxRef, isOrderTxRef, judgeCharge, judgeTransferStatus, parseTransferEvent, toMajor, toMinor } from '../supabase/functions/_shared/flutterwave-utils';

const base = { id: 4242, tx_ref: 'fw_abc', flw_ref: 'FLW-REF-1', amount: 1250.5, currency: 'KES', status: 'successful' };
const expected = { txRef: 'fw_abc', currency: 'KES' };

describe('money conversion', () => {
  it('converts minor <-> major without float drift', () => {
    expect(toMajor(125050)).toBe(1250.5);
    expect(toMinor(1250.5)).toBe(125050);
    expect(toMinor('19.99')).toBe(1999);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });
});

describe('tx_ref', () => {
  it('is unique per payment and recognisable', () => {
    expect(buildTxRef('11111111-2222')).toBe('fw_11111111-2222');
    expect(isOrderTxRef('fw_x')).toBe(true);
    expect(isOrderTxRef('sub_x')).toBe(false);
    expect(isOrderTxRef(undefined)).toBe(false);
  });
});

describe('judgeCharge (what a verified transaction means for our payment)', () => {
  it('accepts a successful charge and uses the Flutterwave reference as the receipt', () => {
    expect(judgeCharge(base, expected)).toEqual({ kind: 'success', amountMinor: 125050, receipt: 'FLW-REF-1', txId: '4242' });
  });
  it('falls back to the transaction id when there is no flw_ref', () => {
    expect(judgeCharge({ ...base, flw_ref: null }, expected)).toMatchObject({ kind: 'success', receipt: '4242' });
  });
  it('rejects a transaction for a different reference or currency', () => {
    expect(judgeCharge({ ...base, tx_ref: 'fw_other' }, expected)).toEqual({ kind: 'mismatch', reason: 'tx_ref_mismatch' });
    expect(judgeCharge({ ...base, currency: 'USD' }, expected)).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
  });
  it('maps failed / cancelled / pending', () => {
    expect(judgeCharge({ ...base, status: 'failed', processor_response: 'Insufficient funds' }, expected)).toEqual({ kind: 'failed', status: 'FAILED', reason: 'Insufficient funds' });
    expect(judgeCharge({ ...base, status: 'cancelled' }, expected)).toMatchObject({ kind: 'failed', status: 'CANCELLED_BY_USER' });
    expect(judgeCharge({ ...base, status: 'pending' }, expected)).toEqual({ kind: 'pending' });
  });
  it('reports the real paid amount so a short payment is flagged by the database, not silently accepted', () => {
    expect(judgeCharge({ ...base, amount: 500 }, expected)).toMatchObject({ kind: 'success', amountMinor: 50000 });
  });
});

describe('judgeTransferStatus (single-transfer GET, used by payment-reconcile)', () => {
  it('maps Flutterwave transfer statuses to what they mean for our payout', () => {
    expect(judgeTransferStatus('SUCCESSFUL')).toBe('successful');
    expect(judgeTransferStatus('success')).toBe('successful');
    expect(judgeTransferStatus('FAILED')).toBe('failed');
    expect(judgeTransferStatus('failure')).toBe('failed');
    // Anything else (NEW, PENDING, ...) is still in flight: reconcile leaves the payout `processing`.
    expect(judgeTransferStatus('PENDING')).toBe('pending');
    expect(judgeTransferStatus('NEW')).toBe('pending');
    expect(judgeTransferStatus(undefined)).toBe('pending');
    expect(judgeTransferStatus(null)).toBe('pending');
  });
});

describe('transfer webhook', () => {
  it('parses success and failure', () => {
    expect(parseTransferEvent({ reference: 'r1', status: 'SUCCESSFUL', id: 99, amount: 1000 })).toMatchObject({ reference: 'r1', status: 'SUCCESSFUL', id: '99', amountMinor: 100000 });
    expect(parseTransferEvent({ reference: 'r2', status: 'FAILED', complete_message: 'Account blocked' })).toMatchObject({ status: 'FAILED', message: 'Account blocked', amountMinor: null });
    expect(parseTransferEvent({ reference: 'r3', status: 'NEW' })?.status).toBe('OTHER');
    expect(parseTransferEvent({})).toBeNull();
  });
});
