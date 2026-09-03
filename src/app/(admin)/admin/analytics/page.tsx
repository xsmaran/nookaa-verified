'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarRow, PageHeader, Panel, Stat } from '@/components/admin/page-header';
import { formatElapsed, formatMoney, formatMoneyShort } from '@/lib/format';
import {
  byCategory,
  byHour,
  byPaymentMethod,
  bySource,
  inRange,
  medianCompletionSeconds,
  medianPrepSeconds,
  repeatCustomerRate,
  summarise,
  topProducts,
  type DateRange,
} from '@/lib/analytics';
import { OrderRepository } from '@/repositories';
import { useSession } from '@/stores/session-store';
import type { Order } from '@/types';
import { useCatalog } from '@/hooks/use-catalog';

const RANGES: Array<{ id: DateRange; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

/**
 * Reporting.
 *
 * Deliberately short. Four numbers an owner acts on, the hour-by-hour shape
 * that decides staffing, and the two product lists that decide what gets
 * pushed and what gets cut. Everything here is derived from orders, so it can
 * never disagree with the receipts.
 */
export default function AnalyticsPage() {
  const { stores } = useCatalog();
  const session = useSession((s) => s.session);
  const [orders, setOrders] = useState<Order[]>([]);
  const [range, setRange] = useState<DateRange>('7d');
  const [scope, setScope] = useState<'store' | 'all'>('store');

  useEffect(() => {
    void OrderRepository.all().then(setOrders);
  }, []);

  const scoped = useMemo(
    () => orders.filter((o) => (scope === 'all' || o.storeId === session?.storeId) && inRange(o, range)),
    [orders, scope, session, range],
  );

  const summary = summarise(scoped);
  const hours = byHour(scoped).filter((h) => h.hour >= 6 && h.hour <= 23);
  const peakOrders = Math.max(1, ...hours.map((h) => h.orders));
  const best = topProducts(scoped, 10);
  const worst = [...topProducts(scoped, 999)].reverse().slice(0, 6);
  const categories = byCategory(scoped);
  const payments = byPaymentMethod(scoped);
  const source = bySource(scoped);
  const storeSplit = stores.map((store) => ({
    store,
    summary: summarise(scoped.filter((o) => o.storeId === store.id)),
  })).sort((a, b) => b.summary.netMinor - a.summary.netMinor);

  return (
    <div className="p-6">
      <PageHeader
        title="Sales & products"
        description="Nothing here is a separate write path — every figure is recomputed from orders, so a report and a receipt can never disagree."
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-md border border-line bg-surface p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${range === r.id ? 'bg-ink text-paper' : 'text-muted hover:bg-sunk'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-line bg-surface p-0.5">
              {(['store', 'all'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${scope === s ? 'bg-ink text-paper' : 'text-muted hover:bg-sunk'}`}
                >
                  {s === 'store' ? 'This store' : 'All stores'}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net sales" value={formatMoney(summary.netMinor)} sub={`${formatMoney(summary.taxMinor)} of that is GST`} />
        <Stat label="Orders" value={String(summary.orders)} sub={`${summary.itemsSold} drinks`} />
        <Stat label="Average order" value={formatMoney(summary.aovMinor)} sub={`${formatMoney(summary.discountMinor)} discounted away`} />
        <Stat
          label="Median time to ready"
          value={formatElapsed(medianPrepSeconds(scoped) * 1000)}
          sub={`${formatElapsed(medianCompletionSeconds(scoped) * 1000)} order to handover`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="When the rush happens" hint="Orders per hour">
          <div className="flex h-40 items-end gap-1">
            {hours.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-gold/80"
                  style={{ height: `${Math.round((h.orders / peakOrders) * 100)}%`, minHeight: h.orders ? 2 : 0 }}
                  title={`${h.hour}:00 — ${h.orders} orders`}
                />
                <span className="tnum font-mono text-[9px] text-faint">{h.hour}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
            Peak hour takes {peakOrders} orders. Staff the bar to the peak, not the average — the SLA is what customers
            remember.
          </p>
        </Panel>

        <Panel title="Where orders come from" hint={`${summary.orders} in this window`}>
          <div className="space-y-1">
            <BarRow label="In the app" value={source.app} max={Math.max(1, source.app, source.counter)} caption={`${source.app} orders`} />
            <BarRow label="At the counter" value={source.counter} max={Math.max(1, source.app, source.counter)} caption={`${source.counter} orders`} />
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Customers who came back</dt>
              <dd className="tnum font-mono font-semibold">{repeatCustomerRate(scoped)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Cancelled</dt>
              <dd className="tnum font-mono font-semibold">{summary.cancelled}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Refunded</dt>
              <dd className="tnum font-mono font-semibold">{formatMoney(summary.refundedMinor)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Best sellers" hint="By cups">
          {best.length === 0 ? (
            <p className="text-sm text-muted">No sales in this window.</p>
          ) : (
            <div className="space-y-1">
              {best.map((p) => (
                <BarRow key={p.productId} label={p.spec} value={p.qty} max={best[0].qty} caption={`${p.qty} · ${formatMoneyShort(p.revenueMinor)}`} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Barely moving" hint="Candidates to cut or push">
          {worst.length === 0 ? (
            <p className="text-sm text-muted">No sales in this window.</p>
          ) : (
            <ul className="space-y-1.5">
              {worst.map((p) => (
                <li key={p.productId} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{p.spec}</span>
                  <span className="tnum shrink-0 font-mono text-xs text-muted">
                    {p.qty} · {formatMoneyShort(p.revenueMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-line pt-2 text-[11px] text-faint">
            A drink selling under a cup a day still occupies a tab, a recipe and fridge space.
          </p>
        </Panel>

        <Panel title="By category" hint="Revenue share">
          <div className="space-y-1">
            {categories.map((c) => (
              <BarRow key={c.categoryId} label={c.name} value={c.revenueMinor} max={categories[0]?.revenueMinor ?? 1} caption={`${formatMoneyShort(c.revenueMinor)} · ${c.qty} cups`} />
            ))}
          </div>
        </Panel>

        <Panel title={scope === 'all' ? 'By store' : 'How this store compares'} hint="Net sales">
          <div className="space-y-1">
            {storeSplit.map(({ store, summary: s }) => (
              <BarRow
                key={store.id}
                label={`${store.code} · ${store.name.replace('NOOKAA ', '')}`}
                value={s.netMinor}
                max={storeSplit[0]?.summary.netMinor ?? 1}
                caption={`${formatMoneyShort(s.netMinor)} · ${s.orders}`}
              />
            ))}
          </div>
          <div className="mt-4 space-y-1 border-t border-line pt-3">
            {payments.map((p) => (
              <BarRow
                key={p.provider}
                label={p.provider === 'RAZORPAY' ? 'Razorpay' : p.provider.charAt(0) + p.provider.slice(1).toLowerCase()}
                value={p.amountMinor}
                max={payments[0]?.amountMinor ?? 1}
                caption={formatMoneyShort(p.amountMinor)}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
