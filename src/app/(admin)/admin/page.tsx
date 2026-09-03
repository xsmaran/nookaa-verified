'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BarRow, PageHeader, Panel, Stat } from '@/components/admin/page-header';
import { formatElapsed, formatMoney, formatMoneyShort, formatQty } from '@/lib/format';
import {
  byPaymentMethod,
  bySource,
  inRange,
  medianCompletionSeconds,
  medianPrepSeconds,
  summarise,
  topProducts,
  wasteValueMinor,
  type DateRange,
} from '@/lib/analytics';
import { InventoryRepository, OrderRepository, stockState } from '@/repositories';
import { useSession } from '@/stores/session-store';
import type { InventoryLevel, InventoryTransaction, Order } from '@/types';
import { useCatalog } from '@/hooks/use-catalog';

const RANGES: Array<{ id: DateRange; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

/**
 * The overview.
 *
 * Four questions, in the order an owner actually asks them: how did we do, is
 * the bar keeping up, are we about to run out of anything, and did the money
 * land. Everything else lives one click deeper.
 */
export default function AdminOverview() {
  const { ingredientById, stores } = useCatalog();
  const session = useSession((s) => s.session);
  const [range, setRange] = useState<DateRange>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [levels, setLevels] = useState<InventoryLevel[]>([]);
  const [txns, setTxns] = useState<InventoryTransaction[]>([]);

  useEffect(() => {
    if (!session) return;
    void OrderRepository.all().then(setOrders);
    void InventoryRepository.levels(session.storeId).then(setLevels);
    void InventoryRepository.transactions(session.storeId, 500).then(setTxns);
  }, [session]);

  const scoped = useMemo(
    () => orders.filter((o) => o.storeId === session?.storeId && inRange(o, range)),
    [orders, session, range],
  );
  const summary = useMemo(() => summarise(scoped), [scoped]);
  const open = useMemo(
    () => orders.filter((o) => o.storeId === session?.storeId && ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)),
    [orders, session],
  );
  const attention = levels.filter((l) => stockState(l) !== 'OK');
  const products = topProducts(scoped, 6);
  const payments = byPaymentMethod(scoped);
  const source = bySource(scoped);
  const maxProduct = products[0]?.qty ?? 1;
  const waste = wasteValueMinor(txns, (id) => ingredientById.get(id)?.costMinorPerUnit ?? 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Today"
        description="Everything below is for the store selected in the header. Switch stores up there to compare."
        actions={
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  range === r.id ? 'bg-ink text-paper' : 'text-muted hover:bg-sunk'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net sales" value={formatMoney(summary.netMinor)} sub={`${formatMoney(summary.grossMinor)} gross`} />
        <Stat label="Orders" value={String(summary.orders)} sub={`${source.app} app · ${source.counter} counter`} />
        <Stat label="Average order" value={formatMoney(summary.aovMinor)} sub={`${summary.itemsSold} items sold`} />
        <Stat
          label="Refunds"
          value={formatMoney(summary.refundedMinor)}
          sub={`${summary.refunds} refunded · ${summary.cancelled} cancelled`}
          tone={summary.refunds > 0 ? 'alert' : 'default'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="On the bar right now" hint={<Link href="/admin/live" className="underline">Live board</Link>}>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Waiting" value={String(open.filter((o) => o.status === 'NEW').length)} />
            <Stat label="Making" value={String(open.filter((o) => ['ACCEPTED', 'PREPARING'].includes(o.status)).length)} />
            <Stat label="Ready" value={String(open.filter((o) => o.status === 'READY').length)} />
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Median time to ready</dt>
              <dd className="tnum font-mono font-semibold">{formatElapsed(medianPrepSeconds(scoped) * 1000)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Median order to handover</dt>
              <dd className="tnum font-mono font-semibold">{formatElapsed(medianCompletionSeconds(scoped) * 1000)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Store SLA</dt>
              <dd className="tnum font-mono">
                {stores.find((s) => s.id === session?.storeId)?.prepSlaMinutes ?? 6}:00
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Money in" hint={`${payments.length} methods`}>
          {payments.length === 0 ? (
            <p className="text-sm text-muted">Nothing has been charged in this window yet.</p>
          ) : (
            <div className="space-y-1">
              {payments.map((p) => (
                <BarRow
                  key={p.provider}
                  label={p.provider === 'RAZORPAY' ? 'Razorpay' : p.provider.charAt(0) + p.provider.slice(1).toLowerCase()}
                  value={p.amountMinor}
                  max={payments[0].amountMinor}
                  caption={`${formatMoney(p.amountMinor)} · ${p.count}`}
                />
              ))}
            </div>
          )}
          <p className="mt-3 border-t border-line pt-2 text-[11px] text-faint">
            Cash is recorded as PAID with provider CASH so the till reconciles against one ledger.
          </p>
        </Panel>

        <Panel title="Selling fastest" hint={`Top ${products.length}`}>
          {products.length === 0 ? (
            <p className="text-sm text-muted">No sales in this window.</p>
          ) : (
            <div className="space-y-1">
              {products.map((p) => (
                <BarRow key={p.productId} label={p.spec} value={p.qty} max={maxProduct} caption={`${p.qty} · ${formatMoneyShort(p.revenueMinor)}`} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Stock needing a decision" hint={`${attention.length} of ${levels.length}`}>
          {attention.length === 0 ? (
            <p className="text-sm text-muted">Everything is above its reorder level.</p>
          ) : (
            <ul className="space-y-1.5">
              {attention.slice(0, 7).map((level) => {
                const ingredient = ingredientById.get(level.ingredientId);
                const state = stockState(level);
                return (
                  <li key={level.ingredientId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{ingredient?.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tnum font-mono text-xs text-muted">
                        {ingredient ? formatQty(level.onHand, ingredient.unit) : ''}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          state === 'OK' ? 'bg-sunk text-muted' : state === 'LOW' ? 'bg-newSoft text-status-new' : 'bg-alertSoft text-status-alert'
                        }`}
                      >
                        {state.toLowerCase()}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 border-t border-line pt-2 text-[11px] text-faint">
            Waste and spoilage this period: {formatMoney(waste)} at cost.
          </p>
        </Panel>
      </div>
    </div>
  );
}
