'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Stat } from '@/components/admin/page-header';
import { DataTable, EmptyState, Select } from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDateTime, formatMoney } from '@/lib/format';
import { OrderRepository, PaymentRepository } from '@/repositories';
import { useSession } from '@/stores/session-store';
import type { Payment, PaymentStatus } from '@/types';

const STATUS_TONE: Record<PaymentStatus, string> = {
  PAID: 'text-status-ready',
  PENDING: 'text-status-new',
  FAILED: 'text-status-alert',
  REFUNDED: 'text-muted',
  PARTIALLY_REFUNDED: 'text-muted',
};

const PROVIDER_LABEL: Record<string, string> = {
  RAZORPAY: 'Razorpay',
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  OTHER: 'Other',
};

interface Row extends Payment {
  orderNumber: string;
}

/**
 * Payments.
 *
 * Cash is a payment record too. Keeping every tender in one table is what lets
 * the till, the gateway settlement and the sales report be reconciled against a
 * single source instead of three.
 */
export default function PaymentsPage() {
  const session = useSession((s) => s.session);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [numbers, setNumbers] = useState<Map<string, string>>(new Map());
  const [provider, setProvider] = useState('');

  useEffect(() => {
    if (!session) return;
    void PaymentRepository.all(session.storeId).then(setPayments);
    void OrderRepository.all().then((orders) => setNumbers(new Map(orders.map((o) => [o.id, o.orderNumber]))));
  }, [session]);

  const rows = useMemo<Row[]>(
    () =>
      payments
        .filter((p) => !provider || p.provider === provider)
        .map((p) => ({ ...p, orderNumber: numbers.get(p.orderId) ?? '—' }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [payments, provider, numbers],
  );

  const paid = rows.filter((p) => p.status === 'PAID');
  const failed = rows.filter((p) => p.status === 'FAILED');

  const columns: Column<Row>[] = [
    { key: 'at', header: 'When', width: '160px', render: (p) => <span className="text-xs text-muted">{formatDateTime(p.createdAt)}</span> },
    { key: 'order', header: 'Order', width: '180px', render: (p) => <span className="tnum font-mono text-xs">{p.orderNumber}</span> },
    { key: 'provider', header: 'Method', width: '110px', render: (p) => <span className="text-xs font-semibold">{PROVIDER_LABEL[p.provider]}</span> },
    {
      key: 'ref',
      header: 'Reference',
      render: (p) => (
        <span className="tnum font-mono text-[11px] text-faint">
          {p.razorpayPaymentId ?? (p.provider === 'CASH' && p.tenderedMinor ? `tendered ${formatMoney(p.tenderedMinor)}` : '—')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      render: (p) => (
        <span className={`text-[11px] font-bold uppercase tracking-wider ${STATUS_TONE[p.status]}`}>
          {p.status.replace('_', ' ').toLowerCase()}
        </span>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', width: '120px', render: (p) => <span className="tnum font-mono text-sm font-bold">{formatMoney(p.amountMinor)}</span> },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Payments"
        description="Every tender taken at this store, cash included. Razorpay references are what a settlement report is matched against."
        actions={
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-44">
            <option value="">Every method</option>
            <option value="CASH">Cash</option>
            <option value="RAZORPAY">Razorpay</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
          </Select>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Captured" value={formatMoney(paid.reduce((s, p) => s + p.amountMinor, 0))} sub={`${paid.length} payments`} />
        <Stat label="Failed" value={String(failed.length)} tone={failed.length ? 'alert' : 'good'} sub="the customer was not charged" />
        <Stat
          label="Cash share"
          value={`${rows.length ? Math.round((rows.filter((p) => p.provider === 'CASH').length / rows.length) * 100) : 0}%`}
          sub="of payments by count"
        />
      </div>

      <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} empty={<EmptyState title="No payments recorded" />} />
    </div>
  );
}
