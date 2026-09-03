import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { DomainError, ValidationError } from '@/lib/errors';
import { AuditRepository } from './audit-repository';
import type { ModifierGroup, ModifierOption, Product, Session } from '@/types';

/**
 * Option groups — the frontend-only replacement for /api/modifiers.
 *
 * A group is one question the POS asks (milk, sweetness, size) and its
 * options are the answers. Archiving is refused while any active product
 * still offers the group — orders that already used it keep their own copy
 * of the option names and prices, so nothing already sold is disturbed, but
 * a live product pointing at a gone group would break at the counter.
 */

export interface ModifierGroupRow extends ModifierGroup { usedByProducts: number }

export interface ModifierOptionInput {
  id?: string;
  name: string;
  priceMinor: number;
  isDefault?: boolean;
  ingredientDelta?: { ingredientId: string; qty: number }[];
  active?: boolean;
}

export interface ModifierGroupInput {
  id?: string;
  name: string;
  selection: 'SINGLE' | 'MULTI';
  required?: boolean;
  maxSelections?: number | null;
  active?: boolean;
  options: ModifierOptionInput[];
}

function validate(input: ModifierGroupInput): void {
  const fieldErrors: Record<string, string> = {};

  if (!input.name?.trim()) fieldErrors.name = 'A group needs a name.';

  const options = input.options ?? [];
  if (options.length === 0) {
    fieldErrors.options = 'A group needs at least one option.';
  } else if (input.selection === 'SINGLE') {
    // A radio group with two defaults is a bug the POS cannot resolve at the
    // counter — it has to know which one lights up before anything is tapped.
    const defaults = options.filter((o) => o.isDefault).length;
    if (defaults > 1) {
      fieldErrors.options = 'Only one option can be the default when just one can be picked.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Check the highlighted fields.', fieldErrors);
  }
}

function buildOptions(options: ModifierOptionInput[]): ModifierOption[] {
  return options.map((option, index) => ({
    id: option.id?.trim() || uuid(),
    name: option.name,
    priceMinor: option.priceMinor,
    isDefault: option.isDefault ?? false,
    ingredientDelta: option.ingredientDelta ?? [],
    sortOrder: index,
    active: option.active !== false,
  }));
}

/**
 * Products carry their own `modifierGroupIds`, so usage is a direct scan
 * rather than a join table — only products still on the menu count, an
 * archived product referencing a group is not a reason to keep it around.
 */
async function usageCountFor(groupId: string): Promise<number> {
  const products = await localStore().list<Product>('products');
  return products.filter((p) => !p.archivedAt && p.modifierGroupIds?.includes(groupId)).length;
}

export const ModifierRepository = {
  /** Active groups only — an archived one has nothing left pointing at it and no UI here to un-archive it. */
  async all(): Promise<ModifierGroupRow[]> {
    const groups = await localStore().list<ModifierGroup>('modifierGroups');
    const active = groups.filter((g) => g.active !== false);
    const rows = await Promise.all(active.map(async (g) => ({ ...g, usedByProducts: await usageCountFor(g.id) })));
    return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  },

  async byId(id: string): Promise<ModifierGroup | undefined> {
    return localStore().get<ModifierGroup>('modifierGroups', id);
  },

  async create(input: ModifierGroupInput, session: Session | null): Promise<ModifierGroup> {
    validate(input);
    const existing = await localStore().list<ModifierGroup>('modifierGroups');
    const group: ModifierGroup = {
      id: input.id?.trim() || uuid(),
      name: input.name.trim(),
      selection: input.selection,
      required: input.required ?? false,
      maxSelections: input.maxSelections ?? null,
      sortOrder: existing.length,
      active: input.active ?? true,
      options: buildOptions(input.options),
    };
    await localStore().put('modifierGroups', group.id, group);
    await AuditRepository.record({
      session, entity: 'modifier', entityId: group.id, entityLabel: group.name,
      action: 'created', after: group, summary: `created ${group.name} with ${group.options.length} options`,
    });
    return group;
  },

  async update(id: string, input: ModifierGroupInput, session: Session | null): Promise<ModifierGroup> {
    const before = await localStore().get<ModifierGroup>('modifierGroups', id);
    if (!before) throw new DomainError('That option group no longer exists.');
    validate(input);

    const after: ModifierGroup = {
      ...before,
      name: input.name.trim(),
      selection: input.selection,
      required: input.required ?? false,
      maxSelections: input.maxSelections ?? null,
      active: input.active ?? true,
      options: buildOptions(input.options),
    };
    await localStore().put('modifierGroups', id, after);
    await AuditRepository.record({
      session, entity: 'modifier', entityId: id, entityLabel: after.name,
      action: 'updated', before, after, summary: `updated ${after.name}`,
    });
    return after;
  },

  async archive(id: string, session: Session | null): Promise<ModifierGroup> {
    const group = await localStore().get<ModifierGroup>('modifierGroups', id);
    if (!group) throw new DomainError('That option group no longer exists.');

    const usage = await usageCountFor(id);
    if (usage > 0) {
      throw new DomainError(
        `${usage} ${usage === 1 ? 'drink offers' : 'drinks offer'} ${group.name}. Remove it from them first.`,
      );
    }

    const after: ModifierGroup = { ...group, active: false };
    await localStore().put('modifierGroups', id, after);
    await AuditRepository.record({
      session, entity: 'modifier', entityId: id, entityLabel: group.name,
      action: 'archived', before: group, after, summary: `archived ${group.name}`,
    });
    return after;
  },
};
