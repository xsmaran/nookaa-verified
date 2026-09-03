'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Checkbox, Field, Fieldset, FormActions, FormGrid, FormSpan,
  ImageField, Input, MoneyInput, Select, Sheet, Tabs, Textarea,
} from '@/components/ui';
import { RecipeEditor } from './recipe-editor';
import { formatMoney } from '@/lib/format';
import { useSave } from '@/hooks/use-save';
import { useCatalog } from '@/hooks/use-catalog';
import { ProductRepository, type ProductWriteInput } from '@/repositories/product-repository';
import type { Product, ServeTemp } from '@/types';

/**
 * Create and edit a drink.
 *
 * Split across three tabs because the three jobs are genuinely different and
 * done by different people at different times: what it is and what it costs;
 * what a customer can change about it; and what the bar actually pours. Putting
 * all of it on one page would make the common edit — a price — a scroll.
 */

const TEMPS: Array<{ value: ServeTemp; label: string }> = [
  { value: 'HOT', label: 'Hot · 250 ml' },
  { value: 'COLD', label: 'Cold · 475 ml' },
  { value: 'BLENDED', label: 'Blended · 475 ml' },
  { value: 'HOT_OR_COLD', label: 'Either' },
];

export interface ProductDraft extends Partial<Product> {
  id?: string;
}

export function ProductEditor({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: ProductDraft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { categories, taxRates, modifierGroups, stores, ingredients, recipeByProduct } = useCatalog();
  const { save, saving, error, fieldErrors, clearError } = useSave();

  const isNew = !product?.id;
  const [tab, setTab] = useState('details');
  const [draft, setDraft] = useState<ProductDraft>({});
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!open) return;
    const base: ProductDraft = {
      temp: 'COLD',
      active: true,
      available: true,
      tags: [],
      modifierGroupIds: [],
      storeIds: [],
      priceMinor: 0,
      taxRateId: taxRates.find((t) => t.isDefault)?.id ?? taxRates[0]?.id ?? '',
      categoryId: categories[0]?.id ?? '',
      description: '',
      ...product,
    };
    setDraft(base);
    setInitial(JSON.stringify(base));
    setTab('details');
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // The margin, live, as the price is typed. It is the number that decides
  // whether a price is right, so making somebody save to see it is a mistake.
  const recipeCost = useMemo(() => {
    const recipe = product?.id ? recipeByProduct.get(product.id) : undefined;
    if (!recipe) return null;
    const costs = new Map(ingredients.map((i) => [i.id, i.costMinorPerUnit]));
    return Math.round(recipe.items.reduce(
      (sum, item) => sum + item.qty * (1 + (item.wastagePct ?? 0) / 100) * (costs.get(item.ingredientId) ?? 0),
      0,
    ));
  }, [product?.id, recipeByProduct, ingredients]);

  // The override wins when it is set; otherwise the recipe decides. The two
  // are kept apart so that opening this sheet never turns a derived cost into
  // a stored one.
  const cost = draft.costMinor ?? recipeCost;
  const margin = cost !== null && cost !== undefined && (draft.priceMinor ?? 0) > 0
    ? Math.round((((draft.priceMinor ?? 0) - cost) / (draft.priceMinor ?? 1)) * 100)
    : null;

  async function submit() {
    const payload: ProductWriteInput = {
      categoryId: draft.categoryId ?? '',
      sku: draft.sku || null,
      name: draft.name ?? '',
      spec: draft.spec ?? '',
      description: draft.description ?? '',
      imageUrl: draft.imageUrl ?? null,
      temp: draft.temp ?? 'COLD',
      priceMinor: draft.priceMinor ?? 0,
      costMinor: draft.costMinor ?? null,
      taxRateId: draft.taxRateId ?? '',
      tags: draft.tags ?? [],
      badge: draft.badge ?? null,
      modifierGroupIds: draft.modifierGroupIds ?? [],
      storeIds: draft.storeIds ?? [],
      active: draft.active ?? true,
      available: draft.available ?? true,
      sortOrder: draft.sortOrder,
    };

    // ProductRepository.create/update refresh the shared catalog snapshot
    // themselves, so the POS never charges yesterday's price after this.
    const result = await save(
      () => (isNew
        ? ProductRepository.create(payload)
        : ProductRepository.update(draft.id!, payload)),
      { successMessage: isNew ? `${draft.spec} added to the menu` : `${draft.spec} updated` },
    );

    if (result) {
      setInitial(JSON.stringify(draft));
      onSaved();
      onClose();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'New product' : draft.spec ?? ''}
      subtitle={isNew ? 'Adds a drink to the menu' : draft.name}
      width="lg"
    >
      <Tabs
        items={[
          { id: 'details', label: 'Details' },
          { id: 'options', label: 'Options', count: draft.modifierGroupIds?.length },
          { id: 'recipe', label: 'Recipe', disabled: isNew },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'details' ? (
        <div className="space-y-5">
          <FormGrid>
            <Field label="Spec" required htmlFor="spec" error={fieldErrors.spec}
              hint="What a barista calls it — Iced Latte">
              <Input id="spec" value={draft.spec ?? ''} onChange={(e) => set('spec', e.target.value)} />
            </Field>

            <Field label="Menu name" required htmlFor="name" error={fieldErrors.name}
              hint="What the customer reads — The Silk Road">
              <Input id="name" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} />
            </Field>

            <Field label="Category" required htmlFor="category" error={fieldErrors.categoryId}>
              <Select id="category" value={draft.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="SKU" htmlFor="sku" error={fieldErrors.sku} hint="Optional. Must be unique.">
              <Input id="sku" value={draft.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
            </Field>

            <Field label="Serve" htmlFor="temp">
              <Select id="temp" value={draft.temp ?? 'COLD'} onChange={(e) => set('temp', e.target.value as ServeTemp)}>
                {TEMPS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>

            <Field label="Badge" htmlFor="badge" hint="Shown as a corner flag on the POS card">
              <Select
                id="badge"
                value={draft.badge ?? ''}
                onChange={(e) => set('badge', (e.target.value || null) as Product['badge'])}
              >
                <option value="">None</option>
                <option value="POPULAR">Popular</option>
                <option value="NEW">New</option>
                <option value="SIGNATURE">Signature</option>
              </Select>
            </Field>

            <FormSpan>
              <Field label="Description" htmlFor="description" error={fieldErrors.description}>
                <Textarea
                  id="description"
                  rows={2}
                  value={draft.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </FormSpan>
          </FormGrid>

          <Fieldset legend="Price" hint="Money is stored in paise. Tax is applied on the discounted value.">
            <FormGrid columns={3}>
              <Field label="Selling price" required htmlFor="price" error={fieldErrors.priceMinor}>
                <MoneyInput
                  id="price"
                  valueMinor={draft.priceMinor ?? 0}
                  onChange={(minor) => set('priceMinor', minor ?? 0)}
                />
              </Field>

              <Field
                label="Cost override"
                htmlFor="cost"
                hint={recipeCost !== null ? `Recipe says ${formatMoney(recipeCost)}` : 'Leave empty to use the recipe'}
              >
                <MoneyInput
                  id="cost"
                  valueMinor={draft.costMinor ?? null}
                  onChange={(minor) => set('costMinor', minor)}
                  placeholder={recipeCost !== null ? (recipeCost / 100).toFixed(2) : '—'}
                />
              </Field>

              <Field label="Tax" required htmlFor="tax" error={fieldErrors.taxRateId}>
                <Select id="tax" value={draft.taxRateId ?? ''} onChange={(e) => set('taxRateId', e.target.value)}>
                  {taxRates.filter((t) => t.active).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
            </FormGrid>

            {margin !== null ? (
              <p className="mt-3 text-xs text-muted">
                Gross margin{' '}
                <span className={`tnum font-mono font-semibold ${margin < 50 ? 'text-status-alert' : 'text-status-ready'}`}>
                  {margin}%
                </span>
                {cost !== null && cost !== undefined ? ` — ${formatMoney(cost)} to pour, ${formatMoney(draft.priceMinor ?? 0)} to sell` : ''}
              </p>
            ) : null}
          </Fieldset>

          <Fieldset legend="Image">
            <ImageField value={draft.imageUrl} onChange={(url) => set('imageUrl', url)} />
          </Fieldset>

          <Fieldset legend="Availability">
            <div className="space-y-2.5">
              <Checkbox
                checked={draft.active ?? true}
                onChange={(v) => set('active', v)}
                label="On the menu"
                hint="Unticking this takes the drink off every POS. Past orders keep it."
              />
              <Checkbox
                checked={draft.available ?? true}
                onChange={(v) => set('available', v)}
                label="Available to sell right now"
                hint="The quick 86 switch. Stores can also do this for themselves."
              />
            </div>

            <div className="mt-4">
              <p className="eyebrow mb-1.5">Sold at</p>
              <p className="mb-2 text-xs text-faint">
                Leave all unticked to sell it everywhere — that is what most drinks want.
              </p>
              <div className="space-y-1.5">
                {stores.map((store) => (
                  <Checkbox
                    key={store.id}
                    checked={(draft.storeIds ?? []).includes(store.id)}
                    onChange={(checked) => set('storeIds', checked
                      ? [...(draft.storeIds ?? []), store.id]
                      : (draft.storeIds ?? []).filter((id) => id !== store.id))}
                    label={`${store.code} · ${store.name.replace('NOOKAA ', '')}`}
                  />
                ))}
              </div>
            </div>
          </Fieldset>
        </div>
      ) : null}

      {tab === 'options' ? (
        <div>
          <p className="mb-3 text-xs text-muted">
            Which groups of choices the POS offers when this drink is tapped. Order matters — the first
            group is the first question asked.
          </p>
          <div className="space-y-1.5">
            {modifierGroups.map((group) => {
              const checked = (draft.modifierGroupIds ?? []).includes(group.id);
              return (
                <label
                  key={group.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors
                    ${checked ? 'border-ink bg-sunk' : 'border-line hover:bg-sunk'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => set('modifierGroupIds', checked
                      ? (draft.modifierGroupIds ?? []).filter((id) => id !== group.id)
                      : [...(draft.modifierGroupIds ?? []), group.id])}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm">
                      {group.name}
                      <Badge tone={group.required ? 'warning' : 'neutral'}>
                        {group.required ? 'required' : 'optional'}
                      </Badge>
                      <Badge>{group.selection === 'SINGLE' ? 'pick one' : 'pick many'}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-faint">
                      {group.options.map((o) => o.name).join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === 'recipe' && draft.id ? (
        <RecipeEditor productId={draft.id} productSpec={draft.spec ?? ''} priceMinor={draft.priceMinor ?? 0} />
      ) : null}

      {tab !== 'recipe' ? (
        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          onCancel={dirty ? () => { setDraft(JSON.parse(initial)); clearError(); } : undefined}
          saveLabel={isNew ? 'Create product' : 'Save changes'}
        />
      ) : null}
    </Sheet>
  );
}
