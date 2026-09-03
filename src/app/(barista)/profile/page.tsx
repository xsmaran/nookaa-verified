'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { formatDateTime, formatMoney, formatTime } from '@/lib/format';
import { ROLES } from '@/lib/rbac';
import { OrderRepository } from '@/repositories';
import { AttendanceService, hoursWorked, PrintService } from '@/services';
import { useCurrentStore } from '@/hooks/use-store-context';
import { useSession } from '@/stores/session-store';
import type { AttendanceRecord } from '@/types';

/** Who is signed in, on what, and how their shift is going so far. */
export default function ProfilePage() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const signOut = useSession((s) => s.signOut);
  const store = useCurrentStore();
  const [stats, setStats] = useState({ orders: 0, salesMinor: 0 });
  const [shift, setShift] = useState<AttendanceRecord | undefined>(undefined);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const orders = await OrderRepository.query({ storeId: session.storeId, from: session.startedAt });
      const mine = orders.filter((o) => o.createdByUserId === session.user.id);
      setStats({
        orders: mine.length,
        salesMinor: mine.filter((o) => o.paymentStatus === 'PAID').reduce((sum, o) => sum + o.totalMinor, 0),
      });
    })();
  }, [session]);

  const loadShift = useCallback(async () => {
    if (!session) return;
    setShift(await AttendanceService.today(session.user.id));
  }, [session]);

  useEffect(() => { void loadShift(); }, [loadShift]);

  if (!session) return null;

  return (
    <div className="scroll-y h-full p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <section className="panel p-5">
          <p className="eyebrow">Signed in</p>
          <h1 className="mt-1 font-display text-2xl leading-none">{session.user.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {ROLES[session.user.role].label} · {store?.name}
          </p>
          <p className="tnum mt-2 font-mono text-[11px] text-faint">
            Device {session.deviceId} · since {formatDateTime(session.startedAt)}
          </p>
        </section>

        <section className="panel grid grid-cols-2 divide-x divide-line">
          <div className="p-4">
            <p className="eyebrow">Orders this session</p>
            <p className="tnum mt-1 font-mono text-2xl font-bold">{stats.orders}</p>
          </div>
          <div className="p-4">
            <p className="eyebrow">Taken</p>
            <p className="tnum mt-1 font-mono text-2xl font-bold">{formatMoney(stats.salesMinor)}</p>
          </div>
        </section>

        {session.user.role !== 'OWNER' ? (
          <section className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Today's attendance</p>
              {shift?.status === 'LATE' ? <Badge tone="warning">Late</Badge> : shift?.clockInAt ? <Badge tone="success">Present</Badge> : null}
            </div>
            {!shift?.clockInAt ? (
              <p className="mt-1 text-sm text-muted">Not recorded yet — signing in is what marks you present.</p>
            ) : shift.clockOutAt ? (
              <p className="mt-1 text-sm text-muted">
                {formatTime(shift.clockInAt)}–{formatTime(shift.clockOutAt)}
                {typeof hoursWorked(shift) === 'number' ? ` (${hoursWorked(shift)!.toFixed(1)} h)` : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Signed in at {formatTime(shift.clockInAt)} — still on shift.</p>
            )}
          </section>
        ) : null}

        <section className="panel p-4">
          <p className="eyebrow mb-2">Printer</p>
          <p className="text-sm">{PrintService.adapter().label}</p>
          <p className="mt-1 text-[11px] text-faint">
            Thermal and label printers need the NOOKAA print agent installed on this device. Until then labels go through the
            system print dialog.
          </p>
        </section>

        <Button
          block
          size="lg"
          variant="danger"
          onClick={() => {
            signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
