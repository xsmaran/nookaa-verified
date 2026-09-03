'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, FilterSelect, Modal,
  Notice, StatRow, StatTile, Textarea, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocalResource } from '@/hooks/use-resource';
import { RefundService } from '@/services';
import type { RefundRow } from '@/services';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';

const TONE = { PENDING: 'warning', PROCESSED: 'success', REJECTED: 'neutral', FAILED: 'danger' } as const;

/**
 * Refunds.
 *
 * Nothing here moves money on its own. A refund is raised by one person and
 * released by another, and this screen is the second half of that — which is
 * why the pending ones are separated out at the top rather than sorted in with
 * the history.
 */
export default function RefundsPage() {
  const canView = usePermission('finance.view');
  const canApprove = usePermission('order.refund.approve');
  const session = useSession((s) => s.session);
  const myId = session?.user.id;

  const [status, setStatus] = useState('');
  const [deciding, setDeciding] = useState<RefundRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRefunds = useMemo(() => (canView ? () => RefundService.list() : null), [canView]);
  const { data, loading, error, reload } = useLocalResource<RefundRow[]>(loadRefunds);

  const refunds = data ?? [];
  const rows = useMemo(
    () => (status ? refunds.filter((r) => r.status === status) : refunds),
    [refunds, status],
  );

  const pending = refunds.filter((r) => r.status === 'PENDING');
  const processedTotal = refunds
    .filter((r) => r.status === 'PROCESSED')
    .reduce((sum, r) => sum + r.amountMinor, 0);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    if (!deciding || !session) return;
    setBusy(true);
    try {
      await RefundService.decide(deciding.id, decision, note || undefined, session);
      reload();
      toast.success(
        decision === 'APPROVE'
          ? `${formatMoney(deciding.amountMinor)} refunded on ${deciding.orderNumber}`
          : `Refund on ${deciding.orderNumber} declined`,
      );
      setDeciding(null);
      setNote('');
    } catch (e) {
      toast.error('Could not record that decision', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<RefundRow>[] = [
    {
      key: 'order',
      header: 'Order',
      width: '190px',
      sortBy: (r) => r.orderNumber,
      render: (r) => (
        <Link
          href={`/admin/orders/${r.orderId}`}
          onClick={(e) => e.stopPropagation()}
          className="tnum font-mono text-xs hover:underline"
        >
          {r.orderNumber}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: '110px',
      sortBy: (r) => r.amountMinor,
      render: (r) => <span className="tnum font-mono text-sm text-status-alert">{formatMoney(r.amountMinor)}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => <span className="text-sm">{r.reason}</span>,
    },
    {
      key: 'requested',
      header: 'Raised by',
      width: '160px',
      secondary: true,
      sortBy: (r) => r.createdAt,
      render: (r) => (
        <div>
          <span className="block truncate text-xs">{r.requestedByName}</span>
          <span className="block text-[11px] text-faint">{formatDateTime(r.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'approved',
      header: 'Approved by',
      width: '150px',
      secondary: true,
      render: (r) => <span className="text-xs text-muted">{r.approvedByName ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (r) => <Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      render: (r) => {
        if (r.status !== 'PENDING' || !canApprove) return null;
        // The person who raised it cannot release it. The server enforces this
        // too — and so does a CHECK constraint on the table.
        if (r.requestedBy === myId) return <span className="text-[11px] text-faint">yours</span>;
        return (
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setDeciding(r); }}>
            Review
          </Button>
        );
      },
    },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Refunds" />
        <ErrorState title="Not your call" message="Seeing refunds needs the finance permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Refunds"
        description="Money going back to customers. Raised by one person, released by another."
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <div className="mb-4">
            <StatRow>
              <StatTile
                label="Waiting for approval"
                value={pending.length}
                tone={pending.length > 0 ? 'alert' : 'default'}
                hint={pending.length > 0 ? formatMoney(pending.reduce((s, r) => s + r.amountMinor, 0)) : 'nothing pending'}
              />
              <StatTile label="Refunded" value={formatMoney(processedTotal)} hint="approved and processed" />
              <StatTile label="Declined" value={refunds.filter((r) => r.status === 'REJECTED').length} />
              <StatTile label="Total raised" value={refunds.length} />
            </StatRow>
          </div>

          {pending.length > 0 && canApprove ? (
            <div className="mb-4">
              <Notice tone="warning" title={`${pending.length} refund${pending.length === 1 ? '' : 's'} waiting`}>
                Nothing is returned to a customer until somebody other than the person who raised it approves.
              </Notice>
            </div>
          ) : null}

          <Toolbar>
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              allLabel="Everything"
              options={[
                { value: 'PENDING', label: 'Waiting' },
                { value: 'PROCESSED', label: 'Refunded' },
                { value: 'REJECTED', label: 'Declined' },
                { value: 'FAILED', label: 'Failed' },
              ]}
            />
          </Toolbar>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(r) => r.id}
            defaultSort={{ key: 'requested', direction: 'desc' }}
            rowTone={(r) => (r.status === 'PENDING' ? 'alert' : r.status === 'REJECTED' ? 'muted' : 'default')}
            empty={<EmptyState title="No refunds" hint="Nothing has been sent back to a customer." />}
          />
        </>
      )}

      <Modal
        open={deciding !== null}
        onClose={() => { setDeciding(null); setNote(''); }}
        title="Review this refund"
        description={deciding ? `${deciding.orderNumber} · raised by ${deciding.requestedByName}` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setDeciding(null); setNote(''); }} disabled={busy}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void decide('REJECT')} disabled={busy}>
              Decline
            </Button>
            <Button variant="primary" size="sm" onClick={() => void decide('APPROVE')} disabled={busy}>
              {busy ? 'Working…' : `Refund ${formatMoney(deciding?.amountMinor ?? 0)}`}
            </Button>
          </>
        }
      >
        {deciding ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="eyebrow">Amount</dt>
                <dd className="tnum mt-0.5 font-mono text-lg text-status-alert">{formatMoney(deciding.amountMinor)}</dd>
              </div>
              <div>
                <dt className="eyebrow">Back via</dt>
                <dd className="mt-0.5 text-sm">{deciding.method === 'ORIGINAL' ? 'The original payment' : deciding.method}</dd>
              </div>
            </dl>

            <div>
              <p className="eyebrow mb-1">Reason given</p>
              <p className="rounded-md bg-sunk px-3 py-2 text-sm italic">“{deciding.reason}”</p>
            </div>

            <div>
              <label htmlFor="decision-note" className="eyebrow mb-1.5 block">Your note</label>
              <Textarea
                id="decision-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional — goes on the audit log with your decision."
              />
            </div>

            <Notice tone="info">
              Approving records the refund against the original payment and marks the order refunded.
              Nothing is deleted, and the order keeps its full history.
            </Notice>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
