import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import type { AuditLog, Session } from '@/types';

/**
 * The audit log.
 *
 * Every write everywhere else in Admin calls `record()` after it succeeds —
 * the same shape `writeAudit()` used to produce server-side, now written to
 * the device instead. `entity: 'session'` (sign-ins) is excluded from `list()`
 * by default, matching the old API's behaviour: sign-ins are logged for
 * completeness but not surfaced as "changes" on the Audit screen.
 */

const REDACT = new Set(['pin', 'pinHash', 'token', 'registrationToken', 'password']);

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.has(k) ? '[redacted]' : v;
  }
  return out;
}

export interface RecordAuditInput {
  session: Session | null;
  storeId?: string | null;
  entity: string;
  entityId: string;
  entityLabel?: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export const AuditRepository = {
  async record(input: RecordAuditInput): Promise<void> {
    const entry: AuditLog = {
      id: uuid(),
      at: new Date().toISOString(),
      userId: input.session?.user.id ?? 'system',
      userName: input.session?.user.name ?? 'System',
      userRole: input.session?.user.role,
      storeId: input.storeId ?? input.session?.storeId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      summary: input.summary,
      before: input.before !== undefined ? redact(input.before) : undefined,
      after: input.after !== undefined ? redact(input.after) : undefined,
      reason: input.reason,
    };
    await localStore().put('audit', entry.id, entry);
  },

  async list(filters: { entity?: string; userId?: string; from?: string; limit?: number } = {}): Promise<AuditLog[]> {
    const all = await localStore().list<AuditLog>('audit');
    let rows = filters.entity ? all.filter((r) => r.entity === filters.entity) : all.filter((r) => r.entity !== 'session');
    if (filters.userId) rows = rows.filter((r) => r.userId === filters.userId);
    if (filters.from) rows = rows.filter((r) => r.at >= filters.from!);
    rows = rows.sort((a, b) => (a.at < b.at ? 1 : -1));
    return filters.limit ? rows.slice(0, filters.limit) : rows;
  },
};
