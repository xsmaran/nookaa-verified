'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Button, Card, Checkbox, ConfirmDialog, ErrorState, Field, FormActions, FormGrid,
  Input, Notice, Select, Spinner, Tabs,
} from '@/components/ui';
import { useCatalog } from '@/hooks/use-catalog';
import { useLocalResource } from '@/hooks/use-resource';
import { useSave } from '@/hooks/use-save';
import { pendingLocalWork, refreshCatalog, resetLocalData } from '@/repositories';
import { SettingsRepository } from '@/repositories/settings-repository';
import type { SettingsData } from '@/repositories/settings-repository';
import { DemoDataService } from '@/services/demo-data-service';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';

type Scope = 'general' | 'orders' | 'payments' | 'taxes' | 'inventory' | 'pos' | 'printer' | 'notifications';

type SettingsResponse = SettingsData;

const TABS: Array<{ id: Scope; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'orders', label: 'Orders' },
  { id: 'payments', label: 'Payments' },
  { id: 'taxes', label: 'Taxes' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'pos', label: 'POS' },
  { id: 'printer', label: 'Printing' },
  { id: 'notifications', label: 'Notifications' },
];

/**
 * Settings.
 *
 * Stored as namespaced key/value rows rather than columns, so adding one is a
 * row instead of a migration. A few of them — the GSTIN, the currency, the
 * invoice prefix — are owner-only, because getting them wrong is a
 * conversation with a regulator rather than an operational annoyance.
 */
export default function SettingsPage() {
  const canManage = usePermission('settings.manage');
  const isOwner = usePermission('settings.manage.system');
  const storeId = useSession((s) => s.session?.storeId);
  const session = useSession((s) => s.session);
  const organization = useSession((s) => s.organization);
  const orgStores = useSession((s) => s.stores);
  const { taxRates } = useCatalog();

  const [tab, setTab] = useState<Scope>('general');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [initial, setInitial] = useState('');
  const [resetting, setResetting] = useState(false);
  const [pendingWork, setPendingWork] = useState(0);
  const [seedingDemo, setSeedingDemo] = useState(false);

  async function loadDemoHistory() {
    if (!session || !organization) return;
    setSeedingDemo(true);
    try {
      const result = await DemoDataService.generate({ session, organization, stores: orgStores, days: 14 });
      toast.success(
        `Added ${result.ordersAdded} demo orders`,
        `Across ${result.storesCovered} ${result.storesCovered === 1 ? 'store' : 'stores'} and ${result.daysCovered} days — payments, invoices, refunds and customers came along with them.`,
      );
    } catch (error) {
      toast.error('Could not load demo history', (error as Error).message);
    } finally {
      setSeedingDemo(false);
    }
  }

  const { data, loading, error, reload } = useLocalResource<SettingsResponse>(
    canManage ? () => SettingsRepository.get() : null,
  );
  const { save, saving, error: saveError } = useSave();

  useEffect(() => {
    if (!data) return;
    const values = data.settings[tab] ?? {};
    setDraft(values);
    setInitial(JSON.stringify(values));
  }, [data, tab]);

  useEffect(() => { void pendingLocalWork().then(setPendingWork); }, [resetting]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const ownerOnlyKeys = useMemo(() => new Set(data?.ownerOnly[tab] ?? []), [data, tab]);
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit() {
    const result = await save(
      () => SettingsRepository.save(tab, draft, session),
      { successMessage: 'Settings saved' },
    );
    if (result) {
      setInitial(JSON.stringify(draft));
      reload();
      if (storeId) await refreshCatalog(storeId).catch(() => undefined);
    }
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <PageHeader title="Settings" />
        <ErrorState title="Not your call" message="Changing settings needs the settings permission." />
      </div>
    );
  }

  const locked = (key: string) => ownerOnlyKeys.has(key) && !isOwner;
  const lockHint = 'Owner only — this appears on every invoice.';

  return (
    <div className="p-6">
      <PageHeader
        title="Settings"
        description="How the business runs. Changes here reach every till on its next sync."
      />

      <Tabs items={TABS} active={tab} onChange={(id) => setTab(id as Scope)} className="mb-4" />

      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted"><Spinner /> Loading…</p>
      ) : (
        <div className="max-w-3xl space-y-4">
          {tab === 'general' ? (
            <Card title="The business" description="What appears on invoices and the customer's bill page.">
              <FormGrid>
                <Field label="Business name" htmlFor="bname" hint={locked('businessName') ? lockHint : undefined}>
                  <Input
                    id="bname"
                    disabled={locked('businessName')}
                    value={String(draft.businessName ?? '')}
                    onChange={(e) => set('businessName', e.target.value)}
                  />
                </Field>
                <Field label="GSTIN" htmlFor="gstin" hint={locked('gstin') ? lockHint : 'Printed on every invoice.'}>
                  <Input
                    id="gstin"
                    disabled={locked('gstin')}
                    className="font-mono"
                    value={String(draft.gstin ?? '')}
                    onChange={(e) => set('gstin', e.target.value)}
                  />
                </Field>
                <Field label="Currency" htmlFor="currency" hint={locked('currency') ? lockHint : undefined}>
                  <Input id="currency" disabled value={String(draft.currency ?? 'INR')} />
                </Field>
                <Field label="Timezone" htmlFor="tz" hint="Decides which day a sale belongs to.">
                  <Input
                    id="tz"
                    value={String(draft.timezone ?? 'Asia/Kolkata')}
                    onChange={(e) => set('timezone', e.target.value)}
                  />
                </Field>
              </FormGrid>
              {!isOwner ? (
                <div className="mt-4">
                  <Notice tone="info">
                    The greyed fields are owner-only. They print on every invoice, and an invoice series
                    has to stay consistent across a financial year.
                  </Notice>
                </div>
              ) : null}
            </Card>
          ) : null}

          {tab === 'orders' ? (
            <Card title="Orders" description="Numbering, and who may undo what.">
              <FormGrid>
                <Field label="Order prefix" htmlFor="prefix" hint={locked('numberPrefix') ? lockHint : 'NK-MUM01-260826-0042'}>
                  <Input
                    id="prefix"
                    disabled={locked('numberPrefix')}
                    className="font-mono"
                    value={String(draft.numberPrefix ?? 'NK')}
                    onChange={(e) => set('numberPrefix', e.target.value.toUpperCase())}
                  />
                </Field>
                <Field
                  label="Cancelling after preparation starts"
                  htmlFor="cancelrule"
                  hint="By then the stock has already moved."
                >
                  <Select
                    id="cancelrule"
                    value={String(draft.cancelAfterAcceptedRequires ?? 'MANAGER')}
                    onChange={(e) => set('cancelAfterAcceptedRequires', e.target.value)}
                  >
                    <option value="MANAGER">Manager or above</option>
                    <option value="ADMIN">Admin or above</option>
                  </Select>
                </Field>
              </FormGrid>
              <div className="mt-4">
                <Checkbox
                  checked={Boolean(draft.refundRequiresApproval ?? true)}
                  onChange={(v) => set('refundRequiresApproval', v)}
                  label="Refunds need a second person to approve"
                  hint="Strongly recommended. The database enforces it regardless — nobody can approve their own."
                />
              </div>
            </Card>
          ) : null}

          {tab === 'payments' ? (
            <Card title="How customers can pay">
              <div className="space-y-2.5">
                {[
                  ['cashEnabled', 'Cash', 'Opens the drawer and calculates change.'],
                  ['upiEnabled', 'UPI', 'Scan the counter QR.'],
                  ['cardEnabled', 'Card', 'Swipe on the terminal.'],
                  ['razorpayEnabled', 'Razorpay', 'Not connected in this build — see Settings → integrations.'],
                ].map(([key, label, hint]) => (
                  <Checkbox
                    key={key}
                    checked={Boolean(draft[key] ?? false)}
                    onChange={(v) => set(key, v)}
                    label={label}
                    hint={hint}
                  />
                ))}
              </div>
              <div className="mt-4">
                <Notice tone="warning" title="Razorpay is mocked">
                  Charges are simulated locally. Nothing reaches Razorpay, and no money moves.
                </Notice>
              </div>
            </Card>
          ) : null}

          {tab === 'taxes' ? (
            <Card title="Tax" description="Applied on the discounted value, rounded once at the end.">
              <FormGrid>
                <Field label="Default rate" htmlFor="deftax" hint="Used by new products.">
                  <Select
                    id="deftax"
                    value={String(draft.defaultTaxRateId ?? '')}
                    onChange={(e) => set('defaultTaxRateId', e.target.value)}
                  >
                    {taxRates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} — {(t.rateBps / 100).toFixed(2)}%</option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <div className="mt-4">
                <Checkbox
                  checked={Boolean(draft.pricesIncludeTax ?? false)}
                  onChange={(v) => set('pricesIncludeTax', v)}
                  label="Menu prices already include tax"
                  hint="Changes how the total is worked out, not what the customer pays."
                />
              </div>
            </Card>
          ) : null}

          {tab === 'inventory' ? (
            <Card title="Inventory" description="How stock reacts to what happens at the counter.">
              <div className="space-y-2.5">
                <Checkbox
                  checked={Boolean(draft.autoDeductOnPreparing ?? true)}
                  onChange={(v) => set('autoDeductOnPreparing', v)}
                  label="Deduct stock when a drink starts being made"
                  hint="Not at payment. A payment can be reversed; milk poured cannot."
                />
                <Checkbox
                  checked={Boolean(draft.blockSaleWhenOutOfStock ?? true)}
                  onChange={(v) => set('blockSaleWhenOutOfStock', v)}
                  label="Stop the POS selling a drink it cannot make"
                  hint="Checked before the customer pays, never after."
                />
                <Checkbox
                  checked={Boolean(draft.allowOverrideWithPermission ?? true)}
                  onChange={(v) => set('allowOverrideWithPermission', v)}
                  label="Let managers override and sell anyway"
                  hint="For when the count is wrong and the milk is visibly there."
                />
              </div>
            </Card>
          ) : null}

          {tab === 'pos' ? (
            <Card title="The counter" description="How the ordering grid looks and behaves.">
              <div className="space-y-3">
                <Checkbox
                  checked={Boolean(draft.showProductImages ?? true)}
                  onChange={(v) => set('showProductImages', v)}
                  label="Show product images"
                  hint="Turn off for a denser, faster grid on a small screen."
                />
                <Field label="Columns in the grid" htmlFor="cols" hint="Fewer means bigger touch targets.">
                  <Select
                    id="cols"
                    value={String(draft.gridColumns ?? 4)}
                    onChange={(e) => set('gridColumns', Number(e.target.value))}
                    className="max-w-[160px]"
                  >
                    {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
              </div>
            </Card>
          ) : null}

          {tab === 'printer' ? (
            <Card title="Printing" description="Cup labels and receipts.">
              <FormGrid>
                <Field label="Label width" htmlFor="lw">
                  <Input
                    id="lw"
                    type="number"
                    value={Number(draft.labelWidthMm ?? 50)}
                    onChange={(e) => set('labelWidthMm', Number(e.target.value))}
                  />
                </Field>
                <Field label="Label height" htmlFor="lh">
                  <Input
                    id="lh"
                    type="number"
                    value={Number(draft.labelHeightMm ?? 40)}
                    onChange={(e) => set('labelHeightMm', Number(e.target.value))}
                  />
                </Field>
              </FormGrid>
              <div className="mt-4">
                <Notice tone="info">
                  Printing goes through the browser's own print dialogue. A dedicated print agent is
                  specified in docs/14-printing.md and not built here.
                </Notice>
              </div>
            </Card>
          ) : null}

          {tab === 'notifications' ? (
            <Card title="Telling customers" description="What gets sent, and when.">
              <div className="space-y-2.5">
                <Checkbox
                  checked={Boolean(draft.whatsappEnabled ?? false)}
                  onChange={(v) => set('whatsappEnabled', v)}
                  label="WhatsApp"
                  hint="Not connected in this build."
                />
                <Checkbox
                  checked={Boolean(draft.notifyOnReady ?? true)}
                  onChange={(v) => set('notifyOnReady', v)}
                  label="Message the customer when their order is ready"
                />
              </div>
              <div className="mt-4">
                <Notice tone="warning" title="WhatsApp is mocked">
                  Messages are logged against the order but never sent. Templates and providers are
                  specified in docs/11-notifications.md.
                </Notice>
              </div>
            </Card>
          ) : null}

          <FormActions
            dirty={dirty}
            saving={saving}
            error={saveError}
            onSave={() => void submit()}
            onCancel={() => setDraft(JSON.parse(initial))}
          />

          <Card title="This device" description="Local data held on this till only.">
            <p className="mb-3 text-sm text-muted">
              The catalog and any orders taken offline are cached here. Clearing it pulls a fresh copy
              from the server.
            </p>
            {pendingWork > 0 ? (
              <div className="mb-3">
                <Notice tone="danger" title={`${pendingWork} unsynced ${pendingWork === 1 ? 'change' : 'changes'}`}>
                  These have not reached the server yet. Clearing now loses them for good.
                </Notice>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="sm" onClick={() => setResetting(true)}>
                Clear this device's data
              </Button>
              <Button variant="secondary" size="sm" disabled={seedingDemo} onClick={() => void loadDemoHistory()}>
                {seedingDemo ? <Spinner /> : null}
                {seedingDemo ? 'Loading…' : 'Load 2 weeks of demo orders'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-faint">
              For showing this to someone: fills Today, Orders, Live, Payments, Invoices, Customers and
              Analytics on every store with a plausible operating history. Safe to run more than once —
              it only adds, never deletes — and none of it reaches the server. Refunds and the Audit log
              read from the server instead; run <code className="font-mono">npm run db:seed:demo</code> in
              a terminal to fill those two.
            </p>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={async () => {
          await resetLocalData();
          if (storeId) await refreshCatalog(storeId).catch(() => undefined);
          setResetting(false);
          toast.success('Local data cleared', 'The catalog was pulled again from the server.');
        }}
        destructive
        title="Clear this device?"
        confirmLabel="Clear"
        confirmText={pendingWork > 0 ? 'CLEAR' : undefined}
        message={
          pendingWork > 0 ? (
            <>
              There {pendingWork === 1 ? 'is' : 'are'} <strong>{pendingWork}</strong> unsynced{' '}
              {pendingWork === 1 ? 'change' : 'changes'} on this device. Clearing loses{' '}
              {pendingWork === 1 ? 'it' : 'them'} permanently — the server has no copy. Connect to the
              network and let it sync first if you can.
            </>
          ) : (
            <>
              Everything cached on this till is removed and pulled again from the server. Nothing on the
              server is affected, and there is nothing waiting to sync.
            </>
          )
        }
      />
    </div>
  );
}
