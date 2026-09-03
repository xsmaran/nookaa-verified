'use client';

import { formatDate } from '@/lib/format';
import type { AttendanceRecord, AttendanceStatus } from '@/types';

const TONE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-status-ready',
  LATE: 'bg-status-new',
  ON_LEAVE: 'bg-status-prep',
};

const LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ON_LEAVE: 'On leave',
};

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sunday-aligned weeks ending on the current week, oldest first — same layout GitHub's contribution graph uses. */
function buildWeeks(weeks: number): Date[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));

  const start = new Date(endOfWeek);
  start.setDate(start.getDate() - weeks * 7 + 1);

  const columns: Date[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(day.getDate() + w * 7 + d);
      column.push(day);
    }
    columns.push(column);
  }
  return columns;
}

/**
 * One person's attendance, as a grid of squares — a week per column, a day
 * per row, oldest on the left. The same visual language a GitHub contribution
 * graph uses, because "a pattern of small coloured squares read at a glance"
 * is exactly what this is for too: not any one day, but the shape of a month.
 */
export function AttendanceHeatmap({
  records,
  weeks = 12,
}: {
  records: AttendanceRecord[];
  weeks?: number;
}) {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const columns = buildWeeks(weeks);
  const today = toKey(new Date());

  return (
    <div className="inline-flex gap-[3px]" role="img" aria-label={`Attendance for the last ${weeks} weeks`}>
      {columns.map((column, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {column.map((day) => {
            const key = toKey(day);
            const record = byDate.get(key);
            const future = key > today;
            const tone = future ? '' : record ? TONE[record.status] : 'bg-sunk';
            const title = future
              ? ''
              : `${formatDate(day.toISOString())} — ${record ? LABEL[record.status] : 'No record'}`;
            return (
              <div
                key={key}
                title={title || undefined}
                className={`h-[11px] w-[11px] rounded-[2px] ${future ? 'invisible' : tone}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The three-colour key, shown once beside the heatmaps rather than repeated under each one. */
export function AttendanceHeatmapLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-faint">
      {(['PRESENT', 'LATE', 'ON_LEAVE'] as AttendanceStatus[]).map((status) => (
        <span key={status} className="flex items-center gap-1">
          <span className={`h-[11px] w-[11px] rounded-[2px] ${TONE[status]}`} />
          {LABEL[status]}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-[11px] w-[11px] rounded-[2px] bg-sunk" />
        No record
      </span>
    </div>
  );
}
