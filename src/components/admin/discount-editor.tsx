'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Checkbox, Field, Fieldset, FormActions, FormGrid, FormSpan,
  Input, MoneyInput, Notice, RadioGroup, Select, Sheet,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { useCatalog } from '@/hooks/use-catalog';
import { useSave } from '@/hooks/use-save';
import { DiscountRepository } from '@/repositories';
import { useSession } from '@/stores/session-store';
import type { Discount } from '@/types';

/**
 * Create and edit a discount code.
 *
 * The scoping controls are three lists that all mean "everything" when empty,
 * which is the behaviour people expect and the one that is easiest to get
 * wrong — so the form says so in words rather than leaving it to be discovered
 * when a coffee promotion turns out to apply to food as well.
 */
export function DiscountEditor({
  open,
  discount,
  onClose,
  onSaved,
}: {
  open: boolean;
  discount: Partial<Discount> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { stores, categories, products } = useCatalog();
  const { save, saving, error, fieldErrors, clearError } = useSave();
  const session = useSession((s) => s.session);

  const isNew = !discount?.id;
  const [draft, setDraft] = useState<Partial<Discount>>({});
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!open) return;
    const base: Partial<Discount> = {
      kind: 'PERCENT',
      value: 1000,
      minOrderMinor: 0,
      active: true,
      requiresApproval: false,
      productIds: [],
      categoryIds: [],
      storeIds: [],
      ...discount,
    };
    setDraft(base);
    setInitial(JSON.stringify(base));
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, discount?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const set = <K extends keyof Discount>(key: K, value: Discount[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // A worked example beats a description of the rules. This is what the code
  // would take off a ₹500 order, computed the same way the server does.
  const example = useMemo(() => {
    const basket = 50000;
    if ((draft.minOrderMinor ?? 0) > basket) return null;
    let amount = draft.kind === 'PERCENT'
      ? Math.round((basket * (draft.value ?? 0)) / 10000)
      : Math.min(draft.value ?? 0, basket);
    if (draft.maxDiscountMinor) amount = Math.min(amount, draft.maxDiscountMinor);
    return amount;
  }, [draft.kind, draft.value, draft.maxDiscountMinor, draft.minOrderMinor]);

  function toggle(key: 'productIds' | 'categoryIds' | 'storeIds', id: string) {
    const current = draft[key] ?? [];
    set(key, (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) as never);
  }

  async function submit() {
    const payload = {
      code: draft.code ?? '',
      name: draft.name ?? '',
      kind: draft.kind ?? 'PERCENT',
      value: draft.value ?? 0,
      minOrderMinor: draft.minOrderMinor ?? 0,
      maxDiscountMinor: draft.maxDiscountMinor ?? null,
      startsAt: draft.startsAt || null,
      endsAt: draft.endsAt || null,
      usageLimit: draft.usageLimit ?? null,
      perCustomerLimit: draft.perCustomerLimit ?? null,
      productIds: draft.productIds ?? [],
      categoryIds: draft.categoryIds ?? [],
      storeIds: draft.storeIds ?? [],
      requiresApproval: draft.requiresApproval ?? false,
      active: draft.active ?? true,
    };

    const result = await save(
      () => (isNew
        ? DiscountRepository.create(payload, session)
        : DiscountRepository.update(draft.id!, payload, session)),
      { successMessage: isNew ? `${draft.code} is ready to use` : `${draft.code} updated` },
    );

    if (result) { onSaved(); onClose(); }
  }

  /** datetime-local wants 'YYYY-MM-DDTHH:mm'; the API speaks ISO with a zone. */
  const toLocal = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
  const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'New discount code' : draft.code ?? ''}
      subtitle={isNew ? 'Staff apply this at the counter' : draft.name}
      width="lg"
    >
      <div className="space-y-5">
        <FormGrid>
          <Field label="Code" required htmlFor="code" error={fieldErrors.code}
            hint="What staff type. Letters, numbers, - and _.">
            <Input
              id="code"
              value={draft.code ?? ''}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              className="font-mono uppercase"
              placeholder="WELCOME10"
            />
          </Field>
          <Field label="Name" required htmlFor="name" error={fieldErrors.name}
            hint="How it reads on the ticket and in reports">
            <Input
              id="name"
              value={draft.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Welcome — 10% off"
            />
          </Field>
        </FormGrid>

        <Fieldset legend="What it takes off">
          <div className="grid gap-4 sm:grid-cols-2">
            <RadioGroup
              name="kind"
              value={draft.kind ?? 'PERCENT'}
              onChange={(kind) => set('kind', kind)}
              options={[
                { value: 'PERCENT', label: 'A percentage', hint: 'Off whatever qualifies' },
                { value: 'FLAT', label: 'A fixed amount', hint: 'Never more than the basket' },
              ]}
            />

            <div className="space-y-3.5">
              {draft.kind === 'PERCENT' ? (
                <Field label="Percentage" required htmlFor="pct" error={fieldErrors.value}>
                  <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-gold">
                    <input
                      id="pct"
                      type="number"
                      min={1}
                      max={100}
                      value={(draft.value ?? 0) / 100}
                      onChange={(e) => set('value', Math.round(Number(e.target.value) * 100))}
                      className="tnum h-11 w-full rounded-l-md bg-transparent px-3 font-mono text-sm focus:outline-none"
                    />
                    <span className="border-l border-line px-3 text-xs text-muted">%</span>
                  </div>
                </Field>
              ) : (
                <Field label="Amount" required htmlFor="flat" error={fieldErrors.value}>
                  <MoneyInput id="flat" valueMinor={draft.value ?? 0} onChange={(v) => set('value', v ?? 0)} />
                </Field>
              )}

              {draft.kind === 'PERCENT' ? (
                <Field label="Cap the discount at" htmlFor="max" hint="Optional. Stops a big order costing too much.">
                  <MoneyInput
                    id="max"
                    valueMinor={draft.maxDiscountMinor ?? null}
                    onChange={(v) => set('maxDiscountMinor', v)}
                    placeholder="No cap"
                  />
                </Field>
              ) : null}
            </div>
          </div>

          {example !== null ? (
            <p className="mt-3 text-xs text-muted">
              On a {formatMoney(50000)} order this takes off{' '}
              <span className="tnum font-mono font-semibold text-ink">{formatMoney(example)}</span>.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">
              A {formatMoney(50000)} order would not reach the minimum spend.
            </p>
          )}
        </Fieldset>

        <Fieldset legend="When it applies">
          <FormGrid>
            <Field label="Minimum order" htmlFor="min" hint="Tested against the whole order">
              <MoneyInput
                id="min"
                valueMinor={draft.minOrderMinor ?? 0}
                onChange={(v) => set('minOrderMinor', v ?? 0)}
              />
            </Field>
            <Field label="Total uses" htmlFor="limit" hint="Leave empty for unlimited">
              <Input
                id="limit"
                type="number"
                min={1}
                value={draft.usageLimit ?? ''}
                onChange={(e) => set('usageLimit', e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited"
              />
            </Field>
            <Field label="Starts" htmlFor="starts" hint="Leave empty to start now">
              <Input
                id="starts"
                type="datetime-local"
                value={toLocal(draft.startsAt)}
                onChange={(e) => set('startsAt', toIso(e.target.value))}
              />
            </Field>
            <Field label="Ends" htmlFor="ends" error={fieldErrors.endsAt} hint="Leave empty to run until paused">
              <Input
                id="ends"
                type="datetime-local"
                value={toLocal(draft.endsAt)}
                onChange={(e) => set('endsAt', toIso(e.target.value))}
              />
            </Field>
            <Field label="Uses per customer" htmlFor="perCustomer" hint="Counted by phone number">
              <Input
                id="perCustomer"
                type="number"
                min={1}
                value={draft.perCustomerLimit ?? ''}
                onChange={(e) => set('perCustomerLimit', e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited"
              />
            </Field>
          </FormGrid>

          <div className="mt-4 space-y-2.5">
            <Checkbox
              checked={draft.active ?? true}
              onChange={(v) => set('active', v)}
              label="Live"
              hint="Untick to pause without losing the code or its history."
            />
            <Checkbox
              checked={draft.requiresApproval ?? false}
              onChange={(v) => set('requiresApproval', v)}
              label="Needs a manager to approve each use"
              hint="For staff discounts and service recovery."
            />
          </div>
        </Fieldset>

        <Fieldset legend="Where it applies" hint="Leave a list empty to mean everything in it.">
          <div className="grid gap-4 lg:grid-cols-3">
            <Scope
              title="Stores"
              empty="Every store"
              items={stores.map((s) => ({ id: s.id, label: `${s.code} · ${s.name.replace('NOOKAA ', '')}` }))}
              selected={draft.storeIds ?? []}
              onToggle={(id) => toggle('storeIds', id)}
            />
            <Scope
              title="Categories"
              empty="Every category"
              items={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={draft.categoryIds ?? []}
              onToggle={(id) => toggle('categoryIds', id)}
            />
            <Scope
              title="Specific products"
              empty="Every product"
              items={products.map((p) => ({ id: p.id, label: p.spec }))}
              selected={draft.productIds ?? []}
              onToggle={(id) => toggle('productIds', id)}
            />
          </div>

          {(draft.productIds?.length ?? 0) > 0 || (draft.categoryIds?.length ?? 0) > 0 ? (
            <div className="mt-3">
              <Notice tone="info">
                The discount comes off only the qualifying lines. The minimum spend is still measured
                against the whole order.
              </Notice>
            </div>
          ) : null}
        </Fieldset>

        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          onCancel={dirty ? () => { setDraft(JSON.parse(initial)); clearError(); } : undefined}
          saveLabel={isNew ? 'Create code' : 'Save changes'}
        />
      </div>
    </Sheet>
  );
}

function Scope({
  title,
  empty,
  items,
  selected,
  onToggle,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="eyebrow mb-1">{title}</p>
      <p className="mb-1.5 text-[11px] text-faint">
        {selected.length === 0 ? empty : `${selected.length} selected`}
      </p>
      <div className="scroll-y max-h-44 rounded-md border border-line p-2">
        {items.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-sunk">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => onToggle(item.id)}
              className="h-3.5 w-3.5 shrink-0 accent-ink"
            />
            <span className="truncate text-xs">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
