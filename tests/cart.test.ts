import { describe, expect, it } from 'vitest';
import { cartCount, selectLines, useCartStore } from '@/stores/cart';

describe('cart selectors', () => {
  it('returns a referentially stable empty list (prevents the useSyncExternalStore infinite loop)', () => {
    const state = useCartStore.getState();
    expect(selectLines('kitchen-a')(state)).toBe(selectLines('kitchen-a')(state));
    expect(selectLines('kitchen-a')(state)).toBe(selectLines('kitchen-b')(state));
    expect(cartCount(selectLines('kitchen-a')(state))).toBe(0);
  });
});
