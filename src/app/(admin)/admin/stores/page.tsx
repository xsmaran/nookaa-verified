'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Fieldset,
  FormActions, FormGrid, Input, Menu, Notice, Sheet,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { useLocalResource } from '@/hooks/use-resource';
import { useSave } from '@/hooks/use-save';
import { StoreRepository } from '@/repositories/store-repository';
import type { StoreInput, StoreRow } from '@/repositories/store-repository';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { Store } from '@/types';

/**
 * Stores.
 *
 * Each one holds its own stock, its own staff and its own order numbering.
 * A new store opens with a shelf for every ingredient at zero rather than no
 * inventory rows at all, so "we have none of that" and "we have never carried
 * that" stay different states from day one.
 */
export default function StoresPage() {
  const canManage = usePermission('store.manage');
  const canDelete = usePermission('store.delete');
  const session = useSession((s) => s.session);

  const [editing, setEditing] = useState<Partial<Store> | null>(null);
  const [closing, setClosing] = useState<StoreRow | null>(null);

  const { data, loading, error, reload } = useLocalResource<{ stores: StoreRow[] }>(
    () => StoreRepository.all().then((stores) => ({ stores })),
    [],
  );

  async function close() {
    if (!closing) return;
    try {
      await StoreRepository.close(closing.id, session);
      reload();
      toast.success(`${closing.name} closed`, 'Its history is intact — nothing was deleted.');
    } catch (e) {
      toast.error('Could not close that store', (e as Error).message);
    } finally {
      setClosing(null);
    }
  }

  const columns: Column<StoreRow>[] = [
    {
      key: 'store',
      header: 'Store',
      sortBy: (s) => s.code,
      render: (s) => (
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="tnum font-mono text-xs font-bold">{s.code}</span>
            <span className="truncate text-sm">{s.name.replace('NOOKAA ', '')}</span>
          </span>
          <span className="block truncate text-[11px] text-faint">{s.address}</span>
        </div>
      ),
    },
    {
      key: 'hours',
      header: 'Hours',
      width: '130px',
      secondary: true,
      render: (s) => <span className="tnum font-mono text-xs text-muted">{s.openingTime}–{s.closingTime}</span>,
    },
    {
      key: 'sla',
      header: 'Prep SLA',
      align: 'right',
      width: '100px',
      sortBy: (s) => s.prepSlaMinutes,
      render: (s) => <span className="tnum font-mono text-xs">{s.prepSlaMinutes} min</span>,
    },
    {
      key: 'open',
      header: 'Open now',
      align: 'right',
      width: '110px',
      sortBy: (s) => s.openOrders,
      render: (s) => (
        <span className={`tnum font-mono text-sm ${s.openOrders > 0 ? 'text-status-prep' : 'text-faint'}`}>
          {s.openOrders}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock value',
      align: 'right',
      width: '130px',
      sortBy: (s) => s.stockValueMinor,
      render: (s) => <span className="tnum font-mono text-xs text-muted">{formatMoney(s.stockValueMinor)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (s) => (s.active ? <Badge tone="success">open</Badge> : <Badge>closed</Badge>),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'right',
      render: (s) => (
        canManage ? (
          <Menu
            items={[
              { label: 'Edit', onSelect: () => setEditing(s) },
              {
                label: 'Close store',
                onSelect: () => setClosing(s),
                destructive: true,
                separated: true,
                disabled: !canDelete || !s.active,
              },
            ]}
          />
        ) : null
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Stores"
        description="Each store keeps its own stock, staff and order numbering. Nothing is pooled."
        actions={canManage ? <Button variant="primary" size="sm" onClick={() => setEditing({})}>New store</Button> : undefined}
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable
          rows={data?.stores ?? []}
          columns={columns}
          loading={loading}
          rowKey={(s) => s.id}
          onRowClick={canManage ? setEditing : undefined}
          defaultSort={{ key: 'store', direction: 'asc' }}
          rowTone={(s) => (s.active ? 'default' : 'muted')}
          empty={<EmptyState title="No stores" hint="A POS needs at least one." />}
        />
      )}

      <StoreEditor open={editing !== null} store={editing} onClose={() => setEditing(null)} onSaved={reload} />

      <ConfirmDialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        onConfirm={close}
        destructive
        title="Close this store?"
        confirmLabel="Close store"
        confirmText={closing?.code}
        message={
          <>
            <strong>{closing?.name}</strong> stops accepting orders and disappears from the store switcher.
            Every order, invoice and stock movement it ever recorded stays exactly where it is — this is a
            flag, not a delete. It can be reopened.
            {closing && closing.openOrders > 0 ? (
              <span className="mt-2 block text-status-alert">
                It has {closing.openOrders} open {closing.openOrders === 1 ? 'order' : 'orders'}. This will
                be refused until they are finished.
              </span>
            ) : null}
          </>
        }
      />
    </div>
  );
}

/**
 * Pulls a lat/lng pair out of whatever an admin pastes: a full Google Maps
 * URL (place, search or plain "?q=" links all carry the pin's coordinates
 * somewhere in the string), or the "19.076, 72.8777" text Maps gives you from
 * its own "Copy coordinates" action. Short share links (maps.app.goo.gl/...)
 * don't contain the coordinates themselves — they only resolve after a
 * redirect no browser will follow cross-origin — so those fall through to
 * the manual fields below instead of silently failing.
 */
function parseGoogleMapsCoordinates(input: string): { lat: number; lng: number } | null {
  const text = input.trim();
  if (!text) return null;
  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,                              // .../@19.076,72.8777,17z
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,                          // ...!3d19.076!4d72.8777...
    /[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,                         // ?q=19.076,72.8777
    /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/,             // a plain "19.076, 72.8777" paste
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

function StoreEditor({
  open,
  store,
  onClose,
  onSaved,
}: {
  open: boolean;
  store: Partial<Store> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { save, saving, error, fieldErrors, clearError } = useSave();
  const session = useSession((s) => s.session);
  const isNew = !store?.id;
  const [draft, setDraft] = useState<Partial<Store>>({});
  const [initial, setInitial] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [mapsLinkStatus, setMapsLinkStatus] = useState<'idle' | 'matched' | 'unmatched'>('idle');

  useEffect(() => {
    if (!open) return;
    const base: Partial<Store> = {
      timezone: 'Asia/Kolkata', openingTime: '08:00', closingTime: '23:00',
      prepSlaMinutes: 6, active: true, ...store,
    };
    setDraft(base);
    setInitial(JSON.stringify(base));
    setMapsLink('');
    setMapsLinkStatus('idle');
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const set = <K extends keyof Store>(k: K, v: Store[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function applyMapsLink(value: string) {
    setMapsLink(value);
    if (!value.trim()) {
      setMapsLinkStatus('idle');
      return;
    }
    const coords = parseGoogleMapsCoordinates(value);
    if (coords) {
      set('latitude', coords.lat);
      set('longitude', coords.lng);
      setMapsLinkStatus('matched');
      return;
    }
    // Short links (maps.app.goo.gl) carry no coordinates themselves — only
    // the page they redirect to does, and following that redirect to read it
    // needs a server round trip this frontend-only build no longer has. Fall
    // through to the manual fields below instead.
    setMapsLinkStatus('unmatched');
  }

  const searchQuery = [draft.name, draft.address, draft.city].filter(Boolean).join(', ') || 'store location';
  const searchHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
  const hasCoords = typeof draft.latitude === 'number' && typeof draft.longitude === 'number';
  const viewHref = hasCoords ? `https://www.google.com/maps?q=${draft.latitude},${draft.longitude}` : null;

  async function submit() {
    const payload: StoreInput = {
      id: draft.id, code: draft.code ?? '', name: draft.name ?? '', address: draft.address ?? '', city: draft.city ?? '',
      phone: draft.phone ?? '', gstin: draft.gstin ?? '', timezone: draft.timezone,
      openingTime: draft.openingTime ?? '', closingTime: draft.closingTime ?? '',
      prepSlaMinutes: draft.prepSlaMinutes ?? 6, active: draft.active ?? true,
      latitude: draft.latitude, longitude: draft.longitude,
    };
    const result = await save(
      () => (isNew
        ? StoreRepository.create(payload, session)
        : StoreRepository.update(draft.id!, payload, session)),
      { successMessage: isNew ? `${draft.name} is open` : `${draft.name} updated` },
    );
    if (result) { onSaved(); onClose(); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'New store' : draft.name ?? ''} width="md">
      <div className="space-y-5">
        <FormGrid>
          <Field
            label="Store code"
            required
            htmlFor="scode"
            error={fieldErrors.code}
            hint="Appears in every order number from this store — MUM01."
          >
            <Input
              id="scode"
              value={draft.code ?? ''}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              className="font-mono uppercase"
              disabled={!isNew}
              placeholder="MUM04"
            />
          </Field>
          <Field label="Name" required htmlFor="stname" error={fieldErrors.name}>
            <Input id="stname" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="City" htmlFor="scity">
            <Input id="scity" value={draft.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="sphone2">
            <Input id="sphone2" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Opens" htmlFor="sopen" error={fieldErrors.openingTime}>
            <Input id="sopen" type="time" value={draft.openingTime ?? ''} onChange={(e) => set('openingTime', e.target.value)} />
          </Field>
          <Field label="Closes" htmlFor="sclose" error={fieldErrors.closingTime}>
            <Input id="sclose" type="time" value={draft.closingTime ?? ''} onChange={(e) => set('closingTime', e.target.value)} />
          </Field>
          <Field
            label="Prep target"
            htmlFor="ssla"
            hint="Minutes from accepted to ready. Drives the brew clock."
          >
            <Input
              id="ssla"
              type="number"
              min={1}
              max={120}
              value={draft.prepSlaMinutes ?? 6}
              onChange={(e) => set('prepSlaMinutes', Number(e.target.value))}
            />
          </Field>
          <Field label="GSTIN" htmlFor="sgstin" hint="Leave empty to use the business GSTIN.">
            <Input id="sgstin" value={draft.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} className="font-mono" />
          </Field>
        </FormGrid>

        <Field label="Address" htmlFor="saddr">
          <Input id="saddr" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>

        <Fieldset legend="Location" hint="Pins this store on a map — used for delivery-distance checks and store-finder links.">
          <div className="space-y-3.5">
            <Field
              label="Google Maps link"
              htmlFor="smapslink"
              hint={
                <>
                  <a href={searchHref} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                    Find this store on Google Maps ↗
                  </a>
                  , then paste its full link or copied coordinates here.
                  {mapsLinkStatus === 'matched' ? (
                    <span className="ml-1 text-status-ready">Coordinates detected below.</span>
                  ) : null}
                  {mapsLinkStatus === 'unmatched' ? (
                    <span className="ml-1 text-status-alert">
                      Couldn't read coordinates from that — short maps.app.goo.gl links aren't supported without a
                      server, so open it once and paste the full google.com/maps address instead, or fill in the
                      fields below.
                    </span>
                  ) : null}
                </>
              }
            >
              <Input
                id="smapslink"
                value={mapsLink}
                onChange={(e) => applyMapsLink(e.target.value)}
                placeholder="https://www.google.com/maps/place/...@19.076,72.8777,17z"
              />
            </Field>

            <FormGrid columns={2}>
              <Field label="Latitude" required={isNew} htmlFor="slat" error={fieldErrors.latitude}>
                <Input
                  id="slat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={draft.latitude ?? ''}
                  onChange={(e) => set('latitude', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="font-mono"
                  placeholder="19.076000"
                />
              </Field>
              <Field label="Longitude" required={isNew} htmlFor="slng" error={fieldErrors.longitude}>
                <Input
                  id="slng"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={draft.longitude ?? ''}
                  onChange={(e) => set('longitude', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="font-mono"
                  placeholder="72.877700"
                />
              </Field>
            </FormGrid>

            {viewHref ? (
              <a href={viewHref} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-muted underline hover:text-ink">
                Open this pin on Google Maps ↗
              </a>
            ) : null}
          </div>
        </Fieldset>

        {isNew ? (
          <Notice tone="info" title="What happens when you create this">
            The store opens with a shelf for every ingredient at zero, so stock can be received into it
            straight away. Order numbering starts at 1 today.
          </Notice>
        ) : null}

        <Checkbox
          checked={draft.active ?? true}
          onChange={(v) => set('active', v)}
          label="Open for business"
          hint="A closed store cannot be signed into and takes no orders."
        />

        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          saveLabel={isNew ? 'Open store' : 'Save changes'}
        />
      </div>
    </Sheet>
  );
}
