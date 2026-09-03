import type { InventoryTransaction, Order, PaymentProvider } from '@/types';
import { catalog } from '@/repositories/catalog-cache';

/**
 * Reporting maths.
 *
 * All of it derives from the order and ledger records — there is no separate
 * "analytics" write path, which is what keeps a report and a receipt agreeing.
 * The same shapes are what the backend's reporting endpoints should return.
 */

export type DateRange = 'today' | 'yesterday' | '7d' | '30d';

export function rangeBounds(range: DateRange): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'today':
      return { from: startOfToday, to: now };
    case 'yesterday':
      return { from: new Date(startOfToday.getTime() - 86400000), to: startOfToday };
    case '7d':
      return { from: new Date(startOfToday.getTime() - 6 * 86400000), to: now };
    case '30d':
      return { from: new Date(startOfToday.getTime() - 29 * 86400000), to: now };
  }
}

export function inRange(order: Order, range: DateRange): boolean {
  const { from, to } = rangeBounds(range);
  const at = new Date(order.placedAt).getTime();
  return at >= from.getTime() && at <= to.getTime();
}

const REVENUE_STATUSES = new Set(['COMPLETED', 'HANDED_OVER', 'READY', 'PREPARING', 'ACCEPTED', 'NEW']);

export interface SalesSummary {
  orders: number;
  grossMinor: number;
  netMinor: number;
  refundedMinor: number;
  discountMinor: number;
  taxMinor: number;
  itemsSold: number;
  aovMinor: number;
  cancelled: number;
  refunds: number;
}

export function summarise(orders: Order[]): SalesSummary {
  const counted = orders.filter((o) => REVENUE_STATUSES.has(o.status));
  const refunded = orders.filter((o) => o.status === 'REFUNDED');
  const grossMinor = counted.reduce((sum, o) => sum + o.totalMinor, 0);
  const refundedMinor = refunded.reduce((sum, o) => sum + o.totalMinor, 0);
  const itemsSold = counted.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
  return {
    orders: counted.length,
    grossMinor,
    netMinor: grossMinor - refundedMinor,
    refundedMinor,
    discountMinor: counted.reduce((sum, o) => sum + o.discountMinor, 0),
    taxMinor: counted.reduce((sum, o) => sum + o.taxMinor, 0),
    itemsSold,
    aovMinor: counted.length ? Math.round(grossMinor / counted.length) : 0,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
    refunds: refunded.length,
  };
}

/** Median beats mean here: one forgotten cup should not move the number. */
export function medianPrepSeconds(orders: Order[]): number {
  const durations = orders
    .filter((o) => o.acceptedAt && o.readyAt)
    .map((o) => (new Date(o.readyAt!).getTime() - new Date(o.acceptedAt!).getTime()) / 1000)
    .sort((a, b) => a - b);
  if (durations.length === 0) return 0;
  const mid = Math.floor(durations.length / 2);
  return Math.round(durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2);
}

export function medianCompletionSeconds(orders: Order[]): number {
  const durations = orders
    .filter((o) => o.completedAt)
    .map((o) => (new Date(o.completedAt!).getTime() - new Date(o.placedAt).getTime()) / 1000)
    .sort((a, b) => a - b);
  if (durations.length === 0) return 0;
  const mid = Math.floor(durations.length / 2);
  return Math.round(durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2);
}

export function byPaymentMethod(orders: Order[]): Array<{ provider: PaymentProvider; count: number; amountMinor: number }> {
  const map = new Map<PaymentProvider, { count: number; amountMinor: number }>();
  orders
    .filter((o) => o.paymentStatus === 'PAID' && o.paymentProvider)
    .forEach((o) => {
      const key = o.paymentProvider as PaymentProvider;
      const entry = map.get(key) ?? { count: 0, amountMinor: 0 };
      map.set(key, { count: entry.count + 1, amountMinor: entry.amountMinor + o.totalMinor });
    });
  return Array.from(map, ([provider, v]) => ({ provider, ...v })).sort((a, b) => b.amountMinor - a.amountMinor);
}

export function topProducts(orders: Order[], limit = 8): Array<{ productId: string; name: string; spec: string; qty: number; revenueMinor: number }> {
  const map = new Map<string, { qty: number; revenueMinor: number }>();
  orders.forEach((o) =>
    o.items.forEach((item) => {
      const entry = map.get(item.productId) ?? { qty: 0, revenueMinor: 0 };
      map.set(item.productId, { qty: entry.qty + item.qty, revenueMinor: entry.revenueMinor + item.lineTotalMinor });
    }),
  );
  return Array.from(map, ([productId, v]) => ({
    productId,
    name: catalog().productById.get(productId)?.name ?? productId,
    spec: catalog().productById.get(productId)?.spec ?? '',
    ...v,
  }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function byCategory(orders: Order[]): Array<{ categoryId: string; name: string; qty: number; revenueMinor: number }> {
  const map = new Map<string, { qty: number; revenueMinor: number }>();
  orders.forEach((o) =>
    o.items.forEach((item) => {
      const categoryId = catalog().productById.get(item.productId)?.categoryId ?? 'unknown';
      const entry = map.get(categoryId) ?? { qty: 0, revenueMinor: 0 };
      map.set(categoryId, { qty: entry.qty + item.qty, revenueMinor: entry.revenueMinor + item.lineTotalMinor });
    }),
  );
  return Array.from(map, ([categoryId, v]) => ({
    categoryId,
    name: catalog().categoryById.get(categoryId)?.name ?? 'Unknown',
    ...v,
  })).sort((a, b) => b.revenueMinor - a.revenueMinor);
}

/** Orders per hour of day — the shape that decides staffing. */
export function byHour(orders: Order[]): Array<{ hour: number; orders: number; revenueMinor: number }> {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenueMinor: 0 }));
  orders.forEach((o) => {
    const hour = new Date(o.placedAt).getHours();
    buckets[hour].orders += 1;
    buckets[hour].revenueMinor += o.totalMinor;
  });
  return buckets;
}

export function bySource(orders: Order[]): { app: number; counter: number } {
  return {
    app: orders.filter((o) => o.source === 'APP').length,
    counter: orders.filter((o) => o.source === 'OFFLINE_POS').length,
  };
}

export function wasteValueMinor(txns: InventoryTransaction[], costLookup: (id: string) => number): number {
  return txns
    .filter((t) => t.type === 'WASTE' || t.type === 'SPOILAGE')
    .reduce((sum, t) => sum + Math.abs(t.qty) * costLookup(t.ingredientId), 0);
}

export function repeatCustomerRate(orders: Order[]): number {
  const withCustomer = orders.filter((o) => o.customerId);
  if (withCustomer.length === 0) return 0;
  const counts = new Map<string, number>();
  withCustomer.forEach((o) => counts.set(o.customerId!, (counts.get(o.customerId!) ?? 0) + 1));
  const repeat = Array.from(counts.values()).filter((n) => n > 1).length;
  return Math.round((repeat / counts.size) * 100);
}
