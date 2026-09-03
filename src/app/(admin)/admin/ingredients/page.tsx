'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Field,
  FilterSelect, FormActions, FormGrid, Input, Menu, MoneyInput, SearchInput, Select, Sheet, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBaseQty } from '@/lib/units';
import { useLocalResource } from '@/hooks/use-resource';
import { useSave } from '@/hooks/use-save';
import { IngredientRepository, refreshCatalog } from '@/repositories';
import type { IngredientRow } from '@/repositories';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Ingredient, IngredientCategory, Session, Unit } from '@/types';

const CATEGORIES: IngredientCategory[] = [
  'COFFEE', 'DAIRY', 'SYRUP', 'TEA', 'FRUIT', 'TOPPING', 'PACKAGING', 'OTHER',
];

/**
 * The ingredient master list.
 *
 * Cost per unit is the field that matters most and the one nobody thinks to
 * update: it drives the margin on every drink that uses it, so a milk price
 * that moved three months ago is quietly wrong on forty products. Editing it
 * is one click from this table for exactly that reason.
 */
export default function IngredientsPage() {
  const canManage = usePermission('catalog.manage');
  const canView = usePermission('inventory.view');
  const session = useSession((s) => s.session);
  const storeId = session?.storeId;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [confirming, setConfirming] = useState<IngredientRow | null>(null);

  const { data, loading, error, reload } = useLocalResource<{ ingredients: IngredientRow[] }>(
    canView && storeId ? () => IngredientRepository.all(storeId, true).then((ingredients) => ({ ingredients })) : null,
    [storeId],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.ingredients ?? []).filter((i) => {
      if (category && i.category !== category) return false;
      if (!needle) return true;
      return `${i.name} ${i.sku ?? ''}`.toLowerCase().includes(needle);
    });
  }, [data?.ingredients, search, category]);

  async function archive() {
    if (!confirming) return;
    try {
      await IngredientRepository.archive(confirming.id, session);
      reload();
      if (storeId) await refreshCatalog(storeId).catch(() => undefined);
      toast.success(`${confirming.name} archived`);
    } catch (e) {
      toast.error('Could not archive', (e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  const columns: Column<IngredientRow>[] = [
    {
      key: 'name',
      header: 'Ingredient',
      sortBy: (i) => i.name,
      render: (i) => (
        <div className="min-w-0">
          <span className="block truncate text-sm">{i.name}</span>
          <span className="block text-[11px] text-faint">{i.sku ?? '—'}{i.supplier ? ` · ${i.supplier}` : ''}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Type',
      width: '120px',
      secondary: true,
      sortBy: (i) => i.category,
      render: (i) => <span className="text-xs lowercase text-muted">{i.category.toLowerCase()}</span>,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      width: '130px',
      sortBy: (i) => i.costMinorPerUnit,
      render: (i) => (
        <span className="tnum font-mono text-xs">
          {formatMoney(i.costMinorPerUnit)}<span className="text-faint"> / {i.unit}</span>
        </span>
      ),
    },
    {
      key: 'onHand',
      header: 'On hand here',
      align: 'right',
      width: '130px',
      sortBy: (i) => i.level?.onHand ?? null,
      render: (i) => (
        i.level
          ? <span className={`tnum font-mono text-xs ${i.level.onHand <= i.level.minStock ? 'text-status-alert' : ''}`}>
              {formatBaseQty(i.level.onHand, i.unit)}
            </span>
          : <span className="text-xs text-faint">not stocked</span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      width: '110px',
      secondary: true,
      sortBy: (i) => (i.level?.onHand ?? 0) * i.costMinorPerUnit,
      render: (i) => (
        <span className="tnum font-mono text-xs text-muted">
          {formatMoney(Math.round((i.level?.onHand ?? 0) * i.costMinorPerUnit))}
        </span>
      ),
    },
    {
      key: 'used',
      header: 'Recipes',
      align: 'right',
      width: '90px',
      sortBy: (i) => i.usedByCount,
      render: (i) => (
        i.usedByCount === 0
          ? <span className="text-xs text-faint">unused</span>
          : <span className="tnum font-mono text-xs">{i.usedByCount}</span>
      ),
    },
    {
      key: 'flags',
      header: '',
      width: '110px',
      render: (i) => (
        <div className="flex flex-wrap gap-1">
          {i.archivedAt ? <Badge>archived</Badge> : null}
          {i.perishable ? <Badge tone="warning">perishable</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'right',
      render: (i) => (
        canManage ? (
          <Menu
            items={[
              { label: 'Edit', onSelect: () => setEditing(i) },
              { label: 'Archive', onSelect: () => setConfirming(i), destructive: true, separated: true },
            ]}
          />
        ) : null
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Ingredients" />
        <ErrorState title="Not your call" message="Seeing ingredients needs the inventory permission." />
      </div>
    );
  }

  const totalValue = rows.reduce((sum, i) => sum + (i.level?.onHand ?? 0) * i.costMinorPerUnit, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Ingredients"
        description="What goes into the drinks. Cost per unit drives every margin figure in this admin, so it is worth keeping honest as supplier prices move."
        meta={<span className="tnum font-mono text-xs text-muted">{formatMoney(Math.round(totalValue))} on the shelf</span>}
        actions={canManage ? <Button variant="primary" size="sm" onClick={() => setEditing({})}>New ingredient</Button> : undefined}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search ingredients" />
            <FilterSelect
              label="Type"
              value={category}
              onChange={setCategory}
              allLabel="Every type"
              options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))}
            />
          </Toolbar>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(i) => i.id}
            onRowClick={canManage ? setEditing : undefined}
            defaultSort={{ key: 'name', direction: 'asc' }}
            rowTone={(i) => (i.archivedAt ? 'muted' : 'default')}
            empty={<EmptyState title="No ingredients match" />}
          />
        </>
      )}

      <IngredientEditor
        open={editing !== null}
        ingredient={editing}
        session={session}
        onClose={() => setEditing(null)}
        onSaved={() => { reload(); if (storeId) void refreshCatalog(storeId).catch(() => undefined); }}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={archive}
        destructive
        title="Archive this ingredient?"
        confirmLabel="Archive"
        message={
          confirming && confirming.usedByCount > 0 ? (
            <>
              <strong>{confirming.name}</strong> is used by {confirming.usedByCount} recipe
              {confirming.usedByCount === 1 ? '' : 's'}. This will be refused until it is removed from them —
              a recipe pointing at an archived ingredient would fail silently at the moment of a sale.
            </>
          ) : (
            <>
              <strong>{confirming?.name}</strong> is removed from the pickers. Its ledger history stays
              exactly as it is.
            </>
          )
        }
      />
    </div>
  );
}

function IngredientEditor({
  open,
  ingredient,
  session,
  onClose,
  onSaved,
}: {
  open: boolean;
  ingredient: Partial<Ingredient> | null;
  session: Session | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { save, saving, error, fieldErrors, clearError } = useSave();
  const isNew = !ingredient?.id;
  const [draft, setDraft] = useState<Partial<Ingredient>>({});
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!open) return;
    const base: Partial<Ingredient> = {
      unit: 'ml', category: 'OTHER', costMinorPerUnit: 0, perishable: false, active: true, ...ingredient,
    };
    setDraft(base);
    setInitial(JSON.stringify(base));
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ingredient?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const set = <K extends keyof Ingredient>(k: K, v: Ingredient[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    const base = {
      name: draft.name ?? '',
      sku: draft.sku || null,
      category: draft.category ?? 'OTHER' as IngredientCategory,
      costMinorPerUnit: draft.costMinorPerUnit ?? 0,
      supplier: draft.supplier || null,
      perishable: draft.perishable ?? false,
      shelfLifeDays: draft.shelfLifeDays ?? null,
      active: draft.active ?? true,
    };
    const result = await save(
      () => (isNew
        ? IngredientRepository.create({ ...base, unit: draft.unit ?? 'ml' }, session)
        : IngredientRepository.update(draft.id!, base, session)),
      { successMessage: isNew ? `${draft.name} added` : `${draft.name} updated` },
    );
    if (result) { onSaved(); onClose(); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'New ingredient' : draft.name ?? ''} width="md">
      <div className="space-y-5">
        <FormGrid>
          <Field label="Name" required htmlFor="iname" error={fieldErrors.name}>
            <Input id="iname" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Whole milk" />
          </Field>
          <Field label="SKU" htmlFor="isku" error={fieldErrors.sku} hint="Optional, must be unique">
            <Input id="isku" value={draft.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="itype">
            <Select id="itype" value={draft.category ?? 'OTHER'} onChange={(e) => set('category', e.target.value as IngredientCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
            </Select>
          </Field>

          {/*
            The unit is fixed once there is a ledger behind it. Changing it
            would silently reinterpret every past movement — 20000 recorded as
            millilitres becoming 20000 grams — so it is set once and then shown
            as a fact rather than a field.
          */}
          <Field
            label="Unit"
            required={isNew}
            htmlFor="iunit"
            hint={isNew
              ? 'The base unit the ledger will use. This cannot be changed later.'
              : 'Fixed — the ledger already holds movements measured in this.'}
          >
            {isNew ? (
              <Select id="iunit" value={draft.unit ?? 'ml'} onChange={(e) => set('unit', e.target.value as Unit)}>
                <option value="ml">millilitres (ml) — liquids</option>
                <option value="g">grams (g) — solids</option>
                <option value="pc">pieces (pc) — cups, lids, straws</option>
              </Select>
            ) : (
              <div className="flex h-11 items-center rounded-md border border-line bg-sunk px-3 font-mono text-sm text-muted">
                {draft.unit}
              </div>
            )}
          </Field>

          <Field
            label={`Cost per ${draft.unit ?? 'unit'}`}
            required
            htmlFor="icost"
            error={fieldErrors.costMinorPerUnit}
            hint="Drives margins everywhere this is used"
          >
            <MoneyInput
              id="icost"
              valueMinor={draft.costMinorPerUnit ?? 0}
              onChange={(v) => set('costMinorPerUnit', v ?? 0)}
            />
          </Field>

          <Field label="Supplier" htmlFor="isupplier">
            <Input id="isupplier" value={draft.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
          </Field>
        </FormGrid>

        <div className="space-y-2.5">
          <Checkbox
            checked={draft.perishable ?? false}
            onChange={(v) => set('perishable', v)}
            label="Perishable"
            hint="Flags it for expiry checks and waste reporting."
          />
          {draft.perishable ? (
            <Field label="Shelf life" htmlFor="ishelf" hint="Days from receipt">
              <Input
                id="ishelf"
                type="number"
                min={0}
                value={draft.shelfLifeDays ?? ''}
                onChange={(e) => set('shelfLifeDays', e.target.value ? Number(e.target.value) : null)}
                className="max-w-[140px]"
              />
            </Field>
          ) : null}
          <Checkbox checked={draft.active ?? true} onChange={(v) => set('active', v)} label="Active" />
        </div>

        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          saveLabel={isNew ? 'Create ingredient' : 'Save changes'}
        />
      </div>
    </Sheet>
  );
}
