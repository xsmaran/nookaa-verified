import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { DomainError } from '@/lib/errors';
import { AuditRepository } from '@/repositories/audit-repository';
import { CustomerRepository } from '@/repositories/customer-repository';
import { bus, EVENTS } from './event-bus';
import type { Customer, NooksTransaction, Session } from '@/types';

/**
 * Nooks — the in-app loyalty coin.
 *
 * Earned automatically on every paid order that has a real customer attached
 * (counter sales, and the subset of app orders placed by a known loyalty
 * member — see realtime-service.ts). Spendable only through the app: nothing
 * in the counter checkout path (charge-sheet.tsx) ever calls redeem() here,
 * and that is the whole enforcement — there is no separate permission check
 * to bypass, because there is no code path to bypass.
 *
 * The balance on a Customer record is a cache, not the source of truth — the
 * ledger (`nooksTransactions`) is, same as inventory levels are derived from
 * the movement ledger. Every change writes one row and recomputes the
 * balance from it, so "why is this number what it is" always has an answer.
 */

export interface LoyaltySettings {
  enabled: boolean;
  earnPerRupees: number;
  redeemValuePaise: number;
}

const DEFAULT_SETTINGS: LoyaltySettings = { enabled: true, earnPerRupees: 10, redeemValuePaise: 100 };

async function settings(): Promise<LoyaltySettings> {
  const all = await localStore().get<Record<string, Record<string, unknown>>>('settings', 'current');
  const loyalty = all?.loyalty as Partial<LoyaltySettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...loyalty };
}

async function record(
  customer: Customer,
  type: NooksTransaction['type'],
  amount: number,
  opts: { storeId?: string | null; orderId?: string | null; reason?: string } = {},
): Promise<NooksTransaction> {
  // Re-read the balance immediately before writing rather than trusting
  // whatever snapshot the caller is holding — two redemptions against the
  // same customer landing close together (the demo's "simulate an app
  // order" button, clicked repeatedly) would otherwise both compute from the
  // same stale number and the second write would silently clobber the first.
  const current = (await CustomerRepository.byId(customer.id)) ?? customer;
  const balanceAfter = Math.max(0, (current.nooksBalance ?? 0) + amount);
  await CustomerRepository.setNooksBalance(customer.id, balanceAfter);

  const txn: NooksTransaction = {
    id: uuid(),
    customerId: customer.id,
    customerName: customer.name,
    storeId: opts.storeId ?? null,
    orderId: opts.orderId ?? null,
    type,
    amount,
    balanceAfter,
    reason: opts.reason,
    createdAt: new Date().toISOString(),
  };
  await localStore().put('nooksTransactions', txn.id, txn);
  bus.emit(EVENTS.NOOKS_CHANGED, { customerId: customer.id });
  return txn;
}

export const NooksService = {
  settings,

  /** Nooks a spend of this size would earn, at the current rate — for previewing before the order exists. */
  async earnPreview(amountMinor: number): Promise<number> {
    const s = await settings();
    if (!s.enabled) return 0;
    return Math.floor(amountMinor / 100 / s.earnPerRupees);
  },

  /** Credit Nooks for a paid order. Silently does nothing if loyalty is off or the spend earns none. */
  async earnFor(customer: Customer, amountMinor: number, storeId: string | null, orderId: string): Promise<NooksTransaction | null> {
    const nooks = await this.earnPreview(amountMinor);
    if (nooks <= 0) return null;
    return record(customer, 'EARNED', nooks, { storeId, orderId, reason: `Earned on order` });
  },

  /**
   * Spend Nooks for a discount, app orders only — see the file doc comment.
   * Returns the discount in paise this many Nooks are worth.
   */
  async redeemForAppOrder(customer: Customer, nooks: number, storeId: string | null, orderId: string): Promise<number> {
    if (nooks <= 0) return 0;
    if ((customer.nooksBalance ?? 0) < nooks) {
      throw new DomainError(`${customer.name} only has ${customer.nooksBalance ?? 0} Nooks.`);
    }
    const s = await settings();
    await record(customer, 'REDEEMED', -nooks, { storeId, orderId, reason: 'Redeemed in app' });
    return nooks * s.redeemValuePaise;
  },

  /** A manual admin correction — the one write here an audit entry is worth, since nothing else forced it. */
  async adjust(customer: Customer, delta: number, reason: string, session: Session): Promise<NooksTransaction> {
    if (!reason.trim()) throw new DomainError('An adjustment needs a reason.');
    const txn = await record(customer, 'ADJUSTED', delta, { storeId: session.storeId, reason: reason.trim() });
    await AuditRepository.record({
      session, entity: 'nooks', entityId: customer.id, entityLabel: customer.name,
      action: delta >= 0 ? 'credited' : 'debited',
      after: txn, reason: reason.trim(),
      summary: `${delta >= 0 ? '+' : ''}${delta} Nooks for ${customer.name} — ${reason.trim()}`,
    });
    return txn;
  },

  async ledger(filters: { customerId?: string; type?: NooksTransaction['type'] } = {}): Promise<NooksTransaction[]> {
    const all = await localStore().list<NooksTransaction>('nooksTransactions');
    return all
      .filter((t) => !filters.customerId || t.customerId === filters.customerId)
      .filter((t) => !filters.type || t.type === filters.type)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async summary(): Promise<{ issued: number; redeemed: number; activeBalance: number; members: number }> {
    const [txns, customers] = await Promise.all([localStore().list<NooksTransaction>('nooksTransactions'), CustomerRepository.all()]);
    const issued = txns.filter((t) => t.type === 'EARNED').reduce((s, t) => s + t.amount, 0);
    const redeemed = txns.filter((t) => t.type === 'REDEEMED').reduce((s, t) => s + -t.amount, 0);
    const active = customers.filter((c) => (c.nooksBalance ?? 0) > 0);
    return {
      issued,
      redeemed,
      activeBalance: active.reduce((s, c) => s + (c.nooksBalance ?? 0), 0),
      members: active.length,
    };
  },
};
