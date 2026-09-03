import { buildCupId, buildCupToken, buildPickupCode, cupUri, parseCupScan, uuid } from '@/lib/ids';
import { CupRepository, OrderRepository } from '@/repositories';
import type { CupToken, Order } from '@/types';

/**
 * The cup QR.
 *
 * The code carries an opaque token and nothing else — no name, no phone, no
 * amount. Anyone photographing a cup on a table learns nothing. Resolving the
 * token to an order requires an authenticated staff session.
 *
 * STATUS: tokens are generated locally with random bytes. In production the
 * backend issues and HMAC-signs them; the shape of the string does not change.
 */
export const QrService = {
  async issueForOrder(order: Order): Promise<CupToken> {
    const existing = order.cupId ? await CupRepository.byCupId(order.cupId) : undefined;
    if (existing && !existing.voided) return existing;

    const cupId = buildCupId();
    const cup: CupToken = {
      cupId,
      orderId: order.id,
      storeId: order.storeId ?? '',
      token: buildCupToken(cupId),
      issuedAt: new Date().toISOString(),
      printedCount: 0,
      scans: [],
      voided: false,
      // The cup label's QR is for whoever is holding the cup already — a
      // barista. An app order was placed by someone who was never handed
      // one, so it gets a second, spoken-friendly way in.
      pickupCode: order.source === 'APP' ? buildPickupCode() : null,
    };
    await CupRepository.save(cup);
    await OrderRepository.save({ ...order, cupId, updatedAt: new Date().toISOString() });
    return cup;
  },

  payload(cup: CupToken): string {
    return cupUri(cup.token);
  },

  /** Renders the QR as a data URL. Generation is local — never a network call. */
  async dataUrl(cup: CupToken): Promise<string> {
    const QRCode = (await import('qrcode')).default;
    return QRCode.toDataURL(this.payload(cup), {
      errorCorrectionLevel: 'M', // survives a wet, curved cup
      margin: 1,
      scale: 6,
      color: { dark: '#1A1512FF', light: '#FFFFFFFF' },
    });
  },

  /**
   * Resolve anything a scanner might produce: a nookaa:// URI, a bare token, a
   * typed cup id, an app order's 4-digit pickup code read out by the
   * customer, or an order number the barista read off the label.
   *
   * Pickup codes are checked before falling back to "last 4 digits of the
   * order number" — a random 4-digit code could in principle coincide with
   * an order suffix, and a customer's own code should win that tie.
   */
  async resolve(raw: string): Promise<{ order: Order; cup: CupToken } | { error: string }> {
    const cupId = parseCupScan(raw);

    if (cupId) {
      const cup = await CupRepository.byCupId(cupId);
      if (!cup) return { error: `No cup ${cupId} at this store. Check the label, or search by order number.` };
      if (cup.voided) return { error: `Cup ${cupId} was voided. Reprint the label from the order.` };
      const order = await OrderRepository.byId(cup.orderId);
      if (!order) return { error: `Cup ${cupId} points at an order this device has not synced yet.` };
      return { order, cup };
    }

    const trimmed = raw.trim();
    if (/^\d{4}$/.test(trimmed)) {
      const pickupCup = await CupRepository.byPickupCode(trimmed);
      if (pickupCup) {
        const order = await OrderRepository.byId(pickupCup.orderId);
        if (order) return { order, cup: pickupCup };
      }
    }

    const order = await OrderRepository.byOrderNumber(raw);
    if (!order) return { error: `Nothing matches "${raw}". Try the cup ID, order number, or last 4 digits.` };
    const cup = order.cupId ? await CupRepository.byCupId(order.cupId) : undefined;
    if (!cup) return { error: `Order ${order.orderNumber} has no cup label yet. Accept it first.` };
    return { order, cup };
  },

  async void(cupId: string): Promise<void> {
    const cup = await CupRepository.byCupId(cupId);
    if (cup) await CupRepository.save({ ...cup, voided: true });
  },

  newScanId(): string {
    return uuid();
  },
};
