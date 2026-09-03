'use client';

import { useEffect } from 'react';

/**
 * Modal sheet. Anchored bottom on touch, centred on desktop. Escape always
 * closes — a barista must never be trapped in a dialog with a queue waiting.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const max = width === 'lg' ? 'max-w-3xl' : width === 'sm' ? 'max-w-sm' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={onClose} />
      <div className={`relative z-10 w-full ${max} animate-pop-in bg-surface shadow-sheet sm:rounded-lg`}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg leading-tight">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-faint hover:text-ink" aria-label="Close">
            ×
          </button>
        </header>
        <div className="scroll-y max-h-[65vh] px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}
