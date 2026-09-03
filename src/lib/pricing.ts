import type { CartLine, Discount, TaxRate } from '@/types';

export interface Totals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function lineTotal(line: CartLine): number {
  const mods = line.modifiers.reduce((sum, m) => sum + m.priceMinor, 0);
  return (line.unitPriceMinor + mods) * line.qty;
}

/**
 * GST on beverages is applied on the discounted value. Rounding happens once,
 * at the end, on the tax figure — never per line — so the printed invoice and
 * the Razorpay charge always agree to the paisa.
 */
export function calculateTotals(lines: CartLine[], taxRate: TaxRate, discount?: Discount | null): Totals {
  const subtotalMinor = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  let discountMinor = 0;
  if (discount) {
    discountMinor =
      discount.kind === 'PERCENT'
        ? Math.round((subtotalMinor * discount.value) / 10000)
        : Math.min(discount.value, subtotalMinor);
    if (discount.maxDiscountMinor) discountMinor = Math.min(discountMinor, discount.maxDiscountMinor);
  }

  const taxable = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = taxRate.inclusive
    ? Math.round(taxable - (taxable * 10000) / (10000 + taxRate.rateBps))
    : Math.round((taxable * taxRate.rateBps) / 10000);

  const totalMinor = taxRate.inclusive ? taxable : taxable + taxMinor;
  return { subtotalMinor, discountMinor, taxMinor, totalMinor };
}
