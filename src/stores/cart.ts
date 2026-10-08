'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Guest/client cart, one list per tenant. Prices here are DISPLAY ONLY:
 * the server recomputes everything in create_order(). Never holds auth, orders or menu data.
 */
export interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceMinor: number;      // base + options, for display
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  notes?: string;
}

interface CartState {
  carts: Record<string, CartLine[]>;
  add: (tenantId: string, line: Omit<CartLine, 'lineId'>) => void;
  setQuantity: (tenantId: string, lineId: string, quantity: number) => void;
  remove: (tenantId: string, lineId: string) => void;
  clear: (tenantId: string) => void;
}

const sameLine = (a: Omit<CartLine, 'lineId'>, b: CartLine) =>
  a.productId === b.productId && a.notes === b.notes &&
  [...a.optionIds].sort().join() === [...b.optionIds].sort().join();

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      add: (tenantId, line) => set((s) => {
        const lines = s.carts[tenantId] ?? [];
        const existing = lines.find((l) => sameLine(line, l));
        const next = existing
          ? lines.map((l) => (l === existing ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l))
          : [...lines, { ...line, lineId: crypto.randomUUID() }];
        return { carts: { ...s.carts, [tenantId]: next } };
      }),
      setQuantity: (tenantId, lineId, quantity) => set((s) => ({
        carts: { ...s.carts, [tenantId]: (s.carts[tenantId] ?? [])
          .map((l) => (l.lineId === lineId ? { ...l, quantity } : l))
          .filter((l) => l.quantity > 0) },
      })),
      remove: (tenantId, lineId) => set((s) => ({
        carts: { ...s.carts, [tenantId]: (s.carts[tenantId] ?? []).filter((l) => l.lineId !== lineId) },
      })),
      clear: (tenantId) => set((s) => ({ carts: { ...s.carts, [tenantId]: [] } })),
    }),
    { name: 'codensons-cart', storage: createJSONStorage(() => localStorage), skipHydration: true, version: 1 },
  ),
);

export const selectLines = (tenantId: string) => (s: CartState) => s.carts[tenantId] ?? [];
export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity * l.unitPriceMinor, 0);
