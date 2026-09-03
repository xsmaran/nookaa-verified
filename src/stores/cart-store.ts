'use client';

import { create } from 'zustand';
import type { CartLine, ModifierGroup, OrderItemModifier, Product } from '@/types';
import { uuid } from '@/lib/ids';

interface CartState {
  lines: CartLine[];
  customerName: string;
  customerPhone: string;
  discountCode: string | null;
  add: (product: Product, modifiers?: OrderItemModifier[], note?: string) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  setNote: (key: string, note: string) => void;
  setCustomer: (name: string, phone: string) => void;
  setDiscount: (code: string | null) => void;
  clear: () => void;
  count: () => number;
}

/** Two lines merge only if the product AND every modifier match exactly. */
function signature(productId: string, modifiers: OrderItemModifier[], note?: string): string {
  const mods = [...modifiers].map((m) => m.optionId).sort().join('|');
  return `${productId}::${mods}::${note ?? ''}`;
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  customerName: '',
  customerPhone: '',
  discountCode: null,

  add: (product, modifiers = [], note) => {
    const sig = signature(product.id, modifiers, note);
    const lines = get().lines;
    const existing = lines.find((l) => signature(l.productId, l.modifiers, l.note) === sig);
    if (existing) {
      set({ lines: lines.map((l) => (l.key === existing.key ? { ...l, qty: l.qty + 1 } : l)) });
      return;
    }
    set({
      lines: [
        ...lines,
        {
          key: uuid(),
          productId: product.id,
          name: product.name,
          spec: product.spec,
          temp: product.temp,
          qty: 1,
          unitPriceMinor: product.priceMinor,
          modifiers,
          note,
        },
      ],
    });
  },

  setQty: (key, qty) =>
    set({ lines: qty <= 0 ? get().lines.filter((l) => l.key !== key) : get().lines.map((l) => (l.key === key ? { ...l, qty } : l)) }),

  removeLine: (key) => set({ lines: get().lines.filter((l) => l.key !== key) }),

  setNote: (key, note) => set({ lines: get().lines.map((l) => (l.key === key ? { ...l, note } : l)) }),

  setCustomer: (customerName, customerPhone) => set({ customerName, customerPhone }),

  setDiscount: (discountCode) => set({ discountCode }),

  clear: () => set({ lines: [], customerName: '', customerPhone: '', discountCode: null }),

  count: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
}));

/** Default selections for a product's required modifier groups. */
export function defaultModifiers(groups: ModifierGroup[]): OrderItemModifier[] {
  return groups
    .filter((g) => g.required)
    .map((g) => {
      const option = g.options.find((o) => o.isDefault) ?? g.options[0];
      return { groupId: g.id, optionId: option.id, name: option.name, priceMinor: option.priceMinor };
    });
}
