import type { Permission, Role, RoleKey } from '@/types';

/**
 * Permission sets.
 *
 * These are shared by both sides on purpose: the UI reads them to decide what
 * to show, and the API reads the same table to decide what to allow. One
 * source of truth means a button that is visible and an action that is
 * permitted can never drift apart.
 *
 * To be explicit about what this file is and is not — hiding a button is
 * ergonomics. The check that matters happens in `requirePermission()` on the
 * server, on every request. See /docs/02-roles-and-permissions.md.
 */

/**
 * Makes the drinks. Runs the counter too, in NOOKAA's grab-and-go format,
 * which is why this role takes orders and can apply a discount that is already
 * on the board. Inventing a new discount is `discount.override`, and that
 * stays with managers.
 */
const BARISTA: Permission[] = [
  'pos.use',
  'order.create',
  'order.accept',
  'order.advance',
  'order.cancel',
  'discount.apply',
  'invoice.send',
  'inventory.view',
];

/** Takes money. Does not touch the board — the bar owns preparation state. */
const CASHIER: Permission[] = [
  'pos.use',
  'order.create',
  'order.cancel',
  'discount.apply',
  'invoice.send',
  'inventory.view',
];

/** Runs one store. Everything operational, nothing organisation-wide. */
const MANAGER: Permission[] = [
  ...BARISTA,
  'order.refund',
  'order.cancel.elevated',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.override',
  'product.availability',
  'analytics.view',
  'finance.view',
  'staff.view',
];

/** Runs the business day to day. Everything except the keys to the building. */
const ADMIN: Permission[] = [
  ...MANAGER,
  'order.refund.approve',
  'discount.override',
  'catalog.manage',
  'discount.manage',
  'loyalty.manage',
  'store.manage',
  'staff.manage',
  'device.manage',
  'settings.manage',
  'audit.view',
];

/**
 * Owner-only, and the reason ADMIN is not simply "everything": an admin who is
 * compromised or leaving should not be able to mint another admin, change the
 * GSTIN that appears on every invoice, or delete a store's history.
 */
const OWNER: Permission[] = [
  ...ADMIN,
  'staff.manage.privileged',
  'settings.manage.system',
  'store.delete',
  'data.export',
];

export const ROLES: Record<RoleKey, Role> = {
  BARISTA: { key: 'BARISTA', label: 'Barista', permissions: BARISTA },
  CASHIER: { key: 'CASHIER', label: 'Cashier', permissions: CASHIER },
  MANAGER: { key: 'MANAGER', label: 'Store manager', permissions: MANAGER },
  ADMIN: { key: 'ADMIN', label: 'Admin', permissions: ADMIN },
  OWNER: { key: 'OWNER', label: 'Owner', permissions: OWNER },
};

/** Who may create or edit whom. A manager cannot mint an owner. */
const MANAGEABLE_ROLES: Record<RoleKey, RoleKey[]> = {
  OWNER: ['OWNER', 'ADMIN', 'MANAGER', 'BARISTA', 'CASHIER'],
  ADMIN: ['MANAGER', 'BARISTA', 'CASHIER'],
  MANAGER: ['BARISTA', 'CASHIER'],
  BARISTA: [],
  CASHIER: [],
};

export function can(role: RoleKey | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLES[role].permissions.includes(permission);
}

export function canManageRole(actor: RoleKey | undefined, target: RoleKey): boolean {
  if (!actor) return false;
  return MANAGEABLE_ROLES[actor].includes(target);
}

export function manageableRoles(actor: RoleKey | undefined): RoleKey[] {
  if (!actor) return [];
  return MANAGEABLE_ROLES[actor];
}

/** Who lands in /admin rather than /pos after signing in. */
export function isAdminRole(role: RoleKey | undefined): boolean {
  return role === 'ADMIN' || role === 'OWNER' || role === 'MANAGER';
}

/** A manager is pinned to their stores; owners and admins move freely. */
export function isGlobalRole(role: RoleKey | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Human labels for the permission matrix in Admin → Staff. Keeping them here
 * rather than in the page means the matrix cannot silently fall out of date
 * when a permission is added: TypeScript flags the missing key.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'pos.use': 'Take orders on the POS',
  'order.create': 'Create an order',
  'order.accept': 'Accept an incoming order',
  'order.advance': 'Move an order through the board',
  'order.cancel': 'Cancel an order before it is made',
  'order.cancel.elevated': 'Cancel an order that is already on the bar',
  'order.refund': 'Raise a refund',
  'order.refund.approve': 'Approve a refund',
  'invoice.send': 'Send or resend an invoice',
  'inventory.view': 'See stock levels',
  'inventory.adjust': 'Receive stock, log waste, adjust counts',
  'inventory.transfer': 'Move stock between stores',
  'inventory.override': 'Sell a drink that is out of stock',
  'product.availability': 'Mark a drink available or unavailable',
  'catalog.manage': 'Change the menu, prices and recipes',
  'discount.apply': 'Apply a listed discount',
  'discount.override': 'Discount beyond the listed rules',
  'discount.manage': 'Create and edit discount codes',
  'loyalty.manage': 'See and adjust customer Nooks balances',
  'store.manage': 'Add and configure stores',
  'store.delete': 'Archive a store',
  'staff.view': 'See the staff roster',
  'staff.manage': 'Add staff and change roles',
  'staff.manage.privileged': 'Create or edit owner and admin accounts',
  'device.manage': 'Register and retire devices',
  'finance.view': 'See payments, invoices and refunds',
  'analytics.view': 'See sales reporting',
  'settings.manage': 'Change operational settings',
  'settings.manage.system': 'Change GSTIN, currency and system settings',
  'audit.view': 'Read the audit log',
  'data.export': 'Export data out of the system',
};

/** Every permission, in the order the matrix should display them. */
export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];
