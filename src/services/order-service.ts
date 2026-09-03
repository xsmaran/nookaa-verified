import { DomainError } from '@/lib/errors';
import { buildOrderNumber, uuid } from '@/lib/ids';
import { isTransitionAllowed, STATUS_LABEL } from '@/lib/order-state';
import { calculateTotals } from '@/lib/pricing';
import { catalog } from '@/repositories/catalog-cache';
import { CustomerRepository, OrderRepository, OutboxRepository, PaymentRepository } from '@/repositories';
import type {
  CartLine,
  Order,
  OrderItem,
  OrderSource,
  OrderStatus,
  OrderType,
  Payment,
  PaymentProvider,
  Session,
} from '@/types';
import { bus, EVENTS } from './event-bus';
import { InventoryService } from './inventory-service';
import { InvoiceService } from './invoice-service';
import { NooksService } from './nooks-service';
import { NotificationService } from './notification-service';
import { PaymentService } from './payment-service';
import { QrService } from './qr-service';

/**
 * Order lifecycle.
 *
 * Every write in the app funnels through here so that four things always
 * happen together: the record changes, the status history grows, the outbox
 * gets an event, and the UI is told. Screens never mutate an order themselves.
 */

export interface CreateOrderInput {
  session: Session;
  lines: CartLine[];
  customerName: string;
  customerPhone: string | null;
  source: OrderSource;
  provider: PaymentProvider;
  tenderedMinor?: number;
  discountCode?: string | null;
  /** Dine-in vs takeaway, chosen on the charge screen. Defaults to takeaway. */
  type?: OrderType;
}

function toOrderItems(lines: CartLine[]): OrderItem[] {
  return lines.map((line) => ({
    id: line.key,
    productId: line.productId,
    name: line.name,
    spec: line.spec,
    temp: line.temp,
    qty: line.qty,
    unitPriceMinor: line.unitPriceMinor,
    modifiers: line.modifiers,
    note: line.note,
    lineTotalMinor: (line.unitPriceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0)) * line.qty,
  }));
}

export const OrderService = {
  /**
   * Offline counter sale: create, charge, issue the cup, print, notify.
   * The whole thing is local-first — nothing below needs the network.
   */
  async createOfflineOrder(input: CreateOrderInput): Promise<{ order: Order; payment: Payment }> {
    const { session } = input;
    const { storeById, defaultTax, snapshot } = catalog();
    const store = storeById.get(session.storeId) ?? snapshot.store;
    if (!store) throw new Error('This device is not assigned to a store. Sign out and pick a store again.');

    // The code is looked up locally only to price the basket for display and
    // for an offline sale. The authoritative amount is decided by the server —
    // /api/discounts/check when online, and again when the order syncs.
    const discount = input.discountCode
      ? snapshot.discounts.find((d) => d.code === input.discountCode) ?? null
      : null;
    const totals = calculateTotals(input.lines, defaultTax, discount);
    const sequence = await OrderRepository.nextSequence(session.storeId);
    const now = new Date();
    const nowIso = now.toISOString();

    const customer = await CustomerRepository.upsert(input.customerName, input.customerPhone);

    let order: Order = {
      id: uuid(),
      createdAt: nowIso,
      updatedAt: nowIso,
      deviceId: session.deviceId,
      storeId: session.storeId,
      syncStatus: 'PENDING',
      syncVersion: 1,
      orderNumber: buildOrderNumber(store.code, sequence, now),
      organizationId: store.organizationId,
      sequence,
      status: 'NEW',
      source: input.source,
      type: input.type ?? 'TAKEAWAY',
      priority: 'NORMAL',
      customerId: customer?.id ?? null,
      customerName: input.customerName || 'Guest',
      customerPhone: input.customerPhone,
      items: toOrderItems(input.lines),
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      discountCode: discount?.code ?? null,
      cupId: null,
      paymentStatus: 'PENDING',
      invoiceId: null,
      history: [
        { id: uuid(), status: 'NEW', at: nowIso, userId: session.user.id, userName: session.user.name, deviceId: session.deviceId },
      ],
      placedAt: nowIso,
      notificationLog: [],
      createdByUserId: session.user.id,
      createdByName: session.user.name,
    };

    await OrderRepository.save(order);

    const payment = await PaymentService.charge({ order, provider: input.provider, tenderedMinor: input.tenderedMinor });
    order = {
      ...order,
      paymentId: payment.id,
      paymentStatus: payment.status,
      paymentProvider: payment.provider,
      updatedAt: new Date().toISOString(),
    };
    await OrderRepository.save(order);

    if (customer) {
      await CustomerRepository.recordOrder(customer.id, totals.totalMinor, input.lines[0]?.productId);
      if (payment.status === 'PAID') await NooksService.earnFor(customer, totals.totalMinor, session.storeId, order.id);
    }
    await OutboxRepository.enqueue('ORDER_CREATED', { orderId: order.id, paymentId: payment.id });

    // A counter sale is already accepted by definition — the barista took it.
    order = await this.transition(order, 'ACCEPTED', session);

    bus.emit(EVENTS.ORDERS_CHANGED);
    return { order, payment };
  },

  /**
   * The only path that changes an order's status. Rejects illegal moves rather
   * than quietly writing them, and never overwrites history.
   */
  async transition(order: Order, to: OrderStatus, session: Session, reason?: string): Promise<Order> {
    if (!isTransitionAllowed(order.status, to)) {
      throw new Error(`${STATUS_LABEL[order.status]} cannot become ${STATUS_LABEL[to]}.`);
    }

    const at = new Date().toISOString();
    let updated: Order = {
      ...order,
      status: to,
      updatedAt: at,
      syncStatus: 'PENDING',
      syncVersion: order.syncVersion + 1,
      history: [
        ...order.history,
        { id: uuid(), status: to, at, userId: session.user.id, userName: session.user.name, deviceId: session.deviceId, reason },
      ],
    };

    if (to === 'ACCEPTED') {
      updated.acceptedAt = at;
      const cup = await QrService.issueForOrder(updated);
      updated = { ...updated, cupId: cup.cupId };
      // The bill goes out the moment the store accepts (confirms) the order
      // — right after checkout for a counter sale — not after the drink is
      // picked up. WhatsApp first, SMS if that fails, a link either way. The
      // record is folded in here (rather than left to InvoiceService's own
      // save) so the final save below can't clobber it.
      const { invoice, record } = await InvoiceService.send(updated);
      updated = {
        ...updated,
        invoiceId: invoice.id,
        notificationLog: record ? [...updated.notificationLog, record] : updated.notificationLog,
      };
    }
    if (to === 'PREPARING') {
      // Stock leaves the building when the drink is made, not when it is paid.
      await InventoryService.consumeForOrder(updated, session.user.id, session.user.name);
    }
    if (to === 'READY') updated.readyAt = at;
    if (to === 'COMPLETED') updated.completedAt = at;

    const event = NOTIFY_ON[to];
    if (event) {
      const record = await NotificationService.notify(updated, event);
      updated = { ...updated, notificationLog: [...updated.notificationLog, record] };
    }

    await OrderRepository.save(updated);
    await OutboxRepository.enqueue('ORDER_STATUS_CHANGED', { orderId: updated.id, status: to, at, reason });
    bus.emit(EVENTS.ORDERS_CHANGED, { orderId: updated.id, status: to });
    return updated;
  },

  /** Cancel with a mandatory reason, and start a refund if money was taken. */
  async cancel(order: Order, session: Session, reason: string): Promise<Order> {
    const cancelled = await this.transition(order, 'CANCELLED', session, reason);
    if (order.cupId) await QrService.void(order.cupId);
    if (order.paymentStatus === 'PAID') {
      await PaymentService.requestRefund({
        order: cancelled,
        amountMinor: cancelled.totalMinor,
        reason,
        requestedBy: session.user.id,
        requestedByName: session.user.name,
      });
      return this.transition(cancelled, 'REFUND_PENDING', session, reason);
    }
    return cancelled;
  },

  async refund(order: Order, session: Session, amountMinor: number, reason: string): Promise<Order> {
    await PaymentService.requestRefund({
      order,
      amountMinor,
      reason,
      requestedBy: session.user.id,
      requestedByName: session.user.name,
    });
    return this.transition(order, 'REFUND_PENDING', session, reason);
  },

  /**
   * The one action a barista ever takes on an order past creation: push it to
   * its next workflow stage. Called identically from a QR scan and from the
   * "Move to next step" fallback button.
   *
   * A counter sale never rests at READY — the customer is standing right
   * there, so PREPARING collapses straight through to COMPLETED same as
   * before. An app order does rest at READY: nobody has shown up to claim it
   * yet, and that gap is exactly the "ready to pick" window. Moving a READY
   * app order on requires `verifiedPickup` — proof this call came from
   * actually resolving the customer's QR or code, not just a tap on a
   * fallback button — so the only way past this step is the same door a scan
   * would use.
   */
  async advance(
    order: Order,
    session: Session,
    opts: { verifiedPickup?: boolean } = {},
  ): Promise<{ order: Order; milestone: OrderStatus }> {
    if (order.status === 'NEW') {
      return { order: await this.transition(order, 'ACCEPTED', session), milestone: 'ACCEPTED' };
    }
    if (order.status === 'ACCEPTED') {
      return { order: await this.transition(order, 'PREPARING', session), milestone: 'PREPARING' };
    }
    if (order.status === 'PREPARING' && order.source === 'APP') {
      return { order: await this.transition(order, 'READY', session), milestone: 'READY' };
    }
    if (order.status === 'READY' && order.source === 'APP' && !opts.verifiedPickup) {
      throw new DomainError('An app order needs the customer’s QR or pickup code before hand-over.');
    }
    if (order.status === 'PREPARING' || order.status === 'READY' || order.status === 'HANDED_OVER') {
      let updated = order;
      if (updated.status === 'PREPARING') updated = await this.transition(updated, 'READY', session);
      if (updated.status === 'READY') updated = await this.transition(updated, 'HANDED_OVER', session);
      updated = await this.transition(updated, 'COMPLETED', session);
      return { order: updated, milestone: 'COMPLETED' };
    }
    throw new Error(`${STATUS_LABEL[order.status]} has no next step.`);
  },

  async reprintLabel(order: Order): Promise<void> {
    if (!order.cupId) return;
    await OutboxRepository.enqueue('CUP_REPRINTED', { orderId: order.id, cupId: order.cupId });
  },

  async payment(order: Order): Promise<Payment | undefined> {
    return order.paymentId ? PaymentRepository.byId(order.paymentId) : PaymentRepository.byOrderId(order.id);
  },
};

const NOTIFY_ON: Partial<Record<OrderStatus, Parameters<typeof NotificationService.notify>[1]>> = {
  ACCEPTED: 'ORDER_ACCEPTED',
  PREPARING: 'ORDER_PREPARING',
  READY: 'ORDER_READY',
  COMPLETED: 'ORDER_COMPLETED',
};
