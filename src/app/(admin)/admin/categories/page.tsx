'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field,
  FormActions, FormGrid, ImageField, Input, Menu, Sheet, Spinner, Textarea,
} from '@/components/ui';
import { useLocalResource } from '@/hooks/use-resource';
import { useSave } from '@/hooks/use-save';
import { CategoryRepository, refreshCatalog } from '@/repositories';
import type { CategoryRow } from '@/repositories';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Category, Session } from '@/types';

/**
 * Categories.
 *
 * A list rather than a table, because the thing you do here most is reorder
 * them — this is the POS's left-hand rail, and the order is the difference
 * between a barista reaching for the right tab and hunting for it.
 *
 * The whole order is sent in one request when it changes, so no till ever sees
 * two categories claiming the same position mid-drag.
 */
export default function CategoriesPage() {
  const canManage = usePermission('catalog.manage');
  const session = useSession((s) => s.session);
  const storeId = session?.storeId;

  const { data, loading, error, reload } = useLocalResource<{ categories: CategoryRow[] }>(
    canManage ? () => CategoryRepository.all(true).then((categories) => ({ categories })) : null,
  );

  const [order, setOrder] = useState<CategoryRow[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [confirming, setConfirming] = useState<CategoryRow | null>(null);

  useEffect(() => {
    if (data) { setOrder(data.categories.filter((c) => !c.archivedAt)); setOrderDirty(false); }
  }, [data]);

  const archived = (data?.categories ?? []).filter((c) => c.archivedAt);

  function move(index: number, direction: -1 | 1) {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setOrderDirty(true);
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      await CategoryRepository.reorder(order.map((c) => c.id), session);
      setOrderDirty(false);
      if (storeId) await refreshCatalog(storeId).catch(() => undefined);
      toast.success('Category order saved', 'The POS rail follows this order.');
    } catch (e) {
      toast.error('Could not save the order', (e as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }

  async function archive() {
    if (!confirming) return;
    try {
      await CategoryRepository.archive(confirming.id, session);
      reload();
      if (storeId) await refreshCatalog(storeId).catch(() => undefined);
      toast.success(`${confirming.name} archived`);
    } catch (e) {
      toast.error('Could not archive', (e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <PageHeader title="Categories" />
        <ErrorState title="Not your call" message="Changing the menu needs the catalog permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Categories"
        description="The tabs down the left of the POS, in the order they appear there."
        actions={<Button variant="primary" size="sm" onClick={() => setEditing({})}>New category</Button>}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted"><Spinner /> Loading…</p>
      ) : order.length === 0 && archived.length === 0 ? (
        <EmptyState title="No categories yet" hint="The POS groups drinks by these." />
      ) : (
        <div className="max-w-3xl">
          <ul className="overflow-hidden rounded-md border border-line bg-surface">
            {order.map((category, index) => (
              <li key={category.id} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
                <span className="tnum w-6 shrink-0 text-center font-mono text-xs text-faint">{index + 1}</span>

                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${category.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="h-4 rounded px-1 text-[10px] leading-none text-muted hover:bg-sunk hover:text-ink disabled:opacity-20"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${category.name} down`}
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                    className="h-4 rounded px-1 text-[10px] leading-none text-muted hover:bg-sunk hover:text-ink disabled:opacity-20"
                  >
                    ▼
                  </button>
                </div>

                <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-line bg-sunk">
                  {category.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={category.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(category)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{category.name}</span>
                    <span className="shrink-0 text-[11px] text-faint">tab: {category.shortName}</span>
                    {!category.active ? <Badge>hidden</Badge> : null}
                  </span>
                  {category.tagline ? (
                    <span className="mt-0.5 block truncate text-xs text-muted">{category.tagline}</span>
                  ) : null}
                </button>

                <span className="tnum shrink-0 font-mono text-xs text-muted">
                  {category.productCount} {category.productCount === 1 ? 'drink' : 'drinks'}
                </span>

                <Menu
                  items={[
                    { label: 'Edit', onSelect: () => setEditing(category) },
                    {
                      label: 'Archive',
                      onSelect: () => setConfirming(category),
                      destructive: true,
                      separated: true,
                      disabled: category.productCount > 0,
                    },
                  ]}
                />
              </li>
            ))}
          </ul>

          {orderDirty ? (
            <div className="mt-3 flex items-center justify-between rounded-md border border-line bg-surface px-4 py-2.5">
              <p className="text-xs text-muted">The POS rail will follow this order.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setOrder(data?.categories.filter((c) => !c.archivedAt) ?? []); setOrderDirty(false); }}>
                  Discard
                </Button>
                <Button size="sm" variant="primary" onClick={() => void saveOrder()} disabled={savingOrder}>
                  {savingOrder ? 'Saving…' : 'Save order'}
                </Button>
              </div>
            </div>
          ) : null}

          {archived.length > 0 ? (
            <section className="mt-6">
              <p className="eyebrow mb-2">Archived</p>
              <ul className="overflow-hidden rounded-md border border-dashed border-line">
                {archived.map((category) => (
                  <li key={category.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-0">
                    <span className="text-sm text-muted">{category.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void CategoryRepository.restore(category.id, session)
                        .then(() => {
                          reload();
                          if (storeId) void refreshCatalog(storeId).catch(() => undefined);
                          toast.success(`${category.name} restored`);
                        })
                        .catch((e) => toast.error('Could not restore', (e as Error).message))}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <CategoryEditor
        open={editing !== null}
        category={editing}
        session={session}
        onClose={() => setEditing(null)}
        onSaved={() => { reload(); if (storeId) void refreshCatalog(storeId).catch(() => undefined); }}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={archive}
        destructive
        title="Archive this category?"
        confirmLabel="Archive"
        message={<><strong>{confirming?.name}</strong> disappears from the POS rail. It has no drinks in it, so nothing else changes.</>}
      />
    </div>
  );
}

function CategoryEditor({
  open,
  category,
  session,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: Partial<Category> | null;
  session: Session | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { save, saving, error, fieldErrors, clearError } = useSave();
  const isNew = !category?.id;
  const [draft, setDraft] = useState<Partial<Category>>({});
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!open) return;
    const base = { active: true, tagline: '', ...category };
    setDraft(base);
    setInitial(JSON.stringify(base));
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const set = <K extends keyof Category>(k: K, v: Category[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    const payload = {
      name: draft.name ?? '',
      shortName: draft.shortName ?? '',
      tagline: draft.tagline ?? '',
      imageUrl: draft.imageUrl ?? null,
      active: draft.active ?? true,
    };
    const result = await save(
      () => (isNew
        ? CategoryRepository.create(payload, session)
        : CategoryRepository.update(draft.id!, payload, session)),
      { successMessage: isNew ? `${draft.name} added` : `${draft.name} updated` },
    );
    if (result) { onSaved(); onClose(); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'New category' : draft.name ?? ''} width="md">
      <div className="space-y-5">
        <FormGrid>
          <Field label="Name" required htmlFor="cname" error={fieldErrors.name} hint="How the office refers to it">
            <Input id="cname" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Iced Coffee" />
          </Field>
          <Field label="POS tab" required htmlFor="short" error={fieldErrors.shortName}
            hint="Short — this has to fit the rail">
            <Input id="short" value={draft.shortName ?? ''} onChange={(e) => set('shortName', e.target.value)} placeholder="Iced" />
          </Field>
        </FormGrid>

        <Field label="Tagline" htmlFor="tag" hint="Optional. Appears above the grid.">
          <Textarea id="tag" rows={2} value={draft.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} />
        </Field>

        <ImageField
          value={draft.imageUrl}
          onChange={(url) => set('imageUrl', url)}
          label="Icon"
          hint="Optional. Shown beside the tab name."
        />

        <Checkbox
          checked={draft.active ?? true}
          onChange={(v) => set('active', v)}
          label="Visible on the POS"
          hint="Hiding a category hides its tab. The drinks in it stay on the menu."
        />

        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          saveLabel={isNew ? 'Create category' : 'Save changes'}
        />
      </div>
    </Sheet>
  );
}
