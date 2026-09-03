import { localStore } from '@/lib/local-db';
import { ensureSeeded } from './bootstrap';
import type { StaffRecord } from './admin-seed';

/**
 * The staff roster — plain CRUD.
 *
 * Every rule that can refuse a write (role management, PIN uniqueness, the
 * last-owner guard, self-role-change) lives in src/services/staff-service.ts,
 * not here. This file only knows how to read and write the `staff`
 * collection.
 */
export const StaffRepository = {
  async list(): Promise<StaffRecord[]> {
    await ensureSeeded();
    return localStore().list<StaffRecord>('staff');
  },

  async byId(id: string): Promise<StaffRecord | undefined> {
    await ensureSeeded();
    return localStore().get<StaffRecord>('staff', id);
  },

  async put(record: StaffRecord): Promise<void> {
    await localStore().put('staff', record.id, record);
  },
};
