import { localStore } from '@/lib/local-db';
import type { Invoice, Payment, Refund } from '@/types';
import { ensureSeeded } from './bootstrap';

/** Financial records are append-only. Nothing here deletes. */
export const PaymentRepository = {
  async all(storeId?: string): Promise<Payment[]> {
    await ensureSeeded();
    const all = await localStore().list<Payment>('payments');
    return all.filter((p) => !storeId || p.storeId === storeId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async byId(id: string): Promise<Payment | undefined> {
    await ensureSeeded();
    return localStore().get<Payment>('payments', id);
  },

  async byOrderId(orderId: string): Promise<Payment | undefined> {
    const all = await this.all();
    return all.find((p) => p.orderId === orderId);
  },

  async save(payment: Payment): Promise<void> {
    await localStore().put('payments', payment.id, payment);
  },

  async invoices(storeId?: string): Promise<Invoice[]> {
    await ensureSeeded();
    const all = await localStore().list<Invoice>('invoices');
    return all.filter((i) => !storeId || i.storeId === storeId).sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  },

  async invoiceById(id: string): Promise<Invoice | undefined> {
    await ensureSeeded();
    return localStore().get<Invoice>('invoices', id);
  },

  async invoiceByOrderId(orderId: string): Promise<Invoice | undefined> {
    const all = await this.invoices();
    return all.find((i) => i.orderId === orderId);
  },

  async saveInvoice(invoice: Invoice): Promise<void> {
    await localStore().put('invoices', invoice.id, invoice);
  },

  async refunds(): Promise<Refund[]> {
    await ensureSeeded();
    const all = await localStore().list<Refund>('refunds');
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async saveRefund(refund: Refund): Promise<void> {
    await localStore().put('refunds', refund.id, refund);
  },
};
