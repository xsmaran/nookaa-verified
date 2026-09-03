'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { ProductEditor, type ProductDraft } from '@/components/admin/product-editor';
import {
  Badge, Button, ClearFilters, ConfirmDialog, DataTable, EmptyState, ErrorState,
  FilterSelect, Menu, Pagination, SearchInput, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { useLocalResource } from '@/hooks/use-resource';
import { usePermission } from '@/stores/session-store';
import { ProductRepository, type AdminProduct } from '@/repositories/product-repository';
import { toast } from '@/stores/toast-store';

/**
 * The menu, as the office manages it.
 *
 * Sorted by margin rather than by name by default: the list somebody opens
 * this page to look at is the thin end of it, and a drink selling below its
 * cost is the single most expensive thing that can quietly be true about a
 * catalog.
 */
export default function ProductsPage() {
  const canManage = usePermission('catalog.manage');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [confirming, setConfirming] = useState<AdminProduct | null>(null);

  const { data, loading, error, reload } = useLocalResource(() => ProductRepository.list(true), []);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      if (status === 'active' && (!p.active || p.archivedAt)) return false;
      if (status === 'inactive' && p.active && !p.archivedAt) return false;
      if (status === 'archived' && !p.archivedAt) return false;
      if (status === 'unavailable' && p.available) return false;
      if (status === 'no-recipe' && p.hasRecipe) return false;
      if (!needle) return true;
      return `${p.spec} ${p.name} ${p.sku ?? ''}`.toLowerCase().includes(needle);
    });
  }, [products, search, categoryId, status]);

  const limit = 50;
  const page = rows.slice(offset, offset + limit);
  const activeFilters = [categoryId, status, search].filter(Boolean).length;

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  function afterChange(message: string) {
    reload();
    toast.success(message);
  }

  async function duplicate(product: AdminProduct) {
    try {
      const copy = await ProductRepository.duplicate(product.id);
      afterChange(`Duplicated as “${copy.name}” — it starts off the menu`);
      setEditing(copy);
    } catch (e) {
      toast.error('Could not duplicate', (e as Error).message);
    }
  }

  async function toggleAvailability(product: AdminProduct) {
    try {
      await ProductRepository.setAvailability(product.id, !product.available);
      afterChange(product.available
        ? `${product.spec} is off the menu everywhere`
        : `${product.spec} is back on`);
    } catch (e) {
      toast.error('Could not change availability', (e as Error).message);
    }
  }

  async function archive() {
    if (!confirming) return;
    try {
      const restoring = Boolean(confirming.archivedAt);
      if (restoring) await ProductRepository.restore(confirming.id);
      else await ProductRepository.archive(confirming.id);
      afterChange(restoring ? `${confirming.spec} restored` : `${confirming.spec} archived`);
    } catch (e) {
      toast.error('Could not archive', (e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  const columns: Column<AdminProduct>[] = [
    {
      key: 'product',
      header: 'Product',
      sortBy: (p) => p.spec,
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-line bg-sunk">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <span className="block truncate text-xs font-bold uppercase tracking-wide">{p.spec}</span>
            <span className="block truncate font-display text-sm text-muted">{p.name}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '150px',
      secondary: true,
      sortBy: (p) => categoryName.get(p.categoryId) ?? '',
      render: (p) => <span className="text-xs text-muted">{categoryName.get(p.categoryId)}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '100px',
      sortBy: (p) => p.priceMinor,
      render: (p) => <span className="tnum font-mono text-sm">{formatMoney(p.priceMinor)}</span>,
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      width: '110px',
      // Nulls sort last, so drinks with no recipe do not crowd the top of the
      // list somebody opened to find their thinnest margins.
      sortBy: (p) => p.marginBps,
      render: (p) => (
        p.marginBps === null
          ? <span className="text-xs text-faint">no recipe</span>
          : <span className={`tnum font-mono text-sm ${p.marginBps < 5000 ? 'text-status-alert' : ''}`}>
              {(p.marginBps / 100).toFixed(0)}%
            </span>
      ),
    },
    {
      key: 'options',
      header: 'Options',
      align: 'right',
      width: '90px',
      secondary: true,
      sortBy: (p) => p.modifierGroupIds.length,
      render: (p) => <span className="tnum font-mono text-xs text-muted">{p.modifierGroupIds.length}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '150px',
      render: (p) => (
        p.archivedAt ? <Badge>archived</Badge>
        : !p.active ? <Badge tone="neutral">off menu</Badge>
        : !p.available ? <Badge tone="warning">unavailable</Badge>
        : <Badge tone="success">on sale</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'right',
      render: (p) => (
        <Menu
          items={[
            { label: 'Edit', onSelect: () => setEditing(p) },
            { label: 'Edit recipe', onSelect: () => setEditing(p) },
            { label: 'Duplicate', onSelect: () => void duplicate(p) },
            {
              label: p.available ? 'Take off the menu' : 'Put back on the menu',
              onSelect: () => void toggleAvailability(p),
              disabled: Boolean(p.archivedAt),
            },
            {
              label: p.archivedAt ? 'Restore' : 'Archive',
              onSelect: () => setConfirming(p),
              destructive: !p.archivedAt,
              separated: true,
            },
          ]}
        />
      ),
    },
  ];

  if (!canManage) {
    return (
      <div className="p-6">
        <PageHeader title="Products" />
        <ErrorState title="Not your call" message="Changing the menu needs the catalog permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Products"
        description="Everything on sale. A change here reaches every till on its next sync."
        actions={<Button variant="primary" size="sm" onClick={() => setEditing({})}>New product</Button>}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search drinks or SKU" />
            <FilterSelect
              label="Category"
              value={categoryId}
              onChange={(v) => { setCategoryId(v); setOffset(0); }}
              allLabel="Every category"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); setOffset(0); }}
              allLabel="Any status"
              options={[
                { value: 'active', label: 'On sale' },
                { value: 'unavailable', label: 'Unavailable' },
                { value: 'inactive', label: 'Off the menu' },
                { value: 'no-recipe', label: 'No recipe' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <ClearFilters
              active={activeFilters}
              onClear={() => { setSearch(''); setCategoryId(''); setStatus(''); setOffset(0); }}
            />
          </Toolbar>

          <DataTable
            rows={page}
            columns={columns}
            loading={loading}
            rowKey={(p) => p.id}
            onRowClick={setEditing}
            defaultSort={{ key: 'margin', direction: 'asc' }}
            rowTone={(p) => (p.archivedAt ? 'muted' : 'default')}
            empty={
              <EmptyState
                title={activeFilters > 0 ? 'Nothing matches those filters' : 'No products yet'}
                hint={activeFilters > 0 ? undefined : 'Add the first drink to get the POS working.'}
              />
            }
          />

          <Pagination total={rows.length} offset={offset} limit={limit} onChange={setOffset} />
        </>
      )}

      <ProductEditor
        open={editing !== null}
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={archive}
        destructive={!confirming?.archivedAt}
        title={confirming?.archivedAt ? 'Restore this product?' : 'Archive this product?'}
        confirmLabel={confirming?.archivedAt ? 'Restore' : 'Archive'}
        message={
          confirming?.archivedAt
            ? <>{confirming.spec} goes back on the menu and can be sold again.</>
            : <>
                <strong>{confirming?.spec}</strong> comes off every POS. Nothing is deleted — orders that
                already contain it keep working, and you can restore it at any time.
              </>
        }
      />
    </div>
  );
}
