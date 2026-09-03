'use client';

import { useState } from 'react';
import { ValidationError } from '@/lib/errors';
import { toast } from '@/stores/toast-store';

/**
 * Run a write, and deal with what comes back.
 *
 * The important part is the failure path. A validation error carries per-field
 * messages, and those belong next to the fields rather than in a toast that
 * disappears before the person has found which of nine inputs is wrong — so
 * they are returned as `fieldErrors` and only the summary is announced.
 */
export function useSave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save<T>(
    action: () => Promise<T>,
    options: { successMessage?: string; onSuccess?: (result: T) => void } = {},
  ): Promise<T | null> {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await action();
      if (options.successMessage) toast.success(options.successMessage);
      options.onSuccess?.(result);
      return result;
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (e instanceof ValidationError) {
        const fields = e.fieldErrors;
        setFieldErrors(fields);
        // Field-level problems are already visible beside the inputs; a toast
        // repeating them is noise on top of the thing it is describing.
        if (Object.keys(fields).length === 0) toast.error('Could not save', message);
      } else {
        toast.error('Could not save', message);
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { save, saving, error, fieldErrors, clearError: () => { setError(null); setFieldErrors({}); } };
}
