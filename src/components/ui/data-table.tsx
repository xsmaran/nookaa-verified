'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { TableSkeleton } from './states';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  /** Return the value to sort by. Omit for a column that cannot be sorted. */
  sortBy?: (row: T) => string | number | null;
  /** Hidden below `lg`. For columns that are useful but not load-bearing. */
  secondary?: boolean;
}

/**
 * The table.
 *
 * This is where most of the admin's time is spent, so the details matter:
 *
 *   - The header sticks, because a table you have to scroll back up to read is
 *     a table you read wrong.
 *   - Sorting is click-to-toggle on the header itself, with the direction
 *     shown; there is no separate control to find.
 *   - Loading is a skeleton in the shape of the table, not a spinner, so the
 *     page does not jump when the rows arrive.
 *   - Secondary columns disappear on a narrow screen rather than the table
 *     scrolling sideways, because §26 puts tablets in the admin's hands.
 */
export function DataTable<T>({
  rows,
  columns,
  empty,
  loading = false,
  onRowClick,
  rowKey,
  defaultSort,
  dense = false,
  rowTone,
}: {
  rows: T[];
  columns: Column<T>[];
  empty: ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  dense?: boolean;
  /** Tints a row — a cancelled order, an archived product. Used sparingly. */
  rowTone?: (row: T) => 'default' | 'muted' | 'alert';
}) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortBy) return rows;

    // Copy before sorting: mutating the caller's array turns a click on a
    // header into a change in whatever state that array came from.
    return [...rows].sort((a, b) => {
      const left = column.sortBy!(a);
      const right = column.sortBy!(b);
      if (left === right) return 0;
      // Missing values sort last in either direction; they are not "smallest".
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, columns, sort]);

  if (loading) return <TableSkeleton columns={columns.length} />;
  if (rows.length === 0) return <>{empty}</>;

  const cellPadding = dense ? 'px-3 py-2' : 'px-4 py-3';

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-line">
            {columns.map((column) => {
              const sortable = Boolean(column.sortBy);
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`whitespace-nowrap ${dense ? 'px-3 py-2' : 'px-4 py-2.5'}
                    text-[11px] font-semibold uppercase tracking-[0.12em] text-faint
                    ${column.align === 'right' ? 'text-right' : 'text-left'}
                    ${column.secondary ? 'hidden lg:table-cell' : ''}`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`inline-flex items-center gap-1 uppercase tracking-[0.12em]
                        hover:text-ink ${active ? 'text-ink' : ''}`}
                    >
                      {column.header}
                      <span aria-hidden className={active ? 'opacity-100' : 'opacity-25'}>
                        {active && sort!.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => {
            const tone = rowTone?.(row) ?? 'default';
            return (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line last:border-0
                  ${onRowClick ? 'cursor-pointer hover:bg-sunk' : ''}
                  ${tone === 'muted' ? 'opacity-55' : ''}
                  ${tone === 'alert' ? 'bg-alertSoft/40' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${cellPadding} align-top
                      ${column.align === 'right' ? 'text-right' : ''}
                      ${column.secondary ? 'hidden lg:table-cell' : ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
