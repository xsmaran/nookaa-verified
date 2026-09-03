import { localStore } from '@/lib/local-db';
import type { Customer } from '@/types';
import { uuid } from '@/lib/ids';
import { ensureSeeded } from './bootstrap';

export const CustomerRepository = {
  async all(): Promise<Customer[]> {
    await ensureSeeded();
    return localStore().list<Customer>('customers');
  },

  async byId(id: string): Promise<Customer | undefined> {
    await ensureSeeded();
    return localStore().get<Customer>('customers', id);
  },

  async byPhone(phone: string): Promise<Customer | undefined> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) return undefined;
    const all = await this.all();
    return all.find((c) => c.phone.replace(/\D/g, '').endsWith(digits));
  },

  async search(term: string): Promise<Customer[]> {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];
    const all = await this.all();
    return all
      .filter((c) => c.name.toLowerCase().includes(needle) || c.phone.includes(needle.replace(/\D/g, '')))
      .slice(0, 8);
  },

  /** Walk-ins become customers the moment they give a phone number. */
  async upsert(name: string, phone: string | null): Promise<Customer | null> {
    if (!phone) return null;
    const existing = await this.byPhone(phone);
    if (existing) return existing;
    const customer: Customer = {
      id: uuid(),
      name: name || 'Guest',
      phone,
      createdAt: new Date().toISOString(),
      totalOrders: 0,
      totalSpendMinor: 0,
      lastOrderAt: null,
    };
    await localStore().put('customers', customer.id, customer);
    return customer;
  },

  async recordOrder(customerId: string, amountMinor: number, productId?: string): Promise<void> {
    const customer = await this.byId(customerId);
    if (!customer) return;
    const updated: Customer = {
      ...customer,
      totalOrders: customer.totalOrders + 1,
      totalSpendMinor: customer.totalSpendMinor + amountMinor,
      lastOrderAt: new Date().toISOString(),
      favouriteProductId: customer.favouriteProductId ?? productId ?? null,
    };
    await localStore().put('customers', updated.id, updated);
  },

  /** The write side of a Nooks balance — see nooks-service.ts, which owns the arithmetic and the ledger row. */
  async setNooksBalance(customerId: string, balance: number): Promise<void> {
    const customer = await this.byId(customerId);
    if (!customer) return;
    await localStore().put('customers', customerId, { ...customer, nooksBalance: balance });
  },
};
