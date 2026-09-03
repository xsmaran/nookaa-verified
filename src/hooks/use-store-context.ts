'use client';

import { useCatalog } from './use-catalog';
import { useSession } from '@/stores/session-store';
import type { Store } from '@/types';

/** The store the current device is standing in. Everything is scoped by it. */
export function useCurrentStore(): Store | null {
  const session = useSession((s) => s.session);
  const { storeById, snapshot } = useCatalog();
  if (!session) return null;
  return storeById.get(session.storeId) ?? snapshot.store ?? null;
}

/**
 * Stores this user may switch between. Managers see theirs; owners see all.
 *
 * The session's list is authoritative because the server scoped it to this
 * user. The cached catalog is the fallback, which is what keeps the switcher
 * populated on a till that has been offline since it was last signed into.
 */
export function useAvailableStores(): Store[] {
  const fromSession = useSession((s) => s.stores);
  const fromCatalog = useCatalog().stores;
  return fromSession.length > 0 ? fromSession : fromCatalog;
}
