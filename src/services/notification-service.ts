import type { NotificationEvent, NotificationRecord, Order } from '@/types';
import { uuid } from '@/lib/ids';

/**
 * Customer notifications.
 *
 * The POS never talks to WhatsApp or an SMS gateway directly. It hands an
 * intent to this service, which hands it to whichever provider is configured
 * server side. WhatsApp is always tried first — it is richer and free to send
 * — and a delivery failure (no WhatsApp account, provider rejection) falls
 * back to SMS automatically, with no barista involvement either way.
 *
 * STATUS: MOCK — no message leaves the device. Every send is recorded on the
 * order so the UI can show what went out, on which channel, and what failed.
 */
export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationRecord['channel'];
  send(to: string, message: string): Promise<{ ok: boolean; detail?: string }>;
}

class MockWhatsAppProvider implements NotificationProvider {
  readonly name = 'whatsapp-mock';
  readonly channel = 'WHATSAPP' as const;

  async send(to: string, message: string): Promise<{ ok: boolean; detail?: string }> {
    await new Promise((r) => setTimeout(r, 220));
    // A realistic chunk of numbers simply have no WhatsApp account — this is
    // the case the SMS fallback exists for, not just a flaky provider.
    if (Math.random() < 0.15) return { ok: false, detail: 'This number has no WhatsApp account' };
    return { ok: true, detail: `MOCK WhatsApp → ${to}: "${message}"` };
  }
}

class MockSmsProvider implements NotificationProvider {
  readonly name = 'sms-mock';
  readonly channel = 'SMS' as const;

  async send(to: string, message: string): Promise<{ ok: boolean; detail?: string }> {
    await new Promise((r) => setTimeout(r, 180));
    if (Math.random() < 0.04) return { ok: false, detail: 'Carrier rejected the message' };
    return { ok: true, detail: `MOCK SMS → ${to}: "${message}"` };
  }
}

const MESSAGE_COPY: Record<NotificationEvent, (order: Order) => string> = {
  ORDER_RECEIVED: (o) => `We have your order ${o.orderNumber}.`,
  ORDER_ACCEPTED: (o) => `${o.orderNumber} accepted — the bar has it.`,
  ORDER_PREPARING: (o) => `${o.orderNumber} is being made now.`,
  ORDER_READY: (o) => `${o.orderNumber} is ready at the pickup counter.`,
  ORDER_COMPLETED: (o) => `Thanks, ${o.customerName}. Sip. Chill. Repeat.`,
  INVOICE_GENERATED: (o) => `Your bill for ${o.orderNumber} is ready.`,
};

export const NotificationService = {
  whatsapp: new MockWhatsAppProvider() as NotificationProvider,
  sms: new MockSmsProvider() as NotificationProvider,

  copyFor(event: NotificationEvent, order: Order): string {
    return MESSAGE_COPY[event](order);
  },

  /**
   * The one path every customer message goes through. Tries WhatsApp, falls
   * back to SMS on failure, and records whichever channel actually delivered
   * it — never both, never neither, unless both genuinely failed.
   */
  async deliver(order: Order, event: NotificationEvent, message: string): Promise<NotificationRecord> {
    const base = { id: uuid(), event, at: new Date().toISOString() };
    if (!order.customerPhone) {
      return { ...base, channel: 'WHATSAPP', status: 'SKIPPED', to: null, detail: 'No phone number on the order' };
    }

    const whatsapp = await this.whatsapp.send(order.customerPhone, message);
    if (whatsapp.ok) {
      return { ...base, channel: 'WHATSAPP', status: 'SENT', to: order.customerPhone, detail: whatsapp.detail };
    }

    const sms = await this.sms.send(order.customerPhone, message);
    return {
      ...base,
      channel: 'SMS',
      status: sms.ok ? 'SENT' : 'FAILED',
      to: order.customerPhone,
      detail: sms.ok
        ? `WhatsApp unavailable (${whatsapp.detail}) — sent by SMS instead`
        : `WhatsApp failed (${whatsapp.detail}); SMS also failed (${sms.detail})`,
    };
  },

  /** Returns the record to append to the order's notification log. */
  async notify(order: Order, event: NotificationEvent): Promise<NotificationRecord> {
    return this.deliver(order, event, this.copyFor(event, order));
  },
};

/** The most recent record for an event — for a caller that wants to toast "sent via WhatsApp/SMS" right after it happened. */
export function lastRecordFor(order: Order, event: NotificationEvent): NotificationRecord | undefined {
  for (let i = order.notificationLog.length - 1; i >= 0; i--) {
    if (order.notificationLog[i].event === event) return order.notificationLog[i];
  }
  return undefined;
}
