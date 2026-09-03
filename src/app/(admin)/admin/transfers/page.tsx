'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { Button, EmptyState } from '@/components/ui';
import { formatDateTime, formatQty } from '@/lib/format';
import { InventoryRepository } from '@/repositories';
import { InventoryService } from '@/services';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { InventoryTransfer, TransferStatus } from '@/types';
import { useCatalog } from '@/hooks/use-catalog';
import { useStaff } from '@/hooks/use-staff';

const FLOW: TransferStatus[] = ['REQUESTED', 'APPROVED', 'DISPATCHED', 'RECEIVED'];

const TONE: Record<TransferStatus, string> = {
  REQUESTED: 'bg-newSoft text-status-new',
  APPROVED: 'bg-prepSoft text-status-prep',
  DISPATCHED: 'bg-prepSoft text-status-prep',
  RECEIVED: 'bg-readySoft text-status-ready',
  CANCELLED: 'bg-sunk text-muted',
};

/**
 * Stock moving between stores.
 *
 * Nothing leaves one store's ledger until it is dispatched, and nothing joins
 * another's until someone at the receiving end confirms it. Stock in transit
 * therefore belongs to neither — which is exactly what a physical van is.
 */
export default function TransfersPage() {
  const { ingredientById, storeById } = useCatalog();
  const { byId: staffById } = useStaff();
  const session = useSession((s) => s.session);
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => void InventoryRepository.transfers().then(setTransfers);
  useEffect(load, []);

  const advance = async (transfer: InventoryTransfer) => {
    if (!session) return;
    const index = FLOW.indexOf(transfer.status);
    const next = FLOW[index + 1];
    if (!next) return;
    setBusy(transfer.id);
    try {
      await InventoryService.advanceTransfer(transfer, next, session);
      toast.success(`${transfer.reference} — ${next.toLowerCase()}`);
      load();
    } catch (e) {
      toast.error('Could not update the transfer', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Transfers"
        description="Stock moving between stores. Dispatch removes it from the sending store; receiving adds it to the destination. In-transit stock is on neither ledger."
      />

      {transfers.length === 0 ? (
        <EmptyState title="No transfers" hint="Raise one when a store runs short mid-shift." />
      ) : (
        <div className="space-y-3">
          {transfers.map((transfer) => {
            const index = FLOW.indexOf(transfer.status);
            const next = FLOW[index + 1];
            return (
              <article key={transfer.id} className="rounded-md border border-line bg-surface p-4">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="tnum font-mono text-sm font-bold">{transfer.reference}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONE[transfer.status]}`}>
                        {transfer.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      {storeById.get(transfer.fromStoreId)?.name} → {storeById.get(transfer.toStoreId)?.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      Raised {formatDateTime(transfer.createdAt)} by {staffById.get(transfer.requestedBy)?.name ?? 'a colleague'}
                      {transfer.note ? ` · ${transfer.note}` : ''}
                    </p>
                  </div>
                  {next ? (
                    <Button size="sm" variant="primary" disabled={busy === transfer.id} onClick={() => void advance(transfer)}>
                      Mark {next.toLowerCase()}
                    </Button>
                  ) : null}
                </header>

                <ul className="mt-3 grid gap-1 border-t border-line pt-3 text-sm sm:grid-cols-2">
                  {transfer.items.map((item) => (
                    <li key={item.ingredientId} className="flex justify-between gap-3">
                      <span>{ingredientById.get(item.ingredientId)?.name ?? item.ingredientId}</span>
                      <span className="tnum font-mono text-xs text-muted">{formatQty(item.qty, item.unit)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
