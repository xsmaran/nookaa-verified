'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui';
import { ConnectionBar } from '@/components/pos/connection-bar';
import { isAdminRole } from '@/lib/rbac';
import { useCurrentStore } from '@/hooks/use-store-context';
import { useOrders } from '@/hooks/use-orders';
import { useSession } from '@/stores/session-store';
import { ensureSeeded } from '@/repositories';

const NAV = [
  { href: '/pos', label: 'POS', hint: 'Take an order' },
  { href: '/orders', label: 'Orders', hint: 'The board' },
  { href: '/scan', label: 'Scan', hint: 'Cup QR' },
  { href: '/ready', label: 'Done', hint: 'Pickup screen' },
  { href: '/pickup', label: 'Pickup', hint: 'Ready to pick' },
  { href: '/history', label: 'History', hint: 'Today' },
  { href: '/stock', label: 'Stock', hint: 'What is low' },
];

/**
 * Barista shell.
 *
 * Seven destinations, no nesting, no admin surface. The nav sits on the left on a
 * terminal and along the bottom on a tablet — always within thumb reach, never
 * between the barista and the product grid.
 */
export default function BaristaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession((s) => s.session);
  const hydrated = useSession((s) => s.hydrated);
  const signOut = useSession((s) => s.signOut);
  const store = useCurrentStore();
  const { orders } = useOrders({ storeId: session?.storeId, statuses: ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'] });

  useEffect(() => {
    void ensureSeeded();
  }, []);

  useEffect(() => {
    // Wait for the persisted session before deciding somebody is signed out —
    // otherwise a refresh mid-shift bounces the till to the login screen.
    if (hydrated && session === null) router.replace('/login');
  }, [hydrated, session, router]);

  if (!hydrated || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">Checking your session…</main>
    );
  }

  const completedCutoff = Date.now() - 30 * 60_000;
  const counts = {
    '/orders': orders.filter((o) => o.status === 'NEW').length,
    '/ready': orders.filter((o) => o.status === 'COMPLETED' && o.completedAt && new Date(o.completedAt).getTime() >= completedCutoff).length,
    '/pickup': orders.filter((o) => o.status === 'READY').length,
  } as Record<string, number>;

  return (
    <div className="flex h-screen flex-col bg-paper lg:flex-row">
      <nav className="order-2 flex shrink-0 border-t border-line bg-surface lg:order-1 lg:w-[104px] lg:flex-col lg:border-r lg:border-t-0">
        <Link href="/pos" className="hidden items-center justify-center border-b border-line py-5 lg:flex">
          <span className="font-display text-lg leading-none tracking-tight">NK</span>
        </Link>

        <div className="flex flex-1 lg:flex-col">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const badge = counts[item.href] ?? 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-semibold uppercase tracking-wider transition-colors lg:flex-none lg:py-5 ${
                  active ? 'bg-sunk text-ink' : 'text-faint hover:text-ink'
                }`}
              >
                <span className={`absolute left-0 top-0 h-full w-[3px] ${active ? 'bg-gold' : 'bg-transparent'} hidden lg:block`} />
                {item.label}
                {badge > 0 ? (
                  <span className="tnum absolute right-2 top-2 min-w-[18px] rounded-full bg-status-new px-1 text-center font-mono text-[10px] leading-[18px] text-white lg:right-4">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <Link
          href="/profile"
          className="hidden flex-col items-center justify-center gap-1 border-t border-line py-4 text-[11px] font-semibold uppercase tracking-wider text-faint hover:text-ink lg:flex"
        >
          {session.user.name.split(' ')[0]}
        </Link>
      </nav>

      <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
        <header className="no-print flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{store?.name ?? 'No store'}</p>
            <p className="tnum truncate font-mono text-[11px] text-faint">
              {store?.code} · {session.deviceId.split('-').pop()?.toUpperCase()} · {session.user.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ConnectionBar />
            {isAdminRole(session.user.role) ? (
              <Link href="/admin" className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink">
                Admin panel
              </Link>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => { signOut(); router.replace('/login'); }}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
