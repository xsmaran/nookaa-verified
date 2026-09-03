'use client';

import { useCallback } from 'react';
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLES } from '@/lib/rbac';
import { StaffRepository } from '@/repositories/staff-repository';
import { useLocalResource } from './use-resource';
import type { StaffRecord } from '@/repositories/admin-seed';
import type { Permission, RoleKey, User } from '@/types';

export interface RoleDefinition { key: RoleKey; label: string; permissions: Permission[] }
export interface PermissionLabel { key: Permission; label: string }

/**
 * The staff roster.
 *
 * Kept out of the catalog cache on purpose: the catalog is what a till needs
 * offline, and the roster is not. It also carries who-may-do-what, which is
 * not something to leave lying in IndexedDB on a shared terminal.
 *
 * The permission matrix comes straight from src/lib/rbac.ts — the same table
 * the UI already reads everywhere else to decide what to show — so what this
 * renders cannot drift from what the rest of the app enforces.
 */

function toUser(staff: StaffRecord): User {
  return {
    id: staff.id,
    organizationId: staff.organizationId,
    name: staff.name,
    phone: staff.phone,
    email: staff.email,
    employeeCode: staff.employeeCode,
    role: staff.role,
    storeIds: staff.storeIds,
    active: staff.active,
    createdAt: staff.createdAt,
  };
}

const ROLE_DEFINITIONS: RoleDefinition[] = (Object.keys(ROLES) as RoleKey[]).map((key) => ({
  key,
  label: ROLES[key].label,
  permissions: ROLES[key].permissions,
}));

const PERMISSION_DEFINITIONS: PermissionLabel[] = ALL_PERMISSIONS.map((key) => ({
  key,
  label: PERMISSION_LABELS[key],
}));

export function useStaff(options: { includeInactive?: boolean; enabled?: boolean } = {}) {
  const { includeInactive = false, enabled = true } = options;

  const loader = useCallback(async () => {
    const all = await StaffRepository.list();
    return (includeInactive ? all : all.filter((s) => s.active)).map(toUser);
  }, [includeInactive]);

  const { data, loading, error, reload } = useLocalResource<User[]>(enabled ? loader : null, [enabled]);

  const staff = data ?? [];
  return {
    staff,
    roles: ROLE_DEFINITIONS,
    permissions: PERMISSION_DEFINITIONS,
    byId: new Map(staff.map((u) => [u.id, u])),
    loading,
    error,
    reload,
  };
}
