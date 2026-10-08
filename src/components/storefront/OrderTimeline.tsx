import { CUSTOMER_TIMELINE, STATUS_LABEL, type OrderStatus } from '@/lib/commerce/order-state';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/primitives/Icon';

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const idx = CUSTOMER_TIMELINE.indexOf(status);
  if (idx === -1) return null;
  return (
    <ol className="flex flex-col gap-0" aria-label="Order progress">
      {CUSTOMER_TIMELINE.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s} className="flex items-start gap-3" aria-current={i === idx ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <span className={cn('mt-1 size-3.5 rounded-full border-2 transition-colors', done ? 'border-brand bg-brand' : 'border-line bg-surface')}>
                {done ? <Icon name="check" size={10} className="size-2.5 text-brand" /> : null}
              </span>
              {i < CUSTOMER_TIMELINE.length - 1 ? <span className={cn('h-7 w-0.5', i < idx ? 'bg-brand' : 'bg-line')} /> : null}
            </div>
            <span className={cn('text-body', i === idx ? 'font-semibold text-ink-muted' : done ? 'text-ink-muted' : 'text-ink-soft')}>{STATUS_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
