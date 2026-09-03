'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui';
import { ChargeSheet } from '@/components/pos/charge-sheet';
import { CupLabelSheet } from '@/components/pos/cup-label-sheet';
import { ModifierSheet } from '@/components/pos/modifier-sheet';
import { ProductCard } from '@/components/pos/product-card';
import { TicketRail } from '@/components/pos/ticket-rail';
import { isValidCustomerName, isValidCustomerPhone } from '@/lib/format';
import { useCatalog } from '@/hooks/use-catalog';
import { ProductRepository } from '@/repositories';
import { bus, EVENTS, InventoryService } from '@/services';
import { useCart } from '@/stores/cart-store';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Order, PosProduct, Product, UnavailableReason } from '@/types';

/**
 * The POS.
 *
 * Categories left, products centre, ticket right — three panes, no navigation
 * between them, everything a counter sale needs on one screen. On a narrow
 * screen the category rail becomes a strip along the top rather than
 * disappearing into a menu, because a barista should never have to open
 * anything to change tab.
 *
 * Speed is the whole design constraint. Every read below comes from the
 * in-memory catalog snapshot: no fetch happens between tapping a category and
 * seeing the drinks.
 */
export default function PosPage() {
  const { categories, snapshot } = useCatalog();
  const session = useSession((s) => s.session);
  const cart = useCart();

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [shortStock, setShortStock] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  const showImages = (snapshot.settings?.pos?.showProductImages ?? true) !== false;
  const gridColumns = Number(snapshot.settings?.pos?.gridColumns ?? 4);

  useEffect(() => {
    if (!session) return;
    void ProductRepository.products(session.storeId).then(setProducts);
  }, [session, snapshot.generatedAt]);

  /**
   * Stock is checked locally as well as by the server. The snapshot already
   * carries what was true when it was fetched; this catches what has been
   * poured since, without waiting for the next sync.
   */
  const refreshStock = useCallback(async () => {
    if (!session) return;
    setShortStock(await InventoryService.unavailableProducts(session.storeId));
  }, [session]);

  useEffect(() => {
    void refreshStock();
    return bus.on(EVENTS.INVENTORY_CHANGED, () => void refreshStock());
  }, [refreshStock]);

  function unavailabilityOf(product: PosProduct): UnavailableReason | null {
    if (product.unavailableReason) return product.unavailableReason;
    if (shortStock.has(product.id)) return 'OUT_OF_STOCK';
    return null;
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'all' && p.categoryId !== category) return false;
      if (!needle) return true;
      return `${p.spec} ${p.name} ${p.tags.join(' ')}`.toLowerCase().includes(needle);
    });
  }, [products, category, search]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + 1));
    return map;
  }, [products]);

  const select = (product: Product) => {
    if (product.modifierGroupIds.length === 0) { cart.add(product); return; }
    setPendingProduct(product);
  };

  // Hotkeys: digits jump categories, F2 charges, / focuses search, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.getElementById('pos-search')?.focus();
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.lines.length === 0) return;
        if (!isValidCustomerName(cart.customerName) || !isValidCustomerPhone(cart.customerPhone)) {
          toast.error("Add the customer's name and phone first", 'Both are required before an order can be charged.');
          return;
        }
        setChargeOpen(true);
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') { setCategory('all'); setSearch(''); }
      if (/^[0-9]$/.test(e.key)) {
        const index = Number(e.key);
        setCategory(index === 0 ? 'all' : categories[index - 1]?.id ?? 'all');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart.lines.length, cart.customerName, cart.customerPhone, categories]);

  const activeCategory = categories.find((c) => c.id === category);

  return (
    /*
      Three panes, collapsing in two stages rather than one:

        below lg   everything stacked — a phone, or a tablet held upright
        lg to xl   ticket beside the grid, categories as a strip along the top
        xl and up  the full counter layout: rail, grid, ticket

      The middle stage is the one that matters. A 1024 px tablet cannot afford
      both a 176 px category rail and a 330 px ticket beside the products — it
      leaves about 360 px for the grid, which is two cramped columns. The
      ticket is the pane that has to stay, because the customer is reading it.
    */
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/*
        min-w-0 is load-bearing here, not tidiness. A flex item defaults to
        min-width:auto, so the product grid would refuse to shrink below its
        content and push the ticket off the right edge of a tablet entirely.
      */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
        <nav
          aria-label="Categories"
          className="scroll-x flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2
            xl:w-44 xl:flex-col xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-2 xl:py-3"
        >
          <CategoryTab id="all" label="All" count={products.length} index={0} active={category === 'all'} onSelect={setCategory} />
          {categories.map((c, i) => (
            <CategoryTab
              key={c.id}
              id={c.id}
              label={c.shortName}
              count={counts.get(c.id) ?? 0}
              index={i + 1}
              active={category === c.id}
              onSelect={setCategory}
            />
          ))}
        </nav>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-surface px-4 py-2.5">
          <Input
            id="pos-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drinks — press / to jump here"
            aria-label="Search the menu"
          />
        </div>

        <div className="scroll-y min-h-0 flex-1 p-3">
          {activeCategory?.tagline ? (
            <p className="mb-3 font-display text-sm italic text-muted">{activeCategory.tagline}</p>
          ) : null}

          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${showImages ? 160 : 140}px, 1fr))` }}
            data-columns={gridColumns}
          >
            {visible.map((product) => {
              const reason = unavailabilityOf(product);
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  unavailable={reason !== null}
                  reason={reason}
                  showImage={showImages}
                  onSelect={select}
                />
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              {products.length === 0
                ? 'The menu has not loaded yet.'
                : search
                  ? <>Nothing matches “{search}”. Press Esc to clear.</>
                  : 'Nothing in this category.'}
            </p>
          ) : null}
        </div>
        </section>
      </div>

      <TicketRail onCharge={() => setChargeOpen(true)} />

      <ModifierSheet
        product={pendingProduct}
        onClose={() => setPendingProduct(null)}
        onConfirm={(product, modifiers, note) => {
          cart.add(product, modifiers, note);
          setPendingProduct(null);
        }}
      />

      <ChargeSheet
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        onCharged={(order) => { setChargeOpen(false); setPlacedOrder(order); }}
      />

      <CupLabelSheet order={placedOrder} onClose={() => setPlacedOrder(null)} />
    </div>
  );
}

function CategoryTab({
  id,
  label,
  count,
  index,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  count: number;
  index: number;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-3 py-2 text-[13px]
        font-semibold transition-colors xl:w-full xl:justify-between
        ${active ? 'bg-ink text-paper' : 'text-muted hover:bg-sunk hover:text-ink'}`}
    >
      <span className="flex items-center gap-1.5">
        {label}
        {index <= 9 ? (
          <kbd className={`hidden font-mono text-[10px] xl:inline ${active ? 'text-paper/50' : 'text-faint'}`}>
            {index}
          </kbd>
        ) : null}
      </span>
      <span className={`tnum hidden font-mono text-[10px] xl:inline ${active ? 'text-paper/50' : 'text-faint'}`}>
        {count}
      </span>
    </button>
  );
}
