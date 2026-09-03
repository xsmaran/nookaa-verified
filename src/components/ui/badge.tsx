import type { ReactNode } from 'react';

/**
 * Badges.
 *
 * Colour carries meaning here, so the palette is deliberately small: neutral
 * for a fact, and one of four status colours for something that needs a
 * decision. A badge that is coloured because colour looks nice teaches people
 * to stop reading the coloured ones.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'gold';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sunk text-muted border-line',
  info: 'bg-prepSoft text-status-prep border-status-prep/20',
  success: 'bg-readySoft text-status-ready border-status-ready/20',
  warning: 'bg-newSoft text-status-new border-status-new/25',
  danger: 'bg-alertSoft text-status-alert border-status-alert/25',
  gold: 'bg-gold-soft text-gold-deep border-gold/25',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5
        text-[10px] font-bold uppercase tracking-[0.08em] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A dot plus a word. Reads faster than a filled badge in a dense table, where
 * a column of coloured blocks becomes noise.
 */
export function StatusDot({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const dot: Record<BadgeTone, string> = {
    neutral: 'bg-faint',
    info: 'bg-status-prep',
    success: 'bg-status-ready',
    warning: 'bg-status-new',
    danger: 'bg-status-alert',
    gold: 'bg-gold',
  };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

/** A count next to a label, e.g. on a tab. */
export function Count({ value }: { value: number }) {
  return (
    <span className="tnum ml-1.5 rounded bg-sunk px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {value}
    </span>
  );
}
