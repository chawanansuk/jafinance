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
      // Radius scale — direction A opens every corner up a step so surfaces
      // read soft rather than administrative.
      borderRadius: {
        sm: '0.5rem',    // 8
        DEFAULT: '0.75rem',
        md: '0.75rem',   // 12
        lg: '1.125rem',  // 18
        xl: '1.5rem',    // 24
        '2xl': '1.5rem', // 24
        '3xl': '1.5rem', // 24
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
        h1: ['1.625rem', { lineHeight: '2.25rem', letterSpacing: '-0.01em' }],  // 26/36
        display: ['2.25rem', { lineHeight: '2.875rem', letterSpacing: '-0.02em' }], // 36/46
      },
      boxShadow: {
        // Larger, softer, warm-tinted — these carry the card separation now
        // that the light-mode border is gone.
        sm: '0 1px 3px rgb(var(--shadow-rgb) / 0.05)',
        soft: '0 2px 4px rgb(var(--shadow-rgb) / 0.03), 0 10px 28px -10px rgb(var(--shadow-rgb) / 0.10)',
        lg: '0 4px 10px rgb(var(--shadow-rgb) / 0.05), 0 22px 50px -22px rgb(var(--shadow-rgb) / 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
