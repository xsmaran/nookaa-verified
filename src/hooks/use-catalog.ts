'use client';

import { useSyncExternalStore } from 'react';
import { catalog, subscribeToCatalog, type CatalogIndex } from '@/repositories/catalog-cache';

/**
 * The catalog, as a React value.
 *
 * `useSyncExternalStore` rather than state plus an effect, because the
 * snapshot can change between a render and its commit — a sync landing while
 * the POS grid paints — and this is the hook that is defined to handle that
 * without tearing.
 */
export function useCatalog(): CatalogIndex {
  return useSyncExternalStore(subscribeToCatalog, catalog, catalog);
}
