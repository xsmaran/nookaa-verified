'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { StockMovementSheet } from '@/components/admin/stock-movement-sheet';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, FilterSelect,
  SearchInput, StatRow, StatTile, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBaseQty } from '@/lib/units';
import { useLocalResource } from '@/hooks/use-resource';
import { catalog, InventoryRepository, stockState } from '@/repositories';
import { InventoryService } from '@/services';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Ingredient, InventoryLevel } from '@/types';

interface LevelRow extends InventoryLevel {
  ingredient: Ingredient;
  state: 'OK' | 'LOW' | 'CRITICAL' | 'OUT';
  valueMinor: number;
}

const STATE_TONE = { OUT: 'danger', CRITICAL: 'danger', LOW: 'warning', OK: 'neutral' } as const;
const STATE_LABEL = { OUT: 'out of stock', CRITICAL: 'critical', LOW: 'low', OK: 'ok' } as const;

/** Replaces GET /api/inventory/levels?storeId= — same shape, read locally. */
async function loadLevels(storeId: string): Promise<{
  levels: LevelRow[];
  valuation: { totalMinor: number; byCategory: Record<string, number> };
}> {
  const [levels, { ingredientById }] = await Promise.all([
    InventoryRepository.levels(storeId),
    Promise.resolve(catalog()),
  ]);

  const byCategory: Record<string, number> = {};
  const rows: LevelRow[] = [];
  for (const level of levels) {
    const ingredient = ingredientById.get(level.ingredientId);
    if (!ingredient) continue;
    const valueMinor = level.onHand * ingredient.costMinorPerUnit;
    byCategory[ingredient.category] = (byCategory[ingredient.category] ?? 0) + valueMinor;
    rows.push({ ...level, ingredient, state: stockState(level), valueMinor });
  }

  return {
    levels: rows,
    valuation: { totalMinor: rows.reduce((sum, r) => sum + r.valueMinor, 0), byCategory },
  };
}

/**
 * Stock, for one store.
 *
 * Store-specific by design — §12 is explicit that Mumbai's milk and Delhi's
 * milk are two different numbers and combining them produces a figure that is
 * true of nowhere. The store switcher in the header is what changes this page.
 */
export default function InventoryPage() {
  const canView = usePermission('inventory.view');
  const canAdjust = usePermission('inventory.adjust');
  const session = useSession((s) => s.session);
  const storeId = session?.storeId;

  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [moving, setMoving] = useState<LevelRow | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const { data, loading, error, reload } = useLocalResource<{
    levels: LevelRow[];
    valuation: { totalMinor: number; byCategory: Record<string, number> };
  }>(
    canView && storeId ? () => loadLevels(storeId) : null,
    [storeId],
  );

  const levels = data?.levels ?? [];

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return levels.filter((l) => {
      if (state === 'attention' && l.state === 'OK') return false;
      if (state && state !== 'attention' && l.state !== state) return false;
      if (!needle) return true;
      return l.ingredient.name.toLowerCase().includes(needle);
    });
  }, [levels, search, state]);

  const counts = useMemo(() => ({
    out: levels.filter((l) => l.state === 'OUT').length,
    critical: levels.filter((l) => l.state === 'CRITICAL').length,
    low: levels.filter((l) => l.state === 'LOW').length,
  }), [levels]);

  async function rebuild() {
    if (!storeId) return;
    setRebuilding(true);
    try {
      const result = await InventoryService.rebuild(storeId, session ?? null);
      reload();
      toast.success(
        'Recomputed from the ledger',
        `${result.updated} levels rebuilt. Any difference was a stale cache, not lost stock.`,
      );
    } catch (e) {
      toast.error('Could not rebuild', (e as Error).message);
    } finally {
      setRebuilding(false);
    }
  }

  const columns: Column<LevelRow>[] = [
    {
      key: 'name',
      header: 'Ingredient',
      sortBy: (l) => l.ingredient.name,
      render: (l) => (
        <div className="min-w-0">
          <span className="block truncate text-sm">{l.ingredient.name}</span>
          <span className="block text-[11px] lowercase text-faint">{l.ingredient.category.toLowerCase()}</span>
        </div>
      ),
    },
    {
      key: 'onHand',
      header: 'On hand',
      align: 'right',
      width: '120px',
      sortBy: (l) => l.onHand,
      render: (l) => (
        <span className={`tnum font-mono text-sm ${l.state === 'OUT' || l.state === 'CRITICAL' ? 'text-status-alert' : ''}`}>
          {formatBaseQty(l.onHand, l.ingredient.unit)}
        </span>
      ),
    },
    {
      key: 'thresholds',
      header: 'Min / reorder',
      align: 'right',
      width: '140px',
      secondary: true,
      // Formatted the same way as on-hand above it. Showing "718 g" beside a
      // bare "1795" makes the reader do the unit conversion themselves.
      render: (l) => (
        <span className="tnum font-mono text-xs text-faint">
          {formatBaseQty(l.minStock, l.ingredient.unit)} / {formatBaseQty(l.reorderLevel, l.ingredient.unit)}
        </span>
      ),
    },
    {
      key: 'cover',
      header: 'Cover',
      width: '120px',
      // A bar reads faster than a percentage when scanning forty rows for the
      // ones that need attention.
      render: (l) => {
        const pct = l.targetStock > 0 ? Math.min(100, Math.round((l.onHand / l.targetStock) * 100)) : 0;
        const colour = l.state === 'OUT' || l.state === 'CRITICAL' ? 'bg-status-alert'
          : l.state === 'LOW' ? 'bg-status-new' : 'bg-status-ready';
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-14 rounded-full bg-sunk">
              <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="tnum font-mono text-[11px] text-faint">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      width: '110px',
      secondary: true,
      sortBy: (l) => l.valueMinor,
      render: (l) => <span className="tnum font-mono text-xs text-muted">{formatMoney(l.valueMinor)}</span>,
    },
    {
      key: 'state',
      header: 'Status',
      width: '130px',
      sortBy: (l) => ({ OUT: 0, CRITICAL: 1, LOW: 2, OK: 3 })[l.state],
      render: (l) => (l.state === 'OK' ? null : <Badge tone={STATE_TONE[l.state]}>{STATE_LABEL[l.state]}</Badge>),
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      render: (l) => (
        canAdjust ? (
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setMoving(l); }}>
            Record
          </Button>
        ) : null
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Stock" />
        <ErrorState title="Not your call" message="Seeing stock needs the inventory permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Stock"
        description="What is on the shelf at this store, right now. Switch stores in the header — these numbers are never combined."
        actions={
          canAdjust ? (
            <Button size="sm" variant="secondary" onClick={() => void rebuild()} disabled={rebuilding}>
              {rebuilding ? 'Recomputing…' : 'Rebuild from ledger'}
            </Button>
          ) : undefined
        }
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <div className="mb-4">
            <StatRow>
              <StatTile
                label="Stock value"
                value={formatMoney(data?.valuation.totalMinor ?? 0)}
                hint="at cost"
              />
              <StatTile
                label="Out of stock"
                value={counts.out}
                tone={counts.out > 0 ? 'alert' : 'default'}
                hint={counts.out > 0 ? 'blocking sales' : 'nothing blocked'}
              />
              <StatTile
                label="Critical"
                value={counts.critical}
                tone={counts.critical > 0 ? 'alert' : 'default'}
                hint="below minimum"
              />
              <StatTile label="Low" value={counts.low} hint="below reorder point" />
            </StatRow>
          </div>

          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search ingredients" />
            <FilterSelect
              label="Status"
              value={state}
              onChange={setState}
              allLabel="Everything"
              options={[
                { value: 'attention', label: 'Needs attention' },
                { value: 'OUT', label: 'Out of stock' },
                { value: 'CRITICAL', label: 'Critical' },
                { value: 'LOW', label: 'Low' },
                { value: 'OK', label: 'Fine' },
              ]}
            />
          </Toolbar>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(l) => l.ingredientId}
            onRowClick={canAdjust ? setMoving : undefined}
            defaultSort={{ key: 'state', direction: 'asc' }}
            empty={<EmptyState title="Nothing matches" hint="Try clearing the status filter." />}
          />
        </>
      )}

      <StockMovementSheet
        open={moving !== null}
        storeId={storeId ?? ''}
        ingredient={moving?.ingredient ?? null}
        level={moving}
        onClose={() => setMoving(null)}
        onSaved={reload}
      />
    </div>
  );
}
