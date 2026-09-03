'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, PaymentPill, StatusPill } from '@/components/ui';
import { formatMoney, formatPhone } from '@/lib/format';
import { canAdvance, MILESTONE_LABEL, STATUS_LABEL, WORKFLOW_STAGES, workflowStage } from '@/lib/order-state';
import { CupRepository } from '@/repositories';
import { OrderService, QrService } from '@/services';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { CupToken, Order } from '@/types';

/**
 * Scanning a cup.
 *
 * Three inputs, one result. The camera is used when it exists; a hardware
 * scanner types into the same field (it behaves as a keyboard and ends with
 * Enter); and the barista can always type the cup id or the last four digits of
 * the order. The screen never blocks on the camera.
 *
 * BarcodeDetector is used where available (Chrome/Edge on Android and desktop).
 * Elsewhere the manual and hardware paths carry the workflow — see /docs/08.
 */
export default function ScanPage() {
  const session = useSession((s) => s.session);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<{ order: Order; cup: CupToken } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'running' | 'unsupported' | 'denied'>('idle');
  const [busy, setBusy] = useState(false);
  const [justAdvanced, setJustAdvanced] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * A scan is not a lookup — it is the action. The moment the cup's code
   * resolves to an order, that order moves to its next stage automatically;
   * the barista never taps a second button to confirm what the scan already
   * told the system to do.
   */
  const resolve = useCallback(
    async (raw: string) => {
      if (!raw.trim() || !session) return;
      const outcome = await QrService.resolve(raw);
      setManual('');
      if ('error' in outcome) {
        setResult(null);
        setError(outcome.error);
        return;
      }
      setError(null);
      const { order, cup } = outcome;

      if (!canAdvance(order.status, session.user.role)) {
        setResult(outcome);
        setJustAdvanced(false);
        toast.info(`${order.orderNumber.split('-').pop()} is already ${STATUS_LABEL[order.status].toLowerCase()}`, 'Nothing left to advance');
        return;
      }

      setBusy(true);
      try {
        const { order: updated, milestone } = await OrderService.advance(order, session, { verifiedPickup: true });
        await CupRepository.recordScan(cup.cupId, session.user.id, milestone);
        setResult({ order: updated, cup });
        setJustAdvanced(true);
        // Audible + visible confirmation: a barista is not looking at the screen.
        toast.success(`${updated.orderNumber.split('-').pop()} — ${MILESTONE_LABEL[milestone] ?? 'completed'}`, 'Scanned');
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(60);
      } catch (e) {
        setResult(outcome);
        setJustAdvanced(false);
        toast.error('The scan could not advance this order', e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraState('idle');
  }, []);

  const startCamera = useCallback(async () => {
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('running');
      const detector = new Detector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            await resolve(codes[0].rawValue);
            stopCamera();
            return;
          }
        } catch {
          /* a dropped frame is not an error worth surfacing */
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setCameraState('denied');
    }
  }, [resolve, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  /** The fallback for when the scanner (or the auto-advance above) did not work. */
  const manualAdvance = async () => {
    if (!result || !session) return;
    setBusy(true);
    try {
      const { order: updated, milestone } = await OrderService.advance(result.order, session, { verifiedPickup: true });
      if (updated.cupId) await CupRepository.recordScan(updated.cupId, session.user.id, milestone);
      setResult({ ...result, order: updated });
      setJustAdvanced(false);
      toast.success(`${updated.orderNumber.split('-').pop()} — ${MILESTONE_LABEL[milestone] ?? 'completed'}`);
    } catch (e) {
      toast.error('That move was rejected', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const eligible = result && session ? canAdvance(result.order.status, session.user.role) : false;

  return (
    <div className="scroll-y h-full p-4">
      <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h1 className="font-display text-lg leading-none">Scan a cup</h1>
          <p className="mt-1 text-sm text-muted">Point the camera at the label, or type what is printed on it.</p>

          <div className="mt-4 aspect-[4/3] overflow-hidden rounded-md border border-line bg-sunk">
            {cameraState === 'running' ? (
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                {cameraState === 'unsupported' ? (
                  <p className="text-sm text-muted">
                    This browser has no built-in QR reader. Use the hardware scanner or type the cup ID — both work exactly
                    the same from here.
                  </p>
                ) : cameraState === 'denied' ? (
                  <p className="text-sm text-status-alert">
                    Camera access was blocked. Allow it in the browser’s site settings, or carry on typing cup IDs.
                  </p>
                ) : (
                  <p className="text-sm text-muted">The camera is off.</p>
                )}
                <Button size="sm" onClick={() => void startCamera()}>
                  {cameraState === 'idle' ? 'Turn on camera' : 'Try again'}
                </Button>
              </div>
            )}
          </div>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void resolve(manual);
            }}
          >
            <Input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="CUP-8F4A91 or 0042"
              aria-label="Cup or order id"
              className="tnum font-mono uppercase"
            />
            <Button type="submit" variant="primary">
              Find
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-faint">
            A hardware scanner types into this field and presses Enter for you — leave it focused during a rush.
          </p>

          {error ? <p className="mt-3 rounded-md bg-alertSoft px-3 py-2 text-sm text-status-alert">{error}</p> : null}
        </section>

        <section className="panel p-4">
          {!result ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-1 text-center">
              <p className="font-display text-base">No cup on screen</p>
              <p className="max-w-xs text-sm text-muted">Scan or type a cup ID and the order appears here with its next step.</p>
            </div>
          ) : (
            <>
              {justAdvanced ? (
                <div className="mb-3 flex items-center gap-1.5 rounded-md bg-readySoft px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-status-ready">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-ready" /> Scanned — moved to {STATUS_LABEL[result.order.status].toLowerCase()}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="tnum font-mono text-3xl font-bold leading-none">{result.order.orderNumber.split('-').pop()}</p>
                  <p className="tnum mt-1 font-mono text-[11px] text-faint">{result.order.orderNumber}</p>
                </div>
                <StatusPill status={result.order.status} />
              </div>

              <div className="mt-3 flex items-center">
                {WORKFLOW_STAGES.map((s, i, arr) => {
                  const stage = workflowStage(result.order.status);
                  const idx = stage ? WORKFLOW_STAGES.findIndex((w) => w.key === stage) : -1;
                  return (
                    <div key={s.key} className="flex flex-1 items-center">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${i < idx ? 'bg-status-ready' : i === idx ? 'bg-ink' : 'bg-line'}`} />
                      {i < arr.length - 1 ? <span className={`h-px flex-1 ${i < idx ? 'bg-status-ready' : 'bg-line'}`} /> : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm font-semibold">{result.order.customerName}</p>
                <p className="tnum font-mono text-xs text-muted">{formatPhone(result.order.customerPhone)}</p>
              </div>

              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {result.order.items.map((item) => (
                  <li key={item.id} className="flex gap-2 text-sm">
                    <span className="tnum font-mono font-bold text-muted">{item.qty}×</span>
                    <span>
                      <span className="font-semibold uppercase tracking-wide">{item.spec}</span>
                      {item.modifiers.length > 0 ? (
                        <span className="block text-[11px] text-muted">{item.modifiers.map((m) => m.name).join(' · ')}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <PaymentPill status={result.order.paymentStatus} provider={result.order.paymentProvider} />
                <span className="tnum font-mono text-sm font-bold">{formatMoney(result.order.totalMinor)}</span>
              </div>

              {eligible ? (
                <div className="mt-4">
                  <Button block size="lg" variant="secondary" disabled={busy} onClick={manualAdvance}>
                    Move to next step
                  </Button>
                  <p className="mt-1 text-center text-[11px] text-faint">Fallback only — scan the cup again if the scanner missed it</p>
                </div>
              ) : (
                <p className="mt-4 rounded-md bg-sunk px-3 py-2 text-center text-sm text-muted">
                  Nothing left to do on this cup.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
