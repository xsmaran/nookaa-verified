import { localStore } from '@/lib/local-db';
import { clearCatalog, hydrateCatalog } from './catalog-cache';
import { ensureAdminSeeded } from './admin-seed';

/**
 * Device start-up.
 *
 * Frontend-only build: this device is the only source of truth there is, so
 * the first thing that happens is `ensureAdminSeeded()` — the org, stores,
 * staff and catalog, written once from src/mock/*. After that, restoring the
 * cached catalog snapshot from IndexedDB means a till that reboots mid-outage
 * comes back with a menu rather than a blank grid.
 */
let bootstrapPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = ensureAdminSeeded().then(() => hydrateCatalog()).then(() => undefined);
  }
  return bootstrapPromise;
}

/**
 * Clear everything this device is holding.
 *
 * Destructive and always confirmed first. Note what it does not do: it cannot
 * delete anything from the server, so an order that has already synced
 * survives this, and an order that has not is genuinely lost — which is why
 * the caller has to say so before offering the button.
 */
export async function resetLocalData(): Promise<void> {
  await localStore().wipe();
  await clearCatalog();
  bootstrapPromise = null;
}

/** How much unsynced work would be lost by a reset. Shown in the confirmation. */
export async function pendingLocalWork(): Promise<number> {
  const outbox = await localStore().list<{ status: string }>('outbox');
  return outbox.filter((event) => event.status !== 'SYNCED').length;
}
