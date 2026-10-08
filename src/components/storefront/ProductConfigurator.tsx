'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ChoiceChip } from '@/components/ui/primitives/ChoiceChip';
import { Field } from '@/components/ui/primitives/Field';
import { Icon } from '@/components/ui/primitives/Icon';
import { formatMoney } from '@/lib/commerce/money';
import { useCartStore } from '@/stores/cart';

export interface OptionGroup {
  id: string; name: string; min_select: number; max_select: number;
  options: { id: string; name: string; price_delta_minor: number }[];
}
interface Props {
  tenantId: string; currency: string;
  product: { id: string; name: string; image_url: string | null; price_minor: number; is_available: boolean };
  groups: OptionGroup[];
}

export function ProductConfigurator({ tenantId, currency, product, groups }: Props) {
  const router = useRouter();
  const add = useCartStore((s) => s.add);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const chosen = useMemo(() => groups.flatMap((g) => g.options.filter((o) => selected[g.id]?.includes(o.id))), [groups, selected]);
  const unit = product.price_minor + chosen.reduce((n, o) => n + o.price_delta_minor, 0);
  const missing = groups.find((g) => (selected[g.id]?.length ?? 0) < g.min_select);

  function toggle(g: OptionGroup, id: string) {
    setSelected((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.max_select === 1) return { ...prev, [g.id]: [id] };
      return { ...prev, [g.id]: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < g.max_select ? [...cur, id] : cur };
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <Field key={g.id}>
          <legend className="text-h3 text-ink-muted font-semibold">{g.name}</legend>
          <p className="text-body text-ink-muted/70">
            {g.min_select > 0 ? `Choose ${g.min_select === g.max_select ? g.min_select : `${g.min_select}–${g.max_select}`}` : `Optional, up to ${g.max_select}`}
          </p>
          <div className="flex flex-wrap gap-3">
            {g.options.map((o) => (
              <ChoiceChip
                key={o.id} label={o.name}
                description={o.price_delta_minor > 0 ? `+${formatMoney(o.price_delta_minor, currency)}` : undefined}
                checked={selected[g.id]?.includes(o.id) ?? false}
                onChange={() => toggle(g, o.id)}
              />
            ))}
          </div>
        </Field>
      ))}

      <Field>
        <label htmlFor="notes" className="field-label">Note for the kitchen</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={2}
          className="field-input rounded-md border border-line bg-surface px-3.5 py-3 text-body text-ink-muted resize-y" />
      </Field>

      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-pill border border-line/60 bg-surface" role="group" aria-label="Quantity">
          <button type="button" className="flex size-11 items-center justify-center rounded-pill text-h3 text-ink-muted hover:bg-ink/5 transition-colors" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
            <Icon name="minus" size={16} />
          </button>
          <span className="w-8 text-center text-label font-semibold text-ink-muted" aria-live="polite">{quantity}</span>
          <button type="button" className="flex size-11 items-center justify-center rounded-pill text-h3 text-ink-muted hover:bg-ink/5 transition-colors" aria-label="Increase quantity" onClick={() => setQuantity((q) => Math.min(99, q + 1))}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        <Button variant="accent" size="lg" className="flex-1" disabled={!product.is_available || !!missing}
          onClick={() => {
            add(tenantId, {
              productId: product.id, name: product.name, imageUrl: product.image_url, unitPriceMinor: unit, quantity,
              optionIds: chosen.map((o) => o.id), optionNames: chosen.map((o) => o.name), notes: notes.trim() || undefined,
            });
            router.push('/cart');
          }}>
          {!product.is_available ? 'Sold out' : missing ? `Choose ${missing.name.toLowerCase()}` : `Add to cart • ${formatMoney(unit * quantity, currency)}`}
        </Button>
      </div>
    </div>
  );
}

