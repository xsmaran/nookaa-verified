import { localStore } from '@/lib/local-db';
import type { StoreDevice } from '@/types';

/**
 * Devices.
 *
 * Replaces `GET /api/devices`. Read-only, same as before — a device
 * registers itself at till sign-in, not from Admin, so there is no write
 * side here to port.
 */
export const DeviceRepository = {
  async all(): Promise<StoreDevice[]> {
    const devices = await localStore().list<StoreDevice>('devices');
    return devices.sort((a, b) => a.storeId.localeCompare(b.storeId) || a.code.localeCompare(b.code));
  },
};
