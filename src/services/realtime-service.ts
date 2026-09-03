import { buildOrderNumber, uuid } from '@/lib/ids';
import { calculateTotals } from '@/lib/pricing';

import { catalog } from '@/repositories/catalog-cache';
import { CustomerRepository } from '@/repositories/customer-repository';
import { NooksService } from './nooks-service';
import type { Customer, Discount } from '@/types';

/**
 * Names for simulated app orders.
 *
 * Real customers are the server's business; this stream exists so the board
 * has something moving through it during a demo, and using a real customer
 * record would attach a fabricated order to a real person's history.
 */
const APP_CUSTOMER_NAMES = [
  'Rahul D.', 'Priya N.', 'Arjun M.', 'Meera I.', 'Kabir A.', 'Ananya B.', 'Zoya S.',
];
import { OrderRepository } from '@/repositories';
import type { CartLine, Order } from '@/types';
import { bus, EVENTS } from './event-bus';

/**
 * Incoming app orders.
 *
 * Production uses Server-Sent Events from the store's channel with a polling
 * fallback — the reasoning is in /docs/17-realtime.md. This mock drops a new
 * app order into the queue every so often so the incoming-order path can be
 * exercised end to end without a backend.
 *
 * STATUS: MOCK stream. Disabled by default; the POS header toggles it.
 */
class Realtime {
  private timer: ReturnType<typeof setTimeout> | null = null;
  enabled = false;

  start(storeId: string, everyMs = 45_000): void {
    this.stop();
    this.enabled = true;
    const tick = async () => {
      await this.injectAppOrder(storeId);
      this.timer = setTimeout(tick, everyMs + Math.random() * everyMs);
    };
    this.timer = setTimeout(tick, everyMs);
  }

  stop(): void {
    this.enabled = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Also callable by hand from the POS header — "Simulate app order". */
  async injectAppOrder(storeId: string): Promise<Order | null> {
    const { storeById, snapshot, defaultTax } = catalog();
    const store = storeById.get(storeId) ?? snapshot.store;
    // Nothing can be simulated before the catalog has loaded, and inventing a
    // drink to fill the gap would put an order in the board for something the
    // menu does not contain.
    const sellable = snapshot.products.filter((p) => p.active && p.available);
    if (!store || sellable.length === 0) return null;

    const count = 1 + Math.floor(Math.random() * 2);
    const lines: CartLine[] = Array.from({ length: count }, () => {
      const product = sellable[Math.floor(Math.random() * sellable.length)];
      return {
        key: uuid(),
        productId: product.id,
        name: product.name,
        spec: product.spec,
        temp: product.temp,
        qty: 1,
        unitPriceMinor: product.priceMinor,
        modifiers: [],
      };
    });

    /*
     * Nooks redemption, simulated. Most app orders stay anonymous by design
     * (see the note above on APP_CUSTOMER_NAMES) — there is no real customer
     * behind them to credit or debit. A minority instead stand in for a
     * known loyalty member ordering through the app and spending some of
     * what they've earned at the counter, which is the only place in this
     * codebase "redeemed in app" can actually be demonstrated end to end.
     */
    let discount: Discount | null = null;
    let redeemingCustomer: Customer | null = null;
    let nooksToRedeem = 0;
    if (Math.random() < 0.35) {
      const members = (await CustomerRepository.all()).filter((c) => (c.nooksBalance ?? 0) > 0);
      if (members.length > 0) {
        redeemingCustomer = members[Math.floor(Math.random() * members.length)];
        const balance = redeemingCustomer.nooksBalance ?? 0;
        const loyalty = await NooksService.settings();
        // Real programs cap how much of a basket points can cover — a ₹0
        // order because someone had a large balance reads as broken, not
        // generous. Half the basket is the ceiling here regardless of
        // balance; a small remainder is always left to actually pay.
        const roughSubtotal = lines.reduce((s, l) => s + l.unitPriceMinor * l.qty, 0);
        const maxRedeemableNooks = Math.floor((roughSubtotal * 0.5) / loyalty.redeemValuePaise);
        const wanted = Math.round(balance * (0.3 + Math.random() * 0.7));
        nooksToRedeem = Math.max(0, Math.min(wanted, maxRedeemableNooks));

        if (nooksToRedeem > 0) {
          discount = {
            id: 'nooks-redeem', code: 'NOOKS', name: 'Nooks redeemed', kind: 'FLAT',
            value: nooksToRedeem * loyalty.redeemValuePaise, minOrderMinor: 0, maxDiscountMinor: null,
            startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, usageCount: 0,
            productIds: [], categoryIds: [], storeIds: [], requiresApproval: false, active: true, archivedAt: null,
          };
        } else {
          // Nothing worth redeeming this time — still a known loyalty member, just not spending points today.
          redeemingCustomer = null;
        }
      }
    }

    const totals = calculateTotals(lines, defaultTax, discount);
    // A flat discount can exceed a small basket; redeem only what the order actually used.
    if (redeemingCustomer && discount) nooksToRedeem = Math.round(totals.discountMinor / (await NooksService.settings()).redeemValuePaise);

    const sequence = await OrderRepository.nextSequence(storeId);
    const now = new Date();
    const nowIso = now.toISOString();

    const order: Order = {
      id: uuid(),
      createdAt: nowIso,
      updatedAt: nowIso,
      deviceId: null,
      storeId,
      syncStatus: 'SYNCED',
      syncVersion: 1,
      orderNumber: buildOrderNumber(store.code, sequence, now),
      organizationId: store.organizationId,
      sequence,
      status: 'NEW',
      source: 'APP',
      type: 'PICKUP',
      priority: 'NORMAL',
      customerId: redeemingCustomer?.id ?? null,
      customerName: redeemingCustomer?.name ?? APP_CUSTOMER_NAMES[Math.floor(Math.random() * APP_CUSTOMER_NAMES.length)],
      customerPhone: redeemingCustomer?.phone ?? null,
      items: lines.map((line) => ({
        id: line.key,
        productId: line.productId,
        name: line.name,
        spec: line.spec,
        temp: line.temp,
        qty: line.qty,
        unitPriceMinor: line.unitPriceMinor,
        modifiers: [],
        lineTotalMinor: line.unitPriceMinor * line.qty,
      })),
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      discountCode: discount?.code ?? null,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      cupId: null,
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      invoiceId: null,
      history: [
        { id: uuid(), status: 'NEW', at: nowIso, userId: null, userName: 'NOOKAA app', deviceId: null },
      ],
      placedAt: nowIso,
      promisedAt: new Date(now.getTime() + 12 * 60_000).toISOString(),
      notificationLog: [],
      createdByUserId: 'app',
      createdByName: 'NOOKAA app',
    };

    await OrderRepository.save(order);

    if (redeemingCustomer && nooksToRedeem > 0) {
      await NooksService.redeemForAppOrder(redeemingCustomer, nooksToRedeem, storeId, order.id).catch(() => undefined);
    }
    if (redeemingCustomer) {
      // Earn on the final paid amount — after their own redemption reduced it.
      await NooksService.earnFor(redeemingCustomer, order.totalMinor, storeId, order.id).catch(() => undefined);
    }

    bus.emit(EVENTS.ORDERS_CHANGED, { incoming: order.id });
    bus.emit(EVENTS.TOAST, { tone: 'info', message: `New app order ${order.orderNumber}` });
    return order;
  }
}

export const RealtimeService = new Realtime();
