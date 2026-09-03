'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable, EmptyState, Select } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useCatalog } from '@/hooks/use-catalog';
import { formatDateTime, formatQty } from '@/lib/format';
import { InventoryRepository } from '@/repositories';
import { bus, EVENTS } from '@/services';
import { useSession } from '@/stores/session-store';
import type { InventoryTransaction, InventoryTxnType } from '@/types';

const TYPES: InventoryTxnType[] = [
  'PURCHASE',
  'SALE',
  'WASTE',
  'SPOILAGE',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN',
  'STOCK_COUNT',
];

/** The ledger. Append-only by design: a wrong entry is corrected by another entry. */
export default function TransactionsPage() {
  const { ingredientById } = useCatalog();
  const session = useSession((s) => s.session);
  const [txns, setTxns] = useState<InventoryTransaction[]>([]);
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setTxns(await InventoryRepository.transactions(session.storeId, 400));
  }, [session]);

  useEffect(() => {
    void load();
    return bus.on(EVENTS.INVENTORY_CHANGED, () => void load());
  }, [load]);

  const rows = txns.filter((t) => !type || t.type === type);

  const columns: Column<InventoryTransaction>[] = [
    { key: 'at', header: 'When', width: '160px', render: (t) => <span className="text-xs text-muted">{formatDateTime(t.createdAt)}</span> },
    { key: 'ing', header: 'Ingredient', render: (t) => <span className="text-sm">{ingredientById.get(t.ingredientId)?.name ?? t.ingredientId}</span> },
    { key: 'type', header: 'Movement', width: '130px', render: (t) => <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.type.replace('_', ' ').toLowerCase()}</span> },
    {
      key: 'qty',
      header: 'Change',
      align: 'right',
      width: '120px',
      render: (t) => {
        const ing = ingredientById.get(t.ingredientId);
        return (
          <span className={`tnum font-mono text-sm font-bold ${t.qty < 0 ? 'text-status-alert' : 'text-status-ready'}`}>
            {t.qty > 0 ? '+' : ''}
            {ing ? formatQty(t.qty, ing.unit) : t.qty}
          </span>
        );
      },
    },
    { key: 'why', header: 'Reason', render: (t) => <span className="text-xs text-muted">{t.reason ?? '—'}</span> },
    { key: 'who', header: 'By', width: '140px', render: (t) => <span className="text-xs text-muted">{t.userName}</span> },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Stock transactions"
        description="Every movement at this store, newest first. Sales post automatically the moment a drink starts being made."
        actions={
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-48">
            <option value="">Every movement</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </Select>
        }
      />
      <DataTable rows={rows} columns={columns} rowKey={(t) => t.id} empty={<EmptyState title="No movements recorded" />} />
    </div>
  );
}
