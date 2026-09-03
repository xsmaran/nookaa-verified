'use client';

import { localStore } from '@/lib/local-db';
import { ensureAdminSeeded } from './admin-seed';
import type {
  Category, Discount, Ingredient, InventoryLevel, ModifierGroup, Organization,
  PosProduct, Product, Recipe, Store, TaxRate, UnavailableReason,
} from '@/types';

/**
 * The catalog, on the device.
 *
 * This is what replaced the constant arrays in src/mock, and then replaced
 * `GET /api/bootstrap` in turn — there is no server left to call. The shape
 * is unchanged: a snapshot held in memory, read synchronously, assembled from
 * the entity collections in IndexedDB (src/repositories/admin-seed.ts seeds
 * them, the various admin repositories write to them) and cached back into
 * IndexedDB so a reload doesn't need to rebuild it.
 *
 * The two properties that matter, in order:
 *
 *   1. Reads are synchronous and instant. A barista tapping through categories
 *      during a rush must never wait on a promise. Everything below reads
 *      from memory.
 *
 *   2. It survives a reload. On start-up the snapshot is restored from
 *      IndexedDB before anything is rebuilt, so the menu never flashes empty.
 */

export interface CatalogSnapshot {
  generatedAt: string;
  storeId: string;
  organization: Organization;
  store: Store | null;
  stores: Store[];
  categories: Category[];
  products: PosProduct[];
  modifierGroups: ModifierGroup[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  taxRates: TaxRate[];
  defaultTaxRateId: string;
  discounts: Discount[];
  inventoryLevels: InventoryLevel[];
  settings: Record<string, Record<string, unknown>>;
}

const CACHE_KEY = 'snapshot-v1';

const EMPTY: CatalogSnapshot = {
  generatedAt: '',
  storeId: '',
  organization: {
    id: '', name: 'NOOKAA', legalName: 'NOOKAA', gstin: '',
    invoicePrefix: 'NK', currency: 'INR', timezone: 'Asia/Kolkata',
  },
  store: null,
  stores: [],
  categories: [],
  products: [],
  modifierGroups: [],
  recipes: [],
  ingredients: [],
  taxRates: [],
  defaultTaxRateId: '',
  discounts: [],
  inventoryLevels: [],
  settings: {},
};

/* ------------------------------------------------------------- the lookups */

/**
 * Indexes built once per snapshot rather than on every render. The POS grid
 * looks a product up per keystroke; a linear scan of fifty drinks is cheap
 * until it happens fifty times in a frame.
 */
export interface CatalogIndex extends Readonly<CatalogSnapshot> {
  /** The raw payload, for anything that wants the whole thing. */
  snapshot: CatalogSnapshot;
  productById: Map<string, PosProduct>;
  categoryById: Map<string, Category>;
  ingredientById: Map<string, Ingredient>;
  modifierGroupById: Map<string, ModifierGroup>;
  recipeByProduct: Map<string, Recipe>;
  storeById: Map<string, Store>;
  taxById: Map<string, TaxRate>;
  levelByIngredient: Map<string, InventoryLevel>;
  defaultTax: TaxRate;
}

const FALLBACK_TAX: TaxRate = {
  id: 'tax-none', name: 'No tax', rateBps: 0, inclusive: false, isDefault: true, active: true,
};

function index(snapshot: CatalogSnapshot): CatalogIndex {
  // The snapshot's own fields are spread onto the index so a caller can write
  // `const { products, storeById } = useCatalog()` without having to know
  // which half of the shape each one lives in.
  return {
    ...snapshot,
    snapshot,
    productById: new Map(snapshot.products.map((p) => [p.id, p])),
    categoryById: new Map(snapshot.categories.map((c) => [c.id, c])),
    ingredientById: new Map(snapshot.ingredients.map((i) => [i.id, i])),
    modifierGroupById: new Map(snapshot.modifierGroups.map((g) => [g.id, g])),
    recipeByProduct: new Map(snapshot.recipes.map((r) => [r.productId, r])),
    storeById: new Map(snapshot.stores.map((s) => [s.id, s])),
    taxById: new Map(snapshot.taxRates.map((t) => [t.id, t])),
    levelByIngredient: new Map(snapshot.inventoryLevels.map((l) => [l.ingredientId, l])),
    defaultTax:
      snapshot.taxRates.find((t) => t.id === snapshot.defaultTaxRateId)
      ?? snapshot.taxRates[0]
      ?? FALLBACK_TAX,
  };
}

let current: CatalogIndex = index(EMPTY);
let hydrated = false;
let inFlight: Promise<CatalogIndex> | null = null;

type Listener = (index: CatalogIndex) => void;
const listeners = new Set<Listener>();

function publish(): void {
  listeners.forEach((listener) => listener(current));
}

export function subscribeToCatalog(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The current snapshot. Always safe to call, may be empty before first load. */
export function catalog(): CatalogIndex {
  return current;
}

export function catalogIsLoaded(): boolean {
  return current.snapshot.products.length > 0;
}

/* -------------------------------------------------------------- lifecycle */

/** Restore the last snapshot from disk. Called before anything is fetched. */
export async function hydrateCatalog(): Promise<CatalogIndex> {
  if (hydrated) return current;
  hydrated = true;
  try {
    const cached = await localStore().get<CatalogSnapshot>('catalog', CACHE_KEY);
    if (cached?.products?.length) {
      current = index(cached);
      publish();
    }
  } catch {
    // A cache that cannot be read is not a reason to refuse to start; the
    // fetch below will fill it, and if that fails too the screens say so.
  }
  return current;
}

/**
 * Build a fresh snapshot for a store from the local entity collections.
 *
 * This is the frontend-only replacement for `GET /api/bootstrap`: same
 * output shape, same availability logic (an admin took it off the menu vs.
 * this store 86'd it vs. the bar is out of something it needs), sourced from
 * IndexedDB instead of a request.
 */
async function buildLocalSnapshot(storeId: string): Promise<CatalogSnapshot> {
  const store = localStore();
  const [
    orgs, stores, categories, products, modifierGroups, recipes, ingredients,
    taxRates, discounts, settings, levels, overrides,
  ] = await Promise.all([
    store.list<Organization>('org'),
    store.list<Store>('stores'),
    store.list<Category>('categories'),
    store.list<Product>('products'),
    store.list<ModifierGroup>('modifierGroups'),
    store.list<Recipe>('recipes'),
    store.list<Ingredient>('ingredients'),
    store.list<TaxRate>('taxRates'),
    store.list<Discount>('discounts'),
    store.get<Record<string, Record<string, unknown>>>('settings', 'current'),
    store.list<InventoryLevel>('inventoryLevels'),
    store.list<{ productId: string; storeId: string; available: boolean }>('productStoreOverrides'),
  ]);

  const activeStores = stores.filter((s) => s.active);
  const thisStore = stores.find((s) => s.id === storeId) ?? null;
  const storeLevels = levels.filter((l) => l.storeId === storeId);
  const onHandByIngredient = new Map(storeLevels.map((l) => [l.ingredientId, l.onHand]));
  const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));
  const overrideByProduct = new Map(
    overrides.filter((o) => o.storeId === storeId).map((o) => [o.productId, o.available]),
  );

  const posProducts: PosProduct[] = products.map((product) => {
    let reason: UnavailableReason | null = null;
    const blockedBy: string[] = [];

    if (!product.available) {
      reason = 'ADMIN';
    } else if (overrideByProduct.has(product.id) && overrideByProduct.get(product.id) === false) {
      reason = 'STORE';
    } else {
      const recipe = recipeByProduct.get(product.id);
      recipe?.items.forEach((item) => {
        const onHand = onHandByIngredient.get(item.ingredientId);
        if (onHand !== undefined && onHand < item.qty) blockedBy.push(item.ingredientId);
      });
      if (blockedBy.length > 0) reason = 'OUT_OF_STOCK';
    }

    return { ...product, available: reason === null, unavailableReason: reason, blockedBy: blockedBy.length ? blockedBy : undefined };
  });

  return {
    generatedAt: new Date().toISOString(),
    storeId,
    organization: orgs[0] ?? EMPTY.organization,
    store: thisStore,
    stores: activeStores,
    categories: categories.filter((c) => c.active),
    products: posProducts,
    modifierGroups: modifierGroups.filter((g) => g.active !== false),
    recipes,
    ingredients,
    taxRates,
    defaultTaxRateId: taxRates.find((t) => t.isDefault)?.id ?? taxRates[0]?.id ?? '',
    discounts: discounts.filter((d) => d.active),
    inventoryLevels: storeLevels,
    settings: settings ?? {},
  };
}

/**
 * Rebuild the snapshot for a store.
 *
 * Concurrent callers share one build — every screen mounting at once after
 * sign-in should not mean six identical rebuilds.
 */
export async function refreshCatalog(storeId: string): Promise<CatalogIndex> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      await ensureAdminSeeded();
      const snapshot = await buildLocalSnapshot(storeId);
      current = index(snapshot);
      await localStore().put('catalog', CACHE_KEY, snapshot).catch(() => undefined);
      publish();
      return current;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Sign-out: the next user may be at a different store, or none. */
export async function clearCatalog(): Promise<void> {
  current = index(EMPTY);
  hydrated = false;
  await localStore().remove('catalog', CACHE_KEY).catch(() => undefined);
  publish();
}

/**
 * Fold a change into the snapshot without a round trip.
 *
 * Used after the POS learns something the server already knows — stock moved,
 * a drink was 86'd — so the grid updates on the next paint instead of on the
 * next refresh. The authoritative version still arrives with the next
 * `refreshCatalog`; this only avoids the flicker in between.
 */
export function patchCatalog(patch: Partial<CatalogSnapshot>): void {
  current = index({ ...current.snapshot, ...patch });
  publish();
}

export function patchProduct(productId: string, patch: Partial<PosProduct>): void {
  patchCatalog({
    products: current.snapshot.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)),
  });
}

export function patchInventoryLevel(level: InventoryLevel): void {
  const existing = current.snapshot.inventoryLevels.filter((l) => l.ingredientId !== level.ingredientId);
  patchCatalog({ inventoryLevels: [...existing, level] });
  // Persisted separately from the catalog blob so it survives the next
  // refreshCatalog() rebuild (a store switch, a fresh sign-in) rather than
  // being overwritten by the seeded opening figures.
  void localStore().put('inventoryLevels', `${level.storeId}:${level.ingredientId}`, level).catch(() => undefined);
}
