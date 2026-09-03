'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable, EmptyState, Input, PaymentPill, StatusPill } from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatMoney, formatTime } from '@/lib/format';
import { useOrders } from '@/hooks/use-orders';
import { useSession } from '@/stores/session-store';
import type { Order } from '@/types';

/**
 * Today at this store. Baristas get search and read access — enough to find a
 * cup someone is asking about, and nothing more.
 */
export default function HistoryPage() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const [search, setSearch] = useState('');
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { orders } = useOrders({ storeId: session?.storeId, search, from: startOfDay, limit: 200 });

  const columns: Column<Order>[] = [
    { key: 'no', header: 'Order', width: '110px', render: (o) => <span className="tnum font-mono font-bold">{o.orderNumber.split('-').pop()}</span> },
    { key: 'time', header: 'Placed', width: '100px', render: (o) => <span className="tnum font-mono text-xs text-muted">{formatTime(o.placedAt)}</span> },
    { key: 'customer', header: 'Customer', render: (o) => <span className="text-sm">{o.customerName}</span> },
    { key: 'items', header: 'Items', render: (o) => <span className="text-xs text-muted">{o.items.map((i) => `${i.qty}× ${i.spec}`).join(', ')}</span> },
    { key: 'status', header: 'Status', width: '130px', render: (o) => <StatusPill status={o.status} /> },
    { key: 'pay', header: 'Payment', width: '130px', render: (o) => <PaymentPill status={o.paymentStatus} provider={o.paymentProvider} /> },
    { key: 'total', header: 'Total', align: 'right', width: '100px', render: (o) => <span className="tnum font-mono text-sm">{formatMoney(o.totalMinor)}</span> },
  ];

  return (
    <div className="scroll-y h-full p-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl leading-none">Today</h1>
          <p className="mt-1 text-sm text-muted">{orders.length} orders through this store since midnight.</p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order number, name, phone or cup ID"
          className="w-full max-w-xs"
        />
      </header>

      <DataTable
        rows={orders}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/orders/${o.id}`)}
        empty={<EmptyState title="No orders yet today" hint="Sales appear here the moment they are charged." />}
      />
    </div>
  );
}
