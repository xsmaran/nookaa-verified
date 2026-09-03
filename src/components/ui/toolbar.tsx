'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The strip above a table.
 *
 * Search on the left, filters in the middle, actions on the right — the same
 * order on every screen, so somebody who has used one list already knows where
 * everything is on the next.
 */
export function Toolbar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Search.
 *
 * Debounced, because this usually drives a query and a request per keystroke
 * is a request per keystroke. 250 ms is below the threshold where typing feels
 * like it is waiting for you.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className = '',
  autoFocus,
  debounceMs = 250,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in step when the parent clears the filters from outside.
  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function update(next: string) {
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), debounceMs);
  }

  return (
    <div className={`relative ${className || 'w-56'}`}>
      <input
        type="search"
        value={local}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { update(''); } }}
        className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-[13px] text-ink
          placeholder:text-faint focus:border-gold focus:outline-none"
      />
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-faint" aria-hidden>
        ⌕
      </span>
    </div>
  );
}

/** A compact labelled select, sized to sit in a toolbar row. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-md border border-line bg-surface px-2 text-[13px] text-ink
        focus:border-gold focus:outline-none ${value ? 'font-medium' : 'text-muted'} ${className}`}
    >
      {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

/** Clears every filter at once, and only appears when there is one to clear. */
export function ClearFilters({ active, onClear }: { active: number; onClear: () => void }) {
  if (active === 0) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className="h-9 rounded px-2 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
    >
      Clear {active} filter{active === 1 ? '' : 's'}
    </button>
  );
}

/** Row count and paging. Says how many there are, not just which page it is. */
export function Pagination({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit) {
    return <p className="mt-3 text-xs text-faint">{total} {total === 1 ? 'row' : 'rows'}</p>;
  }
  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="mt-3 flex items-center justify-between">
      <p className="tnum text-xs text-faint">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="h-8 rounded border border-line px-2.5 text-xs font-semibold text-muted
            hover:bg-sunk hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={to >= total}
          onClick={() => onChange(offset + limit)}
          className="h-8 rounded border border-line px-2.5 text-xs font-semibold text-muted
            hover:bg-sunk hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
