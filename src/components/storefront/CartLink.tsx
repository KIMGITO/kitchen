'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { cartCount, selectLines, useCartStore } from '@/stores/cart';

export function CartLink({ tenantId }: { tenantId: string }) {
  useEffect(() => { void useCartStore.persist.rehydrate(); }, []);
  const lines = useCartStore(selectLines(tenantId));
  const count = cartCount(lines);
  return (
    <Link href="/cart" className="rounded-pill px-3 py-2 text-label text-brand-contrast hover:bg-white/10" aria-label={`Cart, ${count} items`}>
      Cart ({count})
    </Link>
  );
}
