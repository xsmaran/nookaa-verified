import type { Ingredient, ModifierGroup, Recipe, RecipeItem } from '@/types';

/** Seed input. See the note in ./catalog.ts on why these are not domain types. */
export type SeedIngredient = Omit<Ingredient, 'sku' | 'supplier' | 'shelfLifeDays' | 'active' | 'archivedAt'>;
import { PRODUCTS } from './catalog';

/**
 * Modifiers, ingredients and the bill of materials.
 *
 * Quantities are ASSUMPTIONS built from standard specialty-café ratios scaled
 * to NOOKAA's two formats (250 ml hot, 475 ml cold). They exist so the
 * inventory ledger has something real to decrement. NOOKAA's bar team must
 * replace them with the actual dial-in before the ledger is trusted for
 * ordering. See /docs/ASSUMPTIONS.md.
 */

/* ------------------------------------------------------------- modifiers */

export const MODIFIER_GROUPS: ModifierGroup[] = [
  {
    id: 'mg-serve-temp',
    name: 'Serve',
    selection: 'SINGLE',
    required: true,
    options: [
      { id: 'mo-temp-hot', name: 'Hot · 250 ml', priceMinor: 0 },
      { id: 'mo-temp-cold', name: 'Cold · 475 ml', priceMinor: 0, isDefault: true },
    ],
  },
  {
    id: 'mg-milk',
    name: 'Milk',
    selection: 'SINGLE',
    required: false,
    options: [
      { id: 'mo-milk-dairy', name: 'Whole milk', priceMinor: 0, isDefault: true },
      { id: 'mo-milk-oat', name: 'Oat milk', priceMinor: 4000, ingredientDelta: [{ ingredientId: 'ing-whole-milk', qty: 0 }] },
      { id: 'mo-milk-almond', name: 'Almond milk', priceMinor: 4000 },
      { id: 'mo-milk-none', name: 'No milk', priceMinor: 0 },
    ],
  },
  {
    id: 'mg-sweet',
    name: 'Sweetness',
    selection: 'SINGLE',
    required: false,
    options: [
      { id: 'mo-sweet-less', name: 'Less sweet', priceMinor: 0 },
      { id: 'mo-sweet-regular', name: 'Regular', priceMinor: 0, isDefault: true },
      { id: 'mo-sweet-extra', name: 'Extra sweet', priceMinor: 0 },
    ],
  },
  {
    id: 'mg-ice',
    name: 'Ice',
    selection: 'SINGLE',
    required: false,
    options: [
      { id: 'mo-ice-less', name: 'Less ice', priceMinor: 0 },
      { id: 'mo-ice-regular', name: 'Regular ice', priceMinor: 0, isDefault: true },
      { id: 'mo-ice-extra', name: 'Extra ice', priceMinor: 0 },
    ],
  },
  {
    id: 'mg-shots',
    name: 'Espresso',
    selection: 'MULTI',
    required: false,
    maxSelections: 2,
    options: [
      { id: 'mo-shot-extra', name: 'Extra shot', priceMinor: 5000, ingredientDelta: [{ ingredientId: 'ing-espresso-beans', qty: 18 }] },
      { id: 'mo-shot-decaf', name: 'Decaf', priceMinor: 0 },
    ],
  },
  {
    id: 'mg-addons',
    name: 'Add-ons',
    selection: 'MULTI',
    required: false,
    maxSelections: 3,
    options: [
      { id: 'mo-add-sweet-cream', name: 'Sweet cream', priceMinor: 5000, ingredientDelta: [{ ingredientId: 'ing-sweet-cream', qty: 40 }] },
      { id: 'mo-add-whipped', name: 'Whipped cream', priceMinor: 4000, ingredientDelta: [{ ingredientId: 'ing-whipped-cream', qty: 30 }] },
      { id: 'mo-add-pearls', name: 'Tapioca pearls', priceMinor: 6000, ingredientDelta: [{ ingredientId: 'ing-tapioca-pearls', qty: 60 }] },
      { id: 'mo-add-vanilla', name: 'Vanilla syrup', priceMinor: 3000, ingredientDelta: [{ ingredientId: 'ing-vanilla-syrup', qty: 15 }] },
      { id: 'mo-add-hazelnut', name: 'Hazelnut syrup', priceMinor: 3000, ingredientDelta: [{ ingredientId: 'ing-hazelnut-syrup', qty: 15 }] },
      { id: 'mo-add-caramel', name: 'Caramel syrup', priceMinor: 3000, ingredientDelta: [{ ingredientId: 'ing-caramel-syrup', qty: 15 }] },
    ],
  },
];

export const MODIFIER_GROUP_BY_ID = new Map(MODIFIER_GROUPS.map((g) => [g.id, g]));

/* ----------------------------------------------------------- ingredients */

const ing = (
  id: string,
  name: string,
  unit: Ingredient['unit'],
  category: Ingredient['category'],
  costMinorPerUnit: number,
  perishable = false,
): SeedIngredient => ({ id, name, unit, category, costMinorPerUnit, perishable });

export const INGREDIENTS: SeedIngredient[] = [
  ing('ing-espresso-beans', 'Espresso beans (Arabica-Robusta)', 'g', 'COFFEE', 180, false),
  ing('ing-cold-brew', 'Cold brew concentrate', 'ml', 'COFFEE', 65, true),
  ing('ing-whole-milk', 'Whole milk', 'ml', 'DAIRY', 7, true),
  ing('ing-oat-milk', 'Oat milk', 'ml', 'DAIRY', 18, true),
  ing('ing-almond-milk', 'Almond milk', 'ml', 'DAIRY', 20, true),
  ing('ing-condensed-milk', 'Condensed milk', 'ml', 'DAIRY', 32, false),
  ing('ing-sweet-cream', 'House sweet cream', 'ml', 'DAIRY', 42, true),
  ing('ing-whipped-cream', 'Whipped cream', 'g', 'DAIRY', 38, true),
  ing('ing-brown-butter', 'Brown butter', 'g', 'DAIRY', 95, true),
  ing('ing-vanilla-syrup', 'Bourbon vanilla syrup', 'ml', 'SYRUP', 45, false),
  ing('ing-hazelnut-syrup', 'Hazelnut syrup', 'ml', 'SYRUP', 42, false),
  ing('ing-caramel-syrup', 'House caramel syrup', 'ml', 'SYRUP', 40, false),
  ing('ing-brown-sugar-syrup', 'Brown sugar syrup', 'ml', 'SYRUP', 28, false),
  ing('ing-orange-syrup', 'Orange syrup', 'ml', 'SYRUP', 36, false),
  ing('ing-ube-syrup', 'Ube syrup', 'ml', 'SYRUP', 88, false),
  ing('ing-kala-khatta-syrup', 'Jamun kala khatta syrup', 'ml', 'SYRUP', 30, false),
  ing('ing-grapefruit-syrup', 'Pink grapefruit syrup', 'ml', 'SYRUP', 38, false),
  ing('ing-lychee-syrup', 'Lychee syrup', 'ml', 'SYRUP', 40, false),
  ing('ing-mango-syrup', 'Alphonso mango syrup', 'ml', 'SYRUP', 44, false),
  ing('ing-passionfruit-syrup', 'Passion fruit syrup', 'ml', 'SYRUP', 46, false),
  ing('ing-berry-syrup', 'Mixed berry syrup', 'ml', 'SYRUP', 40, false),
  ing('ing-strawberry-syrup', 'Strawberry syrup', 'ml', 'SYRUP', 40, false),
  ing('ing-peach-syrup', 'Peach syrup', 'ml', 'SYRUP', 38, false),
  ing('ing-chocolate-sauce', 'Chocolate sauce', 'ml', 'SYRUP', 52, false),
  ing('ing-cocoa-powder', 'Premium cocoa powder', 'g', 'SYRUP', 120, false),
  ing('ing-cinnamon', 'Ceylon cinnamon', 'g', 'SYRUP', 240, false),
  ing('ing-sea-salt', 'Sea salt', 'g', 'OTHER', 15, false),
  ing('ing-black-tea', 'Black tea leaves', 'g', 'TEA', 90, false),
  ing('ing-hibiscus', 'Hibiscus petals', 'g', 'TEA', 140, false),
  ing('ing-matcha', 'Ceremonial matcha', 'g', 'TEA', 620, false),
  ing('ing-lemon-juice', 'Fresh lemon juice', 'ml', 'FRUIT', 22, true),
  ing('ing-mango-puree', 'Alphonso mango purée', 'ml', 'FRUIT', 48, true),
  ing('ing-cranberry-juice', 'Cranberry juice', 'ml', 'FRUIT', 34, true),
  ing('ing-coconut-water', 'Tender coconut water', 'ml', 'FRUIT', 26, true),
  ing('ing-ginger-ale', 'Ginger ale', 'ml', 'FRUIT', 20, false),
  ing('ing-sparkling-water', 'Sparkling water', 'ml', 'OTHER', 8, false),
  ing('ing-water', 'Filtered water', 'ml', 'OTHER', 1, false),
  ing('ing-tapioca-pearls', 'Tapioca pearls', 'g', 'TOPPING', 55, true),
  ing('ing-ice', 'Ice', 'g', 'TOPPING', 2, false),
  ing('ing-cup-475', 'Cold cup 475 ml', 'pc', 'PACKAGING', 850, false),
  ing('ing-cup-250', 'Hot cup 250 ml', 'pc', 'PACKAGING', 700, false),
  ing('ing-lid-cold', 'Cold lid', 'pc', 'PACKAGING', 320, false),
  ing('ing-lid-hot', 'Hot lid', 'pc', 'PACKAGING', 300, false),
  ing('ing-straw', 'Paper straw', 'pc', 'PACKAGING', 150, false),
  ing('ing-qr-label', 'Cup QR label', 'pc', 'PACKAGING', 90, false),
];

export const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));

/* --------------------------------------------------------------- recipes */

type BaseKey =
  | 'ESPRESSO_HOT' | 'AMERICANO_HOT' | 'CAPPUCCINO' | 'FLAT_WHITE' | 'LATTE_HOT'
  | 'HOT_CHOCOLATE' | 'MOCHA_HOT' | 'MATCHA_HOT'
  | 'ICED_ESPRESSO' | 'ICED_AMERICANO' | 'VIETNAMESE' | 'ICED_LATTE' | 'ICED_MOCHA'
  | 'COLD_BREW' | 'COOLER' | 'ICED_TEA' | 'MATCHA_COLD' | 'MILK_TEA'
  | 'BLENDED_COFFEE' | 'BLENDED_MATCHA' | 'BLENDED_FRUIT' | 'CLOUD_COFFEE' | 'CLOUD_MILK';

const q = (ingredientId: string, qty: number): RecipeItem => ({ ingredientId, qty });

/** Liquid + solid base for one drink, before product-specific flavouring. */
const BASES: Record<BaseKey, RecipeItem[]> = {
  ESPRESSO_HOT: [q('ing-espresso-beans', 18), q('ing-water', 60)],
  AMERICANO_HOT: [q('ing-espresso-beans', 18), q('ing-water', 180)],
  CAPPUCCINO: [q('ing-espresso-beans', 18), q('ing-whole-milk', 150)],
  FLAT_WHITE: [q('ing-espresso-beans', 20), q('ing-whole-milk', 140)],
  LATTE_HOT: [q('ing-espresso-beans', 18), q('ing-whole-milk', 190)],
  HOT_CHOCOLATE: [q('ing-cocoa-powder', 25), q('ing-whole-milk', 210), q('ing-sea-salt', 0.4)],
  MOCHA_HOT: [q('ing-espresso-beans', 18), q('ing-chocolate-sauce', 25), q('ing-whole-milk', 175)],
  MATCHA_HOT: [q('ing-matcha', 4), q('ing-whole-milk', 205)],
  ICED_ESPRESSO: [q('ing-espresso-beans', 36), q('ing-water', 80), q('ing-ice', 190)],
  ICED_AMERICANO: [q('ing-espresso-beans', 36), q('ing-water', 250), q('ing-ice', 180)],
  VIETNAMESE: [q('ing-espresso-beans', 36), q('ing-condensed-milk', 45), q('ing-ice', 200)],
  ICED_LATTE: [q('ing-espresso-beans', 36), q('ing-whole-milk', 255), q('ing-ice', 180)],
  ICED_MOCHA: [q('ing-espresso-beans', 36), q('ing-chocolate-sauce', 30), q('ing-whole-milk', 225), q('ing-ice', 180)],
  COLD_BREW: [q('ing-cold-brew', 230), q('ing-water', 60), q('ing-ice', 190)],
  COOLER: [q('ing-sparkling-water', 300), q('ing-ice', 180)],
  ICED_TEA: [q('ing-black-tea', 6), q('ing-water', 290), q('ing-ice', 175)],
  MATCHA_COLD: [q('ing-matcha', 5), q('ing-whole-milk', 250), q('ing-ice', 175)],
  MILK_TEA: [q('ing-black-tea', 8), q('ing-water', 120), q('ing-whole-milk', 200), q('ing-ice', 150)],
  BLENDED_COFFEE: [q('ing-espresso-beans', 36), q('ing-whole-milk', 200), q('ing-ice', 260)],
  BLENDED_MATCHA: [q('ing-matcha', 6), q('ing-whole-milk', 220), q('ing-ice', 250)],
  BLENDED_FRUIT: [q('ing-mango-puree', 160), q('ing-water', 60), q('ing-ice', 270)],
  CLOUD_COFFEE: [q('ing-cold-brew', 150), q('ing-ice', 170)],
  CLOUD_MILK: [q('ing-whole-milk', 240), q('ing-ice', 170)],
};

const COLD_PACKAGING: RecipeItem[] = [q('ing-cup-475', 1), q('ing-lid-cold', 1), q('ing-straw', 1), q('ing-qr-label', 1)];
const HOT_PACKAGING: RecipeItem[] = [q('ing-cup-250', 1), q('ing-lid-hot', 1), q('ing-qr-label', 1)];

interface Blueprint {
  base: BaseKey;
  extras?: RecipeItem[];
  prepSeconds: number;
}

/** productId → how the drink is actually built on the bar. */
const BLUEPRINTS: Record<string, Blueprint> = {
  'p-hc-01': { base: 'ESPRESSO_HOT', prepSeconds: 45 },
  'p-hc-02': { base: 'AMERICANO_HOT', prepSeconds: 55 },
  'p-hc-03': { base: 'CAPPUCCINO', prepSeconds: 90 },
  'p-hc-04': { base: 'FLAT_WHITE', prepSeconds: 90 },
  'p-hc-05': { base: 'LATTE_HOT', prepSeconds: 85 },
  'p-hc-06': { base: 'LATTE_HOT', extras: [q('ing-vanilla-syrup', 20)], prepSeconds: 95 },
  'p-hc-07': { base: 'LATTE_HOT', extras: [q('ing-hazelnut-syrup', 20)], prepSeconds: 95 },
  'p-hc-08': { base: 'HOT_CHOCOLATE', prepSeconds: 100 },
  'p-hc-09': { base: 'MOCHA_HOT', prepSeconds: 105 },

  'p-ic-01': { base: 'ICED_ESPRESSO', prepSeconds: 70 },
  'p-ic-02': { base: 'ICED_AMERICANO', prepSeconds: 60 },
  'p-ic-03': { base: 'VIETNAMESE', prepSeconds: 90 },
  'p-ic-04': { base: 'ICED_LATTE', prepSeconds: 75 },
  'p-ic-05': { base: 'ICED_LATTE', extras: [q('ing-hazelnut-syrup', 25)], prepSeconds: 85 },
  'p-ic-06': { base: 'ICED_LATTE', extras: [q('ing-caramel-syrup', 25)], prepSeconds: 85 },
  'p-ic-07': { base: 'ICED_LATTE', extras: [q('ing-vanilla-syrup', 25)], prepSeconds: 85 },
  'p-ic-08': { base: 'ICED_MOCHA', prepSeconds: 95 },

  'p-cb-01': { base: 'COLD_BREW', prepSeconds: 45 },
  'p-cb-02': { base: 'COLD_BREW', extras: [q('ing-sweet-cream', 60)], prepSeconds: 75 },
  'p-cb-03': { base: 'COLD_BREW', extras: [q('ing-orange-syrup', 30)], prepSeconds: 80 },
  'p-cb-04': { base: 'COLD_BREW', extras: [q('ing-brown-sugar-syrup', 30), q('ing-cinnamon', 1)], prepSeconds: 80 },
  'p-cb-05': { base: 'COLD_BREW', extras: [q('ing-cranberry-juice', 70)], prepSeconds: 75 },
  'p-cb-06': { base: 'COLD_BREW', extras: [q('ing-ginger-ale', 90)], prepSeconds: 70 },

  'p-co-01': { base: 'COOLER', extras: [q('ing-kala-khatta-syrup', 55), q('ing-lemon-juice', 10)], prepSeconds: 60 },
  'p-co-02': { base: 'COOLER', extras: [q('ing-grapefruit-syrup', 55)], prepSeconds: 60 },
  'p-co-03': { base: 'COOLER', extras: [q('ing-lychee-syrup', 50), q('ing-lemon-juice', 15)], prepSeconds: 65 },
  'p-co-04': { base: 'COOLER', extras: [q('ing-mango-syrup', 40), q('ing-passionfruit-syrup', 25)], prepSeconds: 70 },
  'p-co-05': { base: 'COOLER', extras: [q('ing-berry-syrup', 55)], prepSeconds: 60 },

  'p-it-01': { base: 'ICED_TEA', extras: [q('ing-lemon-juice', 20)], prepSeconds: 50 },
  'p-it-02': { base: 'ICED_TEA', extras: [q('ing-peach-syrup', 35), q('ing-lemon-juice', 10)], prepSeconds: 55 },
  'p-it-03': { base: 'ICED_TEA', extras: [q('ing-hibiscus', 5)], prepSeconds: 55 },
  'p-it-04': { base: 'ICED_TEA', extras: [q('ing-grapefruit-syrup', 35)], prepSeconds: 55 },

  'p-mm-01': { base: 'MATCHA_COLD', extras: [q('ing-strawberry-syrup', 35)], prepSeconds: 110 },
  'p-mm-02': { base: 'MATCHA_COLD', extras: [q('ing-mango-puree', 60)], prepSeconds: 110 },
  'p-mm-03': { base: 'MATCHA_COLD', prepSeconds: 100 },
  'p-mm-04': { base: 'MATCHA_HOT', prepSeconds: 100 },

  'p-ub-01': { base: 'CLOUD_MILK', extras: [q('ing-ube-syrup', 45)], prepSeconds: 95 },
  'p-ub-02': { base: 'COLD_BREW', extras: [q('ing-ube-syrup', 35), q('ing-sweet-cream', 55)], prepSeconds: 110 },
  'p-ub-03': { base: 'MATCHA_COLD', extras: [q('ing-ube-syrup', 40)], prepSeconds: 115 },

  'p-mt-01': { base: 'MILK_TEA', prepSeconds: 85 },
  'p-mt-02': { base: 'MILK_TEA', extras: [q('ing-sweet-cream', 55)], prepSeconds: 100 },
  'p-mt-03': { base: 'MILK_TEA', extras: [q('ing-brown-sugar-syrup', 35), q('ing-tapioca-pearls', 70)], prepSeconds: 115 },

  'p-cl-01': { base: 'CLOUD_COFFEE', extras: [q('ing-coconut-water', 150), q('ing-whipped-cream', 35)], prepSeconds: 105 },
  'p-cl-02': { base: 'CLOUD_MILK', extras: [q('ing-matcha', 5), q('ing-whipped-cream', 35)], prepSeconds: 110 },
  'p-cl-03': { base: 'CLOUD_MILK', extras: [q('ing-ube-syrup', 45), q('ing-whipped-cream', 35)], prepSeconds: 110 },

  'p-bl-01': { base: 'BLENDED_COFFEE', extras: [q('ing-brown-butter', 18)], prepSeconds: 130 },
  'p-bl-02': { base: 'BLENDED_COFFEE', prepSeconds: 120 },
  'p-bl-03': { base: 'BLENDED_COFFEE', extras: [q('ing-chocolate-sauce', 30)], prepSeconds: 125 },
  'p-bl-04': { base: 'BLENDED_MATCHA', prepSeconds: 125 },
  'p-bl-05': { base: 'BLENDED_FRUIT', prepSeconds: 115 },
};

function mergeItems(...groups: RecipeItem[][]): RecipeItem[] {
  const merged = new Map<string, number>();
  groups.flat().forEach((item) => merged.set(item.ingredientId, (merged.get(item.ingredientId) ?? 0) + item.qty));
  return Array.from(merged, ([ingredientId, qty]) => ({ ingredientId, qty }));
}

export const RECIPES: Recipe[] = PRODUCTS.map((product) => {
  const blueprint = BLUEPRINTS[product.id];
  const isHot = product.temp === 'HOT';
  const variant: Recipe['variant'] = product.temp === 'BLENDED' ? 'BLENDED_475' : isHot ? 'HOT_250' : 'COLD_475';
  return {
    id: `rec-${product.id}`,
    productId: product.id,
    variant,
    yieldMl: isHot ? 250 : 475,
    prepSeconds: blueprint.prepSeconds,
    items: mergeItems(BASES[blueprint.base], blueprint.extras ?? [], isHot ? HOT_PACKAGING : COLD_PACKAGING),
  };
});

export const RECIPE_BY_PRODUCT = new Map(RECIPES.map((r) => [r.productId, r]));
