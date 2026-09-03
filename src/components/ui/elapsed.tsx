'use client';

import { formatElapsed } from '@/lib/format';
import { slaLevel, type SlaLevel } from '@/lib/order-state';
import { useNow } from '@/hooks/use-now';

const TONE: Record<SlaLevel, string> = {
  ON_TIME: 'text-muted',
  WATCH: 'text-status-new',
  LATE: 'text-status-alert',
};

/**
 * The brew clock — the one element this interface is built around.
 *
 * It is the only thing on an order card that changes on its own, so a barista
 * scanning the board reads time before anything else. Weight and colour shift
 * at two thirds of the store SLA and again when it is blown; the hairline under
 * it fills as the clock runs, so lateness is visible from across the bar
 * without reading a single digit.
 */
export function Elapsed({
  since,
  slaMinutes,
  size = 'md',
  showBar = true,
}: {
  since: string | number;
  slaMinutes: number;
  size?: 'sm' | 'md' | 'lg';
  showBar?: boolean;
}) {
  const now = useNow();
  const start = typeof since === 'string' ? new Date(since).getTime() : since;
  const elapsed = Math.max(0, now - start);
  const level = slaLevel(elapsed, slaMinutes);
  const progress = Math.min(1, elapsed / (slaMinutes * 60_000));

  const textSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-base';
  const weight = level === 'ON_TIME' ? 'font-medium' : 'font-bold';

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={`tnum font-mono ${textSize} ${weight} ${TONE[level]}`} aria-label={`Elapsed ${formatElapsed(elapsed)}`}>
        {formatElapsed(elapsed)}
      </span>
      {showBar ? (
        <span className="block h-[2px] w-12 bg-line" aria-hidden>
          <span
            className={`block h-full transition-[width] duration-1000 ease-linear ${
              level === 'LATE' ? 'bg-status-alert' : level === 'WATCH' ? 'bg-status-new' : 'bg-faint'
            }`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}
