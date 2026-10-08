'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/commerce/money';
import { cartSubtotal, selectLines, useCartStore } from '@/stores/cart';

export function CartView({ tenantId, currency, minOrderMinor }: { tenantId: string; currency: string; minOrderMinor: number }) {
  const lines = useCartStore(selectLines(tenantId));
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);

  if (lines.length === 0) {
    return <EmptyState title="Your cart is empty" description="Add something from the menu to get started."
      action={<Link href="/menu" className="inline-flex h-11 items-center rounded-pill bg-brand px-6 text-label text-brand-contrast">Browse menu</Link>} />;
  }
  const subtotal = cartSubtotal(lines);
  const belowMin = subtotal < minOrderMinor;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.lineId} className="flex gap-4 py-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-surface">
              {l.imageUrl ? <Image src={l.imageUrl} alt="" fill sizes="80px" className="object-cover object-top" /> : null}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <p className="text-h3 text-ink-muted">{l.name}</p>
              {l.optionNames.length ? <p className="text-caption text-ink-soft">{l.optionNames.join(', ')}</p> : null}
              {l.notes ? <p className="text-caption text-ink-soft">Note: {l.notes}</p> : null}
              <div className="mt-auto flex items-center justify-between gap-3">
                <div className="flex items-center rounded-pill border border-line/60 bg-surface" role="group" aria-label={`Quantity for ${l.name}`}>
                  <button type="button" className="flex size-9 items-center justify-center rounded-pill text-h3 text-ink-muted hover:bg-ink/5 transition-colors" aria-label="Decrease quantity" onClick={() => setQuantity(tenantId, l.lineId, l.quantity - 1)}>−</button>
                  <span className="w-7 text-center text-label font-semibold text-ink-muted">{l.quantity}</span>
                  <button type="button" className="flex size-9 items-center justify-center rounded-pill text-h3 text-ink-muted hover:bg-ink/5 transition-colors" aria-label="Increase quantity" onClick={() => setQuantity(tenantId, l.lineId, Math.min(99, l.quantity + 1))}>+</button>
                </div>
                <button type="button" className="text-caption text-ink-soft underline hover:text-ink-muted" onClick={() => remove(tenantId, l.lineId)}>Remove</button>
              </div>
            </div>
            <p className="text-price text-ink-muted">{formatMoney(l.unitPriceMinor * l.quantity, currency)}</p>
          </li>
        ))}
      </ul>
      <aside className="h-fit rounded-lg border border-line bg-surface p-5 shadow-card" aria-label="Order summary">
        <div className="flex justify-between text-body"><span className="text-ink-muted">Subtotal</span><span className="text-price">{formatMoney(subtotal, currency)}</span></div>
        <p className="mt-1 text-caption text-ink-soft">Delivery fee and the final total are confirmed at checkout.</p>
        {belowMin ? <p role="status" className="mt-3 text-caption font-semibold text-danger">Minimum order is {formatMoney(minOrderMinor, currency)}.</p> : null}
        <Link href="/checkout" aria-disabled={belowMin} className={`mt-4 inline-flex h-12 w-full items-center justify-center rounded-pill bg-accent px-6 text-body-lg font-semibold text-accent-contrast transition-colors ${belowMin ? "pointer-events-none opacity-55" : "hover:bg-accent/90"}`}>Checkout</Link>
      </aside>
    </div>
  );
}

