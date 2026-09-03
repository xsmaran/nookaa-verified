import { localStore } from '@/lib/local-db';
import { catalog, patchInventoryLevel } from './catalog-cache';
import type { InventoryLevel, InventoryTransaction, InventoryTransfer } from '@/types';

export type StockState = 'OK' | 'LOW' | 'CRITICAL' | 'OUT';

export function stockState(level: InventoryLevel): StockState {
  if (level.onHand <= 0) return 'OUT';
  if (level.onHand <= level.minStock) return 'CRITICAL';
  if (level.onHand <= level.reorderLevel) return 'LOW';
  return 'OK';
}

/**
 * Stock, as the till understands it.
 *
 * The server owns the real numbers. What lives here is the snapshot that came
 * down with the catalog, plus whatever this device has poured since — because
 * during an outage a till still has to know it is running out of milk, and the
 * only record of the last twenty drinks is local.
 *
 * The two are reconciled by the next `refreshCatalog`: the server's figure
 * wins, because it has seen every till rather than just this one.
 */
export const InventoryRepository = {
  async levels(storeId: string): Promise<InventoryLevel[]> {
    return catalog().snapshot.inventoryLevels.filter((l) => l.storeId === storeId);
  },

  async level(storeId: string, ingredientId: string): Promise<InventoryLevel | undefined> {
    const level = catalog().levelByIngredient.get(ingredientId);
    return level && level.storeId === storeId ? level : undefined;
  },

  async saveLevel(level: InventoryLevel): Promise<void> {
    patchInventoryLevel(level);
  },

  async transactions(storeId?: string, limit = 200): Promise<InventoryTransaction[]> {
    const all = await localStore().list<InventoryTransaction>('inventoryTxns');
    return all
      .filter((t) => !storeId || t.storeId === storeId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  },

  /**
   * Record a movement this device caused.
   *
   * The row is kept locally so it can be uploaded when there is a network, and
   * the cached level is adjusted immediately so the POS greys out a drink the
   * moment the last of something is used — rather than a sync later, by which
   * point it has been sold twice.
   */
  async append(txn: InventoryTransaction): Promise<void> {
    await localStore().put('inventoryTxns', txn.id, txn);

    const level = await this.level(txn.storeId ?? '', txn.ingredientId);
    // No level means the catalog has not loaded yet. The movement is still
    // recorded and will be applied by the server; there is simply nothing
    // local to adjust.
    if (!level) return;

    const onHand = txn.type === 'STOCK_COUNT' ? txn.qty : level.onHand + txn.qty;
    await this.saveLevel({ ...level, onHand: Math.max(0, onHand), updatedAt: new Date().toISOString() });
  },

  async transfers(): Promise<InventoryTransfer[]> {
    const all = await localStore().list<InventoryTransfer>('transfers');
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async saveTransfer(transfer: InventoryTransfer): Promise<void> {
    await localStore().put('transfers', transfer.id, transfer);
  },
};
