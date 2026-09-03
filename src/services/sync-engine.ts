import { OrderRepository, OutboxRepository, refreshCatalog } from '@/repositories';
import type { OutboxEvent } from '@/types';
import { bus, EVENTS } from './event-bus';

/**
 * Sync engine.
 *
 * Frontend-only build: there is no server to sync to — this device is the
 * only copy of the data there is. What's kept is the *behaviour* the offline
 * demo relies on (an order taken offline queues, the status bar shows the
 * count, going back online drains the queue): `upload()` below no longer
 * makes a network call, it just marks the event synced once the browser
 * reports it's online. `navigator.onLine` gating, the SYNCING transient
 * state and the drain loop are all unchanged.
 */
export type SyncState = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR';

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2000;

class Engine {
  state: SyncState = 'OFFLINE';
  pending = 0;
  lastSyncedAt: string | null = null;
  lastError: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (typeof window === 'undefined' || this.timer) return;
    this.state = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.timer = setInterval(() => void this.drain(), 5000);
    void this.drain();
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private handleOnline = () => {
    this.state = 'ONLINE';
    this.emit();
    void this.drain();
  };

  private handleOffline = () => {
    this.state = 'OFFLINE';
    this.emit();
  };

  /** Manual "Sync now" from the status bar. */
  async syncNow(): Promise<void> {
    await this.drain(true);
  }

  /** Set at sign-in so uploads are attributed to the till they came from. */
  deviceId: string | null = null;
  storeId: string | null = null;

  /** Told to the engine at sign-in; cleared at sign-out. */
  bindTo(storeId: string | null, deviceId: string | null): void {
    this.storeId = storeId;
    this.deviceId = deviceId;
  }

  private async drain(force = false): Promise<void> {
    const all = await OutboxRepository.all();
    this.pending = all.filter((e) => e.status !== 'SYNCED').length;

    if (typeof navigator !== 'undefined' && !navigator.onLine && !force) {
      this.state = 'OFFLINE';
      this.emit();
      return;
    }

    const batch = await OutboxRepository.pending();
    if (batch.length === 0) {
      if (this.state !== 'OFFLINE') this.state = 'ONLINE';
      this.emit();
      return;
    }

    this.state = 'SYNCING';
    this.emit();

    for (const event of batch) {
      await OutboxRepository.save({ ...event, status: 'UPLOADING' });
      const result = await this.upload(event);
      if (result.ok) {
        await OutboxRepository.save({ ...event, status: 'SYNCED', attempts: event.attempts + 1 });
        this.lastSyncedAt = new Date().toISOString();
        this.lastError = null;
      } else {
        const attempts = event.attempts + 1;
        const delay = Math.min(BASE_DELAY_MS * 2 ** attempts, 5 * 60_000);
        const exhausted = result.permanent || attempts >= MAX_ATTEMPTS;
        await OutboxRepository.save({
          ...event,
          status: exhausted ? 'FAILED' : 'PENDING',
          attempts,
          nextAttemptAt: new Date(Date.now() + delay).toISOString(),
          lastError: result.error,
        });
        this.lastError = result.error ?? 'Sync failed';
        // A dead connection is not an error state — it is the normal condition
        // this whole queue exists for. Only a refusal is worth alarming about.
        this.state = result.permanent ? 'ERROR' : this.state;
        if (!result.permanent) break;   // stop the batch; try again next tick
      }
    }

    await OutboxRepository.clearSynced();
    const remaining = await OutboxRepository.all();
    this.pending = remaining.filter((e) => e.status !== 'SYNCED').length;
    if (this.state === 'SYNCING') this.state = 'ONLINE';
    this.emit();

    // Coming back online is also when the catalog is most likely to be stale —
    // prices may have moved while this till was cut off.
    if (this.pending === 0 && this.storeId) {
      await refreshCatalog(this.storeId).catch(() => undefined);
    }
  }

  /**
   * "Send" one event. Nothing to send it to — this device is the only copy.
   * Kept as its own method (rather than inlined into drain()) so the queue's
   * fill/drain behaviour stays intact for the offline demo without pretending
   * there's still a network round trip underneath it.
   */
  private async upload(_event: OutboxEvent): Promise<{ ok: boolean; error?: string; permanent?: boolean }> {
    return { ok: true };
  }

  private emit(): void {
    bus.emit(EVENTS.SYNC_CHANGED, {
      state: this.state,
      pending: this.pending,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    });
  }

  snapshot() {
    return { state: this.state, pending: this.pending, lastSyncedAt: this.lastSyncedAt, lastError: this.lastError };
  }
}

export const SyncEngine = new Engine();
