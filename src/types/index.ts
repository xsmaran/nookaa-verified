/**
 * NOOKAA POS — domain types.
 *
 * These mirror the backend schema documented in /docs/04-database-schema.md.
 * Every record that can be created on a device carries the sync envelope
 * (id/createdAt/updatedAt/deviceId/storeId/syncStatus/syncVersion) so an
 * offline write is a first-class record, not a patch waiting to be applied.
 */

export type UUID = string;
export type ISODate = string;

export type SyncStatus = 'LOCAL' | 'PENDING' | 'UPLOADING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export interface SyncEnvelope {
  id: UUID;
  createdAt: ISODate;
  updatedAt: ISODate;
  deviceId: string | null;
  storeId: string | null;
  syncStatus: SyncStatus;
  syncVersion: number;
}

/* ---------------------------------------------------------------- identity */

export type RoleKey = 'OWNER' | 'ADMIN' | 'MANAGER' | 'BARISTA' | 'CASHIER';

export type Permission =
  | 'pos.use'
  | 'order.create'
  | 'order.accept'
  | 'order.advance'
  | 'order.cancel'
  | 'order.cancel.elevated'
  | 'order.refund'
  | 'order.refund.approve'
  | 'invoice.send'
  | 'inventory.view'
  | 'inventory.adjust'
  | 'inventory.transfer'
  | 'inventory.override'
  | 'product.availability'
  | 'catalog.manage'
  | 'discount.apply'
  | 'discount.override'
  | 'discount.manage'
  | 'loyalty.manage'
  | 'store.manage'
  | 'store.delete'
  | 'staff.view'
  | 'staff.manage'
  | 'staff.manage.privileged'
  | 'device.manage'
  | 'finance.view'
  | 'analytics.view'
  | 'settings.manage'
  | 'settings.manage.system'
  | 'audit.view'
  | 'data.export';

export interface Role {
  key: RoleKey;
  label: string;
  permissions: Permission[];
}

export interface User {
  id: UUID;
  organizationId: UUID;
  name: string;
  phone: string;
  email?: string | null;
  employeeCode?: string | null;
  role: RoleKey;
  /** Stores this user may act in. Empty = every store in the org. */
  storeIds: string[];
  active: boolean;
  /**
   * Note there is no `pin` here. The PIN exists only as a scrypt hash in the
   * database and is never sent to a client, not even to the owner's own
   * session. Setting one is a write-only operation.
   */
  lastSeenAt?: ISODate | null;
  createdAt?: ISODate;
}

export interface Organization {
  id: UUID;
  name: string;
  legalName: string;
  gstin: string;
  invoicePrefix: string;
  currency: string;
  timezone: string;
  logoUrl?: string | null;
}

export interface Store {
  id: UUID;
  organizationId: UUID;
  code: string; // MUM01 — used in human order numbers
  name: string;
  address: string;
  city: string;
  phone: string;
  gstin?: string;
  timezone: string;
  active: boolean;
  openingTime: string;
  closingTime: string;
  /** Target minutes from ACCEPTED to READY. Drives SLA colouring. */
  prepSlaMinutes: number;
  /** Map pin. Required when a store is created; older stores may not have one. */
  latitude?: number | null;
  longitude?: number | null;
}

export type DeviceType = 'POS' | 'BAR_STATION' | 'KDS' | 'TABLET';

export interface StoreDevice {
  id: UUID;
  storeId: string;
  code: string; // POS01
  name: string;
  type: DeviceType;
  lastSeenAt: ISODate | null;
  online: boolean;
  assignedUserId?: UUID | null;
  printerName?: string | null;
}

/* ----------------------------------------------------------------- catalog */

export type ServeTemp = 'HOT' | 'COLD' | 'BLENDED' | 'HOT_OR_COLD';

export interface Category {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  imageUrl?: string | null;
  sortOrder: number;
  active: boolean;
  archivedAt?: ISODate | null;
}

export interface Product {
  id: string;
  categoryId: string;
  sku?: string | null;
  /** NOOKAA's poetic name, e.g. "The Silk Road". */
  name: string;
  /** The plain drink name a barista calls out, e.g. "Iced Latte". */
  spec: string;
  description: string;
  imageUrl?: string | null;
  temp: ServeTemp;
  /** Base price in paise. Money is never a float. */
  priceMinor: number;
  /** Manual cost override in paise. Null = derive it from the recipe. */
  costMinor?: number | null;
  taxRateId: string;
  tags: string[];
  modifierGroupIds: string[];
  /** On the menu at all. An archived product is neither active nor listed. */
  active: boolean;
  /**
   * Sellable right now. Distinct from `active`: a drink can be on the menu and
   * still be 86'd because the bar ran out of oat milk an hour ago.
   */
  available: boolean;
  prepSeconds?: number | null;
  /** Store ids this product is limited to. Empty = available everywhere. */
  storeIds: string[];
  sortOrder: number;
  badge?: 'POPULAR' | 'NEW' | 'SIGNATURE' | null;
  archivedAt?: ISODate | null;
}

/** Why the POS is showing a drink as unsellable. */
export type UnavailableReason = 'ADMIN' | 'STORE' | 'OUT_OF_STOCK';

/** A product as the POS sees it: the catalog plus this store's reality. */
export interface PosProduct extends Product {
  unavailableReason?: UnavailableReason | null;
  /** Ingredients that are short, when the reason is OUT_OF_STOCK. */
  blockedBy?: string[];
}

export interface ModifierOption {
  id: string;
  groupId?: string;
  name: string;
  priceMinor: number;
  ingredientDelta?: { ingredientId: string; qty: number }[];
  isDefault?: boolean;
  sortOrder?: number;
  active?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** SINGLE = radio (milk, sweetness). MULTI = checkbox (add-ons). */
  selection: 'SINGLE' | 'MULTI';
  required: boolean;
  maxSelections?: number | null;
  sortOrder?: number;
  active?: boolean;
  options: ModifierOption[];
}

/* --------------------------------------------------------------- inventory */

export type Unit = 'g' | 'ml' | 'pc';

export type IngredientCategory =
  | 'COFFEE' | 'DAIRY' | 'SYRUP' | 'TEA' | 'FRUIT' | 'TOPPING' | 'PACKAGING' | 'OTHER';

export interface Ingredient {
  id: string;
  name: string;
  sku?: string | null;
  /**
   * The base unit the ledger speaks. Purchases arriving in kg or litres are
   * converted on the way in, so no report ever has to guess which unit a row
   * is in. See PURCHASE_UNITS in lib/units.ts.
   */
  unit: Unit;
  category: IngredientCategory;
  /** Cost per base unit in paise, for waste and COGS reporting. */
  costMinorPerUnit: number;
  supplier?: string | null;
  perishable: boolean;
  shelfLifeDays?: number | null;
  active: boolean;
  archivedAt?: ISODate | null;
}

export interface RecipeItem {
  ingredientId: string;
  qty: number;
  /** Expected loss on the bar. 2 means 2% more is drawn than reaches the cup. */
  wastagePct?: number;
}

export interface Recipe {
  id: string;
  productId: string;
  /** Recipes differ by serving format: 250 ml hot vs 475 ml cold. */
  variant: 'HOT_250' | 'COLD_475' | 'BLENDED_475';
  yieldMl: number;
  items: RecipeItem[];
  prepSeconds: number;
}

export interface InventoryLevel {
  storeId: string;
  ingredientId: string;
  /** Derived from the ledger. Never written directly. */
  onHand: number;
  minStock: number;
  reorderLevel: number;
  targetStock: number;
  updatedAt: ISODate;
}

export type InventoryTxnType =
  | 'PURCHASE'
  | 'SALE'
  | 'WASTE'
  | 'SPOILAGE'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'STOCK_COUNT';

export interface InventoryTransaction extends SyncEnvelope {
  ingredientId: string;
  type: InventoryTxnType;
  /** Signed: negative for consumption. Unit matches the ingredient. */
  qty: number;
  unit: Unit;
  reason?: string;
  userId: UUID;
  userName?: string;
  orderId?: UUID | null;
  transferId?: UUID | null;
}

export type TransferStatus = 'REQUESTED' | 'APPROVED' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';

export interface InventoryTransfer {
  id: UUID;
  reference: string;
  fromStoreId: string;
  toStoreId: string;
  status: TransferStatus;
  items: { ingredientId: string; qty: number; unit: Unit }[];
  requestedBy: UUID;
  approvedBy?: UUID | null;
  receivedBy?: UUID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  note?: string;
}

/* ------------------------------------------------------------------ orders */

export type OrderStatus =
  | 'PAYMENT_PENDING'
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'HANDED_OVER'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'FAILED';

export type OrderSource = 'OFFLINE_POS' | 'APP' | 'ADMIN' | 'OTHER';
export type OrderType = 'TAKEAWAY' | 'DINE_IN' | 'PICKUP' | 'DELIVERY';
export type OrderPriority = 'NORMAL' | 'HIGH' | 'DELAYED';

export interface OrderItemModifier {
  groupId: string;
  optionId: string;
  name: string;
  priceMinor: number;
}

export interface OrderItem {
  id: UUID;
  productId: string;
  name: string;
  spec: string;
  temp: ServeTemp;
  qty: number;
  unitPriceMinor: number;
  modifiers: OrderItemModifier[];
  note?: string;
  lineTotalMinor: number;
}

export interface OrderStatusEvent {
  id: UUID;
  status: OrderStatus;
  at: ISODate;
  userId: UUID | null;
  userName: string;
  deviceId: string | null;
  reason?: string;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type PaymentProvider = 'RAZORPAY' | 'UPI' | 'CARD' | 'CASH' | 'OTHER';

export type NotificationEvent =
  | 'ORDER_RECEIVED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_COMPLETED'
  | 'INVOICE_GENERATED';

export interface NotificationRecord {
  id: UUID;
  event: NotificationEvent;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PUSH';
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  to: string | null;
  at: ISODate;
  detail?: string;
}

export interface Order extends SyncEnvelope {
  /** Human-readable, device-safe: NK-MUM01-260826-0042 */
  orderNumber: string;
  organizationId: UUID;
  sequence: number;
  status: OrderStatus;
  source: OrderSource;
  type: OrderType;
  priority: OrderPriority;
  customerId?: UUID | null;
  customerName: string;
  customerPhone: string | null;
  items: OrderItem[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  discountCode?: string | null;
  cupId: string | null;
  paymentId?: UUID | null;
  paymentStatus: PaymentStatus;
  paymentProvider?: PaymentProvider | null;
  invoiceId?: UUID | null;
  history: OrderStatusEvent[];
  placedAt: ISODate;
  acceptedAt?: ISODate | null;
  readyAt?: ISODate | null;
  completedAt?: ISODate | null;
  /** App orders can promise a pickup slot. Drives priority escalation. */
  promisedAt?: ISODate | null;
  notificationLog: NotificationRecord[];
  createdByUserId: UUID;
  createdByName: string;
}

/* ---------------------------------------------------------------- payments */

export interface Payment {
  id: UUID;
  orderId: UUID;
  storeId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amountMinor: number;
  /** Razorpay ids are references, never our primary key. */
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignatureVerified?: boolean;
  tenderedMinor?: number | null;
  changeMinor?: number | null;
  capturedAt?: ISODate | null;
  failureReason?: string | null;
  createdAt: ISODate;
}

export interface Refund {
  id: UUID;
  paymentId: UUID;
  orderId: UUID;
  amountMinor: number;
  reason: string;
  /** How the money goes back. ORIGINAL means the way it came in. */
  method?: 'ORIGINAL' | 'CASH' | 'UPI' | 'OTHER';
  /**
   * REJECTED is a decision, not a failure: somebody looked at the request and
   * said no. FAILED is the payment provider refusing. Collapsing the two would
   * lose the difference between a judgement and an outage.
   */
  status: 'PENDING' | 'PROCESSED' | 'FAILED' | 'REJECTED';
  razorpayRefundId?: string | null;
  requestedBy: UUID;
  requestedByName: string;
  approvedBy?: UUID | null;
  approvedByName?: string | null;
  approvedAt?: ISODate | null;
  processedAt?: ISODate | null;
  createdAt: ISODate;
}

export interface Invoice {
  id: UUID;
  invoiceNumber: string;
  orderId: UUID;
  storeId: string;
  paymentId?: UUID | null;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  gstin: string;
  issuedAt: ISODate;
  pdfUrl?: string | null;
  deliveryStatus: 'NOT_SENT' | 'SENT' | 'FAILED' | 'NO_PHONE';
  deliveredAt?: ISODate | null;
}

export interface TaxRate {
  id: string;
  name: string;
  /** Basis points: 500 = 5.00%. */
  rateBps: number;
  inclusive: boolean;
  isDefault: boolean;
  active: boolean;
}

export interface Discount {
  id: string;
  code: string;
  name: string;
  kind: 'PERCENT' | 'FLAT';
  /** Percent in basis points, or flat amount in paise. */
  value: number;
  minOrderMinor: number;
  maxDiscountMinor?: number | null;
  startsAt?: ISODate | null;
  endsAt?: ISODate | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  usageCount: number;
  /** Empty arrays mean "everything" in that dimension. */
  productIds: string[];
  categoryIds: string[];
  storeIds: string[];
  requiresApproval: boolean;
  active: boolean;
  archivedAt?: ISODate | null;
}

/** Why a code was turned away, so the POS can say something useful. */
export type DiscountRejection =
  | 'UNKNOWN'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'BELOW_MINIMUM'
  | 'USAGE_LIMIT'
  | 'CUSTOMER_LIMIT'
  | 'WRONG_STORE'
  | 'NO_ELIGIBLE_ITEMS'
  | 'NEEDS_APPROVAL';

/* ------------------------------------------------------------------ people */

export interface Customer {
  id: UUID;
  name: string;
  phone: string;
  createdAt: ISODate;
  totalOrders: number;
  totalSpendMinor: number;
  lastOrderAt?: ISODate | null;
  favouriteProductId?: string | null;
  preferredStoreId?: string | null;
  /** Nooks — the in-app loyalty coin. Earned on every order, spent only through the app. See nooks-service.ts. */
  nooksBalance?: number;
}

export type NooksTransactionType = 'EARNED' | 'REDEEMED' | 'ADJUSTED';

/** One entry in a customer's Nooks ledger — the balance is derived, never edited directly. */
export interface NooksTransaction {
  id: UUID;
  customerId: UUID;
  customerName: string;
  storeId: string | null;
  orderId?: UUID | null;
  type: NooksTransactionType;
  /** Signed: positive for EARNED, negative for REDEEMED or a downward ADJUSTED. */
  amount: number;
  balanceAfter: number;
  reason?: string;
  createdAt: ISODate;
}

/**
 * One shift, one row. `PRESENT`/`LATE` are decided at clock-in (past the
 * store's opening time plus a grace period); a day nobody clocked in for
 * stays absent from the log entirely rather than being synthesised —
 * "no record" and "marked absent" are different facts.
 */
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ON_LEAVE';

export interface AttendanceRecord {
  id: UUID;
  staffId: UUID;
  staffName: string;
  storeId: string;
  /** The shift's local calendar day, YYYY-MM-DD — not derived from clockInAt at render time, so a shift past midnight still belongs to the day it started. */
  date: string;
  clockInAt: ISODate | null;
  clockOutAt: ISODate | null;
  status: AttendanceStatus;
  note?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* --------------------------------------------------------- cups & ops logs */

export interface CupToken {
  cupId: string; // CUP-8F4A91
  orderId: UUID;
  storeId: string;
  token: string; // opaque; signed server side in production
  issuedAt: ISODate;
  printedCount: number;
  scans: { at: ISODate; userId: UUID; action: string }[];
  voided: boolean;
  /**
   * App orders only. A short spoken/typed alternative to scanning the cup's
   * own QR — for a customer picking up an order placed remotely, who was
   * never handed a printed label to scan in the first place.
   */
  pickupCode?: string | null;
}

export interface AuditLog {
  id: UUID;
  at: ISODate;
  userId: UUID;
  userName: string;
  userRole?: RoleKey;
  storeId: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityLabel?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface Shift {
  id: UUID;
  storeId: string;
  deviceId: string;
  openedBy: UUID;
  openedByName: string;
  openedAt: ISODate;
  openingFloatMinor: number;
  closedAt?: ISODate | null;
  countedCashMinor?: number | null;
  expectedCashMinor?: number | null;
  varianceMinor?: number | null;
  status: ShiftStatus;
}

export interface OutboxEvent {
  id: UUID;
  type: string;
  payload: unknown;
  createdAt: ISODate;
  attempts: number;
  nextAttemptAt: ISODate;
  status: 'PENDING' | 'UPLOADING' | 'SYNCED' | 'FAILED';
  lastError?: string;
}

export interface Session {
  user: User;
  storeId: string;
  deviceId: string;
  shiftId?: UUID | null;
  startedAt: ISODate;
}

/* --------------------------------------------------------------- POS cart */

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  spec: string;
  temp: ServeTemp;
  qty: number;
  unitPriceMinor: number;
  modifiers: OrderItemModifier[];
  note?: string;
}
