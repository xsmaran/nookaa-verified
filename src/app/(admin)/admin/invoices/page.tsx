'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Stat } from '@/components/admin/page-header';
import { Button, DataTable, EmptyState } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useCatalog } from '@/hooks/use-catalog';
import { formatDateTime, formatMoney } from '@/lib/format';
import { OrderRepository, PaymentRepository } from '@/repositories';
import { InvoiceService, PrintService } from '@/services';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Invoice } from '@/types';

const TONE: Record<Invoice['deliveryStatus'], string> = {
  SENT: 'text-status-ready',
  FAILED: 'text-status-alert',
  NO_PHONE: 'text-muted',
  NOT_SENT: 'text-muted',
};

interface Row extends Invoice {
  orderNumber: string;
}

export default function InvoicesPage() {
  const { storeById } = useCatalog();
  const session = useSession((s) => s.session);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [numbers, setNumbers] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setInvoices(await PaymentRepository.invoices(session.storeId));
    const orders = await OrderRepository.all();
    setNumbers(new Map(orders.map((o) => [o.id, o.orderNumber])));
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(
    () =>
      invoices
        .map((i) => ({ ...i, orderNumber: numbers.get(i.orderId) ?? '—' }))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    [invoices, numbers],
  );

  const resend = async (invoice: Invoice) => {
    const order = await OrderRepository.byId(invoice.orderId);
    if (!order) {
      toast.error('The order behind this invoice is missing');
      return;
    }
    setBusy(invoice.id);
    try {
      const { invoice: result, record } = await InvoiceService.send(order);
      if (result.deliveryStatus === 'SENT') toast.success(`Bill link resent by ${record?.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`);
      else if (result.deliveryStatus === 'NO_PHONE') toast.error('That order has no phone number on it');
      else toast.error('WhatsApp and SMS both failed', record?.detail ?? 'Try again, or print a copy for the customer.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const print = async (invoice: Invoice) => {
    const order = await OrderRepository.byId(invoice.orderId);
    if (!order) return;
    await PrintService.print({
      kind: 'RECEIPT',
      html: InvoiceService.renderHtml(order, invoice, storeById.get(invoice.storeId)?.name ?? 'NOOKAA'),
    });
  };

  const columns: Column<Row>[] = [
    { key: 'no', header: 'Invoice', width: '200px', render: (i) => <span className="tnum font-mono text-xs font-bold">{i.invoiceNumber}</span> },
    { key: 'at', header: 'Issued', width: '160px', render: (i) => <span className="text-xs text-muted">{formatDateTime(i.issuedAt)}</span> },
    { key: 'order', header: 'Order', width: '180px', render: (i) => <span className="tnum font-mono text-xs text-faint">{i.orderNumber}</span> },
    {
      key: 'delivery',
      header: 'Delivery',
      width: '140px',
      render: (i) => (
        <span className={`text-[11px] font-bold uppercase tracking-wider ${TONE[i.deliveryStatus]}`}>
          {i.deliveryStatus.replace('_', ' ').toLowerCase()}
        </span>
      ),
    },
    { key: 'tax', header: 'GST', align: 'right', width: '100px', render: (i) => <span className="tnum font-mono text-xs text-muted">{formatMoney(i.taxMinor)}</span> },
    { key: 'total', header: 'Total', align: 'right', width: '110px', render: (i) => <span className="tnum font-mono text-sm">{formatMoney(i.totalMinor)}</span> },
    {
      key: 'actions',
      header: '',
      width: '180px',
      align: 'right',
      render: (i) => (
        <span className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => void resend(i)}>
            Resend
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void print(i)}>
            Print
          </Button>
        </span>
      ),
    },
  ];

  const sent = invoices.filter((i) => i.deliveryStatus === 'SENT').length;

  return (
    <div className="p-6">
      <PageHeader
        title="Invoices"
        description="Invoice numbers are gapless per store per financial year — a GST requirement, and the reason numbers are issued centrally and never by a till."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Issued" value={String(invoices.length)} />
        <Stat
          label="Bill delivered"
          value={`${invoices.length ? Math.round((sent / invoices.length) * 100) : 0}%`}
          sub={`${sent} of ${invoices.length} · WhatsApp, or SMS if that fails`}
        />
        <Stat
          label="Failed delivery"
          value={String(invoices.filter((i) => i.deliveryStatus === 'FAILED').length)}
          tone={invoices.some((i) => i.deliveryStatus === 'FAILED') ? 'alert' : 'good'}
          sub="resend, or print a copy"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(i) => i.id}
        empty={<EmptyState title="No invoices issued yet" hint="An invoice is raised the moment an order is handed over." />}
      />
    </div>
  );
}
