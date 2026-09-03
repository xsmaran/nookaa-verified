import { catalog } from '@/repositories/catalog-cache';
import { AuditRepository, InventoryRepository, OutboxRepository } from '@/repositories';
import { localStore } from '@/lib/local-db';
import type {
  CartLine, InventoryLevel, InventoryTransaction, InventoryTransfer, Order, Session, TransferStatus, Unit,
} from '@/types';
import { uuid } from '@/lib/ids';
import { bus, EVENTS } from './event-bus';

export interface Shortfall {
  ingredientId: string;
  ingredientName: string;
  required: number;
  onHand: number;
  unit: Unit;
}

/** Required quantity per ingredient for one line, recipe + modifier deltas. */
function requirementsFor(line: CartLine): Map<string, number> {
  const { recipeByProduct, modifierGroupById } = catalog();
  const needed = new Map<string, number>();

  const recipe = recipeByProduct.get(line.productId);
  if (recipe) {
    recipe.items.forEach((item) => {
      // Wastage is part of what the bar actually draws, so it belongs in the
      // requirement rather than being discovered later as an unexplained loss.
      const qty = item.qty * (1 + (item.wastagePct ?? 0) / 100);
      needed.set(item.ingredientId, (needed.get(item.ingredientId) ?? 0) + qty * line.qty);
    });
  }

  line.modifiers.forEach((mod) => {
    const option = modifierGroupById.get(mod.groupId)?.options.find((o) => o.id === mod.optionId);
    option?.ingredientDelta?.forEach((delta) => {
      needed.set(delta.ingredientId, (needed.get(delta.ingredientId) ?? 0) + delta.qty * line.qty);
    });
  });

  return needed;
}

export const InventoryService = {
  /**
   * Can the bar actually make this basket right now?
   * Called before charging, not after — a customer must never pay for a drink
   * the store cannot pour.
   */
  async check(storeId: string, lines: CartLine[]): Promise<Shortfall[]> {
    const totals = new Map<string, number>();
    lines.forEach((line) => {
      requirementsFor(line).forEach((qty, id) => totals.set(id, (totals.get(id) ?? 0) + qty));
    });

    const shortfalls: Shortfall[] = [];
    for (const [ingredientId, required] of Array.from(totals)) {
      const level = await InventoryRepository.level(storeId, ingredientId);
      const ingredient = catalog().ingredientById.get(ingredientId);
      // An ingredient with no level here is one this store does not track, not
      // one it has none of. The server checks again before the order is
      // accepted, and it has the authoritative answer.
      if (!level || !ingredient) continue;
      if (level.onHand < required) {
        shortfalls.push({
          ingredientId,
          ingredientName: ingredient.name,
          required,
          onHand: level.onHand,
          unit: ingredient.unit,
        });
      }
    }
    return shortfalls;
  },

  /** Which products cannot be made at all — used to grey out the POS grid. */
  /**
   * Which drinks this store cannot make right now.
   *
   * Only decides on ingredients it actually knows the level of. Before the
   * catalog has loaded there are no levels, and treating "unknown" as "none"
   * would grey out the entire menu — which is far worse than briefly offering
   * something the bar has run out of.
   */
  async unavailableProducts(storeId: string): Promise<Set<string>> {
    const levels = await InventoryRepository.levels(storeId);
    if (levels.length === 0) return new Set();

    const onHand = new Map(levels.map((l) => [l.ingredientId, l.onHand]));
    const out = new Set<string>();

    catalog().recipeByProduct.forEach((recipe, productId) => {
      const blocked = recipe.items.some((item) => {
        const available = onHand.get(item.ingredientId);
        if (available === undefined) return false;   // not stocked here — not a block
        return available < item.qty;
      });
      if (blocked) out.add(productId);
    });

    return out;
  },

  /**
   * Consumption is posted when the drink is made (PREPARING), not when it is
   * paid for. A cancelled-before-brewing order should never eat stock.
   */
  async consumeForOrder(order: Order, userId: string, userName: string): Promise<void> {
    const totals = new Map<string, number>();
    order.items.forEach((item) => {
      const line: CartLine = {
        key: item.id,
        productId: item.productId,
        name: item.name,
        spec: item.spec,
        temp: item.temp,
        qty: item.qty,
        unitPriceMinor: item.unitPriceMinor,
        modifiers: item.modifiers,
      };
      requirementsFor(line).forEach((qty, id) => totals.set(id, (totals.get(id) ?? 0) + qty));
    });

    for (const [ingredientId, qty] of Array.from(totals)) {
      const ingredient = catalog().ingredientById.get(ingredientId);
      if (!ingredient) continue;
      const txn: InventoryTransaction = {
        id: uuid(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deviceId: order.deviceId,
        storeId: order.storeId,
        syncStatus: 'PENDING',
        syncVersion: 1,
        ingredientId,
        type: 'SALE',
        qty: -qty,
        unit: ingredient.unit,
        userId,
        userName,
        orderId: order.id,
      };
      await InventoryRepository.append(txn);
    }
    bus.emit(EVENTS.INVENTORY_CHANGED);
  },

  /** Manual movements: waste, spoilage, receiving, counts. */
  async record(params: {
    storeId: string;
    deviceId: string | null;
    ingredientId: string;
    type: InventoryTransaction['type'];
    qty: number;
    reason?: string;
    userId: string;
    userName: string;
  }): Promise<void> {
    const ingredient = catalog().ingredientById.get(params.ingredientId);
    if (!ingredient) throw new Error(`Unknown ingredient ${params.ingredientId}`);
    await InventoryRepository.append({
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: params.deviceId,
      storeId: params.storeId,
      syncStatus: 'PENDING',
      syncVersion: 1,
      ingredientId: params.ingredientId,
      type: params.type,
      qty: params.qty,
      unit: ingredient.unit,
      reason: params.reason,
      userId: params.userId,
      userName: params.userName,
    });
    bus.emit(EVENTS.INVENTORY_CHANGED);
  },
  /**
   * Recompute every on-hand figure for a store from the ledger.
   *
   * The answer to "the count looks wrong" that does not involve anyone typing
   * a number in: on-hand is a cache, the ledger is the truth, and this proves
   * it by throwing the cache away and deriving it again. Replicates the exact
   * reduction `InventoryRepository.append` applies one transaction at a time —
   * STOCK_COUNT is an absolute assertion, everything else is a signed delta —
   * just replayed in bulk, oldest first, instead of live.
   */
  async rebuild(storeId: string, session: Session | null = null): Promise<{ updated: number }> {
    const all = await localStore().list<InventoryTransaction>('inventoryTxns');
    const txns = all
      .filter((t) => t.storeId === storeId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

    const computed = new Map<string, number>();
    for (const txn of txns) {
      const prior = computed.get(txn.ingredientId) ?? 0;
      const next = txn.type === 'STOCK_COUNT' ? txn.qty : prior + txn.qty;
      computed.set(txn.ingredientId, Math.max(0, next));
    }

    const levels = await InventoryRepository.levels(storeId);
    const levelByIngredient = new Map(levels.map((l) => [l.ingredientId, l]));

    let updated = 0;
    const now = new Date().toISOString();
    for (const [ingredientId, onHand] of Array.from(computed)) {
      const existing = levelByIngredient.get(ingredientId);
      if (existing && existing.onHand === onHand) continue;
      const level: InventoryLevel = existing
        ? { ...existing, onHand, updatedAt: now }
        : { storeId, ingredientId, onHand, minStock: 0, reorderLevel: 0, targetStock: 0, updatedAt: now };
      await InventoryRepository.saveLevel(level);
      updated += 1;
    }

    await AuditRepository.record({
      session,
      entity: 'inventory',
      entityId: storeId,
      action: 'rebuilt',
      summary: `recomputed ${updated} stock level${updated === 1 ? '' : 's'} from the ledger`,
    });

    bus.emit(EVENTS.INVENTORY_CHANGED);
    return { updated };
  },

  /**
   * Move a transfer along its flow.
   *
   * Only two steps touch stock: DISPATCHED takes it off the sending store, and
   * RECEIVED puts it on the destination. That gap is deliberate — stock in a
   * van belongs to no store, and pretending otherwise makes both counts wrong.
   */
  async advanceTransfer(transfer: InventoryTransfer, to: TransferStatus, session: Session): Promise<InventoryTransfer> {
    const updated: InventoryTransfer = {
      ...transfer,
      status: to,
      updatedAt: new Date().toISOString(),
      approvedBy: to === 'APPROVED' ? session.user.id : transfer.approvedBy,
      receivedBy: to === 'RECEIVED' ? session.user.id : transfer.receivedBy,
    };

    if (to === 'DISPATCHED') {
      for (const item of transfer.items) {
        await InventoryService.record({
          storeId: transfer.fromStoreId,
          deviceId: session.deviceId,
          ingredientId: item.ingredientId,
          type: 'TRANSFER_OUT',
          qty: -Math.abs(item.qty),
          reason: `Transfer ${transfer.reference}`,
          userId: session.user.id,
          userName: session.user.name,
        });
      }
    }

    if (to === 'RECEIVED') {
      for (const item of transfer.items) {
        await InventoryService.record({
          storeId: transfer.toStoreId,
          deviceId: session.deviceId,
          ingredientId: item.ingredientId,
          type: 'TRANSFER_IN',
          qty: Math.abs(item.qty),
          reason: `Transfer ${transfer.reference}`,
          userId: session.user.id,
          userName: session.user.name,
        });
      }
    }

    await InventoryRepository.saveTransfer(updated);
    await OutboxRepository.enqueue('inventory.transfer.updated', { id: updated.id, status: to });
    bus.emit(EVENTS.INVENTORY_CHANGED);
    return updated;
  },
};
