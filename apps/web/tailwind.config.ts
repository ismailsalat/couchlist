import type { Config } from 'tailwindcss';

/**
 * Couchlist palette.
 *
 * Deliberately narrow: a near-black background, one blue accent, two greys.
 * Posters and banners are meant to supply the colour on screen.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#080B0F',
        card: '#0E1319',
        border: '#1D2630',
        primary: '#5B7CFA',
        'primary-hover': '#7894FF',
        'text-primary': '#F4F4F5',
        'text-secondary': '#939AA5',

        // Status accents. Each colour means exactly one thing across the app:
        // cyan is a list state, purple is done, red is a live session, green is
        // presence. See lib/status.ts.
        'status-watching': '#5EC8F5',
        'status-completed': '#A98BFF',
        'status-planned': '#7C8AA0',
        'status-live': '#F2555A',
        'status-online': '#4FCB8B',
        'status-rating': '#F2C14E',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['Trebuchet MS', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: '1.1rem',
        '2xl': '1.35rem',
      },
    },
  },
  plugins: [],
};

export default config;
