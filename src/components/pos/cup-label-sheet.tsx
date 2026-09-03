'use client';

import { useEffect, useState } from 'react';
import { Button, Sheet } from '@/components/ui';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { CupRepository, PaymentRepository } from '@/repositories';
import { InvoiceService, lastRecordFor, PrintService, QrService } from '@/services';
import { toast } from '@/stores/toast-store';
import type { CupToken, Invoice, Order, OrderItem } from '@/types';

/** One physical cup — an order line's qty of 2 becomes two of these. */
interface CupLabel {
  key: string;
  item: OrderItem;
  index: number;
}

function expandToLabels(items: OrderItem[]): CupLabel[] {
  const labels: CupLabel[] = [];
  items.forEach((item) => {
    for (let i = 0; i < item.qty; i++) {
      labels.push({ key: `${item.id}-${i}`, item, index: labels.length + 1 });
    }
  });
  return labels;
}

/**
 * The cup label — and the bill next to it.
 *
 * Printed once per order and stuck on the cup: the order's last four digits
 * large enough to call across a counter, the name, and the QR that every
 * later step scans. Beside it sits the exact bill that already went out to
 * the customer — same invoice, same link — so a barista can see what was
 * actually delivered without hunting through the order's detail page.
 */
export function CupLabelSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const [cup, setCup] = useState<CupToken | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [resending, setResending] = useState(false);
  /** Which label is mid-print — a cup key, or 'all'. Disables just that button, not the whole sheet. */
  const [printingKey, setPrintingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!order) {
      setCup(null);
      setQr(null);
      setInvoice(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = order.cupId ? await CupRepository.byCupId(order.cupId) : await QrService.issueForOrder(order);
      if (!token || cancelled) return;
      const dataUrl = await QrService.dataUrl(token);
      if (cancelled) return;
      setCup(token);
      setQr(dataUrl);
    })();
    void (async () => {
      const inv = order.invoiceId
        ? await PaymentRepository.invoiceById(order.invoiceId)
        : await PaymentRepository.invoiceByOrderId(order.id);
      if (!cancelled) setInvoice(inv ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  if (!order) return null;

  const billRecord = lastRecordFor(order, 'INVOICE_GENERATED');
  const resendBill = async () => {
    setResending(true);
    try {
      const { invoice: updated, record } = await InvoiceService.send(order);
      setInvoice(updated);
      if (updated.deliveryStatus === 'SENT') {
        toast.success(`Bill sent via ${record?.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`);
      } else {
        toast.error('WhatsApp and SMS both failed', record?.detail);
      }
    } finally {
      setResending(false);
    }
  };

  const itemSummary = order.items.map((i) => `${i.qty}× ${i.spec}`).join(' · ');
  const labels = expandToLabels(order.items);

  /** One physical cup, one print job — printing label N never touches N's neighbours. */
  const printOne = async (label: CupLabel): Promise<boolean> => {
    if (!cup || !qr) return false;
    const modifierNames = label.item.modifiers.map((m) => m.name).join(', ');
    const result = await PrintService.print({
      kind: 'CUP_LABEL',
      cupId: cup.cupId,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      drinkName: label.item.spec,
      drinkDetail: [modifierNames, label.item.note].filter(Boolean).join(' — '),
      sequenceLabel: labels.length > 1 ? `${label.index} of ${labels.length}` : '',
      placedAtDate: formatDate(order.placedAt),
      placedAtTime: formatTime(order.placedAt),
      qrDataUrl: qr,
    });
    if (result.ok) {
      await CupRepository.recordPrint(cup.cupId);
    } else {
      toast.error(`Label ${label.index} of ${labels.length} did not print`, result.error);
    }
    return result.ok;
  };

  /**
   * Printing is per-cup only, deliberately — there is no "print all" button.
   * A browser only reliably allows a popup window it can trace straight back
   * to the click that opened it; a loop that opens a second and third after
   * an await in between reads as script-driven spam to the popup blocker,
   * and silently loses labels past the first. One click, one window, every
   * time sidesteps that entirely.
   */
  const printSingle = async (label: CupLabel) => {
    setPrintingKey(label.key);
    try {
      if (await printOne(label)) toast.success(`Label ${label.index} sent to ${PrintService.adapter().label}`);
    } finally {
      setPrintingKey(null);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      width="lg"
      title={`Order ${order.orderNumber.split('-').pop()} is in`}
      subtitle={`${order.orderNumber} · ${formatMoney(order.totalMinor)} paid`}
      footer={
        <Button variant="primary" size="lg" block onClick={onClose}>
          Move to next order
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full items-start gap-4 rounded-md border border-line bg-surface p-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR for cup ${cup?.cupId}`} className="h-28 w-28 shrink-0" />
            ) : (
              <div className="h-28 w-28 shrink-0 animate-pulse rounded bg-sunk" />
            )}
            <div className="min-w-0">
              <p className="tnum font-mono text-2xl font-bold leading-none">{order.orderNumber.split('-').pop()}</p>
              <p className="mt-1 truncate text-sm font-semibold">{order.customerName}</p>
              <p className="tnum mt-1 font-mono text-[11px] text-faint">{cup?.cupId ?? '…'}</p>
              <p className="mt-2 border-t border-line pt-2 text-[11px] leading-tight text-muted">{itemSummary}</p>
            </div>
          </div>

          <div className="w-full rounded-md border border-line bg-surface p-3">
            <p className="eyebrow mb-2">{labels.length > 1 ? `${labels.length} labels — one per cup` : '1 label'}</p>
            <ul className="space-y-1.5 text-xs">
              {labels.map((label) => (
                <li key={label.key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="truncate">{label.item.spec}</span>
                    {labels.length > 1 ? (
                      <span className="tnum ml-1.5 font-mono text-[10px] text-faint">{label.index} of {labels.length}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={!qr || printingKey !== null}
                    onClick={() => void printSingle(label)}
                    className="shrink-0 rounded border border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-wider
                      text-muted hover:bg-sunk hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {printingKey === label.key ? 'Printing…' : 'Print'}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="max-w-sm text-center text-xs text-muted">
            {labels.length > 1
              ? 'Each cup gets its own label with the same QR — one scan releases the whole order.'
              : 'Stick this on the cup. Every step after this — start, ready, hand over — is one scan of that code.'}
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">The bill</p>
            {billRecord ? (
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  billRecord.status === 'SENT' ? 'text-status-ready' : billRecord.status === 'FAILED' ? 'text-status-alert' : 'text-faint'
                }`}
              >
                {billRecord.status === 'SENT'
                  ? `Sent · ${billRecord.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`
                  : billRecord.status === 'FAILED'
                    ? 'Delivery failed'
                    : 'Not sent'}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-faint">
            This is the exact bill {order.customerPhone ? `sent to ${order.customerPhone}` : 'that would be sent'} — same link, same numbers.
          </p>

          {invoice ? (
            <>
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between text-muted">
                  <dt>Invoice</dt>
                  <dd className="tnum font-mono text-xs">{invoice.invoiceNumber}</dd>
                </div>
                <div className="flex justify-between text-muted">
                  <dt>Subtotal</dt>
                  <dd className="tnum font-mono">{formatMoney(invoice.subtotalMinor)}</dd>
                </div>
                {invoice.discountMinor > 0 ? (
                  <div className="flex justify-between text-status-alert">
                    <dt>Discount</dt>
                    <dd className="tnum font-mono">−{formatMoney(invoice.discountMinor)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-muted">
                  <dt>GST</dt>
                  <dd className="tnum font-mono">{formatMoney(invoice.taxMinor)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-1.5">
                  <dt className="font-display text-base">Total</dt>
                  <dd className="tnum font-mono text-lg font-bold">{formatMoney(invoice.totalMinor)}</dd>
                </div>
              </dl>

              {invoice.pdfUrl ? (
                <a
                  href={invoice.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block truncate rounded border border-dashed border-line px-2.5 py-1.5 text-[11px] text-gold-deep underline underline-offset-2"
                >
                  {invoice.pdfUrl}
                </a>
              ) : null}

              <div className="mt-3 flex gap-2">
                {invoice.pdfUrl ? (
                  <Button block variant="secondary" onClick={() => window.open(invoice.pdfUrl!, '_blank')}>
                    Open bill
                  </Button>
                ) : null}
                <Button block variant="ghost" disabled={resending} onClick={() => void resendBill()}>
                  {billRecord?.status === 'SENT' ? 'Resend' : 'Send'}
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-3 h-24 animate-pulse rounded bg-sunk" />
          )}
        </div>
      </div>
    </Sheet>
  );
}
