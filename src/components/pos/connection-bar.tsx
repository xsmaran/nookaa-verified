'use client';

import { useState } from 'react';
import { formatTime } from '@/lib/format';
import { useSync } from '@/hooks/use-sync';
import { RealtimeService, SyncEngine } from '@/services';
import { useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';

const TONE = {
  ONLINE: { dot: 'bg-status-ready', label: 'Online' },
  SYNCING: { dot: 'bg-status-prep', label: 'Syncing' },
  OFFLINE: { dot: 'bg-status-new', label: 'Offline' },
  ERROR: { dot: 'bg-status-alert', label: 'Sync problem' },
};

/**
 * Connection status.
 *
 * Offline is a normal operating mode here, not an error: the bar says what is
 * happening and how many sales are still queued, and never blocks the till.
 */
export function ConnectionBar() {
  const sync = useSync();
  const session = useSession((s) => s.session);
  const [open, setOpen] = useState(false);
  const tone = TONE[sync.state];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted hover:bg-sunk"
      >
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
        {tone.label}
        {sync.pending > 0 ? <span className="tnum font-mono text-faint">{sync.pending} queued</span> : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-md border border-line bg-surface p-4 text-sm shadow-lift">
          <p className="eyebrow mb-2">Connection</p>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted">Status</dt>
              <dd className="font-semibold">{tone.label}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Queued for upload</dt>
              <dd className="tnum font-mono">{sync.pending}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Last synced</dt>
              <dd className="tnum font-mono">{sync.lastSyncedAt ? formatTime(sync.lastSyncedAt) : '—'}</dd>
            </div>
          </dl>
          {sync.lastError ? <p className="mt-2 text-xs text-status-alert">{sync.lastError}</p> : null}
          <p className="mt-3 text-xs text-muted">
            Sales, cup labels and stock movements all work offline. They upload themselves when the line comes back.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void SyncEngine.syncNow()}
              className="flex-1 rounded border border-line px-2 py-1.5 text-xs font-semibold hover:bg-sunk"
            >
              Sync now
            </button>
            <button
              onClick={async () => {
                if (!session) return;
                await RealtimeService.injectAppOrder(session.storeId);
                toast.info('MOCK: an app order was pushed to this store');
              }}
              className="flex-1 rounded border border-dashed border-line px-2 py-1.5 text-xs font-semibold text-muted hover:bg-sunk"
            >
              Simulate app order
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
