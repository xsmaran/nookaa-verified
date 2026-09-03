'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, FormActions,
  FormGrid, Input, Menu, MoneyInput, Notice, QuantityInput, Select, Sheet, Spinner,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { useCatalog } from '@/hooks/use-catalog';
import { useLocalResource } from '@/hooks/use-resource';
import { useSave } from '@/hooks/use-save';
import { ModifierRepository, refreshCatalog } from '@/repositories';
import type { ModifierGroupRow as GroupRow } from '@/repositories';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { ModifierGroup, ModifierOption, Session } from '@/types';

/**
 * Options and add-ons.
 *
 * A group is one question the POS asks — milk, sweetness, size — and its
 * options are the answers. Two things make an option more than a label: a
 * price adjustment, and an ingredient delta that tells the inventory what
 * choosing it actually pours.
 */
export default function ModifiersPage() {
  const canManage = usePermission('catalog.manage');
  const session = useSession((s) => s.session);
  const storeId = session?.storeId;

  const [editing, setEditing] = useState<Partial<ModifierGroup> | null>(null);
  const [confirming, setConfirming] = useState<GroupRow | null>(null);

  const { data, loading, error, reload } = useLocalResource<{ groups: GroupRow[] }>(
    () => ModifierRepository.all().then((groups) => ({ groups })),
  );

  async function archive() {
    if (!confirming) return;
    try {
      await ModifierRepository.archive(confirming.id, session);
      reload();
      if (storeId) await refreshCatalog(storeId).catch(() => undefined);
      toast.success(`${confirming.name} archived`);
    } catch (e) {
      toast.error('Could not archive', (e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Options & add-ons"
        description="The questions the POS asks when a drink is tapped, and what each answer costs."
        actions={canManage ? <Button variant="primary" size="sm" onClick={() => setEditing({})}>New group</Button> : undefined}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted"><Spinner /> Loading…</p>
      ) : (data?.groups ?? []).length === 0 ? (
        <EmptyState title="No option groups" hint="Milk, sweetness, size, add-ons — each is a group." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(data?.groups ?? []).map((group) => (
            <section key={group.id} className="rounded-md border border-line bg-surface">
              <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {group.name}
                    <Badge tone={group.required ? 'warning' : 'neutral'}>
                      {group.required ? 'required' : 'optional'}
                    </Badge>
                    <Badge>{group.selection === 'SINGLE' ? 'pick one' : 'pick many'}</Badge>
                    {group.maxSelections ? <Badge>max {group.maxSelections}</Badge> : null}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Offered on {group.usedByProducts} {group.usedByProducts === 1 ? 'drink' : 'drinks'}
                  </p>
                </div>
                {canManage ? (
                  <Menu
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(group) },
                      {
                        label: 'Archive',
                        onSelect: () => setConfirming(group),
                        destructive: true,
                        separated: true,
                        disabled: group.usedByProducts > 0,
                      },
                    ]}
                  />
                ) : null}
              </header>

              <ul className="divide-y divide-line">
                {group.options.map((option) => (
                  <li key={option.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm">{option.name}</span>
                      {option.isDefault ? <Badge tone="info">default</Badge> : null}
                      {(option.ingredientDelta?.length ?? 0) > 0 ? (
                        <span
                          className="text-[10px] uppercase tracking-wider text-faint"
                          title="Choosing this changes what the recipe draws from stock"
                        >
                          affects stock
                        </span>
                      ) : null}
                    </span>
                    <span className={`tnum shrink-0 font-mono text-xs
                      ${option.priceMinor > 0 ? 'text-ink' : 'text-faint'}`}>
                      {option.priceMinor > 0 ? `+${formatMoney(option.priceMinor)}` : 'no charge'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ModifierEditor
        open={editing !== null}
        group={editing}
        session={session}
        onClose={() => setEditing(null)}
        onSaved={() => { reload(); if (storeId) void refreshCatalog(storeId).catch(() => undefined); }}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={archive}
        destructive
        title="Archive this group?"
        confirmLabel="Archive"
        message={
          <>
            <strong>{confirming?.name}</strong> stops being offered on the POS. Orders that already used it
            keep their own copy of the option names and prices, so nothing sold changes.
          </>
        }
      />
    </div>
  );
}

function ModifierEditor({
  open,
  group,
  session,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: Partial<ModifierGroup> | null;
  session: Session | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { ingredients } = useCatalog();
  const { save, saving, error, fieldErrors, clearError } = useSave();

  const isNew = !group?.id;
  const [draft, setDraft] = useState<Partial<ModifierGroup>>({});
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!open) return;
    const base: Partial<ModifierGroup> = {
      selection: 'SINGLE', required: false, active: true,
      options: [{ id: '', name: '', priceMinor: 0, isDefault: true, ingredientDelta: [] }],
      ...group,
    };
    setDraft(base);
    setInitial(JSON.stringify(base));
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const options = draft.options ?? [];

  function patchOption(index: number, patch: Partial<ModifierOption>) {
    setDraft((d) => ({
      ...d,
      options: (d.options ?? []).map((o, i) => {
        if (i !== index) {
          // A single-choice group can only have one default, so setting one
          // has to clear the others — the POS cannot resolve two.
          return patch.isDefault && d.selection === 'SINGLE' ? { ...o, isDefault: false } : o;
        }
        return { ...o, ...patch };
      }),
    }));
  }

  async function submit() {
    const payload = {
      name: draft.name ?? '',
      selection: draft.selection ?? 'SINGLE' as const,
      required: draft.required ?? false,
      maxSelections: draft.maxSelections ?? null,
      active: draft.active ?? true,
      options: options
        .filter((o) => o.name.trim())
        .map((o) => ({
          ...(o.id ? { id: o.id } : {}),
          name: o.name,
          priceMinor: o.priceMinor,
          isDefault: o.isDefault ?? false,
          ingredientDelta: (o.ingredientDelta ?? []).filter((d) => d.ingredientId && d.qty !== 0),
          active: o.active !== false,
        })),
    };

    const result = await save(
      () => (isNew
        ? ModifierRepository.create(payload, session)
        : ModifierRepository.update(draft.id!, payload, session)),
      { successMessage: isNew ? `${draft.name} created` : `${draft.name} updated` },
    );
    if (result) { onSaved(); onClose(); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'New option group' : draft.name ?? ''} width="lg">
      <div className="space-y-5">
        <FormGrid>
          <Field label="Group name" required htmlFor="gname" error={fieldErrors.name}
            hint="The question the POS asks — Milk, Sweetness, Size">
            <Input id="gname" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="How many can be picked" htmlFor="gsel">
            <Select
              id="gsel"
              value={draft.selection ?? 'SINGLE'}
              onChange={(e) => setDraft({ ...draft, selection: e.target.value as 'SINGLE' | 'MULTI' })}
            >
              <option value="SINGLE">One — radio buttons</option>
              <option value="MULTI">Several — checkboxes</option>
            </Select>
          </Field>
        </FormGrid>

        <div className="flex flex-wrap items-center gap-5">
          <Checkbox
            checked={draft.required ?? false}
            onChange={(v) => setDraft({ ...draft, required: v })}
            label="Required"
            hint="The POS will not let the drink into the cart until this is answered."
          />
          {draft.selection === 'MULTI' ? (
            <div className="w-36">
              <Field label="Maximum" htmlFor="gmax">
                <Input
                  id="gmax"
                  type="number"
                  min={1}
                  value={draft.maxSelections ?? ''}
                  onChange={(e) => setDraft({
                    ...draft,
                    maxSelections: e.target.value ? Number(e.target.value) : null,
                  })}
                  placeholder="No limit"
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="eyebrow">Options</p>
            <p className="text-[11px] text-faint">The order here is the order on the POS</p>
          </div>

          <div className="divide-y divide-line">
            {options.map((option, index) => (
              <div key={index} className="space-y-3 px-3 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px] flex-1">
                    <Field label="Name" htmlFor={`opt-${index}`}>
                      <Input
                        id={`opt-${index}`}
                        value={option.name}
                        onChange={(e) => patchOption(index, { name: e.target.value })}
                        placeholder="Oat milk"
                      />
                    </Field>
                  </div>
                  <div className="w-36">
                    <Field label="Extra charge" htmlFor={`price-${index}`}>
                      <MoneyInput
                        id={`price-${index}`}
                        valueMinor={option.priceMinor}
                        onChange={(v) => patchOption(index, { priceMinor: v ?? 0 })}
                      />
                    </Field>
                  </div>
                  <div className="pb-2.5">
                    <Checkbox
                      checked={option.isDefault ?? false}
                      onChange={(v) => patchOption(index, { isDefault: v })}
                      label="Default"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${option.name || 'option'}`}
                    onClick={() => setDraft({ ...draft, options: options.filter((_, i) => i !== index) })}
                    className="mb-2 rounded px-2 py-1 text-muted hover:bg-alertSoft hover:text-status-alert"
                  >
                    ✕
                  </button>
                </div>

                {/*
                  What this choice does to stock. Without it, an extra shot is
                  free espresso as far as the inventory is concerned.
                */}
                <div className="rounded bg-sunk px-3 py-2">
                  <p className="eyebrow mb-1.5">Extra ingredients this pulls</p>
                  {(option.ingredientDelta ?? []).map((delta, di) => {
                    const ingredient = ingredients.find((i) => i.id === delta.ingredientId);
                    return (
                      <div key={di} className="mb-1.5 flex items-center gap-2">
                        <Select
                          value={delta.ingredientId}
                          onChange={(e) => patchOption(index, {
                            ingredientDelta: (option.ingredientDelta ?? []).map((d, i) =>
                              i === di ? { ...d, ingredientId: e.target.value } : d),
                          })}
                          className="h-9 flex-1 text-[13px]"
                        >
                          {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </Select>
                        <div className="w-32">
                          <QuantityInput
                            unit={ingredient?.unit ?? ''}
                            value={delta.qty}
                            onChange={(v) => patchOption(index, {
                              ingredientDelta: (option.ingredientDelta ?? []).map((d, i) =>
                                i === di ? { ...d, qty: v ?? 0 } : d),
                            })}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label="Remove ingredient"
                          onClick={() => patchOption(index, {
                            ingredientDelta: (option.ingredientDelta ?? []).filter((_, i) => i !== di),
                          })}
                          className="rounded px-1.5 py-1 text-muted hover:text-status-alert"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => patchOption(index, {
                      ingredientDelta: [
                        ...(option.ingredientDelta ?? []),
                        { ingredientId: ingredients[0]?.id ?? '', qty: 0 },
                      ],
                    })}
                    className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    + Add an ingredient
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-3 py-2">
            <Button
              size="sm"
              onClick={() => setDraft({
                ...draft,
                options: [...options, { id: '', name: '', priceMinor: 0, isDefault: false, ingredientDelta: [] }],
              })}
            >
              Add an option
            </Button>
          </div>
        </div>

        {fieldErrors.options ? (
          <Notice tone="danger">{fieldErrors.options}</Notice>
        ) : null}

        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          saveLabel={isNew ? 'Create group' : 'Save changes'}
        />
      </div>
    </Sheet>
  );
}
