'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Draws a rule above this item — used to separate the dangerous one. */
  separated?: boolean;
}

/**
 * Row actions.
 *
 * A table with six buttons per row is unreadable, so the actions live behind
 * one trigger. Destructive items are last, red, and separated by a rule — the
 * distance is deliberate, because the item above is the one people are aiming
 * for and a mis-click should not be expensive.
 */
export function Menu({
  items,
  label = 'Actions',
  trigger,
  align = 'right',
}: {
  items: MenuItem[];
  label?: string;
  trigger?: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const enabled = items.filter((i) => !i.disabled);
  if (enabled.length === 0) return null;

  return (
    <div ref={container} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded px-2 py-1 text-muted hover:bg-sunk hover:text-ink"
      >
        {trigger ?? <span aria-hidden>⋯</span>}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-30 mt-1 min-w-[180px] rounded-md border border-line bg-surface py-1
            shadow-lift ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              {item.separated ? <div className="my-1 border-t border-line" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onSelect(); }}
                className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors
                  disabled:cursor-not-allowed disabled:opacity-40
                  ${item.destructive
                    ? 'text-status-alert hover:bg-alertSoft'
                    : 'text-ink hover:bg-sunk'}`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
