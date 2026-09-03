'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ROLES } from '@/lib/rbac';
import { localStore } from '@/lib/local-db';
import { ensureAdminSeeded } from '@/repositories/admin-seed';
import type { StaffRecord } from '@/repositories/admin-seed';
import { clearCatalog, hydrateCatalog, refreshCatalog } from '@/repositories/catalog-cache';
import { AttendanceService } from '@/services/attendance-service';
import type { Organization, Permission, Session, Store, User } from '@/types';

/**
 * The session.
 *
 * Frontend-only build: there is no server to check a PIN against, so this
 * looks the PIN up in the local `staff` collection (seeded from src/mock/org
 * — see src/repositories/admin-seed.ts) and grants exactly the permissions
 * `src/lib/rbac.ts` says that role has, the same table the UI already reads
 * to decide what to show. The session itself is just what's in this
 * zustand-persisted store; there is no cookie because there is no server to
 * hold one.
 */

interface SessionState {
  session: Session | null;
  organization: Organization | null;
  permissions: Permission[];
  stores: Store[];
  hydrated: boolean;
  verifying: boolean;

  signIn: (pin: string, storeId: string, deviceId?: string | null) => Promise<User>;
  signOut: () => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

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

const isGlobalRole = (role: User['role']) => role === 'OWNER' || role === 'ADMIN';

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      session: null,
      organization: null,
      permissions: [],
      stores: [],
      hydrated: false,
      verifying: false,

      async signIn(pin, storeId, deviceId) {
        await ensureAdminSeeded();

        const staff = await localStore().list<StaffRecord>('staff');
        const matched = staff.find((s) => s.active && s.pin === pin);
        if (!matched) throw new Error('That PIN was not recognised.');

        if (!isGlobalRole(matched.role) && matched.storeIds.length > 0 && !matched.storeIds.includes(storeId)) {
          throw new Error('You are not posted to that store.');
        }

        const stores = await localStore().list<Store>('stores');
        const store = stores.find((s) => s.id === storeId);
        if (!store) throw new Error('That store no longer exists.');
        if (!store.active) throw new Error('That store is closed.');

        const organizations = await localStore().list<Organization>('org');
        const organization = organizations[0] ?? null;
        const user = toUser(matched);

        const session: Session = {
          user,
          storeId,
          deviceId: deviceId ?? '',
          startedAt: new Date().toISOString(),
        };
        set({
          session,
          organization,
          permissions: ROLES[user.role].permissions,
          stores: stores.filter((s) => s.active),
        });

        // Pull the menu before the first screen paints, so the POS is never
        // briefly empty on the way in.
        await refreshCatalog(storeId).catch(() => undefined);
        // Signing in with a PIN is the attendance event — see attendance-service.ts.
        // Never lets a demo-data hiccup block someone getting onto the till.
        await AttendanceService.recordSignIn(session).catch(() => undefined);
        return user;
      },

      async signOut() {
        const current = get().session;
        if (current) await AttendanceService.recordSignOut(current).catch(() => undefined);
        set({ session: null, organization: null, permissions: [], stores: [] });
        await clearCatalog();
      },

      async switchStore(storeId) {
        const current = get().session;
        if (!current) return;
        set({ session: { ...current, storeId } });
        await refreshCatalog(storeId).catch(() => undefined);
      },

      /**
       * Re-check the session against current local data. A deactivated
       * account or a role changed from the Staff screen (in another tab, say)
       * takes effect here rather than only on the next full sign-in.
       */
      async refresh() {
        set({ verifying: true });
        try {
          const current = get().session;
          if (!current) return;

          await ensureAdminSeeded();
          const staffList = await localStore().list<StaffRecord>('staff');
          const matched = staffList.find((s) => s.id === current.user.id);
          if (!matched || !matched.active) {
            set({ session: null, organization: null, permissions: [], stores: [] });
            return;
          }

          const stores = await localStore().list<Store>('stores');
          const organizations = await localStore().list<Organization>('org');
          const user = toUser(matched);

          set({
            session: { ...current, user },
            organization: organizations[0] ?? get().organization,
            permissions: ROLES[user.role].permissions,
            stores: stores.filter((s) => s.active),
          });
        } finally {
          set({ verifying: false });
        }
      },

      can(permission) {
        return get().permissions.includes(permission);
      },
    }),
    {
      name: 'nookaa-session',
      partialize: (state) => ({
        session: state.session,
        organization: state.organization,
        permissions: state.permissions,
        stores: state.stores,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.hydrated = true;
        // Restore the cached menu, then re-validate the session.
        void hydrateCatalog().then(() => {
          if (state.session?.storeId) void refreshCatalog(state.session.storeId).catch(() => undefined);
        });
        void state.refresh();
      },
    },
  ),
);

/** Permission check as a hook, for conditional rendering. */
export function usePermission(permission: Permission): boolean {
  return useSession((s) => s.permissions.includes(permission));
}
