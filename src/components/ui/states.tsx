import type { ReactNode } from 'react';

/**
 * The states that are not "it worked".
 *
 * Loading, empty and error each get their own component so that no screen has
 * to decide what to do about them ad hoc — and so an error never renders as an
 * empty table, which is the failure that makes an operator think their data is
 * gone.
 */

/** Grey blocks in the shape of the content, not a spinner in the middle. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-sunk ${className}`} aria-hidden />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface" aria-busy="true" aria-label="Loading">
      <div className="flex gap-4 border-b border-line px-4 py-2.5">
        {Array.from({ length: columns }, (_, i) => <Skeleton key={i} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-line px-4 py-3.5 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Something went wrong.
 *
 * Always shows the actual message rather than "an error occurred". The person
 * reading it is usually the only one who can act on it, and "could not reach
 * the server" and "you do not have permission" call for very different next
 * moves.
 */
export function ErrorState({
  title = 'That did not load',
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-md border border-status-alert/25 bg-alertSoft px-5 py-6 text-center">
      <p className="text-sm font-semibold text-status-alert">{title}</p>
      {message ? <p className="mx-auto mt-1 max-w-md text-xs text-ink/70">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-9 rounded border border-status-alert/30 bg-surface px-3 text-[13px]
            font-semibold text-status-alert hover:bg-alertSoft"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** A banner for something true but not fatal — offline, stale, degraded. */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: 'border-status-prep/20 bg-prepSoft text-status-prep',
    warning: 'border-status-new/25 bg-newSoft text-status-new',
    danger: 'border-status-alert/25 bg-alertSoft text-status-alert',
  };
  return (
    <div className={`flex items-start justify-between gap-4 rounded-md border px-4 py-3 ${tones[tone]}`}>
      <div className="min-w-0 text-xs">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5 text-ink/70' : 'text-ink/80'}>{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Inline spinner for a button or a cell. Deliberately small and quiet. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current
        border-t-transparent opacity-60 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
