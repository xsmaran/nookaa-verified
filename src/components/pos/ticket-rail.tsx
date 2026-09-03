'use client';

import { useMemo, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { formatMoney, isValidCustomerName, isValidCustomerPhone } from '@/lib/format';
import { calculateTotals } from '@/lib/pricing';
import { useCatalog } from '@/hooks/use-catalog';
import { useCart } from '@/stores/cart-store';

/**
 * The ticket.
 *
 * Always visible, never a drawer: the barista and the customer are both reading
 * it while the order is built. Quantity steppers are full-height touch targets;
 * the charge button carries the amount so nobody charges the wrong ticket.
 */
export function TicketRail({ onCharge, disabled }: { onCharge: () => void; disabled?: boolean }) {
  const { lines, setQty, removeLine, customerName, customerPhone, setCustomer, discountCode, setDiscount, clear } = useCart();
  const [touched, setTouched] = useState(false);

  const { snapshot, defaultTax } = useCatalog();
  const discount = useMemo(
    () => snapshot.discounts.find((d) => d.code === discountCode) ?? null,
    [snapshot.discounts, discountCode],
  );
  const totals = useMemo(
    () => calculateTotals(lines, defaultTax, discount),
    [lines, defaultTax, discount],
  );
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const nameValid = isValidCustomerName(customerName);
  const phoneValid = isValidCustomerPhone(customerPhone);
  const customerValid = nameValid && phoneValid;

  return (
    /*
      flex-1 min-h-0 (not h-full) below lg: this aside stacks under the
      product grid on a phone, and both siblings share the outer flex-col's
      height evenly rather than this one claiming all of it — h-full here
      used to push the grid off-screen entirely. Reverts to a fixed-width,
      full-height side rail once the layout goes to flex-row at lg.
    */
    <aside className="flex min-h-0 w-full flex-1 flex-col border-l border-line bg-surface lg:h-full lg:w-[330px] lg:flex-none xl:w-[380px]">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow">Counter sale</p>
          <p className="tnum font-mono text-xs text-faint">{itemCount} item{itemCount === 1 ? '' : 's'}</p>
        </div>
        {lines.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </header>

      <div className="border-b border-line px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={customerName}
            onChange={(e) => setCustomer(e.target.value, customerPhone)}
            onBlur={() => setTouched(true)}
            placeholder="Name for the cup *"
            aria-label="Customer name"
            aria-required="true"
            className={touched && !nameValid ? 'border-status-alert' : ''}
          />
          <Input
            value={customerPhone}
            onChange={(e) => setCustomer(customerName, e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Phone *"
            inputMode="numeric"
            aria-label="Customer phone"
            aria-required="true"
            className={`tnum font-mono ${touched && !phoneValid ? 'border-status-alert' : ''}`}
          />
        </div>
        {touched && !customerValid ? (
          <p className="mt-1.5 text-[11px] font-semibold text-status-alert">
            Name and a 10-digit phone number are both required before you can charge this order.
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-faint">
            Required for every order — the phone number is what sends the invoice and pickup alert.
          </p>
        )}
      </div>

      <div className="scroll-y min-h-0 flex-1">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="font-display text-base">Nothing on the ticket yet</p>
            <p className="text-sm text-muted">Tap a drink to start. Press 1–9 to jump between categories.</p>
          </div>
        ) : (
          <ul>
            {lines.map((line) => (
              <li key={line.key} className="border-b border-line px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold uppercase leading-tight tracking-wide">{line.spec}</p>
                    <p className="font-display text-xs italic text-muted">{line.name}</p>
                    {line.modifiers.length > 0 ? (
                      <p className="mt-1 text-[11px] text-muted">{line.modifiers.map((m) => m.name).join(' · ')}</p>
                    ) : null}
                    {line.note ? <p className="mt-1 text-[11px] italic text-status-new">“{line.note}”</p> : null}
                  </div>
                  <span className="tnum shrink-0 font-mono text-sm font-bold">
                    {formatMoney((line.unitPriceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0)) * line.qty, false)}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => setQty(line.key, line.qty - 1)}
                    className="h-9 w-9 rounded border border-line text-lg leading-none hover:bg-sunk"
                    aria-label={`Fewer ${line.spec}`}
                  >
                    −
                  </button>
                  <span className="tnum w-9 text-center font-mono text-sm font-bold">{line.qty}</span>
                  <button
                    onClick={() => setQty(line.key, line.qty + 1)}
                    className="h-9 w-9 rounded border border-line text-lg leading-none hover:bg-sunk"
                    aria-label={`More ${line.spec}`}
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeLine(line.key)}
                    className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-faint hover:text-status-alert"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-line px-4 py-3">
        <div className="mb-3 flex gap-2">
          <select
            value={discountCode ?? ''}
            onChange={(e) => setDiscount(e.target.value || null)}
            className="h-9 flex-1 rounded border border-line bg-surface px-2 text-xs"
            aria-label="Discount"
          >
            <option value="">No discount</option>
            {snapshot.discounts.filter((d) => d.active).map((d) => (
              <option key={d.id} value={d.code}>
                {d.name}
                {d.requiresApproval ? ' (manager)' : ''}
              </option>
            ))}
          </select>
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-muted">
            <dt>Subtotal</dt>
            <dd className="tnum font-mono">{formatMoney(totals.subtotalMinor)}</dd>
          </div>
          {totals.discountMinor > 0 ? (
            <div className="flex justify-between text-status-alert">
              <dt>{discount?.name}</dt>
              <dd className="tnum font-mono">−{formatMoney(totals.discountMinor)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-muted">
            <dt>GST 5%</dt>
            <dd className="tnum font-mono">{formatMoney(totals.taxMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between pt-1.5">
            <dt className="font-display text-base">Total</dt>
            <dd className="tnum font-mono text-xl font-bold">{formatMoney(totals.totalMinor)}</dd>
          </div>
        </dl>

        <Button
          block
          size="lg"
          variant="primary"
          className="mt-3"
          hotkey="F2"
          disabled={disabled || lines.length === 0}
          onClick={() => {
            if (!customerValid) {
              setTouched(true);
              return;
            }
            onCharge();
          }}
        >
          {customerValid ? `Charge ${formatMoney(totals.totalMinor)}` : 'Add name & phone to charge'}
        </Button>
      </footer>
    </aside>
  );
}
