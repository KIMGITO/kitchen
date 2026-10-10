'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { cartCount, selectLines, useCartStore } from '@/stores/cart';
import { Icon } from '@/components/ui/primitives/Icon';

export function CartLink({ tenantId }: { tenantId: string }) {
  useEffect(() => { void useCartStore.persist.rehydrate(); }, []);
  const lines = useCartStore(selectLines(tenantId));
  const count = cartCount(lines);
  return (
    <Link href="/cart" className="flex h-10 items-center gap-2 rounded-pill px-3 text-label text-brand-contrast hover:bg-white/10" aria-label={`Cart, ${count} items`}>
      <Icon name="cart" size={20} /><span>Cart</span>
      {count > 0 ? <span key={count} className="animate-pop grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-caption font-semibold text-accent-contrast">{count}</span> : null}
    </Link>
  );
}
