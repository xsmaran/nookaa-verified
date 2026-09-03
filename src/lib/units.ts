import type { Unit } from '@/types';

/**
 * Units.
 *
 * The ledger only ever speaks three: grams, millilitres and pieces. Everything
 * else — a 20-litre can of milk, a 5 kg bag of beans, a case of 500 cups — is
 * converted at the point it is entered.
 *
 * The alternative, storing whatever unit the invoice happened to use, means
 * every report has to convert before it can add two rows together, and the one
 * place that forgets produces a number that is wrong by a factor of a thousand
 * without looking wrong. Convert once, on the way in.
 */

export interface PurchaseUnit {
  id: string;
  label: string;
  /** Base unit this resolves to. */
  base: Unit;
  /** How many base units one of these is worth. */
  factor: number;
}

export const PURCHASE_UNITS: PurchaseUnit[] = [
  { id: 'g', label: 'grams (g)', base: 'g', factor: 1 },
  { id: 'kg', label: 'kilograms (kg)', base: 'g', factor: 1000 },
  { id: 'ml', label: 'millilitres (ml)', base: 'ml', factor: 1 },
  { id: 'l', label: 'litres (L)', base: 'ml', factor: 1000 },
  { id: 'pc', label: 'pieces', base: 'pc', factor: 1 },
  { id: 'packet', label: 'packets', base: 'pc', factor: 1 },
  { id: 'bottle', label: 'bottles', base: 'pc', factor: 1 },
  { id: 'case', label: 'cases (24)', base: 'pc', factor: 24 },
];

const BY_ID = new Map(PURCHASE_UNITS.map((u) => [u.id, u]));

/** Purchase units that make sense for an ingredient held in `base`. */
export function purchaseUnitsFor(base: Unit): PurchaseUnit[] {
  return PURCHASE_UNITS.filter((u) => u.base === base);
}

/**
 * Convert an entered quantity into base units.
 * Throws rather than guessing when the unit does not belong to the ingredient —
 * silently treating 5 kg of milk as 5 ml is the exact failure this prevents.
 */
export function toBaseUnits(qty: number, purchaseUnitId: string, base: Unit): number {
  const unit = BY_ID.get(purchaseUnitId);
  if (!unit) throw new Error(`Unknown unit "${purchaseUnitId}".`);
  if (unit.base !== base) {
    throw new Error(`Cannot measure a ${base === 'pc' ? 'counted' : base} ingredient in ${unit.label}.`);
  }
  return qty * unit.factor;
}

/**
 * Display a base quantity in the largest unit that keeps it readable:
 * 2400 ml reads as 2.4 L, 900 ml stays 900 ml.
 */
export function formatBaseQty(qty: number, base: Unit): string {
  const abs = Math.abs(qty);
  if (base === 'pc') return `${round(qty)} pc`;
  if (base === 'g') return abs >= 1000 ? `${round(qty / 1000, 2)} kg` : `${round(qty)} g`;
  return abs >= 1000 ? `${round(qty / 1000, 2)} L` : `${round(qty)} ml`;
}

function round(value: number, places = 0): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
