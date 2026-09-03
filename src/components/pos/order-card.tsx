'use client';

import Link from 'next/link';
import { Elapsed, PaymentPill, SourceTag } from '@/components/ui';
import { formatPhone, formatTime } from '@/lib/format';
import { canAdvance, derivePriority, orderClockStart, WORKFLOW_STAGES, workflowStage } from '@/lib/order-state';
import { useSession } from '@/stores/session-store';
import type { CupToken, Order } from '@/types';

const PRIORITY_EDGE = {
  DELAYED: 'border-l-status-alert',
  HIGH: 'border-l-status-new',
  NORMAL: 'border-l-transparent',
};

/** Four dots, one line — the stage this order is at in the grab-and-go workflow. */
function StageStepper({ status }: { status: Order['status'] }) {
  const stage = workflowStage(status);
  const idx = stage ? WORKFLOW_STAGES.findIndex((s) => s.key === stage) : -1;
  return (
    <div className="flex items-center" aria-label={`Stage: ${stage ?? 'off workflow'}`}>
      {WORKFLOW_STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              i < idx ? 'bg-status-ready' : i === idx ? 'bg-ink' : 'bg-line'
            }`}
            title={s.title}
          />
          {i < WORKFLOW_STAGES.length - 1 ? (
            <span className={`h-px w-3 ${i < idx ? 'bg-status-ready' : 'bg-line'}`} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * An order on the board.
 *
 * One card, one obvious next action. The left edge carries priority so a
 * barista sorts the board peripherally, and the elapsed clock is the only
 * thing that moves on its own. Past the accept step, progressing the order is
 * the QR scanner's job — the button here is the fallback for when it isn't
 * available, styled so it never competes with that for attention.
 */
export function OrderCard({
  order,
  slaMinutes,
  cup,
  justScanned,
  onAdvance,
  onPrint,
  busy,
}: {
  order: Order;
  slaMinutes: number;
  cup?: CupToken;
  justScanned?: boolean;
  onAdvance?: (order: Order) => void;
  onPrint?: (order: Order) => void;
  busy?: boolean;
}) {
  const role = useSession((s) => s.session?.user.role);
  const priority = derivePriority(order, slaMinutes);
  const eligible = canAdvance(order.status, role);
  const isAcceptStep = order.status === 'NEW';
  const lastScan = cup?.scans[cup.scans.length - 1];

  return (
    <article
      className={`rounded-md border border-l-4 border-line bg-surface transition-shadow ${PRIORITY_EDGE[priority]} ${
        justScanned ? 'ring-2 ring-status-ready' : ''
      }`}
    >
      {justScanned ? (
        <div className="flex items-center gap-1.5 rounded-t-[5px] bg-readySoft px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-status-ready">
          <span className="h-1.5 w-1.5 rounded-full bg-status-ready" /> Just scanned
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="tnum font-mono text-xl font-bold leading-none">{order.orderNumber.split('-').pop()}</span>
            <SourceTag source={order.source} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold">{order.customerName}</p>
          <p className="tnum font-mono text-[11px] text-faint">{formatPhone(order.customerPhone)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Elapsed since={orderClockStart(order)} slaMinutes={slaMinutes} />
          <span className="tnum text-[10px] text-faint">placed {formatTime(order.placedAt)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between px-3">
        <StageStepper status={order.status} />
      </div>

      <ul className="mt-2 space-y-1 px-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-2 text-[13px] leading-tight">
            <span className="tnum shrink-0 font-mono font-bold text-muted">{item.qty}×</span>
            <span className="min-w-0">
              <span className="font-semibold uppercase tracking-wide">{item.spec}</span>
              {item.modifiers.length > 0 ? (
                <span className="block text-[11px] text-muted">{item.modifiers.map((m) => m.name).join(' · ')}</span>
              ) : null}
              {item.note ? <span className="block text-[11px] italic text-status-new">“{item.note}”</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <PaymentPill status={order.paymentStatus} provider={order.paymentProvider} />
        </div>
        <div className="flex items-center gap-3">
          {onPrint && order.cupId ? (
            <button
              onClick={() => onPrint(order)}
              className="text-[11px] font-semibold uppercase tracking-wider text-faint hover:text-ink"
            >
              Print label
            </button>
          ) : null}
          <Link href={`/orders/${order.id}`} className="text-[11px] font-semibold uppercase tracking-wider text-faint hover:text-ink">
            Details
          </Link>
        </div>
      </div>

      {cup ? (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-sunk px-3 py-1.5 text-[11px]">
          <span className="tnum font-mono text-faint">{cup.cupId}</span>
          <span className={cup.printedCount > 0 ? 'text-muted' : 'font-semibold text-status-new'}>
            {cup.printedCount > 0 ? `Printed ×${cup.printedCount}` : 'Not printed yet'}
          </span>
          <span className="text-faint">{lastScan ? `Scanned ${formatTime(lastScan.at)}` : 'No scans yet'}</span>
        </div>
      ) : null}

      {onAdvance ? (
        isAcceptStep ? (
          <button
            onClick={() => onAdvance(order)}
            disabled={busy || !eligible}
            className="w-full rounded-b-md bg-ink py-3 text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-black disabled:opacity-60"
          >
            Accept order
          </button>
        ) : eligible && order.status === 'READY' && order.source === 'APP' ? (
          <div className="rounded-b-md border-t border-line px-3 py-2 text-center">
            <Link href="/pickup" className="text-[11px] font-semibold uppercase tracking-wider text-muted underline underline-offset-2 hover:text-ink">
              Waiting on the customer — collect on Pickup
            </Link>
          </div>
        ) : eligible ? (
          <div className="rounded-b-md border-t border-line px-3 py-2">
            <button
              onClick={() => onAdvance(order)}
              disabled={busy}
              className="w-full rounded border border-line bg-surface py-2 text-[13px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
            >
              Move to next step
            </button>
            <p className="mt-1 text-center text-[10px] text-faint">Fallback only — scan the cup to advance it</p>
          </div>
        ) : null
      ) : null}
    </article>
  );
}
