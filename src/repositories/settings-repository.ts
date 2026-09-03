import { localStore } from '@/lib/local-db';
import { AuditRepository } from './audit-repository';
import { refreshCatalog } from './catalog-cache';
import type { Organization, Session } from '@/types';

/**
 * Settings.
 *
 * Replaces src/app/api/settings/route.ts. Stored as one record (`settings`
 * collection, key `'current'`) shaped `{ [scope]: { [key]: value } }` — same
 * shape the old server kept in its key/value table, just collapsed into one
 * document since there is no longer a query engine to group rows for us.
 */

const SETTINGS_KEY = 'current';

export interface SettingsData {
  organization: Organization;
  settings: Record<string, Record<string, unknown>>;
  ownerOnly: Record<string, string[]>;
}

const EMPTY_ORG: Organization = {
  id: '', name: 'NOOKAA', legalName: 'NOOKAA', gstin: '',
  invoicePrefix: 'NK', currency: 'INR', timezone: 'Asia/Kolkata',
};

/**
 * Settings that only an owner may touch.
 *
 * The test is whether getting it wrong is an operational annoyance or a
 * problem with a regulator: the GSTIN and the currency print on every
 * invoice, and the invoice prefix is part of a numbering series that has to
 * stay gapless across a financial year. This is descriptive metadata for the
 * settings screen (src/lib/rbac.ts's `settings.manage.system` already gates
 * the write client-side) — it enforces nothing on its own.
 */
const OWNER_ONLY: Record<string, string[]> = {
  general: ['gstin', 'currency', 'businessName'],
  orders: ['numberPrefix'],
};

export const SettingsRepository = {
  async get(): Promise<SettingsData> {
    const [settings, orgs] = await Promise.all([
      localStore().get<Record<string, Record<string, unknown>>>('settings', SETTINGS_KEY),
      localStore().list<Organization>('org'),
    ]);
    return {
      organization: orgs[0] ?? EMPTY_ORG,
      settings: settings ?? {},
      ownerOnly: OWNER_ONLY,
    };
  },

  /**
   * Merges `values` into the stored scope. When `scope === 'general'`, a few
   * fields are also mirrored onto the `org` record — the old server
   * denormalised these there so invoices and the customer-facing bill page
   * could read `organization.gstin` etc. directly rather than reaching into
   * settings on every render. That mirroring is preserved here.
   */
  async save(
    scope: string,
    values: Record<string, unknown>,
    session: Session | null,
  ): Promise<Record<string, Record<string, unknown>>> {
    const all = (await localStore().get<Record<string, Record<string, unknown>>>('settings', SETTINGS_KEY)) ?? {};
    const before = all[scope] ?? {};
    const after = { ...before, ...values };
    const merged = { ...all, [scope]: after };

    await localStore().put('settings', SETTINGS_KEY, merged);

    if (scope === 'general') {
      const orgs = await localStore().list<Organization>('org');
      const organization = orgs[0];
      if (organization) {
        const updatedOrg: Organization = {
          ...organization,
          name: (values.businessName as string | undefined) ?? organization.name,
          gstin: (values.gstin as string | undefined) ?? organization.gstin,
          currency: (values.currency as string | undefined) ?? organization.currency,
          timezone: (values.timezone as string | undefined) ?? organization.timezone,
          logoUrl: (values.logoUrl as string | undefined) ?? organization.logoUrl,
        };
        await localStore().put('org', organization.id, updatedOrg);
      }
    }

    if (session?.storeId) await refreshCatalog(session.storeId);

    await AuditRepository.record({
      session,
      entity: 'settings',
      entityId: scope,
      entityLabel: scope,
      action: 'updated',
      before,
      after,
      summary: `changed ${Object.keys(values).join(', ')}`,
    });

    return merged;
  },
};
