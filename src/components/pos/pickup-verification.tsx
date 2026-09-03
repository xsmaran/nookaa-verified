'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { OrderService, QrService } from '@/services';
import { toast } from '@/stores/toast-store';
import type { Order, Session } from '@/types';

/**
 * The gate on an app order's hand-over. Two ways in, same as the label says
 * on the customer's own screen: scan their QR on the Scan screen, or type
 * the code they read out right here. Either one calls the same
 * OrderService.advance() a scan would — this is not a separate action, just
 * a second door into it — but only after resolve() confirms the code
 * actually belongs to *this* order, which is what earns the
 * `verifiedPickup` flag advance() requires for a READY app order.
 */
export function PickupVerification({
  order, session, onVerified,
}: {
  order: Order;
  session: Session | null;
  onVerified: () => Promise<void> | void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collect = async () => {
    if (!session || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await QrService.resolve(code.trim());
      if ('error' in outcome) { setError(outcome.error); return; }
      if (outcome.order.id !== order.id) { setError('That code belongs to a different order.'); return; }
      await OrderService.advance(order, session, { verifiedPickup: true });
      toast.success(`${order.orderNumber.split('-').pop()} — handed over`);
      setCode('');
      await onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That move was rejected');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed border-line p-3">
      <p className="text-xs font-semibold">Verify before handing over</p>
      <p className="mt-1 text-[11px] text-faint">
        An app order needs the customer's QR or pickup code — a counter sale never does. Scan it on the{' '}
        <Link href="/scan" className="underline underline-offset-2 hover:text-ink">Scan screen</Link>, or enter the code they read out.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          placeholder="0000"
          inputMode="numeric"
          className="tnum font-mono"
          onKeyDown={(e) => { if (e.key === 'Enter') void collect(); }}
        />
        <Button variant="primary" disabled={busy || !code.trim()} onClick={() => void collect()}>
          {busy ? 'Checking…' : 'Collect order'}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-status-alert">{error}</p> : null}
    </div>
  );
}
