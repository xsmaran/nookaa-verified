import { buildCupId, buildCupToken, buildInvoiceNumber, buildOrderNumber, uuid } from '@/lib/ids';
import { calculateTotals } from '@/lib/pricing';
import { localStore } from '@/lib/local-db';
import { catalog } from '@/repositories/catalog-cache';
import { StaffRepository } from '@/repositories/staff-repository';
import type {
  CartLine, CupToken, Customer, Discount, Invoice, NotificationEvent, NotificationRecord, Order, OrderItem,
  OrderStatus, OrderStatusEvent, Organization, Payment, PaymentProvider, Refund, Session, Store, User,
} from '@/types';
import { bus, EVENTS } from './event-bus';

/**
 * Demo history.
 *
 * The catalog, stores and staff are real from the moment `npm run db:seed`
 * runs. Orders, payments, invoices and refunds are not — they are written by
 * whoever uses the till, and a fresh browser has none. That is correct for a
 * real deployment and useless for showing the product to someone: every
 * screen past the menu looks switched off.
 *
 * This fills exactly that gap, once, on the device asking for it: a couple of
 * weeks of orders shaped the way `OrderService` would have produced them, so
 * Today, Orders, Live, Payments, Invoices, Refunds, Customers and Analytics
 * all have something honest to show. It writes to this browser's IndexedDB
 * only — nothing is invented on the server, and nothing here is a substitute
 * for a real operating day.
 */

let rngState = 0;
function seedRng(n: number): void {
  rngState = n >>> 0 || 1;
}
function rand(): number {
  // xorshift32 — deterministic per call to generate(), good enough to be
  // reproducible if it ever needs debugging, not a security concern anywhere near this.
  rngState ^= rngState << 13; rngState >>>= 0;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5; rngState >>>= 0;
  return rngState / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function chance(p: number): boolean {
  return rand() < p;
}
function between(min: number, max: number): number {
  return min + rand() * (max - min);
}
function int(min: number, max: number): number {
  return Math.floor(between(min, max + 1));
}
function weighted<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/* ------------------------------------------------------------------- names */

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Kabir', 'Ishaan', 'Rohan', 'Karan',
  'Ananya', 'Diya', 'Saanvi', 'Myra', 'Aadhya', 'Kiara', 'Anika', 'Riya', 'Meera', 'Priya',
  'Rahul', 'Rohit', 'Nikhil', 'Varun', 'Siddharth', 'Aman', 'Yash', 'Dev', 'Aryan', 'Zoya',
  'Sneha', 'Pooja', 'Neha', 'Kavya', 'Isha', 'Tanvi', 'Ritika', 'Simran', 'Aisha', 'Fatima',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Menon', 'Rao', 'Reddy', 'Kapoor', 'Malhotra',
  'Chopra', 'Mehta', 'Shah', 'Patel', 'Joshi', 'Desai', 'Bhatt', 'Kulkarni', 'Pillai', 'Khan',
  'Singh', 'Bose', 'Dutta', 'Chatterjee', 'Naidu', 'Pinto', 'D’Souza', 'Fernandes', 'Agarwal', 'Bhatia',
];
/** Names for app-sourced orders — a guest stream, never attached to a real customer record. */
const APP_NAMES = ['Rahul D.', 'Priya N.', 'Arjun M.', 'Meera I.', 'Kabir A.', 'Ananya B.', 'Zoya S.', 'Nikhil R.', 'Isha T.', 'Yash K.'];

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}
function randomPhone(): string {
  return `+9197${int(10000000, 99999999)}`;
}

const CANCEL_REASONS_EARLY = [
  'Customer changed their mind before it was made',
  'Ordered by mistake at the counter',
  'Duplicate order rung up twice',
  'Customer left before it could be started',
];
const CANCEL_REASONS_LATE = [
  'Wrong drink started — remade under a new order',
  'Bar was out of an ingredient mid-prep',
  'Machine fault, order restarted separately',
];
const REFUND_REASONS = [
  'Drink was made wrong',
  'Customer said it tasted off',
  'Order was never handed over',
  'Duplicate charge at the counter',
  'Long wait — manager comped it as a refund',
];
const REFUND_REJECT_REASONS = [
  'Cup was scanned as handed over — no evidence of an issue',
  'Same request already refunded on a different order',
  'Raised past the store’s refund window',
];
const PAYMENT_FAILURES = [
  'Card declined by issuing bank',
  'Insufficient balance',
  'Bank server timed out',
  'OTP not entered in time',
];

/* -------------------------------------------------------------- mechanics */

const HOUR_WINDOWS: Array<[number, number, number]> = [
  // [startFraction, endFraction, weight] of the store's open hours
  [0.0, 0.22, 3],
  [0.22, 0.5, 1.3],
  [0.5, 0.8, 3.2],
  [0.8, 1.0, 1.2],
];
const DOW_FACTOR = [1.2, 0.85, 0.85, 0.9, 0.95, 1.05, 1.35]; // Sun .. Sat

function parseMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** A moment within the store's open hours on the given calendar day, weighted toward the two rushes. */
function placedAtOn(day: Date, store: Store, cap?: Date): Date {
  const open = parseMinutes(store.openingTime);
  const close = parseMinutes(store.closingTime);
  const span = Math.max(30, close - open);
  const window = weighted(HOUR_WINDOWS.map(([a, b, w]) => [[a, b], w] as [[number, number], number]));
  const fraction = between(window[0], window[1]);
  const minute = open + fraction * span;
  const at = new Date(day);
  at.setHours(0, Math.round(minute), int(0, 59), 0);
  if (cap && at.getTime() > cap.getTime()) return new Date(cap.getTime() - int(0, 1800) * 1000);
  return at;
}

function financialYearLabel(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}

function notificationFor(event: NotificationEvent, phone: string | null, at: Date): NotificationRecord {
  const base = { id: uuid(), event, at: at.toISOString() };
  if (!phone) return { ...base, channel: 'WHATSAPP', status: 'SKIPPED', to: null, detail: 'No phone number on the order' };
  if (chance(0.85)) return { ...base, channel: 'WHATSAPP', status: 'SENT', to: phone };
  if (chance(0.96)) return { ...base, channel: 'SMS', status: 'SENT', to: phone, detail: 'WhatsApp unavailable — sent by SMS instead' };
  return { ...base, channel: 'SMS', status: 'FAILED', to: phone, detail: 'WhatsApp and SMS both failed' };
}

/* ------------------------------------------------------------------- types */

export interface DemoSeedResult {
  ordersAdded: number;
  paymentsAdded: number;
  invoicesAdded: number;
  refundsAdded: number;
  customersAdded: number;
  storesCovered: number;
  daysCovered: number;
}

interface StaffPool {
  counter: Map<string, User[]>; // storeId -> baristas/cashiers who may staff the till
  approvers: Map<string, User[]>; // storeId -> managers/admins who may approve a refund
  fallback: User;
}

async function loadStaff(fallback: User): Promise<StaffPool> {
  const counter = new Map<string, User[]>();
  const approvers = new Map<string, User[]>();
  try {
    const staff = await StaffRepository.list();
    const active = staff.filter((u) => u.active);
    const forStore = (storeId: string, roles: string[]) =>
      active.filter((u) => roles.includes(u.role) && (u.storeIds.length === 0 || u.storeIds.includes(storeId)));
    const allStoreIds = new Set(active.flatMap((u) => u.storeIds));
    allStoreIds.forEach((id) => {
      counter.set(id, forStore(id, ['BARISTA', 'CASHIER', 'MANAGER']));
      approvers.set(id, forStore(id, ['MANAGER', 'ADMIN', 'OWNER']));
    });
  } catch {
    // Offline, or the signed-in role cannot see the roster — fall back below.
  }
  return { counter, approvers, fallback };
}

function staffAt(pool: StaffPool, storeId: string, kind: 'counter' | 'approvers'): User {
  const list = pool[kind].get(storeId);
  return list && list.length > 0 ? pick(list) : pool.fallback;
}

/* -------------------------------------------------------------------- core */

export const DemoDataService = {
  /**
   * Idempotent-ish and always additive: safe to run more than once, though
   * doing so simply adds another batch on top rather than deduplicating.
   */
  async generate(params: {
    session: Session;
    organization: Organization;
    stores: Store[];
    days?: number;
  }): Promise<DemoSeedResult> {
    seedRng(Date.now());
    const days = Math.max(3, Math.min(30, params.days ?? 14));
    const { snapshot, modifierGroupById, defaultTax } = catalog();
    const sellable = snapshot.products.filter((p) => p.active && p.available);
    const activeStores = params.stores.filter((s) => s.active);
    if (sellable.length === 0 || activeStores.length === 0) {
      return { ordersAdded: 0, paymentsAdded: 0, invoicesAdded: 0, refundsAdded: 0, customersAdded: 0, storesCovered: 0, daysCovered: 0 };
    }

    const staffPool = await loadStaff(params.session.user);

    const [existingOrders, existingInvoices] = await Promise.all([
      localStore().list<Order>('orders'),
      localStore().list<Invoice>('invoices'),
    ]);
    const daySeq = new Map<string, number>();
    for (const o of existingOrders) {
      const key = `${o.storeId}|${new Date(o.placedAt).toDateString()}`;
      daySeq.set(key, Math.max(daySeq.get(key) ?? 0, o.sequence));
    }
    let invoiceSeq = existingInvoices.length;

    const now = new Date();
    const orders: Order[] = [];
    const payments: Payment[] = [];
    const invoices: Invoice[] = [];
    const refunds: Refund[] = [];
    const cups: CupToken[] = [];
    const newCustomers = new Map<string, Customer>(); // phone -> customer, this run only

    function nextSequence(storeId: string, at: Date): number {
      const key = `${storeId}|${at.toDateString()}`;
      const next = (daySeq.get(key) ?? 0) + 1;
      daySeq.set(key, next);
      return next;
    }

    function customerFor(store: Store, productId: string, at: Date): { id: string | null; name: string; phone: string | null } {
      if (chance(0.42)) return { id: null, name: pick(FIRST_NAMES), phone: null }; // a name given at the counter, nothing more
      if (chance(0.55) && newCustomers.size > 0) {
        // A regular, coming back.
        const existing = pick(Array.from(newCustomers.values()));
        return { id: existing.id, name: existing.name, phone: existing.phone };
      }
      const name = randomName();
      const phone = randomPhone();
      const customer: Customer = {
        id: uuid(), name, phone, createdAt: at.toISOString(),
        totalOrders: 0, totalSpendMinor: 0, lastOrderAt: null,
        preferredStoreId: store.id, favouriteProductId: productId,
      };
      newCustomers.set(phone, customer);
      return { id: customer.id, name, phone };
    }

    function buildLines(): CartLine[] {
      const count = weighted<number>([[1, 55], [2, 35], [3, 10]]);
      return Array.from({ length: count }, () => {
        const product = pick(sellable);
        const modifiers: CartLine['modifiers'] = [];
        if (chance(0.28) && product.modifierGroupIds.length > 0) {
          const group = modifierGroupById.get(pick(product.modifierGroupIds));
          const upsell = group?.options.filter((o) => o.priceMinor > 0);
          if (upsell && upsell.length > 0) {
            const option = pick(upsell);
            modifiers.push({ groupId: group!.id, optionId: option.id, name: option.name, priceMinor: option.priceMinor });
          }
        }
        return {
          key: uuid(), productId: product.id, name: product.name, spec: product.spec, temp: product.temp,
          qty: chance(0.82) ? 1 : 2, unitPriceMinor: product.priceMinor, modifiers,
        };
      });
    }

    function toOrderItems(lines: CartLine[]): OrderItem[] {
      return lines.map((line) => ({
        id: line.key, productId: line.productId, name: line.name, spec: line.spec, temp: line.temp,
        qty: line.qty, unitPriceMinor: line.unitPriceMinor, modifiers: line.modifiers,
        lineTotalMinor: (line.unitPriceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0)) * line.qty,
      }));
    }

    function pickProvider(): PaymentProvider {
      return weighted<PaymentProvider>([['CASH', 35], ['UPI', 30], ['CARD', 20], ['RAZORPAY', 15]]);
    }

    function makePayment(order: Order, provider: PaymentProvider, status: Payment['status'], at: Date): Payment {
      const isCash = provider === 'CASH';
      const tendered = isCash ? Math.ceil(order.totalMinor / 5000) * 5000 : null;
      return {
        id: uuid(), orderId: order.id, storeId: order.storeId ?? '', provider, status,
        amountMinor: order.totalMinor,
        razorpayOrderId: isCash || provider === 'CARD' || provider === 'UPI' ? null : `order_MOCK${uuid().replace(/-/g, '').slice(0, 10)}`,
        razorpayPaymentId: provider === 'RAZORPAY' && status === 'PAID' ? `pay_MOCK${uuid().replace(/-/g, '').slice(0, 10)}` : null,
        tenderedMinor: tendered, changeMinor: isCash ? Math.max(0, (tendered ?? 0) - order.totalMinor) : null,
        capturedAt: status === 'PAID' ? at.toISOString() : null,
        failureReason: status === 'FAILED' ? pick(PAYMENT_FAILURES) : null,
        createdAt: at.toISOString(),
      };
    }

    function makeInvoice(order: Order, org: Organization, at: Date): Invoice {
      invoiceSeq += 1;
      const id = uuid();
      return {
        id, invoiceNumber: buildInvoiceNumber(org.invoicePrefix, financialYearLabel(at), invoiceSeq),
        orderId: order.id, storeId: order.storeId ?? '', paymentId: order.paymentId ?? null,
        subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor, discountMinor: order.discountMinor,
        totalMinor: order.totalMinor, gstin: org.gstin, issuedAt: at.toISOString(),
        pdfUrl: null, deliveryStatus: order.customerPhone ? 'SENT' : 'NO_PHONE', deliveredAt: order.customerPhone ? at.toISOString() : null,
      };
    }

    function history(entries: Array<[OrderStatus, Date, string?]>, storeId: string | null): OrderStatusEvent[] {
      const creator = storeId ? staffAt(staffPool, storeId, 'counter') : null;
      return entries.map(([status, at, reason]) => ({
        id: uuid(), status, at: at.toISOString(),
        userId: creator?.id ?? 'app', userName: creator?.name ?? 'NOOKAA app', deviceId: null, reason,
      }));
    }

    let ordersCovered = 0;

    for (let d = days - 1; d >= 0; d--) {
      const day = new Date(now);
      day.setDate(day.getDate() - d);
      const isToday = d === 0;
      const dow = day.getDay();

      for (const store of activeStores) {
        const baseVolume = int(26, 44) * DOW_FACTOR[dow];
        const openMinutes = parseMinutes(store.closingTime) - parseMinutes(store.openingTime);
        const elapsedFraction = isToday
          ? Math.max(0.05, Math.min(1, (now.getHours() * 60 + now.getMinutes() - parseMinutes(store.openingTime)) / Math.max(1, openMinutes)))
          : 1;
        const count = Math.max(3, Math.round(baseVolume * elapsedFraction));
        // The board reads only today's orders still sitting in an open status (plus
        // whatever finished in the last 20 minutes), so a fresh demo needs a batch
        // pinned into each of its columns rather than left to fall out at random —
        // 10-15 each for Received, Accepted and Preparing, and 10-15 completed just now.
        const LIVE_BOARD_STAGES = ['NEW', 'ACCEPTED', 'PREPARING', 'DONE'] as const;
        const liveBucketPlan: Array<typeof LIVE_BOARD_STAGES[number]> = isToday
          ? LIVE_BOARD_STAGES.flatMap((stage) => Array<typeof stage>(int(10, 15)).fill(stage))
          : [];
        const liveCount = liveBucketPlan.length;
        const totalCount = count + liveCount;

        for (let i = 0; i < totalCount; i++) {
          const liveBucket = liveBucketPlan[i] ?? null;
          const isLive = liveBucket !== null && liveBucket !== 'DONE';
          let placedAt = isLive
            ? new Date(now.getTime() - int(0, 15) * 60_000)
            : placedAtOn(day, store, isToday ? now : undefined);
          const source = chance(0.78) ? 'OFFLINE_POS' : 'APP';
          const lines = buildLines();
          const primaryProductId = lines[0].productId;

          let discount: Discount | null = null;
          if (source === 'OFFLINE_POS' && chance(0.12) && snapshot.discounts.length > 0) {
            const subtotal = lines.reduce((s, l) => s + (l.unitPriceMinor + l.modifiers.reduce((m, x) => m + x.priceMinor, 0)) * l.qty, 0);
            const eligible = snapshot.discounts.filter((dc) => dc.active && subtotal >= dc.minOrderMinor);
            if (eligible.length > 0) discount = pick(eligible);
          }
          const totals = calculateTotals(lines, defaultTax, discount);
          const sequence = nextSequence(store.id, placedAt);
          const orderId = uuid();

          const customerName = source === 'APP' ? pick(APP_NAMES) : undefined;
          const customer = source === 'APP' ? { id: null, name: customerName!, phone: null } : customerFor(store, primaryProductId, placedAt);

          let status: OrderStatus;
          if (liveBucket === 'NEW') status = 'NEW';
          else if (liveBucket === 'ACCEPTED') status = 'ACCEPTED';
          else if (liveBucket === 'PREPARING') status = weighted<OrderStatus>([['PREPARING', 2], ['READY', 1]]);
          else if (liveBucket === 'DONE') status = 'COMPLETED';
          else {
            status = weighted<OrderStatus>([
              ['COMPLETED', 86], ['CANCELLED', 4], ['REFUND_PENDING', 1.5], ['REFUNDED', 4], ['FAILED', 2],
            ]);
          }

          const paymentProvider: PaymentProvider = source === 'APP' ? 'RAZORPAY' : pickProvider();
          const events: Array<[OrderStatus, Date, string?]> = [];
          let acceptedAt: Date | null = null;
          let readyAt: Date | null = null;
          let completedAt: Date | null = null;
          let cupId: string | null = null;
          let invoiceId: string | null = null;
          let paymentStatus: Order['paymentStatus'] = 'PAID';
          const notificationLog: NotificationRecord[] = [];

          if (status === 'FAILED') {
            paymentStatus = 'FAILED';
            const failedAt = new Date(placedAt.getTime() + int(15, 90) * 1000);
            events.push(['PAYMENT_PENDING', placedAt], ['FAILED', failedAt]);
          } else if (isLive) {
            // A live order only carries history up to whichever stage it is
            // currently sitting at — the point of the board is that it hasn't
            // finished yet.
            events.push(['NEW', placedAt]);
            if (status !== 'NEW') {
              acceptedAt = new Date(placedAt.getTime() + int(15, 70) * 1000);
              events.push(['ACCEPTED', acceptedAt]);
              cupId = buildCupId();
              invoiceId = uuid();
              if (status !== 'ACCEPTED') {
                const preparingAt = new Date(acceptedAt.getTime() + int(10, 45) * 1000);
                events.push(['PREPARING', preparingAt]);
                if (status === 'READY') {
                  readyAt = new Date(preparingAt.getTime() + int(60, 180) * 1000);
                  events.push(['READY', readyAt]);
                }
              }
            }
          } else if (liveBucket === 'DONE') {
            // Anchored backward from "just now" rather than forward from placedAt,
            // so it lands inside the board's 20-minute completed-column cutoff at
            // the moment the demo is actually shown, not wherever it fell in the day.
            completedAt = new Date(now.getTime() - int(1, 15) * 60_000);
            const handedOverAt = new Date(completedAt.getTime() - int(0, 30) * 1000);
            readyAt = new Date(handedOverAt.getTime() - int(20, 150) * 1000);
            const preparingAt = new Date(readyAt.getTime() - int(90, Math.max(120, store.prepSlaMinutes * 90)) * 1000);
            acceptedAt = new Date(preparingAt.getTime() - int(10, 45) * 1000);
            placedAt = new Date(acceptedAt.getTime() - int(15, 70) * 1000);
            cupId = buildCupId();
            invoiceId = uuid();
            events.push(
              ['NEW', placedAt], ['ACCEPTED', acceptedAt], ['PREPARING', preparingAt],
              ['READY', readyAt], ['HANDED_OVER', handedOverAt], ['COMPLETED', completedAt],
            );
          } else {
            events.push(['NEW', placedAt]);
            acceptedAt = new Date(placedAt.getTime() + int(15, 70) * 1000);
            events.push(['ACCEPTED', acceptedAt]);
            cupId = buildCupId();
            invoiceId = uuid();

            const wantsPreparing = status !== 'CANCELLED' || chance(0.45);
            let preparingAt: Date | null = null;
            if (wantsPreparing) {
              preparingAt = new Date(acceptedAt.getTime() + int(10, 45) * 1000);
              events.push(['PREPARING', preparingAt]);
            }

            if (status === 'CANCELLED') {
              const cancelAt = preparingAt
                ? new Date(preparingAt.getTime() + int(20, 90) * 1000)
                : new Date(acceptedAt.getTime() + int(10, 60) * 1000);
              events.push(['CANCELLED', cancelAt, preparingAt ? pick(CANCEL_REASONS_LATE) : pick(CANCEL_REASONS_EARLY)]);
            } else {
              // COMPLETED, REFUND_PENDING and REFUNDED all reach the counter
              // in full before whatever happens to them next.
              const prepFrom = preparingAt ?? acceptedAt;
              readyAt = new Date(prepFrom.getTime() + int(90, Math.max(120, store.prepSlaMinutes * 90)) * 1000);
              events.push(['READY', readyAt]);
              const handedOverAt = new Date(readyAt.getTime() + int(20, 150) * 1000);
              events.push(['HANDED_OVER', handedOverAt]);
              completedAt = new Date(handedOverAt.getTime() + int(0, 30) * 1000);
              events.push(['COMPLETED', completedAt]);

              if (status === 'REFUND_PENDING' || status === 'REFUNDED') {
                const requestedAt = new Date(Math.min(now.getTime(), completedAt.getTime() + int(10, 180) * 60_000));
                events.push(['REFUND_PENDING', requestedAt, pick(REFUND_REASONS)]);
                if (status === 'REFUNDED') {
                  const approvedAt = new Date(Math.min(now.getTime(), requestedAt.getTime() + int(15, 240) * 60_000));
                  events.push(['REFUNDED', approvedAt]);
                }
              }
            }
          }

          const order: Order = {
            id: orderId, createdAt: placedAt.toISOString(), updatedAt: (events[events.length - 1]?.[1] ?? placedAt).toISOString(),
            deviceId: null, storeId: store.id, syncStatus: 'SYNCED', syncVersion: events.length,
            orderNumber: buildOrderNumber(store.code, sequence, placedAt), organizationId: store.organizationId, sequence,
            status, source, type: source === 'APP' ? 'PICKUP' : 'TAKEAWAY', priority: 'NORMAL',
            customerId: customer.id, customerName: customer.name || 'Guest', customerPhone: customer.phone,
            items: toOrderItems(lines), subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor,
            taxMinor: totals.taxMinor, totalMinor: totals.totalMinor, discountCode: discount?.code ?? null,
            cupId, paymentStatus, paymentProvider, invoiceId,
            history: history(events, source === 'APP' ? null : store.id),
            placedAt: placedAt.toISOString(),
            acceptedAt: acceptedAt?.toISOString() ?? null,
            readyAt: readyAt?.toISOString() ?? null,
            completedAt: completedAt?.toISOString() ?? null,
            promisedAt: source === 'APP' ? new Date(placedAt.getTime() + 12 * 60_000).toISOString() : null,
            notificationLog, createdByUserId: source === 'APP' ? 'app' : staffAt(staffPool, store.id, 'counter').id,
            createdByName: source === 'APP' ? 'NOOKAA app' : staffAt(staffPool, store.id, 'counter').name,
          };

          const payment = makePayment(order, paymentProvider, paymentStatus === 'FAILED' ? 'FAILED' : 'PAID', placedAt);
          order.paymentId = payment.id;
          payments.push(payment);

          if (acceptedAt) {
            notificationLog.push(notificationFor('ORDER_ACCEPTED', order.customerPhone, acceptedAt));
            notificationLog.push(notificationFor('INVOICE_GENERATED', order.customerPhone, acceptedAt));
          }
          if (readyAt) notificationLog.push(notificationFor('ORDER_READY', order.customerPhone, readyAt));
          if (completedAt) notificationLog.push(notificationFor('ORDER_COMPLETED', order.customerPhone, completedAt));

          if (cupId) {
            const scans: CupToken['scans'] = [];
            const scanUser = staffAt(staffPool, store.id, 'counter').id;
            if (readyAt) scans.push({ at: readyAt.toISOString(), userId: scanUser, action: 'READY' });
            if (completedAt) scans.push({ at: completedAt.toISOString(), userId: scanUser, action: 'COMPLETED' });
            cups.push({
              cupId, orderId, storeId: store.id, token: buildCupToken(cupId),
              issuedAt: acceptedAt!.toISOString(), printedCount: 1, scans,
              voided: status === 'CANCELLED',
            });
          }
          if (invoiceId && acceptedAt) {
            const invoice = makeInvoice(order, params.organization, acceptedAt);
            invoice.id = invoiceId; // keep the id referenced from the order
            invoices.push(invoice);
          }

          if (status === 'REFUND_PENDING' || status === 'REFUNDED') {
            const requestedEvent = order.history.find((h) => h.status === 'REFUND_PENDING')!;
            const requester = staffAt(staffPool, store.id, 'counter');
            const refund: Refund = {
              id: uuid(), paymentId: payment.id, orderId, amountMinor: chance(0.8) ? order.totalMinor : Math.round(order.totalMinor * between(0.3, 0.8)),
              reason: requestedEvent.reason ?? pick(REFUND_REASONS), method: 'ORIGINAL',
              status: status === 'REFUNDED' ? 'PROCESSED' : 'PENDING',
              requestedBy: requester.id, requestedByName: requester.name,
              createdAt: requestedEvent.at,
            };
            if (status === 'REFUNDED') {
              const approvedEvent = order.history.find((h) => h.status === 'REFUNDED')!;
              let approver = staffAt(staffPool, store.id, 'approvers');
              if (approver.id === requester.id) approver = params.session.user;
              refund.approvedBy = approver.id;
              refund.approvedByName = approver.name;
              refund.approvedAt = approvedEvent.at;
              refund.processedAt = approvedEvent.at;
              refund.razorpayRefundId = paymentProvider === 'RAZORPAY' ? `rfnd_MOCK${uuid().replace(/-/g, '').slice(0, 10)}` : null;
              order.paymentStatus = refund.amountMinor >= order.totalMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
              payment.status = order.paymentStatus;
            }
            refunds.push(refund);
          } else if (status === 'CANCELLED' && chance(0.3)) {
            // A cancellation that was looked at and turned down, so Refunds shows a rejected row too.
            const requester = staffAt(staffPool, store.id, 'counter');
            let approver = staffAt(staffPool, store.id, 'approvers');
            if (approver.id === requester.id) approver = params.session.user;
            const at = new Date(placedAt.getTime() + int(30, 300) * 60_000);
            refunds.push({
              id: uuid(), paymentId: payment.id, orderId, amountMinor: order.totalMinor,
              reason: pick(REFUND_REJECT_REASONS), method: 'ORIGINAL', status: 'REJECTED',
              requestedBy: requester.id, requestedByName: requester.name,
              approvedBy: approver.id, approvedByName: approver.name, approvedAt: at.toISOString(),
              createdAt: at.toISOString(),
            });
          }

          orders.push(order);
          ordersCovered += 1;
        }
      }
    }

    // Fold in the customers this run touched (recompute their totals from the orders just built).
    for (const customer of newCustomers.values()) {
      const theirs = orders.filter((o) => o.customerId === customer.id);
      if (theirs.length === 0) continue;
      const last = theirs.reduce((a, b) => (a.placedAt > b.placedAt ? a : b));
      customer.totalOrders = theirs.length;
      customer.totalSpendMinor = theirs.filter((o) => o.status !== 'FAILED').reduce((s, o) => s + o.totalMinor, 0);
      customer.lastOrderAt = last.placedAt;
      customer.favouriteProductId = theirs[0].items[0]?.productId ?? null;
      customer.preferredStoreId = last.storeId;
    }

    await Promise.all([
      localStore().putMany('orders', orders.map((o) => [o.id, o])),
      localStore().putMany('payments', payments.map((p) => [p.id, p])),
      localStore().putMany('invoices', invoices.map((i) => [i.id, i])),
      localStore().putMany('refunds', refunds.map((r) => [r.id, r])),
      localStore().putMany('cups', cups.map((c) => [c.cupId, c])),
      localStore().putMany('customers', Array.from(newCustomers.values()).map((c) => [c.id, c])),
    ]);

    bus.emit(EVENTS.ORDERS_CHANGED);

    return {
      ordersAdded: ordersCovered,
      paymentsAdded: payments.length,
      invoicesAdded: invoices.length,
      refundsAdded: refunds.length,
      customersAdded: newCustomers.size,
      storesCovered: activeStores.length,
      daysCovered: days,
    };
  },
};
