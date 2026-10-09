'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/commerce/money';
import { friendlyError } from '@/lib/errors';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { requestMpesaPayment } from '@/lib/payments-client';
import { cartSubtotal, selectLines, useCartStore } from '@/stores/cart';
import Link from 'next/link';

export interface CheckoutAddress { id: string; label: string | null; address_line: string; area: string | null }
interface Props {
  tenantId: string; currency: string; pickupEnabled: boolean; deliveryEnabled: boolean; deliveryFeeMinor: number; minOrderMinor: number;
  customer: { id: string; fullName: string; phone: string | null }; addresses: CheckoutAddress[];
}

export function CheckoutForm(p: Props) {
  const router = useRouter();
  useEffect(() => { void useCartStore.persist.rehydrate(); }, []);
  const lines = useCartStore(selectLines(p.tenantId));
  const clear = useCartStore((s) => s.clear);
  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>(p.pickupEnabled ? 'pickup' : 'delivery');
  const [addressId, setAddressId] = useState(p.addresses[0]?.id ?? 'new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = cartSubtotal(lines);
  const fee = fulfilment === 'delivery' ? p.deliveryFeeMinor : 0;

  if (lines.length === 0) {
    return <EmptyState title="Your cart is empty" description="Add something from the menu before checking out."
      action={<Link href="/menu" className="inline-flex h-11 items-center rounded-pill bg-brand px-6 text-label text-brand-contrast">Browse menu</Link>} />;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const f = new FormData(e.currentTarget);
    const phone = String(f.get('phone') ?? '');
    if (subtotal < p.minOrderMinor) { setError(`Minimum order is ${formatMoney(p.minOrderMinor, p.currency)}.`); return; }
    setBusy(true);
    const supabase = createClient();
    try {
      let address: string | null = null;
      if (fulfilment === 'delivery') {
        if (addressId === 'new') {
          const line = String(f.get('address_line') ?? '').trim();
          if (line.length < 5) throw new Error('address_required');
          const { data, error: aErr } = await supabase.from('customer_addresses').insert({
            tenant_id: p.tenantId, kitchen_customer_id: p.customer.id, address_line: line,
            area: String(f.get('area') ?? '').trim() || null, instructions: String(f.get('instructions') ?? '').trim() || null,
            label: String(f.get('label') ?? '').trim() || null, is_default: p.addresses.length === 0,
          }).select('id').single();
          if (aErr || !data) throw new Error('address_required');
          address = data.id as string;
        } else address = addressId;
      }
      const { data: orderId, error: oErr } = await supabase.rpc('create_order', {
        p_tenant: p.tenantId, p_fulfilment: fulfilment, p_address: address,
        p_contact_name: p.customer.fullName, p_contact_phone: phone, p_notes: String(f.get('notes') ?? '') || null,
        p_items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, option_ids: l.optionIds, notes: l.notes ?? null })),
      });
      if (oErr || !orderId) throw new Error(oErr?.message ?? 'order_failed');

      clear(p.tenantId);
      const pay = await requestMpesaPayment(orderId as string, phone);
      router.push(`/orders/${orderId}${pay.ok ? '' : '?pay=retry'}`);
    } catch (err) {
      setBusy(false);
      setError(friendlyError((err as Error).message, 'We could not place your order. Check your connection and try again.'));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-h3">How would you like your order?</legend>
          <div className="flex gap-3">
            {p.pickupEnabled ? <ChoiceChip label="Pickup" checked={fulfilment === 'pickup'} onChange={() => setFulfilment('pickup')} /> : null}
            {p.deliveryEnabled ? <ChoiceChip label={`Delivery (+${formatMoney(p.deliveryFeeMinor, p.currency)})`} checked={fulfilment === 'delivery'} onChange={() => setFulfilment('delivery')} /> : null}
          </div>
        </fieldset>

        {fulfilment === 'delivery' ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-h3">Delivery address</legend>
            {p.addresses.map((a) => (
              <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3.5 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
                <input type="radio" name="addr" className="accent-brand" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                <span>{a.label ? `${a.label}: ` : ''}{a.address_line}{a.area ? `, ${a.area}` : ''}</span>
              </label>))}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3.5 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
              <input type="radio" name="addr" className="accent-brand" checked={addressId === 'new'} onChange={() => setAddressId('new')} /><span>Add a new address</span>
            </label>
            {addressId === 'new' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Label" name="label" placeholder="Home, Office" />
                <Input label="Area" name="area" />
                <div className="sm:col-span-2"><Input label="Street / building / house number" name="address_line" required minLength={5} /></div>
                <div className="sm:col-span-2"><Input label="Directions for the rider" name="instructions" /></div>
              </div>) : null}
          </fieldset>) : null}

        <fieldset className="flex flex-col gap-3">
          <legend className="text-h3">Pay with M-Pesa</legend>
          <PhoneInput label="M-Pesa phone number" name="phone" required defaultValue={p.customer.phone}
            hint="Safaricom number, for example 0712 345 678. You will get a prompt to enter your PIN." />
          <Input label="Note for the kitchen (optional)" name="notes" maxLength={200} />
        </fieldset>
      </div>

      <aside className="h-fit rounded-lg bg-surface-alt p-5" aria-label="Order summary">
        <ul className="flex flex-col gap-2 text-body">
          {lines.map((l) => (<li key={l.lineId} className="flex justify-between gap-3"><span>{l.quantity} × {l.name}</span><span>{formatMoney(l.unitPriceMinor * l.quantity, p.currency)}</span></li>))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-4 text-body">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(subtotal, p.currency)}</dd></div>
          <div className="flex justify-between"><dt>Delivery</dt><dd>{formatMoney(fee, p.currency)}</dd></div>
          <div className="flex justify-between text-price"><dt>Total</dt><dd>{formatMoney(subtotal + fee, p.currency)}</dd></div>
        </dl>
        {error ? <p role="alert" className="mt-3 text-caption text-danger">{error}</p> : null}
        <Button type="submit" variant="accent" size="lg" className="mt-4 w-full" loading={busy} loadingText="Placing order…">Pay {formatMoney(subtotal + fee, p.currency)}</Button>
        <p className="mt-2 text-caption text-ink-soft">Prices are confirmed by the kitchen when you place the order.</p>
      </aside>
    </form>
  );
}

function ChoiceChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-pill border border-line px-5 text-label has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-contrast">
      <input type="radio" name="fulfilment" className="sr-only" checked={checked} onChange={onChange} />{label}
    </label>
  );
}
