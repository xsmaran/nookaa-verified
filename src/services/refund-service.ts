import { uuid } from '@/lib/ids';
import { DomainError } from '@/lib/errors';
import { AuditRepository, OrderRepository, PaymentRepository } from '@/repositories';
import type { Order, OrderStatus, PaymentStatus, Refund, Session } from '@/types';
import { bus, EVENTS } from './event-bus';

export interface RefundRow extends Refund {
  orderNumber: string;
  storeId: string;
}

/**
 * Deciding a refund.
 *
 * Raising one is already fully local — a cancelled or refunded order calls
 * `PaymentService.requestRefund` from `OrderService.cancel`/`refund`, neither
 * of which ever touched the network. This file is the other half: the
 * second-person approval that used to be enforced three times over (the route,
 * the repository, and a CHECK constraint). There is no database constraint to
 * fall back on any more, so the check below is the only thing standing between
 * a till and self-approved money — get it right.
 */

/** Move an order to a new status the way the old server's OrderWrites.transition
 * did for this one case: status, timestamp, one history row. Deliberately not
 * `OrderService.transition` — that helper also fires notifications, prints
 * invoices and consumes stock for the statuses it knows about, none of which
 * belongs to a refund decision landing on an order that already went through
 * its normal lifecycle once. */
function withStatus(order: Order, to: OrderStatus, actor: Session, reason?: string): Order {
  const at = new Date().toISOString();
  return {
    ...order,
    status: to,
    updatedAt: at,
    syncStatus: 'PENDING',
    syncVersion: order.syncVersion + 1,
    completedAt: to === 'COMPLETED' ? at : order.completedAt,
    history: [
      ...order.history,
      { id: uuid(), status: to, at, userId: actor.user.id, userName: actor.user.name, deviceId: actor.deviceId, reason },
    ],
  };
}

export const RefundService = {
  async list(): Promise<RefundRow[]> {
    const [refunds, orders] = await Promise.all([PaymentRepository.refunds(), OrderRepository.all()]);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    return refunds.map((r) => {
      const order = orderById.get(r.orderId);
      return { ...r, orderNumber: order?.orderNumber ?? '—', storeId: order?.storeId ?? '' };
    });
  },

  /**
   * Approve or reject a pending refund. The person who raised it can never be
   * the one who decides it — no role, not even OWNER, is exempt. That is
   * unlike the transfer-approval rule elsewhere in the app, which does let
   * OWNER/ADMIN sign off their own transfers; refunds move real money back to
   * a customer and get no such override.
   */
  async decide(refundId: string, decision: 'APPROVE' | 'REJECT', note: string | undefined, actor: Session): Promise<Refund> {
    const refunds = await PaymentRepository.refunds();
    const refund = refunds.find((r) => r.id === refundId);
    if (!refund) throw new DomainError('That refund could not be found.');

    if (refund.requestedBy === actor.user.id) {
      throw new DomainError('You cannot approve your own refund request.');
    }
    if (refund.status !== 'PENDING') {
      throw new DomainError('This refund has already been decided.');
    }

    const order = await OrderRepository.byId(refund.orderId);

    if (decision === 'REJECT') {
      const rejected: Refund = { ...refund, status: 'REJECTED' };
      await PaymentRepository.saveRefund(rejected);

      if (order && order.status === 'REFUND_PENDING') {
        const updatedOrder = withStatus(order, 'COMPLETED', actor, note);
        await OrderRepository.save(updatedOrder);
      }

      await AuditRepository.record({
        session: actor,
        entity: 'refund',
        entityId: refundId,
        entityLabel: order?.orderNumber,
        action: 'rejected',
        before: refund,
        after: rejected,
        reason: note,
        summary: `declined the refund on ${order?.orderNumber ?? refund.orderId}`,
      });

      if (order) bus.emit(EVENTS.ORDERS_CHANGED, { orderId: order.id });
      return rejected;
    }

    // APPROVE
    const at = new Date().toISOString();
    const processed: Refund = {
      ...refund,
      status: 'PROCESSED',
      approvedBy: actor.user.id,
      approvedByName: actor.user.name,
      approvedAt: at,
      processedAt: at,
    };
    await PaymentRepository.saveRefund(processed);

    if (order) {
      const allRefunds = await PaymentRepository.refunds();
      const processedTotal = allRefunds
        .filter((r) => r.orderId === order.id && r.status === 'PROCESSED')
        .reduce((sum, r) => sum + r.amountMinor, 0);
      const fullyRefunded = processedTotal >= order.totalMinor;
      const paymentStatus: PaymentStatus = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      const updatedOrder =
        order.status === 'REFUND_PENDING' && fullyRefunded
          ? withStatus({ ...order, paymentStatus }, 'REFUNDED', actor, note)
          : { ...order, paymentStatus, updatedAt: at };
      await OrderRepository.save(updatedOrder);

      const payment = order.paymentId
        ? await PaymentRepository.byId(order.paymentId)
        : await PaymentRepository.byOrderId(order.id);
      if (payment) await PaymentRepository.save({ ...payment, status: paymentStatus });

      bus.emit(EVENTS.ORDERS_CHANGED, { orderId: order.id });
    }

    await AuditRepository.record({
      session: actor,
      entity: 'refund',
      entityId: refundId,
      entityLabel: order?.orderNumber,
      action: 'approved',
      before: refund,
      after: processed,
      reason: note,
      summary: `approved a refund on ${order?.orderNumber ?? refund.orderId}`,
    });

    return processed;
  },
};
