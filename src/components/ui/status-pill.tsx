import { STATUS_LABEL } from '@/lib/order-state';
import type { OrderStatus, PaymentStatus } from '@/types';

const ORDER_TONE: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'bg-newSoft text-status-new',
  NEW: 'bg-newSoft text-status-new',
  ACCEPTED: 'bg-prepSoft text-status-prep',
  PREPARING: 'bg-prepSoft text-status-prep',
  READY: 'bg-readySoft text-status-ready',
  HANDED_OVER: 'bg-sunk text-muted',
  COMPLETED: 'bg-sunk text-muted',
  CANCELLED: 'bg-alertSoft text-status-alert',
  REFUND_PENDING: 'bg-alertSoft text-status-alert',
  REFUNDED: 'bg-alertSoft text-status-alert',
  FAILED: 'bg-alertSoft text-status-alert',
};

export function StatusPill({ status, className = '' }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ORDER_TONE[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  PAID: 'text-status-ready',
  PENDING: 'text-status-new',
  FAILED: 'text-status-alert',
  REFUNDED: 'text-status-alert',
  PARTIALLY_REFUNDED: 'text-status-alert',
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  PAID: 'Paid',
  PENDING: 'Unpaid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Part refunded',
};

export function PaymentPill({ status, provider }: { status: PaymentStatus; provider?: string | null }) {
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wider ${PAYMENT_TONE[status]}`}>
      {PAYMENT_LABEL[status]}
      {provider && status === 'PAID' ? ` · ${provider.toLowerCase()}` : ''}
    </span>
  );
}

export function SourceTag({ source }: { source: string }) {
  const label = source === 'OFFLINE_POS' ? 'Counter' : source === 'APP' ? 'App' : source.toLowerCase();
  return (
    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {label}
    </span>
  );
}
