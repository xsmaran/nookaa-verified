import { billUrl, buildInvoiceNumber, uuid } from '@/lib/ids';
import { catalog } from '@/repositories/catalog-cache';
import { PaymentRepository, OrderRepository } from '@/repositories';
import type { Invoice, NotificationRecord, Order } from '@/types';
import { NotificationService } from './notification-service';

/**
 * Invoices.
 *
 * NOOKAA generates the invoice; WhatsApp (or SMS, if that fails) only
 * delivers a link to it — never a PDF attachment. The link opens the public
 * bill page, where the customer can view it and download or share it
 * themselves. Numbering is gapless per financial year and never reused,
 * which is what a GST audit actually checks. In production the number is
 * minted by the backend inside the same transaction as the payment capture —
 * a device must never invent one.
 *
 * STATUS: numbering and records are real; the bill page and its delivery are
 * MOCK — no message actually leaves the device.
 */
function financialYearLabel(date = new Date()): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}

export const InvoiceService = {
  async issue(order: Order): Promise<Invoice> {
    const existing = await PaymentRepository.invoiceByOrderId(order.id);
    if (existing) return existing;

    const all = await PaymentRepository.invoices();
    const sequence = all.length + 1;
    const id = uuid();
    const invoice: Invoice = {
      id,
      invoiceNumber: buildInvoiceNumber(catalog().snapshot.organization.invoicePrefix, financialYearLabel(), sequence),
      orderId: order.id,
      storeId: order.storeId ?? '',
      paymentId: order.paymentId ?? null,
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      discountMinor: order.discountMinor,
      totalMinor: order.totalMinor,
      gstin: catalog().snapshot.organization.gstin,
      issuedAt: new Date().toISOString(),
      pdfUrl: billUrl(id),
      deliveryStatus: order.customerPhone ? 'NOT_SENT' : 'NO_PHONE',
    };
    await PaymentRepository.saveInvoice(invoice);
    await OrderRepository.save({ ...order, invoiceId: invoice.id, updatedAt: new Date().toISOString() });
    return invoice;
  },

  /**
   * Send or resend the bill link. Both go through the same path so retries
   * are honest, and both return the notification record so a caller that
   * folds it into an order already in flight (see OrderService.transition)
   * never loses it to a later save overwriting this one.
   */
  async send(order: Order): Promise<{ invoice: Invoice; record: NotificationRecord | null }> {
    const invoice = await this.issue(order);
    if (!order.customerPhone) {
      const updated: Invoice = { ...invoice, deliveryStatus: 'NO_PHONE' };
      await PaymentRepository.saveInvoice(updated);
      return { invoice: updated, record: null };
    }

    const link = invoice.pdfUrl ?? billUrl(invoice.id);
    const firstName = order.customerName.trim().split(/\s+/)[0] || 'there';
    const message = `Hi ${firstName}, here's your NOOKAA bill for ${order.orderNumber}: ${link}`;
    const record = await NotificationService.deliver(order, 'INVOICE_GENERATED', message);

    const updated: Invoice = {
      ...invoice,
      deliveryStatus: record.status === 'SENT' ? 'SENT' : 'FAILED',
      deliveredAt: record.status === 'SENT' ? record.at : invoice.deliveredAt ?? null,
    };
    await PaymentRepository.saveInvoice(updated);
    await OrderRepository.save({
      ...order,
      invoiceId: updated.id,
      notificationLog: [...order.notificationLog, record],
      updatedAt: new Date().toISOString(),
    });
    return { invoice: updated, record };
  },

  /** MOCK: a printable HTML invoice stands in for the backend-rendered PDF. */
  renderHtml(order: Order, invoice: Invoice, storeName: string): string {
    const rows = order.items
      .map(
        (item) => `<tr><td>${item.qty}×</td><td>${item.name}<br><small>${item.spec}</small></td>
        <td style="text-align:right">₹${(item.lineTotalMinor / 100).toFixed(2)}</td></tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title>
    <style>body{font-family:ui-monospace,monospace;max-width:80mm;margin:0 auto;padding:8px;font-size:11px}
    h1{font-size:14px;margin:0 0 2px}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}
    .tot{border-top:1px dashed #000;margin-top:6px;padding-top:6px}small{color:#555}</style></head><body>
    <h1>NOOKAA</h1><div>${storeName}</div><div>GSTIN ${invoice.gstin}</div>
    <div class="tot"><strong>${invoice.invoiceNumber}</strong><br>${order.orderNumber}<br>${new Date(invoice.issuedAt).toLocaleString('en-IN')}</div>
    <div class="tot">${order.customerName}${order.customerPhone ? `<br>${order.customerPhone}` : ''}</div>
    <table class="tot">${rows}</table>
    <table class="tot">
      <tr><td>Subtotal</td><td style="text-align:right">₹${(invoice.subtotalMinor / 100).toFixed(2)}</td></tr>
      ${invoice.discountMinor ? `<tr><td>Discount</td><td style="text-align:right">−₹${(invoice.discountMinor / 100).toFixed(2)}</td></tr>` : ''}
      <tr><td>GST</td><td style="text-align:right">₹${(invoice.taxMinor / 100).toFixed(2)}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>₹${(invoice.totalMinor / 100).toFixed(2)}</strong></td></tr>
    </table>
    <div class="tot" style="text-align:center">Sip. Chill. Repeat.<br>www.nookaa.in</div>
    </body></html>`;
  },
};
