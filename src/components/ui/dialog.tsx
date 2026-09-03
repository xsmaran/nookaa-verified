'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';

/**
 * Modal.
 *
 * Escape closes, focus is trapped, and the page behind does not scroll. Those
 * three are not polish — a modal you cannot leave with the keyboard is a modal
 * some people cannot leave at all.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  width = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab' || !panel.current) return;

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKeyDown, true);
    // Focus the panel rather than the first field: announcing the title first
    // is more use to a screen reader than landing mid-form.
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[90vh] w-full ${widths[width]} flex-col rounded-md border border-line
          bg-surface shadow-sheet outline-none`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 rounded p-1 text-muted hover:bg-sunk hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="scroll-y min-h-0 flex-1 px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Confirmation.
 *
 * Destructive actions get a red button and a sentence naming what is about to
 * happen — never "Are you sure?", which asks the reader to remember what they
 * clicked. When `confirmText` is set the user has to type it, which is the
 * right friction for something that cannot be undone.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmText,
  destructive = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => { if (open) setTyped(''); }, [open]);

  const blocked = Boolean(confirmText) && typed.trim() !== confirmText;

  async function confirm() {
    setWorking(true);
    try { await onConfirm(); } finally { setWorking(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={working || busy}>Cancel</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={() => void confirm()}
            disabled={blocked || working || busy}
          >
            {working || busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink">
        <div>{message}</div>
        {confirmText ? (
          <div>
            <label htmlFor="confirm-text" className="eyebrow mb-1.5 block">
              Type <span className="font-mono text-ink">{confirmText}</span> to continue
            </label>
            <input
              id="confirm-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="h-10 w-full rounded-md border border-line bg-surface px-3 font-mono text-sm
                focus:border-gold focus:outline-none"
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
