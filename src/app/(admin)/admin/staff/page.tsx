'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Field,
  FormActions, FormGrid, Input, Menu, Notice, SearchInput, Select, Sheet, Tabs, Toolbar,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { manageableRoles } from '@/lib/rbac';
import { useCatalog } from '@/hooks/use-catalog';
import { useSave } from '@/hooks/use-save';
import { useStaff, type PermissionLabel, type RoleDefinition } from '@/hooks/use-staff';
import { StaffService, type StaffCreateInput, type StaffUpdateInput } from '@/services/staff-service';
import { usePermission, useSession } from '@/stores/session-store';
import { toast } from '@/stores/toast-store';
import type { RoleKey, User } from '@/types';

/**
 * Staff and roles.
 *
 * Two tabs: who works here, and what each role can do. The permission matrix
 * is generated from the same table the API enforces, so it is a description of
 * the system rather than documentation of it — it cannot be out of date.
 */
export default function StaffPage() {
  const canView = usePermission('staff.view');
  const canManage = usePermission('staff.manage');
  const myRole = useSession((s) => s.session?.user.role);
  const myId = useSession((s) => s.session?.user.id);
  const session = useSession((s) => s.session);

  const [tab, setTab] = useState('people');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const [confirming, setConfirming] = useState<User | null>(null);

  const { staff, roles, permissions, loading, error, reload } = useStaff({
    enabled: canView,
    includeInactive: true,
  });
  const { storeById } = useCatalog();

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((u) => `${u.name} ${u.phone} ${u.employeeCode ?? ''}`.toLowerCase().includes(needle));
  }, [staff, search]);

  async function deactivate() {
    if (!confirming || !session) return;
    try {
      await StaffService.deactivate(confirming.id, session);
      reload();
      toast.success(`${confirming.name} deactivated`, 'Their session was ended immediately.');
    } catch (e) {
      toast.error('Could not deactivate', (e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  function reactivate(u: User) {
    if (!session) return;
    void StaffService.reactivate(u.id, session)
      .then(() => { reload(); toast.success(`${u.name} reactivated`); })
      .catch((e) => toast.error('Could not reactivate', (e as Error).message));
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Name',
      sortBy: (u) => u.name,
      render: (u) => (
        <div className="min-w-0">
          <span className="block truncate text-sm">
            {u.name}
            {u.id === myId ? <span className="ml-1.5 text-[11px] text-faint">(you)</span> : null}
          </span>
          <span className="tnum block font-mono text-[11px] text-faint">{u.phone}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '150px',
      sortBy: (u) => u.role,
      render: (u) => (
        <Badge tone={u.role === 'OWNER' ? 'gold' : u.role === 'ADMIN' ? 'info' : 'neutral'}>
          {roles.find((r) => r.key === u.role)?.label ?? u.role}
        </Badge>
      ),
    },
    {
      key: 'stores',
      header: 'Posted to',
      secondary: true,
      render: (u) => (
        <span className="text-xs text-muted">
          {u.storeIds.length === 0
            ? 'Every store'
            : u.storeIds.map((id) => storeById.get(id)?.code ?? id).join(', ')}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Employee ID',
      width: '140px',
      secondary: true,
      render: (u) => <span className="tnum font-mono text-xs text-faint">{u.employeeCode ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (u) => (u.active ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'right',
      render: (u) => {
        if (!canManage || !manageableRoles(myRole).includes(u.role)) return null;
        return (
          <Menu
            items={[
              { label: 'Edit', onSelect: () => setEditing(u) },
              { label: 'Reset PIN', onSelect: () => setEditing({ ...u, pin: '' } as never) },
              {
                label: u.active ? 'Deactivate' : 'Reactivate',
                onSelect: () => (u.active ? setConfirming(u) : reactivate(u)),
                destructive: u.active,
                separated: true,
                disabled: u.id === myId,
              },
            ]}
          />
        );
      },
    },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Staff & roles" />
        <ErrorState title="Not your call" message="Seeing the roster needs the staff permission." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Staff & roles"
        description="Who works here and what each role is allowed to do."
        actions={canManage ? <Button variant="primary" size="sm" onClick={() => setEditing({})}>Add someone</Button> : undefined}
      />

      <Tabs
        items={[
          { id: 'people', label: 'People', count: staff.length },
          { id: 'permissions', label: 'Roles & permissions', count: roles.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : tab === 'people' ? (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search staff" />
          </Toolbar>
          <DataTable
            rows={rows}
            columns={columns}
            loading={loading}
            rowKey={(u) => u.id}
            onRowClick={canManage ? setEditing : undefined}
            defaultSort={{ key: 'role', direction: 'asc' }}
            rowTone={(u) => (u.active ? 'default' : 'muted')}
            empty={<EmptyState title="Nobody matches" />}
          />
        </>
      ) : (
        <PermissionMatrix roles={roles} permissions={permissions} />
      )}

      <StaffEditor
        open={editing !== null}
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={deactivate}
        destructive
        title="Deactivate this account?"
        confirmLabel="Deactivate"
        message={
          <>
            <strong>{confirming?.name}</strong> will be signed out immediately and their PIN will stop
            working. Everything they have already done stays on the record — nothing is deleted.
          </>
        }
      />
    </div>
  );
}

/**
 * The permission matrix.
 *
 * Generated from the code, not maintained beside it. If somebody adds a
 * permission and forgets this page, this page still tells the truth.
 */
function PermissionMatrix({ roles, permissions }: { roles: RoleDefinition[]; permissions: PermissionLabel[] }) {
  if (roles.length === 0) return null;

  return (
    <div>
      <div className="mb-3">
        <Notice tone="info" title="This matrix is generated from the code">
          It is the same table every screen checks before showing a button, so what you see here is what
          is actually enforced — not a description of it that can drift.
        </Notice>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Can do
              </th>
              {roles.map((role) => (
                <th
                  key={role.key}
                  className="w-24 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-faint"
                >
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission.key} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  <span className="block text-[13px]">{permission.label}</span>
                  <span className="block font-mono text-[10px] text-faint">{permission.key}</span>
                </td>
                {roles.map((role) => {
                  const allowed = role.permissions.includes(permission.key);
                  return (
                    <td key={role.key} className="px-2 py-2 text-center">
                      <span
                        className={allowed ? 'text-status-ready' : 'text-line'}
                        aria-label={allowed ? 'allowed' : 'not allowed'}
                      >
                        {allowed ? '●' : '·'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffEditor({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: (Partial<User> & { pin?: string }) | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { save, saving, error, fieldErrors, clearError } = useSave();
  const { stores } = useCatalog();
  const myRole = useSession((s) => s.session?.user.role);
  const session = useSession((s) => s.session);
  const allowedRoles = manageableRoles(myRole);
  const isGlobal = myRole === 'OWNER' || myRole === 'ADMIN';

  const isNew = !user?.id;
  const [draft, setDraft] = useState<Partial<User> & { pin?: string }>({});
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!open) return;
    const base = {
      role: allowedRoles[allowedRoles.length - 1] ?? 'BARISTA',
      active: true,
      storeIds: [],
      ...user,
    };
    setDraft(base);
    setInitial(JSON.stringify(base));
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const dirty = JSON.stringify(draft) !== initial && initial !== '';
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    if (!session) return;
    const payload: StaffUpdateInput = {
      name: draft.name,
      phone: draft.phone,
      email: draft.email || null,
      employeeCode: draft.employeeCode || null,
      role: draft.role as RoleKey,
      storeIds: draft.storeIds ?? [],
      active: draft.active ?? true,
    };
    if (draft.pin) payload.pin = draft.pin;

    const result = await save(
      () => (isNew
        ? StaffService.create(payload as StaffCreateInput, session)
        : StaffService.update(draft.id!, payload, session)),
      { successMessage: isNew ? `${draft.name} can now sign in` : `${draft.name} updated` },
    );
    if (result) { onSaved(); onClose(); }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'Add someone' : draft.name ?? ''}
      subtitle={isNew ? 'They sign in on the POS with the PIN you set' : undefined}
      width="md"
    >
      <div className="space-y-5">
        <FormGrid>
          <Field label="Name" required htmlFor="sname" error={fieldErrors.name}>
            <Input id="sname" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Phone" required htmlFor="sphone" error={fieldErrors.phone}>
            <Input id="sphone" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+91…" />
          </Field>
          <Field label="Email" htmlFor="semail" error={fieldErrors.email}>
            <Input id="semail" type="email" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Employee ID" htmlFor="scode">
            <Input id="scode" value={draft.employeeCode ?? ''} onChange={(e) => set('employeeCode', e.target.value)} />
          </Field>
          <Field label="Role" required htmlFor="srole" error={fieldErrors.role}
            hint="You can only assign roles below your own.">
            <Select id="srole" value={draft.role ?? ''} onChange={(e) => set('role', e.target.value as RoleKey)}>
              {allowedRoles.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </Select>
          </Field>
          <Field
            label={isNew ? 'PIN' : 'New PIN'}
            required={isNew}
            htmlFor="spin"
            error={fieldErrors.pin}
            hint={isNew
              ? '4 to 6 digits. Must be unique across the whole business.'
              : 'Leave empty to keep the current one.'}
          >
            <Input
              id="spin"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={draft.pin ?? ''}
              onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
              className="font-mono"
              placeholder={isNew ? '••••' : 'unchanged'}
            />
          </Field>
        </FormGrid>

        {/*
          A PIN is the whole credential — there is no second factor at a till —
          so two people sharing one would make the audit log fiction. StaffService
          rejects a duplicate on save; saying so here just sets expectations early.
        */}
        <Notice tone="info">
          A PIN identifies one person on its own. Two people cannot share one, and saving will refuse
          a PIN that is already in use.
        </Notice>

        <div>
          <p className="eyebrow mb-1.5">Posted to</p>
          <p className="mb-2 text-xs text-faint">
            {isGlobal
              ? 'Leave all unticked to give access to every store — for owners and admins.'
              : 'You can only post staff to stores you run.'}
          </p>
          <div className="space-y-1.5">
            {stores.map((store) => (
              <Checkbox
                key={store.id}
                checked={(draft.storeIds ?? []).includes(store.id)}
                onChange={(checked) => set('storeIds', checked
                  ? [...(draft.storeIds ?? []), store.id]
                  : (draft.storeIds ?? []).filter((id) => id !== store.id))}
                label={`${store.code} · ${store.name.replace('NOOKAA ', '')}`}
              />
            ))}
          </div>
        </div>

        <Checkbox
          checked={draft.active ?? true}
          onChange={(v) => set('active', v)}
          label="Active"
          hint="Deactivating ends any session they have open right away."
        />

        <FormActions
          dirty={dirty || isNew}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          saveLabel={isNew ? 'Add to the team' : 'Save changes'}
        />
      </div>
    </Sheet>
  );
}
