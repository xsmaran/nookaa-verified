'use client';

import { useEffect, useState } from 'react';
import { bus, EVENTS, SyncEngine } from '@/services';
import { useSession } from '@/stores/session-store';

export interface SyncSnapshot {
  state: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR';
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/**
 * Sync status, and the one place the engine is started.
 *
 * The engine is bound to the current store and device here rather than at
 * sign-in, so a store switch mid-shift is picked up without anyone having to
 * remember to tell it.
 */
export function useSync(): SyncSnapshot {
  const session = useSession((s) => s.session);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(() => SyncEngine.snapshot());

  useEffect(() => {
    SyncEngine.bindTo(session?.storeId ?? null, session?.deviceId ?? null);
  }, [session?.storeId, session?.deviceId]);

  useEffect(() => {
    SyncEngine.start();
    setSnapshot(SyncEngine.snapshot());
    return bus.on(EVENTS.SYNC_CHANGED, (payload) => setSnapshot(payload as SyncSnapshot));
  }, []);

  return snapshot;
}
