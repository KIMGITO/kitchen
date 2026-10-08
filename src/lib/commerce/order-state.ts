import type { Permission } from '@/lib/auth/permissions';

/**
 * Mirrors public.order_transitions. The database is authoritative (transition_order RPC);
 * this table drives UI affordances (which buttons to show) and is tested for parity by review.
 */
export const ORDER_STATUSES = [
  'PENDING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'RECEIVED', 'ACCEPTED', 'PREPARING',
  'READY', 'COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED', 'EXPIRED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

interface Transition { to: OrderStatus; permission?: Permission; customer?: boolean; system?: boolean }

export const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  PENDING_PAYMENT: [{ to: 'PAID', system: true }, { to: 'PAYMENT_FAILED', system: true }, { to: 'EXPIRED', system: true }, { to: 'CANCELLED', customer: true }],
  PAYMENT_FAILED: [{ to: 'PENDING_PAYMENT', system: true }, { to: 'PAID', system: true }, { to: 'EXPIRED', system: true }, { to: 'CANCELLED', customer: true }],
  PAID: [{ to: 'RECEIVED', system: true }],
  RECEIVED: [{ to: 'ACCEPTED', permission: 'orders.accept' }, { to: 'REJECTED', permission: 'orders.accept' }, { to: 'CANCELLED', permission: 'orders.cancel' }],
  ACCEPTED: [{ to: 'PREPARING', permission: 'orders.prepare' }, { to: 'CANCELLED', permission: 'orders.cancel' }],
  PREPARING: [{ to: 'READY', permission: 'orders.prepare' }, { to: 'CANCELLED', permission: 'orders.cancel' }],
  READY: [{ to: 'COMPLETED', permission: 'orders.complete' }, { to: 'CANCELLED', permission: 'orders.cancel' }],
  COMPLETED: [], CANCELLED: [{ to: 'REFUNDED', system: true }], REJECTED: [{ to: 'REFUNDED', system: true }],
  REFUNDED: [], EXPIRED: [],
};

/** Statuses that appear on the customer-facing progress timeline, in order. */
export const CUSTOMER_TIMELINE: readonly OrderStatus[] = ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment', PAYMENT_FAILED: 'Payment failed', PAID: 'Paid', RECEIVED: 'Order received',
  ACCEPTED: 'Accepted', PREPARING: 'Preparing', READY: 'Ready', COMPLETED: 'Completed',
  CANCELLED: 'Cancelled', REJECTED: 'Declined', REFUNDED: 'Refunded', EXPIRED: 'Expired',
};

export function staffActions(from: OrderStatus, can: (p: Permission) => boolean): OrderStatus[] {
  return TRANSITIONS[from].filter((t) => !t.system && !t.customer && t.permission && can(t.permission)).map((t) => t.to);
}
export function isTerminal(s: OrderStatus) { return TRANSITIONS[s].length === 0; }
