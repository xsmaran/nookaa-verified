'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { AttendanceHeatmap, AttendanceHeatmapLegend } from '@/components/admin/attendance-heatmap';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, Field, FormGrid,
  Input, Select, SearchInput, Sheet, StatRow, StatTile, Tabs, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatTime } from '@/lib/format';
import { useStaff } from '@/hooks/use-staff';
import { useSave } from '@/hooks/use-save';
import { AttendanceService, bus, EVENTS, hoursWorked, summarize } from '@/services';
import { usePermission, useSession } from '@/stores/session-store';
import type { AttendanceRecord } from '@/types';

const STATUS_TONE = { PRESENT: 'success', LATE: 'warning', ON_LEAVE: 'neutral' } as const;
const HEATMAP_WEEKS = 12;
const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Who was on shift, and when. One row per person per day — clock-in and
 * clock-out are the only two events in this system, and everything shown
 * here is read straight off them.
 */
export default function AttendancePage() {
  const canView = usePermission('staff.view');
  const canManage = usePermission('staff.manage');
  const session = useSession((s) => s.session);
  const storeId = session?.storeId;

  const [tab, setTab] = useState('overview');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [heatmapRecords, setHeatmapRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [marking, setMarking] = useState(false);

  const { staff } = useStaff({ enabled: canView, includeInactive: false });
  const { save, saving, fieldErrors } = useSave();

  const load = useCallback(async () => {
    if (!canView || !storeId) return;
    setLoading(true);
    try {
      const [log, heatmap] = await Promise.all([
        AttendanceService.list({ storeId, from, to }),
        AttendanceService.list({ storeId, from: daysAgoIso(HEATMAP_DAYS) }),
      ]);
      setRecords(log);
      setHeatmapRecords(heatmap);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canView, storeId, from, to]);

  useEffect(() => {
    void load();
    return bus.on(EVENTS.ATTENDANCE_CHANGED, () => void load());
  }, [load]);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () => records
      .filter((r) => !status || r.status === status)
      .filter((r) => !needle || r.staffName.toLowerCase().includes(needle)),
    [records, status, needle],
  );

  const todayRows = heatmapRecords.filter((r) => r.date === todayIso());
  const counts = {
    present: todayRows.filter((r) => r.status === 'PRESENT').length,
    late: todayRows.filter((r) => r.status === 'LATE').length,
    onLeave: todayRows.filter((r) => r.status === 'ON_LEAVE').length,
  };

  const roster = useMemo(
    // Owners aren't rostered on a shift — see attendance-service.ts.
    () => staff.filter((s) => s.role !== 'OWNER' && (s.storeIds.length === 0 || (storeId && s.storeIds.includes(storeId)))),
    [staff, storeId],
  );

  const byStaff = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    heatmapRecords.forEach((r) => {
      if (!map.has(r.staffId)) map.set(r.staffId, []);
      map.get(r.staffId)!.push(r);
    });
    return map;
  }, [heatmapRecords]);

  const overviewNeedle = search.trim().toLowerCase();
  const overviewRoster = useMemo(
    () => roster.filter((s) => !overviewNeedle || s.name.toLowerCase().includes(overviewNeedle)),
    [roster, overviewNeedle],
  );

  const columns: Column<AttendanceRecord>[] = [
    { key: 'staff', header: 'Staff', sortBy: (r) => r.staffName, render: (r) => <span className="text-sm font-medium">{r.staffName}</span> },
    { key: 'date', header: 'Date', width: '110px', sortBy: (r) => r.date, render: (r) => <span className="tnum font-mono text-xs text-muted">{r.date}</span> },
    {
      key: 'in',
      header: 'Clock in',
      width: '100px',
      render: (r) => <span className="tnum font-mono text-xs">{r.clockInAt ? formatTime(r.clockInAt) : '—'}</span>,
    },
    {
      key: 'out',
      header: 'Clock out',
      width: '100px',
      render: (r) => <span className="tnum font-mono text-xs">{r.clockOutAt ? formatTime(r.clockOutAt) : r.clockInAt ? 'On shift' : '—'}</span>,
    },
    {
      key: 'hours',
      header: 'Hours',
      width: '90px',
      align: 'right',
      render: (r) => {
        const h = hoursWorked(r);
        return <span className="tnum font-mono text-xs text-muted">{h === null ? '—' : h.toFixed(1)}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ').toLowerCase()}</Badge>,
    },
    { key: 'note', header: 'Note', secondary: true, render: (r) => <span className="text-xs text-faint">{r.note ?? ''}</span> },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Attendance" />
        <ErrorState title="Not your call" message="Seeing attendance needs the staff permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Attendance"
        description="Clock-ins and clock-outs at this store. Everyone clocks themselves in and out from their own Profile screen."
        actions={canManage ? <Button size="sm" variant="secondary" onClick={() => setMarking(true)}>Mark on leave</Button> : undefined}
      />

      <div className="mb-4">
        <StatRow>
          <StatTile label="Present today" value={counts.present} />
          <StatTile label="Late today" value={counts.late} tone={counts.late > 0 ? 'alert' : 'default'} />
          <StatTile label="On leave today" value={counts.onLeave} />
          <StatTile label="On the roster" value={roster.length} />
        </StatRow>
      </div>

      <Tabs
        className="mb-4"
        items={[{ id: 'overview', label: 'Overview' }, { id: 'log', label: 'Daily log' }]}
        active={tab}
        onChange={setTab}
      />

      {error ? <ErrorState message={error} onRetry={load} /> : tab === 'overview' ? (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search staff" />
            <AttendanceHeatmapLegend />
          </Toolbar>

          {overviewRoster.length === 0 ? (
            <EmptyState title="No staff on this roster" />
          ) : (
            <div className="divide-y divide-line rounded-md border border-line bg-surface">
              {overviewRoster.map((s) => {
                const personRecords = byStaff.get(s.id) ?? [];
                const summary = summarize(personRecords, HEATMAP_DAYS);
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="w-40 shrink-0">
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="text-[11px] uppercase tracking-wider text-faint">{s.role.toLowerCase()}</p>
                    </div>
                    <div className="w-28 shrink-0">
                      <p className="tnum font-mono text-lg font-bold">{summary.rate.toFixed(0)}%</p>
                      <p className="text-[11px] text-faint">attendance</p>
                    </div>
                    <div className="flex w-56 shrink-0 gap-3 text-[11px] text-muted">
                      <span>{summary.present} present</span>
                      <span>{summary.late} late</span>
                      <span>{summary.onLeave} leave</span>
                    </div>
                    <div className="min-w-0 flex-1 overflow-x-auto">
                      <AttendanceHeatmap records={personRecords} weeks={HEATMAP_WEEKS} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search staff" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="">Every status</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ON_LEAVE">On leave</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-xs text-faint">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </Toolbar>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(r) => r.id}
            defaultSort={{ key: 'date', direction: 'desc' }}
            empty={<EmptyState title="No attendance records" hint="Records appear once someone clocks in." />}
          />
        </>
      )}

      <MarkLeaveSheet
        open={marking}
        staff={staff}
        onClose={() => setMarking(false)}
        onSave={async (input) => {
          if (!session) return;
          await save(
            () => AttendanceService.markLeave(input.staffId, input.staffName, session.storeId, input.date, input.note || undefined, session),
            {
              successMessage: 'Marked on leave',
              onSuccess: () => { setMarking(false); void load(); },
            },
          );
        }}
        saving={saving}
        fieldErrors={fieldErrors}
      />
    </div>
  );
}

function MarkLeaveSheet({
  open, staff, onClose, onSave, saving, fieldErrors,
}: {
  open: boolean;
  staff: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (input: { staffId: string; staffName: string; date: string; note: string }) => void;
  saving: boolean;
  fieldErrors: Record<string, string>;
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const person = staff.find((s) => s.id === staffId);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mark on leave"
      width="sm"
      footer={
        <Button
          block
          variant="primary"
          disabled={saving || !person}
          onClick={() => person && onSave({ staffId: person.id, staffName: person.name, date, note })}
        >
          {saving ? 'Saving…' : 'Mark on leave'}
        </Button>
      }
    >
      <FormGrid columns={1}>
        <Field label="Staff" error={fieldErrors.staffId}>
          <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Date" error={fieldErrors.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note" error={fieldErrors.note}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </FormGrid>
    </Sheet>
  );
}
