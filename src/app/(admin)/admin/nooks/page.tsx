'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, Field, FormGrid,
  Input, SearchInput, Sheet, StatRow, StatTile, Tabs, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatDateTime, formatPhone } from '@/lib/format';
import { useLocalResource } from '@/hooks/use-resource';
import { useSave } from '@/hooks/use-save';
import { CustomerRepository } from '@/repositories';
import { bus, EVENTS, NooksService } from '@/services';
import { usePermission, useSession } from '@/stores/session-store';
import type { Customer, NooksTransaction } from '@/types';

const TXN_TONE = { EARNED: 'success', REDEEMED: 'info', ADJUSTED: 'neutral' } as const;

/**
 * Nooks — the loyalty coin.
 *
 * Everyone with a balance, and every event that ever changed one. The
 * balance shown here is a cache; the ledger below is the actual record, and
 * matches src/services/nooks-service.ts exactly — nothing here computes its
 * own numbers.
 */
export default function NooksPage() {
  const canView = usePermission('loyalty.manage');
  const session = useSession((s) => s.session);

  const [tab, setTab] = useState('customers');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ issued: 0, redeemed: 0, activeBalance: 0, members: 0 });
  const [adjusting, setAdjusting] = useState<Customer | null>(null);
  const { save, saving, fieldErrors } = useSave();

  const customersLoader = useCallback(() => CustomerRepository.all(), []);
  const { data: customers, loading, error, reload } = useLocalResource<Customer[]>(canView ? customersLoader : null, []);

  const ledgerLoader = useCallback(() => NooksService.ledger(), []);
  const { data: ledger, loading: ledgerLoading, reload: reloadLedger } = useLocalResource<NooksTransaction[]>(
    canView ? ledgerLoader : null,
    [],
  );

  const refreshSummary = useCallback(() => {
    void NooksService.summary().then(setSummary);
  }, []);

  useEffect(() => {
    if (!canView) return;
    refreshSummary();
    return bus.on(EVENTS.NOOKS_CHANGED, () => {
      reload();
      reloadLedger();
      refreshSummary();
    });
  }, [canView, reload, reloadLedger, refreshSummary]);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = (customers ?? []).filter((c) => (c.nooksBalance ?? 0) > 0 || tab === 'customers');
    return all.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle));
  }, [customers, needle, tab]);

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Customer', sortBy: (c) => c.name, render: (c) => <span className="text-sm font-medium">{c.name}</span> },
    { key: 'phone', header: 'Phone', width: '150px', render: (c) => <span className="tnum font-mono text-xs text-muted">{formatPhone(c.phone)}</span> },
    { key: 'orders', header: 'Orders', width: '90px', align: 'right', sortBy: (c) => c.totalOrders, render: (c) => <span className="tnum font-mono text-xs">{c.totalOrders}</span> },
    {
      key: 'balance',
      header: 'Nooks balance',
      width: '140px',
      align: 'right',
      sortBy: (c) => c.nooksBalance ?? 0,
      render: (c) => <span className="tnum font-mono text-sm font-bold">{c.nooksBalance ?? 0}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      render: (c) => (
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setAdjusting(c); }}>
          Adjust
        </Button>
      ),
    },
  ];

  const ledgerColumns: Column<NooksTransaction>[] = [
    { key: 'at', header: 'When', width: '160px', render: (t) => <span className="text-xs text-muted">{formatDateTime(t.createdAt)}</span> },
    { key: 'who', header: 'Customer', render: (t) => <span className="text-sm">{t.customerName}</span> },
    { key: 'type', header: 'Type', width: '110px', render: (t) => <Badge tone={TXN_TONE[t.type]}>{t.type.toLowerCase()}</Badge> },
    {
      key: 'amount',
      header: 'Nooks',
      width: '100px',
      align: 'right',
      render: (t) => (
        <span className={`tnum font-mono text-sm font-bold ${t.amount < 0 ? 'text-status-alert' : 'text-status-ready'}`}>
          {t.amount > 0 ? '+' : ''}{t.amount}
        </span>
      ),
    },
    { key: 'balance', header: 'Balance after', width: '110px', align: 'right', render: (t) => <span className="tnum font-mono text-xs text-muted">{t.balanceAfter}</span> },
    { key: 'reason', header: 'Reason', secondary: true, render: (t) => <span className="text-xs text-faint">{t.reason ?? ''}</span> },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Nooks" />
        <ErrorState title="Not your call" message="Managing Nooks needs the loyalty permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Nooks"
        description="NOOKAA's in-app loyalty coin. Earned on every paid order; spendable only through the app, never at the counter."
      />

      <div className="mb-4">
        <StatRow>
          <StatTile label="Nooks issued" value={summary.issued} hint="all time" />
          <StatTile label="Nooks redeemed" value={summary.redeemed} hint="all time" />
          <StatTile label="Outstanding balance" value={summary.activeBalance} hint="owed to members" />
          <StatTile label="Members with a balance" value={summary.members} />
        </StatRow>
      </div>

      <Tabs
        className="mb-4"
        items={[{ id: 'customers', label: 'Customers' }, { id: 'ledger', label: 'Ledger' }]}
        active={tab}
        onChange={setTab}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : tab === 'customers' ? (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search customers" />
          </Toolbar>
          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(c) => c.id}
            defaultSort={{ key: 'balance', direction: 'desc' }}
            empty={<EmptyState title="No customers yet" />}
          />
        </>
      ) : (
        <DataTable
          rows={ledger ?? []}
          columns={ledgerColumns}
          loading={ledgerLoading}
          rowKey={(t) => t.id}
          defaultSort={{ key: 'at', direction: 'desc' }}
          empty={<EmptyState title="No Nooks activity yet" hint="Entries appear as orders earn and redeem them." />}
        />
      )}

      <AdjustSheet
        customer={adjusting}
        onClose={() => setAdjusting(null)}
        onSave={async (delta, reason) => {
          if (!session || !adjusting) return;
          await save(() => NooksService.adjust(adjusting, delta, reason, session), {
            successMessage: 'Balance adjusted',
            onSuccess: () => setAdjusting(null),
          });
        }}
        saving={saving}
        fieldErrors={fieldErrors}
      />
    </div>
  );
}

function AdjustSheet({
  customer, onClose, onSave, saving, fieldErrors,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSave: (delta: number, reason: string) => void;
  saving: boolean;
  fieldErrors: Record<string, string>;
}) {
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (customer) { setAmount(''); setDirection('credit'); setReason(''); }
  }, [customer]);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && reason.trim().length > 0;

  return (
    <Sheet
      open={customer !== null}
      onClose={onClose}
      title={customer ? `Adjust — ${customer.name}` : 'Adjust'}
      subtitle={customer ? `Current balance: ${customer.nooksBalance ?? 0} Nooks` : undefined}
      width="sm"
      footer={
        <Button block variant="primary" disabled={!valid || saving} onClick={() => onSave(direction === 'credit' ? Math.round(parsed) : -Math.round(parsed), reason)}>
          {saving ? 'Saving…' : direction === 'credit' ? `Credit ${amount || 0} Nooks` : `Debit ${amount || 0} Nooks`}
        </Button>
      }
    >
      <FormGrid columns={2}>
        <Field label="Direction">
          <div className="flex gap-2">
            <Button size="sm" variant={direction === 'credit' ? 'primary' : 'secondary'} onClick={() => setDirection('credit')} className="flex-1">
              Credit
            </Button>
            <Button size="sm" variant={direction === 'debit' ? 'primary' : 'secondary'} onClick={() => setDirection('debit')} className="flex-1">
              Debit
            </Button>
          </div>
        </Field>
        <Field label="Nooks" error={fieldErrors.amount}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="tnum font-mono" />
        </Field>
      </FormGrid>
      <div className="mt-3">
        <Field label="Reason" error={fieldErrors.reason}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill gesture, correction, etc." />
        </Field>
      </div>
    </Sheet>
  );
}
