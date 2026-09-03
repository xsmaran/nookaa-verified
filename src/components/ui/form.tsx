'use client';

import { useId, type ReactNode } from 'react';

/**
 * Form layout.
 *
 * Frappe's forms are dense, two-column and label-above-field, and they are
 * good for the same reason: an operator filling in the same form for the
 * hundredth time is scanning, not reading. Label above field keeps a
 * consistent left edge so the eye can run straight down the column.
 */

export function FormGrid({ columns = 2, children }: { columns?: 1 | 2 | 3; children: ReactNode }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' };
  return <div className={`grid gap-x-4 gap-y-3.5 ${cols[columns]}`}>{children}</div>;
}

/** Makes a field span the full width of a FormGrid — descriptions, notes. */
export function FormSpan({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2 lg:col-span-3">{children}</div>;
}

export function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-line pt-4 first:border-0 first:pt-0">
      <legend className="sr-only">{legend}</legend>
      <div className="mb-3">
        <p className="eyebrow">{legend}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * One labelled field.
 *
 * The error replaces the hint rather than appearing beneath it, so a form with
 * six problems does not become twice as tall as the form that caused them.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow mb-1.5 flex items-center gap-1">
        {label}
        {required ? <span className="text-status-alert" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-status-alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Money.
 *
 * The value is paise everywhere in this system; this is the one place it is
 * shown and typed in rupees. Keeping the conversion in a single component is
 * how a float never reaches the ledger.
 */
export function MoneyInput({
  valueMinor,
  onChange,
  id,
  disabled,
  placeholder = '0.00',
}: {
  valueMinor: number | null;
  onChange: (minor: number | null) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-gold">
      <span className="pl-3 pr-1 text-sm text-faint" aria-hidden>₹</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        disabled={disabled}
        placeholder={placeholder}
        value={valueMinor === null ? '' : (valueMinor / 100).toString()}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { onChange(null); return; }
          const rupees = Number.parseFloat(raw);
          // Round at the boundary so 12.345 becomes 1235 paise, not a float
          // that turns into a rounding argument three reports later.
          onChange(Number.isFinite(rupees) ? Math.round(rupees * 100) : null);
        }}
        className="tnum h-11 w-full rounded-r-md bg-transparent pr-3 font-mono text-sm text-ink
          placeholder:text-faint focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}

/** A quantity with its unit shown, so nobody has to remember which one it is. */
export function QuantityInput({
  value,
  unit,
  onChange,
  id,
  min,
  step = 'any',
  disabled,
}: {
  value: number | null;
  unit: string;
  onChange: (value: number | null) => void;
  id?: string;
  min?: number;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-gold">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        disabled={disabled}
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { onChange(null); return; }
          const parsed = Number.parseFloat(raw);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        className="tnum h-11 w-full rounded-l-md bg-transparent px-3 font-mono text-sm text-ink
          focus:outline-none disabled:opacity-60"
      />
      <span className="border-l border-line px-2.5 text-xs text-muted">{unit}</span>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-ink accent-ink focus:outline-none
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      />
      <label htmlFor={id} className="min-w-0 select-none text-sm text-ink">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-faint">{hint}</span> : null}
      </label>
    </div>
  );
}

/**
 * A switch, for something that takes effect the moment it moves. Anything that
 * needs a Save button should be a Checkbox instead — the affordance is the
 * promise.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? 'border-ink bg-ink' : 'border-line bg-sunk'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-surface transition-transform
          ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
      />
    </button>
  );
}

export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: Array<{ value: T; label: string; hint?: string; disabled?: boolean }>;
  value: T | null;
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <div className="space-y-1.5" role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors
            ${value === option.value ? 'border-ink bg-sunk' : 'border-line hover:bg-sunk'}
            ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-ink focus:outline-none"
          />
          <span className="min-w-0 text-sm">
            {option.label}
            {option.hint ? <span className="mt-0.5 block text-xs text-faint">{option.hint}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Save bar.
 *
 * Pinned to the bottom of a form and only present when something has actually
 * changed, so it doubles as the answer to "have I saved this?" without anyone
 * having to look for a toast that has already gone.
 */
export function FormActions({
  dirty,
  saving,
  onSave,
  onCancel,
  saveLabel = 'Save changes',
  error,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  error?: string | null;
}) {
  if (!dirty && !error) return null;
  return (
    <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-between gap-4 border-t border-line
      bg-surface/95 px-4 py-3 backdrop-blur">
      <p className={`text-xs ${error ? 'text-status-alert' : 'text-muted'}`}>
        {error ?? 'Unsaved changes'}
      </p>
      <div className="flex gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-9 rounded px-3 text-[13px] font-semibold text-muted hover:bg-sunk hover:text-ink"
          >
            Discard
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="h-9 rounded bg-ink px-4 text-[13px] font-semibold text-paper hover:bg-black
            disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
