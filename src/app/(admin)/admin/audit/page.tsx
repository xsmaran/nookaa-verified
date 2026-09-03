'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, ClearFilters, DataTable, EmptyState, ErrorState, FilterSelect,
  Modal, Notice, SearchInput, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useLocalResource } from '@/hooks/use-resource';
import { useStaff } from '@/hooks/use-staff';
import { AuditRepository } from '@/repositories';
import { usePermission } from '@/stores/session-store';
import type { AuditLog } from '@/types';

type AuditEntry = AuditLog;

/**
 * The audit log.
 *
 * Read-only, and not by convention: there is no endpoint that writes here from
 * the outside, and the table itself refuses UPDATE and DELETE. A log that the
 * application can tidy up is a log that proves nothing.
 *
 * The summary column is written when the change is made, in English, because
 * "price ₹180 → ₹190" is the answer to the question somebody actually came
 * here with. The full before-and-after is one click away for when it is not.
 */

const ENTITIES = [
  { value: 'product', label: 'Products' },
  { value: 'category', label: 'Categories' },
  { value: 'recipe', label: 'Recipes' },
  { value: 'ingredient', label: 'Ingredients' },
  { value: 'inventory', label: 'Stock' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'order', label: 'Orders' },
  { value: 'refund', label: 'Refunds' },
  { value: 'discount', label: 'Discounts' },
  { value: 'user', label: 'Staff' },
  { value: 'store', label: 'Stores' },
  { value: 'device', label: 'Devices' },
  { value: 'settings', label: 'Settings' },
  { value: 'session', label: 'Sign-ins only' },
];

const TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  created: 'success',
  updated: 'info',
  archived: 'warning',
  deleted: 'danger',
  restored: 'success',
  approved: 'success',
  rejected: 'danger',
};

export default function AuditPage() {
  const canView = usePermission('audit.view');
  const { staff } = useStaff({ enabled: canView, includeInactive: true });

  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const [days, setDays] = useState('7');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<AuditEntry | null>(null);

  const from = useMemo(
    () => (days ? new Date(Date.now() - Number(days) * 86400000).toISOString() : undefined),
    [days],
  );

  const loadEntries = useMemo(
    () => (canView ? () => AuditRepository.list({ entity, userId, from, limit: 300 }) : null),
    [canView, entity, userId, from],
  );

  const { data, loading, error, reload } = useLocalResource<AuditEntry[]>(loadEntries);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data ?? [];
    return (data ?? []).filter((e) =>
      `${e.entityLabel ?? ''} ${e.summary ?? ''} ${e.action} ${e.userName}`.toLowerCase().includes(needle));
  }, [data, search]);

  const columns: Column<AuditEntry>[] = [
    {
      key: 'at',
      header: 'When',
      width: '160px',
      sortBy: (e) => e.at,
      render: (e) => <span className="tnum font-mono text-xs text-muted">{formatDateTime(e.at)}</span>,
    },
    {
      key: 'who',
      header: 'Who',
      width: '170px',
      sortBy: (e) => e.userName,
      render: (e) => (
        <div>
          <span className="block truncate text-sm">{e.userName}</span>
          {e.userRole ? (
            <span className="block text-[10px] uppercase tracking-wider text-faint">{e.userRole.toLowerCase()}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'what',
      header: 'What changed',
      render: (e) => (
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={TONE[e.action.split('.').pop() ?? ''] ?? 'neutral'}>
              {e.action.replace(/\./g, ' ')}
            </Badge>
            <span className="truncate text-sm">{e.entityLabel ?? e.entityId}</span>
          </span>
          {e.summary ? <span className="mt-0.5 block truncate text-xs text-muted">{e.summary}</span> : null}
          {e.reason ? <span className="mt-0.5 block truncate text-xs italic text-faint">“{e.reason}”</span> : null}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Area',
      width: '110px',
      secondary: true,
      sortBy: (e) => e.entity,
      render: (e) => <span className="text-xs capitalize text-muted">{e.entity}</span>,
    },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Audit log" />
        <ErrorState
          title="Not your call"
          message="Reading the audit log needs the audit permission. Managers cannot see it — it records their actions too."
        />
      </div>
    );
  }

  const activeFilters = [entity, userId, search].filter(Boolean).length;

  return (
    <div className="p-6">
      <PageHeader
        title="Audit log"
        description="Every change anybody made, and what it was before they made it."
        meta={
          entity === 'session'
            ? <span className="text-xs text-muted">showing sign-ins</span>
            : <span className="text-xs text-faint">sign-ins are under Area → Sign-ins only</span>
        }
      />

      <div className="mb-4">
        <Notice tone="info" title="This log cannot be edited">
          The table rejects updates and deletes at the database level, and nothing writes to it except the
          action being recorded. Entries are kept for two years.
        </Notice>
      </div>

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search the log" />
            <FilterSelect
              label="Area"
              value={entity}
              onChange={setEntity}
              allLabel="All changes"
              options={ENTITIES}
            />
            <FilterSelect
              label="Person"
              value={userId}
              onChange={setUserId}
              allLabel="Anyone"
              options={staff.map((u) => ({ value: u.id, label: u.name }))}
            />
            <FilterSelect
              label="Period"
              value={days}
              onChange={setDays}
              options={[
                { value: '1', label: 'Last 24 hours' },
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
                { value: '', label: 'All time' },
              ]}
            />
            <ClearFilters
              active={activeFilters}
              onClear={() => { setEntity(''); setUserId(''); setSearch(''); }}
            />
          </Toolbar>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            dense
            rowKey={(e) => e.id}
            onRowClick={setOpen}
            defaultSort={{ key: 'at', direction: 'desc' }}
            empty={
              <EmptyState
                title="Nothing in this window"
                hint="Widen the period, or clear the filters."
              />
            }
          />
        </>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.action.replace(/\./g, ' ')} — ${open.entityLabel ?? open.entityId}` : ''}
        description={open ? `${open.userName} · ${formatDateTime(open.at)}` : undefined}
        width="lg"
      >
        {open ? (
          <div className="space-y-4">
            {open.summary ? (
              <p className="rounded-md bg-sunk px-3 py-2 text-sm">{open.summary}</p>
            ) : null}
            {open.reason ? (
              <div>
                <p className="eyebrow mb-1">Reason given</p>
                <p className="text-sm italic">“{open.reason}”</p>
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <Snapshot label="Before" value={open.before} />
              <Snapshot label="After" value={open.after} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** Only the fields that actually differ, so a diff is readable at a glance. */
function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      {value === null || value === undefined ? (
        <p className="rounded-md border border-line px-3 py-2 text-xs text-faint">—</p>
      ) : (
        <pre className="scroll-y max-h-72 overflow-x-auto rounded-md border border-line bg-sunk px-3 py-2
          text-[11px] leading-relaxed text-ink">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
