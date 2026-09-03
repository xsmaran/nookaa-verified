'use client';

import { useEffect, useState } from 'react';

/**
 * One ticking clock for the whole screen.
 *
 * Every elapsed timer on a queue reads from this, so twenty order cards cost
 * one interval instead of twenty. Ticks pause when the tab is hidden.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      setNow(Date.now());
      document.hidden ? stop() : start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return now;
}
