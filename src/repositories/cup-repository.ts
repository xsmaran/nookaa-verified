import { localStore } from '@/lib/local-db';
import type { CupToken } from '@/types';
import { ensureSeeded } from './bootstrap';

export const CupRepository = {
  async byCupId(cupId: string): Promise<CupToken | undefined> {
    await ensureSeeded();
    return localStore().get<CupToken>('cups', cupId);
  },

  async byOrderId(orderId: string): Promise<CupToken | undefined> {
    await ensureSeeded();
    const all = await localStore().list<CupToken>('cups');
    return all.find((c) => c.orderId === orderId);
  },

  /** App-order pickup codes only — see QrService.resolve(). */
  async byPickupCode(code: string): Promise<CupToken | undefined> {
    await ensureSeeded();
    const all = await localStore().list<CupToken>('cups');
    return all.find((c) => c.pickupCode === code && !c.voided);
  },

  /** Bulk lookup for a board of order cards — one map instead of N sequential reads. */
  async byOrderIds(orderIds: string[]): Promise<Map<string, CupToken>> {
    await ensureSeeded();
    const wanted = new Set(orderIds);
    const all = await localStore().list<CupToken>('cups');
    const map = new Map<string, CupToken>();
    for (const cup of all) {
      if (wanted.has(cup.orderId)) map.set(cup.orderId, cup);
    }
    return map;
  },

  async save(cup: CupToken): Promise<void> {
    await localStore().put('cups', cup.cupId, cup);
  },

  async recordScan(cupId: string, userId: string, action: string): Promise<void> {
    const cup = await this.byCupId(cupId);
    if (!cup) return;
    await this.save({ ...cup, scans: [...cup.scans, { at: new Date().toISOString(), userId, action }] });
  },

  async recordPrint(cupId: string): Promise<void> {
    const cup = await this.byCupId(cupId);
    if (!cup) return;
    await this.save({ ...cup, printedCount: cup.printedCount + 1 });
  },
};
