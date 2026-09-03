'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable, EmptyState, Input } from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatMoney, formatQty } from '@/lib/format';
import { useCatalog } from '@/hooks/use-catalog';
import { ProductRepository } from '@/repositories';
import type { Recipe } from '@/types';

interface Row {
  recipe: Recipe;
  spec: string;
  name: string;
  priceMinor: number;
  costMinor: number;
}

/** Recipes are what turn a sale into a stock movement. Margin falls out of them. */
export default function RecipesPage() {
  const { productById, ingredientById, recipeByProduct } = useCatalog();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void ProductRepository.recipes().then(setRecipes);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const needle = search.trim().toLowerCase();
    return recipes
      .map((recipe) => {
        const product = productById.get(recipe.productId);
        return {
          recipe,
          spec: product?.spec ?? recipe.productId,
          name: product?.name ?? '',
          priceMinor: product?.priceMinor ?? 0,
          costMinor: Math.round(
            recipe.items.reduce((sum, i) => sum + i.qty * (ingredientById.get(i.ingredientId)?.costMinorPerUnit ?? 0), 0),
          ),
        };
      })
      .filter((r) => !needle || `${r.spec} ${r.name}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.priceMinor - a.costMinor) / (a.priceMinor || 1) - (b.priceMinor - b.costMinor) / (b.priceMinor || 1));
  }, [recipes, search]);

  const columns: Column<Row>[] = [
    { key: 'spec', header: 'Drink', render: (r) => <span className="text-xs font-bold uppercase tracking-wide">{r.spec}</span> },
    { key: 'items', header: 'Ingredients', width: '110px', align: 'right', render: (r) => <span className="tnum font-mono text-xs text-muted">{r.recipe.items.length}</span> },
    { key: 'cost', header: 'Cost', width: '100px', align: 'right', render: (r) => <span className="tnum font-mono text-sm">{formatMoney(r.costMinor)}</span> },
    { key: 'price', header: 'Price', width: '100px', align: 'right', render: (r) => <span className="tnum font-mono text-sm">{formatMoney(r.priceMinor)}</span> },
    {
      key: 'margin',
      header: 'Margin',
      width: '100px',
      align: 'right',
      render: (r) => {
        const pct = r.priceMinor ? Math.round(((r.priceMinor - r.costMinor) / r.priceMinor) * 100) : 0;
        return (
          <span className={`tnum font-mono text-sm font-bold ${pct < 55 ? 'text-status-alert' : pct < 70 ? 'text-status-new' : 'text-status-ready'}`}>
            {pct}%
          </span>
        );
      },
    },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Recipes"
        description="Sorted by thinnest margin first — the drinks worth re-pricing or re-costing are at the top. Quantities are assumptions pending a bar audit."
        actions={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drinks" className="w-52" />}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.recipe.id}
        onRowClick={(r) => setOpen(open === r.recipe.id ? null : r.recipe.id)}
        empty={<EmptyState title="No recipes match" />}
      />

      {open ? (
        <div className="mt-4 rounded-md border border-line bg-surface p-4">
          <p className="eyebrow mb-2">{productById.get(recipes.find((r) => r.id === open)?.productId ?? '')?.spec}</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {recipes
              .find((r) => r.id === open)
              ?.items.map((item) => {
                const ingredient = ingredientById.get(item.ingredientId);
                return (
                  <li key={item.ingredientId} className="flex justify-between gap-3 border-b border-line py-1">
                    <span>{ingredient?.name}</span>
                    <span className="tnum font-mono text-xs text-muted">
                      {ingredient ? formatQty(item.qty, ingredient.unit) : item.qty} ·{' '}
                      {formatMoney(Math.round(item.qty * (ingredient?.costMinorPerUnit ?? 0)))}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
