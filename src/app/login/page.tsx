'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Select } from '@/components/ui';
import { isAdminRole } from '@/lib/rbac';
import { localStore } from '@/lib/local-db';
import { ensureAdminSeeded } from '@/repositories/admin-seed';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Store } from '@/types';

/**
 * Sign in.
 *
 * A PIN pad, not a password field: staff sign in and out dozens of times a
 * shift on a shared terminal with wet hands. Store is picked once and
 * remembered, so the daily flow is four taps and nothing else.
 *
 * Frontend-only build: the store list and the PIN check both happen on this
 * device (see src/stores/session-store.ts) — there is nothing to fetch here.
 */
export default function LoginPage() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const existing = useSession((s) => s.session);

  const [pin, setPin] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Already signed in — a reload mid-shift should not stop at this screen.
  useEffect(() => {
    if (existing) router.replace(isAdminRole(existing.user.role) ? '/admin' : '/pos');
  }, [existing, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureAdminSeeded();
        const allStores = await localStore().list<Store>('stores');
        const activeStores = allStores.filter((s) => s.active);
        if (cancelled) return;

        setStores(activeStores);

        const remembered = typeof window !== 'undefined' ? localStorage.getItem('nookaa-store') : null;
        // IndexedDB returns rows key-sorted (store-blr01 before store-mum01),
        // not in seed order, so the "first" store isn't a stable default —
        // prefer Bandra Kurla, the one every demo PIN below is posted to.
        const fallback = activeStores.find((s) => s.id === 'store-mum01') ?? activeStores[0];
        setStoreId(
          remembered && activeStores.some((s) => s.id === remembered)
            ? remembered
            : fallback?.id ?? '',
        );
      } catch {
        if (!cancelled) setError('Could not load the store list.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pinLength = 4;

  async function submit(value: string) {
    if (!storeId) { setError('Pick a store first.'); return; }
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(value, storeId, null);
      if (typeof window !== 'undefined') localStorage.setItem('nookaa-store', storeId);
      toast.success(`Signed in as ${user.name}`);
      router.replace(isAdminRole(user.role) ? '/admin' : '/pos');
    } catch (e) {
      setPin('');
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  function onDigit(digit: string) {
    setError(null);
    const next = pin.length >= pinLength ? pin : pin + digit;
    setPin(next);
    if (next.length === pinLength) setTimeout(() => void submit(next), 120);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="font-display text-3xl tracking-tight">NOOKAA</p>
          <p className="eyebrow mt-1">Point of sale</p>
        </header>

        <div className="panel p-5">
          <div className="mb-5">
            <label className="eyebrow mb-1.5 block" htmlFor="store">Store</label>
            <Select
              id="store"
              value={storeId}
              disabled={loading || stores.length === 0}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {loading ? <option>Loading…</option> : null}
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name.replace('NOOKAA ', '')}
                </option>
              ))}
            </Select>
          </div>

          <div className="mb-4 flex justify-center gap-3" aria-label="PIN entry">
            {Array.from({ length: pinLength }, (_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full border ${pin.length > i ? 'border-ink bg-ink' : 'border-line bg-sunk'}`}
              />
            ))}
          </div>

          {error ? (
            <p role="alert" className="mb-3 text-center text-sm text-status-alert">{error}</p>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => onDigit(d)}
                className="h-14 rounded-md border border-line bg-surface font-mono text-xl hover:bg-sunk disabled:opacity-50"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setPin(''); setError(null); }}
              className="h-14 rounded-md text-xs font-semibold uppercase tracking-wider text-muted hover:bg-sunk"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDigit('0')}
              className="h-14 rounded-md border border-line bg-surface font-mono text-xl hover:bg-sunk disabled:opacity-50"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="h-14 rounded-md text-xs font-semibold uppercase tracking-wider text-muted hover:bg-sunk"
            >
              Back
            </button>
          </div>

          <Button
            block
            className="mt-4"
            variant="primary"
            size="lg"
            onClick={() => void submit(pin)}
            disabled={pin.length < pinLength || busy}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>

        <div className="mt-6 rounded-md border border-dashed border-line px-4 py-3 text-xs text-muted">
          <p className="eyebrow mb-1.5">Demo PINs</p>
          <p className="tnum font-mono">1111 owner · 2222 admin · 3333 manager · 4444 barista · 8888 cashier</p>
          <p className="mt-1.5">Baristas are posted to specific stores, so 6666 only works at MUM02.</p>
        </div>
      </div>
    </main>
  );
}
