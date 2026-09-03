'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { ConnectionBar } from '@/components/pos/connection-bar';
import { isAdminRole } from '@/lib/rbac';
import { useAvailableStores } from '@/hooks/use-store-context';
import { ensureSeeded } from '@/repositories';
import { useSession } from '@/stores/session-store';
import type { Permission } from '@/types';

interface NavItem {
  href: string;
  label: string;
  /** Hidden when the signed-in role does not hold this. */
  permission?: Permission;
}

/**
 * The admin navigation.
 *
 * Grouped the way the business is run — operations, menu, inventory, people —
 * rather than the way the database is laid out. A manager and an owner see the
 * same shell, but a section with nothing in it that they may open does not
 * render at all: an empty group is worse than a missing one, because it looks
 * like something is broken.
 */
const SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  { label: '', items: [{ href: '/admin', label: 'Dashboard' }] },
  {
    label: 'Operations',
    items: [
      { href: '/admin/live', label: 'Live orders' },
      { href: '/admin/orders', label: 'Orders' },
      { href: '/admin/refunds', label: 'Refunds', permission: 'finance.view' },
      { href: '/admin/customers', label: 'Customers' },
    ],
  },
  {
    label: 'Menu',
    items: [
      { href: '/admin/products', label: 'Products', permission: 'catalog.manage' },
      { href: '/admin/categories', label: 'Categories', permission: 'catalog.manage' },
      { href: '/admin/modifiers', label: 'Options & add-ons', permission: 'catalog.manage' },
      { href: '/admin/recipes', label: 'Recipes', permission: 'catalog.manage' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/admin/inventory', label: 'Stock', permission: 'inventory.view' },
      { href: '/admin/ingredients', label: 'Ingredients', permission: 'inventory.view' },
      { href: '/admin/transactions', label: 'Movements', permission: 'inventory.view' },
      { href: '/admin/transfers', label: 'Transfers', permission: 'inventory.transfer' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/admin/payments', label: 'Payments', permission: 'finance.view' },
      { href: '/admin/invoices', label: 'Invoices', permission: 'finance.view' },
      { href: '/admin/discounts', label: 'Discounts', permission: 'discount.manage' },
    ],
  },
  {
    label: 'Loyalty',
    items: [
      { href: '/admin/nooks', label: 'Nooks', permission: 'loyalty.manage' },
    ],
  },
  {
    label: 'Stores & people',
    items: [
      { href: '/admin/stores', label: 'Stores', permission: 'store.manage' },
      { href: '/admin/devices', label: 'Devices', permission: 'device.manage' },
      { href: '/admin/staff', label: 'Staff & roles', permission: 'staff.view' },
      { href: '/admin/attendance', label: 'Attendance', permission: 'staff.view' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/admin/analytics', label: 'Sales & products', permission: 'analytics.view' },
      { href: '/admin/audit', label: 'Audit log', permission: 'audit.view' },
    ],
  },
  { label: '', items: [{ href: '/admin/settings', label: 'Settings', permission: 'settings.manage' }] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession((s) => s.session);
  const permissions = useSession((s) => s.permissions);
  const verifying = useSession((s) => s.verifying);
  const hydrated = useSession((s) => s.hydrated);
  const switchStore = useSession((s) => s.switchStore);
  const signOut = useSession((s) => s.signOut);
  const stores = useAvailableStores();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { void ensureSeeded(); }, []);

  useEffect(() => {
    // The persisted session arrives a tick after mount. Deciding before it has
    // is what sent a refresh on /admin/products to the login screen and then
    // back to the dashboard, losing the page somebody had bookmarked.
    if (!hydrated) return;
    if (session === null && !verifying) router.replace('/login');
    else if (session && !isAdminRole(session.user.role)) router.replace('/pos');
  }, [hydrated, session, verifying, router]);

  const sections = useMemo(
    () => SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.permission || permissions.includes(item.permission)),
      }))
      .filter((section) => section.items.length > 0),
    [permissions],
  );

  if (!hydrated || !session || !isAdminRole(session.user.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Checking your access…
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-paper">
      {navOpen ? (
        <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-line bg-surface transition-transform
          lg:static lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-5">
          <span className="font-display text-lg leading-none tracking-tight">NOOKAA</span>
          <span className="eyebrow">Admin</span>
        </div>

        <nav className="scroll-y h-[calc(100vh-3.5rem)] px-3 py-4">
          {sections.map((section, i) => (
            <div key={section.label || `group-${i}`} className="mb-4 last:mb-0">
              {section.label ? <p className="eyebrow px-2 pb-1.5">{section.label}</p> : null}
              {section.items.map((item) => {
                const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded px-2 py-1.5 text-[13px] transition-colors ${
                      active ? 'bg-sunk font-semibold text-ink' : 'text-muted hover:bg-sunk hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="rounded p-1 text-sm lg:hidden"
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={navOpen}
            >
              ☰
            </button>

            {/* Almost every number below this bar is store-scoped, so the
                switcher is global rather than repeated on each page. */}
            <select
              value={session.storeId}
              onChange={(e) => void switchStore(e.target.value)}
              className="h-9 max-w-[230px] rounded border border-line bg-surface px-2 text-[13px] font-semibold"
              aria-label="Store"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name.replace('NOOKAA ', '')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <ConnectionBar />
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold leading-tight text-ink">{session.user.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-faint">{session.user.role.toLowerCase()}</p>
            </div>
            <Link href="/pos" className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink">
              Open POS
            </Link>
            <Button size="sm" variant="ghost" onClick={() => void signOut().then(() => router.replace('/login'))}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="scroll-y min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
