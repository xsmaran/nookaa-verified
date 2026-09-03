import type { Category, Product } from '@/types';

/**
 * Seed input, not domain records.
 *
 * These arrays are read once, by `npm run db:seed`, and written into the
 * database — after which the application reads rows and never this file. The
 * fields the database owns (availability, archival, timestamps, who changed
 * what) are absent here on purpose: they are not facts about the menu, they
 * are facts about an operating business, and a constant cannot know them.
 */
export type SeedCategory = Omit<Category, 'imageUrl' | 'archivedAt'>;
export type SeedProduct = Omit<
  Product,
  'sku' | 'imageUrl' | 'costMinor' | 'available' | 'prepSeconds' | 'archivedAt'
>;

/**
 * The NOOKAA catalog, transcribed from "The Full Menu Book" (DNEG edition).
 *
 * Names, specs, descriptions, temperature and tags are the menu book verbatim.
 * PRICES ARE ASSUMPTIONS — the menu book carries no prices. Every price below
 * is a placeholder in the Mumbai specialty-café band and must be replaced with
 * NOOKAA's real price list before launch. See /docs/ASSUMPTIONS.md.
 */

export const CATEGORIES: SeedCategory[] = [
  { id: 'cat-hot-coffee', name: 'Hot Coffee', shortName: 'Hot', tagline: 'Espresso crafted from Arabica-Robusta blends, pulled to precision.', sortOrder: 1, active: true },
  { id: 'cat-iced-coffee', name: 'Iced Coffee', shortName: 'Iced', tagline: 'Bold espresso. Chilled to perfection.', sortOrder: 2, active: true },
  { id: 'cat-cold-brew', name: 'Cold Brew', shortName: 'Cold Brew', tagline: 'Ground coffee steeped cold for 18 hours.', sortOrder: 3, active: true },
  { id: 'cat-coolers', name: 'The Coolers', shortName: 'Coolers', tagline: 'India runs hot. These drinks run colder.', sortOrder: 4, active: true },
  { id: 'cat-iced-tea', name: 'Iced Tea', shortName: 'Iced Tea', tagline: 'Cold-brewed or chilled teas, served long.', sortOrder: 5, active: true },
  { id: 'cat-matcha', name: 'Matcha Moments', shortName: 'Matcha', tagline: 'Ceremonial-grade Japanese green tea, stone-ground.', sortOrder: 6, active: true },
  { id: 'cat-ube', name: 'The Ube Edit', shortName: 'Ube', tagline: 'Purple yam from the Philippines — earthy, sweet, violet.', sortOrder: 7, active: true },
  { id: 'cat-milk-tea', name: 'Milk Tea', shortName: 'Milk Tea', tagline: 'Slow-brewed tea, silky milk, timeless comfort.', sortOrder: 8, active: true },
  { id: 'cat-cloud', name: 'The Cloud Series', shortName: 'Cloud', tagline: 'Lightly salted whipped cream over bold bases.', sortOrder: 9, active: true },
  { id: 'cat-blended', name: 'Blended Beverages', shortName: 'Blended', tagline: 'Ice-blended thick and frosty, built fresh to order.', sortOrder: 10, active: true },
];

const COFFEE_MILK = ['mg-milk', 'mg-sweet', 'mg-shots', 'mg-addons'];
const COFFEE_BLACK = ['mg-sweet', 'mg-shots'];
const ICED_COFFEE_MILK = ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-shots', 'mg-addons'];
const ICED_BLACK = ['mg-sweet', 'mg-ice', 'mg-shots'];
const COLD_NO_COFFEE = ['mg-sweet', 'mg-ice'];
const TEA_MODS = ['mg-sweet', 'mg-ice', 'mg-addons'];
const BLENDED_MODS = ['mg-milk', 'mg-sweet', 'mg-shots', 'mg-addons'];

export const PRODUCTS: SeedProduct[] = [
  /* -------------------------------------------------------- 01 Hot Coffee */
  { id: 'p-hc-01', categoryId: 'cat-hot-coffee', name: 'The Classic Kick', spec: 'Espresso / Doppio', description: 'Rich, bold, unapologetically strong. Dark crema, clean finish.', temp: 'HOT', priceMinor: 14900, taxRateId: 'tax-gst5', tags: ['Espresso Base', 'No Milk'], modifierGroupIds: COFFEE_BLACK, active: true, storeIds: [], sortOrder: 1 },
  { id: 'p-hc-02', categoryId: 'cat-hot-coffee', name: 'The Long Pour', spec: 'Americano', description: 'Espresso stretched long and smooth — light on the palate, big on depth.', temp: 'HOT', priceMinor: 16900, taxRateId: 'tax-gst5', tags: ['No Milk', 'Low Intensity'], modifierGroupIds: COFFEE_BLACK, active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-hc-03', categoryId: 'cat-hot-coffee', name: 'The Cloud', spec: 'Cappuccino', description: 'Espresso beneath a pillow of microfoam milk — warm, airy, deeply satisfying.', temp: 'HOT', priceMinor: 19900, taxRateId: 'tax-gst5', tags: ['Microfoam', 'Crowd Favourite'], modifierGroupIds: COFFEE_MILK, active: true, storeIds: [], sortOrder: 3, badge: 'POPULAR' },
  { id: 'p-hc-04', categoryId: 'cat-hot-coffee', name: 'The White Hour', spec: 'Flat White', description: 'Ristretto shots with velvety steamed milk — stronger than a latte, smoother than a cappuccino.', temp: 'HOT', priceMinor: 20900, taxRateId: 'tax-gst5', tags: ['Ristretto', 'Intense'], modifierGroupIds: COFFEE_MILK, active: true, storeIds: [], sortOrder: 4 },
  { id: 'p-hc-05', categoryId: 'cat-hot-coffee', name: 'The Every Morning', spec: 'Latte', description: 'Espresso and steamed milk, most generous ratio — creamy, mellow, endlessly drinkable.', temp: 'HOT', priceMinor: 19900, taxRateId: 'tax-gst5', tags: ['Milk-Forward', 'Daily Driver'], modifierGroupIds: COFFEE_MILK, active: true, storeIds: [], sortOrder: 5, badge: 'POPULAR' },
  { id: 'p-hc-06', categoryId: 'cat-hot-coffee', name: 'The Velvet Garden', spec: 'Vanilla Latte', description: 'House latte lifted with real Bourbon vanilla syrup — floral, sweet, gently fragrant.', temp: 'HOT', priceMinor: 21900, taxRateId: 'tax-gst5', tags: ['Vanilla', 'Sweet'], modifierGroupIds: COFFEE_MILK, active: true, storeIds: [], sortOrder: 6 },
  { id: 'p-hc-07', categoryId: 'cat-hot-coffee', name: 'The Nutty Professor', spec: 'Hazelnut Latte', description: 'Roasted hazelnut syrup swirled into espresso and steamed milk — warm and toasty.', temp: 'HOT', priceMinor: 21900, taxRateId: 'tax-gst5', tags: ['Hazelnut', 'Indulgent'], modifierGroupIds: COFFEE_MILK, active: true, storeIds: [], sortOrder: 7 },
  { id: 'p-hc-08', categoryId: 'cat-hot-coffee', name: 'The Dark Hug', spec: 'Signature Hot Chocolate', description: 'Premium cocoa with steamed milk and a whisper of sea salt — pure comfort, no espresso.', temp: 'HOT', priceMinor: 21900, taxRateId: 'tax-gst5', tags: ['No Caffeine Option'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-addons'], active: true, storeIds: [], sortOrder: 8 },
  { id: 'p-hc-09', categoryId: 'cat-hot-coffee', name: 'The Midnight Hot', spec: 'Mocha', description: 'Espresso and rich chocolate with steamed milk — bold for purists, indulgent for all.', temp: 'HOT', priceMinor: 22900, taxRateId: 'tax-gst5', tags: ['Coffee + Chocolate'], modifierGroupIds: COFFEE_MILK, active: true, storeIds: [], sortOrder: 9 },

  /* ------------------------------------------------------- 02 Iced Coffee */
  { id: 'p-ic-01', categoryId: 'cat-iced-coffee', name: 'The Shake Awake', spec: 'Iced Shaken Espresso', description: 'Espresso and ice shaken hard until silky — a frothy, intense instant reset.', temp: 'COLD', priceMinor: 19900, taxRateId: 'tax-gst5', tags: ['No Milk', 'High Caffeine'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 1 },
  { id: 'p-ic-02', categoryId: 'cat-iced-coffee', name: 'The Long Chill', spec: 'Iced Americano', description: 'Double espresso over ice and cold water — clean, crisp, completely uncomplicated.', temp: 'COLD', priceMinor: 17900, taxRateId: 'tax-gst5', tags: ['No Milk', 'Minimalist'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-ic-03', categoryId: 'cat-iced-coffee', name: 'The Saigon Slow Down', spec: 'Vietnamese Iced Coffee', description: 'Robusta espresso over sweetened condensed milk and ice — thick, sweet, intensely caffeinated.', temp: 'COLD', priceMinor: 22900, taxRateId: 'tax-gst5', tags: ['Condensed Milk', 'Insta Worthy'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 3 },
  { id: 'p-ic-04', categoryId: 'cat-iced-coffee', name: 'The Silk Road', spec: 'Iced Latte', description: 'Espresso over ice with cold whole milk — smooth, creamy, and perfectly balanced.', temp: 'COLD', priceMinor: 21900, taxRateId: 'tax-gst5', tags: ['Most Ordered', 'Milk-Forward'], modifierGroupIds: ICED_COFFEE_MILK, active: true, storeIds: [], sortOrder: 4, badge: 'POPULAR' },
  { id: 'p-ic-05', categoryId: 'cat-iced-coffee', name: 'The Forest Road', spec: 'Iced Hazelnut Latte', description: 'Iced latte with toasted hazelnut syrup — nutty, creamy, wonderfully layered.', temp: 'COLD', priceMinor: 23900, taxRateId: 'tax-gst5', tags: ['Hazelnut', 'Lightly Sweet'], modifierGroupIds: ICED_COFFEE_MILK, active: true, storeIds: [], sortOrder: 5 },
  { id: 'p-ic-06', categoryId: 'cat-iced-coffee', name: 'The Golden Drizzle', spec: 'Iced Caramel Latte', description: 'Espresso and cold milk ribboned with house caramel — buttery, sweet, satisfying.', temp: 'COLD', priceMinor: 23900, taxRateId: 'tax-gst5', tags: ['Caramel', 'Sweet Treat'], modifierGroupIds: ICED_COFFEE_MILK, active: true, storeIds: [], sortOrder: 6 },
  { id: 'p-ic-07', categoryId: 'cat-iced-coffee', name: 'The Dream State', spec: 'Iced Vanilla Latte', description: 'Iced latte with pure Bourbon vanilla syrup — light, fragrant, impossibly smooth.', temp: 'COLD', priceMinor: 23900, taxRateId: 'tax-gst5', tags: ['Vanilla', 'Beginner-Friendly'], modifierGroupIds: ICED_COFFEE_MILK, active: true, storeIds: [], sortOrder: 7 },
  { id: 'p-ic-08', categoryId: 'cat-iced-coffee', name: 'The Midnight Chill', spec: 'Iced Mocha', description: 'Cold espresso, rich chocolate, icy milk — colder, bolder, built for Mumbai afternoons.', temp: 'COLD', priceMinor: 24900, taxRateId: 'tax-gst5', tags: ['Coffee + Chocolate', 'Go Big'], modifierGroupIds: ICED_COFFEE_MILK, active: true, storeIds: [], sortOrder: 8 },

  /* --------------------------------------------------------- 03 Cold Brew */
  { id: 'p-cb-01', categoryId: 'cat-cold-brew', name: 'The Slow Train', spec: 'Classic Cold Brew', description: '18-hour cold-steeped coffee over ice, undiluted — smooth, low-acid, double the caffeine.', temp: 'COLD', priceMinor: 22900, taxRateId: 'tax-gst5', tags: ['18-Hr Steep', 'High Caffeine'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 1 },
  { id: 'p-cb-02', categoryId: 'cat-cold-brew', name: 'The Silk Cloud', spec: 'Sweet Cream Cold Brew', description: 'Cold brew topped with a cascading pour of house sweet cream — made for photographs.', temp: 'COLD', priceMinor: 25900, taxRateId: 'tax-gst5', tags: ['Sweet Cream', 'Most Photographed'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 2, badge: 'POPULAR' },
  { id: 'p-cb-03', categoryId: 'cat-cold-brew', name: 'The Citrus Dark', spec: 'Orange Cold Brew', description: 'Cold brew shaken with bright orange syrup and real citrus — an unexpected pairing that works.', temp: 'COLD', priceMinor: 24900, taxRateId: 'tax-gst5', tags: ['Real Citrus', 'New Arrival'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 3, badge: 'NEW' },
  { id: 'p-cb-04', categoryId: 'cat-cold-brew', name: 'The Sugar & Spice', spec: 'Brown Sugar Cinnamon Cold Brew', description: 'Cold brew with brown sugar syrup and real cinnamon — caramel-deep and cozy.', temp: 'COLD', priceMinor: 24900, taxRateId: 'tax-gst5', tags: ['Brown Sugar', 'Cinnamon Spice'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 4 },
  { id: 'p-cb-05', categoryId: 'cat-cold-brew', name: 'The Crimson Tide', spec: 'Cranberry Cold Brew', description: 'Bright cranberry meets slow-steeped cold brew — fruity, crisp, refreshingly unexpected.', temp: 'COLD', priceMinor: 24900, taxRateId: 'tax-gst5', tags: ['Real Cranberry', 'Fruity'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 5 },
  { id: 'p-cb-06', categoryId: 'cat-cold-brew', name: 'The Ginger Spark', spec: 'Ginger Ale Cold Brew', description: 'Smooth cold brew lifted with crisp ginger ale — light, sparkling, incredibly refreshing.', temp: 'COLD', priceMinor: 24900, taxRateId: 'tax-gst5', tags: ['Ginger Ale', 'Sparkling'], modifierGroupIds: ICED_BLACK, active: true, storeIds: [], sortOrder: 6 },

  /* ------------------------------------------------------- 04 The Coolers */
  { id: 'p-co-01', categoryId: 'cat-coolers', name: 'The Kala Magic', spec: 'Jamun Kala Khatta', description: 'Indian black plum syrup with a jolt of kala khatta — tangy, deeply purple, nostalgic.', temp: 'COLD', priceMinor: 18900, taxRateId: 'tax-gst5', tags: ['India-Original', 'Vegan'], modifierGroupIds: COLD_NO_COFFEE, active: true, storeIds: [], sortOrder: 1 },
  { id: 'p-co-02', categoryId: 'cat-coolers', name: 'The Pink Hour', spec: 'Pink Grapefruit Cooler', description: 'Blush-pink grapefruit syrup and sparkling water — bittersweet, effervescent, visually stunning.', temp: 'COLD', priceMinor: 19900, taxRateId: 'tax-gst5', tags: ['Sparkling', 'Vegan'], modifierGroupIds: COLD_NO_COFFEE, active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-co-03', categoryId: 'cat-coolers', name: 'The Tokyo Rush', spec: 'Lychee Lemon Cooler', description: 'Lychee syrup and fresh lemon in sparkling water — floral, bright, perfectly balanced.', temp: 'COLD', priceMinor: 19900, taxRateId: 'tax-gst5', tags: ['Floral', 'Refreshing'], modifierGroupIds: COLD_NO_COFFEE, active: true, storeIds: [], sortOrder: 3 },
  { id: 'p-co-04', categoryId: 'cat-coolers', name: 'The Tropic Storm', spec: 'Mango Passion Cooler', description: 'Alphonso mango syrup shaken with passion fruit and sparkling water — tropical, tangy, brilliant orange.', temp: 'COLD', priceMinor: 20900, taxRateId: 'tax-gst5', tags: ['Mango + Passion'], modifierGroupIds: COLD_NO_COFFEE, active: true, storeIds: [], sortOrder: 4 },
  { id: 'p-co-05', categoryId: 'cat-coolers', name: 'The Berry Rebellion', spec: 'Summer Berry Cooler', description: 'Mixed berry syrup in sparkling water — deep red, wildly fruity, no caffeine.', temp: 'COLD', priceMinor: 20900, taxRateId: 'tax-gst5', tags: ['Mixed Berries', 'Summer Pick'], modifierGroupIds: COLD_NO_COFFEE, active: true, storeIds: [], sortOrder: 5 },

  /* ---------------------------------------------------------- 05 Iced Tea */
  { id: 'p-it-01', categoryId: 'cat-iced-tea', name: 'Lemon Luxe', spec: 'Lemon Iced Tea', description: 'Cold-brewed black tea with lemon — bright, tart, effervescent with a clean finish.', temp: 'COLD', priceMinor: 17900, taxRateId: 'tax-gst5', tags: ['No Milk', 'Top Seller'], modifierGroupIds: TEA_MODS, active: true, storeIds: [], sortOrder: 1, badge: 'POPULAR' },
  { id: 'p-it-02', categoryId: 'cat-iced-tea', name: 'The Orchard Chill', spec: 'Peach Iced Tea', description: 'Cold-brewed tea with sun-ripened peach and a lemon lift — soft, fruity, gently sweet.', temp: 'COLD', priceMinor: 18900, taxRateId: 'tax-gst5', tags: ['Peach', 'Classic'], modifierGroupIds: TEA_MODS, active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-it-03', categoryId: 'cat-iced-tea', name: 'The Crimson Bloom', spec: 'Hibiscus Iced Tea', description: 'Cold-brewed hibiscus with delicate floral notes and a bright ruby finish.', temp: 'COLD', priceMinor: 18900, taxRateId: 'tax-gst5', tags: ['Floral', 'Antioxidant Rich'], modifierGroupIds: TEA_MODS, active: true, storeIds: [], sortOrder: 3 },
  { id: 'p-it-04', categoryId: 'cat-iced-tea', name: 'The Citrus Affair', spec: 'Pink Grapefruit Iced Tea', description: 'Cold-brewed black tea kissed with juicy pink grapefruit — bold and bittersweet.', temp: 'COLD', priceMinor: 18900, taxRateId: 'tax-gst5', tags: ['Grapefruit', 'Refreshing'], modifierGroupIds: TEA_MODS, active: true, storeIds: [], sortOrder: 4 },

  /* ---------------------------------------------------- 06 Matcha Moments */
  { id: 'p-mm-01', categoryId: 'cat-matcha', name: 'The Strawberry Fields', spec: 'Strawberry Matcha', description: 'Cold matcha over fresh strawberry milk — the two-layer pour that broke the internet.', temp: 'COLD', priceMinor: 28900, taxRateId: 'tax-gst5', tags: ['Matcha + Strawberry', 'Most Instagrammed'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 1, badge: 'POPULAR' },
  { id: 'p-mm-02', categoryId: 'cat-matcha', name: 'The Tropic Ceremony', spec: 'Mango Matcha', description: 'Matcha whisked with mango purée and cold milk — Japan meets India.', temp: 'COLD', priceMinor: 28900, taxRateId: 'tax-gst5', tags: ['India × Japan', 'New'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 2, badge: 'NEW' },
  { id: 'p-mm-03', categoryId: 'cat-matcha', name: 'The Jade Latte', spec: 'Iced Matcha Latte', description: 'Ceremonial matcha whisked to a fine paste over cold milk and ice — pure, grassy, vivid.', temp: 'COLD', priceMinor: 26900, taxRateId: 'tax-gst5', tags: ['Ceremonial Grade', 'New'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 3, badge: 'NEW' },
  { id: 'p-mm-04', categoryId: 'cat-matcha', name: 'The Emerald Hour', spec: 'Hot Matcha Latte', description: 'Ceremonial matcha gently whisked with steamed milk — smooth, velvety, deeply comforting.', temp: 'HOT', priceMinor: 26900, taxRateId: 'tax-gst5', tags: ['Ceremonial Grade', 'Barista Favourite'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-addons'], active: true, storeIds: [], sortOrder: 4 },

  /* ------------------------------------------------------ 07 The Ube Edit */
  { id: 'p-ub-01', categoryId: 'cat-ube', name: 'The Purple Reign', spec: 'Ube Latte', description: 'Ube syrup whisked into steamed or cold milk — nutty, subtly vanilla-like, extraordinary violet.', temp: 'HOT_OR_COLD', priceMinor: 27900, taxRateId: 'tax-gst5', tags: ['Purple Yam', 'NOOKAA Exclusive'], modifierGroupIds: ['mg-serve-temp', 'mg-milk', 'mg-sweet', 'mg-addons'], active: true, storeIds: [], sortOrder: 1, badge: 'SIGNATURE' },
  { id: 'p-ub-02', categoryId: 'cat-ube', name: 'The Violet Dream', spec: 'Ube Cold Brew', description: '18-hour cold brew poured over ube-infused sweet cream — bold, distinctive, two-toned.', temp: 'COLD', priceMinor: 29900, taxRateId: 'tax-gst5', tags: ['Cold Brew + Ube', 'Signature Drop'], modifierGroupIds: ['mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 2, badge: 'SIGNATURE' },
  { id: 'p-ub-03', categoryId: 'cat-ube', name: 'The Dusk Matcha', spec: 'Ube Matcha Latte', description: 'Ceremonial matcha and ube syrup in cold milk — forest green meets royal violet.', temp: 'COLD', priceMinor: 29900, taxRateId: 'tax-gst5', tags: ['Matcha + Ube', 'Most Viral'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 3, badge: 'POPULAR' },

  /* ---------------------------------------------------------- 08 Milk Tea */
  { id: 'p-mt-01', categoryId: 'cat-milk-tea', name: 'The Harbour Brew', spec: 'Hong Kong Milk Tea', description: 'Traditional Hong Kong-style milk tea with our signature creamy milk base.', temp: 'COLD', priceMinor: 21900, taxRateId: 'tax-gst5', tags: ['Hong Kong Style', 'Signature'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 1 },
  { id: 'p-mt-02', categoryId: 'cat-milk-tea', name: 'The Velvet Crown', spec: 'Milk Tea with Sweet Cream', description: 'Signature milk tea finished with a slow-poured cloud of velvety sweet cream.', temp: 'COLD', priceMinor: 23900, taxRateId: 'tax-gst5', tags: ['Sweet Cream', 'Most Photographed'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-mt-03', categoryId: 'cat-milk-tea', name: 'The Brown Sugar Affair', spec: 'Brown Sugar Pearl Milk Tea', description: 'Milk tea swirled with brown sugar syrup and chewy tapioca pearls.', temp: 'COLD', priceMinor: 24900, taxRateId: 'tax-gst5', tags: ['Brown Sugar', 'Tapioca Pearls'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice', 'mg-addons'], active: true, storeIds: [], sortOrder: 3, badge: 'POPULAR' },

  /* -------------------------------------------------- 09 The Cloud Series */
  { id: 'p-cl-01', categoryId: 'cat-cloud', name: 'The Tender Cloud', spec: 'Coconut Water Coffee Cloud', description: 'Tender coconut water layered with 18-hour cold brew, finished with whipped cream.', temp: 'COLD', priceMinor: 28900, taxRateId: 'tax-gst5', tags: ['Coconut Water + Coffee', 'Signature'], modifierGroupIds: ['mg-sweet', 'mg-ice'], active: true, storeIds: [], sortOrder: 1, badge: 'SIGNATURE' },
  { id: 'p-cl-02', categoryId: 'cat-cloud', name: 'The Jade Cloud', spec: 'Matcha Cloud', description: 'Ceremonial matcha with cold milk, crowned with a cloud of whipped cream.', temp: 'COLD', priceMinor: 29900, taxRateId: 'tax-gst5', tags: ['Matcha', 'Whipped Foam'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice'], active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-cl-03', categoryId: 'cat-cloud', name: 'The Violet Cloud', spec: 'Ube Cloud', description: 'Creamy ube with cold milk, topped with a pillowy cloud of whipped cream.', temp: 'COLD', priceMinor: 29900, taxRateId: 'tax-gst5', tags: ['Ube', 'Whipped Foam'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-ice'], active: true, storeIds: [], sortOrder: 3 },

  /* ------------------------------------------------ 10 Blended Beverages */
  { id: 'p-bl-01', categoryId: 'cat-blended', name: 'The Butter Bliss', spec: 'Brown Butter Cold Coffee', description: 'Brown butter blended with espresso, milk, and ice — rich, velvety, defines NOOKAA.', temp: 'BLENDED', priceMinor: 31900, taxRateId: 'tax-gst5', tags: ['Signature', "Founder's Favourite"], modifierGroupIds: BLENDED_MODS, active: true, storeIds: [], sortOrder: 1, badge: 'SIGNATURE' },
  { id: 'p-bl-02', categoryId: 'cat-blended', name: 'The Frozen Kick', spec: 'Coffee Frappe', description: 'Espresso blended with ice and milk — bold coffee flavour, spoon-and-straw texture.', temp: 'BLENDED', priceMinor: 28900, taxRateId: 'tax-gst5', tags: ['Espresso Base', 'Classic'], modifierGroupIds: BLENDED_MODS, active: true, storeIds: [], sortOrder: 2 },
  { id: 'p-bl-03', categoryId: 'cat-blended', name: 'The Frozen Plot', spec: 'Mocha Frappe', description: 'Espresso, chocolate, and ice blended into a rich, velvety frost.', temp: 'BLENDED', priceMinor: 29900, taxRateId: 'tax-gst5', tags: ['Coffee + Chocolate', 'Crowd Favourite'], modifierGroupIds: BLENDED_MODS, active: true, storeIds: [], sortOrder: 3 },
  { id: 'p-bl-04', categoryId: 'cat-blended', name: 'The Frozen Jade', spec: 'Matcha Frappe', description: 'Ceremonial matcha blended with milk and ice — earthy, creamy, frosty green.', temp: 'BLENDED', priceMinor: 30900, taxRateId: 'tax-gst5', tags: ['Matcha Base', 'Premium'], modifierGroupIds: ['mg-milk', 'mg-sweet', 'mg-addons'], active: true, storeIds: [], sortOrder: 4 },
  { id: 'p-bl-05', categoryId: 'cat-blended', name: 'The Frozen Tropic', spec: 'Mango Fruit Blend', description: 'Ripe Alphonso mango purée blended with ice — tropical, naturally sweet, caffeine-free.', temp: 'BLENDED', priceMinor: 29900, taxRateId: 'tax-gst5', tags: ['Fruit', 'No Caffeine'], modifierGroupIds: ['mg-sweet'], active: true, storeIds: [], sortOrder: 5 },
];

export const PRODUCTS_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
