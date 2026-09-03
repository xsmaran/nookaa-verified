'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Stat } from '@/components/admin/page-header';
import { DataTable, EmptyState, Input } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useCatalog } from '@/hooks/use-catalog';
import { formatDate, formatMoney, formatPhone } from '@/lib/format';
import { CustomerRepository } from '@/repositories';
import type { Customer } from '@/types';

/**
 * Customers.
 *
 * A phone number is the only identity a grab-and-go brand really has, so this
 * list is thin by design: enough to recognise a regular and reach them about
 * an order, and nothing that would be uncomfortable to hold.
 */
export default function CustomersPage() {
  const { productById, storeById } = useCatalog();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void CustomerRepository.all().then(setCustomers);
  }, []);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return customers
      .filter((c) => !needle || `${c.name} ${c.phone}`.toLowerCase().includes(needle))
      .sort((a, b) => b.totalSpendMinor - a.totalSpendMinor);
  }, [customers, search]);

  const repeat = customers.filter((c) => c.totalOrders > 1).length;

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Customer', render: (c) => <span className="text-sm font-semibold">{c.name}</span> },
    { key: 'phone', header: 'Phone', width: '160px', render: (c) => <span className="tnum font-mono text-xs text-muted">{formatPhone(c.phone)}</span> },
    { key: 'orders', header: 'Orders', align: 'right', width: '90px', render: (c) => <span className="tnum font-mono text-sm">{c.totalOrders}</span> },
    { key: 'spend', header: 'Lifetime spend', align: 'right', width: '140px', render: (c) => <span className="tnum font-mono text-sm font-bold">{formatMoney(c.totalSpendMinor)}</span> },
    {
      key: 'aov',
      header: 'Average',
      align: 'right',
      width: '110px',
      render: (c) => <span className="tnum font-mono text-xs text-muted">{formatMoney(c.totalOrders ? Math.round(c.totalSpendMinor / c.totalOrders) : 0)}</span>,
    },
    { key: 'fav', header: 'Usual', render: (c) => <span className="text-xs text-muted">{c.favouriteProductId ? productById.get(c.favouriteProductId)?.spec : '—'}</span> },
    { key: 'store', header: 'Home store', width: '150px', render: (c) => <span className="text-xs text-muted">{c.preferredStoreId ? storeById.get(c.preferredStoreId)?.code : '—'}</span> },
    { key: 'last', header: 'Last seen', width: '120px', render: (c) => <span className="text-xs text-muted">{c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}</span> },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Customers"
        description="Built from phone numbers taken at the counter and in the app. Sorted by lifetime spend."
        actions={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone" className="w-56" />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Known customers" value={String(customers.length)} />
        <Stat label="Came back" value={`${customers.length ? Math.round((repeat / customers.length) * 100) : 0}%`} sub={`${repeat} with more than one order`} />
        <Stat label="Lifetime value" value={formatMoney(customers.reduce((s, c) => s + c.totalSpendMinor, 0))} sub="across every store" />
      </div>

      <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} empty={<EmptyState title="No customers match" />} />
    </div>
  );
}
