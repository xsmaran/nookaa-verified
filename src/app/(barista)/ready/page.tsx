'use client';

import { OrderCard } from '@/components/pos/order-card';
import { EmptyState } from '@/components/ui';
import { useOrders } from '@/hooks/use-orders';
import { useCurrentStore } from '@/hooks/use-store-context';
import { useSession } from '@/stores/session-store';
import type { Order } from '@/types';

const WINDOW_MINUTES = 30;

/**
 * The pickup screen.
 *
 * In a grab-and-go counter there is no separate hand-over step: the second
 * scan on the cup completes the order the moment the drink leaves the bar.
 * This screen exists purely as a confirmation display — big enough for a
 * customer to glance at and see their name land here — of what finished in
 * the last half hour. There is nothing left to tap.
 */
export default function ReadyPage() {
  const session = useSession((s) => s.session);
  const store = useCurrentStore();
  const { orders } = useOrders({ storeId: session?.storeId, statuses: ['COMPLETED'] });
  const sla = store?.prepSlaMinutes ?? 6;

  const cutoff = Date.now() - WINDOW_MINUTES * 60_000;
  const list = orders
    .filter((o): o is Order & { completedAt: string } => !!o.completedAt && new Date(o.completedAt).getTime() >= cutoff)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

  return (
    <div className="scroll-y h-full p-4">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-xl leading-none">Completed</h1>
          <p className="mt-1 text-sm text-muted">Picked up in the last {WINDOW_MINUTES} minutes — scan a cup twice and it lands here on its own.</p>
        </div>
        <span className="tnum font-mono text-3xl font-bold">{list.length}</span>
      </header>

      {list.length === 0 ? (
        <EmptyState title="Nothing completed yet" hint="Orders appear here the moment the second scan closes them out." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((order) => (
            <OrderCard key={order.id} order={order} slaMinutes={sla} />
          ))}
        </div>
      )}
    </div>
  );
}
