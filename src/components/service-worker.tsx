'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only.
 *
 * In development an aggressive worker makes changes appear not to apply, which
 * costs more time than offline support saves. An update is downloaded quietly
 * and applied on the next full load — a till must never reload itself in the
 * middle of an order.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is a bonus, never a requirement to run */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
