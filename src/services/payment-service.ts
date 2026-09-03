import type { Order, Payment, PaymentProvider, Refund } from '@/types';
import { uuid } from '@/lib/ids';
import { PaymentRepository } from '@/repositories';

/**
 * Payments.
 *
 * NOOKAA's gateway is Razorpay, but the POS records its own payment row for
 * every tender — including cash — so accounting reconciles against one internal
 * ledger rather than against a mix of Razorpay reports and a cash box.
 *
 * STATUS: MOCK. No Razorpay call is made from this file and no key is present.
 * In production, createRazorpayOrder and verify both hit our own backend, which
 * holds the key secret and verifies the signature. See /docs/06-razorpay.md.
 */
export interface ChargeRequest {
  order: Order;
  provider: PaymentProvider;
  tenderedMinor?: number;
}

export const PaymentService = {
  async charge({ order, provider, tenderedMinor }: ChargeRequest): Promise<Payment> {
    const now = new Date().toISOString();
    const isCash = provider === 'CASH';

    if (!isCash) await new Promise((r) => setTimeout(r, 350)); // gateway round trip

    const payment: Payment = {
      id: uuid(),
      orderId: order.id,
      storeId: order.storeId ?? '',
      provider,
      status: 'PAID',
      amountMinor: order.totalMinor,
      razorpayOrderId: isCash ? null : `order_MOCK${uuid().replace(/-/g, '').slice(0, 10)}`,
      razorpayPaymentId: isCash ? null : `pay_MOCK${uuid().replace(/-/g, '').slice(0, 10)}`,
      razorpaySignatureVerified: isCash ? undefined : true,
      tenderedMinor: isCash ? (tenderedMinor ?? order.totalMinor) : null,
      changeMinor: isCash ? Math.max(0, (tenderedMinor ?? order.totalMinor) - order.totalMinor) : null,
      capturedAt: now,
      createdAt: now,
    };

    await PaymentRepository.save(payment);
    return payment;
  },

  async requestRefund(params: {
    order: Order;
    amountMinor: number;
    reason: string;
    requestedBy: string;
    requestedByName: string;
  }): Promise<Refund> {
    const payment = await PaymentRepository.byOrderId(params.order.id);
    const refund: Refund = {
      id: uuid(),
      paymentId: payment?.id ?? '',
      orderId: params.order.id,
      amountMinor: params.amountMinor,
      reason: params.reason,
      status: 'PENDING',
      requestedBy: params.requestedBy,
      requestedByName: params.requestedByName,
      createdAt: new Date().toISOString(),
    };
    await PaymentRepository.saveRefund(refund);
    return refund;
  },

  async approveRefund(refund: Refund, approvedBy: string): Promise<Refund> {
    await new Promise((r) => setTimeout(r, 300));
    const processed: Refund = {
      ...refund,
      status: 'PROCESSED',
      approvedBy,
      razorpayRefundId: `rfnd_MOCK${uuid().replace(/-/g, '').slice(0, 10)}`,
    };
    await PaymentRepository.saveRefund(processed);

    const payment = await PaymentRepository.byId(refund.paymentId);
    if (payment) {
      const fully = refund.amountMinor >= payment.amountMinor;
      await PaymentRepository.save({ ...payment, status: fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED' });
    }
    return processed;
  },
};
