'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, SearchInput, Sheet } from '@/components/ui';
import { formatQty } from '@/lib/format';
import { InventoryRepository, stockState } from '@/repositories';
import type { StockState } from '@/repositories';
import { bus, EVENTS, InventoryService } from '@/services';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { InventoryLevel } from '@/types';
import { useCatalog } from '@/hooks/use-catalog';

const TONE: Record<StockState, { label: string; className: string }> = {
  OUT: { label: 'Out', className: 'bg-alertSoft text-status-alert' },
  CRITICAL: { label: 'Critical', className: 'bg-alertSoft text-status-alert' },
  LOW: { label: 'Low', className: 'bg-newSoft text-status-new' },
  OK: { label: 'OK', className: 'bg-sunk text-muted' },
};

/**
 * What the bar can see: how much is left, and a way to log waste. Setting
 * levels, receiving stock and transfers all live in Admin — a barista should
 * not be able to make numbers move without a reason attached.
 */
export default function StockPage() {
  const { ingredientById, ingredients } = useCatalog();
  const session = useSession((s) => s.session);
  const [levels, setLevels] = useState<InventoryLevel[]>([]);
  const [wasting, setWasting] = useState<InventoryLevel | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLevels(await InventoryRepository.levels(session.storeId));
  }, [session]);

  useEffect(() => {
    void load();
    return bus.on(EVENTS.INVENTORY_CHANGED, () => void load());
  }, [load]);

  const sorted = [...levels].sort((a, b) => a.onHand / (a.targetStock || 1) - b.onHand / (b.targetStock || 1));
  const attention = sorted.filter((l) => stockState(l) !== 'OK');

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => (needle ? sorted.filter((l) => ingredientById.get(l.ingredientId)?.name.toLowerCase().includes(needle)) : sorted),
    [sorted, needle, ingredientById],
  );

  return (
    <div className="scroll-y h-full p-4">
      <header className="mb-4">
        <h1 className="font-display text-xl leading-none">Stock</h1>
        <p className="mt-1 text-sm text-muted">
          {attention.length === 0 ? 'Everything is above its reorder level.' : `${attention.length} items need attention.`}
        </p>
      </header>

      {levels.length === 0 ? (
        <EmptyState title="No stock records for this store" />
      ) : (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Search ingredients" className="mb-3 max-w-xs" />
          {visible.length === 0 ? (
            <EmptyState title="Nothing matches" hint="Try a different search." />
          ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((level) => {
            const ingredient = ingredientById.get(level.ingredientId);
            const state = stockState(level);
            if (!ingredient) return null;
            return (
              <article key={level.ingredientId} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{ingredient.name}</p>
                  <p className="tnum font-mono text-xs text-muted">
                    {formatQty(level.onHand, ingredient.unit)} of {formatQty(level.targetStock, ingredient.unit)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONE[state].className}`}>
                    {TONE[state].label}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setWasting(level)}>
                    Log waste
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
          )}
        </>
      )}

      <Sheet
        open={Boolean(wasting)}
        onClose={() => setWasting(null)}
        title={`Log waste — ${wasting ? ingredientById.get(wasting.ingredientId)?.name : ''}`}
        subtitle="Waste is a ledger entry, not an edit. It cannot be undone, only corrected with another entry."
        width="sm"
        footer={
          <Button
            block
            variant="primary"
            disabled={!qty || Number(qty) <= 0 || reason.trim().length < 3}
            onClick={async () => {
              if (!wasting || !session) return;
              await InventoryService.record({
                storeId: session.storeId,
                deviceId: session.deviceId,
                ingredientId: wasting.ingredientId,
                type: 'WASTE',
                qty: -Math.abs(Number(qty)),
                reason: reason.trim(),
                userId: session.user.id,
                userName: session.user.name,
              });
              toast.success('Waste logged');
              setWasting(null);
              setQty('');
              setReason('');
            }}
          >
            Log it
          </Button>
        }
      >
        <label className="eyebrow mb-1.5 block">
          Quantity ({wasting ? ingredients.find((i) => i.id === wasting.ingredientId)?.unit : ''})
        </label>
        <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="250" className="tnum font-mono" />
        <label className="eyebrow mb-1.5 mt-4 block">Reason</label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Milk steamed twice, drink remade" />
      </Sheet>
    </div>
  );
}
