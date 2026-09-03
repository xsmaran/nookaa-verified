import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { DomainError } from '@/lib/errors';
import { AuditRepository } from '@/repositories/audit-repository';
import { catalog } from '@/repositories/catalog-cache';
import { bus, EVENTS } from './event-bus';
import type { AttendanceRecord, AttendanceStatus, Session } from '@/types';

/**
 * Attendance — one row per person per day, driven by the till itself.
 *
 * There is no separate "clock in" action: signing in with a PIN *is* clocking
 * in, and signing out *is* clocking out — src/stores/session-store.ts calls
 * `recordSignIn`/`recordSignOut` on every real sign-in and sign-out, exactly
 * the events already happening dozens of times a shift on a shared till. The
 * only judgement call made along the way is PRESENT vs. LATE, decided once
 * from the store's own opening time at the day's first sign-in.
 *
 * Both are idempotent on purpose, since a PIN sign-in is routine and must
 * never surface an attendance error to someone just trying to open the POS:
 * a second sign-in the same day re-opens the day's row (clearing clockOutAt)
 * rather than starting a new one, and a sign-out with no open row is a silent
 * no-op. The span shown is always first-in → most-recent-out for the day.
 */

const GRACE_MINUTES = 10;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusFor(storeId: string, at: Date): AttendanceStatus {
  const store = catalog().storeById.get(storeId);
  if (!store?.openingTime) return 'PRESENT';
  const [h, m] = store.openingTime.split(':').map(Number);
  const cutoff = new Date(at);
  cutoff.setHours(h, m + GRACE_MINUTES, 0, 0);
  return at > cutoff ? 'LATE' : 'PRESENT';
}

async function findToday(staffId: string, date = today()): Promise<AttendanceRecord | undefined> {
  const all = await localStore().list<AttendanceRecord>('attendance');
  return all.find((r) => r.staffId === staffId && r.date === date);
}

export const AttendanceService = {
  /** Today's record for this person, if any — drives the Profile screen's buttons. */
  async today(staffId: string): Promise<AttendanceRecord | undefined> {
    return findToday(staffId);
  },

  /**
   * Called on every sign-in. Idempotent — a second sign-in the same day
   * resumes today's row rather than erroring. Owners are exempt: an owner
   * isn't rostered on a shift, and tracking them the same way as staff who
   * clock in and out for pay would misrepresent both.
   */
  async recordSignIn(session: Session): Promise<AttendanceRecord | undefined> {
    if (session.user.role === 'OWNER') return undefined;
    const existing = await findToday(session.user.id);
    const at = new Date();

    if (!existing) {
      const record: AttendanceRecord = {
        id: uuid(),
        staffId: session.user.id,
        staffName: session.user.name,
        storeId: session.storeId,
        date: today(),
        clockInAt: at.toISOString(),
        clockOutAt: null,
        status: statusFor(session.storeId, at),
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      };
      await localStore().put('attendance', record.id, record);
      await AuditRepository.record({
        session, entity: 'attendance', entityId: record.id, entityLabel: record.staffName,
        action: 'clocked-in', after: record,
        summary: `${record.staffName} signed in${record.status === 'LATE' ? ' (late)' : ''}`,
      });
      bus.emit(EVENTS.ATTENDANCE_CHANGED, { staffId: session.user.id });
      return record;
    }

    // Already has a row for today — only a re-open (clearing a prior sign-out)
    // is a real change; a still-open row from earlier the same shift is a no-op.
    if (existing.clockOutAt) {
      const after: AttendanceRecord = { ...existing, clockOutAt: null, updatedAt: at.toISOString() };
      await localStore().put('attendance', after.id, after);
      bus.emit(EVENTS.ATTENDANCE_CHANGED, { staffId: session.user.id });
      return after;
    }
    return existing;
  },

  /** Called on every sign-out. Idempotent — a sign-out with no open row today is a silent no-op. Owners are exempt, same as sign-in. */
  async recordSignOut(session: Session): Promise<AttendanceRecord | undefined> {
    if (session.user.role === 'OWNER') return undefined;
    const existing = await findToday(session.user.id);
    if (!existing || !existing.clockInAt) return undefined;

    const after: AttendanceRecord = { ...existing, clockOutAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await localStore().put('attendance', after.id, after);

    await AuditRepository.record({
      session, entity: 'attendance', entityId: after.id, entityLabel: after.staffName,
      action: 'clocked-out', before: existing, after, summary: `${after.staffName} signed out`,
    });

    bus.emit(EVENTS.ATTENDANCE_CHANGED, { staffId: session.user.id });
    return after;
  },

  /** Mark someone on leave for a day — the one entry an admin can create by hand, since it has no clock event of its own. */
  async markLeave(staffId: string, staffName: string, storeId: string, date: string, note: string | undefined, session: Session): Promise<AttendanceRecord> {
    const existing = await findToday(staffId, date);
    if (existing) throw new DomainError('There is already a record for that day.');

    const at = new Date().toISOString();
    const record: AttendanceRecord = {
      id: uuid(), staffId, staffName, storeId, date,
      clockInAt: null, clockOutAt: null, status: 'ON_LEAVE', note,
      createdAt: at, updatedAt: at,
    };
    await localStore().put('attendance', record.id, record);

    await AuditRepository.record({
      session, entity: 'attendance', entityId: record.id, entityLabel: staffName,
      action: 'leave.marked', after: record, summary: `${staffName} marked on leave for ${date}`, reason: note,
    });

    bus.emit(EVENTS.ATTENDANCE_CHANGED, { staffId });
    return record;
  },

  async list(filters: { storeId?: string; from?: string; to?: string; staffId?: string } = {}): Promise<AttendanceRecord[]> {
    const all = await localStore().list<AttendanceRecord>('attendance');
    return all
      .filter((r) => !filters.storeId || r.storeId === filters.storeId)
      .filter((r) => !filters.from || r.date >= filters.from!)
      .filter((r) => !filters.to || r.date <= filters.to!)
      .filter((r) => !filters.staffId || r.staffId === filters.staffId)
      .sort((a, b) => (a.date === b.date ? (a.staffName < b.staffName ? -1 : 1) : a.date < b.date ? 1 : -1));
  },
};

/** Hours worked, or null while still clocked in / for a leave day. */
export function hoursWorked(record: AttendanceRecord): number | null {
  if (!record.clockInAt || !record.clockOutAt) return null;
  return (new Date(record.clockOutAt).getTime() - new Date(record.clockInAt).getTime()) / 3_600_000;
}

export interface AttendanceSummary {
  present: number;
  late: number;
  onLeave: number;
  /** Working days in the window with no row at all — nobody logged in. */
  absent: number;
  /** present + late, over every working day in the window (excludes leave). */
  rate: number;
  avgHours: number | null;
}

/**
 * Roll a person's records up into the numbers the overview shows. `windowDays`
 * is how many calendar days back the rate is computed over (today inclusive)
 * — independent of how far back `records` happens to reach, so a person who
 * joined last week doesn't read as mostly-absent for the year before that.
 */
export function summarize(records: AttendanceRecord[], windowDays: number): AttendanceSummary {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const present = records.filter((r) => r.status === 'PRESENT').length;
  const late = records.filter((r) => r.status === 'LATE').length;
  const onLeave = records.filter((r) => r.status === 'ON_LEAVE').length;

  let absent = 0;
  const end = new Date();
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDate.has(key) && key !== today()) absent++;
  }

  const workingDays = present + late + absent;
  const hours = records.map(hoursWorked).filter((h): h is number => h !== null);

  return {
    present,
    late,
    onLeave,
    absent,
    rate: workingDays > 0 ? ((present + late) / workingDays) * 100 : 0,
    avgHours: hours.length > 0 ? hours.reduce((s, h) => s + h, 0) / hours.length : null,
  };
}
