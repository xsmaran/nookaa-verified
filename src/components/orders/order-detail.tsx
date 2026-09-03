'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, PaymentPill, Sheet, StatusPill, Textarea } from '@/components/ui';
import { CupLabelSheet } from '@/components/pos/cup-label-sheet';
import { PickupVerification } from '@/components/pos/pickup-verification';
import { formatDateTime, formatMoney, formatPhone, formatTime } from '@/lib/format';
import { allowedTransitions, MILESTONE_LABEL, primaryTransition, STATUS_LABEL } from '@/lib/order-state';
import { CupRepository, PaymentRepository } from '@/repositories';
import { InvoiceService, lastRecordFor, OrderService, PrintService, QrService } from '@/services';
import { useOrder } from '@/hooks/use-orders';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { CupToken, Invoice, Order } from '@/types';
import { useCatalog } from '@/hooks/use-catalog';

// PREPARING onward so the code is visible before it's needed, not just after.
const PICKUP_READY_STATUSES = new Set(['PREPARING', 'READY', 'HANDED_OVER', 'COMPLETED']);

/**
 * Everything known about one order, and every legal thing left to do to it.
 * Shared by the barista route and the admin route — the record is the same
 * record; only the chrome around it changes.
 */
export function OrderDetail({ orderId, backHref, backLabel }: { orderId: string; backHref: string; backLabel: string }) {
  const { storeById } = useCatalog();
  const session = useSession((s) => s.session);
  const { order, reload } = useOrder(orderId);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [labelOpen, setLabelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickupCup, setPickupCup] = useState<CupToken | null>(null);
  const [pickupQr, setPickupQr] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    void PaymentRepository.invoiceByOrderId(order.id).then((i) => setInvoice(i ?? null));
  }, [order]);

  // The customer's own pickup screen, simulated here since app orders in this
  // demo have no separate customer-facing surface — see qr-service.ts.
  useEffect(() => {
    if (!order || order.source !== 'APP' || !order.cupId || !PICKUP_READY_STATUSES.has(order.status)) {
      setPickupCup(null);
      setPickupQr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const cup = await CupRepository.byCupId(order.cupId!);
      if (!cup || cancelled) return;
      setPickupCup(cup);
      setPickupQr(await QrService.dataUrl(cup));
    })();
    return () => { cancelled = true; };
  }, [order]);

  if (!order) {
    return <div className="p-8 text-sm text-muted">Loading order…</div>;
  }

  const store = order.storeId ? storeById.get(order.storeId) : null;
  const moves = session ? allowedTransitions(order.status, session.user.role) : [];
  const happyPath = session ? primaryTransition(order.status, session.user.role) : null;
  const otherMoves = moves.filter((m) => m.to !== happyPath?.to);

  /**
   * An app order was never handed to a barista in person — once the drink is
   * READY it just sits there until someone with the right code shows up, so
   * this is the one point that matters. Counter sales skip this entirely:
   * the customer is standing at the till, which is its own proof.
   */
  const needsPickupVerification = order.source === 'APP' && order.status === 'READY';

  const run = async (to: (typeof moves)[number]) => {
    if (!session) return;
    if (to.requiresReason) {
      setCancelOpen(true);
      return;
    }
    setBusy(true);
    try {
      await OrderService.transition(order, to.to, session);
      toast.success(`${order.orderNumber.split('-').pop()} — ${to.action.toLowerCase()}`);
      await reload();
    } catch (e) {
      toast.error('That move was rejected', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  /** The same scan-equivalent fallback the board and scan screens use — kept in sync so this page never offers a step the QR flow does not. */
  const runAdvance = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const { order: updated, milestone } = await OrderService.advance(order, session);
      if (milestone === 'ACCEPTED') {
        const billRecord = lastRecordFor(updated, 'INVOICE_GENERATED');
        toast.success(
          `${order.orderNumber.split('-').pop()} — accepted`,
          billRecord?.status === 'SENT'
            ? `Bill sent via ${billRecord.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`
            : billRecord?.status === 'FAILED'
              ? 'Bill delivery failed — WhatsApp and SMS both rejected it'
              : undefined,
        );
        setLabelOpen(true);
      } else {
        toast.success(`${order.orderNumber.split('-').pop()} — ${MILESTONE_LABEL[milestone] ?? 'completed'}`);
      }
      await reload();
    } catch (e) {
      toast.error('That move was rejected', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const sendInvoice = async () => {
    setBusy(true);
    try {
      const { invoice: result, record } = await InvoiceService.send(order);
      setInvoice(result);
      if (result.deliveryStatus === 'SENT') {
        toast.success(`Bill link sent by ${record?.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`, result.invoiceNumber);
      } else if (result.deliveryStatus === 'NO_PHONE') {
        toast.error('No phone number on this order', 'Add one from the customer record and try again.');
      } else {
        toast.error('WhatsApp and SMS both failed', record?.detail ?? 'Try resending, or print a copy instead.');
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const printInvoice = async () => {
    const issued = invoice ?? (await InvoiceService.issue(order));
    setInvoice(issued);
    await PrintService.print({ kind: 'RECEIPT', html: InvoiceService.renderHtml(order, issued, store?.name ?? 'NOOKAA') });
  };

  return (
    <div className="scroll-y h-full p-4">
      <div className="mx-auto max-w-4xl">
        <Link href={backHref} className="text-[11px] font-semibold uppercase tracking-wider text-faint hover:text-ink">
          ← {backLabel}
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="tnum font-mono text-3xl font-bold leading-none">{order.orderNumber.split('-').pop()}</h1>
              <StatusPill status={order.status} />
            </div>
            <p className="tnum mt-1.5 font-mono text-xs text-faint">
              {order.orderNumber} · {store?.name} · {formatDateTime(order.placedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum font-mono text-2xl font-bold leading-none">{formatMoney(order.totalMinor)}</p>
            <PaymentPill status={order.paymentStatus} provider={order.paymentProvider} />
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section className="panel p-4">
              <p className="eyebrow mb-3">Items</p>
              <ul className="space-y-3">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex gap-3">
                      <span className="tnum font-mono text-sm font-bold text-muted">{item.qty}×</span>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide">{item.spec}</p>
                        <p className="font-display text-xs italic text-muted">{item.name}</p>
                        {item.modifiers.length > 0 ? (
                          <p className="mt-1 text-[11px] text-muted">{item.modifiers.map((m) => m.name).join(' · ')}</p>
                        ) : null}
                        {item.note ? <p className="mt-1 text-[11px] italic text-status-new">“{item.note}”</p> : null}
                      </div>
                    </div>
                    <span className="tnum font-mono text-sm">{formatMoney(item.lineTotalMinor)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                <Row label="Subtotal" value={formatMoney(order.subtotalMinor)} />
                {order.discountMinor > 0 ? <Row label={`Discount ${order.discountCode ?? ''}`} value={`−${formatMoney(order.discountMinor)}`} /> : null}
                <Row label="GST" value={formatMoney(order.taxMinor)} />
                <Row label="Total" value={formatMoney(order.totalMinor)} bold />
              </dl>
            </section>

            <section className="panel p-4">
              <p className="eyebrow mb-3">Timeline</p>
              <ol className="space-y-2.5">
                {order.history.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="tnum w-16 shrink-0 font-mono text-xs text-faint">{formatTime(event.at)}</span>
                    <span>
                      <span className="font-semibold">{STATUS_LABEL[event.status]}</span>
                      <span className="text-muted"> · {event.userName}</span>
                      {event.reason ? <span className="block text-[11px] italic text-status-alert">{event.reason}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {order.notificationLog.length > 0 ? (
              <section className="panel p-4">
                <p className="eyebrow mb-3">Messages to the customer</p>
                <ul className="space-y-2 text-sm">
                  {order.notificationLog.map((n) => (
                    <li key={n.id} className="flex justify-between gap-3">
                      <span>
                        <span className="font-semibold">{n.event.replace(/_/g, ' ').toLowerCase()}</span>
                        <span className="text-muted"> · {n.channel.toLowerCase()}</span>
                      </span>
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider ${
                          n.status === 'SENT' ? 'text-status-ready' : n.status === 'FAILED' ? 'text-status-alert' : 'text-faint'
                        }`}
                      >
                        {n.status.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="space-y-4">
            <section className="panel p-4">
              <p className="eyebrow mb-2">Customer</p>
              <p className="text-sm font-semibold">{order.customerName}</p>
              <p className="tnum font-mono text-xs text-muted">{formatPhone(order.customerPhone)}</p>
              {order.cupId ? <p className="tnum mt-2 font-mono text-[11px] text-faint">Cup {order.cupId}</p> : null}
            </section>

            {order.source === 'APP' && pickupCup ? (
              <section className="panel p-4">
                <p className="eyebrow mb-2">Customer's pickup screen</p>
                <p className="mb-3 text-[11px] text-faint">
                  What the customer sees in-app — scan it, or take the code they read out.
                </p>
                <div className="flex items-center gap-4">
                  {pickupQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pickupQr} alt="Pickup QR" className="h-20 w-20 shrink-0 rounded border border-line" />
                  ) : (
                    <div className="h-20 w-20 shrink-0 animate-pulse rounded bg-sunk" />
                  )}
                  <div>
                    <p className="eyebrow">Pickup code</p>
                    <p className="tnum font-mono text-3xl font-bold leading-none">
                      {pickupCup.pickupCode?.match(/\d{2}/g)?.join(' ') ?? pickupCup.pickupCode}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {moves.length > 0 ? (
              <section className="panel p-4">
                <p className="eyebrow mb-2">Next</p>
                <div className="space-y-2">
                  {happyPath && needsPickupVerification ? (
                    <PickupVerification order={order} session={session} onVerified={reload} />
                  ) : happyPath ? (
                    <div>
                      <Button
                        block
                        size="lg"
                        variant={happyPath.from === 'NEW' ? 'primary' : 'secondary'}
                        disabled={busy}
                        onClick={() => void runAdvance()}
                      >
                        {happyPath.from === 'NEW' ? 'Accept order' : 'Move to next step'}
                      </Button>
                      {happyPath.from !== 'NEW' ? (
                        <p className="mt-1 text-center text-[11px] text-faint">Fallback only — scanning the cup does this automatically</p>
                      ) : null}
                    </div>
                  ) : null}
                  {otherMoves.map((move) => (
                    <Button
                      key={`${move.from}-${move.to}`}
                      block
                      size="lg"
                      variant={move.to === 'CANCELLED' ? 'danger' : 'secondary'}
                      disabled={busy}
                      onClick={() => void run(move)}
                    >
                      {move.action}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="panel p-4">
              <p className="eyebrow mb-2">Bill</p>
              {invoice ? (
                <>
                  <p className="tnum mb-1 font-mono text-[11px] text-faint">
                    {invoice.invoiceNumber} · {invoice.deliveryStatus.replace('_', ' ').toLowerCase()}
                  </p>
                  {invoice.pdfUrl ? (
                    <a
                      href={invoice.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-2 block truncate text-[11px] text-gold-deep underline underline-offset-2"
                    >
                      {invoice.pdfUrl}
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="mb-2 text-[11px] text-faint">No bill issued yet — it goes out the moment the order completes.</p>
              )}
              <div className="space-y-2">
                <Button block disabled={busy} onClick={() => void sendInvoice()}>
                  {invoice?.deliveryStatus === 'SENT' ? 'Resend bill link' : 'Send bill link'}
                </Button>
                <Button block variant="ghost" onClick={() => void printInvoice()}>
                  Print receipt
                </Button>
                {order.cupId ? (
                  <Button block variant="ghost" onClick={() => setLabelOpen(true)}>
                    Reprint cup label
                  </Button>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>

      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${order.orderNumber.split('-').pop()}?`}
        subtitle="Cancelling voids the cup label. Anything already paid goes to a refund a manager has to approve."
        width="sm"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setCancelOpen(false)}>
              Keep the order
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={reason.trim().length < 3 || busy}
              onClick={async () => {
                if (!session) return;
                setBusy(true);
                try {
                  await OrderService.cancel(order, session, reason.trim());
                  toast.success('Order cancelled', order.paymentStatus === 'PAID' ? 'A refund is waiting for approval' : undefined);
                  setCancelOpen(false);
                  setReason('');
                  await reload();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel order
            </Button>
          </div>
        }
      >
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being cancelled?" />
        <p className="mt-2 text-[11px] text-faint">The reason goes on the order record and the audit log.</p>
      </Sheet>

      {labelOpen ? <CupLabelSheet order={order} onClose={() => setLabelOpen(false)} /> : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'pt-1 text-base font-bold' : 'text-muted'}`}>
      <dt>{label}</dt>
      <dd className="tnum font-mono">{value}</dd>
    </div>
  );
}
