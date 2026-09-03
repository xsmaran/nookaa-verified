import { localStore } from '@/lib/local-db';
import type { Order, OrderStatus } from '@/types';
import { ensureSeeded } from './bootstrap';

export interface OrderQuery {
  storeId?: string;
  statuses?: OrderStatus[];
  source?: Order['source'];
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export const OrderRepository = {
  async all(): Promise<Order[]> {
    await ensureSeeded();
    return localStore().list<Order>('orders');
  },

  async byId(id: string): Promise<Order | undefined> {
    await ensureSeeded();
    return localStore().get<Order>('orders', id);
  },

  async byCupId(cupId: string): Promise<Order | undefined> {
    const orders = await this.all();
    return orders.find((o) => o.cupId === cupId);
  },

  async byOrderNumber(orderNumber: string): Promise<Order | undefined> {
    const orders = await this.all();
    const needle = orderNumber.trim().toUpperCase();
    return orders.find((o) => o.orderNumber.toUpperCase() === needle || o.orderNumber.endsWith(needle.padStart(4, '0')));
  },

  async query(q: OrderQuery): Promise<Order[]> {
    const orders = await this.all();
    const needle = q.search?.trim().toLowerCase();
    const filtered = orders.filter((o) => {
      if (q.storeId && o.storeId !== q.storeId) return false;
      if (q.statuses && !q.statuses.includes(o.status)) return false;
      if (q.source && o.source !== q.source) return false;
      if (q.from && o.placedAt < q.from) return false;
      if (q.to && o.placedAt > q.to) return false;
      if (needle) {
        const haystack = [o.orderNumber, o.customerName, o.customerPhone ?? '', o.cupId ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
    return q.limit ? filtered.slice(0, q.limit) : filtered;
  },

  async save(order: Order): Promise<Order> {
    await localStore().put('orders', order.id, order);
    return order;
  },

  async nextSequence(storeId: string): Promise<number> {
    const orders = await this.all();
    const today = new Date().toDateString();
    const todays = orders.filter((o) => o.storeId === storeId && new Date(o.placedAt).toDateString() === today);
    return todays.reduce((max, o) => Math.max(max, o.sequence), 0) + 1;
  },
};
