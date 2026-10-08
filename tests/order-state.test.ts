import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, TRANSITIONS, staffActions, isTerminal } from '@/lib/commerce/order-state';

describe('order state machine', () => {
  it('every status has a transition entry', () => {
    for (const s of ORDER_STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });
  it('workers can prepare but not accept or complete', () => {
    const can = (p: string) => ['orders.view', 'orders.prepare'].includes(p);
    expect(staffActions('ACCEPTED', can as never)).toEqual(['PREPARING']);
    expect(staffActions('RECEIVED', can as never)).toEqual([]);
    expect(staffActions('READY', can as never)).toEqual([]);
  });
  it('payment transitions are never offered to staff', () => {
    const all = () => true;
    expect(staffActions('PENDING_PAYMENT', all)).toEqual([]);
    expect(staffActions('PAID', all)).toEqual([]);
  });
  it('completed and refunded are terminal', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('REFUNDED')).toBe(true);
    expect(isTerminal('READY')).toBe(false);
  });
});
