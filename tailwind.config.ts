import type { Config } from 'tailwindcss';

/**
 * NOOKAA POS design tokens.
 *
 * Palette is derived from the NOOKAA menu book (roast brown, gold, paper) but
 * re-tuned for an operational surface: high contrast, no gradients, no glass.
 * Status colours are functional first — they must read across a counter.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F5F1',      // app canvas — warm paper
        surface: '#FFFFFF',    // cards, rails
        sunk: '#EFEBE4',       // inset wells, disabled fills
        line: '#E2DCD1',       // hairline borders
        ink: '#1A1512',        // primary text — warm near-black
        muted: '#6E6558',      // secondary text
        faint: '#9B9186',      // tertiary text
        gold: {
          DEFAULT: '#A8762C',  // brand accent — primary actions only
          soft: '#F3E7D0',
          deep: '#7C5518',
        },
        status: {
          new: '#B4690E',      // amber — needs acceptance
          prep: '#1F5FA8',     // blue — in progress
          ready: '#1E7A44',    // green — waiting for pickup
          done: '#6E6558',     // grey — closed
          alert: '#B3261E',    // red — money / failure / late
        },
        newSoft: '#FBEFD9',
        prepSoft: '#E4EDF8',
        readySoft: '#E1F1E6',
        alertSoft: '#FBE7E5',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
      },
      boxShadow: {
        rail: '0 0 0 1px #E2DCD1',
        lift: '0 1px 2px rgba(26,21,18,.06), 0 4px 12px rgba(26,21,18,.06)',
        sheet: '0 12px 40px rgba(26,21,18,.18)',
      },
      spacing: { 'touch': '56px' },
      keyframes: {
        'pop-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'pop-in': 'pop-in .12s ease-out' },
    },
  },
  plugins: [],
};
export default config;
