'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable, EmptyState, ErrorState } from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useCatalog } from '@/hooks/use-catalog';
import { useLocalResource } from '@/hooks/use-resource';
import { useStaff } from '@/hooks/use-staff';
import { DeviceRepository } from '@/repositories';
import { usePermission } from '@/stores/session-store';
import type { StoreDevice } from '@/types';

/**
 * Devices.
 *
 * Every order carries the id of the till that took it. When two tills disagree
 * about a shift's takings, this is the column that settles it.
 */
export default function DevicesPage() {
  const canManage = usePermission('device.manage');
  const { storeById } = useCatalog();
  const { byId: staffById } = useStaff({ enabled: canManage });
  const loadDevices = useMemo(
    () => (canManage ? () => DeviceRepository.all() : null),
    [canManage],
  );
  const { data, loading, error, reload } = useLocalResource<StoreDevice[]>(loadDevices);

  const columns: Column<StoreDevice>[] = [
    { key: 'name', header: 'Device', render: (d) => <span className="text-sm font-semibold">{d.name}</span> },
    { key: 'id', header: 'Code', width: '110px', render: (d) => <span className="tnum font-mono text-[11px] text-faint">{d.code}</span> },
    { key: 'store', header: 'Store', width: '180px', render: (d) => <span className="text-xs text-muted">{storeById.get(d.storeId)?.name}</span> },
    { key: 'type', header: 'Type', width: '110px', render: (d) => <span className="text-xs text-muted">{d.type.toLowerCase()}</span> },
    { key: 'printer', header: 'Printer', width: '170px', render: (d) => <span className="text-xs text-muted">{d.printerName ?? 'system printer'}</span> },
    { key: 'user', header: 'Assigned to', width: '150px', render: (d) => <span className="text-xs text-muted">{d.assignedUserId ? staffById.get(d.assignedUserId)?.name ?? '—' : '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (d) => (
        <span className={`text-[11px] font-bold uppercase tracking-wider ${d.online ? 'text-status-ready' : 'text-muted'}`}>
          {d.online ? 'online' : 'offline'}
        </span>
      ),
    },
    { key: 'seen', header: 'Last seen', width: '170px', render: (d) => <span className="text-xs text-muted">{d.lastSeenAt ? formatDateTime(d.lastSeenAt) : 'never'}</span> },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Devices"
        description="Registered tills and displays. A device is bound to one store at login and stamped onto every record it creates."
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data ?? []}
          columns={columns}
          loading={loading}
          rowKey={(d) => d.id}
          defaultSort={{ key: 'store', direction: 'asc' }}
          rowTone={(d) => (d.online ? 'default' : 'muted')}
          empty={<EmptyState title="No devices registered" hint="A till registers itself the first time somebody signs in on it." />}
        />
      )}
    </div>
  );
}
