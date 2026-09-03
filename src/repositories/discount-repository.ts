import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { ValidationError } from '@/lib/errors';
import { AuditRepository } from './audit-repository';
import { refreshCatalog } from './catalog-cache';
import type { Discount, Order, Session } from '@/types';

/**
 * Discount codes.
 *
 * Replaces src/server/repo/discounts.ts and its two routes. The rules a
 * promotion can carry — a date window, a minimum spend, a cap, a usage limit,
 * "drinks only", "Powai only" — are unchanged; only where they are checked
 * moves, from a request handler to here. Discount *application* at checkout
 * was already local (src/services/order-service.ts reads `snapshot.discounts`
 * directly) — this file is only the admin CRUD side.
 */

export interface DiscountUsage {
  redemptions: number;
  totalMinor: number;
  lastUsedAt: string | null;
}

export interface DiscountRow extends Discount {
  usage: DiscountUsage;
}

export interface DiscountInput {
  id?: string;
  code: string;
  name: string;
  kind: 'PERCENT' | 'FLAT';
  value: number;
  minOrderMinor?: number | null;
  maxDiscountMinor?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  productIds?: string[];
  categoryIds?: string[];
  storeIds?: string[];
  requiresApproval?: boolean;
  active?: boolean;
}

/**
 * What a code has actually cost, computed from the orders it appears on.
 * There is no redemption ledger in this frontend-only build — `createOfflineOrder`
 * (src/services/order-service.ts) already stamps `discountCode`/`discountMinor`
 * onto every order it prices, and that is enough to reconstruct this column.
 */
async function usageFor(code: string): Promise<DiscountUsage> {
  const orders = await localStore().list<Order>('orders');
  const upper = code.toUpperCase();
  const matches = orders.filter((o) => (o.discountCode ?? '').toUpperCase() === upper);
  if (matches.length === 0) return { redemptions: 0, totalMinor: 0, lastUsedAt: null };
  return {
    redemptions: matches.length,
    totalMinor: matches.reduce((sum, o) => sum + (o.discountMinor ?? 0), 0),
    lastUsedAt: matches.reduce<string | null>(
      (latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest),
      null,
    ),
  };
}

async function withUsage(discounts: Discount[]): Promise<DiscountRow[]> {
  return Promise.all(discounts.map(async (d) => ({ ...d, usage: await usageFor(d.code) })));
}

function validate(input: DiscountInput): Record<string, string> {
  const errors: Record<string, string> = {};

  const code = input.code?.trim() ?? '';
  if (code.length < 2 || code.length > 24 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    errors.code = 'Codes are 2-24 characters: letters, numbers, - and _.';
  }

  if (!input.name || !input.name.trim()) {
    errors.name = 'Name is required.';
  }

  if (!Number.isInteger(input.value) || input.value < 1) {
    errors.value = 'Enter an amount of at least 1.';
  } else if (input.kind === 'PERCENT' && input.value > 10000) {
    errors.value = 'A percentage discount cannot exceed 100%.';
  }

  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    errors.endsAt = 'The end date must come after the start date.';
  }

  if (input.usageLimit != null && (!Number.isInteger(input.usageLimit) || input.usageLimit < 1)) {
    errors.usageLimit = 'Enter a whole number of at least 1, or leave it empty.';
  }

  if (input.perCustomerLimit != null && (!Number.isInteger(input.perCustomerLimit) || input.perCustomerLimit < 1)) {
    errors.perCustomerLimit = 'Enter a whole number of at least 1, or leave it empty.';
  }

  return errors;
}

async function assertUniqueCode(code: string, excludeId?: string): Promise<void> {
  const upper = code.trim().toUpperCase();
  const all = await localStore().list<Discount>('discounts');
  const clash = all.find((d) => d.code.toUpperCase() === upper && d.id !== excludeId);
  if (clash) {
    throw new ValidationError(
      clash.archivedAt
        ? `${upper} was used by an archived promotion, so the code is spoken for. Pick another.`
        : `The code ${upper} is already in use.`,
      { code: clash.archivedAt ? 'That code was used before and cannot be reused.' : 'That code is already in use.' },
    );
  }
}

export const DiscountRepository = {
  async all(includeArchived = true): Promise<DiscountRow[]> {
    const all = await localStore().list<Discount>('discounts');
    const rows = includeArchived ? all : all.filter((d) => !d.archivedAt);
    return (await withUsage(rows)).sort((a, b) => a.code.localeCompare(b.code));
  },

  async byId(id: string): Promise<DiscountRow | undefined> {
    const discount = await localStore().get<Discount>('discounts', id);
    if (!discount) return undefined;
    return { ...discount, usage: await usageFor(discount.code) };
  },

  async create(input: DiscountInput, session: Session | null): Promise<Discount> {
    const fieldErrors = validate(input);
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Check the highlighted fields.', fieldErrors);
    }
    await assertUniqueCode(input.code);

    const discount: Discount = {
      id: uuid(),
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      kind: input.kind,
      value: input.value,
      minOrderMinor: input.minOrderMinor ?? 0,
      maxDiscountMinor: input.maxDiscountMinor ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      usageCount: 0,
      productIds: input.productIds ?? [],
      categoryIds: input.categoryIds ?? [],
      storeIds: input.storeIds ?? [],
      requiresApproval: input.requiresApproval ?? false,
      active: input.active ?? true,
      archivedAt: null,
    };

    await localStore().put('discounts', discount.id, discount);
    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'discount',
      entityId: discount.id,
      entityLabel: discount.code,
      action: 'created',
      after: discount,
      summary: discount.kind === 'PERCENT'
        ? `created ${discount.code} — ${(discount.value / 100).toFixed(0)}% off`
        : `created ${discount.code} — ₹${(discount.value / 100).toFixed(0)} off`,
    });

    return discount;
  },

  async update(id: string, input: DiscountInput, session: Session | null): Promise<Discount> {
    const before = await localStore().get<Discount>('discounts', id);
    if (!before) throw new ValidationError('That discount no longer exists.', {});

    const fieldErrors = validate(input);
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Check the highlighted fields.', fieldErrors);
    }
    await assertUniqueCode(input.code, id);

    const after: Discount = {
      ...before,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      kind: input.kind,
      value: input.value,
      minOrderMinor: input.minOrderMinor ?? 0,
      maxDiscountMinor: input.maxDiscountMinor ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      productIds: input.productIds ?? [],
      categoryIds: input.categoryIds ?? [],
      storeIds: input.storeIds ?? [],
      requiresApproval: input.requiresApproval ?? false,
      active: input.active ?? true,
    };

    await localStore().put('discounts', id, after);
    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'discount',
      entityId: id,
      entityLabel: after.code,
      action: 'updated',
      before,
      after,
      summary: `updated ${after.code}`,
    });

    return after;
  },

  async setActive(id: string, active: boolean, session: Session | null): Promise<Discount> {
    const before = await localStore().get<Discount>('discounts', id);
    if (!before) throw new ValidationError('That discount no longer exists.', {});

    const after: Discount = { ...before, active };
    await localStore().put('discounts', id, after);
    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'discount',
      entityId: id,
      entityLabel: after.code,
      action: 'updated',
      before,
      after,
      summary: active ? `resumed ${after.code}` : `paused ${after.code}`,
    });

    return after;
  },

  /**
   * A code nobody ever used is deleted and its code freed for reuse; a code
   * that has been redeemed is archived, because the reporting has to keep
   * resolving those orders against it.
   */
  async remove(id: string, session: Session | null): Promise<{ outcome: 'deleted' | 'archived' }> {
    const discount = await localStore().get<Discount>('discounts', id);
    if (!discount) throw new ValidationError('That discount no longer exists.', {});

    const usage = await usageFor(discount.code);
    const usedCount = Math.max(discount.usageCount, usage.redemptions);

    let outcome: 'deleted' | 'archived';
    if (usedCount > 0) {
      const at = new Date().toISOString();
      const after: Discount = { ...discount, archivedAt: at, active: false };
      await localStore().put('discounts', id, after);
      outcome = 'archived';
    } else {
      await localStore().remove('discounts', id);
      outcome = 'deleted';
    }

    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'discount',
      entityId: id,
      entityLabel: discount.code,
      action: outcome,
      before: discount,
      summary: outcome === 'deleted'
        ? `deleted ${discount.code} — it was never used, so the code is free again`
        : `archived ${discount.code} after ${usedCount} uses`,
    });

    return { outcome };
  },
};
