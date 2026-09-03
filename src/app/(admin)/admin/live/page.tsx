'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import { EmptyState, Elapsed, SourceTag, StatusPill } from '@/components/ui';
import { compareForQueue, orderClockStart } from '@/lib/order-state';
import { formatMoney } from '@/lib/format';
import { useOrders } from '@/hooks/use-orders';
import { useSession } from '@/stores/session-store';
import { useCatalog } from '@/hooks/use-catalog';

/** A read-only view of the same board the bar is working. Admins watch; baristas act. */
export default function LiveOrdersPage() {
  const { storeById } = useCatalog();
  const session = useSession((s) => s.session);
  const store = session ? storeById.get(session.storeId) : null;
  const sla = store?.prepSlaMinutes ?? 6;
  const { orders } = useOrders({ storeId: session?.storeId, statuses: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] });
  const sorted = [...orders].sort((a, b) => compareForQueue(a, b, sla));

  return (
    <div className="p-6">
      <PageHeader
        title="Live orders"
        description={`Anything open at ${store?.name}. Rows are ordered the way the bar should work them: late first, then promised pickups, then oldest.`}
      />

      {sorted.length === 0 ? (
        <EmptyState title="Nothing open" hint="Every order at this store has been handed over." />
      ) : (
        <div className="space-y-2">
          {sorted.map((order) => (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}`}
              className="flex items-center gap-4 rounded-md border border-line bg-surface px-4 py-3 hover:border-ink"
            >
              <span className="tnum w-14 shrink-0 font-mono text-xl font-bold">{order.orderNumber.split('-').pop()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{order.customerName}</p>
                <p className="truncate text-xs text-muted">{order.items.map((i) => `${i.qty}× ${i.spec}`).join(', ')}</p>
              </div>
              <SourceTag source={order.source} />
              <StatusPill status={order.status} />
              <span className="tnum w-24 text-right font-mono text-sm">{formatMoney(order.totalMinor)}</span>
              <Elapsed since={orderClockStart(order)} slaMinutes={sla} showBar={false} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
