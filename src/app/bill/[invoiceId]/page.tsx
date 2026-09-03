'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui';
import { formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { catalog } from '@/repositories/catalog-cache';
import { OrderRepository, PaymentRepository } from '@/repositories';
import { toast } from '@/stores/toast-store';
import type { Invoice, Order } from '@/types';

/**
 * The bill, as the customer sees it.
 *
 * This is what the WhatsApp/SMS message actually links to — never a PDF
 * attachment. It renders the same numbers the counter charged, and the two
 * actions here (download, share) are the customer's own, not something a
 * barista has to prepare ahead of time. Public: no PIN, no store chrome, just
 * the bill.
 */
export default function BillPage() {
  const params = useParams<{ invoiceId: string }>();
  const [state, setState] = useState<'loading' | 'ready' | 'not-found'>('loading');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const invoiceId = params?.invoiceId;
    if (!invoiceId) return;
    let cancelled = false;
    void (async () => {
      const inv = await PaymentRepository.invoiceById(invoiceId);
      if (!inv) {
        if (!cancelled) setState('not-found');
        return;
      }
      const ord = await OrderRepository.byId(inv.orderId);
      if (cancelled) return;
      if (!ord) {
        setState('not-found');
        return;
      }
      setInvoice(inv);
      setOrder(ord);
      setState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [params?.invoiceId]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Loading your bill…</main>
    );
  }

  if (state === 'not-found' || !invoice || !order) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-paper px-6 text-center">
        <p className="font-display text-xl">This bill link doesn't work</p>
        <p className="max-w-xs text-sm text-muted">It may have expired, or the link was copied incorrectly. Contact the store you ordered from.</p>
      </main>
    );
  }

  const store = order.storeId ? catalog().storeById.get(order.storeId) : null;

  const download = () => window.print();

  const share = async () => {
    const url = window.location.href;
    const title = `NOOKAA bill ${invoice.invoiceNumber}`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text: title, url });
      } catch {
        /* the customer cancelled the share sheet — not an error */
      }
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
      return;
    }
    toast.error('Sharing is not supported on this browser', 'Copy the link from the address bar instead.');
  };

  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="no-print mb-4 flex gap-2">
          <Button block variant="primary" onClick={download}>
            Download PDF
          </Button>
          <Button block variant="secondary" onClick={() => void share()}>
            Share
          </Button>
        </div>
        <p className="no-print mb-6 text-center text-[11px] text-faint">
          "Download PDF" opens your browser's print dialog — choose "Save as PDF" as the destination.
        </p>

        <div className="panel p-6">
          <header className="border-b border-line pb-4 text-center">
            <p className="font-display text-2xl tracking-tight">NOOKAA</p>
            <p className="mt-1 text-xs text-muted">{store?.name ?? 'Beverages & Beyond'}</p>
            {store ? <p className="mt-0.5 text-[11px] text-faint">{store.address}</p> : null}
            <p className="mt-0.5 text-[11px] text-faint">GSTIN {invoice.gstin}</p>
          </header>

          <div className="flex items-baseline justify-between border-b border-line py-3 text-sm">
            <div>
              <p className="eyebrow">Invoice</p>
              <p className="tnum font-mono font-semibold">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="eyebrow">Order</p>
              <p className="tnum font-mono font-semibold">{order.orderNumber}</p>
            </div>
          </div>

          <div className="flex items-baseline justify-between border-b border-line py-3 text-sm">
            <div>
              <p className="font-semibold">{order.customerName}</p>
              <p className="tnum font-mono text-xs text-muted">{formatPhone(order.customerPhone)}</p>
            </div>
            <p className="tnum text-xs text-faint">{formatDateTime(invoice.issuedAt)}</p>
          </div>

          <ul className="space-y-3 border-b border-line py-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="flex gap-3">
                  <span className="tnum font-mono font-bold text-muted">{item.qty}×</span>
                  <div>
                    <p className="font-semibold uppercase tracking-wide">{item.spec}</p>
                    {item.modifiers.length > 0 ? (
                      <p className="mt-0.5 text-[11px] text-muted">{item.modifiers.map((m) => m.name).join(' · ')}</p>
                    ) : null}
                  </div>
                </div>
                <span className="tnum shrink-0 font-mono">{formatMoney(item.lineTotalMinor)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 py-4 text-sm">
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
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-display text-base">Total</dt>
              <dd className="tnum font-mono text-xl font-bold">{formatMoney(invoice.totalMinor)}</dd>
            </div>
          </dl>

          <p className="border-t border-line pt-4 text-center text-[11px] text-faint">
            {order.paymentStatus === 'PAID' ? 'Paid' : order.paymentStatus.toLowerCase()}
            {order.paymentProvider ? ` · ${order.paymentProvider.toLowerCase()}` : ''}
          </p>

          <p className="mt-4 text-center font-display text-sm italic text-muted">Sip. Chill. Repeat.</p>
          <p className="text-center text-[11px] text-faint">www.nookaa.in</p>

          <p className="mt-3 border-t border-line pt-3 text-center text-[10px] text-faint">
            <a href="https://smaran.studio" target="_blank" rel="noopener noreferrer" className="hover:text-muted">
              POS powered by Smaran Studio
            </a>
          </p>
        </div>

        <p className="no-print mt-6 text-center text-[11px] text-faint">{catalog().snapshot.organization.name} · {invoice.invoiceNumber}</p>
      </div>
    </main>
  );
}
