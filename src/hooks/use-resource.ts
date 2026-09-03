'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch a thing, with the three states every screen needs.
 *
 * Deliberately small — no cache, no revalidation, no query library. The admin
 * screens each own one list, reload it after they change it, and that is the
 * whole requirement. Adding a cache here would mean adding cache invalidation,
 * and a stale price on a screen somebody edits prices on is worse than a
 * request.
 *
 * `loader` is read through a ref rather than listed as an effect dependency
 * on purpose: an inline `() => Repository.list(...)` has a new identity every
 * render, and callers should not have to remember to `useMemo`/`useCallback`
 * it just to avoid a fetch-loop. Only `nonce` (reload()) and the caller's own
 * `deps` (the actual primitive values a refetch should react to — a storeId,
 * a filter string) retrigger the effect.
 */
export function useLocalResource<T>(
  loader: (() => Promise<T>) | null,
  deps: unknown[] = [],
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: (current: T | null) => T | null) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(loader));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const current = loaderRef.current;
    if (!current) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    current()
      .then((response) => { if (!cancelled) { setData(response); setError(null); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const update = useCallback(
    (updater: (current: T | null) => T | null) => setData((current) => updater(current)),
    [],
  );

  return { data, loading, error, reload, setData: update };
}
