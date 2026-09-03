'use client';

import { useEffect, useRef } from 'react';

/**
 * Captures a hardware QR scanner anywhere on the page, without a focused text
 * field to type into. A keyboard-wedge scanner fires keystrokes far faster
 * than a person can type and ends the code with Enter — that speed is what
 * tells a scan apart from someone typing nearby, so ordinary typing (and any
 * focused input/textarea/select, which handles its own Enter) is left alone.
 */
export function useScannerInput(onScan: (code: string) => void, enabled = true) {
  const bufferRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const RESET_MS = 75;
    const MIN_LENGTH = 4;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const now = Date.now();
      if (now - lastKeyAtRef.current > RESET_MS) bufferRef.current = '';
      lastKeyAtRef.current = now;

      if (e.key === 'Enter') {
        const code = bufferRef.current;
        bufferRef.current = '';
        if (code.length >= MIN_LENGTH) onScanRef.current(code);
        return;
      }
      if (e.key.length === 1) bufferRef.current += e.key;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
