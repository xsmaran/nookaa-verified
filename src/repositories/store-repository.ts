import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { ValidationError, DomainError } from '@/lib/errors';
import { isOpen } from '@/lib/order-state';
import { AuditRepository } from './audit-repository';
import { refreshCatalog } from './catalog-cache';
import type { Ingredient, InventoryLevel, Order, Organization, Session, Store } from '@/types';

/**
 * Stores.
 *
 * Replaces src/server/repo/org.ts's Store half and its two routes
 * (src/app/api/stores/route.ts, src/app/api/stores/[id]/route.ts). Same
 * validation, same "closing is a flag, not a delete" rule — a store is never
 * removed, only marked inactive, because every order, invoice and stock
 * movement it ever recorded still points at it.
 *
 * Not ported: GET /api/stores/resolve-maps-link, which followed a
 * maps.app.goo.gl short link's redirect server-side to read the coordinates
 * it lands on. A browser can't follow that redirect cross-origin, so that one
 * capability has no frontend-only equivalent — see the call site removed
 * from admin/stores/page.tsx.
 */

export interface StoreRow extends Store {
  openOrders: number;
  stockValueMinor: number;
}

export interface StoreInput {
  id?: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  gstin?: string;
  timezone?: string;
  openingTime: string;
  closingTime: string;
  prepSlaMinutes: number;
  latitude?: number | null;
  longitude?: number | null;
  active?: boolean;
}

const CODE_PATTERN = /^[A-Za-z0-9]+$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * @param requireGeo Coordinates are required on create (a new store cannot be
 * pinned to a map without one) but not on update, so a pre-existing store
 * missing a pin is not forced to add one just to save an unrelated change.
 */
function validate(input: StoreInput, requireGeo: boolean): Record<string, string> {
  const errors: Record<string, string> = {};

  const code = input.code?.trim() ?? '';
  if (code.length < 2 || code.length > 10 || !CODE_PATTERN.test(code)) {
    errors.code = 'A store code is 2-10 letters and numbers.';
  }

  if (!input.name || !input.name.trim()) {
    errors.name = 'Name is required.';
  }

  if (!input.openingTime || !TIME_PATTERN.test(input.openingTime)) {
    errors.openingTime = 'Use HH:MM.';
  }
  if (!input.closingTime || !TIME_PATTERN.test(input.closingTime)) {
    errors.closingTime = 'Use HH:MM.';
  }

  if (!Number.isInteger(input.prepSlaMinutes) || input.prepSlaMinutes < 1 || input.prepSlaMinutes > 120) {
    errors.prepSlaMinutes = 'Enter a whole number of minutes between 1 and 120.';
  }

  if (input.latitude == null || input.longitude == null) {
    if (requireGeo) {
      if (input.latitude == null) errors.latitude = 'Pin this store on the map.';
      if (input.longitude == null) errors.longitude = 'Pin this store on the map.';
    }
  } else {
    if (input.latitude < -90 || input.latitude > 90) errors.latitude = 'Latitude must be between -90 and 90.';
    if (input.longitude < -180 || input.longitude > 180) errors.longitude = 'Longitude must be between -180 and 180.';
  }

  return errors;
}

async function assertUniqueCode(code: string, excludeId?: string): Promise<void> {
  const upper = code.trim().toUpperCase();
  const all = await localStore().list<Store>('stores');
  const clash = all.find((s) => s.code.toUpperCase() === upper && s.id !== excludeId);
  if (clash) {
    throw new ValidationError(`A store with the code ${upper} already exists.`, {
      code: `The code ${upper} is already in use.`,
    });
  }
}

async function openOrderCount(storeId: string): Promise<number> {
  const orders = await localStore().list<Order>('orders');
  return orders.filter((o) => o.storeId === storeId && isOpen(o)).length;
}

/** Ledger valuation: on-hand quantity × ingredient cost, summed for the store. */
async function stockValueMinor(storeId: string): Promise<number> {
  const [levels, ingredients] = await Promise.all([
    localStore().list<InventoryLevel>('inventoryLevels'),
    localStore().list<Ingredient>('ingredients'),
  ]);
  const costById = new Map(ingredients.filter((i) => !i.archivedAt).map((i) => [i.id, i.costMinorPerUnit]));
  return levels
    .filter((l) => l.storeId === storeId)
    .reduce((sum, l) => sum + Math.round(l.onHand * (costById.get(l.ingredientId) ?? 0)), 0);
}

export const StoreRepository = {
  async all(): Promise<StoreRow[]> {
    const stores = await localStore().list<Store>('stores');
    const rows = await Promise.all(
      stores.map(async (s) => ({
        ...s,
        openOrders: await openOrderCount(s.id),
        stockValueMinor: await stockValueMinor(s.id),
      })),
    );
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  },

  async create(input: StoreInput, session: Session | null): Promise<Store> {
    const fieldErrors = validate(input, true);
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Check the highlighted fields.', fieldErrors);
    }

    const code = input.code.trim().toUpperCase();
    await assertUniqueCode(code);

    const orgs = await localStore().list<Organization>('org');
    const organization = orgs[0];

    const store: Store = {
      id: input.id ?? uuid(),
      organizationId: organization?.id ?? '',
      code,
      name: input.name.trim(),
      address: (input.address ?? '').trim(),
      city: (input.city ?? '').trim(),
      phone: (input.phone ?? '').trim(),
      gstin: input.gstin?.trim() || organization?.gstin || '',
      timezone: input.timezone ?? 'Asia/Kolkata',
      active: input.active ?? true,
      openingTime: input.openingTime,
      closingTime: input.closingTime,
      prepSlaMinutes: input.prepSlaMinutes,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    };

    await localStore().put('stores', store.id, store);
    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'store',
      entityId: store.id,
      entityLabel: store.name,
      action: 'created',
      after: store,
      summary: `opened ${store.name} (${store.code})`,
    });

    return store;
  },

  /** `code` is immutable after creation — silently ignored if present in `patch`. */
  async update(id: string, patch: Partial<StoreInput>, session: Session | null): Promise<Store> {
    const before = await localStore().get<Store>('stores', id);
    if (!before) throw new ValidationError('That store no longer exists.', {});

    const merged: StoreInput = {
      name: before.name,
      address: before.address,
      city: before.city,
      phone: before.phone,
      gstin: before.gstin,
      timezone: before.timezone,
      openingTime: before.openingTime,
      closingTime: before.closingTime,
      prepSlaMinutes: before.prepSlaMinutes,
      latitude: before.latitude,
      longitude: before.longitude,
      active: before.active,
      ...patch,
      code: before.code, // code is immutable after creation — a patch can never move it
    };

    const fieldErrors = validate(merged, false);
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Check the highlighted fields.', fieldErrors);
    }

    const after: Store = {
      ...before,
      name: merged.name.trim(),
      address: (merged.address ?? '').trim(),
      city: (merged.city ?? '').trim(),
      phone: (merged.phone ?? '').trim(),
      gstin: (merged.gstin ?? '').trim(),
      timezone: merged.timezone ?? before.timezone,
      openingTime: merged.openingTime,
      closingTime: merged.closingTime,
      prepSlaMinutes: merged.prepSlaMinutes,
      latitude: merged.latitude ?? null,
      longitude: merged.longitude ?? null,
      active: merged.active ?? before.active,
    };

    await localStore().put('stores', id, after);
    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'store',
      entityId: id,
      entityLabel: after.name,
      action: 'updated',
      before,
      after,
      summary: `updated ${after.name}`,
    });

    return after;
  },

  /** Closes (flags inactive) — refused while the store has orders still open. */
  async close(id: string, session: Session | null): Promise<Store> {
    const before = await localStore().get<Store>('stores', id);
    if (!before) throw new ValidationError('That store no longer exists.', {});

    const open = await openOrderCount(id);
    if (open > 0) {
      throw new DomainError(
        `${before.name} has ${open} ${open === 1 ? 'order' : 'orders'} still open. Finish them first.`,
      );
    }

    const after: Store = { ...before, active: false };
    await localStore().put('stores', id, after);
    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'store',
      entityId: id,
      entityLabel: before.name,
      action: 'closed',
      before,
      after,
      summary: `closed ${before.name}`,
    });

    return after;
  },
};
