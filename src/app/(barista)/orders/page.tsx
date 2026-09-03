'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui';
import { CupLabelSheet } from '@/components/pos/cup-label-sheet';
import { OrderCard } from '@/components/pos/order-card';
import { compareForQueue, MILESTONE_LABEL, WORKFLOW_STAGES, workflowStage, type WorkflowStage } from '@/lib/order-state';
import { useOrders } from '@/hooks/use-orders';
import { useScannerInput } from '@/hooks/use-scanner';
import { useCurrentStore } from '@/hooks/use-store-context';
import { CupRepository } from '@/repositories';
import { lastRecordFor, OrderService, QrService } from '@/services';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { CupToken, Order } from '@/types';

const FLASH_MS = 5000;

/**
 * The Order Tracking Screen.
 *
 * Four columns, left to right in the direction work actually moves: an app or
 * counter order lands as Received, a barista's tap turns it into Accepted and
 * mints its cup QR, and from there the scanner — not the barista's finger —
 * carries it through Preparing to Completed. The button on every card past
 * Accepted is a fallback, not the main path; scanning the cup anywhere on
 * this screen does the same thing and is what a rush should actually run on.
 */
export default function BoardPage() {
  const session = useSession((s) => s.session);
  const store = useCurrentStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [cups, setCups] = useState<Map<string, CupToken>>(new Map());
  const [flash, setFlash] = useState<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const { orders } = useOrders({ storeId: session?.storeId, statuses: ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'HANDED_OVER', 'COMPLETED'] });

  const sla = store?.prepSlaMinutes ?? 6;

  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) {
      setCups(new Map());
      return;
    }
    void CupRepository.byOrderIds(ids).then(setCups);
  }, [orders]);

  const markScanned = useCallback((orderId: string) => {
    setFlashedIds((prev) => new Set(prev).add(orderId));
    setFlash((prev) => {
      const existing = prev.get(orderId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setFlashedIds((f) => {
          const next = new Set(f);
          next.delete(orderId);
          return next;
        });
      }, FLASH_MS);
      return new Map(prev).set(orderId, timer);
    });
  }, []);

  useEffect(() => () => flash.forEach((t) => clearTimeout(t)), [flash]);

  /** The fallback button on a card — a plain state push, no scan involved. */
  const advance = async (order: Order) => {
    if (!session) return;
    setBusyId(order.id);
    try {
      const { order: updated, milestone } = await OrderService.advance(order, session);
      if (milestone === 'ACCEPTED') {
        setPrintOrder(updated);
        const billRecord = lastRecordFor(updated, 'INVOICE_GENERATED');
        toast.success(
          `${order.orderNumber.split('-').pop()} — accepted`,
          billRecord?.status === 'SENT'
            ? `Bill sent via ${billRecord.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`
            : billRecord?.status === 'FAILED'
              ? 'Bill delivery failed — WhatsApp and SMS both rejected it'
              : undefined,
        );
      } else {
        toast.success(`${order.orderNumber.split('-').pop()} — ${MILESTONE_LABEL[milestone] ?? 'completed'}`);
      }
    } catch (error) {
      toast.error('That move was rejected', error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const handleScan = useCallback(
    async (raw: string) => {
      if (!session) return;
      const outcome = await QrService.resolve(raw);
      if ('error' in outcome) {
        toast.error('Scan not recognised', outcome.error);
        return;
      }
      const { order } = outcome;
      if (order.status === 'NEW') {
        toast.error('Not accepted yet', `${order.orderNumber} has no cup label — accept it first.`);
        return;
      }
      try {
        const { order: updated, milestone } = await OrderService.advance(order, session, { verifiedPickup: true });
        await CupRepository.recordScan(updated.cupId!, session.user.id, milestone);
        markScanned(order.id);
        // Reflect the scan on the card immediately — the next ORDERS_CHANGED
        // refresh would otherwise show a stale "no scans yet" for a beat.
        const scannedCup = await CupRepository.byCupId(updated.cupId!);
        if (scannedCup) setCups((prev) => new Map(prev).set(order.id, scannedCup));
        toast.success(`${updated.orderNumber.split('-').pop()} — ${MILESTONE_LABEL[milestone] ?? 'completed'}`, 'Scanned');
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(40);
      } catch (error) {
        toast.error('Scan rejected', error instanceof Error ? error.message : undefined);
      }
    },
    [session, markScanned],
  );

  useScannerInput(handleScan, !!session);

  const ordersForStage = (stage: WorkflowStage) => {
    const list = orders.filter((o) => workflowStage(o.status) === stage);
    if (stage === 'COMPLETED') {
      const cutoff = Date.now() - 20 * 60_000;
      return list.filter((o) => (o.completedAt ? new Date(o.completedAt).getTime() >= cutoff : false)).sort((a, b) => (b.completedAt! < a.completedAt! ? -1 : 1));
    }
    return list.sort((a, b) => compareForQueue(a, b, sla));
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-px bg-line md:grid-cols-4">
      {WORKFLOW_STAGES.map((column) => {
        const list = ordersForStage(column.key);
        return (
          <section key={column.key} className="flex min-h-0 flex-col bg-paper">
            <header className="flex items-baseline justify-between border-b border-line bg-surface px-4 py-3">
              <div>
                <h2 className="font-display text-base leading-none">{column.title}</h2>
                <p className="mt-1 text-[11px] text-faint">{column.hint}</p>
              </div>
              <span className="tnum font-mono text-2xl font-bold leading-none">{list.length}</span>
            </header>

            <div className="scroll-y min-h-0 flex-1 space-y-2 p-3">
              {list.length === 0 ? (
                <EmptyState
                  title={
                    column.key === 'RECEIVED'
                      ? 'No orders waiting'
                      : column.key === 'ACCEPTED'
                        ? 'Nothing to label'
                        : column.key === 'PREPARING'
                          ? 'Bar is clear'
                          : 'Nothing completed recently'
                  }
                  hint={column.key === 'RECEIVED' ? 'App orders land here the moment they are paid.' : undefined}
                />
              ) : (
                list.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    slaMinutes={sla}
                    cup={cups.get(order.id)}
                    justScanned={flashedIds.has(order.id)}
                    onAdvance={column.key === 'COMPLETED' ? undefined : (o) => void advance(o)}
                    onPrint={column.key === 'COMPLETED' ? undefined : (o) => setPrintOrder(o)}
                    busy={busyId === order.id}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}

      <CupLabelSheet order={printOrder} onClose={() => setPrintOrder(null)} />
    </div>
  );
}
