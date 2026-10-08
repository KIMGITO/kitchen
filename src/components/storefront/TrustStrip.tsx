import type { Tenant } from '@/lib/tenant/types';
import { formatMoney } from '@/lib/commerce/money';
import { Icon, type IconName } from '@/components/ui/primitives/Icon';

/** Three quick facts that overlap the hero's bottom edge. */
export function TrustStrip({ tenant }: { tenant: Tenant }) {
  const items: { icon: IconName; title: string; text: string }[] = [
    { icon: 'money', title: 'Pay with M-Pesa', text: 'A prompt goes straight to your phone.' },
    { icon: 'clock', title: 'Live order tracking', text: 'Watch it go from accepted to ready.' },
    { icon: 'package', title: tenant.delivery_enabled ? 'Delivery & pickup' : 'Pickup', text: tenant.min_order_minor > 0 ? `Minimum order ${formatMoney(tenant.min_order_minor, tenant.currency)}.` : 'No minimum order.' },
  ];
  return (
    <div className="relative z-10 mx-auto -mt-10 w-full max-w-6xl px-4 sm:px-6 md:-mt-14">
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <li key={i.title} className="reveal flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={i.icon} size={22} /></span>
            <div><p className="text-label text-ink">{i.title}</p><p className="text-caption text-ink-soft">{i.text}</p></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
