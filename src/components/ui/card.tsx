import type { ReactNode } from 'react';

/**
 * Cards.
 *
 * A hairline border and a white fill on the beige canvas, and no shadow. The
 * shadow is what turns a dense admin screen into a field of floating tiles;
 * separation is the border's job, and it does it at a quarter of the visual
 * cost.
 */
export function Card({
  title,
  description,
  actions,
  footer,
  padded = true,
  children,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-line bg-surface ${className}`}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {typeof title === 'string' ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : title}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      <div className={padded ? 'p-4' : ''}>{children}</div>

      {footer ? <footer className="border-t border-line px-4 py-3 text-xs text-muted">{footer}</footer> : null}
    </section>
  );
}

/**
 * A single figure with its label.
 *
 * The number is the largest thing in the tile and uses tabular figures, so a
 * row of these stays aligned and does not re-flow as the values tick over
 * during service.
 */
export function StatTile({
  label,
  value,
  hint,
  trend,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  tone?: 'default' | 'alert';
}) {
  const trendColour =
    trend?.direction === 'up' ? 'text-status-ready'
    : trend?.direction === 'down' ? 'text-status-alert'
    : 'text-muted';

  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className={`tnum mt-1 font-mono text-2xl leading-tight ${tone === 'alert' ? 'text-status-alert' : 'text-ink'}`}>
        {value}
      </p>
      {trend || hint ? (
        <p className="mt-1 flex items-center gap-2 text-[11px]">
          {trend ? (
            <span className={trendColour}>
              {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '—'} {trend.label}
            </span>
          ) : null}
          {hint ? <span className="text-faint">{hint}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/** Evenly sized stat tiles that wrap sensibly on a tablet. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
