'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Sheet } from '@/components/ui';
import { formatMoney, isValidCustomerName, isValidCustomerPhone } from '@/lib/format';
import { calculateTotals } from '@/lib/pricing';
import { useCatalog } from '@/hooks/use-catalog';
import { InventoryService, lastRecordFor, OrderService } from '@/services';
import type { Shortfall } from '@/services/inventory-service';
import { useCart } from '@/stores/cart-store';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Order, OrderType, PaymentProvider } from '@/types';

const TENDERS: Array<{ id: PaymentProvider; label: string; hint: string }> = [
  { id: 'RAZORPAY', label: 'Razorpay', hint: 'Card / netbanking terminal' },
  { id: 'UPI', label: 'UPI', hint: 'Scan the counter QR' },
  { id: 'CARD', label: 'Card', hint: 'Swipe on the terminal' },
  { id: 'CASH', label: 'Cash', hint: 'Opens the drawer' },
];

const DINING: Array<{ id: OrderType; label: string; hint: string }> = [
  { id: 'TAKEAWAY', label: 'Takeaway', hint: 'Cup goes out the door' },
  { id: 'DINE_IN', label: 'Here', hint: 'Staying at the counter' },
];

const QUICK_CASH = [10000, 20000, 50000, 100000];

/**
 * Charging.
 *
 * Two decisions and nothing else: how they are paying, and (for cash) what they
 * handed over. Stock is checked *before* money is taken — a customer must never
 * pay for a drink the bar cannot pour.
 */
export function ChargeSheet({
  open,
  onClose,
  onCharged,
}: {
  open: boolean;
  onClose: () => void;
  onCharged: (order: Order) => void;
}) {
  const session = useSession((s) => s.session);
  const cart = useCart();
  const [provider, setProvider] = useState<PaymentProvider>('UPI');
  const [diningType, setDiningType] = useState<OrderType>('TAKEAWAY');
  const [tendered, setTendered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [shortfalls, setShortfalls] = useState<Shortfall[] | null>(null);

  const { snapshot, defaultTax } = useCatalog();

  // Priced from the catalog the device is holding, so the ticket still totals
  // correctly with the router unplugged. When there is a network the server
  // re-decides the discount, and it is the server's figure that is charged.
  const discount = useMemo(
    () => snapshot.discounts.find((d) => d.code === cart.discountCode) ?? null,
    [snapshot.discounts, cart.discountCode],
  );
  const totals = useMemo(
    () => calculateTotals(cart.lines, defaultTax, discount),
    [cart.lines, defaultTax, discount],
  );
  const change = provider === 'CASH' && tendered ? Math.max(0, tendered - totals.totalMinor) : 0;

  const charge = async () => {
    if (!session) return;
    if (!isValidCustomerName(cart.customerName) || !isValidCustomerPhone(cart.customerPhone)) {
      toast.error('Customer name and phone are required', 'Every order needs both before it can be billed.');
      return;
    }
    setBusy(true);
    try {
      const problems = await InventoryService.check(session.storeId, cart.lines);
      if (problems.length > 0) {
        setShortfalls(problems);
        setBusy(false);
        return;
      }

      const { order } = await OrderService.createOfflineOrder({
        session,
        lines: cart.lines,
        customerName: cart.customerName,
        customerPhone: cart.customerPhone ? cart.customerPhone : null,
        source: 'OFFLINE_POS',
        provider,
        tenderedMinor: provider === 'CASH' ? tendered ?? totals.totalMinor : undefined,
        discountCode: cart.discountCode,
        type: diningType,
      });

      cart.clear();
      setTendered(null);
      setDiningType('TAKEAWAY');
      setShortfalls(null);

      const billRecord = lastRecordFor(order, 'INVOICE_GENERATED');
      if (billRecord?.status === 'SENT') {
        toast.success(`Bill sent via ${billRecord.channel === 'SMS' ? 'SMS' : 'WhatsApp'}`, order.customerPhone ?? undefined);
      } else if (billRecord?.status === 'FAILED') {
        toast.error('The bill could not be delivered', billRecord.detail ?? 'WhatsApp and SMS both failed.');
      }

      onCharged(order);
    } catch (error) {
      toast.error('The order was not created', error instanceof Error ? error.message : 'Unknown failure');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Charge ${formatMoney(totals.totalMinor)}`}
      subtitle={`${cart.lines.reduce((s, l) => s + l.qty, 0)} items · ${cart.customerName || 'Guest'}`}
      footer={
        <Button
          block
          size="lg"
          variant="primary"
          disabled={busy || (provider === 'CASH' && (tendered ?? 0) < totals.totalMinor)}
          onClick={charge}
        >
          {busy ? 'Charging…' : provider === 'CASH' ? `Take ${formatMoney(tendered ?? totals.totalMinor)} cash` : `Charge by ${TENDERS.find((t) => t.id === provider)?.label}`}
        </Button>
      }
    >
      {shortfalls ? (
        <div className="mb-4 rounded-md border border-status-alert/40 bg-alertSoft p-4">
          <p className="text-sm font-semibold text-status-alert">The bar cannot make this order right now</p>
          <ul className="mt-2 space-y-1 text-xs text-ink">
            {shortfalls.map((s) => (
              <li key={s.ingredientId} className="tnum font-mono">
                {s.ingredientName}: need {Math.round(s.required)} {s.unit}, {Math.round(s.onHand)} {s.unit} left
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Remove the affected drink, or ask a manager to override stock in Admin → Inventory.
          </p>
        </div>
      ) : null}

      <p className="eyebrow mb-2">Here or takeaway</p>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {DINING.map((option) => (
          <button
            key={option.id}
            onClick={() => setDiningType(option.id)}
            className={`flex min-h-[52px] flex-col items-start justify-center rounded-md border px-3 py-2 text-left transition-colors ${
              diningType === option.id ? 'border-ink bg-ink text-paper' : 'border-line bg-surface hover:border-muted'
            }`}
          >
            <span className="text-sm font-bold">{option.label}</span>
            <span className={`text-[11px] ${diningType === option.id ? 'text-paper/70' : 'text-muted'}`}>{option.hint}</span>
          </button>
        ))}
      </div>

      <p className="eyebrow mb-2">Payment method</p>
      <div className="grid grid-cols-2 gap-2">
        {TENDERS.map((tender) => (
          <button
            key={tender.id}
            onClick={() => setProvider(tender.id)}
            className={`flex min-h-[64px] flex-col items-start justify-center rounded-md border px-3 py-2 text-left transition-colors ${
              provider === tender.id ? 'border-ink bg-ink text-paper' : 'border-line bg-surface hover:border-muted'
            }`}
          >
            <span className="text-sm font-bold">{tender.label}</span>
            <span className={`text-[11px] ${provider === tender.id ? 'text-paper/70' : 'text-muted'}`}>{tender.hint}</span>
          </button>
        ))}
      </div>

      {provider === 'CASH' ? (
        <div className="mt-5">
          <p className="eyebrow mb-2">Cash tendered</p>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_CASH.map((amount) => (
              <button
                key={amount}
                onClick={() => setTendered(amount)}
                className={`tnum h-11 rounded-md border font-mono text-sm font-bold ${
                  tendered === amount ? 'border-ink bg-ink text-paper' : 'border-line bg-surface hover:bg-sunk'
                }`}
              >
                {formatMoney(amount, false).replace('.00', '')}
              </button>
            ))}
          </div>
          <button
            onClick={() => setTendered(totals.totalMinor)}
            className="mt-2 w-full rounded-md border border-line py-2 text-xs font-semibold uppercase tracking-wider hover:bg-sunk"
          >
            Exact — {formatMoney(totals.totalMinor)}
          </button>

          <p className="eyebrow mb-1.5 mt-4">Or enter amount</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">₹</span>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              className="tnum font-mono"
              value={tendered !== null ? String(tendered / 100) : ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) { setTendered(null); return; }
                const parsed = Number(raw);
                if (Number.isFinite(parsed) && parsed >= 0) setTendered(Math.round(parsed * 100));
              }}
            />
          </div>

          <div className="mt-3 flex items-baseline justify-between rounded-md bg-sunk px-3 py-2">
            <span className="eyebrow">Change due</span>
            <span className="tnum font-mono text-lg font-bold">{formatMoney(change)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-line px-3 py-2 text-xs text-muted">
          MOCK — no gateway call is made. In production the POS creates a Razorpay order server-side, the terminal
          captures it, and the webhook confirms before this screen closes.
        </p>
      )}
    </Sheet>
  );
}
