'use client';

import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/ui';

/**
 * The top of every admin page.
 *
 * One h1, an optional sentence of context, and the actions on the right —
 * always in that order and always the same distance from the top, so moving
 * between sections does not move the furniture.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
  /** Small facts that belong with the title — a code, a count, a status. */
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className={`flex flex-wrap items-end justify-between gap-3 ${breadcrumbs ? 'mt-2' : ''}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl leading-none tracking-tight">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'alert' | 'good';
}) {
  const toneClass = tone === 'alert' ? 'text-status-alert' : tone === 'good' ? 'text-status-ready' : 'text-ink';
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p className={`tnum mt-1.5 font-mono text-2xl font-bold leading-none ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

export function Panel({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-base leading-none">{title}</h2>
        {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A no-nonsense horizontal bar row — used wherever a chart would be overkill. */
export function BarRow({ label, value, max, caption }: { label: string; value: number; max: number; caption: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{label}</span>
        <span className="tnum shrink-0 font-mono text-xs text-muted">{caption}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-sunk">
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
