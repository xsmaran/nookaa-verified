'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session-store';
import { isAdminRole } from '@/lib/rbac';

export default function Entry() {
  const router = useRouter();
  const session = useSession((s) => s.session);

  useEffect(() => {
    // Everyone lands where their shift starts: baristas at the POS, admins at
    // the overview. Nobody chooses a "workspace" first.
    const target = !session ? '/login' : isAdminRole(session.user.role) ? '/admin' : '/pos';
    router.replace(target);
  }, [session, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="font-display text-2xl tracking-tight">NOOKAA</p>
    </main>
  );
}
