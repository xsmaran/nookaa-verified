import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { ValidationError, DomainError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useSession } from '@/stores/session-store';
import { AuditRepository } from './audit-repository';
import { catalog, refreshCatalog } from './catalog-cache';
import type { Category, Ingredient, ModifierGroup, PosProduct, Product, Recipe, RecipeItem } from '@/types';

/**
 * The catalog, as the screens ask for it.
 *
 * Everything here reads the in-memory snapshot maintained by ./catalog-cache,
 * which is filled from `GET /api/bootstrap` and persisted to IndexedDB. The
 * async signatures are kept because the callers are already written against
 * them and because the storage behind this is free to become asynchronous
 * again — but nothing here waits on anything today, which is the property the
 * POS grid depends on.
 *
 * The write methods below (create/update/duplicate/…/saveRecipe) are the
 * frontend-only replacement for what used to be `/api/products/**` and
 * `/api/recipes/**` on the server: same validation rules, same soft-delete
 * behaviour, writing straight to the `products`/`recipes` IndexedDB
 * collections and refreshing the shared catalog snapshot afterwards.
 */

/** A product enriched the way the admin list wants it: cost, margin, recipe. */
export interface AdminProduct extends Product {
  /** What the recipe says this costs to pour. Null when there is no recipe. */
  derivedCostMinor: number | null;
  /** The override if one is set, otherwise the recipe figure. */
  effectiveCostMinor: number | null;
  marginBps: number | null;
  hasRecipe: boolean;
}

export interface ProductWriteInput {
  categoryId: string;
  sku?: string | null;
  name: string;
  spec: string;
  description?: string;
  imageUrl?: string | null;
  temp: Product['temp'];
  priceMinor: number;
  costMinor?: number | null;
  taxRateId: string;
  tags?: string[];
  badge?: Product['badge'];
  modifierGroupIds?: string[];
  storeIds?: string[];
  active?: boolean;
  available?: boolean;
  sortOrder?: number;
  prepSeconds?: number | null;
}

export interface RecipeWriteInput {
  variant: Recipe['variant'];
  yieldMl: number;
  prepSeconds: number;
  items: RecipeItem[];
}

const RECIPE_VARIANTS = new Set(['HOT_250', 'COLD_475', 'BLENDED_475']);

/** Whoever is signed in on this device — the only source of a write's `session` now that there is no request to carry it. */
function currentSession() {
  return useSession.getState().session;
}

async function validateProductWrite(
  input: Partial<ProductWriteInput>,
  opts: { requireAll: boolean; excludeId?: string },
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};

  if (opts.requireAll || input.categoryId !== undefined) {
    if (!input.categoryId) {
      errors.categoryId = 'Pick a category.';
    } else {
      const categories = await localStore().list<Category>('categories');
      if (!categories.some((c) => c.id === input.categoryId)) {
        errors.categoryId = 'That category no longer exists.';
      }
    }
  }

  if (input.sku) {
    if (input.sku.length > 40) {
      errors.sku = 'Keep the SKU to 40 characters or fewer.';
    } else {
      const products = await localStore().list<Product>('products');
      const clash = products.some(
        (p) => p.id !== opts.excludeId && p.sku && p.sku.toLowerCase() === input.sku!.toLowerCase(),
      );
      if (clash) errors.sku = 'That SKU is already used by another product.';
    }
  }

  if (opts.requireAll || input.name !== undefined) {
    const len = (input.name ?? '').trim().length;
    if (len < 1 || len > 120) errors.name = 'Name must be 1–120 characters.';
  }

  if (opts.requireAll || input.spec !== undefined) {
    const len = (input.spec ?? '').trim().length;
    if (len < 1 || len > 80) errors.spec = 'Spec must be 1–80 characters.';
  }

  if (opts.requireAll || input.priceMinor !== undefined) {
    const price = input.priceMinor;
    if (price === undefined || !Number.isInteger(price) || price < 0) {
      errors.priceMinor = 'Price must be a whole number of paise, 0 or more.';
    }
  }

  if (input.tags !== undefined && input.tags.length > 10) {
    errors.tags = 'Up to 10 tags.';
  }

  if (input.prepSeconds !== undefined && input.prepSeconds !== null) {
    if (input.prepSeconds < 0 || input.prepSeconds > 3600) {
      errors.prepSeconds = 'Prep time must be between 0 and 3600 seconds.';
    }
  }

  return errors;
}

export const ProductRepository = {
  async categories(): Promise<Category[]> {
    return catalog().snapshot.categories
      .filter((c) => c.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  /**
   * Products for the counter.
   *
   * Availability is decided by the server and arrives on the record, so an
   * out-of-stock drink is greyed out here for the same reason and with the
   * same words the API would give if someone tried to sell it anyway.
   */
  async products(storeId?: string): Promise<PosProduct[]> {
    return catalog().snapshot.products
      .filter((p) => p.active && (!storeId || p.storeIds.length === 0 || p.storeIds.includes(storeId)))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async byId(id: string): Promise<PosProduct | undefined> {
    return catalog().productById.get(id);
  },

  async modifierGroups(): Promise<ModifierGroup[]> {
    return catalog().snapshot.modifierGroups;
  },

  async modifierGroupsFor(productId: string): Promise<ModifierGroup[]> {
    const { productById, modifierGroupById } = catalog();
    const product = productById.get(productId);
    if (!product) return [];
    return product.modifierGroupIds
      .map((id) => modifierGroupById.get(id))
      .filter((g): g is ModifierGroup => Boolean(g));
  },

  async recipes(): Promise<Recipe[]> {
    return catalog().snapshot.recipes;
  },

  async recipeFor(productId: string): Promise<Recipe | undefined> {
    return catalog().recipeByProduct.get(productId);
  },

  /* ------------------------------------------------------------- admin: reads */

  /**
   * Every product for the admin list — including archived ones when asked —
   * with the cost/margin figures the list sorts and colours by.
   */
  async list(includeArchived: boolean): Promise<{ products: AdminProduct[]; categories: Category[] }> {
    const store = localStore();
    const [products, categories, recipes, ingredients] = await Promise.all([
      store.list<Product>('products'),
      store.list<Category>('categories'),
      store.list<Recipe>('recipes'),
      store.list<Ingredient>('ingredients'),
    ]);

    const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));
    const costByIngredient = new Map(ingredients.map((i) => [i.id, i.costMinorPerUnit]));
    const filtered = includeArchived ? products : products.filter((p) => !p.archivedAt);

    const enriched: AdminProduct[] = filtered.map((product) => {
      const recipe = recipeByProduct.get(product.id);
      const derivedCostMinor = recipe
        ? Math.round(recipe.items.reduce(
            (sum, item) => sum + item.qty * (1 + (item.wastagePct ?? 0) / 100) * (costByIngredient.get(item.ingredientId) ?? 0),
            0,
          ))
        : null;
      const effectiveCostMinor = product.costMinor ?? derivedCostMinor;
      const marginBps = effectiveCostMinor !== null && product.priceMinor > 0
        ? Math.round(((product.priceMinor - effectiveCostMinor) / product.priceMinor) * 10000)
        : null;

      return { ...product, derivedCostMinor, effectiveCostMinor, marginBps, hasRecipe: Boolean(recipe) };
    });

    return {
      products: enriched,
      categories: categories.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    };
  },

  /* ------------------------------------------------------------ admin: writes */

  async create(input: ProductWriteInput): Promise<Product> {
    const errors = await validateProductWrite(input, { requireAll: true });
    if (Object.keys(errors).length) throw new ValidationError('Fix the highlighted fields.', errors);

    const store = localStore();
    const session = currentSession();
    const existing = await store.list<Product>('products');
    const sortOrder = input.sortOrder ?? (existing.length ? Math.max(...existing.map((p) => p.sortOrder)) + 1 : 0);

    const product: Product = {
      id: uuid(),
      categoryId: input.categoryId,
      sku: input.sku || null,
      name: input.name.trim(),
      spec: input.spec.trim(),
      description: input.description ?? '',
      imageUrl: input.imageUrl ?? null,
      temp: input.temp,
      priceMinor: input.priceMinor,
      costMinor: input.costMinor ?? null,
      taxRateId: input.taxRateId,
      tags: input.tags ?? [],
      modifierGroupIds: input.modifierGroupIds ?? [],
      active: input.active ?? true,
      available: input.available ?? true,
      prepSeconds: input.prepSeconds ?? null,
      storeIds: input.storeIds ?? [],
      sortOrder,
      badge: input.badge ?? null,
      archivedAt: null,
    };

    await store.put('products', product.id, product);
    if (session) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'product',
      entityId: product.id,
      entityLabel: product.spec,
      action: 'created',
      summary: `Added “${product.spec}” to the menu`,
      after: product,
    });

    return product;
  },

  async update(id: string, patch: Partial<ProductWriteInput>): Promise<Product> {
    const store = localStore();
    const existing = await store.get<Product>('products', id);
    if (!existing) throw new DomainError(`Product ${id} does not exist.`);

    const errors = await validateProductWrite(patch, { requireAll: false, excludeId: id });
    if (Object.keys(errors).length) throw new ValidationError('Fix the highlighted fields.', errors);

    const session = currentSession();

    const updated: Product = {
      ...existing,
      categoryId: patch.categoryId ?? existing.categoryId,
      sku: patch.sku !== undefined ? (patch.sku || null) : existing.sku,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      spec: patch.spec !== undefined ? patch.spec.trim() : existing.spec,
      description: patch.description ?? existing.description,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
      temp: patch.temp ?? existing.temp,
      priceMinor: patch.priceMinor ?? existing.priceMinor,
      costMinor: patch.costMinor !== undefined ? patch.costMinor : existing.costMinor,
      taxRateId: patch.taxRateId ?? existing.taxRateId,
      tags: patch.tags ?? existing.tags,
      badge: patch.badge !== undefined ? patch.badge : existing.badge,
      modifierGroupIds: patch.modifierGroupIds ?? existing.modifierGroupIds,
      storeIds: patch.storeIds ?? existing.storeIds,
      active: patch.active ?? existing.active,
      available: patch.available ?? existing.available,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      prepSeconds: patch.prepSeconds !== undefined ? patch.prepSeconds : existing.prepSeconds,
    };

    await store.put('products', id, updated);
    if (session) await refreshCatalog(session.storeId);

    // A price move affects margin reporting everywhere, so it gets its own
    // audit action instead of blending into a generic "updated" — mirrors the
    // old server calling this out specially.
    const priceChanged = patch.priceMinor !== undefined && patch.priceMinor !== existing.priceMinor;
    await AuditRepository.record({
      session,
      entity: 'product',
      entityId: id,
      entityLabel: updated.spec,
      action: priceChanged ? 'price.changed' : 'updated',
      summary: priceChanged
        ? `Price for “${updated.spec}” changed from ${formatMoney(existing.priceMinor)} to ${formatMoney(updated.priceMinor)}`
        : `Updated “${updated.spec}”`,
      before: existing,
      after: updated,
    });

    return updated;
  },

  /** Clone a drink. The copy starts off the menu — a half-configured clone must never reach the till. */
  async duplicate(id: string): Promise<Product> {
    const store = localStore();
    const original = await store.get<Product>('products', id);
    if (!original) throw new DomainError(`Product ${id} does not exist.`);

    const session = currentSession();
    const newId = uuid();
    const copy: Product = {
      ...original,
      id: newId,
      spec: `${original.spec} (copy)`,
      sku: null,
      active: false,
      archivedAt: null,
    };
    await store.put('products', newId, copy);

    const recipes = await store.list<Recipe>('recipes');
    const originalRecipe = recipes.find((r) => r.productId === id);
    if (originalRecipe) {
      const recipeId = `rec-${newId}`;
      await store.put('recipes', recipeId, { ...originalRecipe, id: recipeId, productId: newId });
    }

    if (session) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'product',
      entityId: newId,
      entityLabel: copy.spec,
      action: 'created',
      summary: `Duplicated “${original.spec}” as “${copy.spec}” — it starts off the menu`,
      after: copy,
    });

    return copy;
  },

  /** The chain-wide 86 switch — distinct from `active`, which is the menu listing itself. */
  async setAvailability(id: string, available: boolean): Promise<Product> {
    const store = localStore();
    const existing = await store.get<Product>('products', id);
    if (!existing) throw new DomainError(`Product ${id} does not exist.`);

    const updated: Product = { ...existing, available };
    await store.put('products', id, updated);

    const session = currentSession();
    if (session) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'product',
      entityId: id,
      entityLabel: existing.spec,
      action: 'availability.changed',
      summary: available
        ? `“${existing.spec}” is back on the menu everywhere`
        : `“${existing.spec}” is off the menu everywhere`,
      before: { available: existing.available },
      after: { available },
    });

    return updated;
  },

  /** Soft-delete. Past orders reference this id, so the row is never actually removed. */
  async archive(id: string): Promise<Product> {
    const store = localStore();
    const existing = await store.get<Product>('products', id);
    if (!existing) throw new DomainError(`Product ${id} does not exist.`);

    const updated: Product = { ...existing, active: false, archivedAt: new Date().toISOString() };
    await store.put('products', id, updated);

    const session = currentSession();
    if (session) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'product',
      entityId: id,
      entityLabel: existing.spec,
      action: 'archived',
      summary: `Archived “${existing.spec}” — off every till, past orders unaffected`,
      before: existing,
      after: updated,
    });

    return updated;
  },

  async restore(id: string): Promise<Product> {
    const store = localStore();
    const existing = await store.get<Product>('products', id);
    if (!existing) throw new DomainError(`Product ${id} does not exist.`);

    // Restoring is archiving in reverse: back on the menu and sellable again,
    // not merely un-archived-but-still-hidden.
    const updated: Product = { ...existing, active: true, archivedAt: null };
    await store.put('products', id, updated);

    const session = currentSession();
    if (session) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'product',
      entityId: id,
      entityLabel: existing.spec,
      action: 'restored',
      summary: `Restored “${existing.spec}” to the menu`,
      before: existing,
      after: updated,
    });

    return updated;
  },

  /* ------------------------------------------------------------- admin: recipe */

  async saveRecipe(productId: string, input: RecipeWriteInput): Promise<Recipe> {
    const store = localStore();
    const product = await store.get<Product>('products', productId);
    if (!product) throw new DomainError(`Product ${productId} does not exist.`);

    const errors: Record<string, string> = {};
    if (!RECIPE_VARIANTS.has(input.variant)) errors.variant = 'Pick a valid serving format.';
    if (input.yieldMl < 0 || input.yieldMl > 5000) errors.yieldMl = 'Yield must be between 0 and 5000 ml.';

    // A line at zero is somebody who started typing and stopped; drop it
    // before validating so it never fails for a reason that is not their
    // mistake — mirrors the client's existing behaviour.
    const items = input.items.filter((item) => item.qty > 0);
    const ingredients = await store.list<Ingredient>('ingredients');
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    items.forEach((item, i) => {
      if (item.wastagePct !== undefined && (item.wastagePct < 0 || item.wastagePct > 100)) {
        errors[`items.${i}.wastagePct`] = 'Wastage must be between 0 and 100%.';
      }
      const ingredient = ingredientById.get(item.ingredientId);
      if (!ingredient) {
        errors[`items.${i}.ingredientId`] = `Ingredient ${item.ingredientId} does not exist.`;
      } else if (ingredient.archivedAt) {
        errors[`items.${i}.ingredientId`] = `“${ingredient.name}” is archived and can no longer be used in a recipe.`;
      }
    });

    if (Object.keys(errors).length) throw new ValidationError('This recipe cannot be saved as written.', errors);

    const recipes = await store.list<Recipe>('recipes');
    const existing = recipes.find((r) => r.productId === productId);
    const recipe: Recipe = {
      id: existing?.id ?? `rec-${productId}`,
      productId,
      variant: input.variant,
      yieldMl: input.yieldMl,
      prepSeconds: input.prepSeconds,
      items,
    };
    await store.put('recipes', recipe.id, recipe);

    const session = currentSession();
    if (session) await refreshCatalog(session.storeId);

    const costMinor = Math.round(items.reduce((sum, item) => {
      const ingredient = ingredientById.get(item.ingredientId);
      const effective = item.qty * (1 + (item.wastagePct ?? 0) / 100);
      return sum + effective * (ingredient?.costMinorPerUnit ?? 0);
    }, 0));

    await AuditRepository.record({
      session,
      entity: 'recipe',
      entityId: recipe.id,
      entityLabel: product.spec,
      action: existing ? 'updated' : 'created',
      summary: `Recipe for “${product.spec}” saved — ${formatMoney(costMinor)} to pour`,
      before: existing,
      after: recipe,
    });

    return recipe;
  },

  /** Synchronous variants, for render paths that cannot await. */
  sync: {
    products: (): PosProduct[] => catalog().snapshot.products,
    categories: (): Category[] => catalog().snapshot.categories,
    byId: (id: string): Product | undefined => catalog().productById.get(id),
  },
};
