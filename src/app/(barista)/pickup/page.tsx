'use client';

import { useState } from 'react';
import { EmptyState, PaymentPill, SourceTag } from '@/components/ui';
import { PickupVerification } from '@/components/pos/pickup-verification';
import { formatMoney, formatPhone, formatTime } from '@/lib/format';
import { orderClockStart } from '@/lib/order-state';
import { useOrders } from '@/hooks/use-orders';
import { useSession } from '@/stores/session-store';
import { OrderService } from '@/services';
import { toast } from '@/stores/toast-store';
import type { Order } from '@/types';

/**
 * Ready to pick.
 *
 * READY is a resting state only for app orders — a counter sale collapses
 * straight past it since the customer is standing right there. So every card
 * here is someone who paid ahead and hasn't shown up yet: scan their QR, or
 * take the code they read out, and the order is theirs.
 */
export default function PickupPage() {
  const session = useSession((s) => s.session);
  const { orders, reload } = useOrders({ storeId: session?.storeId, statuses: ['READY'] });
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = [...orders].sort((a, b) => orderClockStart(a) - orderClockStart(b));

  // A counter order should never actually rest here — advance() collapses it
  // straight through — but if one somehow does, it needs no customer proof.
  const handOver = async (order: Order) => {
    if (!session) return;
    setBusyId(order.id);
    try {
      await OrderService.advance(order, session);
      toast.success(`${order.orderNumber.split('-').pop()} — handed over`);
      await reload();
    } catch (e) {
      toast.error('That move was rejected', e instanceof Error ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="scroll-y h-full p-4">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-xl leading-none">Ready to pick</h1>
          <p className="mt-1 text-sm text-muted">Waiting on the customer — scan their QR, or take the code they read out, to release the order.</p>
        </div>
        <span className="tnum font-mono text-3xl font-bold">{list.length}</span>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="Nothing waiting on a customer"
          hint="App orders land here the moment the drink is ready — counter sales go straight to Completed."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((order) => (
            <article key={order.id} className="rounded-md border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="tnum font-mono text-xl font-bold leading-none">{order.orderNumber.split('-').pop()}</span>
                    <SourceTag source={order.source} />
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">{order.customerName}</p>
                  <p className="tnum font-mono text-[11px] text-faint">{formatPhone(order.customerPhone)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum font-mono text-sm font-bold">{formatMoney(order.totalMinor)}</p>
                  <p className="tnum text-[10px] text-faint">ready {formatTime(order.history[order.history.length - 1]?.at ?? order.placedAt)}</p>
                </div>
              </div>

              <ul className="mt-2 space-y-1 border-t border-line pt-2">
                {order.items.map((item) => (
                  <li key={item.id} className="flex gap-2 text-[13px] leading-tight">
                    <span className="tnum shrink-0 font-mono font-bold text-muted">{item.qty}×</span>
                    <span className="font-semibold uppercase tracking-wide">{item.spec}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                <PaymentPill status={order.paymentStatus} provider={order.paymentProvider} />
                {order.cupId ? <span className="tnum font-mono text-[10px] text-faint">{order.cupId}</span> : null}
              </div>

              <div className="mt-3">
                {order.source === 'APP' ? (
                  <PickupVerification order={order} session={session} onVerified={reload} />
                ) : (
                  <button
                    onClick={() => void handOver(order)}
                    disabled={busyId === order.id}
                    className="w-full rounded border border-line bg-surface py-2 text-[13px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
                  >
                    Hand over
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
