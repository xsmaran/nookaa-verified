import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { DomainError, ValidationError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { AuditRepository } from './audit-repository';
import type { Ingredient, IngredientCategory, InventoryLevel, Recipe, Session, Unit } from '@/types';

/**
 * The ingredient master list — the frontend-only replacement for
 * /api/ingredients.
 *
 * Cost per unit drives the margin on every drink that uses it, which is why
 * changing it gets its own audit action (`cost.changed`) instead of blending
 * into a generic `updated` — a milk price that moved three months ago is
 * quietly wrong on forty products, and that deserves to be findable in the
 * log. `unit` is fixed at creation: the ledger is full of quantities already
 * measured in it, so a patch can never touch it, even if one is sent.
 */

export interface IngredientRow extends Ingredient {
  level: InventoryLevel | null;
  usedByCount: number;
}

export interface IngredientCreateInput {
  id?: string;
  name: string;
  sku?: string | null;
  unit: Unit;
  category: IngredientCategory;
  costMinorPerUnit: number;
  supplier?: string | null;
  perishable?: boolean;
  shelfLifeDays?: number | null;
  active?: boolean;
}

/** `unit` is deliberately absent — see the module note above. */
export type IngredientPatchInput = Partial<Omit<IngredientCreateInput, 'unit' | 'id'>>;

function validate(input: { name?: string; costMinorPerUnit?: number; shelfLifeDays?: number | null }): void {
  const fieldErrors: Record<string, string> = {};

  const name = (input.name ?? '').trim();
  if (!name) fieldErrors.name = 'An ingredient needs a name.';
  else if (name.length > 120) fieldErrors.name = 'Keep it under 120 characters.';

  if (
    input.costMinorPerUnit === undefined
    || !Number.isInteger(input.costMinorPerUnit)
    || input.costMinorPerUnit < 0
  ) {
    fieldErrors.costMinorPerUnit = 'Amounts are in whole paise, 0 or more.';
  }

  if (input.shelfLifeDays !== undefined && input.shelfLifeDays !== null) {
    if (!Number.isInteger(input.shelfLifeDays) || input.shelfLifeDays < 0 || input.shelfLifeDays > 3650) {
      fieldErrors.shelfLifeDays = 'Shelf life must be between 0 and 3650 days.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Check the highlighted fields.', fieldErrors);
  }
}

/** How many recipes would break if this ingredient went away. */
async function usedByCountFor(ingredientId: string): Promise<number> {
  const recipes = await localStore().list<Recipe>('recipes');
  return recipes.filter((r) => r.items.some((item) => item.ingredientId === ingredientId)).length;
}

export const IngredientRepository = {
  async all(storeId: string, includeArchived: boolean): Promise<IngredientRow[]> {
    const [ingredients, levels, recipes] = await Promise.all([
      localStore().list<Ingredient>('ingredients'),
      localStore().list<InventoryLevel>('inventoryLevels'),
      localStore().list<Recipe>('recipes'),
    ]);

    const levelByIngredient = new Map(
      levels.filter((l) => l.storeId === storeId).map((l) => [l.ingredientId, l]),
    );
    const usageByIngredient = new Map<string, number>();
    recipes.forEach((r) => r.items.forEach((item) => {
      usageByIngredient.set(item.ingredientId, (usageByIngredient.get(item.ingredientId) ?? 0) + 1);
    }));

    const rows = includeArchived ? ingredients : ingredients.filter((i) => !i.archivedAt);
    return rows
      .map((i) => ({
        ...i,
        level: levelByIngredient.get(i.id) ?? null,
        usedByCount: usageByIngredient.get(i.id) ?? 0,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  },

  async byId(id: string): Promise<Ingredient | undefined> {
    return localStore().get<Ingredient>('ingredients', id);
  },

  async create(input: IngredientCreateInput, session: Session | null): Promise<Ingredient> {
    validate(input);
    const ingredient: Ingredient = {
      id: input.id?.trim() || uuid(),
      name: input.name.trim(),
      sku: input.sku || null,
      unit: input.unit,
      category: input.category,
      costMinorPerUnit: input.costMinorPerUnit,
      supplier: input.supplier || null,
      perishable: input.perishable ?? false,
      shelfLifeDays: input.shelfLifeDays ?? null,
      active: input.active ?? true,
      archivedAt: null,
    };
    await localStore().put('ingredients', ingredient.id, ingredient);
    await AuditRepository.record({
      session, entity: 'ingredient', entityId: ingredient.id, entityLabel: ingredient.name,
      action: 'created', after: ingredient, summary: `added ${ingredient.name}, measured in ${ingredient.unit}`,
    });
    return ingredient;
  },

  async update(id: string, patch: IngredientPatchInput, session: Session | null): Promise<Ingredient> {
    const before = await localStore().get<Ingredient>('ingredients', id);
    if (!before) throw new DomainError('That ingredient no longer exists.');
    validate({ ...before, ...patch });

    const after: Ingredient = {
      ...before,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.sku !== undefined ? { sku: patch.sku || null } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.costMinorPerUnit !== undefined ? { costMinorPerUnit: patch.costMinorPerUnit } : {}),
      ...(patch.supplier !== undefined ? { supplier: patch.supplier || null } : {}),
      ...(patch.perishable !== undefined ? { perishable: patch.perishable } : {}),
      ...(patch.shelfLifeDays !== undefined ? { shelfLifeDays: patch.shelfLifeDays } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      // `unit` is never touched here — the ledger already holds movements
      // measured in it, and reinterpreting them silently is not an option.
    };

    const costChanged = before.costMinorPerUnit !== after.costMinorPerUnit;
    await localStore().put('ingredients', id, after);
    await AuditRepository.record({
      session, entity: 'ingredient', entityId: id, entityLabel: after.name,
      action: costChanged ? 'cost.changed' : 'updated',
      before, after,
      // A cost change silently re-prices the margin on every drink that uses
      // it, so it is worth naming in the log rather than left in a diff.
      summary: costChanged
        ? `cost per ${after.unit} ${formatMoney(before.costMinorPerUnit)} → ${formatMoney(after.costMinorPerUnit)}`
        : `updated ${after.name}`,
    });
    return after;
  },

  async archive(id: string, session: Session | null): Promise<Ingredient> {
    const ingredient = await localStore().get<Ingredient>('ingredients', id);
    if (!ingredient) throw new DomainError('That ingredient no longer exists.');

    const usedByCount = await usedByCountFor(id);
    if (usedByCount > 0) {
      throw new DomainError(
        `${ingredient.name} is in ${usedByCount} ${usedByCount === 1 ? 'recipe' : 'recipes'}. `
        + 'Remove it from those first.',
      );
    }

    const at = new Date().toISOString();
    const after: Ingredient = { ...ingredient, archivedAt: at, active: false };
    await localStore().put('ingredients', id, after);
    await AuditRepository.record({
      session, entity: 'ingredient', entityId: id, entityLabel: ingredient.name,
      action: 'archived', before: ingredient, after, summary: `archived ${ingredient.name}`,
    });
    return after;
  },
};
