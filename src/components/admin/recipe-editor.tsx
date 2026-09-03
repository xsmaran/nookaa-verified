'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, Field, FormActions, QuantityInput, Select, Spinner,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBaseQty } from '@/lib/units';
import { useCatalog } from '@/hooks/use-catalog';
import { useSave } from '@/hooks/use-save';
import { ProductRepository } from '@/repositories/product-repository';
import { refreshCatalog } from '@/repositories';
import { useSession } from '@/stores/session-store';
import type { Recipe, RecipeItem } from '@/types';

/**
 * The bill of materials for one drink.
 *
 * Editing this changes what every future sale takes off the shelf, which is
 * why the cost and margin are recomputed on every keystroke rather than on
 * save — the number somebody is trying to reach is the margin, and hiding it
 * behind a round trip makes the whole exercise guesswork.
 *
 * Past sales are untouched: their consumption is already in the ledger.
 */

const VARIANTS = [
  { value: 'HOT_250', label: 'Hot · 250 ml' },
  { value: 'COLD_475', label: 'Cold · 475 ml' },
  { value: 'BLENDED_475', label: 'Blended · 475 ml' },
] as const;

interface Draft {
  variant: Recipe['variant'];
  yieldMl: number;
  prepSeconds: number;
  items: RecipeItem[];
}

export function RecipeEditor({
  productId,
  productSpec,
  priceMinor,
}: {
  productId: string;
  productSpec: string;
  priceMinor: number;
}) {
  const { ingredients } = useCatalog();
  const storeId = useSession((s) => s.session?.storeId);
  const { save, saving, error } = useSave();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ProductRepository.recipeFor(productId)
      .then((recipe) => {
        if (cancelled) return;
        // No recipe yet is the normal state for a new drink, not a failure.
        const next: Draft = recipe
          ? { variant: recipe.variant, yieldMl: recipe.yieldMl, prepSeconds: recipe.prepSeconds, items: recipe.items }
          : { variant: 'COLD_475', yieldMl: 475, prepSeconds: 60, items: [] };
        setDraft(next);
        setInitial(JSON.stringify(next));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const costs = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const lines = useMemo(() => (draft?.items ?? []).map((item) => {
    const ingredient = costs.get(item.ingredientId);
    const effective = item.qty * (1 + (item.wastagePct ?? 0) / 100);
    return {
      ...item,
      ingredient,
      effective,
      lineCostMinor: Math.round(effective * (ingredient?.costMinorPerUnit ?? 0)),
    };
  }), [draft?.items, costs]);

  const totalCost = lines.reduce((sum, line) => sum + line.lineCostMinor, 0);
  const margin = priceMinor > 0 ? Math.round(((priceMinor - totalCost) / priceMinor) * 100) : null;
  const dirty = draft !== null && JSON.stringify(draft) !== initial;

  const unused = ingredients.filter(
    (i) => i.active && !(draft?.items ?? []).some((item) => item.ingredientId === i.id),
  );

  function patchItem(ingredientId: string, patch: Partial<RecipeItem>) {
    setDraft((d) => d && {
      ...d,
      items: d.items.map((item) => (item.ingredientId === ingredientId ? { ...item, ...patch } : item)),
    });
  }

  async function submit() {
    if (!draft) return;
    const result = await save(
      () => ProductRepository.saveRecipe(productId, {
        variant: draft.variant,
        yieldMl: draft.yieldMl,
        prepSeconds: draft.prepSeconds,
        // A line at zero is somebody who started typing and stopped; sending it
        // would fail validation for a reason that is not their mistake.
        items: draft.items.filter((item) => item.qty > 0),
      }),
      { successMessage: `Recipe saved for ${productSpec}` },
    );
    if (result) {
      setInitial(JSON.stringify(draft));
      if (storeId) await refreshCatalog(storeId).catch(() => undefined);
    }
  }

  if (loading) {
    return <p className="flex items-center gap-2 py-8 text-sm text-muted"><Spinner /> Loading the recipe…</p>;
  }
  if (!draft) return null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Serving format" htmlFor="variant">
          <Select
            id="variant"
            value={draft.variant}
            onChange={(e) => setDraft({ ...draft, variant: e.target.value as Recipe['variant'] })}
          >
            {VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Yield" htmlFor="yield">
          <QuantityInput
            id="yield"
            unit="ml"
            min={0}
            value={draft.yieldMl}
            onChange={(v) => setDraft({ ...draft, yieldMl: v ?? 0 })}
          />
        </Field>
        <Field label="Prep target" htmlFor="prep" hint="Drives the brew clock on the board">
          <QuantityInput
            id="prep"
            unit="sec"
            min={0}
            value={draft.prepSeconds}
            onChange={(v) => setDraft({ ...draft, prepSeconds: v ?? 0 })}
          />
        </Field>
      </div>

      <div className="rounded-md border border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="eyebrow">Ingredients</p>
          <p className="text-[11px] text-faint">Wastage is what the bar draws beyond what reaches the cup</p>
        </div>

        {lines.length === 0 ? (
          <div className="px-3 py-6">
            <EmptyState
              title="No ingredients yet"
              hint="A drink with no recipe still sells — it just will not deduct anything from stock."
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-faint">
                <th className="px-3 py-2 text-left font-semibold">Ingredient</th>
                <th className="w-32 px-3 py-2 text-left font-semibold">Quantity</th>
                <th className="w-24 px-3 py-2 text-left font-semibold">Wastage</th>
                <th className="w-28 px-3 py-2 text-right font-semibold">Draws</th>
                <th className="w-24 px-3 py-2 text-right font-semibold">Cost</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.ingredientId} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <span className="block text-sm">{line.ingredient?.name ?? line.ingredientId}</span>
                    <span className="text-[11px] text-faint">
                      {formatMoney(line.ingredient?.costMinorPerUnit ?? 0)} / {line.ingredient?.unit}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <QuantityInput
                      unit={line.ingredient?.unit ?? ''}
                      value={line.qty}
                      min={0}
                      onChange={(v) => patchItem(line.ingredientId, { qty: v ?? 0 })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <QuantityInput
                      unit="%"
                      value={line.wastagePct ?? 0}
                      min={0}
                      onChange={(v) => patchItem(line.ingredientId, { wastagePct: v ?? 0 })}
                    />
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-xs text-muted">
                    {line.ingredient ? formatBaseQty(line.effective, line.ingredient.unit) : '—'}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-xs">
                    {formatMoney(line.lineCostMinor)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${line.ingredient?.name}`}
                      onClick={() => setDraft({
                        ...draft,
                        items: draft.items.filter((i) => i.ingredientId !== line.ingredientId),
                      })}
                      className="rounded px-1.5 py-0.5 text-muted hover:bg-alertSoft hover:text-status-alert"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <Select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="h-9 flex-1 text-[13px]"
            aria-label="Add an ingredient"
          >
            <option value="">Add an ingredient…</option>
            {unused.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!adding}
            onClick={() => {
              if (!adding) return;
              setDraft({ ...draft, items: [...draft.items, { ingredientId: adding, qty: 0, wastagePct: 0 }] });
              setAdding('');
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-sunk px-4 py-3">
        <div>
          <p className="eyebrow">Cost to pour</p>
          <p className="tnum font-mono text-lg">{formatMoney(totalCost)}</p>
        </div>
        <div>
          <p className="eyebrow">Sells for</p>
          <p className="tnum font-mono text-lg">{formatMoney(priceMinor)}</p>
        </div>
        <div>
          <p className="eyebrow">Gross margin</p>
          <p className={`tnum font-mono text-lg font-semibold
            ${margin === null ? '' : margin < 50 ? 'text-status-alert' : 'text-status-ready'}`}>
            {margin === null ? '—' : `${margin}%`}
          </p>
        </div>
      </div>

      <FormActions
        dirty={dirty}
        saving={saving}
        error={error}
        onSave={() => void submit()}
        onCancel={() => setDraft(JSON.parse(initial))}
        saveLabel="Save recipe"
      />
    </div>
  );
}
