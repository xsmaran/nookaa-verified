import { localStore } from '@/lib/local-db';
import type { OutboxEvent } from '@/types';
import { uuid } from '@/lib/ids';

/**
 * The outbox is the contract between offline work and the cloud. Every
 * state-changing action writes a local record AND an outbox event; the sync
 * engine drains the outbox. Nothing is ever "pushed" straight to the server.
 */
export const OutboxRepository = {
  async all(): Promise<OutboxEvent[]> {
    const all = await localStore().list<OutboxEvent>('outbox');
    return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  },

  async pending(): Promise<OutboxEvent[]> {
    const all = await this.all();
    const now = new Date().toISOString();
    return all.filter((e) => (e.status === 'PENDING' || e.status === 'FAILED') && e.nextAttemptAt <= now);
  },

  async enqueue(type: string, payload: unknown): Promise<OutboxEvent> {
    const event: OutboxEvent = {
      id: uuid(),
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
      status: 'PENDING',
    };
    await localStore().put('outbox', event.id, event);
    return event;
  },

  async save(event: OutboxEvent): Promise<void> {
    await localStore().put('outbox', event.id, event);
  },

  async clearSynced(): Promise<void> {
    const all = await this.all();
    await Promise.all(all.filter((e) => e.status === 'SYNCED').map((e) => localStore().remove('outbox', e.id)));
  },
};
