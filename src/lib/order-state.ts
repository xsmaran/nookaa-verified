import type { Order, OrderPriority, OrderStatus, Permission, RoleKey } from '@/types';
import { can } from './rbac';

/**
 * The order state machine.
 *
 * A transition is only legal if it appears here, and this table is read by
 * both sides: the POS uses it to decide which button to show, and the API
 * checks the same rows before it will move an order. Nothing sets
 * `order.status` directly.
 *
 * Note what is absent: there is no COMPLETED → CANCELLED. An order that has
 * been handed to a customer cannot be un-sold, only refunded, and the way to
 * guarantee that is for the move not to exist rather than for a check
 * somewhere to remember to refuse it.
 */
export interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  /** Verb shown on the button. Same word appears in the resulting toast. */
  action: string;
  permission: Permission;
  requiresReason?: boolean;
}

export const TRANSITIONS: Transition[] = [
  { from: 'PAYMENT_PENDING', to: 'NEW', action: 'Confirm payment', permission: 'order.create' },
  { from: 'PAYMENT_PENDING', to: 'FAILED', action: 'Mark payment failed', permission: 'order.create' },
  { from: 'PAYMENT_PENDING', to: 'CANCELLED', action: 'Cancel order', permission: 'order.cancel', requiresReason: true },
  { from: 'NEW', to: 'ACCEPTED', action: 'Accept order', permission: 'order.accept' },
  { from: 'NEW', to: 'CANCELLED', action: 'Cancel order', permission: 'order.cancel', requiresReason: true },
  { from: 'ACCEPTED', to: 'PREPARING', action: 'Start making', permission: 'order.advance' },
  { from: 'ACCEPTED', to: 'CANCELLED', action: 'Cancel order', permission: 'order.cancel', requiresReason: true },
  { from: 'PREPARING', to: 'READY', action: 'Mark ready', permission: 'order.advance' },
  // Once a drink is on the bar the stock has already moved, so pulling it
  // back is a manager's call rather than a barista's.
  { from: 'PREPARING', to: 'CANCELLED', action: 'Cancel order', permission: 'order.cancel.elevated', requiresReason: true },
  { from: 'READY', to: 'CANCELLED', action: 'Cancel order', permission: 'order.cancel.elevated', requiresReason: true },
  { from: 'READY', to: 'HANDED_OVER', action: 'Hand over', permission: 'order.advance' },
  { from: 'HANDED_OVER', to: 'COMPLETED', action: 'Complete', permission: 'order.advance' },
  { from: 'COMPLETED', to: 'REFUND_PENDING', action: 'Request refund', permission: 'order.refund', requiresReason: true },
  { from: 'CANCELLED', to: 'REFUND_PENDING', action: 'Request refund', permission: 'order.refund', requiresReason: true },
  { from: 'REFUND_PENDING', to: 'REFUNDED', action: 'Approve refund', permission: 'order.refund.approve' },
  { from: 'REFUND_PENDING', to: 'COMPLETED', action: 'Decline refund', permission: 'order.refund.approve', requiresReason: true },
];

export function allowedTransitions(status: OrderStatus, role: RoleKey | undefined): Transition[] {
  return TRANSITIONS.filter((t) => t.from === status && can(role, t.permission));
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * The single next action a barista should take. The POS never shows a menu of
 * statuses — it shows one button, because there is only ever one right move.
 */
export function primaryTransition(status: OrderStatus, role: RoleKey | undefined): Transition | null {
  const happyPath: OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'HANDED_OVER'];
  if (!happyPath.includes(status)) return null;
  const next = allowedTransitions(status, role).filter((t) => t.to !== 'CANCELLED');
  return next[0] ?? null;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'Payment pending',
  NEW: 'New',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  HANDED_OVER: 'Handed over',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
};

export const OPEN_STATUSES: OrderStatus[] = ['PAYMENT_PENDING', 'NEW', 'ACCEPTED', 'PREPARING', 'READY'];

/** The toast phrase for each milestone `OrderService.advance()` can land on. */
export const MILESTONE_LABEL: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'accepted',
  PREPARING: 'now preparing',
  READY: 'ready for pickup',
  COMPLETED: 'completed',
};

export function isOpen(order: Order): boolean {
  return OPEN_STATUSES.includes(order.status);
}

/* ------------------------------------------------------------- workflow */

/**
 * The grab-and-go workflow, as the barista sees it: four stages, two of them
 * driven by a QR scan rather than a tap. READY and HANDED_OVER are still real
 * statuses in the ledger (SLA history, invoicing) but the counter never shows
 * them as a stage of their own — the second scan carries an order straight
 * through both on its way to COMPLETED.
 */
export type WorkflowStage = 'RECEIVED' | 'ACCEPTED' | 'PREPARING' | 'COMPLETED';

export const WORKFLOW_STAGES: { key: WorkflowStage; title: string; hint: string }[] = [
  { key: 'RECEIVED', title: 'Received', hint: 'Waiting to be accepted' },
  { key: 'ACCEPTED', title: 'Accepted', hint: 'QR generated — print & attach the label' },
  { key: 'PREPARING', title: 'Preparing', hint: 'On the bar — scan the cup when it is done' },
  { key: 'COMPLETED', title: 'Completed', hint: 'Picked up' },
];

export function workflowStage(status: OrderStatus): WorkflowStage | null {
  switch (status) {
    case 'NEW':
      return 'RECEIVED';
    case 'ACCEPTED':
      return 'ACCEPTED';
    case 'PREPARING':
    case 'READY':
    case 'HANDED_OVER':
      return 'PREPARING';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return null;
  }
}

/** Whether this role may push the order to its next workflow stage — by scan or by the fallback button. */
export function canAdvance(status: OrderStatus, role: RoleKey | undefined): boolean {
  return primaryTransition(status, role) !== null;
}

/* ------------------------------------------------------------------- SLA */

/**
 * The brew clock. Elapsed time is measured from the moment the order became
 * the store's problem (accepted, or placed for app orders), not from payment.
 */
export function orderClockStart(order: Order): number {
  const base = order.acceptedAt ?? order.placedAt;
  return new Date(base).getTime();
}

export type SlaLevel = 'ON_TIME' | 'WATCH' | 'LATE';

export function slaLevel(elapsedMs: number, slaMinutes: number): SlaLevel {
  const sla = slaMinutes * 60_000;
  if (elapsedMs >= sla) return 'LATE';
  if (elapsedMs >= sla * 0.66) return 'WATCH';
  return 'ON_TIME';
}

/**
 * Priority is derived, never hand-set in the queue: an order is DELAYED once it
 * blows the store SLA, HIGH once it is inside 5 minutes of a promised pickup.
 */
export function derivePriority(order: Order, slaMinutes: number, now = Date.now()): OrderPriority {
  if (!isOpen(order)) return order.priority;
  const elapsed = now - orderClockStart(order);
  if (slaLevel(elapsed, slaMinutes) === 'LATE') return 'DELAYED';
  if (order.promisedAt) {
    const untilPromise = new Date(order.promisedAt).getTime() - now;
    if (untilPromise <= 5 * 60_000) return 'HIGH';
  }
  return 'NORMAL';
}

const PRIORITY_RANK: Record<OrderPriority, number> = { DELAYED: 0, HIGH: 1, NORMAL: 2 };

/** Queue order: late first, then promised-soon, then oldest. */
export function compareForQueue(a: Order, b: Order, slaMinutes: number): number {
  const pa = PRIORITY_RANK[derivePriority(a, slaMinutes)];
  const pb = PRIORITY_RANK[derivePriority(b, slaMinutes)];
  if (pa !== pb) return pa - pb;
  return orderClockStart(a) - orderClockStart(b);
}
