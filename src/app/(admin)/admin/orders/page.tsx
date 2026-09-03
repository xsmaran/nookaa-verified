'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable, EmptyState, Input, PaymentPill, Select, SourceTag, StatusPill } from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useOrders } from '@/hooks/use-orders';
import { useSession } from '@/stores/session-store';
import type { Order, OrderStatus } from '@/types';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Every status' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'REFUND_PENDING', label: 'Refund pending' },
  { value: 'FAILED', label: 'Failed' },
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState<'store' | 'all'>('store');

  const { orders } = useOrders({
    storeId: scope === 'store' ? session?.storeId : undefined,
    statuses: status ? [status as OrderStatus] : undefined,
    search,
    limit: 300,
  });

  const columns: Column<Order>[] = [
    { key: 'no', header: 'Order', width: '190px', render: (o) => <span className="tnum font-mono text-xs">{o.orderNumber}</span> },
    { key: 'when', header: 'Placed', width: '150px', render: (o) => <span className="text-xs text-muted">{formatDateTime(o.placedAt)}</span> },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <span>
          <span className="block text-sm">{o.customerName}</span>
          <span className="tnum block font-mono text-[11px] text-faint">{o.customerPhone ?? 'no phone'}</span>
        </span>
      ),
    },
    { key: 'items', header: 'Items', render: (o) => <span className="text-xs text-muted">{o.items.map((i) => `${i.qty}× ${i.spec}`).join(', ')}</span> },
    { key: 'source', header: 'Source', width: '90px', render: (o) => <SourceTag source={o.source} /> },
    { key: 'status', header: 'Status', width: '140px', render: (o) => <StatusPill status={o.status} /> },
    { key: 'pay', header: 'Payment', width: '150px', render: (o) => <PaymentPill status={o.paymentStatus} provider={o.paymentProvider} /> },
    { key: 'total', header: 'Total', align: 'right', width: '110px', render: (o) => <span className="tnum font-mono text-sm">{formatMoney(o.totalMinor)}</span> },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Orders"
        description="Every order ever taken, across sources and statuses. Financial records are never deleted — cancellations and refunds appear as their own rows in the history."
        actions={
          <div className="flex gap-2">
            <Select value={scope} onChange={(e) => setScope(e.target.value as 'store' | 'all')} className="w-40">
              <option value="store">This store</option>
              <option value="all">All stores</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, name, phone, cup" className="w-56" />
          </div>
        }
      />

      <DataTable
        rows={orders}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
        empty={<EmptyState title="No orders match those filters" hint="Widen the status filter or clear the search." />}
      />
    </div>
  );
}
