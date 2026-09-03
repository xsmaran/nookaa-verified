import type { Customer, Discount, Organization, Store, StoreDevice, TaxRate, User } from '@/types';

/**
 * Seed input. See the note in ./catalog.ts.
 *
 * `SeedUser` carries a plaintext PIN because somebody has to choose the first
 * one. It is hashed on the way into the database and never read back — which
 * is exactly why `User` itself has no `pin` field at all.
 */
export type SeedUser = Omit<User, 'employeeCode' | 'lastSeenAt' | 'createdAt'> & { pin: string };
export type SeedStore = Omit<Store, 'gstin'>;
export type SeedTaxRate = Omit<TaxRate, 'isDefault' | 'active'>;
export type SeedDiscount = Pick<
  Discount, 'id' | 'code' | 'name' | 'kind' | 'value' | 'maxDiscountMinor' | 'requiresApproval' | 'active'
>;
export type SeedOrganization = Pick<Organization, 'id' | 'name' | 'gstin' | 'invoicePrefix'>;

/** MOCK org data. Replace with the real store list and staff roster at rollout. */

export const ORGANIZATION: SeedOrganization = {
  id: 'org-nookaa',
  name: 'NOOKAA Beverages & Beyond',
  gstin: '27AABCN1234M1ZV',
  invoicePrefix: 'NK',
};

export const STORES: SeedStore[] = [
  {
    id: 'store-mum01',
    organizationId: 'org-nookaa',
    code: 'MUM01',
    name: 'NOOKAA Bandra Kurla',
    address: 'Ground Floor, G Block, Bandra Kurla Complex',
    city: 'Mumbai',
    phone: '+912266001101',
    timezone: 'Asia/Kolkata',
    active: true,
    openingTime: '07:30',
    closingTime: '23:00',
    prepSlaMinutes: 6,
  },
  {
    id: 'store-mum02',
    organizationId: 'org-nookaa',
    code: 'MUM02',
    name: 'NOOKAA Lower Parel',
    address: 'Unit 4, Kamala Mills Compound, Lower Parel',
    city: 'Mumbai',
    phone: '+912266001102',
    timezone: 'Asia/Kolkata',
    active: true,
    openingTime: '08:00',
    closingTime: '23:30',
    prepSlaMinutes: 7,
  },
  {
    id: 'store-mum03',
    organizationId: 'org-nookaa',
    code: 'MUM03',
    name: 'NOOKAA Powai Lakeside',
    address: 'Shop 2, Central Avenue, Hiranandani Gardens, Powai',
    city: 'Mumbai',
    phone: '+912266001103',
    timezone: 'Asia/Kolkata',
    active: true,
    openingTime: '08:00',
    closingTime: '22:30',
    prepSlaMinutes: 7,
  },
  {
    id: 'store-del01',
    organizationId: 'org-nookaa',
    code: 'DEL01',
    name: 'NOOKAA Connaught Place',
    address: 'Block N, Outer Circle, Connaught Place',
    city: 'Delhi',
    phone: '+911145001101',
    timezone: 'Asia/Kolkata',
    active: true,
    openingTime: '08:00',
    closingTime: '23:00',
    prepSlaMinutes: 7,
  },
  {
    id: 'store-blr01',
    organizationId: 'org-nookaa',
    code: 'BLR01',
    name: 'NOOKAA Indiranagar',
    address: '100 Feet Road, Indiranagar',
    city: 'Bengaluru',
    phone: '+918046001101',
    timezone: 'Asia/Kolkata',
    active: true,
    openingTime: '08:00',
    closingTime: '23:00',
    prepSlaMinutes: 6,
  },
];

export const DEVICES: StoreDevice[] = [
  { id: 'dev-mum01-pos01', storeId: 'store-mum01', code: 'POS01', name: 'Front counter', type: 'POS', lastSeenAt: new Date().toISOString(), online: true, printerName: 'NOOKAA-Label-01' },
  { id: 'dev-mum01-pos02', storeId: 'store-mum01', code: 'POS02', name: 'Express counter', type: 'POS', lastSeenAt: new Date(Date.now() - 4 * 60000).toISOString(), online: true, printerName: 'NOOKAA-Label-02' },
  { id: 'dev-mum01-bar01', storeId: 'store-mum01', code: 'BAR01', name: 'Bar station 1', type: 'BAR_STATION', lastSeenAt: new Date().toISOString(), online: true, printerName: null },
  { id: 'dev-mum01-kds01', storeId: 'store-mum01', code: 'KDS01', name: 'Pickup screen', type: 'KDS', lastSeenAt: new Date(Date.now() - 90 * 60000).toISOString(), online: false, printerName: null },
  { id: 'dev-mum02-pos01', storeId: 'store-mum02', code: 'POS01', name: 'Front counter', type: 'POS', lastSeenAt: new Date().toISOString(), online: true, printerName: 'NOOKAA-Label-11' },
  { id: 'dev-mum02-bar01', storeId: 'store-mum02', code: 'BAR01', name: 'Bar station 1', type: 'BAR_STATION', lastSeenAt: new Date(Date.now() - 12 * 60000).toISOString(), online: true, printerName: null },
  { id: 'dev-mum03-pos01', storeId: 'store-mum03', code: 'POS01', name: 'Front counter', type: 'POS', lastSeenAt: new Date(Date.now() - 3 * 3600000).toISOString(), online: false, printerName: 'NOOKAA-Label-21' },
  { id: 'dev-del01-pos01', storeId: 'store-del01', code: 'POS01', name: 'Front counter', type: 'POS', lastSeenAt: new Date().toISOString(), online: true, printerName: 'NOOKAA-Label-31' },
  { id: 'dev-del01-bar01', storeId: 'store-del01', code: 'BAR01', name: 'Bar station 1', type: 'BAR_STATION', lastSeenAt: new Date().toISOString(), online: true, printerName: null },
  { id: 'dev-blr01-pos01', storeId: 'store-blr01', code: 'POS01', name: 'Front counter', type: 'POS', lastSeenAt: new Date(Date.now() - 15 * 60000).toISOString(), online: true, printerName: 'NOOKAA-Label-41' },
  { id: 'dev-blr01-bar01', storeId: 'store-blr01', code: 'BAR01', name: 'Bar station 1', type: 'BAR_STATION', lastSeenAt: new Date(Date.now() - 15 * 60000).toISOString(), online: true, printerName: null },
];

/**
 * MOCK PINs. Real PINs never live in the client — the backend hashes them and
 * the POS exchanges PIN + device token for a short-lived session.
 */
export const USERS: SeedUser[] = [
  { id: 'usr-owner', organizationId: 'org-nookaa', name: 'Smaran U.', phone: '+919820000001', email: 'owner@nookaa.in', role: 'OWNER', storeIds: [], pin: '1111', active: true },
  { id: 'usr-admin', organizationId: 'org-nookaa', name: 'Ritika Shah', phone: '+919820000002', email: 'ops@nookaa.in', role: 'ADMIN', storeIds: [], pin: '2222', active: true },
  { id: 'usr-mgr-01', organizationId: 'org-nookaa', name: 'Farhan Qureshi', phone: '+919820000003', role: 'MANAGER', storeIds: ['store-mum01'], pin: '3333', active: true },
  { id: 'usr-bar-01', organizationId: 'org-nookaa', name: 'Aditi Rane', phone: '+919820000004', role: 'BARISTA', storeIds: ['store-mum01'], pin: '4444', active: true },
  { id: 'usr-bar-02', organizationId: 'org-nookaa', name: 'Nikhil Menon', phone: '+919820000005', role: 'BARISTA', storeIds: ['store-mum01', 'store-mum02'], pin: '5555', active: true },
  { id: 'usr-bar-03', organizationId: 'org-nookaa', name: 'Sana Kapoor', phone: '+919820000006', role: 'BARISTA', storeIds: ['store-mum02'], pin: '6666', active: true },
  { id: 'usr-bar-04', organizationId: 'org-nookaa', name: 'Joel D’Souza', phone: '+919820000007', role: 'BARISTA', storeIds: ['store-mum03'], pin: '7777', active: true },
];

export const TAX_RATES: SeedTaxRate[] = [
  { id: 'tax-gst5', name: 'GST 5% (composite, no ITC)', rateBps: 500, inclusive: false },
  { id: 'tax-gst18', name: 'GST 18% (packaged goods)', rateBps: 1800, inclusive: false },
  { id: 'tax-nil', name: 'Exempt', rateBps: 0, inclusive: false },
];

export const DEFAULT_TAX = TAX_RATES[0];

export const DISCOUNTS: SeedDiscount[] = [
  { id: 'disc-staff', code: 'STAFF25', name: 'Staff 25%', kind: 'PERCENT', value: 2500, requiresApproval: true, active: true },
  { id: 'disc-first', code: 'FIRSTSIP', name: 'First order ₹50 off', kind: 'FLAT', value: 5000, requiresApproval: false, active: true },
  { id: 'disc-happy', code: 'HAPPY15', name: 'Happy hour 15%', kind: 'PERCENT', value: 1500, maxDiscountMinor: 10000, requiresApproval: false, active: true },
  { id: 'disc-service', code: 'SORRY', name: 'Service recovery', kind: 'PERCENT', value: 10000, requiresApproval: true, active: true },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const CUSTOMERS: Customer[] = [
  { id: 'cus-001', name: 'Rahul Deshpande', phone: '+919820100001', createdAt: daysAgo(140), totalOrders: 63, totalSpendMinor: 1489000, lastOrderAt: daysAgo(1), favouriteProductId: 'p-ic-04', preferredStoreId: 'store-mum01' },
  { id: 'cus-002', name: 'Priya Nair', phone: '+919820100002', createdAt: daysAgo(96), totalOrders: 41, totalSpendMinor: 1105000, lastOrderAt: daysAgo(2), favouriteProductId: 'p-mm-01', preferredStoreId: 'store-mum01' },
  { id: 'cus-003', name: 'Arjun Mehta', phone: '+919820100003', createdAt: daysAgo(58), totalOrders: 28, totalSpendMinor: 742000, lastOrderAt: daysAgo(3), favouriteProductId: 'p-cb-02', preferredStoreId: 'store-mum02' },
  { id: 'cus-004', name: 'Meera Iyer', phone: '+919820100004', createdAt: daysAgo(33), totalOrders: 12, totalSpendMinor: 318000, lastOrderAt: daysAgo(5), favouriteProductId: 'p-it-01', preferredStoreId: 'store-mum01' },
  { id: 'cus-005', name: 'Kabir Anand', phone: '+919820100005', createdAt: daysAgo(21), totalOrders: 9, totalSpendMinor: 264000, lastOrderAt: daysAgo(1), favouriteProductId: 'p-bl-01', preferredStoreId: 'store-mum03' },
  { id: 'cus-006', name: 'Ananya Bose', phone: '+919820100006', createdAt: daysAgo(12), totalOrders: 5, totalSpendMinor: 132000, lastOrderAt: daysAgo(4), favouriteProductId: 'p-ub-01', preferredStoreId: 'store-mum02' },
  { id: 'cus-007', name: 'Rohan Kulkarni', phone: '+919820100007', createdAt: daysAgo(7), totalOrders: 3, totalSpendMinor: 72900, lastOrderAt: daysAgo(0), favouriteProductId: 'p-hc-05', preferredStoreId: 'store-mum01' },
  { id: 'cus-008', name: 'Zoya Sheikh', phone: '+919820100008', createdAt: daysAgo(4), totalOrders: 2, totalSpendMinor: 51800, lastOrderAt: daysAgo(0), favouriteProductId: 'p-mt-03', preferredStoreId: 'store-mum01' },
];

export const STORE_BY_ID = new Map(STORES.map((s) => [s.id, s]));
export const USER_BY_ID = new Map(USERS.map((u) => [u.id, u]));
export const TAX_BY_ID = new Map(TAX_RATES.map((t) => [t.id, t]));
