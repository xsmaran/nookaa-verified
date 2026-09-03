import { canManageRole, isGlobalRole, ROLES } from '@/lib/rbac';
import { DomainError, ValidationError } from '@/lib/errors';
import { AuditRepository } from '@/repositories/audit-repository';
import { StaffRepository } from '@/repositories/staff-repository';
import { uuid } from '@/lib/ids';
import type { StaffRecord } from '@/repositories/admin-seed';
import type { RoleKey, Session } from '@/types';

/**
 * Staff & roles — the rules.
 *
 * The frontend-only replacement for src/app/api/staff/** and src/app/api/staff/[id]/**.
 * Same checks the server used to make (role management, store scoping, PIN
 * uniqueness, the last-owner guard, self-role-change), just running on the
 * device instead — see the deleted routes' history for the checks this
 * mirrors. StaffRepository is plain CRUD; every rule that can refuse a write
 * lives here.
 */

export interface StaffCreateInput {
  name: string;
  phone: string;
  email?: string | null;
  employeeCode?: string | null;
  role: RoleKey;
  storeIds: string[];
  pin?: string;
  active?: boolean;
}

export type StaffUpdateInput = Partial<StaffCreateInput>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{4,6}$/;

function validateShared(input: Partial<StaffCreateInput>, fieldErrors: Record<string, string>): void {
  if (input.name !== undefined && !input.name.trim()) fieldErrors.name = 'Name is required.';
  if (input.phone !== undefined) {
    const len = input.phone.trim().length;
    if (len < 6 || len > 20) fieldErrors.phone = 'Phone must be 6 to 20 characters.';
  }
  if (input.email && !EMAIL_RE.test(input.email)) {
    fieldErrors.email = 'That does not look like an email address.';
  }
  if (input.pin && !PIN_RE.test(input.pin)) {
    fieldErrors.pin = 'A PIN is 4 to 6 digits.';
  }
}

/** Two people sharing a PIN would make the audit log fiction — refuse it. */
async function assertPinAvailable(pin: string, excludeId: string | null): Promise<void> {
  const staff = await StaffRepository.list();
  const clash = staff.some((s) => s.active && s.pin === pin && s.id !== excludeId);
  if (clash) throw new ValidationError('That PIN is already in use.', { pin: 'That PIN is already in use.' });
}

/** A scoped actor (store manager) may only post staff to stores they run, and must name at least one. */
function assertScoped(actor: Session, storeIds: string[]): void {
  if (isGlobalRole(actor.user.role)) return;
  if (storeIds.length === 0) {
    throw new ValidationError('Pick a store — only owners and admins can post someone to every store.', {
      storeIds: 'Pick at least one store.',
    });
  }
  const scope = actor.user.storeIds;
  if (storeIds.some((id) => !scope.includes(id))) {
    throw new ValidationError('You can only post staff to your own stores.', {
      storeIds: 'You can only post staff to your own stores.',
    });
  }
}

/**
 * The org can never be left without an active owner. Guards both
 * deactivating the last owner and demoting them away from OWNER — the old
 * server checked both ("demoting || disabling"), so this does too.
 */
async function assertNotLastOwner(target: StaffRecord): Promise<void> {
  if (target.role !== 'OWNER') return;
  const staff = await StaffRepository.list();
  const activeOwners = staff.filter((s) => s.active && s.role === 'OWNER').length;
  if (activeOwners <= 1) throw new DomainError('This is the last owner. Promote someone else first.');
}

export const StaffService = {
  async list(includeInactive: boolean): Promise<StaffRecord[]> {
    const all = await StaffRepository.list();
    return includeInactive ? all : all.filter((s) => s.active);
  },

  async create(input: StaffCreateInput, actor: Session): Promise<StaffRecord> {
    const fieldErrors: Record<string, string> = {};
    validateShared(input, fieldErrors);
    if (!input.pin) fieldErrors.pin = 'A new member of staff needs a PIN to sign in with.';
    if (Object.keys(fieldErrors).length > 0) throw new ValidationError('Check the highlighted fields.', fieldErrors);

    if (!canManageRole(actor.user.role, input.role)) {
      throw new DomainError('You cannot assign that role.');
    }

    const storeIds = input.storeIds ?? [];
    assertScoped(actor, storeIds);
    await assertPinAvailable(input.pin!, null);

    const record: StaffRecord = {
      id: uuid(),
      organizationId: actor.user.organizationId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email || null,
      employeeCode: input.employeeCode || null,
      role: input.role,
      storeIds,
      active: input.active ?? true,
      pin: input.pin!,
      createdAt: new Date().toISOString(),
    };
    await StaffRepository.put(record);

    await AuditRepository.record({
      session: actor,
      entity: 'staff',
      entityId: record.id,
      entityLabel: record.name,
      action: 'created',
      after: record,
      summary: `added ${record.name} as ${ROLES[record.role].label}`,
    });

    return record;
  },

  async update(id: string, patch: StaffUpdateInput, actor: Session): Promise<StaffRecord> {
    const before = await StaffRepository.byId(id);
    if (!before) throw new DomainError('That member of staff no longer exists.');

    if (!canManageRole(actor.user.role, before.role)) {
      throw new DomainError('You cannot manage that account.');
    }

    const roleChanging = patch.role !== undefined && patch.role !== before.role;
    if (roleChanging) {
      // Even an OWNER cannot change their own role — that is how quiet
      // self-escalation (or self-demotion, undoing the last-owner guard)
      // would happen.
      if (id === actor.user.id) throw new DomainError('You cannot change your own role.');
      if (!canManageRole(actor.user.role, patch.role!)) throw new DomainError('You cannot assign that role.');
    }

    const disabling = patch.active === false && before.active;
    if ((roleChanging && before.role === 'OWNER') || disabling) {
      await assertNotLastOwner(before);
    }

    const fieldErrors: Record<string, string> = {};
    validateShared(patch, fieldErrors);
    if (Object.keys(fieldErrors).length > 0) throw new ValidationError('Check the highlighted fields.', fieldErrors);

    const storeIds = patch.storeIds ?? before.storeIds;
    assertScoped(actor, storeIds);

    let pin = before.pin;
    if (patch.pin) {
      await assertPinAvailable(patch.pin, id);
      pin = patch.pin;
    }

    const after: StaffRecord = {
      ...before,
      name: patch.name !== undefined ? patch.name.trim() : before.name,
      phone: patch.phone !== undefined ? patch.phone.trim() : before.phone,
      email: patch.email !== undefined ? (patch.email || null) : before.email,
      employeeCode: patch.employeeCode !== undefined ? (patch.employeeCode || null) : before.employeeCode,
      role: patch.role ?? before.role,
      storeIds,
      active: patch.active ?? before.active,
      pin,
    };
    await StaffRepository.put(after);

    const action = patch.pin ? 'pin.reset' : before.role !== after.role ? 'role.changed' : 'updated';
    await AuditRepository.record({
      session: actor,
      entity: 'staff',
      entityId: after.id,
      entityLabel: after.name,
      action,
      before,
      after,
      summary: patch.pin
        ? `reset the PIN for ${after.name}`
        : before.role !== after.role
          ? `${after.name}: ${ROLES[before.role].label} → ${ROLES[after.role].label}`
          : `updated ${after.name}`,
    });

    return after;
  },

  async deactivate(id: string, actor: Session): Promise<StaffRecord> {
    const before = await StaffRepository.byId(id);
    if (!before) throw new DomainError('That member of staff no longer exists.');

    if (!canManageRole(actor.user.role, before.role)) {
      throw new DomainError('You cannot manage that account.');
    }
    if (id === actor.user.id) throw new DomainError('You cannot deactivate your own account.');
    await assertNotLastOwner(before);

    const after: StaffRecord = { ...before, active: false };
    await StaffRepository.put(after);

    await AuditRepository.record({
      session: actor,
      entity: 'staff',
      entityId: after.id,
      entityLabel: after.name,
      action: 'deactivated',
      before,
      after,
      summary: `deactivated ${after.name} and ended their session`,
    });

    return after;
  },

  async reactivate(id: string, actor: Session): Promise<StaffRecord> {
    const before = await StaffRepository.byId(id);
    if (!before) throw new DomainError('That member of staff no longer exists.');

    if (!canManageRole(actor.user.role, before.role)) {
      throw new DomainError('You cannot manage that account.');
    }

    const after: StaffRecord = { ...before, active: true };
    await StaffRepository.put(after);

    await AuditRepository.record({
      session: actor,
      entity: 'staff',
      entityId: after.id,
      entityLabel: after.name,
      action: 'updated',
      before,
      after,
      summary: `reactivated ${after.name}`,
    });

    return after;
  },
};
