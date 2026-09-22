import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      // V2 grid: reading pages stay at 1024, the transactions table gets 1200
      maxWidth: {
        content: '64rem', // 1024
        wide: '75rem',    // 1200
      },
      spacing: {
        15: '3.75rem', // 60 — V2 header height
      },
      fontFamily: {
        sans: ['var(--font-noto-thai)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // semantic tokens wired to CSS variables (see globals.css) for dark mode
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-2': 'rgb(var(--brand-2) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        error: 'rgb(var(--error) / <alpha-value>)',
      },
      // V2 radius scale — 5 values replacing the 7 that were in use
      borderRadius: {
        sm: '0.375rem',  // 6
        DEFAULT: '0.625rem',
        md: '0.625rem',  // 10
        lg: '0.875rem',  // 14
        xl: '0.875rem',  // 14 — kept as an alias so existing rounded-xl lands on lg
        '2xl': '1.25rem', // 20
        '3xl': '1.25rem', // 20 — collapsed into xl
      },
      fontSize: {
        // V2 type ramp. Line heights are generous for Thai diacritics.
        caption: ['0.75rem', { lineHeight: '1.0625rem' }],  // 12/17
        label: ['0.8125rem', { lineHeight: '1.125rem' }],   // 13/18
        'body-sm': ['0.8125rem', { lineHeight: '1.3125rem' }], // 13/21
        body: ['0.9375rem', { lineHeight: '1.5625rem' }],   // 15/25
        'body-lg': ['1rem', { lineHeight: '1.6875rem' }],   // 16/27
        h3: ['1rem', { lineHeight: '1.5rem' }],             // 16/24
        h2: ['1.1875rem', { lineHeight: '1.75rem' }],       // 19/28
        h1: ['1.5rem', { lineHeight: '2.125rem' }],         // 24/34
        display: ['2rem', { lineHeight: '2.625rem' }],      // 32/42
      },
      boxShadow: {
        // V2: 3 levels replacing 6 hand-written stacks
        sm: '0 1px 2px rgb(15 23 42 / 0.05)',
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.08)',
        lg: '0 2px 6px rgb(15 23 42 / 0.06), 0 18px 40px -20px rgb(15 23 42 / 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
