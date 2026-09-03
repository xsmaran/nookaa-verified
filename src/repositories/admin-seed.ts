import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { CATEGORIES, PRODUCTS } from '@/mock/catalog';
import { INGREDIENTS, MODIFIER_GROUPS, RECIPES } from '@/mock/recipes';
import { CUSTOMERS, DEVICES, DISCOUNTS, ORGANIZATION, STORES, TAX_RATES, USERS } from '@/mock/org';
import type {
  AttendanceRecord, AttendanceStatus, Category, Customer, Discount, Ingredient, InventoryLevel,
  InventoryTransaction, ModifierGroup, NooksTransaction, Organization, Product, Store, StoreDevice, TaxRate,
} from '@/types';

/**
 * Seed — the frontend-only replacement for src/server/db/seed.ts.
 *
 * Same source data (src/mock/*), same shapes, written to IndexedDB instead of
 * SQLite. Runs once per device: `ensureAdminSeeded()` checks for an existing
 * organisation record before writing anything, exactly like the old script's
 * "already seeded, pass --reset" guard.
 */

/** A local-only record: the public `User`/staff shape plus a PIN to sign in with. */
export interface StaffRecord {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  email: string | null;
  employeeCode: string | null;
  role: import('@/types').RoleKey;
  storeIds: string[];
  active: boolean;
  pin: string;
  createdAt: string;
}

/* Deterministic noise — same generator and seed as the old seed.ts, so a
   fresh device shows the same "some ingredients are low" story every time. */
let seedState = 20260828;
const rand = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};
const between = (min: number, max: number) => min + rand() * (max - min);

const now = () => new Date().toISOString();

// Mirrors nooks-service.ts's default — kept as a real constant (not read back
// out of DEFAULT_SETTINGS below) because that object is loosely typed and
// the seeded balances below need to do arithmetic with it.
const NOOKS_EARN_PER_RUPEES = 10;

const DEFAULT_SETTINGS: Record<string, Record<string, unknown>> = {
  general: {
    businessName: ORGANIZATION.name,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    gstin: ORGANIZATION.gstin,
  },
  orders: {
    numberPrefix: ORGANIZATION.invoicePrefix,
    cancelAfterAcceptedRequires: 'MANAGER',
    refundRequiresApproval: true,
  },
  payments: { cashEnabled: true, upiEnabled: true, cardEnabled: true, razorpayEnabled: false },
  taxes: { defaultTaxRateId: 'tax-gst5', pricesIncludeTax: false },
  inventory: { autoDeductOnPreparing: true, blockSaleWhenOutOfStock: true, allowOverrideWithPermission: true },
  pos: { showProductImages: true, gridColumns: 4 },
  printer: { labelWidthMm: 50, labelHeightMm: 40 },
  notifications: { whatsappEnabled: false, notifyOnReady: true },
  // Nooks — the in-app loyalty coin. Earned on every paid order (1 per
  // ₹earnPerRupees spent, rounded down); spendable only through the app,
  // never at the counter — see nooks-service.ts.
  loyalty: { enabled: true, earnPerRupees: NOOKS_EARN_PER_RUPEES, redeemValuePaise: 100 },
};

const skuForProduct = (id: string) => `NK-${id.replace(/^p-/, '').toUpperCase()}`;
const skuForIngredient = (id: string) => `ING-${id.replace('ing-', '').toUpperCase()}`;

let seedPromise: Promise<void> | null = null;

export function ensureAdminSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = seedIfNeeded();
  return seedPromise;
}

async function seedIfNeeded(): Promise<void> {
  const store = localStore();
  const existingOrg = await store.get<Organization>('org', ORGANIZATION.id);
  if (existingOrg) return;

  const at = now();

  const org: Organization = {
    id: ORGANIZATION.id,
    name: ORGANIZATION.name,
    legalName: ORGANIZATION.name,
    gstin: ORGANIZATION.gstin,
    invoicePrefix: ORGANIZATION.invoicePrefix,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };
  await store.put('org', org.id, org);

  const stores: Array<[string, Store]> = STORES.map((s) => [
    s.id,
    { ...s, gstin: ORGANIZATION.gstin, latitude: null, longitude: null },
  ]);
  await store.putMany('stores', stores);

  const devices: Array<[string, StoreDevice]> = DEVICES.map((d) => [d.id, d]);
  await store.putMany('devices', devices);

  const staff: Array<[string, StaffRecord]> = USERS.map((u) => [
    u.id,
    {
      id: u.id,
      organizationId: u.organizationId,
      name: u.name,
      phone: u.phone,
      email: u.email ?? null,
      employeeCode: u.id.replace('usr-', 'EMP-').toUpperCase(),
      role: u.role,
      storeIds: u.storeIds,
      active: u.active,
      pin: u.pin,
      createdAt: at,
    },
  ]);
  staff.push([
    'usr-cash-01',
    {
      id: 'usr-cash-01',
      organizationId: ORGANIZATION.id,
      name: 'Deepa Salunkhe',
      phone: '+919820000008',
      email: null,
      employeeCode: 'EMP-CASH-01',
      role: 'CASHIER',
      storeIds: ['store-mum01'],
      active: true,
      pin: '8888',
      createdAt: at,
    },
  ]);
  await store.putMany('staff', staff);

  const categories: Array<[string, Category]> = CATEGORIES.map((c) => [
    c.id,
    { ...c, imageUrl: null, archivedAt: null },
  ]);
  await store.putMany('categories', categories);

  const recipeByProduct = new Map(RECIPES.map((r) => [r.productId, r]));
  const products: Array<[string, Product]> = PRODUCTS.map((p) => [
    p.id,
    {
      ...p,
      sku: skuForProduct(p.id),
      imageUrl: null,
      costMinor: null,
      available: true,
      prepSeconds: recipeByProduct.get(p.id)?.prepSeconds ?? null,
      archivedAt: null,
    },
  ]);
  await store.putMany('products', products);

  const modifierGroups: Array<[string, ModifierGroup]> = MODIFIER_GROUPS.map((g, i) => [
    g.id,
    { ...g, sortOrder: g.sortOrder ?? i, active: g.active ?? true },
  ]);
  await store.putMany('modifierGroups', modifierGroups);

  const ingredients: Array<[string, Ingredient]> = INGREDIENTS.map((ing) => [
    ing.id,
    { ...ing, sku: skuForIngredient(ing.id), supplier: null, shelfLifeDays: null, active: true, archivedAt: null },
  ]);
  await store.putMany('ingredients', ingredients);

  await store.putMany('recipes', RECIPES.map((r) => [r.id, r]));

  const discounts: Array<[string, Discount]> = DISCOUNTS.map((d) => [
    d.id,
    {
      ...d,
      minOrderMinor: 0,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      perCustomerLimit: null,
      usageCount: 0,
      productIds: [],
      categoryIds: [],
      storeIds: [],
      archivedAt: null,
    },
  ]);
  await store.putMany('discounts', discounts);

  const taxRates: Array<[string, TaxRate]> = TAX_RATES.map((t) => [
    t.id,
    { ...t, isDefault: t.id === 'tax-gst5', active: true },
  ]);
  await store.putMany('taxRates', taxRates);

  await store.put('settings', 'current', DEFAULT_SETTINGS);

  // Nooks earned from each customer's seeded order history, at the same rate
  // real orders use (see nooks-service.ts) — so the Nooks admin page has real
  // numbers on day one instead of a balance of zero for every customer who
  // has apparently already ordered dozens of times.
  const customers: Array<[string, Customer]> = CUSTOMERS.map((c) => {
    const nooksBalance = Math.floor(c.totalSpendMinor / 100 / NOOKS_EARN_PER_RUPEES);
    return [c.id, { ...c, nooksBalance }];
  });
  await store.putMany('customers', customers);

  const nooksTxns: Array<[string, NooksTransaction]> = customers
    .filter(([, c]) => (c.nooksBalance ?? 0) > 0)
    .map(([, c]) => {
      const id = uuid();
      return [id, {
        id, customerId: c.id, customerName: c.name, storeId: c.preferredStoreId ?? null, orderId: null,
        type: 'EARNED' as const, amount: c.nooksBalance ?? 0, balanceAfter: c.nooksBalance ?? 0,
        reason: 'Earned from order history', createdAt: at,
      }];
    });
  await store.putMany('nooksTransactions', nooksTxns);

  /* -------------------------------------------------- opening inventory */
  const stockKeeper = USERS.find((u) => u.role === 'MANAGER') ?? USERS[0];
  const levels: Array<[string, InventoryLevel]> = [];
  const txns: Array<[string, InventoryTransaction]> = [];

  for (const s of STORES) {
    for (const ingredient of INGREDIENTS) {
      const scale = ingredient.unit === 'pc' ? 1 : ingredient.unit === 'g' ? 1000 : 2000;
      const target = Math.round(scale * (ingredient.unit === 'pc' ? between(180, 600) : between(4, 14)));
      const roll = rand();
      const onHand =
        roll > 0.9 ? Math.round(target * 0.06)
        : roll > 0.78 ? Math.round(target * 0.22)
        : Math.round(target * (0.4 + rand() * 0.6));

      const level: InventoryLevel = {
        storeId: s.id,
        ingredientId: ingredient.id,
        onHand,
        minStock: Math.round(target * 0.15),
        reorderLevel: Math.round(target * 0.3),
        targetStock: target,
        updatedAt: at,
      };
      levels.push([`${s.id}:${ingredient.id}`, level]);

      const txnId = uuid();
      txns.push([
        txnId,
        {
          id: txnId,
          createdAt: at,
          updatedAt: at,
          deviceId: null,
          storeId: s.id,
          syncStatus: 'SYNCED',
          syncVersion: 1,
          ingredientId: ingredient.id,
          type: 'PURCHASE',
          qty: onHand,
          unit: ingredient.unit,
          reason: 'Opening stock',
          userId: stockKeeper.id,
          userName: stockKeeper.name,
        },
      ]);
    }
  }
  await store.putMany('inventoryLevels', levels);
  await store.putMany('inventoryTxns', txns);

  /* -------------------------------------------------- attendance history */
  // Real usage generates today's rows itself, from actual sign-ins — this is
  // only the backdated history a brand-new device would otherwise have none
  // of, so the Admin → Attendance heatmap has something to show on day one
  // instead of 45 empty squares. Today itself is left alone: whoever signs in
  // first writes it for real.
  // Matches the admin Attendance overview's 12-week heatmap window exactly —
  // a shorter history would leave its earliest weeks blank (reading as mass
  // absence) and drag the computed attendance rate down for no real reason.
  const ATTENDANCE_HISTORY_DAYS = 90;
  const attendance: Array<[string, AttendanceRecord]> = [];

  for (const [, member] of staff) {
    // Owners aren't rostered on a shift — see attendance-service.ts.
    if (!member.active || member.role === 'OWNER') continue;
    const homeStore = STORES.find((s) => s.id === member.storeIds[0]) ?? STORES[0];
    const [openH, openM] = homeStore.openingTime.split(':').map(Number);

    for (let dayOffset = 1; dayOffset <= ATTENDANCE_HISTORY_DAYS; dayOffset++) {
      const day = new Date();
      day.setDate(day.getDate() - dayOffset);
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

      const roll = rand();
      if (roll < 0.06) continue; // absent — no row at all
      if (roll < 0.10) {
        const id = uuid();
        attendance.push([id, {
          id, staffId: member.id, staffName: member.name, storeId: homeStore.id, date: dateKey,
          clockInAt: null, clockOutAt: null, status: 'ON_LEAVE' as AttendanceStatus,
          createdAt: at, updatedAt: at,
        }]);
        continue;
      }

      const isLate = rand() < 0.15;
      const minutesOffset = isLate ? Math.round(between(11, 45)) : Math.round(between(-15, 9));
      const clockIn = new Date(day);
      clockIn.setHours(openH, openM + minutesOffset, 0, 0);
      const clockOut = new Date(clockIn.getTime() + between(6.5, 9) * 3_600_000);

      const id = uuid();
      attendance.push([id, {
        id, staffId: member.id, staffName: member.name, storeId: homeStore.id, date: dateKey,
        clockInAt: clockIn.toISOString(), clockOutAt: clockOut.toISOString(),
        status: (isLate ? 'LATE' : 'PRESENT') as AttendanceStatus,
        createdAt: at, updatedAt: at,
      }]);
    }
  }
  await store.putMany('attendance', attendance);
}
