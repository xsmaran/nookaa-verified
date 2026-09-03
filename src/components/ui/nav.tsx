'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Count } from './badge';

/**
 * Breadcrumbs.
 *
 * The last item is the current page and is not a link — a breadcrumb that
 * navigates to where you already are is a small lie that costs a click to
 * discover.
 */
export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.href && !last ? (
              <Link href={item.href} className="hover:text-ink hover:underline">{item.label}</Link>
            ) : (
              <span className={last ? 'font-semibold text-ink' : ''} aria-current={last ? 'page' : undefined}>
                {item.label}
              </span>
            )}
            {!last ? <span className="text-faint" aria-hidden>/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

/**
 * Tabs.
 *
 * Underlined rather than boxed, so a row of them reads as one strip instead of
 * five separate controls. Arrow keys move between them because a keyboard user
 * should not have to tab through every one to reach the last.
 */
export function Tabs({
  items,
  active,
  onChange,
  className = '',
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const enabled = items.filter((i) => !i.disabled);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = enabled.findIndex((i) => i.id === active);
    const next = event.key === 'ArrowRight'
      ? (index + 1) % enabled.length
      : (index - 1 + enabled.length) % enabled.length;
    onChange(enabled[next].id);
  }

  return (
    <div role="tablist" onKeyDown={onKeyDown} className={`flex gap-1 border-b border-line ${className}`}>
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors
              disabled:cursor-not-allowed disabled:opacity-40
              ${selected
                ? 'border-ink font-semibold text-ink'
                : 'border-transparent text-muted hover:border-line hover:text-ink'}`}
          >
            {item.label}
            {item.count !== undefined ? <Count value={item.count} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control, for switching a view rather than a page. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`inline-flex rounded-md border border-line bg-sunk p-0.5 ${size === 'sm' ? 'text-xs' : 'text-[13px]'}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded px-2.5 font-medium transition-colors ${size === 'sm' ? 'h-7' : 'h-8'}
            ${value === option.value ? 'bg-surface text-ink shadow-rail' : 'text-muted hover:text-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
