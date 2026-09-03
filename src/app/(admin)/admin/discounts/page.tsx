'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { DiscountEditor } from '@/components/admin/discount-editor';
import {
  Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState,
  FilterSelect, Menu, SearchInput, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useLocalResource } from '@/hooks/use-resource';
import { DiscountRepository } from '@/repositories';
import type { DiscountRow } from '@/repositories';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Discount } from '@/types';

/**
 * Discount codes.
 *
 * The column that matters is the last one: what each code has actually cost.
 * A promotion is easy to create and easy to forget, and the difference between
 * a good one and an expensive one is only ever visible here.
 */
export default function DiscountsPage() {
  const canManage = usePermission('discount.manage');
  const session = useSession((s) => s.session);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Partial<Discount> | null>(null);
  const [confirming, setConfirming] = useState<DiscountRow | null>(null);

  const loadDiscounts = useMemo(
    () => (canManage ? () => DiscountRepository.all(true) : null),
    [canManage],
  );
  const { data, loading, error, reload } = useLocalResource<DiscountRow[]>(loadDiscounts);

  const now = Date.now();

  function stateOf(d: DiscountRow): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
    if (d.archivedAt) return { label: 'archived', tone: 'neutral' };
    if (!d.active) return { label: 'paused', tone: 'neutral' };
    if (d.startsAt && new Date(d.startsAt).getTime() > now) return { label: 'scheduled', tone: 'warning' };
    if (d.endsAt && new Date(d.endsAt).getTime() < now) return { label: 'expired', tone: 'neutral' };
    if (d.usageLimit && d.usageCount >= d.usageLimit) return { label: 'used up', tone: 'danger' };
    return { label: 'live', tone: 'success' };
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data ?? []).filter((d) => {
      if (status && stateOf(d).label !== status) return false;
      if (!needle) return true;
      return `${d.code} ${d.name}`.toLowerCase().includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, status]);

  async function retire() {
    if (!confirming) return;
    try {
      const result = await DiscountRepository.remove(confirming.id, session);
      reload();
      toast.success(result.outcome === 'deleted'
        ? `${confirming.code} deleted — the code is free to use again`
        : `${confirming.code} archived — its redemptions are kept`);
    } catch (e) {
      toast.error('Could not remove that code', (e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  const columns: Column<DiscountRow>[] = [
    {
      key: 'code',
      header: 'Code',
      sortBy: (d) => d.code,
      render: (d) => (
        <div>
          <span className="tnum block font-mono text-sm font-semibold">{d.code}</span>
          <span className="block text-xs text-muted">{d.name}</span>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Discount',
      width: '130px',
      sortBy: (d) => d.value,
      render: (d) => (
        <div>
          <span className="tnum block font-mono text-sm">
            {d.kind === 'PERCENT' ? `${(d.value / 100).toFixed(0)}%` : formatMoney(d.value)}
          </span>
          {d.maxDiscountMinor ? (
            <span className="block text-[11px] text-faint">max {formatMoney(d.maxDiscountMinor)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'rules',
      header: 'Conditions',
      secondary: true,
      render: (d) => {
        const rules: string[] = [];
        if (d.minOrderMinor > 0) rules.push(`over ${formatMoney(d.minOrderMinor)}`);
        if (d.storeIds.length > 0) rules.push(`${d.storeIds.length} store${d.storeIds.length === 1 ? '' : 's'}`);
        if (d.productIds.length > 0) rules.push(`${d.productIds.length} products`);
        if (d.categoryIds.length > 0) rules.push(`${d.categoryIds.length} categories`);
        if (d.perCustomerLimit) rules.push(`${d.perCustomerLimit} per customer`);
        if (d.requiresApproval) rules.push('manager approval');
        return <span className="text-xs text-muted">{rules.length > 0 ? rules.join(' · ') : 'Anything, anywhere'}</span>;
      },
    },
    {
      key: 'window',
      header: 'Runs',
      width: '160px',
      secondary: true,
      sortBy: (d) => d.startsAt ?? '',
      render: (d) => (
        <span className="text-xs text-muted">
          {d.startsAt || d.endsAt
            ? `${d.startsAt ? formatDate(d.startsAt) : 'now'} → ${d.endsAt ? formatDate(d.endsAt) : 'open'}`
            : 'No end date'}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used',
      align: 'right',
      width: '140px',
      sortBy: (d) => d.usage.totalMinor,
      render: (d) => (
        <div>
          <span className="tnum block font-mono text-sm">
            {d.usage.redemptions}
            {d.usageLimit ? <span className="text-faint"> / {d.usageLimit}</span> : null}
          </span>
          {d.usage.totalMinor > 0 ? (
            <span className="tnum block font-mono text-[11px] text-status-alert">
              −{formatMoney(d.usage.totalMinor)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (d) => {
        const state = stateOf(d);
        return <Badge tone={state.tone}>{state.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'right',
      render: (d) => (
        <Menu
          items={[
            { label: 'Edit', onSelect: () => setEditing(d) },
            {
              label: d.active ? 'Pause' : 'Resume',
              onSelect: () => void DiscountRepository.setActive(d.id, !d.active, session)
                .then(() => { reload(); toast.success(d.active ? `${d.code} paused` : `${d.code} live again`); })
                .catch((e) => toast.error('Could not change that', (e as Error).message)),
              disabled: Boolean(d.archivedAt),
            },
            {
              label: d.usage.redemptions > 0 ? 'Archive' : 'Delete',
              onSelect: () => setConfirming(d),
              destructive: true,
              separated: true,
            },
          ]}
        />
      ),
    },
  ];

  if (!canManage) {
    return (
      <div className="p-6">
        <PageHeader title="Discounts" />
        <ErrorState title="Not your call" message="Managing discount codes needs the discount permission." />
      </div>
    );
  }

  const liveCount = (data ?? []).filter((d) => stateOf(d).label === 'live').length;
  const givenAway = (data ?? []).reduce((sum, d) => sum + d.usage.totalMinor, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Discounts"
        description="Codes staff can apply at the counter. Every rule here is checked by the server when the code is used, not by the till."
        meta={
          <span className="text-xs text-muted">
            {liveCount} live · {formatMoney(givenAway)} given away
          </span>
        }
        actions={<Button variant="primary" size="sm" onClick={() => setEditing({})}>New code</Button>}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search codes" />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              allLabel="Any status"
              options={[
                { value: 'live', label: 'Live' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'paused', label: 'Paused' },
                { value: 'expired', label: 'Expired' },
                { value: 'used up', label: 'Used up' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </Toolbar>

          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(d) => d.id}
            onRowClick={setEditing}
            rowTone={(d) => (d.archivedAt || !d.active ? 'muted' : 'default')}
            empty={
              <EmptyState
                title="No discount codes"
                hint="A code created here appears at the POS for staff who may apply discounts."
              />
            }
          />
        </>
      )}

      <DiscountEditor
        open={editing !== null}
        discount={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={retire}
        destructive
        title={confirming && confirming.usage.redemptions > 0 ? 'Archive this code?' : 'Delete this code?'}
        confirmLabel={confirming && confirming.usage.redemptions > 0 ? 'Archive' : 'Delete'}
        message={
          confirming && confirming.usage.redemptions > 0 ? (
            <>
              <strong>{confirming.code}</strong> has been used {confirming.usage.redemptions} times, so it is
              archived rather than deleted — the reporting needs those redemptions to keep resolving. The code
              itself stays spoken for.
            </>
          ) : (
            <>
              <strong>{confirming?.code}</strong> has never been used, so it is deleted outright and the code
              becomes free to use again.
            </>
          )
        }
      />
    </div>
  );
}
