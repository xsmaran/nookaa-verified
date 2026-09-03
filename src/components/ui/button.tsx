'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shown on the right in a keycap. Hotkeys are how a rush actually gets run. */
  hotkey?: string;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-black disabled:bg-faint',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunk disabled:text-faint',
  ghost: 'bg-transparent text-muted hover:bg-sunk hover:text-ink',
  danger: 'bg-surface text-status-alert border border-status-alert/40 hover:bg-alertSoft',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] rounded',
  md: 'h-11 px-4 text-sm rounded-md',
  lg: 'h-touch px-6 text-base rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', hotkey, block, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors
        disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}
        ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
      {hotkey ? (
        <kbd className="ml-1 rounded border border-current/25 px-1.5 py-0.5 text-[10px] font-mono opacity-70">
          {hotkey}
        </kbd>
      ) : null}
    </button>
  );
});
