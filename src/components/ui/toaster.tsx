'use client';

import { useEffect } from 'react';
import { bus, EVENTS } from '@/services';
import { useToasts } from '@/stores/toast-store';

const TONE = {
  success: 'border-l-status-ready',
  error: 'border-l-status-alert',
  info: 'border-l-status-prep',
};

export function Toaster() {
  const { toasts, dismiss, push } = useToasts();

  useEffect(
    () =>
      bus.on(EVENTS.TOAST, (payload) => {
        const { tone, message, detail } = (payload ?? {}) as { tone: 'success' | 'error' | 'info'; message: string; detail?: string };
        if (message) push(tone ?? 'info', message, detail);
      }),
    [push],
  );

  return (
    <div className="no-print pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto animate-pop-in rounded-md border border-line border-l-4 bg-surface px-4 py-3 text-left shadow-lift ${TONE[t.tone]}`}
        >
          <p className="text-sm font-semibold">{t.message}</p>
          {t.detail ? <p className="mt-0.5 text-xs text-muted">{t.detail}</p> : null}
        </button>
      ))}
    </div>
  );
}
