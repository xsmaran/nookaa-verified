type Handler = (payload?: unknown) => void;

/**
 * A one-file pub/sub so any screen can react to "orders changed" without every
 * screen polling the database. Replaced by the realtime channel's own fan-out
 * once the backend exists — the subscription API stays the same.
 */
class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
    this.handlers.get('*')?.forEach((handler) => handler({ event, payload }));
  }
}

export const bus = new EventBus();

export const EVENTS = {
  ORDERS_CHANGED: 'orders:changed',
  INVENTORY_CHANGED: 'inventory:changed',
  SYNC_CHANGED: 'sync:changed',
  TOAST: 'ui:toast',
  PRINT: 'print:job',
  ATTENDANCE_CHANGED: 'attendance:changed',
  NOOKS_CHANGED: 'nooks:changed',
} as const;
