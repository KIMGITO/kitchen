import { STATUS_LABEL, type OrderStatus } from '@/lib/commerce/order-state';
import { cn } from './cn';

const tone: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-brand-soft text-brand',
  PAYMENT_FAILED: 'bg-danger/15 text-danger',
  PAID: 'bg-success/15 text-success',
  RECEIVED: 'bg-brand/15 text-brand-contrast',
  ACCEPTED: 'bg-brand/15 text-brand-contrast',
  PREPARING: 'bg-brand-soft text-brand',
  READY: 'bg-success/20 text-success',
  COMPLETED: 'bg-ink-muted/10 text-ink-muted',
  CANCELLED: 'bg-ink-muted/10 text-ink-muted',
  REJECTED: 'bg-danger/15 text-danger',
  REFUNDED: 'bg-ink-muted/10 text-ink-muted',
  EXPIRED: 'bg-ink-muted/10 text-ink-muted',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-semibold', tone[status])}>{STATUS_LABEL[status]}</span>;
}
