import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './emails/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Surfaces (from Seasonz mobile design system) ──────────
        bg:           '#0a0e1a',
        surface:      '#15192a',
        'surface-low': '#0f1320',
        'surface-high': '#1f2438',

        // ── Text ──────────────────────────────────────────────────
        muted:  '#9aa3b8',
        faint:  '#5d6580',

        // ── Seasons ───────────────────────────────────────────────
        past:    '#f87559',
        present: '#22c55e',
        future:  '#60a5fa',

        // ── Accent ────────────────────────────────────────────────
        accent:     '#22c55e',
        'accent-ink': '#0a0e1a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.08)',
        strong:  'rgba(255,255,255,0.16)',
      },
      backgroundColor: {
        'season-past-tint':    'rgba(248,117,89,0.16)',
        'season-present-tint': 'rgba(34,197,94,0.16)',
        'season-future-tint':  'rgba(96,165,250,0.16)',
      },
    },
  },
  plugins: [],
}

export default config
